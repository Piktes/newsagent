"""
Meejahse - Base News Engine
Abstract base class for all news scanning engines.
"""
from abc import ABC, abstractmethod
from typing import List, Optional
from dataclasses import dataclass


@dataclass
class NewsResult:
    """Standard news result from any engine."""
    title: str
    url: str
    summary: Optional[str] = None
    source_name: Optional[str] = None
    thumbnail: Optional[str] = None
    published_at: Optional[str] = None  # ISO format
    source_url: Optional[str] = None  # original source URL


class BaseNewsEngine(ABC):
    """Abstract base class for news scanning engines."""

    def __init__(self, api_key: Optional[str] = None):
        self.api_key = api_key

    @abstractmethod
    def search(self, query: str, language: str = "tr", max_results: int = 20) -> List[NewsResult]:
        """Search for news matching the query."""
        pass

    @abstractmethod
    def get_engine_name(self) -> str:
        """Return the engine identifier."""
        pass

    def is_api_based(self) -> bool:
        """Returns True if this engine requires an API key."""
        return self.api_key is not None

    @staticmethod
    def exact_query(query: str) -> str:
        """Wrap multi-word queries in double quotes for exact phrase matching.
        Single-word queries are returned as-is.
        Example: 'Ersin KARAMAN' -> '"Ersin KARAMAN"'
        """
        query = query.strip()
        if ' ' in query and not query.startswith('"'):
            return f'"{query}"'
        return query

    @staticmethod
    def _search_google_news_rss(query: str, max_results: int = 15, site_filter: Optional[str] = None, source_icon: str = "🌐") -> List[NewsResult]:
        """Search Google News RSS feed as a reliable fallback for blocked DuckDuckGo searches."""
        import feedparser
        import urllib.parse
        from bs4 import BeautifulSoup
        
        results = []
        try:
            exact_q = BaseNewsEngine.exact_query(query)
            if site_filter:
                exact_q += f" {site_filter}"
                
            q = urllib.parse.quote(exact_q)
            url = f"https://news.google.com/rss/search?q={q}&hl=tr&gl=TR&ceid=TR:tr"
            
            feed = feedparser.parse(url)
            for entry in feed.entries[:max_results]:
                summary_text = entry.get("summary", "")
                if summary_text and "<" in summary_text:
                    try:
                        soup = BeautifulSoup(summary_text, "html.parser")
                        summary_text = soup.get_text(separator=" ", strip=True)
                    except:
                        pass
                
                source_obj = entry.get("source", {})
                publisher = source_obj.get("title", "") if isinstance(source_obj, dict) else ""
                source_name = f"{source_icon} {publisher}" if publisher else f"{source_icon} {site_filter or 'Web'}"
                
                results.append(NewsResult(
                    title=entry.get("title", ""),
                    url=entry.get("link", ""),
                    summary=summary_text[:300] if summary_text else None,
                    source_name=source_name,
                    published_at=entry.get("published"),
                    source_url=entry.get("link", "")
                ))
        except Exception as e:
            print(f"[Google News RSS] Hata: {e}")
            
        return results
