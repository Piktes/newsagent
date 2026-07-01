"""
Bülten servis mantığı: haber toplama, PDF üretimi, e-posta/WhatsApp gönderimi ve teslimat kaydı.
E-posta, şifre sıfırlamayla AYNI SMTP ayarını kullanır (DB'deki aktif SmtpSettings → haberajani@meb.gov.tr).
"""
import json
from datetime import datetime, date, time as dtime, timezone

from sqlalchemy import func

from models import (
    NewsItem, Tag, User, UserRole, Bulletin, BulletinDelivery, SmtpSettings,
)
from utils.pdf import build_news_pdf
from utils.email import send_email
from utils import whatsapp as wa


# ── yardımcılar ──────────────────────────────────────────────────────────────

def _loads(v, default):
    try:
        return json.loads(v) if v else default
    except Exception:
        return default


def bulletin_tag_ids(bulletin) -> list:
    return _loads(bulletin.tag_ids, [])


def bulletin_excluded(bulletin) -> list:
    return _loads(bulletin.excluded_news_ids, [])


def _day_bounds(d: date):
    start = datetime.combine(d, dtime.min)
    end = datetime.combine(d, dtime.max)
    return start, end


def bulletin_items(db, tag_ids, day: date, excluded_ids=None):
    """Bültene girecek haberler: verilen etiketlerin o güne ait, gizlenmemiş, çıkarılmamış haberleri."""
    if not tag_ids:
        return []
    excluded_ids = set(excluded_ids or [])
    start, end = _day_bounds(day)
    ts = func.coalesce(NewsItem.published_at, NewsItem.fetched_at)
    q = (db.query(NewsItem)
           .filter(NewsItem.tag_id.in_(tag_ids),
                   NewsItem.is_hidden == False,      # noqa: E712
                   ts >= start, ts <= end)
           .order_by(ts.desc()))
    return [it for it in q.all() if it.id not in excluded_ids]


def _tag_name(db, tag_ids) -> str:
    tags = db.query(Tag).filter(Tag.id.in_(tag_ids)).all() if tag_ids else []
    return ", ".join(t.name for t in tags) if tags else "Bülten"


def generate_pdf(db, bulletin) -> bytes:
    tag_ids = bulletin_tag_ids(bulletin)
    items = bulletin_items(db, tag_ids, bulletin.date, bulletin_excluded(bulletin))
    tag_name = bulletin.title or _tag_name(db, tag_ids)
    return build_news_pdf(items, tag_name, date_from=bulletin.date, date_to=bulletin.date, db=db)


def pdf_filename(db, bulletin) -> str:
    tag_name = bulletin.title or _tag_name(db, bulletin_tag_ids(bulletin))
    safe = "".join(c for c in tag_name if c.isascii() and (c.isalnum() or c in " _-"))[:30].strip()
    return f"bulten_{safe}_{bulletin.date.strftime('%Y%m%d')}.pdf".replace(" ", "_") or "bulten.pdf"


def _email_html(tag_name, day) -> str:
    return f"""<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f6fb;margin:0;padding:24px;">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:8px;padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <h2 style="color:#1e40af;margin-top:0;">Haber Ajanı — Günlük Bülten</h2>
    <p><strong>{tag_name}</strong> — {day.strftime('%d.%m.%Y')}</p>
    <p>Günün haber bülteni PDF olarak ektedir. Bülten aboneliğinizden panelinizdeki
       <strong>Bülten</strong> sekmesinden ayrılabilirsiniz.</p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
    <p style="font-size:0.8em;color:#9ca3af;text-align:center;">T.C. Millî Eğitim Bakanlığı — Haber Ajanı Sistemi</p>
  </div>
</body></html>"""


def recipients(db):
    """Bülten alıcıları: aktif ve abone tüm kullanıcılar."""
    return (db.query(User)
              .filter(User.is_active == True,               # noqa: E712
                      User.bulletin_subscribed == True)     # noqa: E712
              .all())


def _deliver_to_user(db, bulletin, user, pdf_bytes, filename, tag_name, smtp_cfg):
    """Tek kullanıcıya e-posta (+varsa WhatsApp) gönderir, her kanal için delivery kaydı ekler."""
    html = _email_html(tag_name, bulletin.date)
    # E-posta
    try:
        send_email(user.email, f"Günlük Bülten — {tag_name} ({bulletin.date.strftime('%d.%m.%Y')})",
                   html, attachments=[(filename, pdf_bytes, "pdf")], smtp_cfg=smtp_cfg)
        db.add(BulletinDelivery(bulletin_id=bulletin.id, user_id=user.id, email=user.email,
                                channel="email", status="sent"))
    except Exception as e:
        db.add(BulletinDelivery(bulletin_id=bulletin.id, user_id=user.id, email=user.email,
                                channel="email", status="failed", error=str(e)[:900]))
    # WhatsApp (telefon varsa)
    if user.phone_number:
        try:
            wa.send_whatsapp_document(user.phone_number, pdf_bytes, filename,
                                      caption=f"Günlük Bülten — {tag_name} {bulletin.date.strftime('%d.%m.%Y')}")
            db.add(BulletinDelivery(bulletin_id=bulletin.id, user_id=user.id, email=user.phone_number,
                                    channel="whatsapp", status="sent"))
        except Exception as e:
            db.add(BulletinDelivery(bulletin_id=bulletin.id, user_id=user.id, email=user.phone_number,
                                    channel="whatsapp", status="failed", error=str(e)[:900]))


def send_bulletin(db, bulletin) -> dict:
    """Onaylanmış bülteni tüm abonelere gönderir. PDF bir kez üretilir."""
    tag_ids = bulletin_tag_ids(bulletin)
    tag_name = bulletin.title or _tag_name(db, tag_ids)
    pdf_bytes = generate_pdf(db, bulletin)
    filename = pdf_filename(db, bulletin)
    smtp_cfg = db.query(SmtpSettings).filter(SmtpSettings.is_active == True).first()  # noqa: E712

    users = recipients(db)
    for u in users:
        _deliver_to_user(db, bulletin, u, pdf_bytes, filename, tag_name, smtp_cfg)

    bulletin.status = "sent"
    bulletin.sent_at = datetime.now(timezone.utc)
    db.commit()

    sent = db.query(BulletinDelivery).filter(BulletinDelivery.bulletin_id == bulletin.id,
                                             BulletinDelivery.status == "sent").count()
    failed = db.query(BulletinDelivery).filter(BulletinDelivery.bulletin_id == bulletin.id,
                                               BulletinDelivery.status == "failed").count()
    return {"recipients": len(users), "sent": sent, "failed": failed}


def resend_to_user(db, bulletin, user_id) -> dict:
    """Tek kullanıcıya yeniden gönderir (yeni delivery kaydı)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise ValueError("Kullanıcı bulunamadı")
    tag_ids = bulletin_tag_ids(bulletin)
    tag_name = bulletin.title or _tag_name(db, tag_ids)
    pdf_bytes = generate_pdf(db, bulletin)
    filename = pdf_filename(db, bulletin)
    smtp_cfg = db.query(SmtpSettings).filter(SmtpSettings.is_active == True).first()  # noqa: E712
    _deliver_to_user(db, bulletin, user, pdf_bytes, filename, tag_name, smtp_cfg)
    db.commit()
    last = (db.query(BulletinDelivery)
              .filter(BulletinDelivery.bulletin_id == bulletin.id, BulletinDelivery.user_id == user_id)
              .order_by(BulletinDelivery.id.desc()).first())
    return {"status": last.status if last else "unknown", "error": last.error if last else None}
