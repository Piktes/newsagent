"""
Meejahse - Web Scraping Engine
Uses duckduckgo_search for reliable results without API key.
"""
from typing import List

from engines.base import BaseNewsEngine, NewsResult


class WebEngine(BaseNewsEngine):
    """Web news search engine using DuckDuckGo search API (no API key needed)."""

    def search(self, query: str, language: str = "tr", max_results: int = 15) -> List[NewsResult]:
        results = []
        try:
            from duckduckgo_search import DDGS

            region = "tr-tr" if language == "tr" else "wt-wt"

            with DDGS() as ddgs:
                exact_q = self.exact_query(query)
                news_results = ddgs.news(
                    keywords=exact_q,
                    region=region,
                    max_results=max_results
                )

                for item in news_results:
                    results.append(NewsResult(
                        title=item.get("title", ""),
                        url=item.get("url", ""),
                        summary=item.get("body", "")[:300] if item.get("body") else None,
                        source_name=f"🌐 {item.get('source', 'Web')}",
                        thumbnail=item.get("image"),
                        published_at=item.get("date"),
                        source_url=item.get("url", "")  # DuckDuckGo gives direct URLs
                    ))
        except Exception as e:
            print(f"[Web Engine] Hata: {e}")

        return results

    def get_engine_name(self) -> str:
        return "web"
