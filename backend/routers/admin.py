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
    EventRegistryUsageLog
)
from schemas import (
    DashboardStats, SmtpSettingsUpdate, SmtpSettingsResponse,
    ScanLogResponse, ApiQuotaResponse
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

from config import ER_API_KEY


@router.get("/er-quota")
def get_er_quota(
    admin: User = Depends(require_admin)
):
    import requests
    try:
        res = requests.post(
            "https://eventregistry.org/api/v1/usage",
            json={"apiKey": ER_API_KEY},
            timeout=8
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
