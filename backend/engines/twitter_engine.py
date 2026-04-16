"""
Haberajani - Twitter/X Engine
Search Twitter/X posts using duckduckgo_search (no API key needed)
or Tweepy (with API key).
"""
from typing import List, Optional

from engines.base import BaseNewsEngine, NewsResult


class TwitterEngine(BaseNewsEngine):
    """Search Twitter/X. Works without API key using DuckDuckGo search."""

    def search(self, query: str, language: str = "tr", max_results: int = 10) -> List[NewsResult]:
        if self.api_key:
            return self._search_api(query, language, max_results)
        return self._search_free(query, language, max_results)

    def _search_free(self, query: str, language: str = "tr", max_results: int = 10) -> List[NewsResult]:
        """Search Twitter/X without API key using DuckDuckGo."""
        results = []
        try:
            from ddgs import DDGS

            region = "tr-tr" if language == "tr" else "wt-wt"
            exact_q = self.exact_query(query)

            with DDGS() as ddgs:
                search_results = ddgs.text(
                    query=f"{exact_q} twitter",
                    region=region,
                    max_results=max_results
                )

                for item in search_results:
                    url = item.get("href", "")
                    if "x.com" not in url and "twitter.com" not in url:
                        continue

                    title = item.get("title", "")
                    body = item.get("body", "")

                    # Extract username from URL
                    username = "X"
                    parts = url.split("/")
                    for i, p in enumerate(parts):
                        if p in ("x.com", "twitter.com") and i + 1 < len(parts):
                            username = f"@{parts[i + 1]}"
                            break

                    results.append(NewsResult(
                        title=title,
                        url=url,
                        summary=body[:300] if body else None,
                        source_name=f"𝕏 {username}",
                        published_at=None,
                        source_url=url
                    ))
        except Exception as e:
            print(f"[Twitter Free Search] Hata: {e}")

        return results

    def _search_api(self, query: str, language: str = "tr", max_results: int = 10) -> List[NewsResult]:
        """Search Twitter via Tweepy (requires API key)."""
        results = []
        try:
            import tweepy

            parts = self.api_key.split(":")
            if len(parts) < 3:
                print("[Twitter] API key format: api_key:api_secret:bearer_token")
                return []

            client = tweepy.Client(bearer_token=parts[2])
            lang = "tr" if language == "tr" else "en"

            response = client.search_recent_tweets(
                query=f"{self.exact_query(query)} lang:{lang} -is:retweet",
                max_results=min(max_results, 100),
                tweet_fields=["created_at", "author_id", "text"],
                expansions=["author_id"]
            )

            if response.data:
                users = {u.id: u for u in (response.includes.get('users', []))}
                for tweet in response.data:
                    author = users.get(tweet.author_id)
                    username = author.username if author else "unknown"

                    results.append(NewsResult(
                        title=tweet.text[:120],
                        url=f"https://x.com/{username}/status/{tweet.id}",
                        summary=tweet.text,
                        source_name=f"𝕏 @{username}",
                        published_at=tweet.created_at.isoformat() if tweet.created_at else None
                    ))
        except Exception as e:
            print(f"[Twitter API] Hata: {e}")

        return results

    def get_engine_name(self) -> str:
        return "twitter"
