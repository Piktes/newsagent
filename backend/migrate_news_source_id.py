"""Migration: news_items.source_id (haberin geldiği özel kaynak). Idempotent."""
import os, re, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv()
import pymysql

url = os.getenv("DATABASE_URL", "mysql+pymysql://root:1234@localhost/haberajani?charset=utf8mb4")
u, p, h, d = re.match(r"mysql\+pymysql://([^:]+):([^@]+)@([^/]+)/([^?]+)", url).groups()
conn = pymysql.connect(host=h, user=u, password=p, database=d, charset="utf8mb4", autocommit=False)
cur = conn.cursor()

cur.execute("""SELECT COUNT(*) FROM information_schema.columns
               WHERE table_schema=DATABASE() AND table_name='news_items' AND column_name='source_id'""")
if cur.fetchone()[0] == 0:
    cur.execute("ALTER TABLE news_items ADD COLUMN source_id INT NULL")
    try:
        cur.execute("ALTER TABLE news_items ADD CONSTRAINT fk_news_source FOREIGN KEY (source_id) REFERENCES news_sources(id) ON DELETE SET NULL")
    except Exception as e:
        print(f"[!!] FK eklenemedi (devam): {e}")
    conn.commit()
    print("[OK] news_items.source_id eklendi")
else:
    print("[--] news_items.source_id zaten var")

conn.close()
print("[DONE]")
