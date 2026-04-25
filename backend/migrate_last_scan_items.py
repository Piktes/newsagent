"""Migration: add last_scan_items_found column to tags table."""
from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE tags ADD COLUMN last_scan_items_found INTEGER"))
        conn.commit()
        print("[OK] last_scan_items_found kolonu eklendi.")
    except Exception as e:
        if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
            print("[OK] Kolon zaten mevcut.")
        else:
            raise
