"""
Meejahse - Admin Router
Dashboard stats, SMTP settings, scan logs (admin only).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List

from database import get_db
from models import (
    User, Tag, NewsSource, NewsItem, ScanLog, SmtpSettings, ApiQuota
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
