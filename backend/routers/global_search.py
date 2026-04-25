"""
Haberajani - Global Search Router
Event Registry üzerinden uluslararası haber/olay araması.
"""
import json
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from pydantic import BaseModel

from database import get_db
from models import GlobalSearch, GlobalEvent, GlobalArticle, GlobalTag, User
from auth import get_current_user, require_admin
from engines.event_registry_engine import (
    detect_language, translate_to_english,
    search_events, search_articles,
    parse_events, parse_articles, get_token_usage,
)

router = APIRouter(prefix="/api/global", tags=["Global Search"])


# ─── Schemas ──────────────────────────────────────────────

class TagCreateRequest(BaseModel):
    name: str
    query_en: str
    search_type: str = "both"             # "events" | "articles" | "both"
    lang_filter: Optional[list] = None
    country_filter: Optional[list] = None


class SearchRequest(BaseModel):
    query_text: str
    query_translated: Optional[str] = None   # kullanıcı override edebilir
    date_range_days: int = 30


class SearchResponse(BaseModel):
    search_id: int
    query_text: str
    query_translated: str
    lang_detected: str
    date_range_days: int
    searched_at: str
    event_count: int
    article_count: int
    tokens_used: int
    events: list
    articles: list
    from_cache: bool = False


# ─── Helpers ──────────────────────────────────────────────

def _serialize_search(s: GlobalSearch, events: list, articles: list, from_cache=False) -> dict:
    return {
        "search_id":        s.id,
        "query_text":       s.query_text,
        "query_translated": s.query_translated or "",
        "lang_detected":    s.lang_detected or "en",
        "date_range_days":  s.date_range_days,
        "searched_at":      s.searched_at.isoformat() if s.searched_at else "",
        "event_count":      s.event_count,
        "article_count":    s.article_count,
        "tokens_used":      s.tokens_used,
        "events":           events,
        "articles":         articles,
        "from_cache":       from_cache,
    }


def _serialize_event(ev: GlobalEvent) -> dict:
    return {
        "id":               ev.id,
        "event_uri":        ev.event_uri,
        "title":            ev.title,
        "summary":          ev.summary,
        "event_date":       ev.event_date,
        "sentiment":        ev.sentiment,
        "article_count":    ev.article_count,
        "source_countries": json.loads(ev.source_countries or "[]"),
        "sources":          json.loads(ev.sources or "[]"),
        "concepts":         json.loads(ev.concepts or "[]"),
        "categories":       json.loads(ev.categories or "[]"),
        "image_url":        ev.image_url,
        "articles":         [_serialize_article(a) for a in (ev.articles or [])],
    }


def _serialize_article(art: GlobalArticle) -> dict:
    return {
        "id":          art.id,
        "article_uri": art.article_uri,
        "title":       art.title,
        "body":        art.body,
        "source_name": art.source_name,
        "url":         art.url,
        "published_at": art.published_at,
        "sentiment":   art.sentiment,
        "language":    art.language,
        "image_url":   art.image_url,
        "event_id":    art.event_id,
    }


def _do_search(query: str, date_range_days: int, db: Session, user: User) -> GlobalSearch:
    """Event Registry'ye çağrı yap, DB'ye kaydet, GlobalSearch döndür."""
    lang = detect_language(query)
    translated = query if lang == "en" else translate_to_english(query)

    raw_events   = search_events(translated, date_range_days)
    raw_articles = search_articles(translated, date_range_days)

    parsed_events   = parse_events(raw_events)
    parsed_articles = parse_articles(raw_articles)

    tokens = get_token_usage(raw_events) + get_token_usage(raw_articles)

    # GlobalSearch kaydı
    gs = GlobalSearch(
        user_id          = user.id,
        query_text       = query,
        query_translated = translated,
        lang_detected    = lang,
        date_range_days  = date_range_days,
        searched_at      = datetime.now(timezone.utc),
        event_count      = len(parsed_events),
        article_count    = len(parsed_articles),
        tokens_used      = tokens,
    )
    db.add(gs)
    db.flush()  # id almak için

    # Events
    ev_objs = []
    for ev in parsed_events:
        ev_obj = GlobalEvent(search_id=gs.id, **ev)
        db.add(ev_obj)
        ev_objs.append(ev_obj)
    db.flush()

    # Articles (event bağlantısı yok bu aşamada — ayrı endpoint)
    for art in parsed_articles:
        art.pop("country", None)
        db.add(GlobalArticle(search_id=gs.id, **art))

    db.commit()
    db.refresh(gs)
    return gs


# ─── Endpoints ────────────────────────────────────────────

class TranslateRequest(BaseModel):
    text: str


@router.post("/translate")
def translate_query(
    body: TranslateRequest,
    current_user: User = Depends(require_admin),
):
    """Metni İngilizceye çevirir ve dil tespiti yapar."""
    text = body.text.strip()
    if not text:
        return {"lang": "en", "translated": text}
    lang = detect_language(text)
    translated = text if lang == "en" else translate_to_english(text)
    return {"lang": lang, "translated": translated}


@router.post("/search")
def perform_search(
    body: SearchRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Yeni arama yap — Event Registry'ye çağrı atar, DB'ye kaydeder."""
    query = body.query_text.strip()
    if not query:
        raise HTTPException(status_code=400, detail="Sorgu boş olamaz")

    # Kullanıcı çeviriyi override ettiyse kullan
    translated_override = (body.query_translated or "").strip()

    lang = detect_language(query)

    if translated_override:
        translated = translated_override
    elif lang != "en":
        translated = translate_to_english(query)
    else:
        translated = query

    raw_events   = search_events(translated, body.date_range_days)
    raw_articles = search_articles(translated, body.date_range_days)

    if "error" in raw_events or "error" in raw_articles:
        err = raw_events.get("error") or raw_articles.get("error")
        raise HTTPException(status_code=502, detail=f"Event Registry hatası: {err}")

    parsed_events   = parse_events(raw_events)
    parsed_articles = parse_articles(raw_articles)
    tokens = get_token_usage(raw_events) + get_token_usage(raw_articles)

    gs = GlobalSearch(
        user_id          = current_user.id,
        query_text       = query,
        query_translated = translated,
        lang_detected    = lang,
        date_range_days  = body.date_range_days,
        searched_at      = datetime.now(timezone.utc),
        event_count      = len(parsed_events),
        article_count    = len(parsed_articles),
        tokens_used      = tokens,
    )
    db.add(gs)
    db.flush()

    ev_objs = []
    for ev in parsed_events:
        ev_obj = GlobalEvent(search_id=gs.id, **ev)
        db.add(ev_obj)
        ev_objs.append(ev_obj)
    db.flush()

    for art in parsed_articles:
        art.pop("country", None)
        db.add(GlobalArticle(search_id=gs.id, **art))

    db.commit()
    db.refresh(gs)

    events_out   = [_serialize_event(e)   for e in gs.events]
    articles_out = [_serialize_article(a) for a in gs.articles]

    return _serialize_search(gs, events_out, articles_out, from_cache=False)


@router.get("/searches")
def list_searches(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Kullanıcının geçmiş aramalarını listeler."""
    q = db.query(GlobalSearch)\
          .filter(GlobalSearch.user_id == current_user.id)\
          .order_by(desc(GlobalSearch.searched_at))
    total = q.count()
    searches = q.offset((page - 1) * per_page).limit(per_page).all()
    return {
        "total": total,
        "page": page,
        "items": [
            {
                "id":               s.id,
                "query_text":       s.query_text,
                "query_translated": s.query_translated,
                "lang_detected":    s.lang_detected,
                "date_range_days":  s.date_range_days,
                "searched_at":      s.searched_at.isoformat(),
                "event_count":      s.event_count,
                "article_count":    s.article_count,
                "tokens_used":      s.tokens_used,
            }
            for s in searches
        ],
    }


@router.get("/searches/{search_id}")
def get_search(
    search_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """DB'den belirli arama sonucunu getirir."""
    gs = db.query(GlobalSearch).filter(
        GlobalSearch.id == search_id,
        GlobalSearch.user_id == current_user.id,
    ).first()
    if not gs:
        raise HTTPException(status_code=404, detail="Arama bulunamadı")

    events_out   = [_serialize_event(e)   for e in gs.events]
    articles_out = [_serialize_article(a) for a in gs.articles if a.event_id is None]

    return _serialize_search(gs, events_out, articles_out, from_cache=True)


@router.post("/searches/{search_id}/refresh")
def refresh_search(
    search_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Mevcut aramayı Event Registry'den güncelleyerek yeniden çeker."""
    gs = db.query(GlobalSearch).filter(
        GlobalSearch.id == search_id,
        GlobalSearch.user_id == current_user.id,
    ).first()
    if not gs:
        raise HTTPException(status_code=404, detail="Arama bulunamadı")

    # Eski sonuçları sil
    db.query(GlobalArticle).filter(GlobalArticle.search_id == search_id).delete()
    db.query(GlobalEvent).filter(GlobalEvent.search_id == search_id).delete()
    db.flush()

    raw_events   = search_events(gs.query_translated or gs.query_text, gs.date_range_days)
    raw_articles = search_articles(gs.query_translated or gs.query_text, gs.date_range_days)

    if "error" in raw_events or "error" in raw_articles:
        db.rollback()
        raise HTTPException(status_code=502, detail="Event Registry hatası")

    parsed_events   = parse_events(raw_events)
    parsed_articles = parse_articles(raw_articles)
    tokens = get_token_usage(raw_events) + get_token_usage(raw_articles)

    for ev in parsed_events:
        db.add(GlobalEvent(search_id=search_id, **ev))
    db.flush()

    for art in parsed_articles:
        art.pop("country", None)
        db.add(GlobalArticle(search_id=search_id, **art))

    gs.event_count   = len(parsed_events)
    gs.article_count = len(parsed_articles)
    gs.tokens_used   += tokens
    gs.searched_at   = datetime.now(timezone.utc)

    db.commit()
    db.refresh(gs)

    events_out   = [_serialize_event(e)   for e in gs.events]
    articles_out = [_serialize_article(a) for a in gs.articles if a.event_id is None]

    return _serialize_search(gs, events_out, articles_out, from_cache=False)


@router.delete("/searches/{search_id}")
def delete_search(
    search_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Aramayı ve tüm sonuçlarını siler."""
    gs = db.query(GlobalSearch).filter(
        GlobalSearch.id == search_id,
        GlobalSearch.user_id == current_user.id,
    ).first()
    if not gs:
        raise HTTPException(status_code=404, detail="Arama bulunamadı")
    db.delete(gs)
    db.commit()
    return {"ok": True}


# ─── Tag CRUD ─────────────────────────────────────────────

def _serialize_tag(t: GlobalTag, latest_search=None) -> dict:
    return {
        "id":             t.id,
        "name":           t.name,
        "query_en":       t.query_en,
        "search_type":    t.search_type or "both",
        "lang_filter":    json.loads(t.lang_filter or "null"),
        "country_filter": json.loads(t.country_filter or "null"),
        "created_at":     t.created_at.isoformat() if t.created_at else "",
        "last_search": {
            "id":              latest_search.id,
            "searched_at":     latest_search.searched_at.isoformat() if latest_search.searched_at else "",
            "event_count":     latest_search.event_count,
            "article_count":   latest_search.article_count,
            "date_range_days": latest_search.date_range_days,
        } if latest_search else None,
    }


@router.get("/tags")
def list_tags(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Kullanıcının global etiketlerini listeler."""
    tags = db.query(GlobalTag)\
             .filter(GlobalTag.user_id == current_user.id)\
             .order_by(GlobalTag.created_at)\
             .all()
    result = []
    for t in tags:
        latest = db.query(GlobalSearch)\
                   .filter(GlobalSearch.tag_id == t.id)\
                   .order_by(desc(GlobalSearch.searched_at))\
                   .first()
        result.append(_serialize_tag(t, latest))
    return result


@router.post("/tags")
def create_tag(
    body: TagCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Yeni global etiket oluşturur."""
    name = body.name.strip()
    query_en = body.query_en.strip()
    if not name or not query_en:
        raise HTTPException(status_code=400, detail="İsim ve İngilizce sorgu zorunludur")
    tag = GlobalTag(
        user_id=current_user.id,
        name=name,
        query_en=query_en,
        search_type=body.search_type or "both",
        lang_filter=json.dumps(body.lang_filter) if body.lang_filter else None,
        country_filter=json.dumps(body.country_filter) if body.country_filter else None,
    )
    db.add(tag)
    db.commit()
    db.refresh(tag)
    return _serialize_tag(tag)


@router.delete("/tags/{tag_id}")
def delete_tag(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Etiketi ve bağlı tüm aramaları siler."""
    tag = db.query(GlobalTag).filter(
        GlobalTag.id == tag_id,
        GlobalTag.user_id == current_user.id,
    ).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Etiket bulunamadı")
    db.delete(tag)
    db.commit()
    return {"ok": True}


@router.post("/tags/{tag_id}/analyze")
def analyze_tag(
    tag_id: int,
    date_range_days: int = Query(30, ge=1, le=90),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Etiketi Event Registry ile analiz eder — yeni arama kaydı oluşturur."""
    tag = db.query(GlobalTag).filter(
        GlobalTag.id == tag_id,
        GlobalTag.user_id == current_user.id,
    ).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Etiket bulunamadı")

    lang_filter    = json.loads(tag.lang_filter or "null")
    country_filter = json.loads(tag.country_filter or "null")

    raw_articles = search_articles(tag.query_en, date_range_days, lang_filter=lang_filter, country_filter=country_filter)

    if raw_articles.get("error"):
        raise HTTPException(status_code=502, detail=f"Event Registry hatası: {raw_articles['error']}")

    parsed_articles = parse_articles(raw_articles)
    tokens = get_token_usage(raw_articles)

    gs = GlobalSearch(
        user_id          = current_user.id,
        tag_id           = tag.id,
        query_text       = tag.name,
        query_translated = tag.query_en,
        lang_detected    = "en",
        date_range_days  = date_range_days,
        searched_at      = datetime.now(timezone.utc),
        event_count      = 0,
        article_count    = len(parsed_articles),
        tokens_used      = tokens,
    )
    db.add(gs)
    db.flush()

    for art in parsed_articles:
        art.pop("country", None)
        db.add(GlobalArticle(search_id=gs.id, **art))

    db.commit()
    db.refresh(gs)

    articles_out = [_serialize_article(a) for a in gs.articles]

    return {
        **_serialize_search(gs, [], articles_out, from_cache=False),
        "tag": _serialize_tag(tag),
    }


@router.get("/tags/{tag_id}/latest")
def get_tag_latest(
    tag_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin),
):
    """Etiketin en son arama sonuçlarını DB'den getirir."""
    tag = db.query(GlobalTag).filter(
        GlobalTag.id == tag_id,
        GlobalTag.user_id == current_user.id,
    ).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Etiket bulunamadı")

    gs = db.query(GlobalSearch)\
           .filter(GlobalSearch.tag_id == tag_id)\
           .order_by(desc(GlobalSearch.searched_at))\
           .first()

    if not gs:
        return {"tag": _serialize_tag(tag), "search": None}

    articles_out = [_serialize_article(a) for a in gs.articles]

    return {
        "tag":    _serialize_tag(tag, gs),
        "search": _serialize_search(gs, [], articles_out, from_cache=True),
    }
