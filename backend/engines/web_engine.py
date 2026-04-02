"""
Meejahse - Web Scraping Engine
Uses duckduckgo_search for reliable results without API key.
"""
from typing import List

from engines.base import BaseNewsEngine, NewsResult


class WebEngine(BaseNewsEngine):
    """Web news search engine using DuckDuckGo search API (no API key needed)."""

    def search(self, query: str, language: str = "tr", max_results: int = 15) -> List[NewsResult]:
        return self._search_google_news_rss(
            query=query, 
            max_results=max_results, 
            site_filter=None, 
            source_icon="🌐"
        )

    def get_engine_name(self) -> str:
        return "web"
