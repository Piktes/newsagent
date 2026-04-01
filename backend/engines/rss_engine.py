"""
Meejahse - RSS News Engine
Google News RSS and custom RSS feed parsing.
"""
import feedparser
from typing import List
from datetime import datetime
from email.utils import parsedate_to_datetime
from urllib.parse import quote_plus

from engines.base import BaseNewsEngine, NewsResult


class RssEngine(BaseNewsEngine):
    """Scan RSS feeds including Google News."""

    GOOGLE_NEWS_RSS = "https://news.google.com/rss/search?q={query}&hl={lang}&gl={country}&ceid={ceid}"

    def search(self, query: str, language: str = "tr", max_results: int = 20) -> List[NewsResult]:
        results = []

        exact_q = self.exact_query(query)
        encoded_query = quote_plus(exact_q)

        # Build Google News RSS URL based on language
        if language == "tr":
            url = self.GOOGLE_NEWS_RSS.format(
                query=encoded_query, lang="tr", country="TR", ceid="TR:tr"
            )
        else:
            url = self.GOOGLE_NEWS_RSS.format(
                query=encoded_query, lang="en", country="US", ceid="US:en"
            )

        try:
            feed = feedparser.parse(url)
            for entry in feed.entries[:max_results]:
                published = None
                if hasattr(entry, 'published'):
                    try:
                        published = parsedate_to_datetime(entry.published).isoformat()
                    except Exception:
                        pass

                # Extract thumbnail from media content
                thumbnail = None
                if hasattr(entry, 'media_content'):
                    for media in entry.media_content:
                        if 'url' in media:
                            thumbnail = media['url']
                            break

                # Extract summary (strip HTML)
                summary = None
                if hasattr(entry, 'summary'):
                    import re
                    summary = re.sub(r'<[^>]+>', '', entry.summary)[:300]

                # Extract original source URL from Google News entry
                source_url = None
                source_obj = entry.get('source', {})
                if hasattr(source_obj, 'href'):
                    source_url = source_obj.href
                elif isinstance(source_obj, dict) and 'href' in source_obj:
                    source_url = source_obj['href']

                # Fallback: try extracting from entry.links
                if not source_url and hasattr(entry, 'links'):
                    for link in entry.links:
                        if link.get('rel') == 'alternate' and link.get('href'):
                            candidate = link['href']
                            if 'news.google.com' not in candidate:
                                source_url = candidate
                                break

                results.append(NewsResult(
                    title=entry.title,
                    url=entry.link,
                    summary=summary,
                    source_name=source_obj.get('title', 'Google News') if isinstance(source_obj, dict) else 'Google News',
                    thumbnail=thumbnail,
                    published_at=published,
                    source_url=source_url
                ))
        except Exception as e:
            print(f"[RSS Engine] Hata: {e}")

        return results

    def parse_custom_feed(self, feed_url: str, max_results: int = 20) -> List[NewsResult]:
        """Parse a custom RSS feed URL."""
        results = []
        try:
            feed = feedparser.parse(feed_url)
            for entry in feed.entries[:max_results]:
                published = None
                if hasattr(entry, 'published'):
                    try:
                        published = parsedate_to_datetime(entry.published).isoformat()
                    except Exception:
                        pass

                summary = None
                if hasattr(entry, 'summary'):
                    import re
                    summary = re.sub(r'<[^>]+>', '', entry.summary)[:300]

                results.append(NewsResult(
                    title=entry.title,
                    url=entry.link,
                    summary=summary,
                    source_name=feed.feed.get('title', 'RSS'),
                    published_at=published
                ))
        except Exception as e:
            print(f"[RSS Custom] Hata: {e}")

        return results

    def get_engine_name(self) -> str:
        return "rss"
