"""
Migration: url_hash unique constraint'i global'den (url_hash, tag_id) ikilisine taşı.
"""
from database import engine
from sqlalchemy import text

def run():
    with engine.connect() as conn:
        # MySQL: mevcut unique index'i kaldır, yeni composite unique ekle
        try:
            conn.execute(text("ALTER TABLE news_items DROP INDEX url_hash"))
            print("[OK] Eski url_hash unique index kaldırıldı.")
        except Exception as e:
            print(f"[SKIP] url_hash index kaldırılamadı (zaten yok olabilir): {e}")

        try:
            conn.execute(text(
                "ALTER TABLE news_items ADD CONSTRAINT uq_news_url_tag UNIQUE (url_hash, tag_id)"
            ))
            print("[OK] Yeni (url_hash, tag_id) unique constraint eklendi.")
        except Exception as e:
            print(f"[SKIP] Constraint zaten var olabilir: {e}")

        conn.commit()
    print("Migration tamamlandı.")

if __name__ == "__main__":
    run()
