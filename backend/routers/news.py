"""
Haberajani - News Router
News listing, search, read/favorite toggle, notes, and export.
"""
import csv
import html as _html
import io
import os
import re
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, desc, asc, func
from sqlalchemy.orm import Session

from auth import get_current_user, require_super_admin
from database import get_db
from models import NewsItem, Tag, User, UserRole, UserNewsState, NewsHide, SourceType
from schemas import NewsItemResponse, NoteUpdateRequest, UserNewsStateResponse, NewsHideCreate, NewsHideResponse

# ── PDF font setup (runs once at import) ────────────────────────────────────
try:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    _font_reg = "Helvetica"
    _font_bold = "Helvetica-Bold"

    _font_candidates = [
        ("C:/Windows/Fonts/arial.ttf",     "C:/Windows/Fonts/arialbd.ttf"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
         "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
        ("/usr/share/fonts/truetype/freefont/FreeSans.ttf",
         "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"),
        ("/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf",
         "/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf"),
    ]
    for _reg_path, _bold_path in _font_candidates:
        if os.path.exists(_reg_path):
            pdfmetrics.registerFont(TTFont("HaberFont", _reg_path))
            _font_reg = "HaberFont"
            if os.path.exists(_bold_path):
                pdfmetrics.registerFont(TTFont("HaberFont-Bold", _bold_path))
                _font_bold = "HaberFont-Bold"
            break
except Exception:
    _font_reg = "Helvetica"
    _font_bold = "Helvetica-Bold"

router = APIRouter(prefix="/api/news", tags=["News"])


@router.get("/latest-id")
def get_latest_id(
    tag_id: Optional[int] = None,
    since_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns the latest news item id + total count + new tag names since since_id."""
    q = db.query(NewsItem).filter(
        NewsItem.user_id == current_user.id,
        NewsItem.is_hidden == False
    )
    if tag_id:
        q = q.filter(NewsItem.tag_id == tag_id)
    total = q.count()
    latest = q.order_by(desc(NewsItem.id)).first()
    latest_id = latest.id if latest else 0

    # Find tags of new items since since_id
    new_tags = []
    if since_id and since_id > 0:
        new_q = db.query(NewsItem).filter(
            NewsItem.user_id == current_user.id,
            NewsItem.is_hidden == False,
            NewsItem.id > since_id
        )
        if tag_id:
            new_q = new_q.filter(NewsItem.tag_id == tag_id)
        new_items = new_q.all()
        seen_tag_ids = set()
        for item in new_items:
            if item.tag_id not in seen_tag_ids:
                seen_tag_ids.add(item.tag_id)
                tag = db.query(Tag).filter(Tag.id == item.tag_id).first()
                if tag:
                    new_tags.append(tag.name)

    # Son çekilme zamanı — son ScanLog girişi (yeni haber eklenmemiş olsa bile güncellenir)
    from models import ScanLog
    last_log = db.query(ScanLog).order_by(desc(ScanLog.scanned_at)).first()
    last_fetched_at = last_log.scanned_at.isoformat() if last_log and last_log.scanned_at else None

    return {"latest_id": latest_id, "total": total, "new_tags": new_tags, "last_fetched_at": last_fetched_at}


@router.get("/", response_model=List[NewsItemResponse])
def list_news(
    tag_id: Optional[int] = None,
    source_types: Optional[List[SourceType]] = Query(None),
    source_type: Optional[SourceType] = None,
    source_id: Optional[int] = None,
    custom_only: bool = False,
    is_favorite: Optional[bool] = None,
    is_read: Optional[bool] = None,
    show_hidden: bool = False,
    breaking_only: bool = False,
    sentiment: Optional[str] = Query(None, regex="^(positive|neutral|negative)$"),
    query: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    sort_order: Optional[str] = Query("desc", regex="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from models import Tag as TagModel
    from sqlalchemy import not_, and_

    if current_user.role == UserRole.USER:
        # Kullanıcı: sadece yayınlanmış etiketlerin haberleri
        published_tag_ids = [
            t.id for t in db.query(TagModel).filter(TagModel.is_published == True).all()
        ]
        if not published_tag_ids:
            return []

        # Gizleme filtresi: user_id veya department_id eşleşen kayıtları dışla
        hidden_news_ids = db.query(NewsHide.news_item_id).filter(
            (NewsHide.user_id == current_user.id) |
            (NewsHide.department_id == current_user.department_id)
        ).subquery()

        q = db.query(NewsItem).filter(
            NewsItem.tag_id.in_(published_tag_ids),
            NewsItem.is_hidden == False,
            ~NewsItem.id.in_(hidden_news_ids)
        )
    else:
        # Admin / Süper Admin: kendi haberleri
        q = db.query(NewsItem).filter(
            NewsItem.user_id == current_user.id,
            NewsItem.is_hidden == (True if show_hidden else False)
        )

    # Per-user okundu/favori/not durumu artık UserNewsState'te — NewsItem'ın
    # kendi is_read/is_favorite/user_note kolonları toggle endpoint'lerince
    # artık güncellenmiyor, bu yüzden filtre/aramada state tablosuna bakılır.
    q = q.outerjoin(
        UserNewsState,
        and_(UserNewsState.news_item_id == NewsItem.id, UserNewsState.user_id == current_user.id)
    )

    if breaking_only:
        if current_user.role == UserRole.USER:
            breaking_tag_ids = [
                t.id for t in db.query(TagModel).filter(
                    TagModel.is_published == True,
                    TagModel.is_breaking == True
                ).all()
            ]
        else:
            breaking_tag_ids = [
                t.id for t in db.query(TagModel).filter(
                    TagModel.user_id == current_user.id,
                    TagModel.is_breaking == True
                ).all()
            ]
        if not breaking_tag_ids:
            return []
        q = q.filter(NewsItem.tag_id.in_(breaking_tag_ids))
        # Son 24 saat
        from datetime import timedelta
        cutoff = datetime.utcnow() - timedelta(hours=24)
        q = q.filter(NewsItem.published_at.isnot(None), NewsItem.published_at >= cutoff)

    if tag_id:
        q = q.filter(NewsItem.tag_id == tag_id)
    # Özel kaynak filtresi
    if source_id:
        q = q.filter(NewsItem.source_id == source_id)
    elif custom_only:
        q = q.filter(NewsItem.source_id.isnot(None))
    # Multi source_type filter takes precedence over single
    effective_types = source_types if source_types else ([source_type] if source_type else None)
    if effective_types:
        q = q.filter(NewsItem.source_type.in_(effective_types))
    if is_favorite is not None:
        q = q.filter(func.coalesce(UserNewsState.is_favorite, False) == is_favorite)
    if is_read is not None:
        q = q.filter(func.coalesce(UserNewsState.is_read, False) == is_read)
    if sentiment:
        q = q.filter(NewsItem.sentiment == sentiment)
    if query:
        search = f"%{query}%"
        q = q.filter(or_(
            NewsItem.title.ilike(search),
            NewsItem.summary.ilike(search),
            UserNewsState.user_note.ilike(search),
            NewsItem.source_name.ilike(search),
        ))
    # published_at öncelikli, NULL ise fetched_at'e düşer — hem sıralama hem tarih
    # filtresi aynı sütunu kullanmalı, aksi halde "Bugün Ne Oldu" (bu sütuna göre
    # filtreler) ile bülten (ayni coalesce'i kullanır) farklı sayı gösterir.
    sort_col = func.coalesce(NewsItem.published_at, NewsItem.fetched_at)
    if date_from:
        # Tarayıcı ISO string'i (+03:00 gibi) tz-aware datetime olarak gelir;
        # tzinfo'yu ATMADAN önce UTC'ye çevirmek gerekir — DB'deki zamanlar
        # naive-ama-UTC saklanıyor. Önceki kod sadece tzinfo'yu siliyordu, bu da
        # yerel saat farkı kadar (ör. +3 saat) yanlış pencereye bakılmasına
        # sebep oluyordu.
        df = date_from.astimezone(timezone.utc).replace(tzinfo=None) if date_from.tzinfo else date_from
        q = q.filter(sort_col >= df)
    if date_to:
        dt = date_to.astimezone(timezone.utc).replace(tzinfo=None) if date_to.tzinfo else date_to
        q = q.filter(sort_col <= dt)

    order_func = asc if sort_order == "asc" else desc
    items = q.order_by(order_func(sort_col)).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    # Bu kullanıcının okundu/favori/not durumu (UserNewsState) tek sorguda
    states = db.query(UserNewsState).filter(
        UserNewsState.user_id == current_user.id,
        UserNewsState.news_item_id.in_([i.id for i in items])
    ).all() if items else []
    state_map = {s.news_item_id: s for s in states}

    # Enrich with tag info
    result = []
    for item in items:
        resp = NewsItemResponse.model_validate(item)
        state = state_map.get(item.id)
        resp.is_read = state.is_read if state else False
        resp.is_favorite = state.is_favorite if state else False
        resp.user_note = state.user_note if state else None
        tag = db.query(Tag).filter(Tag.id == item.tag_id).first()
        if tag:
            resp.tag_name = tag.name
            resp.tag_color = tag.color
        result.append(resp)

    return result


@router.get("/count")
def news_count(
    tag_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    source_types: Optional[List[SourceType]] = Query(None),
    breaking_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from datetime import date, time as dtime
    from sqlalchemy import and_

    base = db.query(NewsItem).outerjoin(
        UserNewsState,
        and_(UserNewsState.news_item_id == NewsItem.id, UserNewsState.user_id == current_user.id)
    ).filter(
        NewsItem.user_id == current_user.id,
        NewsItem.is_hidden == False
    )
    if breaking_only:
        from models import Tag as TagModel
        from datetime import timedelta
        breaking_tag_ids = [
            t.id for t in db.query(TagModel).filter(
                TagModel.user_id == current_user.id,
                TagModel.is_breaking == True
            ).all()
        ]
        if breaking_tag_ids:
            base = base.filter(NewsItem.tag_id.in_(breaking_tag_ids))
            cutoff = datetime.utcnow() - timedelta(hours=24)
            base = base.filter(NewsItem.published_at.isnot(None), NewsItem.published_at >= cutoff)
        else:
            return {"total": 0, "unread": 0, "favorites": 0, "today": 0, "today_unread": 0,
                    "by_source": {}, "sentiment": {"positive": 0, "neutral": 0, "negative": 0, "unknown": 0}}
    if tag_id:
        base = base.filter(NewsItem.tag_id == tag_id)
    if date_from:
        # tzinfo'yu atmadan once UTC'ye cevir (bkz. list_news'teki ayni fix)
        df = datetime.fromisoformat(date_from.replace("Z", "+00:00")).astimezone(timezone.utc).replace(tzinfo=None)
        base = base.filter(NewsItem.published_at.isnot(None), NewsItem.published_at >= df)
    if date_to:
        dt = datetime.fromisoformat(date_to.replace("Z", "+00:00")).astimezone(timezone.utc).replace(tzinfo=None)
        base = base.filter(NewsItem.published_at.isnot(None), NewsItem.published_at <= dt)
    if source_types:
        base = base.filter(NewsItem.source_type.in_(source_types))

    total = base.count()
    unread = base.filter(func.coalesce(UserNewsState.is_read, False) == False).count()
    favorites = base.filter(func.coalesce(UserNewsState.is_favorite, False) == True).count()

    # Today's start (UTC) — sunucunun sistem saat dilimine bakılmaksızın her zaman
    # UTC takvim gününü kullanır (NewsItem zaman damgaları naive-UTC saklanır)
    today_start = datetime.combine(datetime.now(timezone.utc).date(), dtime.min)

    # Per-source-type breakdown
    source_counts = {}
    for st in [SourceType.WEB, SourceType.YOUTUBE, SourceType.TWITTER,
               SourceType.INSTAGRAM, SourceType.EKSISOZLUK, SourceType.RSS]:
        count = base.filter(NewsItem.source_type == st).count()
        today = base.filter(
            NewsItem.source_type == st,
            NewsItem.published_at.isnot(None),
            NewsItem.published_at >= today_start
        ).count()
        source_counts[st.value] = {"count": count, "today": today}

    # Total today
    total_today = base.filter(NewsItem.published_at.isnot(None), NewsItem.published_at >= today_start).count()
    today_unread = base.filter(
        NewsItem.published_at.isnot(None), NewsItem.published_at >= today_start,
        func.coalesce(UserNewsState.is_read, False) == False
    ).count()

    # Sentiment distribution
    sentiment_positive = base.filter(NewsItem.sentiment == "positive").count()
    sentiment_neutral = base.filter(NewsItem.sentiment == "neutral").count()
    sentiment_negative = base.filter(NewsItem.sentiment == "negative").count()
    sentiment_unknown = base.filter(
        (NewsItem.sentiment == None) | (NewsItem.sentiment == "")
    ).count()

    return {
        "total": total,
        "unread": unread,
        "favorites": favorites,
        "today": total_today,
        "today_unread": today_unread,
        "by_source": source_counts,
        "sentiment": {
            "positive": sentiment_positive,
            "neutral": sentiment_neutral,
            "negative": sentiment_negative,
            "unknown": sentiment_unknown
        }
    }


@router.get("/{news_id}", response_model=NewsItemResponse)
def get_news_item(
    news_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(NewsItem).filter(
        NewsItem.id == news_id, NewsItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Haber bulunamadi")

    resp = NewsItemResponse.model_validate(item)
    tag = db.query(Tag).filter(Tag.id == item.tag_id).first()
    if tag:
        resp.tag_name = tag.name
        resp.tag_color = tag.color
    return resp


@router.put("/bulk/mark-read")
def bulk_mark_read(
    breaking_only: bool = False,
    tag_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Mark all (optionally filtered) news as read."""
    from sqlalchemy import and_

    q = db.query(NewsItem.id).outerjoin(
        UserNewsState,
        and_(UserNewsState.news_item_id == NewsItem.id, UserNewsState.user_id == current_user.id)
    ).filter(
        NewsItem.user_id == current_user.id,
        func.coalesce(UserNewsState.is_read, False) == False,
        NewsItem.is_hidden == False,
    )
    if breaking_only:
        from models import Tag as TagModel
        breaking_ids = [t.id for t in db.query(TagModel).filter(
            TagModel.user_id == current_user.id,
            TagModel.is_breaking == True
        ).all()]
        q = q.filter(NewsItem.tag_id.in_(breaking_ids))
    if tag_id:
        q = q.filter(NewsItem.tag_id == tag_id)

    news_ids = [r[0] for r in q.all()]
    existing = db.query(UserNewsState).filter(
        UserNewsState.user_id == current_user.id,
        UserNewsState.news_item_id.in_(news_ids)
    ).all() if news_ids else []
    existing_map = {s.news_item_id: s for s in existing}
    now = datetime.now(timezone.utc)
    for nid in news_ids:
        state = existing_map.get(nid)
        if not state:
            state = UserNewsState(user_id=current_user.id, news_item_id=nid, is_read=True, updated_at=now)
            db.add(state)
        else:
            state.is_read = True
            state.updated_at = now
    db.commit()
    return {"marked_read": len(news_ids)}


def _get_or_create_state(db: Session, user_id: int, news_item_id: int) -> UserNewsState:
    """UserNewsState kaydını getirir, yoksa oluşturur."""
    state = db.query(UserNewsState).filter(
        UserNewsState.user_id == user_id,
        UserNewsState.news_item_id == news_item_id
    ).first()
    if not state:
        state = UserNewsState(user_id=user_id, news_item_id=news_item_id)
        db.add(state)
        db.flush()
    return state


@router.put("/{news_id}/read")
def toggle_read(
    news_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not db.query(NewsItem).filter(NewsItem.id == news_id).first():
        raise HTTPException(status_code=404, detail="Haber bulunamadi")
    state = _get_or_create_state(db, current_user.id, news_id)
    state.is_read = not state.is_read
    state.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"is_read": state.is_read}


@router.put("/{news_id}/favorite")
def toggle_favorite(
    news_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not db.query(NewsItem).filter(NewsItem.id == news_id).first():
        raise HTTPException(status_code=404, detail="Haber bulunamadi")
    state = _get_or_create_state(db, current_user.id, news_id)
    state.is_favorite = not state.is_favorite
    state.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"is_favorite": state.is_favorite}


@router.put("/{news_id}/hide")
def toggle_hide(
    news_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Admin'in kendi haberlerini akıştan çıkarması (global is_hidden)."""
    item = db.query(NewsItem).filter(
        NewsItem.id == news_id, NewsItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Haber bulunamadi")
    item.is_hidden = not item.is_hidden
    db.commit()
    return {"is_hidden": item.is_hidden}


@router.put("/{news_id}/note")
def update_note(
    news_id: int,
    data: NoteUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not db.query(NewsItem).filter(NewsItem.id == news_id).first():
        raise HTTPException(status_code=404, detail="Haber bulunamadi")
    state = _get_or_create_state(db, current_user.id, news_id)
    state.user_note = data.note
    state.updated_at = datetime.now(timezone.utc)
    db.commit()
    return {"user_note": state.user_note}


# ─── Süper Admin: Haber Gizleme ──────────────────────────

@router.post("/{news_id}/hide-for", response_model=NewsHideResponse)
def hide_news_for(
    news_id: int,
    data: NewsHideCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    """Belirli bir kullanıcı veya birim için haberi gizle."""
    if not data.user_id and not data.department_id:
        raise HTTPException(status_code=400, detail="user_id veya department_id gereklidir")
    if data.user_id and data.department_id:
        raise HTTPException(status_code=400, detail="Yalnızca biri seçilebilir: user_id veya department_id")
    if not db.query(NewsItem).filter(NewsItem.id == news_id).first():
        raise HTTPException(status_code=404, detail="Haber bulunamadı")

    # Aynı kayıt zaten varsa döndür
    existing = db.query(NewsHide).filter(
        NewsHide.news_item_id == news_id,
        NewsHide.user_id == data.user_id,
        NewsHide.department_id == data.department_id,
    ).first()
    if existing:
        return existing

    hide = NewsHide(
        news_item_id=news_id,
        user_id=data.user_id,
        department_id=data.department_id,
        hidden_by_id=current_user.id,
        hidden_at=datetime.now(timezone.utc),
    )
    db.add(hide)
    db.commit()
    db.refresh(hide)
    return hide


@router.delete("/{news_id}/hide-for", status_code=204)
def unhide_news_for(
    news_id: int,
    data: NewsHideCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    """Kullanıcı veya birim için gizlemeyi kaldır."""
    hide = db.query(NewsHide).filter(
        NewsHide.news_item_id == news_id,
        NewsHide.user_id == data.user_id,
        NewsHide.department_id == data.department_id,
    ).first()
    if not hide:
        raise HTTPException(status_code=404, detail="Gizleme kaydı bulunamadı")
    db.delete(hide)
    db.commit()


@router.get("/{news_id}/hide-for", response_model=List[NewsHideResponse])
def list_hides_for_news(
    news_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_super_admin)
):
    """Bu haberin gizlendiği kullanıcı/birim listesi."""
    return db.query(NewsHide).filter(NewsHide.news_item_id == news_id).all()


@router.get("/export/csv")
def export_csv(
    tag_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = db.query(NewsItem).filter(NewsItem.user_id == current_user.id)
    if tag_id:
        q = q.filter(NewsItem.tag_id == tag_id)

    items = q.order_by(desc(NewsItem.published_at)).all()

    states = db.query(UserNewsState).filter(
        UserNewsState.user_id == current_user.id,
        UserNewsState.news_item_id.in_([i.id for i in items])
    ).all() if items else []
    state_map = {s.news_item_id: s for s in states}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Baslik", "Ozet", "URL", "Kaynak URL", "Kaynak", "Tarih", "Etiket", "Not", "Okundu", "Favori"])

    for item in items:
        tag = db.query(Tag).filter(Tag.id == item.tag_id).first()
        state = state_map.get(item.id)
        writer.writerow([
            item.title,
            item.summary or "",
            item.url,
            item.source_url or "",
            item.source_name or "",
            item.published_at.isoformat() if item.published_at else "",
            tag.name if tag else "",
            (state.user_note if state else "") or "",
            "Evet" if (state and state.is_read) else "Hayir",
            "Evet" if (state and state.is_favorite) else "Hayir",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=haberajani_haberler.csv"}
    )


@router.get("/export/pdf")
def export_pdf(
    tag_id: Optional[int] = None,
    tag_ids: Optional[List[int]] = Query(None),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    is_breaking: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    )

    def pt(text):
        """Clean text for ReportLab Paragraph: strip HTML tags, decode entities, XML-escape."""
        if not text:
            return ""
        text = re.sub(r'<[^>]+>', ' ', str(text))   # strip HTML tags first
        text = _html.unescape(text)                   # &nbsp; → \xa0, &amp; → &, etc.
        text = text.replace('\xa0', ' ').replace('\u200b', '')  # non-breaking/zero-width spaces
        out = []
        for c in text:
            cp = ord(c)
            if cp < 0x250 or 0x2010 <= cp <= 0x2060:
                out.append(c)
            else:
                out.append(' ')
        result = ' '.join(''.join(out).split())       # normalize whitespace
        return result.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def url_xml(url):
        """Escape & in URLs for use inside XML attributes."""
        return (url or "").replace("&", "&amp;")

    # ── Query ────────────────────────────────────────────────────────────────
    q = db.query(NewsItem).filter(
        NewsItem.user_id == current_user.id,
        NewsItem.is_hidden == False
    )
    # If is_breaking, restrict to breaking tags only
    if is_breaking:
        from models import Tag as TagModel
        breaking_tag_ids_all = [
            t.id for t in db.query(TagModel).filter(
                TagModel.user_id == current_user.id,
                TagModel.is_breaking == True
            ).all()
        ]
        if breaking_tag_ids_all:
            q = q.filter(NewsItem.tag_id.in_(breaking_tag_ids_all))

    # Resolve effective tag filter (tag_ids list takes precedence)
    effective_tag_ids = tag_ids if tag_ids else ([tag_id] if tag_id else None)
    if effective_tag_ids:
        q = q.filter(NewsItem.tag_id.in_(effective_tag_ids))
    if date_from:
        df = date_from.astimezone(timezone.utc).replace(tzinfo=None) if date_from.tzinfo else date_from
        q = q.filter(NewsItem.published_at >= df)
    if date_to:
        dt = date_to.astimezone(timezone.utc).replace(tzinfo=None) if date_to.tzinfo else date_to
        q = q.filter(NewsItem.published_at <= dt)
    items = q.order_by(desc(NewsItem.published_at)).all()

    # Build tag name display
    if is_breaking and not effective_tag_ids:
        tag_name = "Son Dakika"
    elif effective_tag_ids:
        tag_objs = db.query(Tag).filter(Tag.id.in_(effective_tag_ids)).all()
        tag_name = ", ".join(t.name for t in tag_objs) if tag_objs else "Tüm Etiketler"
    else:
        tag_name = "Tüm Etiketler"

    # ── Stats ────────────────────────────────────────────────────────────────
    total = len(items)
    sentiment_counts = {"positive": 0, "neutral": 0, "negative": 0, "unknown": 0}
    source_counts: dict = {}
    for it in items:
        key = it.sentiment if it.sentiment in ("positive", "neutral", "negative") else "unknown"
        sentiment_counts[key] += 1
        stype = it.source_type.value if it.source_type else "Diğer"
        source_counts[stype] = source_counts.get(stype, 0) + 1

    analyzed = sentiment_counts["positive"] + sentiment_counts["neutral"] + sentiment_counts["negative"]

    # ── Colours & styles ─────────────────────────────────────────────────────
    C_NAVY    = colors.HexColor("#0f172a")
    C_BLUE    = colors.HexColor("#3b82f6")
    C_BLUE2   = colors.HexColor("#1d4ed8")
    C_POS     = colors.HexColor("#22c55e")
    C_NEU     = colors.HexColor("#f59e0b")
    C_NEG     = colors.HexColor("#ef4444")
    C_LIGHT   = colors.HexColor("#f1f5f9")
    C_BORDER  = colors.HexColor("#e2e8f0")
    C_MUTED   = colors.HexColor("#64748b")
    C_TEXT    = colors.HexColor("#1e293b")

    def style(name, **kw):
        kw.setdefault("fontName", _font_reg)
        return ParagraphStyle(name, **kw)

    s_body    = style("body",    fontSize=9,   leading=13, textColor=C_TEXT)
    s_small   = style("small",   fontSize=7.5, leading=11, textColor=C_MUTED)
    s_title   = style("title",   fontSize=10,  leading=14, fontName=_font_bold, textColor=C_TEXT)
    s_section = style("section", fontSize=11,  leading=16, fontName=_font_bold,
                      textColor=C_BLUE2, spaceBefore=14, spaceAfter=4)
    s_meta    = style("meta",    fontSize=9,   leading=13, textColor=C_MUTED)

    buf = io.BytesIO()
    now_str  = datetime.now().strftime("%d.%m.%Y %H:%M")
    from_str = date_from.strftime("%d.%m.%Y") if date_from else "Başlangıç"
    to_str   = date_to.strftime("%d.%m.%Y")   if date_to   else "Bugün"

    # Footer drawn on every page via canvas callback
    def draw_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont(_font_reg, 7)
        canvas.setFillColor(C_MUTED)
        footer_y = 0.9 * cm
        canvas.drawString(1.8 * cm, footer_y,
                          f"Haberajani  |  {pt(tag_name)}  |  {now_str}")
        canvas.drawRightString(A4[0] - 1.8 * cm, footer_y,
                               f"Sayfa {doc.page}")
        canvas.setStrokeColor(C_BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(1.8 * cm, footer_y + 9, A4[0] - 1.8 * cm, footer_y + 9)
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1.8 * cm, rightMargin=1.8 * cm,
        topMargin=1.5 * cm, bottomMargin=2.0 * cm,
        title="Haberajani Raporu"
    )

    W = A4[0] - 3.6 * cm  # usable width
    story = []

    # ── Header band ──────────────────────────────────────────────────────────
    header_data = [[
        Paragraph(
            '<font color="white" size="20"><b>Haber Ajanı</b></font>',
            style("h1", fontSize=20, fontName=_font_bold, textColor=colors.white, leading=24)
        ),
        Paragraph(
            f'<font color="#93c5fd" size="8">Haber Analiz Raporu</font><br/>'
            f'<font color="white" size="9"><b>{pt(tag_name)}</b></font><br/>'
            f'<font color="#93c5fd" size="7.5">{pt(from_str)} - {pt(to_str)}</font><br/>'
            f'<font color="#64748b" size="7">Olusturuldu: {now_str}</font>',
            style("h_right", fontSize=8, fontName=_font_reg, textColor=colors.white,
                  leading=13, alignment=2)
        ),
    ]]
    header_tbl = Table(header_data, colWidths=[W * 0.45, W * 0.55])
    header_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_NAVY),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 18),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 18),
        ("TOPPADDING",    (0, 0), (-1, -1), 18),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ("LINEBELOW",     (0, 0), (-1, -1), 3, C_BLUE),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 0.45 * cm))

    # ── KPI cards ────────────────────────────────────────────────────────────
    def kpi_cell(value, label, hex_color):
        return [
            Paragraph(
                f'<font color="{hex_color}" size="22"><b>{value}</b></font>',
                style("kv", fontSize=22, fontName=_font_bold,
                      textColor=colors.HexColor(hex_color), leading=26, alignment=1)
            ),
            Paragraph(
                f'<font size="8">{label}</font>',
                style("kl", fontSize=8, fontName=_font_reg,
                      textColor=C_MUTED, leading=11, alignment=1)
            ),
        ]

    kpi_tbl = Table(
        [[
            kpi_cell(total,                        "Toplam Haber", "#3b82f6"),
            kpi_cell(sentiment_counts["positive"],  "Pozitif",      "#22c55e"),
            kpi_cell(sentiment_counts["neutral"],   "Nötr",         "#f59e0b"),
            kpi_cell(sentiment_counts["negative"],  "Negatif",      "#ef4444"),
            kpi_cell(len(source_counts),            "Kaynak Türü",  "#8b5cf6"),
        ]],
        colWidths=[W / 5] * 5
    )
    kpi_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_LIGHT),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING",    (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("LINEAFTER",     (0, 0), (3, 0), 0.5, C_BORDER),
        ("BOX",           (0, 0), (-1, -1), 0.5, C_BORDER),
    ]))
    story.append(kpi_tbl)
    story.append(Spacer(1, 0.4 * cm))

    # ── Sentiment bars ───────────────────────────────────────────────────────
    story.append(Paragraph("Tutum Analizi Dağılımı", s_section))
    story.append(HRFlowable(width=W, thickness=1, color=C_BORDER, spaceAfter=8))

    if analyzed > 0:
        bar_track_w = W - 5.8 * cm

        def bar_row(label, count, color_obj):
            pct = count / analyzed * 100
            filled = max(int(pct / 100 * bar_track_w), 2) if count else 0
            empty  = max(int(bar_track_w) - filled, 0)
            # Filled segment
            inner = [["", ""]]
            seg_tbl = Table(inner, colWidths=[filled, empty], rowHeights=[10])
            seg_tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (0, 0), color_obj),
                ("BACKGROUND", (1, 0), (1, 0), C_BORDER),
            ]))
            return [
                Paragraph(label, style("bl", fontSize=9, fontName=_font_reg, textColor=C_TEXT)),
                seg_tbl,
                Paragraph(
                    f"<b>{count}</b>  {pct:.0f}%",
                    style("bv", fontSize=9, fontName=_font_bold, textColor=C_TEXT, alignment=2)
                ),
            ]

        bar_tbl = Table(
            [
                bar_row("Pozitif", sentiment_counts["positive"], C_POS),
                bar_row("Nötr",    sentiment_counts["neutral"],  C_NEU),
                bar_row("Negatif", sentiment_counts["negative"], C_NEG),
            ],
            colWidths=[2.0 * cm, bar_track_w, 3.0 * cm],
            rowHeights=[22, 22, 22]
        )
        bar_tbl.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 4),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(bar_tbl)
    else:
        story.append(Paragraph("Tutum analizi verisi bulunmuyor.", s_meta))

    story.append(Spacer(1, 0.4 * cm))

    # ── Source breakdown ─────────────────────────────────────────────────────
    story.append(Paragraph("Kaynak Dağılımı", s_section))
    story.append(HRFlowable(width=W, thickness=1, color=C_BORDER, spaceAfter=8))

    SOURCE_LABELS = {
        "rss": "RSS / Haber Sitesi", "twitter": "Twitter / X",
        "youtube": "YouTube", "web": "Web",
        "instagram": "Instagram", "eksisozluk": "Ekşi Sözlük",
        "newsapi": "NewsAPI",
    }
    src_rows = [[
        Paragraph("<b>Kaynak</b>", style("th", fontSize=9, fontName=_font_bold, textColor=colors.white)),
        Paragraph("<b>Sayı</b>",   style("th", fontSize=9, fontName=_font_bold, textColor=colors.white, alignment=1)),
        Paragraph("<b>Oran</b>",   style("th", fontSize=9, fontName=_font_bold, textColor=colors.white, alignment=2)),
    ]]
    for stype, cnt in sorted(source_counts.items(), key=lambda x: -x[1]):
        pct = cnt / total * 100 if total else 0
        label = SOURCE_LABELS.get(stype, stype.title())
        src_rows.append([
            Paragraph(label, s_body),
            Paragraph(str(cnt), style("sc", fontSize=9, fontName=_font_reg, textColor=C_TEXT, alignment=1)),
            Paragraph(f"{pct:.1f}%", style("sp", fontSize=9, fontName=_font_reg, textColor=C_MUTED, alignment=2)),
        ])

    src_tbl = Table(src_rows, colWidths=[W * 0.6, W * 0.2, W * 0.2])
    src_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  C_BLUE),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [C_LIGHT, colors.white]),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW",     (0, 0), (-1, -2), 0.5, C_BORDER),
        ("BOX",           (0, 0), (-1, -1), 0.5, C_BORDER),
    ]))
    story.append(src_tbl)
    story.append(Spacer(1, 0.5 * cm))

    # ── Twitter / X Analysis ─────────────────────────────────────────────────
    twitter_items = [it for it in items if it.source_type and it.source_type.value == "twitter"]
    if twitter_items:
        story.append(Paragraph("Twitter / X Analizi", s_section))
        story.append(HRFlowable(width=W, thickness=1, color=C_BORDER, spaceAfter=8))

        C_X      = colors.HexColor("#1d9bf0")
        C_X_DARK = colors.HexColor("#0f4c81")
        C_X_BG   = colors.HexColor("#e8f4fd")
        s_x_lbl  = style("xl", fontSize=8, fontName=_font_bold, textColor=C_X_DARK)
        s_x_body = style("xb", fontSize=9, fontName=_font_reg, textColor=C_TEXT, leading=13)
        s_x_meta = style("xm", fontSize=7.5, fontName=_font_reg, textColor=C_MUTED, leading=11)

        trending_count = sum(1 for it in twitter_items if it.is_trending)

        # KPI row: tweet count, trending, top RT, top like
        top_rt   = max(twitter_items, key=lambda x: (x.retweet_count or 0))
        top_like = max(twitter_items, key=lambda x: (x.like_count or 0))

        x_kpi_data = [[
            [Paragraph(str(len(twitter_items)), style("xkv", fontSize=18, fontName=_font_bold, textColor=C_X, leading=22, alignment=1)),
             Paragraph("Tweet", style("xkl", fontSize=8, fontName=_font_reg, textColor=C_MUTED, leading=11, alignment=1))],
            [Paragraph(str(top_rt.retweet_count or 0), style("xkv2", fontSize=18, fontName=_font_bold, textColor=colors.HexColor("#22c55e"), leading=22, alignment=1)),
             Paragraph("En Yüksek RT", style("xkl2", fontSize=8, fontName=_font_reg, textColor=C_MUTED, leading=11, alignment=1))],
            [Paragraph(str(top_like.like_count or 0), style("xkv3", fontSize=18, fontName=_font_bold, textColor=colors.HexColor("#ef4444"), leading=22, alignment=1)),
             Paragraph("En Yüksek Beğeni", style("xkl3", fontSize=8, fontName=_font_reg, textColor=C_MUTED, leading=11, alignment=1))],
            [Paragraph("TREND" if trending_count > 0 else "—", style("xkv4", fontSize=16, fontName=_font_bold, textColor=colors.HexColor("#ef4444") if trending_count > 0 else C_MUTED, leading=22, alignment=1)),
             Paragraph("Trend Durumu", style("xkl4", fontSize=8, fontName=_font_reg, textColor=C_MUTED, leading=11, alignment=1))],
        ]]
        x_kpi_tbl = Table(x_kpi_data, colWidths=[W / 4] * 4)
        x_kpi_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), C_X_BG),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
            ("TOPPADDING",    (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LINEAFTER",     (0, 0), (2, 0), 0.5, C_BORDER),
            ("BOX",           (0, 0), (-1, -1), 0.5, C_BORDER),
        ]))
        story.append(x_kpi_tbl)
        story.append(Spacer(1, 0.35 * cm))

        def x_tweet_card(label_text, it, label_color):
            """Render a highlighted tweet card."""
            if not it:
                return
            sname = pt(it.source_name or "")
            date_s = it.published_at.strftime("%d.%m.%Y %H:%M") if it.published_at else "—"
            rt_s   = f"🔁 {it.retweet_count:,}" if it.retweet_count else ""
            lk_s   = f"❤ {it.like_count:,}"    if it.like_count    else ""
            metrics = "   ".join(filter(None, [rt_s, lk_s]))
            trend_s = "  🔥 TREND" if it.is_trending else ""

            label_tbl = Table(
                [[Paragraph(f'<font color="white" size="8"><b>{label_text}</b></font>',
                            style("xl_hdr", fontSize=8, fontName=_font_bold, textColor=colors.white))]],
                colWidths=[W]
            )
            label_tbl.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, -1), colors.HexColor(label_color)),
                ("LEFTPADDING",   (0, 0), (-1, -1), 8),
                ("TOPPADDING",    (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            body_rows = [
                Paragraph(pt(it.summary or it.title), s_x_body),
                Paragraph(f"{sname}  ·  {date_s}{trend_s}", s_x_meta),
            ]
            if metrics:
                body_rows.append(Paragraph(metrics, style("xmet", fontSize=8, fontName=_font_bold, textColor=C_X, leading=12)))
            if it.url:
                body_rows.append(Paragraph(
                    f'<link href="{url_xml(it.url)}" color="#1d9bf0">Tweet\'e Git</link>',
                    style("xlnk", fontSize=7.5, fontName=_font_reg, textColor=C_X, leading=12)
                ))
            body_tbl = Table([[r] for r in body_rows], colWidths=[W])
            body_tbl.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, -1), C_X_BG),
                ("LEFTPADDING",   (0, 0), (-1, -1), 10),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
                ("TOPPADDING",    (0, 0), (-1, -1), 3),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
                ("BOX",           (0, 0), (-1, -1), 0.5, C_BORDER),
            ]))
            story.append(label_tbl)
            story.append(body_tbl)
            story.append(Spacer(1, 0.2 * cm))

        # Show top RT and top like tweet (may be same tweet)
        x_tweet_card("En Çok Repost Edilen Tweet", top_rt,   "#1d9bf0")
        if top_like.id != top_rt.id:
            x_tweet_card("En Çok Beğenilen Tweet",   top_like, "#ef4444")

        story.append(Spacer(1, 0.2 * cm))

    # ── Article list grouped by tag ──────────────────────────────────────────
    story.append(Paragraph("Haber Listesi", s_section))
    story.append(HRFlowable(width=W, thickness=1.5, color=C_BLUE, spaceAfter=10))

    SENT_LABEL = {
        "positive": ("Pozitif", "#22c55e"),
        "neutral":  ("Nötr",    "#f59e0b"),
        "negative": ("Negatif", "#ef4444"),
    }
    SRC_LABEL = {
        "rss": "RSS", "twitter": "X / Twitter", "youtube": "YouTube",
        "web": "Web", "instagram": "Instagram", "eksisozluk": "Ekşi",
        "newsapi": "NewsAPI",
    }

    # Group items by tag preserving published_at desc order
    from collections import defaultdict
    tag_item_map: dict = defaultdict(list)
    for it in items:
        tag_item_map[it.tag_id].append(it)

    tag_obj_map = {t.id: t for t in db.query(Tag).filter(Tag.id.in_(list(tag_item_map.keys()))).all()}

    s_tag_header = style("tag_hdr", fontSize=11, fontName=_font_bold,
                         textColor=colors.white, leading=16)
    s_tag_sources = style("tag_src", fontSize=7.5, fontName=_font_reg,
                          textColor=colors.HexColor("#93c5fd"), leading=11)

    for tid, tag_items_list in tag_item_map.items():
        tag_obj = tag_obj_map.get(tid)
        tag_display = pt(tag_obj.name if tag_obj else "Etiket")

        # Collect distinct source names for this tag (preserve insertion order, max 6)
        seen = {}
        for it in tag_items_list:
            sn = it.source_name or SRC_LABEL.get(
                it.source_type.value if it.source_type else "", "")
            sn_clean = pt(sn)
            if sn_clean and sn_clean not in seen:
                seen[sn_clean] = True
            if len(seen) >= 6:
                break
        src_line = "  ·  ".join(seen.keys())

        # Tag header band: name + source subtitle
        hdr_cell_content = [Paragraph(tag_display, s_tag_header)]
        if src_line:
            hdr_cell_content.append(Paragraph(src_line, s_tag_sources))

        tag_hdr_tbl = Table(
            [[hdr_cell_content]],
            colWidths=[W]
        )
        tag_hdr_tbl.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), C_NAVY),
            ("LEFTPADDING",   (0, 0), (-1, -1), 10),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
            ("TOPPADDING",    (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LINEBELOW",     (0, 0), (-1, -1), 2, C_BLUE),
        ]))
        story.append(tag_hdr_tbl)
        story.append(Spacer(1, 0.2 * cm))

        for i, it in enumerate(tag_items_list, 1):
            stype_val  = it.source_type.value if it.source_type else ""
            src_label  = SRC_LABEL.get(stype_val, stype_val.title())
            sent_text, sent_hex = SENT_LABEL.get(it.sentiment, ("—", "#94a3b8"))
            date_str   = it.published_at.strftime("%d.%m.%Y %H:%M") if it.published_at else "—"
            source_name = pt(it.source_name or src_label)

            num_cell = Table(
                [[Paragraph(
                    f'<font color="white" size="9"><b>{i}</b></font>',
                    style("num", fontSize=9, fontName=_font_bold, textColor=colors.white,
                          leading=12, alignment=1)
                )]],
                colWidths=[0.65 * cm], rowHeights=[0.65 * cm]
            )
            num_cell.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (0, 0), C_BLUE),
                ("VALIGN",        (0, 0), (0, 0), "MIDDLE"),
                ("LEFTPADDING",   (0, 0), (0, 0), 0),
                ("RIGHTPADDING",  (0, 0), (0, 0), 0),
                ("TOPPADDING",    (0, 0), (0, 0), 0),
                ("BOTTOMPADDING", (0, 0), (0, 0), 0),
            ]))

            tw_metrics = ""
            if it.source_type and it.source_type.value == "twitter":
                parts = []
                if it.retweet_count:
                    parts.append(f"RT {it.retweet_count:,}")
                if it.like_count:
                    parts.append(f"Begen {it.like_count:,}")
                if it.is_trending:
                    parts.append("TREND")
                if parts:
                    tw_metrics = "  |  " + "  ·  ".join(parts)

            content_lines = [
                Paragraph(pt(it.title), s_title),
                Paragraph(
                    f'{source_name}  &bull;  {date_str}  &bull;  '
                    f'<font color="{sent_hex}"><b>{sent_text}</b></font>'
                    f'{pt(tw_metrics)}',
                    s_small
                ),
            ]
            if it.summary:
                snippet = pt(it.summary[:300]) + ("..." if len(it.summary) > 300 else "")
                content_lines.append(Paragraph(snippet, s_body))

            link_parts = []
            if it.url:
                link_parts.append(f'<link href="{url_xml(it.url)}" color="#3b82f6">Habere Git</link>')
            if it.source_url and it.source_url != it.url:
                link_parts.append(f'<link href="{url_xml(it.source_url)}" color="#8b5cf6">Kaynak</link>')
            if link_parts:
                content_lines.append(Paragraph(
                    '  |  '.join(link_parts),
                    style("lnk", fontSize=7.5, fontName=_font_reg, textColor=colors.HexColor("#3b82f6"),
                          leading=12, spaceBefore=2)
                ))

            content_tbl = Table(
                [[c] for c in content_lines],
                colWidths=[W - 0.9 * cm]
            )
            content_tbl.setStyle(TableStyle([
                ("VALIGN",        (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING",   (0, 0), (-1, -1), 0),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
                ("TOPPADDING",    (0, 0), (-1, -1), 1),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]))

            card = Table(
                [[num_cell, content_tbl]],
                colWidths=[0.75 * cm, W - 0.75 * cm]
            )
            card.setStyle(TableStyle([
                ("VALIGN",        (0, 0), (-1, -1), "TOP"),
                ("BACKGROUND",    (0, 0), (-1, -1), colors.white),
                ("BOX",           (0, 0), (-1, -1), 0.5, C_BORDER),
                ("LEFTPADDING",   (1, 0), (1, 0), 10),
                ("RIGHTPADDING",  (1, 0), (1, 0), 8),
                ("TOPPADDING",    (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]))
            story.append(card)
            story.append(Spacer(1, 0.2 * cm))

        story.append(Spacer(1, 0.4 * cm))

    # ── Build ────────────────────────────────────────────────────────────────
    try:
        doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"PDF olusturulamadi: {err}")

    pdf_bytes = buf.getvalue()
    safe_tag  = "".join(c for c in tag_name if c.isascii() and (c.isalnum() or c in " _-"))[:30].strip()
    filename  = f"haberajani_{safe_tag}_{datetime.now().strftime('%Y%m%d')}.pdf".replace(" ", "_")
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
        }
    )


# ─── Bulk Delete by Source Type ─────────────────────────────────────────────

@router.delete("/bulk/by-source-type")
def bulk_delete_by_source_type(
    source_type: SourceType = Query(..., description="Silinecek haber kaynak tipi"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Belirtilen kaynak tipine ait tüm haberleri toplu siler.
    Yalnızca oturum açmış kullanıcının haberleri silinir.
    """
    q = db.query(NewsItem).filter(
        NewsItem.user_id == current_user.id,
        NewsItem.source_type == source_type
    )
    deleted_count = q.count()
    q.delete(synchronize_session=False)
    db.commit()
    return {"deleted": deleted_count, "source_type": source_type.value}
