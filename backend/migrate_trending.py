"""
Migration: add is_trending column to news_items table.
Run once: python migrate_trending.py
"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))

from dotenv import load_dotenv
load_dotenv(override=True)

from sqlalchemy import create_engine, text
import os
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./haberajani.db")

engine = create_engine(DATABASE_URL)
with engine.connect() as conn:
    try:
        conn.execute(text("ALTER TABLE news_items ADD COLUMN is_trending BOOLEAN DEFAULT FALSE"))
        conn.commit()
        print("[OK] is_trending kolonu eklendi.")
    except Exception as e:
        print(f"[Not] Zaten mevcut olabilir: {e}")
