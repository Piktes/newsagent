"""
Migration: x_usage_logs tablosu (X/Twitter API kullanimini kullanici bazinda kaydeder).
Kullanici-bazinda kota pasta grafigi icin gereklidir. Idempotent.
"""
import os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from dotenv import load_dotenv
load_dotenv()
import pymysql
from sqlalchemy.engine.url import make_url

url = os.getenv("DATABASE_URL", "mysql+pymysql://root:1234@localhost/haberajani?charset=utf8mb4")
u = make_url(url)
db_user, db_pass, db_host, db_name = u.username, u.password, u.host, u.database
print(f"[DB] {db_user}@{db_host}/{db_name}")

conn = pymysql.connect(host=db_host, user=db_user, password=db_pass,
                       database=db_name, charset="utf8mb4", autocommit=False)
cur = conn.cursor()

cur.execute("""
    SELECT COUNT(*) FROM information_schema.tables
    WHERE table_schema = DATABASE() AND table_name = 'x_usage_logs'
""")
if cur.fetchone()[0] == 0:
    cur.execute("""
        CREATE TABLE x_usage_logs (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            user_id       INT NULL,
            username      VARCHAR(100) NULL,
            action        VARCHAR(200) NOT NULL,
            requests_used INT DEFAULT 1,
            created_at    DATETIME NULL,
            INDEX ix_x_usage_created (created_at),
            INDEX ix_x_usage_username (username),
            CONSTRAINT fk_xusage_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    conn.commit()
    print("[OK] x_usage_logs tablosu olusturuldu")
else:
    print("[--] x_usage_logs zaten var")

conn.close()
print("[DONE]")
