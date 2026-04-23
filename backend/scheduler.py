"""
Haberajani - Scheduler
APScheduler-based news scanning with retry, duplicate detection, and logging.
"""
import hashlib
import html as _html
import re
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


def _get_engine(source: NewsSource, user_id: int = None, username: str = None):
    """Get the appropriate engine for a news source."""
    if source.type == SourceType.NEWSAPI:
        return NewsApiEngine(api_key=source.api_key, user_id=user_id, username=username)
    engine_map = {
        SourceType.RSS: RssEngine,
        SourceType.TWITTER: TwitterEngine,
        SourceType.YOUTUBE: YoutubeEngine,
        SourceType.WEB: WebEngine,
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


def _clean_for_sentiment(text: str) -> str:
    """Strip HTML tags and decode entities before passing text to the BERT model."""
    if not text:
        return ""
    text = re.sub(r'<[^>]+>', ' ', text)
    text = _html.unescape(text)
    text = text.replace('\xa0', ' ')
    return ' '.join(text.split())


def normalize_turkish(text: str) -> str:
    if not text:
        return ""
    transMap = {"I": "ı", "İ": "i", "Ş": "ş", "Ç": "ç", "Ğ": "ğ", "Ö": "ö", "Ü": "ü"}
    for k, v in transMap.items():
        text = text.replace(k, v)
    return text.lower()


def scan_for_user_tag(user_id: int, tag_id: int, source_id: Optional[int] = None, days_back: int = 30) -> int:
    """Scan news for a specific user's tag. Returns total items found."""
    db: Session = SessionLocal()
    total_found = 0
    try:
        tag = db.query(Tag).filter(Tag.id == tag_id).first()
        if not tag:
            return 0

        from models import User
        user = db.query(User).filter(User.id == user_id).first()
        username = user.username if user else None

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

        # Check if tag is currently trending on Twitter/X (Turkey, WOEID=23424969)
        tag_is_trending = False
        try:
            _tw_check = TwitterEngine()
            tag_is_trending, trend_vol = _tw_check.is_trending_topic(tag.name)
            if tag_is_trending:
                print(f"[Scheduler] 🔥 '{tag.name}' Türkiye trendlerinde! ({trend_vol:,} tweet)")
        except Exception:
            pass

        # Always run NewsAPI.ai (EventRegistry) as system engine
        from config import ER_API_KEY
        if ER_API_KEY:
            er_engine = NewsApiEngine(api_key=ER_API_KEY, user_id=user_id, username=username)
            total_found += _scan_with_engine(db, er_engine, tag, user_id, None, days_back=days_back, is_trending=tag_is_trending)

        # If no custom sources, also use free engines
        if not sources:
            total_found += _scan_with_engine(db, RssEngine(), tag, user_id, None, is_trending=tag_is_trending)
            total_found += _scan_with_engine(db, YoutubeEngine(), tag, user_id, None, is_trending=tag_is_trending)
            total_found += _scan_with_engine(db, WebEngine(), tag, user_id, None, is_trending=tag_is_trending)
            total_found += _scan_with_engine(db, TwitterEngine(), tag, user_id, None, is_trending=tag_is_trending)
        else:
            for source in sources:
                engine = _get_engine(source, user_id=user_id, username=username)
                if engine:
                    total_found += _scan_with_engine(db, engine, tag, user_id, source, is_trending=tag_is_trending)

        # Son dakika olmayan etiketlerin son tarama zamanı ve haber sayısını güncelle
        if not tag.is_breaking:
            now_ts = datetime.now(timezone.utc).replace(tzinfo=None)
            tag_to_update = db.query(Tag).filter(Tag.id == tag_id).first()
            if tag_to_update:
                tag_to_update.last_breaking_scan = now_ts
                tag_to_update.last_scan_items_found = total_found
                db.commit()

    except Exception as e:
        print(f"[Scheduler] Genel hata: {e}")
    finally:
        db.close()
    return total_found


def _scan_with_engine(db: Session, engine, tag: Tag, user_id: int, source: Optional[NewsSource], days_back: int = 30, is_trending: bool = False) -> int:
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
                        now = datetime.now(timezone.utc).replace(tzinfo=None)
                        if quota.last_reset:
                            last_reset = quota.last_reset.replace(tzinfo=None) if quota.last_reset.tzinfo else quota.last_reset
                            if (now - last_reset).days >= 1:
                                quota.daily_used = 0
                                quota.last_reset = now
                        if quota.daily_used >= quota.daily_limit:
                            print(f"[Scheduler] API kota aşıldı: {source.type.value}")
                            status = ScanStatus.PARTIAL
                            error_msg = "API kota aşıldı"
                            continue

                src_label = f"{source.type.value}:{source.url[:40]}" if source else engine.get_engine_name()
                print(f"[Scheduler] Taranıyor: {src_label} — etiket='{tag.name}' lang={lang}")
                if source and source.type == SourceType.RSS and source.url:
                    results = engine.parse_custom_feed(source.url, max_results=50)
                elif source and source.type == SourceType.TWITTER and source.url:
                    from engines.twitter_engine import TwitterEngine as _TW
                    if isinstance(engine, _TW):
                        results = engine.search_account(source.url, tag.name, language=lang, max_results=20)
                    else:
                        results = engine.search(tag.name, language=lang)
                elif source and source.type == SourceType.YOUTUBE and source.url:
                    from engines.youtube_engine import YoutubeEngine as _YT
                    if isinstance(engine, _YT):
                        results = engine.search_channel(source.url, tag.name, language=lang, max_results=20)
                    else:
                        results = engine.search(tag.name, language=lang)
                else:
                    from engines.newsapi_engine import NewsApiEngine as _ER
                    if isinstance(engine, _ER):
                        results = engine.search(tag.name, language=lang, days_back=days_back)
                    else:
                        results = engine.search(tag.name, language=lang)

                print(f"[Scheduler] {src_label}: {len(results)} sonuç döndü")
                for r in results:
                    # Relevance check: skip for newsapi (EventRegistry handles relevance internally)
                    if engine.get_engine_name() != "newsapi":
                        from engines.newsapi_engine import normalize_query as _nq
                        tag_phrase = normalize_turkish(_nq(tag.name))
                        title_lower = normalize_turkish(r.title or "")
                        summary_lower = normalize_turkish(r.summary or "")
                        if tag_phrase not in title_lower and tag_phrase not in summary_lower:
                            continue

                    url_h = _url_hash(r.url)
                    # Duplicate detection: per tag (same URL can appear under different tags)
                    existing = db.query(NewsItem).filter(NewsItem.url_hash == url_h, NewsItem.tag_id == tag.id).first()
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

                    # Sentiment analysis on summary or title (strip HTML first)
                    sentiment_text = _clean_for_sentiment(r.summary or r.title or "")
                    s_label, s_score = analyze_sentiment(sentiment_text)

                    news_item = NewsItem(
                        title=(r.title or '')[:500],
                        summary=(r.summary or '')[:4000],
                        url=r.url,
                        url_hash=url_h,
                        source_name=r.source_name,
                        source_type=s_type,
                        thumbnail=r.thumbnail,
                        published_at=published,
                        source_url=r.source_url,
                        sentiment=s_label,
                        sentiment_score=s_score,
                        retweet_count=getattr(r, 'retweet_count', None),
                        like_count=getattr(r, 'like_count', None),
                        is_trending=is_trending,
                        tag_id=tag.id,
                        user_id=user_id
                    )
                    try:
                        db.add(news_item)
                        db.commit()
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
                    except Exception:
                        db.rollback()

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
        print(f"[Scheduler] [OK] {tag.name}: {items_found} yeni haber bulundu")
        try:
            import notification_bus
            notification_bus.notify_user_sync(user_id, {
                "type": "new_news",
                "tag": tag.name,
                "count": items_found,
                "is_breaking": bool(tag.is_breaking),
            })
        except Exception:
            pass

    return items_found


def scan_all_users():
    """Main scheduled job: Scan all tags for all users."""
    import notification_bus
    db: Session = SessionLocal()
    try:
        tags = db.query(Tag).all()
        # Group tags by user
        from collections import defaultdict
        user_tags: dict = defaultdict(list)
        for tag in tags:
            user_tags[tag.user_id].append(tag)

        for user_id, user_tag_list in user_tags.items():
            tag_names = [t.name for t in user_tag_list]
            total = len(user_tag_list)
            notification_bus.notify_user_sync(user_id, {
                "type": "scan_started",
                "tags": tag_names,
                "total": total,
            })
            for i, tag in enumerate(user_tag_list):
                scan_for_user_tag(user_id, tag.id)
                notification_bus.notify_user_sync(user_id, {
                    "type": "scan_progress",
                    "completed": i + 1,
                    "total": total,
                    "tag": tag.name,
                })
            notification_bus.notify_user_sync(user_id, {
                "type": "scan_finished",
                "tags": tag_names,
            })
    except Exception as e:
        print(f"[Scheduler] Toplu tarama hatası: {e}")
    finally:
        db.close()


def scan_breaking_tags():
    """Scan breaking news tags that are due based on their scan_interval_minutes."""
    db: Session = SessionLocal()
    try:
        from models import User
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        tags = db.query(Tag).filter(Tag.is_breaking == True).all()
        if not tags:
            return
        for tag in tags:
            interval = tag.scan_interval_minutes or 30
            last = tag.last_breaking_scan
            if last is not None:
                kalan = interval * 60 - (now - last).total_seconds()
                if kalan > 0:
                    print(f"[Son Dakika] '{tag.name}' bekleniyor — {int(kalan//60)}dk {int(kalan%60)}sn kaldı")
                    continue
            if last is None or (now - last).total_seconds() >= interval * 60:
                scan_start = datetime.now(timezone.utc)
                scan_for_user_tag(tag.user_id, tag.id, days_back=1)
                # Gerçek sayıyı DB'den al: bu tarama sırasında eklenen item'lar
                db2: Session = SessionLocal()
                try:
                    from sqlalchemy import func as _func
                    scan_start_naive = scan_start.replace(tzinfo=None)
                    actually_added = db2.query(_func.count(NewsItem.id)).filter(
                        NewsItem.tag_id == tag.id,
                        NewsItem.user_id == tag.user_id,
                        NewsItem.fetched_at >= scan_start_naive,
                    ).scalar() or 0
                    t = db2.query(Tag).filter(Tag.id == tag.id).first()
                    if t:
                        t.last_breaking_scan = now
                        t.last_scan_items_found = actually_added
                        db2.commit()
                        from datetime import timedelta
                        next_run = now + timedelta(minutes=interval)
                        label = f"{actually_added} yeni haber" if actually_added > 0 else "yeni haber yok"
                        print(f"[Son Dakika] '{tag.name}' tarandı ({label}). Sonraki: {next_run.strftime('%H:%M:%S')} ({interval}dk)")
                finally:
                    db2.close()
    except Exception as e:
        print(f"[Scheduler] Son Dakika tarama hatası: {e}")
    finally:
        db.close()


def start_scheduler():
    """Start APScheduler: only breaking news tags are scanned automatically."""
    scheduler.add_job(
        scan_breaking_tags,
        'interval',
        minutes=1,
        id='breaking_scan',
        replace_existing=True,
        max_instances=1
    )
    scheduler.start()
    print("[*] Scheduler başlatıldı: yalnızca Son Dakika etiketleri otomatik taranır")


def stop_scheduler():
    """Stop the scheduler gracefully."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        print("[*] Scheduler durduruldu")
