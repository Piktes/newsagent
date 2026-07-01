"""
Etiket denkligi + arsivden geriye donuk eslestirme (Asama B).

Iki etiket "ayni arama" sayilir eger ana ifadesi (must_phrase), eslesme tipi
(match_mode) ve baglam kelimeleri/baglaclari (context_keywords/context_ops/
context_oper) ayniysa. Dil (language) denklik kriterine dahil edilmez - TR-only
bir etiketin eslesmeleri, BOTH bir etiketin eslesmelerinin alt kumesidir; bu
"ayni arama kriteri" urun amacina uygundur.
"""
import json

from sqlalchemy.orm import Session

from models import Tag, TagNewsMatch
from scheduler import normalize_turkish


def _normalize_query(text: str) -> str:
    """engines/newsapi_engine.normalize_query ile ayni - bosluklari sadelestirir."""
    return " ".join((text or "").split()).strip()


def tag_criteria_key(tag: Tag) -> tuple:
    """Bir etiketin arama kriterini karsilastirilabilir, hashlenebilir bir
    tuple'a indirger. Iki etiketin bu anahtari esitse "ayni arama" sayilir."""
    must = normalize_turkish(_normalize_query(tag.must_phrase or tag.name))
    mode = tag.match_mode or "phrase"

    ctx_kw_raw = json.loads(tag.context_keywords or "[]") if tag.context_keywords else []
    ctx_ops_raw = json.loads(tag.context_ops or "[]") if getattr(tag, "context_ops", None) else []
    ctx_oper = "off" if (tag.context_oper == "off" or not ctx_kw_raw) else (tag.context_oper or "or")

    # context_ops sadece "karisik" (hem VE hem VEYA bir arada) oldugunda sira
    # anlam tasir; tekduze (hepsi ayni) veya bos ise sirasiz kume olarak
    # karsilastirmak, sadece kullanicinin kelimeleri farkli sirada girdigi
    # ama mantiksal olarak ayni olan etiketleri de denk sayar.
    is_uniform = not ctx_ops_raw or len(set(ctx_ops_raw)) <= 1
    if is_uniform:
        ctx_kw = tuple(sorted(normalize_turkish(k) for k in ctx_kw_raw))
        ctx_ops = ()
    else:
        ctx_kw = tuple(normalize_turkish(k) for k in ctx_kw_raw)
        ctx_ops = tuple(ctx_ops_raw)

    return (must, mode, ctx_kw, ctx_oper, ctx_ops)


def find_equivalent_tags(db: Session, tag: Tag) -> list:
    """Verilen etiketle ayni arama kriterine sahip, kendisi disindaki etiketleri dondurur."""
    key = tag_criteria_key(tag)
    others = db.query(Tag).filter(Tag.id != tag.id).all()
    return [t for t in others if tag_criteria_key(t) == key]


def backfill_tag_from_archive(db: Session, tag: Tag) -> int:
    """Denk etiketlerin arsivde zaten eslestirdigi haberleri bu etikete anlik
    baglar (tekrar tarama/filtreleme gerekmez - kriterler zaten ayni).
    Yeni baglanan (linked) satir sayisini dondurur."""
    equivalents = find_equivalent_tags(db, tag)
    if not equivalents:
        return 0

    equivalent_ids = [t.id for t in equivalents]
    archived_news_ids = {
        row[0] for row in
        db.query(TagNewsMatch.news_item_id)
          .filter(TagNewsMatch.tag_id.in_(equivalent_ids))
          .distinct()
          .all()
    }
    if not archived_news_ids:
        return 0

    already_linked = {
        row[0] for row in
        db.query(TagNewsMatch.news_item_id)
          .filter(TagNewsMatch.tag_id == tag.id,
                  TagNewsMatch.news_item_id.in_(archived_news_ids))
          .all()
    }
    to_link = archived_news_ids - already_linked
    if not to_link:
        return 0

    from datetime import datetime, timezone
    now = datetime.now(timezone.utc)
    for news_item_id in to_link:
        db.add(TagNewsMatch(tag_id=tag.id, news_item_id=news_item_id, matched_at=now))
    db.commit()
    return len(to_link)
