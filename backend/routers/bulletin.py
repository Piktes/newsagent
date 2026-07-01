"""
Haberajani - Bülten Router
Admin/süperadmin: taslak listeleme, önizleme, haber çıkarma, onay, gönderim, teslimat logları, tekrar gönderme.
Kullanıcı: abonelik (opt-out), telefon, arşiv, PDF indirme.
"""
import json as _json
from datetime import datetime, timezone, date as _date
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import desc
from sqlalchemy.orm import Session

from database import get_db
from models import Bulletin, BulletinDelivery, User, Tag
from schemas import (
    BulletinResponse, BulletinCreate, BulletinDeliveryResponse,
    SubscriptionResponse, NewsItemResponse,
)
from auth import get_current_user, require_admin
import bulletin_service as bs

router = APIRouter(prefix="/api/bulletin", tags=["Bülten"])


# ── küçük request gövdeleri ──
class NewsIdBody(BaseModel):
    news_id: int


class UserIdBody(BaseModel):
    user_id: int


class PhoneBody(BaseModel):
    phone_number: Optional[str] = None


def _resp(db, b: Bulletin) -> dict:
    tag_ids = bs.bulletin_tag_ids(b)
    excluded = bs.bulletin_excluded(b)
    item_count = len(bs.bulletin_items(db, tag_ids, b.date, excluded))
    return {
        "id": b.id, "date": b.date, "tag_ids": tag_ids, "title": b.title,
        "status": b.status, "excluded_news_ids": excluded, "item_count": item_count,
        "created_at": b.created_at, "approved_by_id": b.approved_by_id,
        "approved_at": b.approved_at, "sent_at": b.sent_at,
    }


# ─────────────────────────── ADMIN ───────────────────────────

@router.get("/", response_model=List[BulletinResponse])
def list_bulletins(
    bulletin_date: Optional[_date] = Query(None),
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    q = db.query(Bulletin)
    if bulletin_date:
        q = q.filter(Bulletin.date == bulletin_date)
    if status:
        q = q.filter(Bulletin.status == status)
    rows = q.order_by(desc(Bulletin.date), desc(Bulletin.id)).limit(200).all()
    return [_resp(db, b) for b in rows]


@router.post("/create", response_model=BulletinResponse, status_code=201)
def create_bulletin(data: BulletinCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    if not data.tag_ids:
        raise HTTPException(status_code=400, detail="En az bir etiket seçin")
    title = data.title or ", ".join(t.name for t in db.query(Tag).filter(Tag.id.in_(data.tag_ids)).all())
    b = Bulletin(date=data.date or _date.today(), tag_ids=_json.dumps(data.tag_ids),
                 title=title, status="draft")
    db.add(b); db.commit(); db.refresh(b)
    return _resp(db, b)


def _get_bulletin(db, bid) -> Bulletin:
    b = db.query(Bulletin).filter(Bulletin.id == bid).first()
    if not b:
        raise HTTPException(status_code=404, detail="Bülten bulunamadı")
    return b


@router.get("/{bid}", response_model=BulletinResponse)
def get_bulletin(bid: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return _resp(db, _get_bulletin(db, bid))


@router.get("/{bid}/items", response_model=List[NewsItemResponse])
def bulletin_items(bid: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    b = _get_bulletin(db, bid)
    return bs.bulletin_items(db, bs.bulletin_tag_ids(b), b.date, bs.bulletin_excluded(b))


@router.post("/{bid}/exclude", response_model=BulletinResponse)
def exclude_item(bid: int, body: NewsIdBody, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    b = _get_bulletin(db, bid)
    ex = set(bs.bulletin_excluded(b)); ex.add(body.news_id)
    b.excluded_news_ids = _json.dumps(sorted(ex)); db.commit()
    return _resp(db, b)


@router.post("/{bid}/include", response_model=BulletinResponse)
def include_item(bid: int, body: NewsIdBody, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    b = _get_bulletin(db, bid)
    ex = set(bs.bulletin_excluded(b)); ex.discard(body.news_id)
    b.excluded_news_ids = _json.dumps(sorted(ex)); db.commit()
    return _resp(db, b)


@router.post("/{bid}/approve", response_model=BulletinResponse)
def approve_bulletin(bid: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    b = _get_bulletin(db, bid)
    if b.status == "sent":
        raise HTTPException(status_code=400, detail="Bülten zaten gönderildi")
    b.status = "approved"; b.approved_by_id = admin.id; b.approved_at = datetime.now(timezone.utc)
    db.commit()
    return _resp(db, b)


@router.post("/{bid}/send")
def send_bulletin(bid: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    b = _get_bulletin(db, bid)
    if b.status != "approved":
        raise HTTPException(status_code=400, detail="Önce bülteni onaylayın")
    result = bs.send_bulletin(db, b)
    return {"detail": "Bülten gönderildi", **result}


@router.post("/send-all")
def send_all_today(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Bugünün tüm taslaklarını onayla + gönder."""
    drafts = db.query(Bulletin).filter(Bulletin.date == _date.today(),
                                       Bulletin.status.in_(["draft", "approved"])).all()
    total = {"bulletins": 0, "sent": 0, "failed": 0}
    for b in drafts:
        if b.status == "draft":
            b.status = "approved"; b.approved_by_id = admin.id; b.approved_at = datetime.now(timezone.utc)
            db.commit()
        r = bs.send_bulletin(db, b)
        total["bulletins"] += 1; total["sent"] += r["sent"]; total["failed"] += r["failed"]
    return {"detail": f"{total['bulletins']} bülten gönderildi", **total}


@router.get("/{bid}/deliveries", response_model=List[BulletinDeliveryResponse])
def deliveries(bid: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    _get_bulletin(db, bid)
    rows = db.query(BulletinDelivery).filter(BulletinDelivery.bulletin_id == bid)\
             .order_by(desc(BulletinDelivery.id)).all()
    out = []
    for d in rows:
        out.append({
            "id": d.id, "user_id": d.user_id,
            "username": d.user.username if d.user else None,
            "email": d.email, "channel": d.channel, "status": d.status,
            "error": d.error, "sent_at": d.sent_at,
        })
    return out


@router.post("/{bid}/resend")
def resend(bid: int, body: UserIdBody, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    b = _get_bulletin(db, bid)
    try:
        result = bs.resend_to_user(db, b, body.user_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return {"detail": "Tekrar gönderildi", **result}


# ── PDF (admin önizleme / indirme) ──
@router.get("/{bid}/pdf")
def bulletin_pdf(bid: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    b = _get_bulletin(db, bid)
    # Kullanıcı rolü yalnızca gönderilmiş bülteni indirebilir; admin her zaman
    from models import UserRole
    if current_user.role == UserRole.USER and b.status != "sent":
        raise HTTPException(status_code=403, detail="Bu bülten henüz yayınlanmadı")
    try:
        pdf_bytes = bs.generate_pdf(db, b)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF oluşturulamadı: {e}")
    fname = bs.pdf_filename(db, b)
    return StreamingResponse(iter([pdf_bytes]), media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="{fname}"'})


# ─────────────────────────── KULLANICI ───────────────────────────

@router.get("/subscription/me", response_model=SubscriptionResponse)
def my_subscription(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return {"subscribed": bool(current_user.bulletin_subscribed),
            "email": current_user.email, "phone_number": current_user.phone_number}


@router.post("/subscription/me", response_model=SubscriptionResponse)
def subscribe(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    current_user.bulletin_subscribed = True; db.commit()
    return {"subscribed": True, "email": current_user.email, "phone_number": current_user.phone_number}


@router.delete("/subscription/me", response_model=SubscriptionResponse)
def unsubscribe(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    current_user.bulletin_subscribed = False; db.commit()
    return {"subscribed": False, "email": current_user.email, "phone_number": current_user.phone_number}


@router.put("/phone/me", response_model=SubscriptionResponse)
def update_phone(body: PhoneBody, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    current_user.phone_number = (body.phone_number or "").strip() or None; db.commit()
    return {"subscribed": bool(current_user.bulletin_subscribed),
            "email": current_user.email, "phone_number": current_user.phone_number}


@router.get("/my/archive", response_model=List[BulletinResponse])
def my_archive(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Gönderilmiş (yayınlanmış) bültenler — kullanıcı arşivi."""
    rows = db.query(Bulletin).filter(Bulletin.status == "sent")\
             .order_by(desc(Bulletin.date), desc(Bulletin.id)).limit(200).all()
    return [_resp(db, b) for b in rows]
