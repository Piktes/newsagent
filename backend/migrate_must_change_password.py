"""
Migration: Add must_change_password field to users table.
Run once: python3 migrate_must_change_password.py
"""
from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE users ADD COLUMN must_change_password BOOLEAN DEFAULT FALSE"))
        print("[OK] must_change_password eklendi")
    except Exception as e:
        print(f"[SKIP] must_change_password: {e}")
    conn.commit()
    print("Migration tamamlandı.")
