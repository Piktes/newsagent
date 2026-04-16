"""
Haberajani - Tags Router
Tag CRUD with color and language settings.
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
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

    tag = Tag(
        name=data.name,
        color=data.color,
        language=data.language,
        user_id=current_user.id
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    background_tasks.add_task(scan_for_user_tag, current_user.id, tag.id)
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

    if data.name is not None:
        tag.name = data.name
    if data.color is not None:
        tag.color = data.color
    if data.language is not None:
        tag.language = data.language

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
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == current_user.id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Etiket bulunamadı")

    background_tasks.add_task(scan_for_user_tag, current_user.id, tag.id)
    return {"message": "Tarama arka planda başlatıldı."}

@router.post("/scan-all", status_code=202)
def scan_all_user_tags(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    tags = db.query(Tag).filter(Tag.user_id == current_user.id).all()
    for tag in tags:
        background_tasks.add_task(scan_for_user_tag, current_user.id, tag.id)
    return {"message": f"{len(tags)} etiket için tarama başlatıldı."}
