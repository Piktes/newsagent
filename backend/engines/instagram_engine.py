"""
Meejahse - Instagram Engine
Search Instagram posts using duckduckgo_search (no API key needed).
"""
from typing import List

from engines.base import BaseNewsEngine, NewsResult


class InstagramEngine(BaseNewsEngine):
    """Search Instagram posts. Works without API key using DuckDuckGo search."""

    def search(self, query: str, language: str = "tr", max_results: int = 10) -> List[NewsResult]:
        results = []
        try:
            from duckduckgo_search import DDGS

            region = "tr-tr" if language == "tr" else "wt-wt"
            exact_q = self.exact_query(query)

            with DDGS() as ddgs:
                search_results = ddgs.text(
                    keywords=f"{exact_q} site:instagram.com",
                    region=region,
                    max_results=max_results
                )

                for item in search_results:
                    url = item.get("href", "")
                    if "instagram.com" not in url:
                        continue

                    title = item.get("title", "")
                    body = item.get("body", "")

                    # Relevance check
                    tag_phrase = query.lower()
                    if tag_phrase not in title.lower() and tag_phrase not in body.lower():
                        continue

                    # Extract username from URL
                    username = "Instagram"
                    parts = url.split("/")
                    for i, p in enumerate(parts):
                        if "instagram.com" in p and i + 1 < len(parts):
                            uname = parts[i + 1].split("?")[0]
                            if uname and uname not in ("p", "reel", "stories", "explore"):
                                username = f"@{uname}"
                            break

                    results.append(NewsResult(
                        title=title,
                        url=url,
                        summary=body[:300] if body else None,
                        source_name=f"📸 {username}",
                        published_at=None,
                        source_url=url
                    ))
        except Exception as e:
            print(f"[Instagram Engine] Hata: {e}")

        return results

    def get_engine_name(self) -> str:
        return "instagram"
