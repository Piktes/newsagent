"""Migration: tags.context_ops (bağlam kelimeleri arası per-kelime VE/VEYA bağlaçları). Idempotent."""
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
               WHERE table_schema=DATABASE() AND table_name='tags' AND column_name='context_ops'""")
if cur.fetchone()[0] == 0:
    cur.execute("ALTER TABLE tags ADD COLUMN context_ops TEXT NULL AFTER context_keywords")
    conn.commit()
    print("[OK] tags.context_ops kolonu eklendi (eski etiketler context_oper ile geriye uyumlu)")
else:
    print("[--] tags.context_ops zaten var")

conn.close()
print("[DONE]")
