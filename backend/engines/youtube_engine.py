"""
Meejahse - YouTube Engine
Search YouTube videos using duckduckgo_search (no API key needed)
or YouTube Data API v3 (with API key).
"""
from typing import List

from engines.base import BaseNewsEngine, NewsResult


class YoutubeEngine(BaseNewsEngine):
    """Search YouTube videos. Works without API key using DuckDuckGo video search."""

    def search(self, query: str, language: str = "tr", max_results: int = 10) -> List[NewsResult]:
        # If API key provided, use official API
        if self.api_key:
            return self._search_api(query, language, max_results)

        # Otherwise use DuckDuckGo video search (no API key needed)
        return self._search_free(query, language, max_results)

    def _search_free(self, query: str, language: str = "tr", max_results: int = 10) -> List[NewsResult]:
        """Search YouTube videos without API key using DuckDuckGo video search."""
        results = []
        try:
            from duckduckgo_search import DDGS

            region = "tr-tr" if language == "tr" else "wt-wt"

            with DDGS() as ddgs:
                # Search specifically for YouTube videos
                exact_q = self.exact_query(query)
                video_results = ddgs.videos(
                    keywords=f"{exact_q} site:youtube.com",
                    region=region,
                    max_results=max_results
                )

                for item in video_results:
                    url = item.get("content", "")
                    # Only keep YouTube results
                    if "youtube.com" not in url and "youtu.be" not in url:
                        continue

                    # Get publisher/uploader
                    publisher = item.get("publisher", "YouTube")

                    results.append(NewsResult(
                        title=item.get("title", ""),
                        url=url,
                        summary=item.get("description", "")[:300] if item.get("description") else None,
                        source_name=f"▶️ {publisher}",
                        thumbnail=item.get("images", {}).get("large") or item.get("images", {}).get("medium"),
                        published_at=item.get("published"),
                        source_url=url  # YouTube links are direct
                    ))
        except Exception as e:
            print(f"[YouTube Free Search] Hata: {e}")

        return results

    def _search_api(self, query: str, language: str = "tr", max_results: int = 10) -> List[NewsResult]:
        """Search YouTube via official Data API v3 (requires API key)."""
        results = []
        try:
            from googleapiclient.discovery import build

            youtube = build("youtube", "v3", developerKey=self.api_key)
            region = "TR" if language == "tr" else "US"

            response = youtube.search().list(
                q=self.exact_query(query),
                part="snippet",
                maxResults=min(max_results, 50),
                type="video",
                order="date",
                regionCode=region,
                relevanceLanguage=language if language != "global" else "en"
            ).execute()

            for item in response.get("items", []):
                snippet = item["snippet"]
                video_id = item["id"]["videoId"]

                results.append(NewsResult(
                    title=snippet["title"],
                    url=f"https://www.youtube.com/watch?v={video_id}",
                    summary=snippet.get("description", "")[:300],
                    source_name=f"▶️ {snippet.get('channelTitle', 'YouTube')}",
                    thumbnail=snippet.get("thumbnails", {}).get("high", {}).get("url"),
                    published_at=snippet.get("publishedAt"),
                    source_url=f"https://www.youtube.com/watch?v={video_id}"
                ))
        except Exception as e:
            print(f"[YouTube API] Hata: {e}")

        return results

    def get_engine_name(self) -> str:
        return "youtube"
