"""
Haberajani - Tags Router
Tag CRUD with color and language settings.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import Tag, User
from schemas import TagCreate, TagUpdate, TagResponse
from auth import get_current_user
from scheduler import scan_for_user_tag

router = APIRouter(prefix="/api/tags", tags=["Tags"])


@router.get("/", response_model=List[TagResponse])
def list_tags(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(Tag).filter(Tag.user_id == current_user.id).order_by(Tag.name).all()


@router.post("/", response_model=TagResponse, status_code=201)
def create_tag(
    data: TagCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    existing = db.query(Tag).filter(
        Tag.name == data.name, Tag.user_id == current_user.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Bu etiket zaten mevcut")

    import json as _json
    tag = Tag(
        name=data.name,
        must_phrase=data.must_phrase or None,
        context_keywords=_json.dumps(data.context_keywords) if data.context_keywords else None,
        context_oper=data.context_oper or 'or',
        color=data.color,
        language=data.language,
        user_id=current_user.id
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)

    background_tasks.add_task(scan_for_user_tag, current_user.id, tag.id, None, 30)
    return tag


@router.put("/{tag_id}", response_model=TagResponse)
def update_tag(
    tag_id: int,
    data: TagUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == current_user.id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Etiket bulunamadı")

    import json as _json
    if data.name is not None:
        tag.name = data.name
    if data.must_phrase is not None:
        tag.must_phrase = data.must_phrase or None
    if data.context_keywords is not None:
        tag.context_keywords = _json.dumps(data.context_keywords) if data.context_keywords else None
    if data.context_oper is not None:
        tag.context_oper = data.context_oper
    if data.color is not None:
        tag.color = data.color
    if data.language is not None:
        tag.language = data.language
    if data.is_breaking is not None:
        tag.is_breaking = data.is_breaking
    if data.scan_interval_minutes is not None:
        tag.scan_interval_minutes = data.scan_interval_minutes

    db.commit()
    db.refresh(tag)
    return tag


@router.delete("/{tag_id}", status_code=204)
def delete_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == current_user.id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Etiket bulunamadı")

    db.delete(tag)
    db.commit()


@router.post("/{tag_id}/scan", status_code=202)
def scan_tag_manually(
    tag_id: int,
    background_tasks: BackgroundTasks,
    days_back: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == current_user.id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Etiket bulunamadı")

    background_tasks.add_task(scan_for_user_tag, current_user.id, tag.id, None, days_back)
    return {"message": "Tarama arka planda başlatıldı.", "days_back": days_back}

@router.post("/scan-all", status_code=202)
def scan_all_user_tags(
    background_tasks: BackgroundTasks,
    days_back: int = Query(30, ge=1, le=365),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tags = db.query(Tag).filter(Tag.user_id == current_user.id).all()
    for tag in tags:
        background_tasks.add_task(scan_for_user_tag, current_user.id, tag.id, None, days_back)
    return {"message": f"{len(tags)} etiket için tarama başlatıldı.", "days_back": days_back}
