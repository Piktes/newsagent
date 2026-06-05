"""
Fix v3: Kalan hatali rolleri duzelt + migrate_roles_departments seed degerlerini guncelle.
"""
import os, re
import pymysql
from dotenv import load_dotenv
load_dotenv()

url = os.getenv("DATABASE_URL", "")
m = re.match(r"mysql\+pymysql://([^:]+):([^@]+)@([^/]+)/([^?]+)", url)
db_user, db_pass, db_host, db_name = m.groups()

conn = pymysql.connect(
    host=db_host, user=db_user, password=db_pass,
    database=db_name, charset="utf8mb4", autocommit=False
)
cur = conn.cursor()

# test_admin rolunu duzelt
cur.execute("UPDATE users SET role = 'ADMIN' WHERE username = 'test_admin'")
print(f"[OK] test_admin -> ADMIN  ({cur.rowcount} satir)")

# Diger enum tablolarinda da ayni sorun olabilir — kontrol et
for tbl, col in [("tags","language"), ("news_items","source_type"), ("news_items","sentiment"),
                  ("news_sources","type"), ("notification_prefs","method"), ("scan_logs","status")]:
    try:
        cur.execute(f"SELECT COLUMN_TYPE FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name=%s AND column_name=%s", (tbl, col))
        row = cur.fetchone()
        if row:
            print(f"  {tbl}.{col}: {row[0]}")
    except Exception:
        pass

conn.commit()

cur.execute("SELECT id, username, role FROM users ORDER BY id")
print("\n=== Kullanicilar ===")
for row in cur.fetchall():
    print(f"  {row[0]} {row[1]} -> {row[2]}")

conn.close()
print("\n[DONE]")
