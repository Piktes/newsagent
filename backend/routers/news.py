"""
Meejahse - News Router
News listing, search, read/favorite toggle, notes, and export.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy import or_, desc, asc
from typing import List, Optional
from datetime import datetime
import csv
import io

from database import get_db
from models import NewsItem, Tag, User, SourceType
from schemas import NewsItemResponse, NoteUpdateRequest
from auth import get_current_user

router = APIRouter(prefix="/api/news", tags=["News"])


@router.get("/", response_model=List[NewsItemResponse])
def list_news(
    tag_id: Optional[int] = None,
    source_type: Optional[SourceType] = None,
    is_favorite: Optional[bool] = None,
    is_read: Optional[bool] = None,
    sentiment: Optional[str] = Query(None, regex="^(positive|neutral|negative)$"),
    query: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    sort_order: Optional[str] = Query("desc", regex="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = db.query(NewsItem).filter(NewsItem.user_id == current_user.id)

    if tag_id:
        q = q.filter(NewsItem.tag_id == tag_id)
    if source_type:
        q = q.filter(NewsItem.source_type == source_type)
    if is_favorite is not None:
        q = q.filter(NewsItem.is_favorite == is_favorite)
    if is_read is not None:
        q = q.filter(NewsItem.is_read == is_read)
    if sentiment:
        q = q.filter(NewsItem.sentiment == sentiment)
    if query:
        search = f"%{query}%"
        q = q.filter(or_(
            NewsItem.title.ilike(search),
            NewsItem.summary.ilike(search),
            NewsItem.user_note.ilike(search)
        ))
    if date_from:
        q = q.filter(NewsItem.published_at >= date_from)
    if date_to:
        q = q.filter(NewsItem.published_at <= date_to)

    # Sort order
    order_func = asc if sort_order == "asc" else desc
    items = q.order_by(order_func(NewsItem.published_at)).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    # Enrich with tag info
    result = []
    for item in items:
        resp = NewsItemResponse.model_validate(item)
        tag = db.query(Tag).filter(Tag.id == item.tag_id).first()
        if tag:
            resp.tag_name = tag.name
            resp.tag_color = tag.color
        result.append(resp)

    return result


@router.get("/count")
def news_count(
    tag_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from datetime import date, time as dtime
    from sqlalchemy import func

    base = db.query(NewsItem).filter(NewsItem.user_id == current_user.id)
    if tag_id:
        base = base.filter(NewsItem.tag_id == tag_id)

    total = base.count()
    unread = base.filter(NewsItem.is_read == False).count()
    favorites = base.filter(NewsItem.is_favorite == True).count()

    # Today's start (UTC)
    today_start = datetime.combine(date.today(), dtime.min)

    # Per-source-type breakdown
    source_counts = {}
    for st in [SourceType.WEB, SourceType.YOUTUBE, SourceType.TWITTER,
               SourceType.INSTAGRAM, SourceType.EKSISOZLUK, SourceType.RSS]:
        count = base.filter(NewsItem.source_type == st).count()
        today = base.filter(
            NewsItem.source_type == st,
            NewsItem.fetched_at >= today_start
        ).count()
        source_counts[st.value] = {"count": count, "today": today}

    # Total today
    total_today = base.filter(NewsItem.fetched_at >= today_start).count()

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
        raise HTTPException(status_code=404, detail="Haber bulunamadı")

    resp = NewsItemResponse.model_validate(item)
    tag = db.query(Tag).filter(Tag.id == item.tag_id).first()
    if tag:
        resp.tag_name = tag.name
        resp.tag_color = tag.color
    return resp


@router.put("/{news_id}/read")
def toggle_read(
    news_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(NewsItem).filter(
        NewsItem.id == news_id, NewsItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Haber bulunamadı")

    item.is_read = not item.is_read
    db.commit()
    return {"is_read": item.is_read}


@router.put("/{news_id}/favorite")
def toggle_favorite(
    news_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(NewsItem).filter(
        NewsItem.id == news_id, NewsItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Haber bulunamadı")

    item.is_favorite = not item.is_favorite
    db.commit()
    return {"is_favorite": item.is_favorite}


@router.put("/{news_id}/note")
def update_note(
    news_id: int,
    data: NoteUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(NewsItem).filter(
        NewsItem.id == news_id, NewsItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Haber bulunamadı")

    item.user_note = data.note
    db.commit()
    return {"user_note": item.user_note}


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

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Başlık", "Özet", "URL", "Kaynak URL", "Kaynak", "Tarih", "Etiket", "Not", "Okundu", "Favori"])

    for item in items:
        tag = db.query(Tag).filter(Tag.id == item.tag_id).first()
        writer.writerow([
            item.title,
            item.summary or "",
            item.url,
            item.source_url or "",
            item.source_name or "",
            item.published_at.isoformat() if item.published_at else "",
            tag.name if tag else "",
            item.user_note or "",
            "Evet" if item.is_read else "Hayır",
            "Evet" if item.is_favorite else "Hayır",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=meejahse_haberler.csv"}
    )
