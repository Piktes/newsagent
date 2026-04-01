"""
Meejahse - Scheduler
APScheduler-based news scanning with retry, duplicate detection, and logging.
"""
import hashlib
import time
from datetime import datetime, timezone
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session

from database import SessionLocal
from models import (
    Tag, NewsSource, NewsItem, ScanLog, ApiQuota,
    SourceType, ScanStatus, Language
)
from engines.rss_engine import RssEngine
from engines.twitter_engine import TwitterEngine
from engines.youtube_engine import YoutubeEngine
from engines.web_engine import WebEngine
from engines.newsapi_engine import NewsApiEngine
from engines.instagram_engine import InstagramEngine
from engines.eksisozluk_engine import EksiSozlukEngine
from engines.sentiment_engine import analyze_sentiment

scheduler = BackgroundScheduler()

MAX_RETRIES = 3


def _get_engine(source: NewsSource):
    """Get the appropriate engine for a news source."""
    engine_map = {
        SourceType.RSS: RssEngine,
        SourceType.TWITTER: TwitterEngine,
        SourceType.YOUTUBE: YoutubeEngine,
        SourceType.WEB: WebEngine,
        SourceType.NEWSAPI: NewsApiEngine,
    }
    engine_class = engine_map.get(source.type)
    if engine_class:
        return engine_class(api_key=source.api_key)
    return None


def _url_hash(url: str) -> str:
    """Generate a hash for duplicate detection."""
    return hashlib.sha256(url.encode()).hexdigest()


def _get_language_code(lang: Language) -> str:
    if lang == Language.TR:
        return "tr"
    elif lang == Language.GLOBAL:
        return "en"
    return "tr"  # default


def normalize_turkish(text: str) -> str:
    if not text:
        return ""
    transMap = {"I": "ı", "İ": "i", "Ş": "ş", "Ç": "ç", "Ğ": "ğ", "Ö": "ö", "Ü": "ü"}
    for k, v in transMap.items():
        text = text.replace(k, v)
    return text.lower()


def scan_for_user_tag(user_id: int, tag_id: int, source_id: Optional[int] = None):
    """Scan news for a specific user's tag from all their sources."""
    db: Session = SessionLocal()
    try:
        tag = db.query(Tag).filter(Tag.id == tag_id).first()
        if not tag:
            return

        # Get user's active sources
        if source_id:
            sources = db.query(NewsSource).filter(
                NewsSource.id == source_id,
                NewsSource.user_id == user_id,
                NewsSource.is_active == True
            ).all()
        else:
            sources = db.query(NewsSource).filter(
                NewsSource.user_id == user_id,
                NewsSource.is_active == True
            ).all()

        # If no custom sources, use all free engines (no API key needed)
        if not sources:
            # Google News RSS (primary)
            _scan_with_engine(db, RssEngine(), tag, user_id, None)
            # YouTube (no API key needed)
            _scan_with_engine(db, YoutubeEngine(), tag, user_id, None)
            # Web News via DuckDuckGo (no API key needed)
            _scan_with_engine(db, WebEngine(), tag, user_id, None)
            # Twitter/X via DuckDuckGo (no API key needed)
            _scan_with_engine(db, TwitterEngine(), tag, user_id, None)
            # Instagram via DuckDuckGo (no API key needed)
            _scan_with_engine(db, InstagramEngine(), tag, user_id, None)
            # Ekşi Sözlük via DuckDuckGo (no API key needed)
            _scan_with_engine(db, EksiSozlukEngine(), tag, user_id, None)
            return

        for source in sources:
            engine = _get_engine(source)
            if engine:
                _scan_with_engine(db, engine, tag, user_id, source)

    except Exception as e:
        print(f"[Scheduler] Genel hata: {e}")
    finally:
        db.close()


def _scan_with_engine(db: Session, engine, tag: Tag, user_id: int, source: Optional[NewsSource]):
    """Run a scan with retry mechanism and logging."""
    start_time = time.time()
    items_found = 0
    error_msg = None
    status = ScanStatus.SUCCESS

    languages = []
    if tag.language in (Language.TR, Language.BOTH):
        languages.append("tr")
    if tag.language in (Language.GLOBAL, Language.BOTH):
        languages.append("en")

    for attempt in range(1, MAX_RETRIES + 1):
        try:
            for lang in languages:
                # Check API quota
                if source and source.api_key:
                    quota = db.query(ApiQuota).filter(
                        ApiQuota.source_type == source.type,
                        ApiQuota.user_id == user_id
                    ).first()
                    if quota:
                        now = datetime.now(timezone.utc)
                        if quota.last_reset and (now - quota.last_reset).days >= 1:
                            quota.daily_used = 0
                            quota.last_reset = now
                        if quota.daily_used >= quota.daily_limit:
                            print(f"[Scheduler] API kota aşıldı: {source.type.value}")
                            status = ScanStatus.PARTIAL
                            error_msg = "API kota aşıldı"
                            continue

                if source and source.type == SourceType.RSS and source.url:
                    results = engine.parse_custom_feed(source.url)
                else:
                    results = engine.search(tag.name, language=lang)

                for r in results:
                    # Relevance check: exact phrase must appear in title or summary
                    tag_phrase = normalize_turkish(tag.name)
                    title_lower = normalize_turkish(r.title)
                    summary_lower = normalize_turkish(r.summary)
                    if tag_phrase not in title_lower and tag_phrase not in summary_lower:
                        continue

                    url_h = _url_hash(r.url)
                    # Duplicate detection
                    existing = db.query(NewsItem).filter(NewsItem.url_hash == url_h).first()
                    if existing:
                        continue

                    published = None
                    if r.published_at:
                        try:
                            published = datetime.fromisoformat(r.published_at.replace("Z", "+00:00"))
                        except Exception:
                            pass

                    # Determine source type from engine when no custom source
                    if source:
                        s_type = source.type
                    else:
                        engine_name = engine.get_engine_name()
                        type_map = {
                            "rss": SourceType.RSS,
                            "youtube": SourceType.YOUTUBE,
                            "web": SourceType.WEB,
                            "twitter": SourceType.TWITTER,
                            "newsapi": SourceType.NEWSAPI,
                            "instagram": SourceType.INSTAGRAM,
                            "eksisozluk": SourceType.EKSISOZLUK,
                        }
                        s_type = type_map.get(engine_name, SourceType.RSS)

                    # Sentiment analysis on summary or title
                    sentiment_text = r.summary or r.title or ""
                    s_label, s_score = analyze_sentiment(sentiment_text)

                    news_item = NewsItem(
                        title=r.title,
                        summary=r.summary,
                        url=r.url,
                        url_hash=url_h,
                        source_name=r.source_name,
                        source_type=s_type,
                        thumbnail=r.thumbnail,
                        published_at=published,
                        source_url=r.source_url,
                        sentiment=s_label,
                        sentiment_score=s_score,
                        tag_id=tag.id,
                        user_id=user_id
                    )
                    db.add(news_item)
                    items_found += 1

                    # Update API quota
                    if source and source.api_key:
                        quota = db.query(ApiQuota).filter(
                            ApiQuota.source_type == source.type,
                            ApiQuota.user_id == user_id
                        ).first()
                        if quota:
                            quota.daily_used += 1

                db.commit()

            # Success - break retry loop
            break

        except Exception as e:
            error_msg = str(e)
            if attempt < MAX_RETRIES:
                wait = 2 ** attempt  # exponential backoff
                print(f"[Scheduler] Deneme {attempt}/{MAX_RETRIES} başarısız, {wait}s bekleniyor: {e}")
                time.sleep(wait)
            else:
                status = ScanStatus.FAILED
                print(f"[Scheduler] Tüm denemeler başarısız: {e}")

    # Log the scan
    duration = time.time() - start_time
    log = ScanLog(
        source_id=source.id if source else 0,
        status=status,
        error_message=error_msg,
        items_found=items_found,
        duration_seconds=round(duration, 2)
    )
    db.add(log)
    db.commit()

    if items_found > 0:
        print(f"[Scheduler] ✅ {tag.name}: {items_found} yeni haber bulundu")


def scan_all_users():
    """Main scheduled job: Scan all tags for all users."""
    db: Session = SessionLocal()
    try:
        tags = db.query(Tag).all()
        for tag in tags:
            scan_for_user_tag(tag.user_id, tag.id)
    except Exception as e:
        print(f"[Scheduler] Toplu tarama hatası: {e}")
    finally:
        db.close()


def start_scheduler():
    """Start the APScheduler with configured intervals."""
    # Hourly scan for all users
    scheduler.add_job(scan_all_users, 'interval', hours=1, id='hourly_scan', replace_existing=True)

    # Also run an initial scan 30 seconds after startup
    scheduler.add_job(
        scan_all_users, 'interval', seconds=30, id='initial_scan',
        replace_existing=True, max_instances=1
    )

    scheduler.start()
    print("📡 Scheduler başlatıldı (saatlik tarama aktif)")


def stop_scheduler():
    """Stop the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        print("📡 Scheduler durduruldu")
