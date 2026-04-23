"""
Migration: Twitter/X integration
Adds retweet_count and like_count columns to news_items table.
Safe to run multiple times (skips existing columns).
"""
import sys
from database import engine
from sqlalchemy import text


def run():
    migrations = [
        ("news_items", "retweet_count", "ALTER TABLE news_items ADD COLUMN retweet_count INTEGER"),
        ("news_items", "like_count",    "ALTER TABLE news_items ADD COLUMN like_count INTEGER"),
    ]

    with engine.connect() as conn:
        for table, col, sql in migrations:
            try:
                conn.execute(text(sql))
                conn.commit()
                print(f"[OK] {table}.{col} eklendi")
            except Exception as e:
                if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
                    print(f"[SKIP] {table}.{col} zaten mevcut")
                else:
                    print(f"[HATA] {table}.{col}: {e}")
                    sys.exit(1)

    print("\nMigration tamamlandı.")


if __name__ == "__main__":
    run()
