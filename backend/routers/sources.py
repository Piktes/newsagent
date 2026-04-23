"""
Haberajani - Sources Router
News source CRUD with API quota tracking.
"""
from fastapi import APIRouter, Depends, HTTPException, Query
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
        if q.last_reset:
            last_reset_aware = q.last_reset if q.last_reset.tzinfo else q.last_reset.replace(tzinfo=timezone.utc)
            if (now - last_reset_aware).days >= 1:
                q.daily_used = 0
                q.last_reset = now
    db.commit()
    return quotas


# ─── Twitter Account Verify ──────────────────────────────

@router.get("/twitter/verify")
def verify_twitter_account(
    handle: str,
    current_user: User = Depends(get_current_user)
):
    """Check if a Twitter/X account is public and accessible."""
    from engines.twitter_engine import TwitterEngine
    engine = TwitterEngine()
    try:
        return engine.verify_account(handle)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── YouTube Channel Verify ──────────────────────────────

@router.get("/youtube/verify")
def verify_youtube_channel(
    url: str,
    current_user: User = Depends(get_current_user)
):
    """Check if a YouTube channel is accessible via RSS (no API key needed)."""
    from engines.youtube_engine import YoutubeEngine
    engine = YoutubeEngine()
    try:
        result = engine.verify_channel(url)
        if not result.get('exists'):
            raise HTTPException(status_code=400, detail=result.get('error', 'Kanal doğrulanamadı'))
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


# ─── Twitter Trends ──────────────────────────────────────

@router.get("/twitter/trends")
def get_twitter_trends(
    woeid: int = Query(23424969, description="WOEID (23424969=Türkiye, 1=Dünya geneli)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Current trending topics for a location via X API v2.
    Also marks which of the user's tags match a trend.
    Requires X API Basic tier.
    """
    from engines.twitter_engine import TwitterEngine
    from models import Tag
    engine = TwitterEngine()
    raw = engine.get_trends(woeid)

    if raw is None:
        raw = []

    # Normalize helper (reuse same logic as engine)
    def _norm(s):
        return (s.lower()
                .replace("ı", "i").replace("ş", "s").replace("ç", "c")
                .replace("ğ", "g").replace("ö", "o").replace("ü", "u")
                .replace("#", "").replace(" ", ""))

    user_tags = db.query(Tag).filter(Tag.user_id == current_user.id).all()

    trends = []
    for trend in raw:
        name = trend.get("trend_name", "")
        name_norm = _norm(name)
        matching = [
            t.name for t in user_tags
            if _norm(t.name) in name_norm or name_norm in _norm(t.name)
        ]
        trends.append({
            "trend_name": name,
            "tweet_count": trend.get("tweet_count"),
            "matching_tags": matching,
        })

    return {"trends": trends, "woeid": woeid, "count": len(trends)}


def _get_default_limit(source_type: SourceType) -> int:
    limits = {
        SourceType.TWITTER: 100,
        SourceType.YOUTUBE: 200,
        SourceType.NEWSAPI: 100,
        SourceType.RSS: 9999,
        SourceType.WEB: 9999,
    }
    return limits.get(source_type, 100)
