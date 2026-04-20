"""
Haberajani - NewsAPI.ai (EventRegistry) Engine
Searches news via eventregistry.org API.
"""
import re
import requests
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from engines.base import BaseNewsEngine, NewsResult

ER_BASE = "https://eventregistry.org/api/v1"
_LANG_MAP = {"tr": "tur", "en": "eng"}


def normalize_query(raw: str) -> str:
    """Trim and collapse internal whitespace. Returns the query unchanged otherwise."""
    return ' '.join(raw.split())


def _log_usage(user_id, username, action, tokens=1):
    try:
        from database import SessionLocal
        from models import EventRegistryUsageLog
        db = SessionLocal()
        try:
            db.add(EventRegistryUsageLog(
                user_id=user_id,
                username=username or "sistem",
                action=action,
                tokens_used=tokens,
            ))
            db.commit()
        finally:
            db.close()
    except Exception:
        pass


class NewsApiEngine(BaseNewsEngine):
    """Search news using NewsAPI.ai (EventRegistry). Requires API key."""

    def __init__(self, api_key=None, user_id=None, username=None):
        super().__init__(api_key)
        self.user_id = user_id
        self.username = username

    def search(self, query: str, language: str = "tr", max_results: int = 20) -> List[NewsResult]:
        if not self.api_key:
            return []

        lang_code = _LANG_MAP.get(language, "tur")
        date_start = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
        phrase = normalize_query(query)

        results = []
        try:
            # getEvents: clusters of related articles — better precision than getArticles
            payload = {
                "apiKey": self.api_key,
                "keyword": phrase,
                "keywordSearchMode": "exact",
                "lang": lang_code,
                "dateStart": date_start,
                "count": min(max_results, 50),
                "resultType": "events",
                "eventsSortBy": "date",
                "eventsSortByAsc": False,
                "includeEventTitle": True,
                "includeEventSummary": True,
                "includeEventImage": True,
                "includeEventArticles": True,
                "eventArticlesCount": 1,
                "includeEventArticlesDuplicates": False,
            }

            resp = requests.post(f"{ER_BASE}/event/getEvents", json=payload, timeout=15)
            resp.raise_for_status()
            data = resp.json()

            events = data.get("events", {}).get("results", [])
            seen_urls: set = set()

            for event in events:
                title = (event.get("title") or {})
                title_text = title.get(lang_code[:3]) or title.get("eng") or next(iter(title.values()), "")
                summary_obj = event.get("summary") or {}
                summary_text = summary_obj.get(lang_code[:3]) or summary_obj.get("eng") or next(iter(summary_obj.values()), "")
                image = event.get("image")

                # Use representative article URL if available
                articles = (event.get("articles") or {}).get("results", [])
                url = articles[0].get("url", "") if articles else ""
                source_name = (articles[0].get("source") or {}).get("title", "NewsAPI.ai") if articles else "NewsAPI.ai"
                published_at = event.get("eventDate") or (articles[0].get("dateTime") if articles else None)

                if not url or not title_text:
                    continue
                if url in seen_urls:
                    continue
                seen_urls.add(url)

                results.append(NewsResult(
                    title=title_text,
                    url=url,
                    summary=summary_text[:300] if summary_text else None,
                    source_name=source_name,
                    thumbnail=image,
                    published_at=published_at,
                ))

            _log_usage(self.user_id, self.username,
                       f'Arama: "{phrase}" ({lang_code}, {len(events)} olay, {len(results)} sonuç)',
                       tokens=1)

        except Exception as e:
            print(f"[NewsAPI.ai Engine] Hata: {e}")

        return results

    def get_engine_name(self) -> str:
        return "newsapi"
