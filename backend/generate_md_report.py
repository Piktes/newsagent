import sqlite3
from datetime import datetime, timezone

db_path = 'haberajani.db'
start_date = '2026-04-16'
end_date = '2026-04-19 23:59:59'

def generate_report():
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    cursor = con.cursor()
    
    tags = [(1, "Millî Eğitim Bakanlığı"), (2, "Yusuf TEKİN")]
    
    report = []
    
    for tag_id, tag_name in tags:
        cursor.execute('''
            SELECT title, summary, source_name, source_type, published_at, sentiment
            FROM news_items
            WHERE tag_id = ? AND published_at >= ? AND published_at <= ?
            ORDER BY published_at DESC
        ''', (tag_id, start_date, end_date))
        items = cursor.fetchall()
        
        total = len(items)
        if total == 0:
            continue
            
        pos = sum(1 for item in items if item['sentiment'] == 'positive')
        neu = sum(1 for item in items if item['sentiment'] == 'neutral')
        neg = sum(1 for item in items if item['sentiment'] == 'negative')
        
        sources = set(item['source_type'] for item in items if item['source_type'])
        
        # --- Koyu başlık bandı ---
        report.append(f"### 📊 Rapor: {tag_name}")
        report.append(f"**Dönem:** 16.04.2026 - 19.04.2026")
        report.append(f"**Oluşturulma Tarihi:** {datetime.now().strftime('%d.%m.%Y %H:%M')}")
        report.append("")
        
        # --- İstatistik özeti ---
        report.append("#### 📈 İstatistik Özeti")
        report.append(f"- **Toplam Haber:** {total}")
        report.append(f"- **Pozitif:** {pos} | **Nötr:** {neu} | **Negatif:** {neg}")
        report.append(f"- **Kaynak Türü Sayısı:** {len(sources)}")
        report.append("")
        
        # --- Tutum analizi ---
        report.append("#### 🎯 Tutum Analizi Dağılımı")
        total_eval = pos + neu + neg
        if total_eval > 0:
            report.append(f"- 🟢 **Pozitif:** %{int(pos/total_eval*100)} ({pos})")
            report.append(f"- 🟡 **Nötr:** %{int(neu/total_eval*100)} ({neu})")
            report.append(f"- 🔴 **Negatif:** %{int(neg/total_eval*100)} ({neg})")
        else:
            report.append("Tutum analizi verisi yok.")
        report.append("")
        
        # --- Kaynak dağılımı tablosu ---
        report.append("#### 🌐 Kaynak Dağılımı")
        source_counts = {}
        for item in items:
            stype = item['source_type'] or 'Diğer'
            source_counts[stype] = source_counts.get(stype, 0) + 1
            
        report.append("| Kaynak Türü | Sayı | Oran |")
        report.append("|-------------|------|------|")
        for s, count in sorted(source_counts.items(), key=lambda x: x[1], reverse=True):
            pct = count / total * 100
            report.append(f"| {str(s).title()} | {count} | %{pct:.1f} |")
        report.append("")
        
        # --- Haberler ---
        report.append("#### 📰 Haber Listesi")
        for i, item in enumerate(items, 1):
            sent = item['sentiment']
            sent_icon = "🟢 Pozitif" if sent == 'positive' else "🟡 Nötr" if sent == 'neutral' else "🔴 Negatif" if sent == 'negative' else "⚪ Bilinmiyor"
            date_str = item['published_at'][:16].replace('-', '.') if item['published_at'] else "Bilinmiyor"
            src = item['source_name'] or item['source_type'] or "Bilinmiyor"
            summary = (item['summary'] or "")[:200]
            if len(item['summary'] or "") > 200:
                summary += "..."
                
            report.append(f"**{i}. {item['title']}**")
            report.append(f"- *Kaynak:* {src} | *Tarih:* {date_str} | *Tutum:* {sent_icon}")
            if summary:
                report.append(f"> {summary.replace(chr(10), ' ')}")
            report.append("")
            
        report.append("---\n")
        
    print("\n".join(report))

generate_report()
