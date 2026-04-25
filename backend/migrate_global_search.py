"""Migration: global_searches, global_events, global_articles tablolarını oluşturur."""
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import engine
from models import Base, GlobalSearch, GlobalEvent, GlobalArticle, GlobalTag
import sqlalchemy as sa

def run():
    Base.metadata.create_all(bind=engine, tables=[
        GlobalTag.__table__,
        GlobalSearch.__table__,
        GlobalEvent.__table__,
        GlobalArticle.__table__,
    ])
    with engine.connect() as conn:
        for stmt in [
            "ALTER TABLE global_searches ADD COLUMN tag_id INTEGER REFERENCES global_tags(id)",
            "ALTER TABLE global_tags ADD COLUMN lang_filter TEXT",
            "ALTER TABLE global_tags ADD COLUMN country_filter TEXT",
            "ALTER TABLE global_tags ADD COLUMN search_type VARCHAR(20) DEFAULT 'both'",
        ]:
            try:
                conn.execute(sa.text(stmt))
                conn.commit()
            except Exception:
                pass  # zaten varsa atla
    print("[OK] global_searches, global_events, global_articles tabloları oluşturuldu.")

if __name__ == "__main__":
    run()
