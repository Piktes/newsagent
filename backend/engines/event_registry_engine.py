"""
Event Registry API engine — uluslararası haber ve olay araması.
getEvents + getArticles endpoint'lerini kullanır.
"""
import json
import requests
from datetime import datetime, timedelta, timezone
from typing import Optional

ER_BASE = "https://eventregistry.org/api/v1"

from config import ER_API_KEY

# Dil tespiti için langdetect, çeviri için deep_translator
try:
    from langdetect import detect as _detect_lang
    _HAS_LANGDETECT = True
except ImportError:
    _HAS_LANGDETECT = False

try:
    from deep_translator import GoogleTranslator
    _HAS_TRANSLATOR = True
except ImportError:
    _HAS_TRANSLATOR = False


def detect_language(text: str) -> str:
    if _HAS_LANGDETECT:
        try:
            return _detect_lang(text)
        except Exception:
            pass
    return "en"


# Google Translate artık Türkiye'nin resmi adını "Türkiye" olarak döndürüyor.
# ER korpusu İngilizce — "Turkey" geçiyor, "Türkiye" geçmiyor.
_TR_NORMALIZE = {
    "Türkiye": "Turkey",
    "türkiye": "turkey",
}

def _normalize_er_query(text: str) -> str:
    for tr, en in _TR_NORMALIZE.items():
        text = text.replace(tr, en)
    return text


def translate_to_english(text: str) -> str:
    if not _HAS_TRANSLATOR:
        return _normalize_er_query(text)
    try:
        translated = GoogleTranslator(source="auto", target="en").translate(text)
        return _normalize_er_query(translated)
    except Exception:
        return _normalize_er_query(text)


def _date_range(days: int) -> tuple[str, str]:
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=days)
    return start.strftime("%Y-%m-%d"), end.strftime("%Y-%m-%d")


def _base_params() -> dict:
    return {
        "apiKey": ER_API_KEY,
    }


# Wikipedia URI mapping for country source filtering
_COUNTRY_URIS = {
    "US": "http://en.wikipedia.org/wiki/United_States",
    "GB": "http://en.wikipedia.org/wiki/United_Kingdom",
    "DE": "http://en.wikipedia.org/wiki/Germany",
    "FR": "http://en.wikipedia.org/wiki/France",
    "TR": "http://en.wikipedia.org/wiki/Turkey",
    "SA": "http://en.wikipedia.org/wiki/Saudi_Arabia",
    "AE": "http://en.wikipedia.org/wiki/United_Arab_Emirates",
    "AU": "http://en.wikipedia.org/wiki/Australia",
    "JP": "http://en.wikipedia.org/wiki/Japan",
    "CN": "http://en.wikipedia.org/wiki/China",
    "IN": "http://en.wikipedia.org/wiki/India",
    "BR": "http://en.wikipedia.org/wiki/Brazil",
    "PL": "http://en.wikipedia.org/wiki/Poland",
    "NL": "http://en.wikipedia.org/wiki/Netherlands",
    "ES": "http://en.wikipedia.org/wiki/Spain",
    "IT": "http://en.wikipedia.org/wiki/Italy",
}


def search_events(
    query: str,
    date_range_days: int = 30,
    page: int = 1,
    count: int = 20,
    lang_filter: list[str] | None = None,
    country_filter: list[str] | None = None,
) -> dict:
    """Event Registry getEvents çağrısı — olay kümeleri döndürür."""
    date_start, date_end = _date_range(date_range_days)
    params = {
        **_base_params(),
        "resultType":            "events",
        "eventsPage":            page,
        "eventsCount":           count,
        "eventsSortBy":          "date",
        "eventsSortByAsc":       False,
        "keyword":               query,
        "keywordLoc":            "body",
        "keywordOper":           "and",
        "dateStart":             date_start,
        "dateEnd":               date_end,
        "includeEventTitle":     True,
        "includeEventSummary":   True,
        "includeEventSentiment": True,
        "includeEventLocation":  True,
        "includeEventDate":      True,
        "includeEventArticleCounts": True,
        "includeEventConcepts":  True,
        "includeEventCategories": True,
        "includeEventStories":   False,
        "eventImageCount":       1,
        "conceptLang":           "eng",
        "includeConceptLabel":   True,
    }
    if lang_filter:
        params["lang"] = lang_filter
    if country_filter:
        uris = [_COUNTRY_URIS[c] for c in country_filter if c in _COUNTRY_URIS]
        if uris:
            params["sourceLocationUri"] = uris
    try:
        r = requests.get(f"{ER_BASE}/event/getEvents", params=params, timeout=30)
        r.raise_for_status()
        return r.json()
    except Exception as e:
        return {"error": str(e)}


def search_articles(
    query: str,
    date_range_days: int = 30,
    page: int = 1,
    count: int = 30,
    lang_filter: list[str] | None = None,
    country_filter: list[str] | None = None,
) -> dict:
    """Event Registry getArticles çağrısı — ham makaleler döndürür."""
    date_start, date_end = _date_range(date_range_days)
    params = {
        **_base_params(),
        "resultType":              "articles",
        "articlesPage":            page,
        "articlesCount":           count,
        "articlesSortBy":          "date",
        "articlesSortByAsc":       False,
        "keyword":                 query,
        "keywordLoc":              "title,body",
        "keywordOper":             "and",
        "dateStart":               date_start,
        "dateEnd":                 date_end,
        "articleBodyLen":          300,
        "includeArticleTitle":     True,
        "includeArticleBasicInfo": True,
        "includeArticleBody":      True,
        "includeArticleSentiment": True,
        "includeArticleConcepts":  False,
        "includeArticleCategories": False,
        "includeArticleImage":     True,
        "includeSourceTitle":      True,
        "includeSourceLocation":   True,
    }
    if lang_filter:
        params["lang"] = lang_filter
    if country_filter:
        uris = [_COUNTRY_URIS[c] for c in country_filter if c in _COUNTRY_URIS]
        if uris:
            params["sourceLocationUri"] = uris
    try:
        r = requests.get(f"{ER_BASE}/article/getArticles", params=params, timeout=30)
        r.raise_for_status()
        data = r.json()
        print(f"[ER] keys={list(data.keys())}")
        total = data.get("articles", {}).get("totalResults", "?")
        returned = len(data.get("articles", {}).get("results", []))
        print(f"[ER] query={query!r} lang={lang_filter} country={country_filter} → total={total} returned={returned}")
        return data
    except Exception as e:
        return {"error": str(e)}


def parse_events(raw: dict) -> list[dict]:
    """Ham event yanıtını düz liste haline getirir."""
    results = []
    events_data = raw.get("events", {})
    if not events_data:
        return results
    for ev in events_data.get("results", []):
        # Kaynak ülkeleri concepts'ten çıkar
        countries = []
        sources = []
        concepts = []
        categories = []
        for c in (ev.get("concepts") or []):
            lbl = c.get("label", {})
            name = lbl.get("eng") or lbl if isinstance(lbl, str) else ""
            if c.get("type") == "loc":
                countries.append(name)
            elif c.get("type") in ("person", "org", "wiki"):
                concepts.append(name)
        for cat in (ev.get("categories") or []):
            categories.append(cat.get("label", ""))
        # images
        img = None
        imgs = ev.get("images") or []
        if imgs:
            img = imgs[0]

        title_obj = ev.get("title") or {}
        title = title_obj.get("eng") or (list(title_obj.values())[0] if title_obj else "")

        summary_obj = ev.get("summary") or {}
        summary = summary_obj.get("eng") or (list(summary_obj.values())[0] if summary_obj else "")

        art_counts = ev.get("articleCounts") or {}
        total_articles = art_counts.get("total", 0) if isinstance(art_counts, dict) else 0

        results.append({
            "event_uri":       ev.get("uri", ""),
            "title":           title,
            "summary":         summary,
            "event_date":      ev.get("eventDate", ""),
            "sentiment":       ev.get("sentiment"),
            "article_count":   total_articles,
            "source_countries": json.dumps(countries[:10]),
            "sources":         json.dumps(sources[:10]),
            "concepts":        json.dumps(concepts[:10]),
            "categories":      json.dumps(categories[:5]),
            "image_url":       img,
        })
    return results


def parse_articles(raw: dict) -> list[dict]:
    """Ham article yanıtını düz liste haline getirir."""
    results = []
    articles_data = raw.get("articles", {})
    if not articles_data:
        return results
    for art in articles_data.get("results", []):
        src = art.get("source") or {}
        loc = src.get("location") or {}
        country = (loc.get("label") or {}).get("eng", "") if isinstance(loc, dict) else ""

        img = None
        imgs = art.get("image") or art.get("images") or []
        if isinstance(imgs, str):
            img = imgs
        elif isinstance(imgs, list) and imgs:
            img = imgs[0]

        results.append({
            "article_uri":   art.get("uri", ""),
            "title":         art.get("title", ""),
            "body":          art.get("body", ""),
            "source_name":   src.get("title", ""),
            "source_url":    src.get("uri", ""),
            "url":           art.get("url", ""),
            "published_at":  art.get("dateTime", ""),
            "sentiment":     art.get("sentiment"),
            "language":      art.get("lang", ""),
            "image_url":     img,
            "country":       country,
        })
    return results


def get_token_usage(raw: dict) -> int:
    """Yanıttaki token kullanımını döndürür (varsa)."""
    return raw.get("tokenCount", 1)
