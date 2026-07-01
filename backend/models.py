"""
Haberajani - Database Models
All SQLAlchemy models for the application.
"""
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Date, Text, ForeignKey, Enum as SqlEnum, Float, UniqueConstraint
)
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
import enum

from database import Base


# ─── Enums ────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    SUPER_ADMIN = "super_admin"
    ADMIN = "admin"
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


class TicketType(str, enum.Enum):
    BUG = "bug"
    SUGGESTION = "suggestion"
    QUESTION = "question"
    OTHER = "other"


class TicketStatus(str, enum.Enum):
    PENDING = "pending"
    ANSWERED = "answered"
    RESOLVED = "resolved"


# ─── Models ───────────────────────────────────────────────

class Department(Base):
    __tablename__ = "departments"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(200), nullable=False)
    parent_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    sort_order = Column(Integer, default=0)

    parent = relationship("Department", remote_side="Department.id", backref="children")
    users = relationship("User", back_populates="department")


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, nullable=False, index=True)
    email = Column(String(100), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(SqlEnum(UserRole), default=UserRole.USER, nullable=False)
    is_active = Column(Boolean, default=True)
    must_change_password = Column(Boolean, default=False)
    department_id = Column(Integer, ForeignKey("departments.id"), nullable=True)
    phone_number = Column(String(20), nullable=True)           # WhatsApp bülten için (opsiyonel)
    bulletin_subscribed = Column(Boolean, default=True)        # günlük bülten aboneliği (opt-out)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    tags = relationship("Tag", back_populates="user", cascade="all, delete-orphan", foreign_keys="Tag.user_id")
    sources = relationship("NewsSource", back_populates="user", cascade="all, delete-orphan")
    notification_prefs = relationship("NotificationPref", back_populates="user", cascade="all, delete-orphan")
    department = relationship("Department", back_populates="users")


class Tag(Base):
    __tablename__ = "tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    must_phrase = Column(String(500), nullable=True)   # zorunlu arama ifadesi
    match_mode = Column(String(10), default='phrase')  # 'phrase' = tam ifade | 'all_words' = tüm kelimeler (sıra önemsiz)
    context_keywords = Column(Text, nullable=True)     # JSON: ["Bakan","Eğitim"]
    context_ops = Column(Text, nullable=True)          # JSON: kelimeler arası bağlaçlar ["and","or"] (n-1 adet)
    context_oper = Column(String(10), default='or')    # 'off' = SERBEST | eski etiketler için fallback ('and'/'or')
    color = Column(String(7), default="#3B82F6")
    language = Column(SqlEnum(Language), default=Language.BOTH)
    is_breaking = Column(Boolean, default=False)
    breaking_paused = Column(Boolean, default=False)   # super_admin tarafindan gecici durdurma (is_breaking'den bagimsiz)
    scan_interval_minutes = Column(Integer, default=30)
    last_breaking_scan = Column(DateTime, nullable=True)
    last_scan_items_found = Column(Integer, nullable=True)
    is_published = Column(Boolean, default=False)
    published_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    published_at = Column(DateTime, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Relationships
    user = relationship("User", back_populates="tags", foreign_keys=[user_id])
    published_by = relationship("User", foreign_keys=[published_by_id])
    news_items = relationship("NewsItem", back_populates="tag", cascade="all, delete-orphan")
    notification_prefs = relationship("NotificationPref", back_populates="tag", cascade="all, delete-orphan")

    @property
    def published_by_username(self):
        return self.published_by.username if self.published_by else None


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
    __table_args__ = (UniqueConstraint('url_hash', 'tag_id', name='uq_news_url_tag'),)

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(500), nullable=False)
    summary = Column(Text)  # first 2-3 sentences
    url = Column(String(1000), nullable=False)
    url_hash = Column(String(64), nullable=False, index=True)
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
    is_trending = Column(Boolean, default=False, nullable=True)
    retweet_count = Column(Integer, nullable=True)
    like_count = Column(Integer, nullable=True)
    source_id = Column(Integer, ForeignKey("news_sources.id", ondelete="SET NULL"), nullable=True)  # özel kaynaktan geldiyse
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    # Relationships
    tag = relationship("Tag", back_populates="news_items")
    custom_source = relationship("NewsSource", foreign_keys=[source_id])

    @property
    def source_custom_name(self):
        return self.custom_source.name if self.custom_source else None


class TagNewsMatch(Base):
    """Etiket <-> paylaşımlı haber eşleşmesi (M:N). Aşama A/B: NewsItem artık
    tek bir etikete kilitli değil — aynı haberi eşleştiren birden fazla etiket
    (farklı kullanıcılara ait olsa bile) bu tablo üzerinden ilişkilendirilir.
    Bir etiket silindiğinde sadece buradaki satırlar silinir, NewsItem kalır."""
    __tablename__ = "tag_news_matches"
    __table_args__ = (UniqueConstraint('tag_id', 'news_item_id', name='uq_tag_news_match'),)

    id = Column(Integer, primary_key=True, index=True)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False)
    news_item_id = Column(Integer, ForeignKey("news_items.id", ondelete="CASCADE"), nullable=False)
    matched_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    source_type = Column(SqlEnum(SourceType), nullable=True)  # eslesme anindaki kaynak turu (bilgi amacli)

    tag = relationship("Tag")
    news_item = relationship("NewsItem")


class NotificationPref(Base):
    __tablename__ = "notification_prefs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    tag_id = Column(Integer, ForeignKey("tags.id", ondelete="CASCADE"), nullable=False)
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


class EventRegistryUsageLog(Base):
    __tablename__ = "er_usage_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    username = Column(String(100), nullable=True)
    action = Column(String(200), nullable=False)
    tokens_used = Column(Integer, default=1)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class XUsageLog(Base):
    __tablename__ = "x_usage_logs"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    username = Column(String(100), nullable=True)
    action = Column(String(200), nullable=False)
    kind = Column(String(20), default="other")   # search | account | trends | verify | other
    requests_used = Column(Integer, default=1)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class XCallQuota(Base):
    """X cagri kotasi — X bunu API'den vermedigi icin elle yonetilir (yalniz super_admin).
    'used' = reset_at'ten beri x_usage_logs'taki cagrilarin toplami."""
    __tablename__ = "x_call_quota"

    id = Column(Integer, primary_key=True, index=True)
    total_quota = Column(Integer, default=0)              # super_admin'in girdigi toplam cagri kotasi
    reset_at = Column(DateTime, nullable=True)            # son sifirlama; used bundan itibaren sayilir
    updated_by = Column(String(100), nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


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
    list_id = Column(Integer, ForeignKey("favorite_lists.id", ondelete="CASCADE"), nullable=False)
    news_id = Column(Integer, ForeignKey("news_items.id", ondelete="CASCADE"), nullable=False)
    added_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    fav_list = relationship("FavoriteList", back_populates="items")
    news_item = relationship("NewsItem")


class FeedbackTicket(Base):
    __tablename__ = "feedback_tickets"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    type = Column(SqlEnum(TicketType), default=TicketType.BUG)
    subject = Column(String(200), nullable=False)
    description = Column(Text, nullable=False)
    status = Column(SqlEnum(TicketStatus), default=TicketStatus.PENDING)
    admin_response = Column(Text, nullable=True)
    attachments = Column(Text, nullable=True)  # JSON array of saved filenames
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime, nullable=True)

    user = relationship("User")


class Bulletin(Base):
    """Günlük bülten. Her yayınlanmış etiket için 09:00'da taslak oluşur; admin onaylayınca gönderilir."""
    __tablename__ = "bulletins"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, nullable=False, index=True)
    tag_ids = Column(Text, nullable=False)                 # JSON: [1,2,...]
    title = Column(String(300), nullable=True)
    status = Column(String(20), default="draft")           # draft | approved | sent | failed
    excluded_news_ids = Column(Text, nullable=True)        # JSON: önizlemede çıkarılan haber id'leri
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    approved_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    sent_at = Column(DateTime, nullable=True)

    approved_by = relationship("User", foreign_keys=[approved_by_id])
    deliveries = relationship("BulletinDelivery", back_populates="bulletin", cascade="all, delete-orphan")


class BulletinDelivery(Base):
    """Bülten teslimat kaydı — kime, hangi kanaldan, ne zaman, başarılı mı."""
    __tablename__ = "bulletin_deliveries"

    id = Column(Integer, primary_key=True, index=True)
    bulletin_id = Column(Integer, ForeignKey("bulletins.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    email = Column(String(200), nullable=True)
    channel = Column(String(20), default="email")          # email | whatsapp
    status = Column(String(20), default="sent")            # sent | failed
    error = Column(Text, nullable=True)
    sent_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    bulletin = relationship("Bulletin", back_populates="deliveries")
    user = relationship("User")


class ErrorLog(Base):
    __tablename__ = "error_logs"

    id = Column(Integer, primary_key=True, index=True)
    level = Column(String(10), default="error")
    path = Column(String(500), nullable=True)
    method = Column(String(10), nullable=True)
    message = Column(Text, nullable=False)
    details = Column(Text, nullable=True)
    user_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))


class SmtpSettings(Base):
    __tablename__ = "smtp_settings"

    id = Column(Integer, primary_key=True, index=True)
    host = Column(String(200))
    port = Column(Integer, default=587)
    username = Column(String(200))
    password = Column(String(500))
    from_email = Column(String(200))
    is_active = Column(Boolean, default=False)


# ─── Global Search (Event Registry) ──────────────────────

class GlobalTag(Base):
    __tablename__ = "global_tags"

    id                = Column(Integer, primary_key=True, index=True)
    user_id           = Column(Integer, ForeignKey("users.id"), nullable=False)
    name              = Column(String(200), nullable=False)  # görünen ad: "Bakan Yusuf TEKİN"
    must_phrase       = Column(String(500), nullable=True)   # zorunlu ifade: "Yusuf Tekin"
    context_keywords  = Column(Text, nullable=True)          # JSON: ["Bakan","Eğitim"] — en az biri
    query_en          = Column(String(500), nullable=True)   # must_phrase'in İngilizce çevirisi (otomatik)
    search_type       = Column(String(20), default="articles")
    lang_filter       = Column(Text, nullable=True)          # JSON: ["eng","deu"] — null = tümü
    country_filter    = Column(Text, nullable=True)          # JSON: ["US","GB"] — null = tümü
    created_at        = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user     = relationship("User")
    searches = relationship("GlobalSearch", back_populates="tag", cascade="all, delete-orphan")


class GlobalSearch(Base):
    __tablename__ = "global_searches"

    id             = Column(Integer, primary_key=True, index=True)
    user_id        = Column(Integer, ForeignKey("users.id"), nullable=False)
    query_text     = Column(String(500), nullable=False)       # kullanıcının girdiği orijinal metin
    query_translated = Column(String(500), nullable=True)      # İngilizceye çevrilmiş hali
    lang_detected  = Column(String(10), nullable=True)         # tr, en, de ...
    date_range_days = Column(Integer, default=30)              # kaç günlük arama
    searched_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    event_count    = Column(Integer, default=0)
    article_count  = Column(Integer, default=0)
    tokens_used    = Column(Integer, default=0)

    tag_id   = Column(Integer, ForeignKey("global_tags.id"), nullable=True)

    user     = relationship("User")
    tag      = relationship("GlobalTag", back_populates="searches")
    events   = relationship("GlobalEvent",   back_populates="search", cascade="all, delete-orphan")
    articles = relationship("GlobalArticle", back_populates="search", cascade="all, delete-orphan")


class GlobalEvent(Base):
    __tablename__ = "global_events"

    id              = Column(Integer, primary_key=True, index=True)
    search_id       = Column(Integer, ForeignKey("global_searches.id"), nullable=False)
    event_uri       = Column(String(200), nullable=True)
    title           = Column(String(500), nullable=False)
    summary         = Column(Text, nullable=True)
    event_date      = Column(String(20), nullable=True)        # "2026-04-20"
    sentiment       = Column(Float, nullable=True)             # -1.0 ile 1.0 arası
    article_count   = Column(Integer, default=0)
    source_countries = Column(Text, nullable=True)             # JSON: ["US","GB","DE"]
    sources         = Column(Text, nullable=True)              # JSON: ["BBC","Reuters"]
    concepts        = Column(Text, nullable=True)              # JSON: ["Yusuf Tekin","Turkey"]
    categories      = Column(Text, nullable=True)              # JSON: ["Education","Politics"]
    image_url       = Column(String(1000), nullable=True)

    search   = relationship("GlobalSearch", back_populates="events")
    articles = relationship("GlobalArticle", back_populates="event", cascade="all, delete-orphan")


class GlobalArticle(Base):
    __tablename__ = "global_articles"

    id           = Column(Integer, primary_key=True, index=True)
    search_id    = Column(Integer, ForeignKey("global_searches.id"), nullable=False)
    event_id     = Column(Integer, ForeignKey("global_events.id"), nullable=True)
    article_uri  = Column(String(200), nullable=True)
    title        = Column(String(500), nullable=False)
    body         = Column(Text, nullable=True)
    source_name  = Column(String(200), nullable=True)
    source_url   = Column(String(1000), nullable=True)
    url          = Column(String(1000), nullable=True)
    published_at = Column(String(30), nullable=True)
    sentiment    = Column(Float, nullable=True)
    language     = Column(String(10), nullable=True)
    image_url    = Column(String(1000), nullable=True)

    search = relationship("GlobalSearch", back_populates="articles")
    event  = relationship("GlobalEvent",  back_populates="articles")


class UserNewsState(Base):
    """Per-user read/favorite/note state for shared published news items."""
    __tablename__ = "user_news_states"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    news_item_id = Column(Integer, ForeignKey("news_items.id", ondelete="CASCADE"), primary_key=True)
    is_read = Column(Boolean, default=False)
    is_favorite = Column(Boolean, default=False)
    user_note = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")
    news_item = relationship("NewsItem")


class NewsHide(Base):
    """Super admin hides a specific news item from a user or entire department."""
    __tablename__ = "news_hides"

    id = Column(Integer, primary_key=True, index=True)
    news_item_id = Column(Integer, ForeignKey("news_items.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=True)
    department_id = Column(Integer, ForeignKey("departments.id", ondelete="CASCADE"), nullable=True)
    hidden_by_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    hidden_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    news_item = relationship("NewsItem")
    target_user = relationship("User", foreign_keys=[user_id])
    hidden_by = relationship("User", foreign_keys=[hidden_by_id])
    department = relationship("Department")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id         = Column(Integer, primary_key=True, index=True)
    token      = Column(String(128), unique=True, nullable=False, index=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    used       = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    user = relationship("User")
