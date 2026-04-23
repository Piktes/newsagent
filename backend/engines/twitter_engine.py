"""
Haberajani - Twitter/X Engine
Account-based and keyword search via X API v2 (Bearer Token).
"""
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any

from engines.base import BaseNewsEngine, NewsResult


def _extract_username(url_or_handle: str) -> str:
    """Normalize @handle or twitter.com/x.com URL to plain username."""
    s = url_or_handle.strip()
    for prefix in ("https://x.com/", "https://twitter.com/",
                   "http://x.com/", "http://twitter.com/"):
        if s.startswith(prefix):
            s = s[len(prefix):].split("/")[0].split("?")[0]
            break
    return s.lstrip("@").strip()


class TwitterEngine(BaseNewsEngine):
    """
    Search Twitter/X posts via X API v2.
    api_key is ignored — system X_BEARER_TOKEN from config is used.
    source.url stores @username for account-based search.
    """

    def _get_client(self):
        from config import X_BEARER_TOKEN
        if not X_BEARER_TOKEN:
            print("[Twitter] X_BEARER_TOKEN yapılandırılmamış, tweet çekilemiyor.")
            return None
        try:
            import tweepy
            return tweepy.Client(bearer_token=X_BEARER_TOKEN, wait_on_rate_limit=False)
        except Exception as e:
            print(f"[Twitter] Tweepy başlatılamadı: {e}")
            return None

    def search(self, query: str, language: str = "tr", max_results: int = 20) -> List[NewsResult]:
        """Keyword search — quality filtered (has:links, -is:retweet)."""
        client = self._get_client()
        if not client:
            return []
        lang = "tr" if language == "tr" else "en"
        q = f'"{query}" lang:{lang} -is:retweet has:links'
        return self._run_search(client, q, max_results)

    def search_account(self, url_or_handle: str, query: str,
                       language: str = "tr", max_results: int = 20) -> List[NewsResult]:
        """Fetch tweets from a specific account, optionally filtered by keyword."""
        client = self._get_client()
        if not client:
            return []
        username = _extract_username(url_or_handle)
        if query:
            q = f'"{query}" from:{username} -is:retweet'
        else:
            q = f'from:{username} -is:retweet'
        return self._run_search(client, q, max_results)

    def _run_search(self, client, query: str, max_results: int = 20) -> List[NewsResult]:
        results = []
        try:
            start_time = datetime.now(timezone.utc) - timedelta(days=7)

            response = client.search_recent_tweets(
                query=query,
                max_results=min(max(max_results, 10), 100),
                tweet_fields=["created_at", "author_id", "text", "public_metrics", "entities"],
                expansions=["author_id", "attachments.media_keys"],
                media_fields=["url", "preview_image_url", "type"],
                user_fields=["name", "username", "profile_image_url"],
                start_time=start_time,
            )

            if not response.data:
                return results

            users = {u.id: u for u in (response.includes or {}).get("users", [])}
            media = {m.media_key: m for m in (response.includes or {}).get("media", [])}

            for tweet in response.data:
                author = users.get(tweet.author_id)
                uname = author.username if author else "unknown"

                tweet_url = f"https://twitter.com/{uname}/status/{tweet.id}"
                thumbnail = None

                attachments = getattr(tweet, "attachments", {})
                if attachments and "media_keys" in attachments:
                    for mk in attachments["media_keys"]:
                        m = media.get(mk)
                        if m:
                            thumbnail = getattr(m, "preview_image_url", None) or getattr(m, "url", None)
                            if thumbnail:
                                break

                metrics = tweet.public_metrics or {}
                rt = metrics.get("retweet_count", 0)
                lk = metrics.get("like_count", 0)

                results.append(NewsResult(
                    title=f"𝕏 @{uname} Gönderisi",
                    url=tweet_url,
                    summary=tweet.text,
                    source_name=f"𝕏 @{uname}",
                    published_at=tweet.created_at.isoformat() if tweet.created_at else None,
                    source_url=tweet_url,
                    thumbnail=thumbnail,
                    retweet_count=rt,
                    like_count=lk,
                ))

        except Exception as e:
            print(f"[Twitter API] Hata: {e}")
        return results

    def get_trends(self, woeid: int = 23424969) -> List[dict]:
        """
        Fetch trending topics for a location via X API v2.
        Default woeid=23424969 is Turkey; 1 = Worldwide.
        Requires Basic tier (100$/month) or higher.
        """
        from config import X_BEARER_TOKEN
        if not X_BEARER_TOKEN:
            return []
        try:
            import requests
            resp = requests.get(
                f"https://api.twitter.com/2/trends/by/woeid/{woeid}",
                headers={"Authorization": f"Bearer {X_BEARER_TOKEN}"},
                timeout=10,
            )
            if resp.status_code == 200:
                return resp.json().get("data", [])
            print(f"[Twitter Trends] HTTP {resp.status_code}: {resp.text[:300]}")
            return []
        except Exception as e:
            print(f"[Twitter Trends] Hata: {e}")
            return []

    def is_trending_topic(self, query: str, woeid: int = 23424969) -> tuple:
        """
        Check if a query string matches any current trending topic.
        Returns (is_trending: bool, tweet_count: int).
        Uses Turkish-aware normalization for matching.
        """
        trends = self.get_trends(woeid)
        if not trends:
            return False, 0

        def _norm(s):
            return (s.lower()
                    .replace("ı", "i").replace("ş", "s").replace("ç", "c")
                    .replace("ğ", "g").replace("ö", "o").replace("ü", "u")
                    .replace("#", "").replace(" ", ""))

        q = _norm(query)
        words = [_norm(w) for w in query.split() if len(w) > 2]

        for trend in trends:
            name = _norm(trend.get("trend_name", ""))
            if not name:
                continue
            # Full phrase match
            if q in name or name in q:
                return True, trend.get("tweet_count") or 0
            # All significant words present in trend name
            if len(words) >= 2 and all(w in name for w in words if len(w) > 3):
                return True, trend.get("tweet_count") or 0
        return False, 0

    def verify_account(self, url_or_handle: str) -> Dict[str, Any]:
        """Check if account exists and is public. Returns account metadata."""
        client = self._get_client()
        if not client:
            raise Exception("X Bearer Token yapılandırılmamış")

        username = _extract_username(url_or_handle)
        if not username:
            raise Exception("Geçersiz kullanıcı adı")

        try:
            response = client.get_user(
                username=username,
                user_fields=["protected", "public_metrics", "description",
                             "profile_image_url", "verified", "name"],
            )
        except Exception as e:
            raise Exception(f"X API hatası: {e}")

        if not response.data:
            return {"exists": False, "username": username}

        user = response.data
        metrics = user.public_metrics or {}
        return {
            "exists": True,
            "username": user.username,
            "name": user.name,
            "protected": bool(getattr(user, "protected", False)),
            "followers_count": metrics.get("followers_count", 0),
            "tweet_count": metrics.get("tweet_count", 0),
            "profile_image_url": getattr(user, "profile_image_url", None),
            "description": getattr(user, "description", ""),
        }

    def get_engine_name(self) -> str:
        return "twitter"
