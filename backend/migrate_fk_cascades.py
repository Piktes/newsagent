"""
Migration: eksik ON DELETE CASCADE'leri ekler.
- news_items.tag_id -> tags.id
- notification_prefs.tag_id -> tags.id
- favorite_list_items.news_id -> news_items.id
- favorite_list_items.list_id -> favorite_lists.id

Bunlar cascade'siz oldugu icin etiket/haber/liste silme islemleri MySQL 1451
("Cannot delete or update a parent row") hatasiyla basarisiz oluyordu.
Idempotent — zaten CASCADE olan constraint'lere dokunmaz.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv()
import pymysql
from sqlalchemy.engine.url import make_url

url = os.getenv("DATABASE_URL", "mysql+pymysql://root:1234@localhost/haberajani?charset=utf8mb4")
_u = make_url(url)
u, p, h, d = _u.username, _u.password, _u.host, _u.database
conn = pymysql.connect(host=h, user=u, password=p, database=d, charset="utf8mb4", autocommit=False)
cur = conn.cursor()

TARGETS = [
    ("news_items", "tag_id", "tags", "id"),
    ("notification_prefs", "tag_id", "tags", "id"),
    ("favorite_list_items", "news_id", "news_items", "id"),
    ("favorite_list_items", "list_id", "favorite_lists", "id"),
]

for table, column, ref_table, ref_col in TARGETS:
    cur.execute("""
        SELECT kcu.CONSTRAINT_NAME, rc.DELETE_RULE
        FROM information_schema.KEY_COLUMN_USAGE kcu
        JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
          ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND rc.CONSTRAINT_SCHEMA = kcu.CONSTRAINT_SCHEMA
        WHERE kcu.TABLE_SCHEMA = DATABASE() AND kcu.TABLE_NAME = %s AND kcu.COLUMN_NAME = %s
          AND kcu.REFERENCED_TABLE_NAME = %s
    """, (table, column, ref_table))
    row = cur.fetchone()
    if not row:
        print(f"[SKIP] {table}.{column} -> {ref_table}: FK bulunamadı (tablo yok olabilir)")
        continue
    constraint_name, delete_rule = row
    if delete_rule == "CASCADE":
        print(f"[--] {table}.{column} zaten ON DELETE CASCADE")
        continue
    try:
        cur.execute(f"ALTER TABLE {table} DROP FOREIGN KEY {constraint_name}")
        cur.execute(
            f"ALTER TABLE {table} ADD CONSTRAINT {constraint_name} "
            f"FOREIGN KEY ({column}) REFERENCES {ref_table}({ref_col}) ON DELETE CASCADE"
        )
        conn.commit()
        print(f"[OK] {table}.{column} -> ON DELETE CASCADE eklendi")
    except Exception as e:
        conn.rollback()
        print(f"[HATA] {table}.{column}: {e}")

conn.close()
print("[DONE]")
