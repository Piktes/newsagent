"""
Haberajani - Main Application
FastAPI app with CORS, lifespan, and router registration.
"""
import sys
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import traceback as _tb

# Add backend dir to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import init_db, SessionLocal
from auth import seed_super_admin
from scheduler import start_scheduler, stop_scheduler

from routers.users import router as users_router
from routers.tags import router as tags_router
from routers.sources import router as sources_router
from routers.news import router as news_router
from routers.notifications import router as notifications_router
from routers.admin import router as admin_router
from routers.lists import router as lists_router
from routers.feedback import router as feedback_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown events."""
    import asyncio
    import notification_bus
    notification_bus.set_loop(asyncio.get_event_loop())

    # Startup
    print("[*] Haberajani baslatiliyor...")
    init_db()
    print("[OK] Veritabani hazir")

    # Seed super admin
    db = SessionLocal()
    try:
        seed_super_admin(db)
    finally:
        db.close()

    # Start scheduler
    start_scheduler()

    yield

    # Shutdown
    stop_scheduler()
    print("[*] Haberajani kapatiliyor...")


app = FastAPI(
    title="Haberajani",
    description="Sosyal Medya Haber Ajanı API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS - Allow frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:5174",
        "http://10.30.40.189",
        "https://haberajani.meb.gov.tr",
        "http://haberajani.meb.gov.tr",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "Content-Length"],
)

# Register routers
app.include_router(users_router)
app.include_router(tags_router)
app.include_router(sources_router)
app.include_router(news_router)
app.include_router(notifications_router)
app.include_router(admin_router)
app.include_router(lists_router)
app.include_router(feedback_router)


class ErrorLogMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            response = await call_next(request)
            if response.status_code >= 500:
                from error_logger import log_error
                log_error(
                    message=f"HTTP {response.status_code}",
                    path=str(request.url.path),
                    method=request.method,
                    level="error",
                )
            return response
        except Exception as exc:
            from error_logger import log_error
            log_error(
                message=f"{type(exc).__name__}: {exc}",
                details=_tb.format_exc(),
                path=str(request.url.path),
                method=request.method,
                level="critical",
            )
            raise


app.add_middleware(ErrorLogMiddleware)


@app.get("/")
def root():
    return {"message": "Haberajani API çalışıyor", "version": "1.0.0"}


@app.get("/health")
def health():
    return {"status": "ok"}
