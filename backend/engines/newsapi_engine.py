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

    def search(
        self,
        query: str,
        language: str = "tr",
        max_results: int = 100,
        days_back: int = 30,
        must_phrase: str = None,
        context_keywords: list = None,
    ) -> List[NewsResult]:
        if not self.api_key:
            return []

        lang_code = _LANG_MAP.get(language, "tur")
        date_start = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%d")

        # must_phrase varsa onu kullan, yoksa tag adını kullan
        search_text = normalize_query(must_phrase if must_phrase else query)
        # Tam ifade olarak gönder — tek öğeli dizi ER'de phrase araması yapar
        keywords = [search_text]

        results = []
        try:
            payload = {
                "apiKey": self.api_key,
                "keyword": keywords,
                "keywordOper": "and",
                "keywordLoc": "title,body",
                "lang": lang_code,
                "dateStart": date_start,
                "count": min(max_results, 100),
                "resultType": "articles",
                "articlesSortBy": "date",
                "articlesSortByAsc": False,
                "includeArticleTitle": True,
                "includeArticleBody": True,
                "includeArticleImage": True,
                "includeArticleEventUri": False,
                "articleBodyLen": -1,
            }

            resp = requests.post(f"{ER_BASE}/article/getArticles", json=payload, timeout=15)
            resp.raise_for_status()
            data = resp.json()

            articles = data.get("articles", {}).get("results", [])
            seen_urls: set = set()

            for article in articles:
                url = article.get("url", "")
                title_text = article.get("title", "")
                summary_text = article.get("body", "") or ""
                image = article.get("image")
                source_name = (article.get("source") or {}).get("title", "NewsAPI.ai")
                published_at = article.get("dateTime")

                if not url or not title_text:
                    continue
                if url in seen_urls:
                    continue
                seen_urls.add(url)

                results.append(NewsResult(
                    title=title_text,
                    url=url,
                    summary=summary_text if summary_text else None,
                    source_name=source_name,
                    thumbnail=image,
                    published_at=published_at,
                ))

            _log_usage(self.user_id, self.username,
                       f'Arama: "{" ".join(keywords)}" ({lang_code}, {len(articles)} makale, {len(results)} sonuç)',
                       tokens=1)

        except Exception as e:
            print(f"[NewsAPI.ai Engine] Hata: {e}")

        return results

    def get_engine_name(self) -> str:
        return "newsapi"
