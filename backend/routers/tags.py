"""
Haberajani - Tags Router
Tag CRUD (admin+), publish/unpublish toggle, rol bazlı listeleme.
"""
import json as _json
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Tag, User, UserRole
from schemas import TagCreate, TagUpdate, TagResponse
from auth import get_current_user, require_admin, require_super_admin
from scheduler import scan_for_user_tag

router = APIRouter(prefix="/api/tags", tags=["Tags"])


@router.get("/", response_model=List[TagResponse])
def list_tags(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if current_user.role == UserRole.USER:
        # Kullanıcı rolü: yalnızca yayınlanmış etiketler
        return db.query(Tag).filter(Tag.is_published == True).order_by(Tag.name).all()
    # Admin / Süper Admin: kendi etiketleri
    return db.query(Tag).filter(Tag.user_id == current_user.id).order_by(Tag.name).all()


@router.post("/", response_model=TagResponse, status_code=201)
def create_tag(
    data: TagCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    existing = db.query(Tag).filter(
        Tag.name == data.name, Tag.user_id == current_user.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Bu etiket zaten mevcut")

    tag = Tag(
        name=data.name,
        must_phrase=data.must_phrase or None,
        context_keywords=_json.dumps(data.context_keywords) if data.context_keywords else None,
        context_oper=data.context_oper or "or",
        color=data.color,
        language=data.language,
        is_breaking=data.is_breaking,
        scan_interval_minutes=data.scan_interval_minutes,
        user_id=current_user.id,
    )

    if data.is_published:
        tag.is_published = True
        tag.published_by_id = current_user.id
        tag.published_at = datetime.now(timezone.utc)

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
    current_user: User = Depends(require_admin)
):
    if current_user.role == UserRole.SUPER_ADMIN:
        tag = db.query(Tag).filter(Tag.id == tag_id).first()
    else:
        tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == current_user.id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Etiket bulunamadı")

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
    current_user: User = Depends(require_admin)
):
    if current_user.role == UserRole.SUPER_ADMIN:
        tag = db.query(Tag).filter(Tag.id == tag_id).first()
    else:
        tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == current_user.id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Etiket bulunamadı")

    db.delete(tag)
    db.commit()


# ─── Publish / Unpublish ──────────────────────────────────

@router.patch("/{tag_id}/publish", response_model=TagResponse)
def publish_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Etiket bulunamadı")

    # Sadece etiketi oluşturan admin yayınlayabilir (süper admin hariç)
    if current_user.role != UserRole.SUPER_ADMIN and tag.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Yalnızca etiketi oluşturan admin yayınlayabilir")

    if tag.is_published and tag.published_by_id and tag.published_by_id != current_user.id:
        publisher = db.query(User).filter(User.id == tag.published_by_id).first()
        name = publisher.username if publisher else f"#{tag.published_by_id}"
        raise HTTPException(
            status_code=409,
            detail=f"Bu etiket zaten '{name}' tarafından yayınlanıyor"
        )

    tag.is_published = True
    tag.published_by_id = current_user.id
    tag.published_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(tag)
    return tag


@router.patch("/{tag_id}/unpublish", response_model=TagResponse)
def unpublish_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Etiket bulunamadı")

    # Orijinal yayıncı veya süper admin yayını durdurabilir
    if current_user.role != UserRole.SUPER_ADMIN and tag.published_by_id != current_user.id:
        raise HTTPException(status_code=403, detail="Yalnızca yayıncı admin veya Süper Admin yayını durdurabilir")

    tag.is_published = False
    tag.published_by_id = None
    tag.published_at = None
    db.commit()
    db.refresh(tag)
    return tag


# ─── Manuel Tarama ───────────────────────────────────────

@router.post("/{tag_id}/scan", status_code=202)
def scan_tag_manually(
    tag_id: int,
    background_tasks: BackgroundTasks,
    days_back: int = Query(30, ge=1, le=365),
    source_types: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    if current_user.role == UserRole.SUPER_ADMIN:
        tag = db.query(Tag).filter(Tag.id == tag_id).first()
    else:
        tag = db.query(Tag).filter(Tag.id == tag_id, Tag.user_id == current_user.id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Etiket bulunamadı")

    background_tasks.add_task(scan_for_user_tag, current_user.id, tag.id, None, days_back, source_types or None)
    return {"message": "Tarama arka planda başlatıldı.", "days_back": days_back, "source_types": source_types}


@router.post("/scan-all", status_code=202)
def scan_all_user_tags(
    background_tasks: BackgroundTasks,
    days_back: int = Query(30, ge=1, le=365),
    source_types: Optional[List[str]] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
):
    tags = db.query(Tag).filter(Tag.user_id == current_user.id).all()
    for tag in tags:
        background_tasks.add_task(scan_for_user_tag, current_user.id, tag.id, None, days_back, source_types or None)
    return {"message": f"{len(tags)} etiket için tarama başlatıldı.", "days_back": days_back, "source_types": source_types}
