"""
Haberajani - Sources Router
News source CRUD with API quota tracking.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from datetime import datetime, timezone

from database import get_db
from models import NewsSource, ApiQuota, User, SourceType
from schemas import SourceCreate, SourceUpdate, SourceResponse, ApiQuotaResponse
from auth import get_current_user, require_admin

router = APIRouter(prefix="/api/sources", tags=["News Sources"])


@router.get("/", response_model=List[SourceResponse])
def list_sources(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    sources = db.query(NewsSource).filter(
        NewsSource.user_id == current_user.id
    ).order_by(NewsSource.created_at.desc()).all()

    result = []
    for s in sources:
        resp = SourceResponse.model_validate(s)
        resp.has_api_key = bool(s.api_key)
        result.append(resp)
    return result


@router.post("/", response_model=SourceResponse, status_code=201)
def create_source(
    data: SourceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    source = NewsSource(
        name=data.name,
        type=data.type,
        url=data.url,
        api_key=data.api_key,
        is_default=data.is_default,
        user_id=current_user.id
    )
    db.add(source)
    db.commit()
    db.refresh(source)

    # Create API quota if api_key provided
    if data.api_key:
        quota = ApiQuota(
            source_type=data.type,
            user_id=current_user.id,
            daily_limit=_get_default_limit(data.type),
            daily_used=0
        )
        db.add(quota)
        db.commit()

    resp = SourceResponse.model_validate(source)
    resp.has_api_key = bool(source.api_key)
    return resp


@router.put("/{source_id}", response_model=SourceResponse)
def update_source(
    source_id: int,
    data: SourceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    source = db.query(NewsSource).filter(
        NewsSource.id == source_id, NewsSource.user_id == current_user.id
    ).first()
    if not source:
        raise HTTPException(status_code=404, detail="Kaynak bulunamadı")

    if data.name is not None:
        source.name = data.name
    if data.url is not None:
        source.url = data.url
    if data.api_key is not None:
        source.api_key = data.api_key
    if data.is_active is not None:
        source.is_active = data.is_active

    db.commit()
    db.refresh(source)
    resp = SourceResponse.model_validate(source)
    resp.has_api_key = bool(source.api_key)
    return resp


@router.delete("/{source_id}", status_code=204)
def delete_source(
    source_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    source = db.query(NewsSource).filter(
        NewsSource.id == source_id, NewsSource.user_id == current_user.id
    ).first()
    if not source:
        raise HTTPException(status_code=404, detail="Kaynak bulunamadı")

    db.delete(source)
    db.commit()


# ─── API Quota ────────────────────────────────────────────

@router.get("/quotas", response_model=List[ApiQuotaResponse])
def get_quotas(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    quotas = db.query(ApiQuota).filter(ApiQuota.user_id == current_user.id).all()
    # Auto-reset daily quotas
    now = datetime.now(timezone.utc)
    for q in quotas:
        if q.last_reset and (now - q.last_reset).days >= 1:
            q.daily_used = 0
            q.last_reset = now
    db.commit()
    return quotas


def _get_default_limit(source_type: SourceType) -> int:
    limits = {
        SourceType.TWITTER: 100,
        SourceType.YOUTUBE: 200,
        SourceType.NEWSAPI: 100,
        SourceType.RSS: 9999,
        SourceType.WEB: 9999,
    }
    return limits.get(source_type, 100)
