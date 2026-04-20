"""
Haberajani - News Router
News listing, search, read/favorite toggle, notes, and export.
"""
import csv
import html as _html
import io
import os
import re
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import or_, desc, asc
from sqlalchemy.orm import Session

from auth import get_current_user
from database import get_db
from models import NewsItem, Tag, User, SourceType
from schemas import NewsItemResponse, NoteUpdateRequest

# ── PDF font setup (runs once at import) ────────────────────────────────────
try:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    _font_reg = "Helvetica"
    _font_bold = "Helvetica-Bold"
    _arial = "C:/Windows/Fonts/arial.ttf"
    _arialbd = "C:/Windows/Fonts/arialbd.ttf"
    if os.path.exists(_arial):
        pdfmetrics.registerFont(TTFont("HaberFont", _arial))
        _font_reg = "HaberFont"
    if os.path.exists(_arialbd):
        pdfmetrics.registerFont(TTFont("HaberFont-Bold", _arialbd))
        _font_bold = "HaberFont-Bold"
except Exception:
    _font_reg = "Helvetica"
    _font_bold = "Helvetica-Bold"

router = APIRouter(prefix="/api/news", tags=["News"])


@router.get("/latest-id")
def get_latest_id(
    tag_id: Optional[int] = None,
    since_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Returns the latest news item id + total count + new tag names since since_id."""
    q = db.query(NewsItem).filter(
        NewsItem.user_id == current_user.id,
        NewsItem.is_hidden == False
    )
    if tag_id:
        q = q.filter(NewsItem.tag_id == tag_id)
    total = q.count()
    latest = q.order_by(desc(NewsItem.id)).first()
    latest_id = latest.id if latest else 0

    # Find tags of new items since since_id
    new_tags = []
    if since_id and since_id > 0:
        new_q = db.query(NewsItem).filter(
            NewsItem.user_id == current_user.id,
            NewsItem.is_hidden == False,
            NewsItem.id > since_id
        )
        if tag_id:
            new_q = new_q.filter(NewsItem.tag_id == tag_id)
        new_items = new_q.all()
        seen_tag_ids = set()
        for item in new_items:
            if item.tag_id not in seen_tag_ids:
                seen_tag_ids.add(item.tag_id)
                tag = db.query(Tag).filter(Tag.id == item.tag_id).first()
                if tag:
                    new_tags.append(tag.name)

    return {"latest_id": latest_id, "total": total, "new_tags": new_tags}


@router.get("/", response_model=List[NewsItemResponse])
def list_news(
    tag_id: Optional[int] = None,
    source_types: Optional[List[SourceType]] = Query(None),
    source_type: Optional[SourceType] = None,
    is_favorite: Optional[bool] = None,
    is_read: Optional[bool] = None,
    show_hidden: bool = False,
    sentiment: Optional[str] = Query(None, regex="^(positive|neutral|negative)$"),
    query: Optional[str] = None,
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    sort_order: Optional[str] = Query("desc", regex="^(asc|desc)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = db.query(NewsItem).filter(
        NewsItem.user_id == current_user.id,
        NewsItem.is_hidden == (True if show_hidden else False)
    )

    if tag_id:
        q = q.filter(NewsItem.tag_id == tag_id)
    # Multi source_type filter takes precedence over single
    effective_types = source_types if source_types else ([source_type] if source_type else None)
    if effective_types:
        q = q.filter(NewsItem.source_type.in_(effective_types))
    if is_favorite is not None:
        q = q.filter(NewsItem.is_favorite == is_favorite)
    if is_read is not None:
        q = q.filter(NewsItem.is_read == is_read)
    if sentiment:
        q = q.filter(NewsItem.sentiment == sentiment)
    if query:
        search = f"%{query}%"
        q = q.filter(or_(
            NewsItem.title.ilike(search),
            NewsItem.summary.ilike(search),
            NewsItem.user_note.ilike(search)
        ))
    if date_from:
        q = q.filter(NewsItem.published_at >= date_from)
    if date_to:
        q = q.filter(NewsItem.published_at <= date_to)

    # Sort order
    order_func = asc if sort_order == "asc" else desc
    items = q.order_by(order_func(NewsItem.published_at)).offset(
        (page - 1) * page_size
    ).limit(page_size).all()

    # Enrich with tag info
    result = []
    for item in items:
        resp = NewsItemResponse.model_validate(item)
        tag = db.query(Tag).filter(Tag.id == item.tag_id).first()
        if tag:
            resp.tag_name = tag.name
            resp.tag_color = tag.color
        result.append(resp)

    return result


@router.get("/count")
def news_count(
    tag_id: Optional[int] = None,
    date_from: Optional[str] = None,
    date_to: Optional[str] = None,
    source_types: Optional[List[SourceType]] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from datetime import date, time as dtime
    from sqlalchemy import func

    base = db.query(NewsItem).filter(
        NewsItem.user_id == current_user.id,
        NewsItem.is_hidden == False
    )
    if tag_id:
        base = base.filter(NewsItem.tag_id == tag_id)
    if date_from:
        base = base.filter(NewsItem.fetched_at >= datetime.fromisoformat(date_from.replace("Z", "+00:00")).replace(tzinfo=None))
    if date_to:
        base = base.filter(NewsItem.fetched_at <= datetime.fromisoformat(date_to.replace("Z", "+00:00")).replace(tzinfo=None))
    if source_types:
        base = base.filter(NewsItem.source_type.in_(source_types))

    total = base.count()
    unread = base.filter(NewsItem.is_read == False).count()
    favorites = base.filter(NewsItem.is_favorite == True).count()

    # Today's start (UTC)
    today_start = datetime.combine(date.today(), dtime.min)

    # Per-source-type breakdown
    source_counts = {}
    for st in [SourceType.WEB, SourceType.YOUTUBE, SourceType.TWITTER,
               SourceType.INSTAGRAM, SourceType.EKSISOZLUK, SourceType.RSS]:
        count = base.filter(NewsItem.source_type == st).count()
        today = base.filter(
            NewsItem.source_type == st,
            NewsItem.fetched_at >= today_start
        ).count()
        source_counts[st.value] = {"count": count, "today": today}

    # Total today
    total_today = base.filter(NewsItem.fetched_at >= today_start).count()
    today_unread = base.filter(NewsItem.fetched_at >= today_start, NewsItem.is_read == False).count()

    # Sentiment distribution
    sentiment_positive = base.filter(NewsItem.sentiment == "positive").count()
    sentiment_neutral = base.filter(NewsItem.sentiment == "neutral").count()
    sentiment_negative = base.filter(NewsItem.sentiment == "negative").count()
    sentiment_unknown = base.filter(
        (NewsItem.sentiment == None) | (NewsItem.sentiment == "")
    ).count()

    return {
        "total": total,
        "unread": unread,
        "favorites": favorites,
        "today": total_today,
        "today_unread": today_unread,
        "by_source": source_counts,
        "sentiment": {
            "positive": sentiment_positive,
            "neutral": sentiment_neutral,
            "negative": sentiment_negative,
            "unknown": sentiment_unknown
        }
    }


@router.get("/{news_id}", response_model=NewsItemResponse)
def get_news_item(
    news_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(NewsItem).filter(
        NewsItem.id == news_id, NewsItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Haber bulunamadi")

    resp = NewsItemResponse.model_validate(item)
    tag = db.query(Tag).filter(Tag.id == item.tag_id).first()
    if tag:
        resp.tag_name = tag.name
        resp.tag_color = tag.color
    return resp


@router.put("/{news_id}/read")
def toggle_read(
    news_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(NewsItem).filter(
        NewsItem.id == news_id, NewsItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Haber bulunamadi")

    item.is_read = not item.is_read
    db.commit()
    return {"is_read": item.is_read}


@router.put("/{news_id}/favorite")
def toggle_favorite(
    news_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(NewsItem).filter(
        NewsItem.id == news_id, NewsItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Haber bulunamadi")

    item.is_favorite = not item.is_favorite
    db.commit()
    return {"is_favorite": item.is_favorite}


@router.put("/{news_id}/hide")
def toggle_hide(
    news_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(NewsItem).filter(
        NewsItem.id == news_id, NewsItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Haber bulunamadi")
    item.is_hidden = not item.is_hidden
    db.commit()
    return {"is_hidden": item.is_hidden}


@router.put("/{news_id}/note")
def update_note(
    news_id: int,
    data: NoteUpdateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    item = db.query(NewsItem).filter(
        NewsItem.id == news_id, NewsItem.user_id == current_user.id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Haber bulunamadi")

    item.user_note = data.note
    db.commit()
    return {"user_note": item.user_note}


@router.get("/export/csv")
def export_csv(
    tag_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    q = db.query(NewsItem).filter(NewsItem.user_id == current_user.id)
    if tag_id:
        q = q.filter(NewsItem.tag_id == tag_id)

    items = q.order_by(desc(NewsItem.published_at)).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Baslik", "Ozet", "URL", "Kaynak URL", "Kaynak", "Tarih", "Etiket", "Not", "Okundu", "Favori"])

    for item in items:
        tag = db.query(Tag).filter(Tag.id == item.tag_id).first()
        writer.writerow([
            item.title,
            item.summary or "",
            item.url,
            item.source_url or "",
            item.source_name or "",
            item.published_at.isoformat() if item.published_at else "",
            tag.name if tag else "",
            item.user_note or "",
            "Evet" if item.is_read else "Hayir",
            "Evet" if item.is_favorite else "Hayir",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=haberajani_haberler.csv"}
    )


@router.get("/export/pdf")
def export_pdf(
    tag_id: Optional[int] = None,
    tag_ids: Optional[List[int]] = Query(None),
    date_from: Optional[datetime] = None,
    date_to: Optional[datetime] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    )

    def pt(text):
        """Clean text for ReportLab Paragraph: strip HTML tags, decode entities, XML-escape."""
        if not text:
            return ""
        text = re.sub(r'<[^>]+>', ' ', str(text))   # strip HTML tags first
        text = _html.unescape(text)                   # &nbsp; → \xa0, &amp; → &, etc.
        text = text.replace('\xa0', ' ').replace('\u200b', '')  # non-breaking/zero-width spaces
        out = []
        for c in text:
            cp = ord(c)
            if cp < 0x250 or 0x2010 <= cp <= 0x2060:
                out.append(c)
            else:
                out.append(' ')
        result = ' '.join(''.join(out).split())       # normalize whitespace
        return result.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")

    def url_xml(url):
        """Escape & in URLs for use inside XML attributes."""
        return (url or "").replace("&", "&amp;")

    # ── Query ────────────────────────────────────────────────────────────────
    q = db.query(NewsItem).filter(
        NewsItem.user_id == current_user.id,
        NewsItem.is_hidden == False
    )
    # Resolve effective tag filter (tag_ids list takes precedence)
    effective_tag_ids = tag_ids if tag_ids else ([tag_id] if tag_id else None)
    if effective_tag_ids:
        q = q.filter(NewsItem.tag_id.in_(effective_tag_ids))
    if date_from:
        q = q.filter(NewsItem.published_at >= date_from)
    if date_to:
        q = q.filter(NewsItem.published_at <= date_to)
    items = q.order_by(desc(NewsItem.published_at)).all()

    # Build tag name display
    tag_name = "Tüm Etiketler"
    if effective_tag_ids:
        tag_objs = db.query(Tag).filter(Tag.id.in_(effective_tag_ids)).all()
        if tag_objs:
            tag_name = ", ".join(t.name for t in tag_objs)

    # ── Stats ────────────────────────────────────────────────────────────────
    total = len(items)
    sentiment_counts = {"positive": 0, "neutral": 0, "negative": 0, "unknown": 0}
    source_counts: dict = {}
    for it in items:
        key = it.sentiment if it.sentiment in ("positive", "neutral", "negative") else "unknown"
        sentiment_counts[key] += 1
        stype = it.source_type.value if it.source_type else "Diğer"
        source_counts[stype] = source_counts.get(stype, 0) + 1

    analyzed = sentiment_counts["positive"] + sentiment_counts["neutral"] + sentiment_counts["negative"]

    # ── Colours & styles ─────────────────────────────────────────────────────
    C_NAVY    = colors.HexColor("#0f172a")
    C_BLUE    = colors.HexColor("#3b82f6")
    C_BLUE2   = colors.HexColor("#1d4ed8")
    C_POS     = colors.HexColor("#22c55e")
    C_NEU     = colors.HexColor("#f59e0b")
    C_NEG     = colors.HexColor("#ef4444")
    C_LIGHT   = colors.HexColor("#f1f5f9")
    C_BORDER  = colors.HexColor("#e2e8f0")
    C_MUTED   = colors.HexColor("#64748b")
    C_TEXT    = colors.HexColor("#1e293b")

    def style(name, **kw):
        kw.setdefault("fontName", _font_reg)
        return ParagraphStyle(name, **kw)

    s_body    = style("body",    fontSize=9,   leading=13, textColor=C_TEXT)
    s_small   = style("small",   fontSize=7.5, leading=11, textColor=C_MUTED)
    s_title   = style("title",   fontSize=10,  leading=14, fontName=_font_bold, textColor=C_TEXT)
    s_section = style("section", fontSize=11,  leading=16, fontName=_font_bold,
                      textColor=C_BLUE2, spaceBefore=14, spaceAfter=4)
    s_meta    = style("meta",    fontSize=9,   leading=13, textColor=C_MUTED)

    buf = io.BytesIO()
    now_str  = datetime.now().strftime("%d.%m.%Y %H:%M")
    from_str = date_from.strftime("%d.%m.%Y") if date_from else "Başlangıç"
    to_str   = date_to.strftime("%d.%m.%Y")   if date_to   else "Bugün"

    # Footer drawn on every page via canvas callback
    def draw_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont(_font_reg, 7)
        canvas.setFillColor(C_MUTED)
        footer_y = 0.9 * cm
        canvas.drawString(1.8 * cm, footer_y,
                          f"Haberajani  |  {pt(tag_name)}  |  {now_str}")
        canvas.drawRightString(A4[0] - 1.8 * cm, footer_y,
                               f"Sayfa {doc.page}")
        canvas.setStrokeColor(C_BORDER)
        canvas.setLineWidth(0.5)
        canvas.line(1.8 * cm, footer_y + 9, A4[0] - 1.8 * cm, footer_y + 9)
        canvas.restoreState()

    doc = SimpleDocTemplate(
        buf, pagesize=A4,
        leftMargin=1.8 * cm, rightMargin=1.8 * cm,
        topMargin=1.5 * cm, bottomMargin=2.0 * cm,
        title="Haberajani Raporu"
    )

    W = A4[0] - 3.6 * cm  # usable width
    story = []

    # ── Header band ──────────────────────────────────────────────────────────
    header_data = [[
        Paragraph(
            '<font color="white" size="20"><b>Haber Ajanı</b></font>',
            style("h1", fontSize=20, fontName=_font_bold, textColor=colors.white, leading=24)
        ),
        Paragraph(
            f'<font color="#93c5fd" size="8">Haber Analiz Raporu</font><br/>'
            f'<font color="white" size="9"><b>{pt(tag_name)}</b></font><br/>'
            f'<font color="#93c5fd" size="7.5">{pt(from_str)} - {pt(to_str)}</font><br/>'
            f'<font color="#64748b" size="7">Olusturuldu: {now_str}</font>',
            style("h_right", fontSize=8, fontName=_font_reg, textColor=colors.white,
                  leading=13, alignment=2)
        ),
    ]]
    header_tbl = Table(header_data, colWidths=[W * 0.45, W * 0.55])
    header_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_NAVY),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 18),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 18),
        ("TOPPADDING",    (0, 0), (-1, -1), 18),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ("LINEBELOW",     (0, 0), (-1, -1), 3, C_BLUE),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 0.45 * cm))

    # ── KPI cards ────────────────────────────────────────────────────────────
    def kpi_cell(value, label, hex_color):
        return [
            Paragraph(
                f'<font color="{hex_color}" size="22"><b>{value}</b></font>',
                style("kv", fontSize=22, fontName=_font_bold,
                      textColor=colors.HexColor(hex_color), leading=26, alignment=1)
            ),
            Paragraph(
                f'<font size="8">{label}</font>',
                style("kl", fontSize=8, fontName=_font_reg,
                      textColor=C_MUTED, leading=11, alignment=1)
            ),
        ]

    kpi_tbl = Table(
        [[
            kpi_cell(total,                        "Toplam Haber", "#3b82f6"),
            kpi_cell(sentiment_counts["positive"],  "Pozitif",      "#22c55e"),
            kpi_cell(sentiment_counts["neutral"],   "Nötr",         "#f59e0b"),
            kpi_cell(sentiment_counts["negative"],  "Negatif",      "#ef4444"),
            kpi_cell(len(source_counts),            "Kaynak Türü",  "#8b5cf6"),
        ]],
        colWidths=[W / 5] * 5
    )
    kpi_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), C_LIGHT),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN",         (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING",    (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("LINEAFTER",     (0, 0), (3, 0), 0.5, C_BORDER),
        ("BOX",           (0, 0), (-1, -1), 0.5, C_BORDER),
    ]))
    story.append(kpi_tbl)
    story.append(Spacer(1, 0.4 * cm))

    # ── Sentiment bars ───────────────────────────────────────────────────────
    story.append(Paragraph("Tutum Analizi Dağılımı", s_section))
    story.append(HRFlowable(width=W, thickness=1, color=C_BORDER, spaceAfter=8))

    if analyzed > 0:
        bar_track_w = W - 5.8 * cm

        def bar_row(label, count, color_obj):
            pct = count / analyzed * 100
            filled = max(int(pct / 100 * bar_track_w), 2) if count else 0
            empty  = max(int(bar_track_w) - filled, 0)
            # Filled segment
            inner = [["", ""]]
            seg_tbl = Table(inner, colWidths=[filled, empty], rowHeights=[10])
            seg_tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (0, 0), color_obj),
                ("BACKGROUND", (1, 0), (1, 0), C_BORDER),
            ]))
            return [
                Paragraph(label, style("bl", fontSize=9, fontName=_font_reg, textColor=C_TEXT)),
                seg_tbl,
                Paragraph(
                    f"<b>{count}</b>  {pct:.0f}%",
                    style("bv", fontSize=9, fontName=_font_bold, textColor=C_TEXT, alignment=2)
                ),
            ]

        bar_tbl = Table(
            [
                bar_row("Pozitif", sentiment_counts["positive"], C_POS),
                bar_row("Nötr",    sentiment_counts["neutral"],  C_NEU),
                bar_row("Negatif", sentiment_counts["negative"], C_NEG),
            ],
            colWidths=[2.0 * cm, bar_track_w, 3.0 * cm],
            rowHeights=[22, 22, 22]
        )
        bar_tbl.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 4),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
            ("TOPPADDING",    (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(bar_tbl)
    else:
        story.append(Paragraph("Tutum analizi verisi bulunmuyor.", s_meta))

    story.append(Spacer(1, 0.4 * cm))

    # ── Source breakdown ─────────────────────────────────────────────────────
    story.append(Paragraph("Kaynak Dağılımı", s_section))
    story.append(HRFlowable(width=W, thickness=1, color=C_BORDER, spaceAfter=8))

    SOURCE_LABELS = {
        "rss": "RSS / Haber Sitesi", "twitter": "Twitter / X",
        "youtube": "YouTube", "web": "Web",
        "instagram": "Instagram", "eksisozluk": "Ekşi Sözlük",
        "newsapi": "NewsAPI",
    }
    src_rows = [[
        Paragraph("<b>Kaynak</b>", style("th", fontSize=9, fontName=_font_bold, textColor=colors.white)),
        Paragraph("<b>Sayı</b>",   style("th", fontSize=9, fontName=_font_bold, textColor=colors.white, alignment=1)),
        Paragraph("<b>Oran</b>",   style("th", fontSize=9, fontName=_font_bold, textColor=colors.white, alignment=2)),
    ]]
    for stype, cnt in sorted(source_counts.items(), key=lambda x: -x[1]):
        pct = cnt / total * 100 if total else 0
        label = SOURCE_LABELS.get(stype, stype.title())
        src_rows.append([
            Paragraph(label, s_body),
            Paragraph(str(cnt), style("sc", fontSize=9, fontName=_font_reg, textColor=C_TEXT, alignment=1)),
            Paragraph(f"{pct:.1f}%", style("sp", fontSize=9, fontName=_font_reg, textColor=C_MUTED, alignment=2)),
        ])

    src_tbl = Table(src_rows, colWidths=[W * 0.6, W * 0.2, W * 0.2])
    src_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  C_BLUE),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [C_LIGHT, colors.white]),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW",     (0, 0), (-1, -2), 0.5, C_BORDER),
        ("BOX",           (0, 0), (-1, -1), 0.5, C_BORDER),
    ]))
    story.append(src_tbl)
    story.append(Spacer(1, 0.5 * cm))

    # ── Article list ─────────────────────────────────────────────────────────
    story.append(Paragraph("Haber Listesi", s_section))
    story.append(HRFlowable(width=W, thickness=1.5, color=C_BLUE, spaceAfter=10))

    SENT_LABEL = {
        "positive": ("Pozitif", "#22c55e"),
        "neutral":  ("Nötr",    "#f59e0b"),
        "negative": ("Negatif", "#ef4444"),
    }
    SRC_LABEL = {
        "rss": "RSS", "twitter": "X / Twitter", "youtube": "YouTube",
        "web": "Web", "instagram": "Instagram", "eksisozluk": "Ekşi",
        "newsapi": "NewsAPI",
    }

    for i, it in enumerate(items, 1):
        stype_val  = it.source_type.value if it.source_type else ""
        src_label  = SRC_LABEL.get(stype_val, stype_val.title())
        sent_text, sent_hex = SENT_LABEL.get(it.sentiment, ("—", "#94a3b8"))
        date_str   = it.published_at.strftime("%d.%m.%Y %H:%M") if it.published_at else "—"
        source_name = pt(it.source_name or src_label)

        # Card: number accent | content
        num_cell = Table(
            [[Paragraph(
                f'<font color="white" size="9"><b>{i}</b></font>',
                style("num", fontSize=9, fontName=_font_bold, textColor=colors.white,
                      leading=12, alignment=1)
            )]],
            colWidths=[0.65 * cm], rowHeights=[0.65 * cm]
        )
        num_cell.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (0, 0), C_BLUE),
            ("VALIGN",        (0, 0), (0, 0), "MIDDLE"),
            ("LEFTPADDING",   (0, 0), (0, 0), 0),
            ("RIGHTPADDING",  (0, 0), (0, 0), 0),
            ("TOPPADDING",    (0, 0), (0, 0), 0),
            ("BOTTOMPADDING", (0, 0), (0, 0), 0),
        ]))

        content_lines = [
            Paragraph(pt(it.title), s_title),
            Paragraph(
                f'{source_name}  &bull;  {date_str}  &bull;  '
                f'<font color="{sent_hex}"><b>{sent_text}</b></font>',
                s_small
            ),
        ]
        if it.summary:
            snippet = pt(it.summary[:300]) + ("..." if len(it.summary) > 300 else "")
            content_lines.append(Paragraph(snippet, s_body))

        # Clickable links row
        link_parts = []
        if it.url:
            link_parts.append(f'<link href="{url_xml(it.url)}" color="#3b82f6">Habere Git</link>')
        if it.source_url and it.source_url != it.url:
            link_parts.append(f'<link href="{url_xml(it.source_url)}" color="#8b5cf6">Kaynak</link>')
        if link_parts:
            content_lines.append(Paragraph(
                '  |  '.join(link_parts),
                style("lnk", fontSize=7.5, fontName=_font_reg, textColor=colors.HexColor("#3b82f6"),
                      leading=12, spaceBefore=2)
            ))

        content_tbl = Table(
            [[c] for c in content_lines],
            colWidths=[W - 0.9 * cm]
        )
        content_tbl.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING",   (0, 0), (-1, -1), 0),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
            ("TOPPADDING",    (0, 0), (-1, -1), 1),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
        ]))

        card = Table(
            [[num_cell, content_tbl]],
            colWidths=[0.75 * cm, W - 0.75 * cm]
        )
        card.setStyle(TableStyle([
            ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ("BACKGROUND",    (0, 0), (-1, -1), colors.white),
            ("BOX",           (0, 0), (-1, -1), 0.5, C_BORDER),
            ("LEFTPADDING",   (1, 0), (1, 0), 10),
            ("RIGHTPADDING",  (1, 0), (1, 0), 8),
            ("TOPPADDING",    (0, 0), (-1, -1), 8),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
        ]))
        story.append(card)
        story.append(Spacer(1, 0.2 * cm))

    # ── Build ────────────────────────────────────────────────────────────────
    try:
        doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
    except Exception as err:
        raise HTTPException(status_code=500, detail=f"PDF olusturulamadi: {err}")

    pdf_bytes = buf.getvalue()
    safe_tag  = "".join(c for c in tag_name if c.isascii() and (c.isalnum() or c in " _-"))[:30].strip()
    filename  = f"haberajani_{safe_tag}_{datetime.now().strftime('%Y%m%d')}.pdf".replace(" ", "_")
    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
        }
    )
