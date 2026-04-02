"""
Backfill sentiment analysis for existing news items that don't have sentiment data.
This processes all news items in the database that have NULL sentiment values.
"""
import os
import sys

# Ensure we can import local modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import SessionLocal
from models import NewsItem
from engines.sentiment_engine import analyze_sentiment, preload_model


def backfill():
    print("🧠 Sentiment backfill başlatılıyor...")
    print("📥 Model yükleniyor (ilk sefer birkaç dakika sürebilir)...\n")
    
    # Pre-load model before processing
    preload_model()
    
    db = SessionLocal()
    try:
        # Get all items without sentiment
        items = db.query(NewsItem).filter(
            (NewsItem.sentiment == None) | (NewsItem.sentiment == "")
        ).all()
        
        total = len(items)
        if total == 0:
            print("✅ Tüm haberler zaten analiz edilmiş!")
            return
        
        print(f"📊 {total} haber analiz edilecek...\n")
        
        success = 0
        failed = 0
        
        for i, item in enumerate(items, 1):
            # Use summary if available, otherwise title
            text = item.summary or item.title or ""
            if not text.strip():
                failed += 1
                continue
            
            label, score = analyze_sentiment(text)
            
            if label:
                item.sentiment = label
                item.sentiment_score = score
                success += 1
            else:
                failed += 1
            
            # Progress indicator
            if i % 10 == 0 or i == total:
                pct = round(i / total * 100)
                print(f"  [{i}/{total}] %{pct} tamamlandı — ✅ {success} başarılı, ❌ {failed} başarısız")
            
            # Commit every 25 items to avoid losing progress
            if i % 25 == 0:
                db.commit()
        
        # Final commit
        db.commit()
        
        print(f"\n{'='*50}")
        print(f"✅ Backfill tamamlandı!")
        print(f"   Toplam: {total}")
        print(f"   Başarılı: {success}")
        print(f"   Başarısız: {failed}")
        print(f"{'='*50}")
        
    except Exception as e:
        print(f"\n❌ Hata: {e}")
        db.rollback()
    finally:
        db.close()


if __name__ == "__main__":
    backfill()
