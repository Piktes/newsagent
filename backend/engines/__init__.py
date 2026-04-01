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
