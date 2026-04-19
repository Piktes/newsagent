"""
Haberajani - Favorite Lists Router
User-created custom lists for organizing favorite news items.
"""
from typing import List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import desc
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import FavoriteList, FavoriteListItem, NewsItem, Tag, User
from schemas import FavoriteListCreate, FavoriteListRename, FavoriteListResponse, NewsItemResponse

router = APIRouter(prefix="/api/lists", tags=["Lists"])


@router.get("/", response_model=List[FavoriteListResponse])
def get_lists(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lists = db.query(FavoriteList).filter(FavoriteList.user_id == current_user.id).order_by(FavoriteList.created_at).all()
    result = []
    for lst in lists:
        item_count = db.query(FavoriteListItem).filter(FavoriteListItem.list_id == lst.id).count()
        result.append(FavoriteListResponse(id=lst.id, name=lst.name, item_count=item_count, created_at=lst.created_at))
    return result


@router.post("/", response_model=FavoriteListResponse)
def create_list(data: FavoriteListCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lst = FavoriteList(name=data.name, user_id=current_user.id)
    db.add(lst)
    db.commit()
    db.refresh(lst)
    return FavoriteListResponse(id=lst.id, name=lst.name, item_count=0, created_at=lst.created_at)


@router.put("/{list_id}", response_model=FavoriteListResponse)
def rename_list(list_id: int, data: FavoriteListRename, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lst = db.query(FavoriteList).filter(FavoriteList.id == list_id, FavoriteList.user_id == current_user.id).first()
    if not lst:
        raise HTTPException(status_code=404, detail="Liste bulunamadı")
    lst.name = data.name
    db.commit()
    db.refresh(lst)
    item_count = db.query(FavoriteListItem).filter(FavoriteListItem.list_id == lst.id).count()
    return FavoriteListResponse(id=lst.id, name=lst.name, item_count=item_count, created_at=lst.created_at)


@router.delete("/{list_id}")
def delete_list(list_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lst = db.query(FavoriteList).filter(FavoriteList.id == list_id, FavoriteList.user_id == current_user.id).first()
    if not lst:
        raise HTTPException(status_code=404, detail="Liste bulunamadı")
    db.delete(lst)
    db.commit()
    return {"ok": True}


@router.get("/for-news/{news_id}")
def get_lists_for_news(news_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Returns which list IDs contain a given news item."""
    items = db.query(FavoriteListItem).join(FavoriteList).filter(
        FavoriteListItem.news_id == news_id,
        FavoriteList.user_id == current_user.id
    ).all()
    return {"list_ids": [i.list_id for i in items]}


@router.post("/{list_id}/items/{news_id}")
def add_to_list(list_id: int, news_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    lst = db.query(FavoriteList).filter(FavoriteList.id == list_id, FavoriteList.user_id == current_user.id).first()
    if not lst:
        raise HTTPException(status_code=404, detail="Liste bulunamadı")
    news = db.query(NewsItem).filter(NewsItem.id == news_id, NewsItem.user_id == current_user.id).first()
    if not news:
        raise HTTPException(status_code=404, detail="Haber bulunamadı")
    existing = db.query(FavoriteListItem).filter(
        FavoriteListItem.list_id == list_id, FavoriteListItem.news_id == news_id
    ).first()
    if not existing:
        db.add(FavoriteListItem(list_id=list_id, news_id=news_id))
        db.commit()
    return {"ok": True}


@router.delete("/{list_id}/items/{news_id}")
def remove_from_list(list_id: int, news_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    item = db.query(FavoriteListItem).join(FavoriteList).filter(
        FavoriteListItem.list_id == list_id,
        FavoriteListItem.news_id == news_id,
        FavoriteList.user_id == current_user.id
    ).first()
    if item:
        db.delete(item)
        db.commit()
    return {"ok": True}


@router.get("/{list_id}/items", response_model=List[NewsItemResponse])
def get_list_items(
    list_id: int,
    tag_id: Optional[int] = None,
    sentiment: Optional[str] = Query(None),
    query: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    sort_order: str = Query("desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    lst = db.query(FavoriteList).filter(FavoriteList.id == list_id, FavoriteList.user_id == current_user.id).first()
    if not lst:
        raise HTTPException(status_code=404, detail="Liste bulunamadı")

    q = db.query(NewsItem).join(
        FavoriteListItem, FavoriteListItem.news_id == NewsItem.id
    ).filter(
        FavoriteListItem.list_id == list_id,
        NewsItem.user_id == current_user.id,
        NewsItem.is_hidden == False
    )
    if tag_id:
        q = q.filter(NewsItem.tag_id == tag_id)
    if sentiment:
        q = q.filter(NewsItem.sentiment == sentiment)
    if query:
        search = f"%{query}%"
        from sqlalchemy import or_
        q = q.filter(or_(NewsItem.title.ilike(search), NewsItem.summary.ilike(search)))
    if date_from:
        q = q.filter(NewsItem.published_at >= date_from)
    if date_to:
        q = q.filter(NewsItem.published_at <= date_to)

    from sqlalchemy import asc
    order_fn = asc if sort_order == "asc" else desc
    items = q.order_by(order_fn(NewsItem.published_at)).offset((page - 1) * page_size).limit(page_size).all()

    result = []
    for item in items:
        resp = NewsItemResponse.model_validate(item)
        tag = db.query(Tag).filter(Tag.id == item.tag_id).first()
        if tag:
            resp.tag_name = tag.name
            resp.tag_color = tag.color
        result.append(resp)
    return result
