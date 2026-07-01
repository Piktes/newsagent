"""
Migration: tag_news_matches (paylasimli arsiv - Asama A).

NewsItem artik tek bir etikete kilitli degil: bir haberi hangi etiketin
eslestirdigini bu M:N tablo tutar. Bu asama SADECE EKLEYICI (additive) -
mevcut news_items.tag_id davranisi degismez, sadece paralel bir kayit olusur.
Idempotent. sqlalchemy.engine.url.make_url ile DATABASE_URL parse edilir
(bkz. migrate_roles_departments.py deseni - elle regex sifredeki ozel
karakterlerde patlar).
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


def table_exists(table):
    cur.execute("""
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = %s
    """, (table,))
    return cur.fetchone()[0] > 0


# 1) Tablo
if not table_exists("tag_news_matches"):
    cur.execute("""
        CREATE TABLE tag_news_matches (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            tag_id        INT NOT NULL,
            news_item_id  INT NOT NULL,
            matched_at    DATETIME NULL,
            source_type   VARCHAR(20) NULL,
            UNIQUE KEY uq_tag_news_match (tag_id, news_item_id),
            CONSTRAINT fk_tnm_tag  FOREIGN KEY (tag_id)       REFERENCES tags(id)       ON DELETE CASCADE,
            CONSTRAINT fk_tnm_news FOREIGN KEY (news_item_id) REFERENCES news_items(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    conn.commit()
    print("[OK] tag_news_matches tablosu oluşturuldu")
else:
    print("[--] tag_news_matches zaten var")

# 2) Mevcut news_items'tan doldur — her (tag_id, id) çifti için bir satır.
#    Bu adım davranışı DEĞİŞTİRMEZ, sadece paralel/ek bir kayıt oluşturur.
cur.execute("SELECT COUNT(*) FROM tag_news_matches")
existing_count = cur.fetchone()[0]
cur.execute("SELECT COUNT(*) FROM news_items")
total_news = cur.fetchone()[0]

if existing_count < total_news:
    cur.execute("""
        INSERT IGNORE INTO tag_news_matches (tag_id, news_item_id, matched_at, source_type)
        SELECT ni.tag_id, ni.id, COALESCE(ni.fetched_at, NOW()), ni.source_type
        FROM news_items ni
    """)
    conn.commit()
    cur.execute("SELECT COUNT(*) FROM tag_news_matches")
    print(f"[OK] tag_news_matches dolduruldu — toplam {cur.fetchone()[0]} satır (news_items: {total_news})")
else:
    print(f"[--] tag_news_matches zaten dolu ({existing_count} satır)")

conn.close()
print("[DONE]")
