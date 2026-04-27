"""
Migration: Tag ve GlobalTag tablolarına must_phrase ve context_keywords sütunları ekler.
Çalıştır: python migrate_tag_query.py
"""
from database import engine
from sqlalchemy import text

migrations = [
    ("tags",        "must_phrase",      "VARCHAR(500)"),
    ("tags",        "context_keywords", "TEXT"),
    ("tags",        "context_oper",     "VARCHAR(10) DEFAULT 'or'"),
    ("global_tags", "must_phrase",      "VARCHAR(500)"),
    ("global_tags", "context_keywords", "TEXT"),
]

with engine.connect() as conn:
    for table, column, col_type in migrations:
        try:
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}"))
            print(f"[OK] {table}.{column} eklendi")
        except Exception as e:
            print(f"[SKIP] {table}.{column}: {e}")
    conn.commit()

print("\nMigration tamamlandı.")
