import sqlite3
from datetime import datetime

db_path = 'haberajani.db'
start_date = '2026-04-16'
end_date = '2026-04-19 23:59:59'

def generate_report():
    con = sqlite3.connect(db_path)
    con.row_factory = sqlite3.Row
    cursor = con.cursor()
    
    tags = [(1, 'Milli_Egitim_Bakanligi'), (2, 'Yusuf_TEKIN')]
    
    for tag_id, tag_name in tags:
        report = []
        cursor.execute('''
            SELECT title, summary, source_name, source_type, published_at, sentiment, url
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
        
        sources = set(item['source_type'] for item in items if item['source_type'] and item['source_type'] != 'None')
        len_sources = len([s for s in sources if s])
        
        report.append(f"### 📊 RAPOR: {tag_name.replace('_', ' ')}")
        report.append(f"**Dönem:** 16.04.2026 - 19.04.2026")
        date_str = datetime.now().strftime("%d.%m.%Y %H:%M")
        report.append(f"**Oluşturulma Tarihi:** {date_str}")
        report.append("")
        
        report.append("#### 📈 İstatistik Özeti")
        report.append(f"- **Toplam Haber:** {total}")
        report.append(f"- **Pozitif/Nötr/Negatif Sayıları:** {pos} Pozitif | {neu} Nötr | {neg} Negatif")
        report.append(f"- **Kaynak Türü Sayısı:** {len_sources} Farklı Kaynak Tipi")
        report.append("")
        
        report.append("#### 🎯 Tutum Analizi Dağılımı")
        total_eval = pos + neu + neg
        if total_eval > 0:
            pos_pct = int(pos/total_eval*100)
            neu_pct = int(neu/total_eval*100)
            neg_pct = int(neg/total_eval*100)
            report.append(f"- 🟢 **Pozitif (%{pos_pct}):** 🟩" * pos + "⬜" * (20-pos) + f" ({pos} Adet)")
            report.append(f"- 🟡 **Nötr (%{neu_pct}):** 🟨" * neu + "⬜" * (20-neu) + f" ({neu} Adet)")
            neg_bar = neg if neg < 20 else 20
            report.append(f"- 🔴 **Negatif (%{neg_pct}):** 🟥" * neg_bar + "⬜" * (20 - neg_bar) + f" ({neg} Adet)")
        else:
            report.append("Tutum analizi verisi yok.")
        report.append("")
        
        report.append("#### 🌐 Kaynak Dağılımı")
        source_counts = {}
        for item in items:
            stype = item['source_type'] or 'Diğer'
            source_counts[stype] = source_counts.get(stype, 0) + 1
            
        report.append("| Kaynak Türü | Sayı | Oran |")
        report.append("|:--------------|:----:|:---:|")
        for s, count in sorted(source_counts.items(), key=lambda x: x[1], reverse=True):
            pct = count / total * 100
            report.append(f"| **{str(s).title()}** | {count} | %{pct:.1f} |")
        report.append("")
        
        report.append("#### 📰 Haber Listesi (Detaylı)")
        for i, item in enumerate(items, 1):
            sent = item['sentiment']
            sent_icon = "🟢 Pozitif" if sent == 'positive' else "🟡 Nötr" if sent == 'neutral' else "🔴 Negatif" if sent == 'negative' else "⚪ Bilinmiyor"
            item_date = item['published_at'][:16].replace('-', '.') if item['published_at'] else "Bilinmiyor"
            src = item['source_name'] or item['source_type'] or "Bilinmiyor"
            summary = (item['summary'] or "")[:200]
            if len(item['summary'] or "") > 200:
                summary += "..."
            url = item['url'] or "#"
            title = item['title'].replace('"', '').replace('[', '').replace(']', '') if item['title'] else "Başlık Yok"
                
            report.append(f"**{i}. [{title}]({url})**")
            report.append(f"- **Kaynak:** {src} | **Tarih:** {item_date} | **Tutum:** {sent_icon}")
            if summary:
                report.append(f"> {summary.replace(chr(10), ' ')}")
            report.append("")
            
        with open(f"C:\\Users\\sahin\\.gemini\\antigravity\\scratch\\newsagent\\backend\\{tag_name}_rapor.md", "w", encoding="utf-8") as f:
            f.write("\n".join(report))

generate_report()
