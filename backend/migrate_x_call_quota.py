"""Migration: x_call_quota (elle yonetilen X cagri kotasi). Idempotent."""
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

cur.execute("""SELECT COUNT(*) FROM information_schema.tables
               WHERE table_schema=DATABASE() AND table_name='x_call_quota'""")
if cur.fetchone()[0] == 0:
    cur.execute("""
        CREATE TABLE x_call_quota (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            total_quota INT DEFAULT 0,
            reset_at    DATETIME NULL,
            updated_by  VARCHAR(100) NULL,
            updated_at  DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    # tek satir baslat
    cur.execute("INSERT INTO x_call_quota (total_quota, reset_at, updated_by, updated_at) VALUES (0, NULL, NULL, NOW())")
    conn.commit()
    print("[OK] x_call_quota tablosu olusturuldu (bos baslangic)")
else:
    print("[--] x_call_quota zaten var")

conn.close()
print("[DONE]")
