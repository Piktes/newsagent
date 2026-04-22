"""
Migration: Add breaking news fields to tags table.
Run once: python migrate_breaking.py
"""
from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE tags ADD COLUMN is_breaking BOOLEAN DEFAULT FALSE"))
        print("[OK] is_breaking eklendi")
    except Exception as e:
        print(f"[SKIP] is_breaking: {e}")

    try:
        conn.execute(text("ALTER TABLE tags ADD COLUMN scan_interval_minutes INTEGER DEFAULT 30"))
        print("[OK] scan_interval_minutes eklendi")
    except Exception as e:
        print(f"[SKIP] scan_interval_minutes: {e}")

    try:
        conn.execute(text("ALTER TABLE tags ADD COLUMN last_breaking_scan DATETIME NULL"))
        print("[OK] last_breaking_scan eklendi")
    except Exception as e:
        print(f"[SKIP] last_breaking_scan: {e}")

    conn.commit()
    print("Migration tamamlandı.")
