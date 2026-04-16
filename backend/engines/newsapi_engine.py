"""
Haberajani - NewsAPI Engine
Search news via NewsAPI.org (requires API key).
"""
import requests
from typing import List

from engines.base import BaseNewsEngine, NewsResult


class NewsApiEngine(BaseNewsEngine):
    """Search news using NewsAPI.org. Requires API key."""

    BASE_URL = "https://newsapi.org/v2/everything"

    def search(self, query: str, language: str = "tr", max_results: int = 20) -> List[NewsResult]:
        if not self.api_key:
            return []

        results = []
        try:
            lang = "tr" if language == "tr" else "en"
            params = {
                "q": self.exact_query(query),
                "language": lang,
                "sortBy": "publishedAt",
                "pageSize": min(max_results, 100),
                "apiKey": self.api_key
            }

            response = requests.get(self.BASE_URL, params=params, timeout=15)
            response.raise_for_status()
            data = response.json()

            for article in data.get("articles", []):
                results.append(NewsResult(
                    title=article.get("title", ""),
                    url=article.get("url", ""),
                    summary=article.get("description", "")[:300] if article.get("description") else None,
                    source_name=article.get("source", {}).get("name", "NewsAPI"),
                    thumbnail=article.get("urlToImage"),
                    published_at=article.get("publishedAt")
                ))
        except Exception as e:
            print(f"[NewsAPI Engine] Hata: {e}")

        return results

    def get_engine_name(self) -> str:
        return "newsapi"
