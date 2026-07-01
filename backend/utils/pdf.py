"""
Haber PDF üreticisi — routers/news.py:export_pdf ile AYNI görsel şablon.
build_news_pdf(items, tag_name, ...) -> bytes  (istekten bağımsız; bülten ve export ortak kullanabilir).
"""
import html as _html
import io
import os
import re
from collections import defaultdict
from datetime import datetime

# ── PDF font setup (runs once at import) ────────────────────────────────────
try:
    from reportlab.pdfbase import pdfmetrics
    from reportlab.pdfbase.ttfonts import TTFont

    _font_reg = "Helvetica"
    _font_bold = "Helvetica-Bold"

    _font_candidates = [
        ("C:/Windows/Fonts/arial.ttf",     "C:/Windows/Fonts/arialbd.ttf"),
        ("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
         "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"),
        ("/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
         "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf"),
        ("/usr/share/fonts/truetype/freefont/FreeSans.ttf",
         "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf"),
        ("/usr/share/fonts/truetype/ubuntu/Ubuntu-R.ttf",
         "/usr/share/fonts/truetype/ubuntu/Ubuntu-B.ttf"),
    ]
    for _reg_path, _bold_path in _font_candidates:
        if os.path.exists(_reg_path):
            pdfmetrics.registerFont(TTFont("HaberFont", _reg_path))
            _font_reg = "HaberFont"
            if os.path.exists(_bold_path):
                pdfmetrics.registerFont(TTFont("HaberFont-Bold", _bold_path))
                _font_bold = "HaberFont-Bold"
            break
except Exception:
    _font_reg = "Helvetica"
    _font_bold = "Helvetica-Bold"


def _pt(text):
    """ReportLab Paragraph için metni temizle: HTML strip, entity decode, XML escape."""
    if not text:
        return ""
    text = re.sub(r'<[^>]+>', ' ', str(text))
    text = _html.unescape(text)
    text = text.replace('\xa0', ' ').replace('​', '')
    out = []
    for c in text:
        cp = ord(c)
        if cp < 0x250 or 0x2010 <= cp <= 0x2060:
            out.append(c)
        else:
            out.append(' ')
    result = ' '.join(''.join(out).split())
    return result.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _url_xml(url):
    return (url or "").replace("&", "&amp;")


def build_news_pdf(items, tag_name, date_from=None, date_to=None, db=None) -> bytes:
    """Verilen NewsItem listesinden PDF (bytes) üretir. db: etiket adlarını çözmek için."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import ParagraphStyle
    from reportlab.lib.units import cm
    from reportlab.platypus import (
        HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
    )

    pt = _pt
    url_xml = _url_xml

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

    def draw_footer(canvas, doc):
        canvas.saveState()
        canvas.setFont(_font_reg, 7)
        canvas.setFillColor(C_MUTED)
        footer_y = 0.9 * cm
        canvas.drawString(1.8 * cm, footer_y, f"Haberajani  |  {pt(tag_name)}  |  {now_str}")
        canvas.drawRightString(A4[0] - 1.8 * cm, footer_y, f"Sayfa {doc.page}")
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

    W = A4[0] - 3.6 * cm
    story = []

    # ── Header band ──
    header_data = [[
        Paragraph('<font color="white" size="20"><b>Haber Ajanı</b></font>',
                  style("h1", fontSize=20, fontName=_font_bold, textColor=colors.white, leading=24)),
        Paragraph(
            f'<font color="#93c5fd" size="8">Haber Analiz Raporu</font><br/>'
            f'<font color="white" size="9"><b>{pt(tag_name)}</b></font><br/>'
            f'<font color="#93c5fd" size="7.5">{pt(from_str)} - {pt(to_str)}</font><br/>'
            f'<font color="#64748b" size="7">Olusturuldu: {now_str}</font>',
            style("h_right", fontSize=8, fontName=_font_reg, textColor=colors.white, leading=13, alignment=2)),
    ]]
    header_tbl = Table(header_data, colWidths=[W * 0.45, W * 0.55])
    header_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), C_NAVY),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 18),
        ("RIGHTPADDING", (0, 0), (-1, -1), 18),
        ("TOPPADDING", (0, 0), (-1, -1), 18),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 14),
        ("LINEBELOW", (0, 0), (-1, -1), 3, C_BLUE),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 0.45 * cm))

    # ── KPI cards ──
    def kpi_cell(value, label, hex_color):
        return [
            Paragraph(f'<font color="{hex_color}" size="22"><b>{value}</b></font>',
                      style("kv", fontSize=22, fontName=_font_bold, textColor=colors.HexColor(hex_color), leading=26, alignment=1)),
            Paragraph(f'<font size="8">{label}</font>',
                      style("kl", fontSize=8, fontName=_font_reg, textColor=C_MUTED, leading=11, alignment=1)),
        ]

    kpi_tbl = Table([[
        kpi_cell(total, "Toplam Haber", "#3b82f6"),
        kpi_cell(sentiment_counts["positive"], "Pozitif", "#22c55e"),
        kpi_cell(sentiment_counts["neutral"], "Nötr", "#f59e0b"),
        kpi_cell(sentiment_counts["negative"], "Negatif", "#ef4444"),
        kpi_cell(len(source_counts), "Kaynak Türü", "#8b5cf6"),
    ]], colWidths=[W / 5] * 5)
    kpi_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), C_LIGHT),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("ALIGN", (0, 0), (-1, -1), "CENTER"),
        ("TOPPADDING", (0, 0), (-1, -1), 12),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 12),
        ("LINEAFTER", (0, 0), (3, 0), 0.5, C_BORDER),
        ("BOX", (0, 0), (-1, -1), 0.5, C_BORDER),
    ]))
    story.append(kpi_tbl)
    story.append(Spacer(1, 0.4 * cm))

    # ── Sentiment bars ──
    story.append(Paragraph("Tutum Analizi Dağılımı", s_section))
    story.append(HRFlowable(width=W, thickness=1, color=C_BORDER, spaceAfter=8))
    if analyzed > 0:
        bar_track_w = W - 5.8 * cm

        def bar_row(label, count, color_obj):
            pct = count / analyzed * 100
            filled = max(int(pct / 100 * bar_track_w), 2) if count else 0
            empty  = max(int(bar_track_w) - filled, 0)
            seg_tbl = Table([["", ""]], colWidths=[filled, empty], rowHeights=[10])
            seg_tbl.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (0, 0), color_obj),
                ("BACKGROUND", (1, 0), (1, 0), C_BORDER),
            ]))
            return [
                Paragraph(label, style("bl", fontSize=9, fontName=_font_reg, textColor=C_TEXT)),
                seg_tbl,
                Paragraph(f"<b>{count}</b>  {pct:.0f}%",
                          style("bv", fontSize=9, fontName=_font_bold, textColor=C_TEXT, alignment=2)),
            ]

        bar_tbl = Table([
            bar_row("Pozitif", sentiment_counts["positive"], C_POS),
            bar_row("Nötr",    sentiment_counts["neutral"],  C_NEU),
            bar_row("Negatif", sentiment_counts["negative"], C_NEG),
        ], colWidths=[2.0 * cm, bar_track_w, 3.0 * cm], rowHeights=[22, 22, 22])
        bar_tbl.setStyle(TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("LEFTPADDING", (0, 0), (-1, -1), 4),
            ("RIGHTPADDING", (0, 0), (-1, -1), 4),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        story.append(bar_tbl)
    else:
        story.append(Paragraph("Tutum analizi verisi bulunmuyor.", s_meta))
    story.append(Spacer(1, 0.4 * cm))

    # ── Source breakdown ──
    story.append(Paragraph("Kaynak Dağılımı", s_section))
    story.append(HRFlowable(width=W, thickness=1, color=C_BORDER, spaceAfter=8))
    SOURCE_LABELS = {
        "rss": "RSS / Haber Sitesi", "twitter": "Twitter / X", "youtube": "YouTube",
        "web": "Web", "instagram": "Instagram", "eksisozluk": "Ekşi Sözlük", "newsapi": "NewsAPI",
    }
    src_rows = [[
        Paragraph("<b>Kaynak</b>", style("th", fontSize=9, fontName=_font_bold, textColor=colors.white)),
        Paragraph("<b>Sayı</b>", style("th", fontSize=9, fontName=_font_bold, textColor=colors.white, alignment=1)),
        Paragraph("<b>Oran</b>", style("th", fontSize=9, fontName=_font_bold, textColor=colors.white, alignment=2)),
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
        ("BACKGROUND", (0, 0), (-1, 0), C_BLUE),
        ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_LIGHT, colors.white]),
        ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("RIGHTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LINEBELOW", (0, 0), (-1, -2), 0.5, C_BORDER),
        ("BOX", (0, 0), (-1, -1), 0.5, C_BORDER),
    ]))
    story.append(src_tbl)
    story.append(Spacer(1, 0.5 * cm))

    # ── Article list grouped by tag (görselli) ──
    story.append(Paragraph("Haber Listesi", s_section))
    story.append(HRFlowable(width=W, thickness=1.5, color=C_BLUE, spaceAfter=10))
    SENT_LABEL = {"positive": ("Pozitif", "#22c55e"), "neutral": ("Nötr", "#f59e0b"), "negative": ("Negatif", "#ef4444")}
    SRC_LABEL = {"rss": "RSS", "twitter": "X / Twitter", "youtube": "YouTube", "web": "Web",
                 "instagram": "Instagram", "eksisozluk": "Ekşi", "newsapi": "NewsAPI"}

    tag_item_map: dict = defaultdict(list)
    for it in items:
        tag_item_map[it.tag_id].append(it)

    tag_obj_map = {}
    if db is not None and tag_item_map:
        from models import Tag as _Tag
        tag_obj_map = {t.id: t for t in db.query(_Tag).filter(_Tag.id.in_(list(tag_item_map.keys()))).all()}

    s_tag_header = style("tag_hdr", fontSize=11, fontName=_font_bold, textColor=colors.white, leading=16)
    s_tag_sources = style("tag_src", fontSize=7.5, fontName=_font_reg, textColor=colors.HexColor("#93c5fd"), leading=11)

    def _thumb_flowable(url):
        """Haber görselini indirip küçük bir Image flowable döndürür (başarısızsa None)."""
        if not url:
            return None
        try:
            import requests as _rq
            from reportlab.platypus import Image as _Img
            from reportlab.lib.utils import ImageReader as _IR
            r = _rq.get(url, timeout=6, headers={"User-Agent": "Mozilla/5.0"})
            if r.status_code != 200 or not r.content:
                return None
            bio = io.BytesIO(r.content)
            ir = _IR(bio)
            iw, ih = ir.getSize()
            if not iw or not ih:
                return None
            tw = 2.6 * cm
            th = tw * ih / iw
            th = min(th, 2.6 * cm)
            bio.seek(0)
            return _Img(bio, width=tw, height=th)
        except Exception:
            return None

    for tid, tag_items_list in tag_item_map.items():
        tag_obj = tag_obj_map.get(tid)
        tag_display = pt(tag_obj.name if tag_obj else "Etiket")

        seen = {}
        for it in tag_items_list:
            sn = it.source_name or SRC_LABEL.get(it.source_type.value if it.source_type else "", "")
            sn_clean = pt(sn)
            if sn_clean and sn_clean not in seen:
                seen[sn_clean] = True
            if len(seen) >= 6:
                break
        src_line = "  ·  ".join(seen.keys())

        hdr_cell_content = [Paragraph(tag_display, s_tag_header)]
        if src_line:
            hdr_cell_content.append(Paragraph(src_line, s_tag_sources))
        tag_hdr_tbl = Table([[hdr_cell_content]], colWidths=[W])
        tag_hdr_tbl.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, -1), C_NAVY),
            ("LEFTPADDING", (0, 0), (-1, -1), 10),
            ("RIGHTPADDING", (0, 0), (-1, -1), 10),
            ("TOPPADDING", (0, 0), (-1, -1), 7),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
            ("LINEBELOW", (0, 0), (-1, -1), 2, C_BLUE),
        ]))
        story.append(tag_hdr_tbl)
        story.append(Spacer(1, 0.2 * cm))

        for i, it in enumerate(tag_items_list, 1):
            stype_val  = it.source_type.value if it.source_type else ""
            src_label  = SRC_LABEL.get(stype_val, stype_val.title())
            sent_text, sent_hex = SENT_LABEL.get(it.sentiment, ("—", "#94a3b8"))
            date_str   = it.published_at.strftime("%d.%m.%Y %H:%M") if it.published_at else "—"
            source_name = pt(it.source_name or src_label)

            num_cell = Table([[Paragraph(f'<font color="white" size="9"><b>{i}</b></font>',
                              style("num", fontSize=9, fontName=_font_bold, textColor=colors.white, leading=12, alignment=1))]],
                              colWidths=[0.65 * cm], rowHeights=[0.65 * cm])
            num_cell.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (0, 0), C_BLUE),
                ("VALIGN", (0, 0), (0, 0), "MIDDLE"),
                ("LEFTPADDING", (0, 0), (0, 0), 0),
                ("RIGHTPADDING", (0, 0), (0, 0), 0),
                ("TOPPADDING", (0, 0), (0, 0), 0),
                ("BOTTOMPADDING", (0, 0), (0, 0), 0),
            ]))

            tw_metrics = ""
            if it.source_type and it.source_type.value == "twitter":
                parts = []
                if it.retweet_count:
                    parts.append(f"RT {it.retweet_count:,}")
                if it.like_count:
                    parts.append(f"Begen {it.like_count:,}")
                if it.is_trending:
                    parts.append("TREND")
                if parts:
                    tw_metrics = "  |  " + "  ·  ".join(parts)

            content_lines = [
                Paragraph(pt(it.title), s_title),
                Paragraph(f'{source_name}  &bull;  {date_str}  &bull;  '
                          f'<font color="{sent_hex}"><b>{sent_text}</b></font>{pt(tw_metrics)}', s_small),
            ]
            if it.summary:
                snippet = pt(it.summary[:300]) + ("..." if len(it.summary) > 300 else "")
                content_lines.append(Paragraph(snippet, s_body))
            link_parts = []
            if it.url:
                link_parts.append(f'<link href="{url_xml(it.url)}" color="#3b82f6">Habere Git</link>')
            if it.source_url and it.source_url != it.url:
                link_parts.append(f'<link href="{url_xml(it.source_url)}" color="#8b5cf6">Kaynak</link>')
            if link_parts:
                content_lines.append(Paragraph('  |  '.join(link_parts),
                    style("lnk", fontSize=7.5, fontName=_font_reg, textColor=colors.HexColor("#3b82f6"), leading=12, spaceBefore=2)))

            content_tbl = Table([[c] for c in content_lines], colWidths=[W - 0.9 * cm - 2.8 * cm])
            content_tbl.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LEFTPADDING", (0, 0), (-1, -1), 0),
                ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                ("TOPPADDING", (0, 0), (-1, -1), 1),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
            ]))

            thumb = _thumb_flowable(it.thumbnail)
            if thumb is not None:
                row = [num_cell, content_tbl, thumb]
                col_w = [0.75 * cm, W - 0.75 * cm - 2.8 * cm, 2.8 * cm]
            else:
                row = [num_cell, content_tbl]
                col_w = [0.75 * cm, W - 0.75 * cm]
            card = Table([row], colWidths=col_w)
            card.setStyle(TableStyle([
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("BACKGROUND", (0, 0), (-1, -1), colors.white),
                ("BOX", (0, 0), (-1, -1), 0.5, C_BORDER),
                ("LEFTPADDING", (1, 0), (1, 0), 10),
                ("RIGHTPADDING", (1, 0), (1, 0), 8),
                ("TOPPADDING", (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
            ]))
            story.append(card)
            story.append(Spacer(1, 0.2 * cm))
        story.append(Spacer(1, 0.4 * cm))

    if not items:
        story.append(Paragraph("Bu bülten için haber bulunmuyor.", s_meta))

    try:
        doc.build(story, onFirstPage=draw_footer, onLaterPages=draw_footer)
    except Exception as err:
        raise RuntimeError(f"PDF olusturulamadi: {err}")

    return buf.getvalue()
