"""
Haberajani - Admin Router
Dashboard stats, SMTP settings, scan logs (admin only).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List

from database import get_db
from models import (
    User, Tag, NewsSource, NewsItem, ScanLog, SmtpSettings, ApiQuota,
    EventRegistryUsageLog, ErrorLog
)
from schemas import (
    DashboardStats, SmtpSettingsUpdate, SmtpSettingsResponse,
    ScanLogResponse, ApiQuotaResponse, ErrorLogResponse
)
from auth import require_admin

router = APIRouter(prefix="/api/admin", tags=["Admin"])


@router.get("/stats", response_model=DashboardStats)
def dashboard_stats(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    last_scan = db.query(ScanLog).order_by(desc(ScanLog.scanned_at)).first()

    return DashboardStats(
        total_news=db.query(NewsItem).count(),
        total_unread=db.query(NewsItem).filter(NewsItem.is_read == False).count(),
        total_favorites=db.query(NewsItem).filter(NewsItem.is_favorite == True).count(),
        total_tags=db.query(Tag).count(),
        total_sources=db.query(NewsSource).count(),
        total_users=db.query(User).count(),
        last_scan=last_scan.scanned_at if last_scan else None
    )


@router.get("/overview")
def dashboard_overview(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    from sqlalchemy import func

    # Top tags by news count
    tag_counts = (
        db.query(Tag, func.count(NewsItem.id).label("news_count"), User.username, User.email)
        .join(NewsItem, NewsItem.tag_id == Tag.id, isouter=True)
        .join(User, User.id == Tag.user_id)
        .group_by(Tag.id)
        .order_by(desc("news_count"))
        .limit(15)
        .all()
    )
    top_tags = [
        {
            "id": t.Tag.id,
            "name": t.Tag.name,
            "color": t.Tag.color,
            "news_count": t.news_count,
            "owner": t.username,
            "owner_email": t.email,
            "scan_interval_minutes": t.Tag.scan_interval_minutes,
            "is_breaking": t.Tag.is_breaking,
            "last_scan": t.Tag.last_breaking_scan.isoformat() if t.Tag.last_breaking_scan else None,
        }
        for t in tag_counts
    ]

    # All sources with owner
    sources = (
        db.query(NewsSource, User.username, User.email)
        .join(User, User.id == NewsSource.user_id)
        .order_by(NewsSource.created_at.desc())
        .all()
    )
    source_list = [
        {
            "id": s.NewsSource.id,
            "name": s.NewsSource.name,
            "type": s.NewsSource.type.value,
            "url": s.NewsSource.url,
            "is_active": s.NewsSource.is_active,
            "is_default": s.NewsSource.is_default,
            "owner": s.username,
            "owner_email": s.email,
            "created_at": s.NewsSource.created_at.isoformat() if s.NewsSource.created_at else None,
        }
        for s in sources
    ]

    # Automations: all tags with scan config grouped by user
    automations_q = (
        db.query(Tag, User.username, User.email)
        .join(User, User.id == Tag.user_id)
        .order_by(User.username, Tag.scan_interval_minutes)
        .all()
    )
    automations = [
        {
            "tag_id": a.Tag.id,
            "tag_name": a.Tag.name,
            "tag_color": a.Tag.color,
            "is_breaking": a.Tag.is_breaking,
            "scan_interval_minutes": a.Tag.scan_interval_minutes,
            "owner": a.username,
            "owner_email": a.email,
            "last_scan": a.Tag.last_breaking_scan.isoformat() if a.Tag.last_breaking_scan else None,
            "last_count": a.Tag.last_scan_items_found,
        }
        for a in automations_q
    ]

    return {
        "top_tags": top_tags,
        "sources": source_list,
        "automations": automations,
    }


# ─── SMTP Settings ───────────────────────────────────────

@router.get("/smtp", response_model=SmtpSettingsResponse)
def get_smtp(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    settings = db.query(SmtpSettings).first()
    if not settings:
        return SmtpSettingsResponse(
            host=None, port=587, username=None, from_email=None, is_active=False
        )
    return settings


@router.put("/smtp", response_model=SmtpSettingsResponse)
def update_smtp(
    data: SmtpSettingsUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    settings = db.query(SmtpSettings).first()
    if not settings:
        settings = SmtpSettings()
        db.add(settings)

    if data.host is not None:
        settings.host = data.host
    if data.port is not None:
        settings.port = data.port
    if data.username is not None:
        settings.username = data.username
    if data.password is not None:
        settings.password = data.password
    if data.from_email is not None:
        settings.from_email = data.from_email
    if data.is_active is not None:
        settings.is_active = data.is_active

    db.commit()
    db.refresh(settings)
    return settings


# ─── Event Registry Quota ────────────────────────────────

from config import ER_API_KEY, X_BEARER_TOKEN


@router.get("/er-quota")
def get_er_quota(
    admin: User = Depends(require_admin)
):
    import requests
    try:
        res = requests.post(
            "https://eventregistry.org/api/v1/usage",
            json={"apiKey": ER_API_KEY},
            timeout=8,
            verify=False,
        )
        data = res.json()
        total = data.get("availableTokens", 0)
        used = data.get("usedTokens", 0)
        available = max(total - used, 0)
        return {
            "available_tokens": available,
            "used_tokens": used,
            "total_tokens": total,
            "used_pct": round(used / total * 100, 1) if total > 0 else 0,
        }
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"EventRegistry API erişilemedi: {e}")


@router.get("/er-logs")
def list_er_logs(
    page: int = 1,
    page_size: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    q = db.query(EventRegistryUsageLog).order_by(desc(EventRegistryUsageLog.created_at))
    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "items": [
            {
                "id": i.id,
                "username": i.username or "sistem",
                "action": i.action,
                "tokens_used": i.tokens_used,
                "created_at": i.created_at.isoformat() if i.created_at else None,
            }
            for i in items
        ]
    }


@router.delete("/er-logs", status_code=204)
def clear_er_logs(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    db.query(EventRegistryUsageLog).delete()
    db.commit()


# ─── X (Twitter) API Usage ───────────────────────────────

@router.get("/x-usage")
def get_x_usage(
    days: int = 7,
    admin: User = Depends(require_admin)
):
    if not X_BEARER_TOKEN:
        raise HTTPException(status_code=503, detail="X Bearer Token yapılandırılmamış")
    import requests
    try:
        res = requests.get(
            "https://api.x.com/2/usage/tweets",
            headers={"Authorization": f"Bearer {X_BEARER_TOKEN}"},
            params={"days": min(max(days, 1), 90), "usage.fields": "daily_client_app_usage,daily_project_usage,project_cap"},
            timeout=8,
        )
        if res.status_code != 200:
            # 401 döndürmek frontend'in oturumu kapatmasına neden olacağı için 400 olarak değiştiriyoruz
            status_code = 400 if res.status_code == 401 else res.status_code
            raise HTTPException(status_code=status_code, detail=f"X API yanıtı: {res.text}")
        data = res.json().get("data", {})
        project_cap = int(data.get("project_cap", 0) or 0)
        project_usage = int(data.get("project_usage", 0) or 0)
        daily = data.get("daily_project_usage", {}).get("usage", [])
        
        print("X USAGE TYPES:", type(project_cap), repr(project_cap), type(project_usage), repr(project_usage))
        
        return {
            "project_cap": project_cap,
            "project_usage": project_usage,
            "remaining": max(project_cap - project_usage, 0),
            "used_pct": round(project_usage / project_cap * 100, 1) if project_cap > 0 else 0,
            "daily_usage": daily,
            "cost_per_request": 0.005,
            "estimated_cost": round(project_usage * 0.005, 4),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"X API erişilemedi: {e}")


# ─── Scan Logs ────────────────────────────────────────────

@router.get("/scan-logs", response_model=List[ScanLogResponse])
def list_scan_logs(
    limit: int = 50,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    return db.query(ScanLog).order_by(desc(ScanLog.scanned_at)).limit(limit).all()


@router.delete("/scan-logs", status_code=204)
def clear_scan_logs(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    db.query(ScanLog).delete()
    db.commit()


# ─── Error Logs ───────────────────────────────────────────

@router.get("/error-logs", response_model=List[ErrorLogResponse])
def list_error_logs(
    level: str = None,
    limit: int = 100,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    q = db.query(ErrorLog).order_by(desc(ErrorLog.created_at))
    if level:
        q = q.filter(ErrorLog.level == level)
    return q.limit(limit).all()


@router.delete("/error-logs", status_code=204)
def clear_error_logs(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    db.query(ErrorLog).delete()
    db.commit()


@router.get("/debug-token")
def debug_token():
    from config import X_BEARER_TOKEN
    import os
    env_token = os.environ.get("X_BEARER_TOKEN", "")
    return {
        "config_token": f"{X_BEARER_TOKEN[:10]}... len: {len(X_BEARER_TOKEN)}",
        "env_token": f"{env_token[:10]}... len: {len(env_token)}"
    }
