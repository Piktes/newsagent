"""
Haberajani - Ekşi Sözlük Engine
Search Ekşi Sözlük entries using duckduckgo_search (no API key needed).
"""
from datetime import datetime, timezone
from typing import List

from engines.base import BaseNewsEngine, NewsResult


class EksiSozlukEngine(BaseNewsEngine):
    """Search Ekşi Sözlük entries. Works without API key using DuckDuckGo search."""

    def search(self, query: str, language: str = "tr", max_results: int = 10) -> List[NewsResult]:
        results = []
        try:
            from ddgs import DDGS

            exact_q = self.exact_query(query)

            with DDGS() as ddgs:
                search_results = ddgs.text(
                    query=f"{exact_q} ekşi sözlük",
                    region="tr-tr",
                    max_results=max_results
                )

                for item in search_results:
                    url = item.get("href", "")
                    if "eksisozluk.com" not in url:
                        continue

                    title = item.get("title", "")
                    body = item.get("body", "")

                    results.append(NewsResult(
                        title=title,
                        url=url,
                        summary=body[:300] if body else None,
                        source_name="📖 Ekşi Sözlük",
                        published_at=datetime.now(timezone.utc).isoformat(),
                        source_url=url
                    ))
        except Exception as e:
            print(f"[Ekşi Sözlük Engine] Hata: {e}")

        return results

    def get_engine_name(self) -> str:
        return "eksisozluk"
