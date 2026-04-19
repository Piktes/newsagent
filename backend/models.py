"""
Haberajani - Database Models
All SQLAlchemy models for the application.
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Enum as SqlEnum, Float
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum

from database import Base


# ─── Enums ────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    USER = "user"


class SourceType(str, enum.Enum):
    RSS = "rss"
    TWITTER = "twitter"
    YOUTUBE = "youtube"
    WEB = "web"
    NEWSAPI = "newsapi"
    INSTAGRAM = "instagram"
    EKSISOZLUK = "eksisozluk"


class Language(str, enum.Enum):
    TR = "tr"
    GLOBAL = "global"
    BOTH = "both"


class NotificationMethod(str, enum.Enum):
    EMAIL = "email"
    BROWSER = "browser"
    BOTH = "both"


class ScanStatus(str, enum.Enum):
    SUCCESS = "success"
    FAILED = "failed"
    PARTIAL = "partial"


# ─── Models ───────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(SqlEnum(UserRole), default=UserRole.USER, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    tags = relationship("Tag", back_populates="user", cascade="all, delete-orphan")
    sources = relationship("NewsSource", back_populates="user", cascade="all, delete-orphan")
    notification_prefs = relationship("NotificationPref", back_populates="user", cascade="all, delete-orphan")


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    color = Column(String(7), default="#3B82F6")  # hex color
    language = Column(SqlEnum(Language), default=Language.BOTH)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("User", back_populates="tags")
    news_items = relationship("NewsItem", back_populates="tag", cascade="all, delete-orphan")
    notification_prefs = relationship("NotificationPref", back_populates="tag", cascade="all, delete-orphan")


class NewsSource(Base):
    __tablename__ = "news_sources"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    type = Column(SqlEnum(SourceType), nullable=False)
    url = Column(String(500))
    api_key = Column(String(500))  # encrypted in production
    is_default = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("User", back_populates="sources")
    scan_logs = relationship("ScanLog", back_populates="source", cascade="all, delete-orphan")


class NewsItem(Base):
    __tablename__ = "news_items"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    summary = Column(Text)  # first 2-3 sentences
    url = Column(String(1000), nullable=False)
    url_hash = Column(String(64), unique=True, nullable=False, index=True)
    source_name = Column(String(100))
    source_type = Column(SqlEnum(SourceType))
    thumbnail = Column(String(1000))
    published_at = Column(DateTime)
    fetched_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    is_read = Column(Boolean, default=False)
    is_favorite = Column(Boolean, default=False)
    user_note = Column(Text)  # user's personal note
    source_url = Column(String(1000))  # original source URL (not Google News redirect)
    sentiment = Column(String(20))  # positive, neutral, negative
    sentiment_score = Column(Float)  # confidence score 0.0 - 1.0
    is_hidden = Column(Boolean, default=False)
    tag_id = Column(Integer, ForeignKey("tags.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Relationships
    tag = relationship("Tag", back_populates="news_items")


class NotificationPref(Base):
    __tablename__ = "notification_prefs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    tag_id = Column(Integer, ForeignKey("tags.id"), nullable=False)
    method = Column(SqlEnum(NotificationMethod), default=NotificationMethod.BROWSER)
    enabled = Column(Boolean, default=True)

    # Relationships
    user = relationship("User", back_populates="notification_prefs")
    tag = relationship("Tag", back_populates="notification_prefs")


class ApiQuota(Base):
    __tablename__ = "api_quotas"

    id = Column(Integer, primary_key=True, index=True)
    source_type = Column(SqlEnum(SourceType), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    daily_limit = Column(Integer, default=100)
    daily_used = Column(Integer, default=0)
    last_reset = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class ScanLog(Base):
    __tablename__ = "scan_logs"

    id = Column(Integer, primary_key=True, index=True)
    source_id = Column(Integer, ForeignKey("news_sources.id"), nullable=False)
    status = Column(SqlEnum(ScanStatus), nullable=False)
    error_message = Column(Text)
    items_found = Column(Integer, default=0)
    duration_seconds = Column(Float)
    scanned_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    source = relationship("NewsSource", back_populates="scan_logs")


class FavoriteList(Base):
    __tablename__ = "favorite_lists"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    items = relationship("FavoriteListItem", back_populates="fav_list", cascade="all, delete-orphan")


class FavoriteListItem(Base):
    __tablename__ = "favorite_list_items"

    id = Column(Integer, primary_key=True, index=True)
    list_id = Column(Integer, ForeignKey("favorite_lists.id"), nullable=False)
    news_id = Column(Integer, ForeignKey("news_items.id"), nullable=False)
    added_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    fav_list = relationship("FavoriteList", back_populates="items")
    news_item = relationship("NewsItem")


class SmtpSettings(Base):
    __tablename__ = "smtp_settings"

    id = Column(Integer, primary_key=True, index=True)
    host = Column(String(200))
    port = Column(Integer, default=587)
    username = Column(String(200))
    password = Column(String(500))
    from_email = Column(String(200))
    is_active = Column(Boolean, default=False)
