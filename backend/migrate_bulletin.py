"""Migration: Bülten sistemi — bulletins, bulletin_deliveries tabloları + users kolonları. Idempotent."""
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


def col_exists(table, col):
    cur.execute("""SELECT COUNT(*) FROM information_schema.columns
                   WHERE table_schema=DATABASE() AND table_name=%s AND column_name=%s""", (table, col))
    return cur.fetchone()[0] > 0


def table_exists(table):
    cur.execute("""SELECT COUNT(*) FROM information_schema.tables
                   WHERE table_schema=DATABASE() AND table_name=%s""", (table,))
    return cur.fetchone()[0] > 0


# ── users kolonları ──
if not col_exists("users", "phone_number"):
    cur.execute("ALTER TABLE users ADD COLUMN phone_number VARCHAR(20) NULL")
    print("[OK] users.phone_number eklendi")
else:
    print("[--] users.phone_number zaten var")

if not col_exists("users", "bulletin_subscribed"):
    cur.execute("ALTER TABLE users ADD COLUMN bulletin_subscribed TINYINT(1) NOT NULL DEFAULT 1")
    cur.execute("UPDATE users SET bulletin_subscribed=1 WHERE bulletin_subscribed IS NULL")
    print("[OK] users.bulletin_subscribed eklendi (herkes abone / opt-out)")
else:
    print("[--] users.bulletin_subscribed zaten var")

# ── bulletins tablosu ──
if not table_exists("bulletins"):
    cur.execute("""
        CREATE TABLE bulletins (
            id                INT AUTO_INCREMENT PRIMARY KEY,
            date              DATE NOT NULL,
            tag_ids           TEXT NOT NULL,
            title             VARCHAR(300) NULL,
            status            VARCHAR(20) DEFAULT 'draft',
            excluded_news_ids TEXT NULL,
            created_at        DATETIME NULL,
            approved_by_id    INT NULL,
            approved_at       DATETIME NULL,
            sent_at           DATETIME NULL,
            INDEX ix_bulletins_date (date),
            CONSTRAINT fk_bulletin_approver FOREIGN KEY (approved_by_id) REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    print("[OK] bulletins tablosu olusturuldu")
else:
    print("[--] bulletins zaten var")

# ── bulletin_deliveries tablosu ──
if not table_exists("bulletin_deliveries"):
    cur.execute("""
        CREATE TABLE bulletin_deliveries (
            id           INT AUTO_INCREMENT PRIMARY KEY,
            bulletin_id  INT NOT NULL,
            user_id      INT NULL,
            email        VARCHAR(200) NULL,
            channel      VARCHAR(20) DEFAULT 'email',
            status       VARCHAR(20) DEFAULT 'sent',
            error        TEXT NULL,
            sent_at      DATETIME NULL,
            INDEX ix_delivery_bulletin (bulletin_id),
            CONSTRAINT fk_delivery_bulletin FOREIGN KEY (bulletin_id) REFERENCES bulletins(id) ON DELETE CASCADE,
            CONSTRAINT fk_delivery_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    print("[OK] bulletin_deliveries tablosu olusturuldu")
else:
    print("[--] bulletin_deliveries zaten var")

conn.commit()
conn.close()
print("[DONE]")
