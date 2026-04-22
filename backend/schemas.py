"""
Haberajani - Pydantic Schemas
Request/Response models for API endpoints.
"""
from pydantic import BaseModel, EmailStr, Field
from typing import Optional, List
from datetime import datetime
from models import UserRole, SourceType, Language, NotificationMethod, ScanStatus


# ─── Auth ─────────────────────────────────────────────────

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: "UserResponse"


# ─── Users ────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: str
    password: str = Field(min_length=6)
    role: UserRole = UserRole.USER


class UserUpdate(BaseModel):
    email: Optional[str] = None
    is_active: Optional[bool] = None
    role: Optional[UserRole] = None


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: UserRole
    is_active: bool
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Tags ─────────────────────────────────────────────────

class TagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    color: str = "#3B82F6"
    language: Language = Language.BOTH
    is_breaking: bool = False
    scan_interval_minutes: int = 30


class TagUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    language: Optional[Language] = None
    is_breaking: Optional[bool] = None
    scan_interval_minutes: Optional[int] = None


class TagResponse(BaseModel):
    id: int
    name: str
    color: str
    language: Language
    is_breaking: bool
    scan_interval_minutes: int
    last_breaking_scan: Optional[datetime] = None
    user_id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── News Sources ────────────────────────────────────────

class SourceCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    type: SourceType
    url: Optional[str] = None
    api_key: Optional[str] = None
    is_default: bool = False


class SourceUpdate(BaseModel):
    name: Optional[str] = None
    url: Optional[str] = None
    api_key: Optional[str] = None
    is_active: Optional[bool] = None


class SourceResponse(BaseModel):
    id: int
    name: str
    type: SourceType
    url: Optional[str]
    has_api_key: bool = False  # don't expose raw key
    is_default: bool
    is_active: bool
    user_id: int
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── News Items ──────────────────────────────────────────

class NewsItemResponse(BaseModel):
    id: int
    title: str
    summary: Optional[str]
    url: str
    source_name: Optional[str]
    source_type: Optional[SourceType]
    thumbnail: Optional[str]
    published_at: Optional[datetime]
    fetched_at: Optional[datetime]
    is_read: bool
    is_favorite: bool
    user_note: Optional[str] = None
    source_url: Optional[str] = None
    sentiment: Optional[str] = None
    sentiment_score: Optional[float] = None
    is_hidden: bool = False
    tag_id: int
    tag_name: Optional[str] = None
    tag_color: Optional[str] = None

    class Config:
        from_attributes = True


class NoteUpdateRequest(BaseModel):
    note: Optional[str] = None


class NewsSearchRequest(BaseModel):
    query: Optional[str] = None
    tag_id: Optional[int] = None
    source_type: Optional[SourceType] = None
    date_from: Optional[datetime] = None
    date_to: Optional[datetime] = None
    is_favorite: Optional[bool] = None
    is_read: Optional[bool] = None
    page: int = 1
    page_size: int = 20


# ─── Notifications ───────────────────────────────────────

class NotificationPrefCreate(BaseModel):
    tag_id: int
    method: NotificationMethod = NotificationMethod.BROWSER
    enabled: bool = True


class NotificationPrefResponse(BaseModel):
    id: int
    tag_id: int
    tag_name: Optional[str] = None
    method: NotificationMethod
    enabled: bool

    class Config:
        from_attributes = True


# ─── SMTP ─────────────────────────────────────────────────

class SmtpSettingsUpdate(BaseModel):
    host: Optional[str] = None
    port: Optional[int] = 587
    username: Optional[str] = None
    password: Optional[str] = None
    from_email: Optional[str] = None
    is_active: Optional[bool] = None


class SmtpSettingsResponse(BaseModel):
    host: Optional[str]
    port: int
    username: Optional[str]
    from_email: Optional[str]
    is_active: bool

    class Config:
        from_attributes = True


# ─── API Quota ────────────────────────────────────────────

class ApiQuotaResponse(BaseModel):
    source_type: SourceType
    daily_limit: int
    daily_used: int
    last_reset: Optional[datetime]

    class Config:
        from_attributes = True


# ─── Scan Log ─────────────────────────────────────────────

class ScanLogResponse(BaseModel):
    id: int
    source_id: int
    status: ScanStatus
    error_message: Optional[str]
    items_found: int
    duration_seconds: Optional[float]
    scanned_at: Optional[datetime]

    class Config:
        from_attributes = True


# ─── Favorite Lists ──────────────────────────────────────

class FavoriteListCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class FavoriteListRename(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class FavoriteListResponse(BaseModel):
    id: int
    name: str
    item_count: int = 0
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ─── Stats ────────────────────────────────────────────────

class DashboardStats(BaseModel):
    total_news: int
    total_unread: int
    total_favorites: int
    total_tags: int
    total_sources: int
    total_users: int
    last_scan: Optional[datetime]
