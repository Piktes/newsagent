"""
Haberajani - Admin Router
Dashboard stats, SMTP settings, scan logs (admin only).
"""
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List
from datetime import datetime, timezone, timedelta
import subprocess
from pathlib import Path

from database import get_db
from models import (
    User, Tag, NewsSource, NewsItem, ScanLog, SmtpSettings, ApiQuota,
    EventRegistryUsageLog, XUsageLog, XCallQuota, ErrorLog
)
from schemas import (
    DashboardStats, SmtpSettingsUpdate, SmtpSettingsResponse,
    ScanLogResponse, ApiQuotaResponse, ErrorLogResponse
)
from auth import require_admin, require_super_admin

router = APIRouter(prefix="/api/admin", tags=["Admin"])

REPO_ROOT = Path(__file__).resolve().parent.parent.parent


@router.get("/version")
def get_version(admin: User = Depends(require_admin)):
    """Sunucuda calisan kodun son commit'lerini gosterir (deploy dogrulama icin)."""
    commits, error = [], None
    try:
        result = subprocess.run(
            # safe.directory: repo sahibi ile servisi calistiran kullanici farkli
            # olabilir (deploy.sh farkli kullanicilarla chown/calisma yapabiliyor);
            # bu, sunucuda elle "git config --global --add safe.directory" gerekmeden
            # git'in "dubious ownership" guvenlik hatasini bypass eder.
            ["git", "-c", f"safe.directory={REPO_ROOT}", "log", "-15",
             "--date=iso-strict", "--format=%h|%ad|%s"],
            cwd=str(REPO_ROOT), capture_output=True, text=True, timeout=5,
        )
        if result.returncode != 0:
            error = result.stderr.strip()
        else:
            for line in result.stdout.strip().splitlines():
                parts = line.split("|", 2)
                if len(parts) == 3:
                    commits.append({"hash": parts[0], "date": parts[1], "message": parts[2]})
    except Exception as e:
        error = str(e)
    return {"commits": commits, "error": error}


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
        db.query(Tag, User.username, User.email, User.is_active)
        .join(User, User.id == Tag.user_id)
        .filter(Tag.is_breaking == True)
        .order_by(User.username, Tag.scan_interval_minutes)
        .all()
    )
    automations = [
        {
            "tag_id": a.Tag.id,
            "tag_name": a.Tag.name,
            "tag_color": a.Tag.color,
            "is_breaking": a.Tag.is_breaking,
            "breaking_paused": a.Tag.breaking_paused,
            "scan_interval_minutes": a.Tag.scan_interval_minutes,
            "owner": a.username,
            "owner_email": a.email,
            "owner_active": a.is_active,
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


@router.patch("/breaking-tags/{tag_id}/pause")
def pause_breaking_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Etiket bulunamadı")
    tag.breaking_paused = True
    db.commit()
    return {"ok": True, "breaking_paused": True}


@router.patch("/breaking-tags/{tag_id}/unpause")
def unpause_breaking_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    tag = db.query(Tag).filter(Tag.id == tag_id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Etiket bulunamadı")
    tag.breaking_paused = False
    db.commit()
    return {"ok": True, "breaking_paused": False}


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


# ─── Kullanici bazinda kullanim ozeti (pasta grafik) ─────

def _usage_by_user(db, model, amount_col, days):
    """Verilen kullanim-log modelini son `days` gun icin kullaniciya gore ozetler."""
    since = datetime.now(timezone.utc) - timedelta(days=max(days, 1))
    rows = (
        db.query(
            model.username.label("username"),
            func.coalesce(func.sum(amount_col), 0).label("amount"),
            func.count(model.id).label("calls"),
        )
        .filter(model.created_at >= since)
        .group_by(model.username)
        .order_by(func.sum(amount_col).desc())
        .all()
    )
    total = sum(int(r.amount) for r in rows)
    users = [
        {
            "username": r.username or "sistem",
            "requests": int(r.amount),
            "calls": int(r.calls),
            "pct": round(int(r.amount) / total * 100, 1) if total > 0 else 0,
        }
        for r in rows
    ]
    return {"total": total, "users": users}


@router.get("/er-usage-by-user")
def er_usage_by_user(
    response: Response,
    days: int = 90,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    response.headers["Cache-Control"] = "no-store"
    return _usage_by_user(db, EventRegistryUsageLog, EventRegistryUsageLog.tokens_used, days)


@router.get("/x-usage-by-user")
def x_usage_by_user(
    response: Response,
    days: int = 90,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    response.headers["Cache-Control"] = "no-store"
    return _usage_by_user(db, XUsageLog, XUsageLog.requests_used, days)


@router.get("/x-usage-by-kind")
def x_usage_by_kind(
    response: Response,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    """X cagrilarini turune gore ozetler (trend / genel arama / hesap aramasi / dogrulama).
    Cagri kotasi sayaci ile ayni pencere (son reset'ten beri)."""
    response.headers["Cache-Control"] = "no-store"
    quota = db.query(XCallQuota).first()
    q = db.query(
        XUsageLog.kind.label("kind"),
        func.coalesce(func.sum(XUsageLog.requests_used), 0).label("cnt"),
    ).group_by(XUsageLog.kind)
    if quota and quota.reset_at:
        q = q.filter(XUsageLog.created_at >= quota.reset_at)
    rows = q.all()
    total = sum(int(r.cnt) for r in rows)
    kinds = [
        {"kind": r.kind or "other", "count": int(r.cnt),
         "pct": round(int(r.cnt) / total * 100, 1) if total > 0 else 0}
        for r in rows
    ]
    kinds.sort(key=lambda x: -x["count"])
    return {"total": total, "kinds": kinds}


# ─── X (Twitter) API Usage ───────────────────────────────

@router.get("/x-usage")
def get_x_usage(
    response: Response,
    days: int = 7,
    admin: User = Depends(require_admin)
):
    response.headers["Cache-Control"] = "no-store"
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

        # X'in usage/tweets ucundan GELEN GERCEK alanlar:
        #  - project_cap   : aylik post-cekme tavani (cap_reset_day'de sifirlanir)
        #  - project_usage : bu donemdeki kullanim
        #  - daily_*       : son N gunun gunluk gercek kullanimi
        project_cap = int(data.get("project_cap", 0) or 0)
        project_usage = int(data.get("project_usage", 0) or 0)
        cap_reset_day = data.get("cap_reset_day")
        daily = data.get("daily_project_usage", {}).get("usage", [])
        window_used = sum(int(d.get("usage", 0) or 0) for d in daily)  # secili penceredeki gercek toplam

        # GERCEK kredi durumu: usage/tweets on-odemeli krediyi VERMIYOR.
        # Yalnizca gercek bir arama denemesi soyluyor: 402 => krediler tukendi.
        credits_depleted = None
        try:
            probe = requests.get(
                "https://api.x.com/2/tweets/search/recent",
                headers={"Authorization": f"Bearer {X_BEARER_TOKEN}"},
                params={"query": "the", "max_results": 10},
                timeout=8,
            )
            if probe.status_code == 402:
                credits_depleted = True
            elif probe.status_code == 200:
                credits_depleted = False
        except Exception:
            pass

        return {
            "project_cap": project_cap,                           # GERCEK: X aylik post tavani
            "project_usage": project_usage,                       # GERCEK: bu donem kullanim
            "remaining": max(project_cap - project_usage, 0),
            "used_pct": round(project_usage / project_cap * 100, 1) if project_cap else 0,
            "cap_reset_day": cap_reset_day,                       # tavan her ay bu gun sifirlanir
            "daily_usage": daily,                                 # GERCEK gunluk kirilim
            "window_used": window_used,                           # GERCEK: secili penceredeki toplam istek
            "cost_per_request": 0.005,
            "window_cost": round(window_used * 0.005, 4),
            "credits_depleted": credits_depleted,                # GERCEK kredi durumu (402 ile)
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"X API erişilemedi: {e}")


# ─── X Cagri Kotasi (elle yonetilen) ─────────────────────
# X cagri/istek sayisini API'den vermedigi icin, super_admin toplam kotayi
# girer; her X cagrisi x_usage_logs'a dustugu icin sayac otomatik isler.

class XCallQuotaUpdate(BaseModel):
    total_quota: int
    reset: bool = False


def _x_calls_used(db, quota) -> int:
    q = db.query(func.coalesce(func.sum(XUsageLog.requests_used), 0))
    if quota and quota.reset_at:
        q = q.filter(XUsageLog.created_at >= quota.reset_at)
    return int(q.scalar() or 0)


def _x_quota_payload(db, quota) -> dict:
    total = quota.total_quota or 0
    used = _x_calls_used(db, quota)
    return {
        "total_quota": total,
        "used": used,
        "remaining": max(total - used, 0),
        "used_pct": round(used / total * 100, 1) if total > 0 else 0,
        "reset_at": quota.reset_at.isoformat() if quota.reset_at else None,
        "updated_by": quota.updated_by,
        "updated_at": quota.updated_at.isoformat() if quota.updated_at else None,
    }


def _get_or_create_quota(db) -> XCallQuota:
    quota = db.query(XCallQuota).first()
    if not quota:
        quota = XCallQuota(total_quota=0, updated_at=datetime.now(timezone.utc))
        db.add(quota)
        db.commit()
        db.refresh(quota)
    return quota


@router.get("/x-call-quota")
def get_x_call_quota(
    response: Response,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    response.headers["Cache-Control"] = "no-store"
    return _x_quota_payload(db, _get_or_create_quota(db))


@router.put("/x-call-quota")
def set_x_call_quota(
    payload: XCallQuotaUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    quota = _get_or_create_quota(db)
    quota.total_quota = max(payload.total_quota, 0)
    if payload.reset:
        quota.reset_at = datetime.now(timezone.utc)
    quota.updated_by = admin.username
    quota.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(quota)
    return _x_quota_payload(db, quota)


@router.post("/x-call-quota/reset")
def reset_x_call_quota(
    db: Session = Depends(get_db),
    admin: User = Depends(require_super_admin),
):
    quota = _get_or_create_quota(db)
    quota.reset_at = datetime.now(timezone.utc)
    quota.updated_by = admin.username
    quota.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(quota)
    return _x_quota_payload(db, quota)


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
