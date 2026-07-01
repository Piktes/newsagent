"""Migration: tags.breaking_paused (super_admin tarafindan son dakika taramasini gecici durdurma). Idempotent."""
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

cur.execute("""SELECT COUNT(*) FROM information_schema.columns
               WHERE table_schema=DATABASE() AND table_name='tags' AND column_name='breaking_paused'""")
if cur.fetchone()[0] == 0:
    cur.execute("ALTER TABLE tags ADD COLUMN breaking_paused TINYINT(1) NOT NULL DEFAULT 0")
    conn.commit()
    print("[OK] tags.breaking_paused kolonu eklendi")
else:
    print("[--] tags.breaking_paused zaten var")

conn.close()
print("[DONE]")
