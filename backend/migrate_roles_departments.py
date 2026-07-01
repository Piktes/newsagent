"""
Migration: Rol yapısı, birimler, UserNewsState, NewsHide  (MySQL)
- users.role ENUM'a 'admin' eklenir
- departments tablosu oluşturulur (29 MEB birimi seed edilir)
- users tablosuna department_id eklenir
- tags tablosuna is_published, published_by_id, published_at eklenir
- user_news_states tablosu oluşturulur
- news_hides tablosu oluşturulur
- 3 test kullanıcısı oluşturulur (test_superadmin, test_admin, test_user)
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

import pymysql
import bcrypt

DATABASE_URL = os.getenv("DATABASE_URL", "mysql+pymysql://root:1234@localhost/haberajani?charset=utf8mb4")

# Parse bağlantı bilgilerini DATABASE_URL'den çıkar
import re
m = re.match(r"mysql\+pymysql://([^:]+):([^@]+)@([^/]+)/([^?]+)", DATABASE_URL)
if not m:
    print("DATABASE_URL parse edilemedi.")
    sys.exit(1)

db_user, db_pass, db_host, db_name = m.group(1), m.group(2), m.group(3), m.group(4)
print(f"[DB] {db_user}@{db_host}/{db_name}")

conn = pymysql.connect(
    host=db_host, user=db_user, password=db_pass, database=db_name,
    charset="utf8mb4", autocommit=False
)
cur = conn.cursor()
cur.execute("SET sql_mode = ''")  # strict modu kapat


# ─── Yardımcı ─────────────────────────────────────────────

def column_exists(table, column):
    cur.execute("""
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = DATABASE() AND table_name = %s AND column_name = %s
    """, (table, column))
    return cur.fetchone()[0] > 0


def table_exists(table):
    cur.execute("""
        SELECT COUNT(*) FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = %s
    """, (table,))
    return cur.fetchone()[0] > 0


def index_exists(table, index_name):
    cur.execute("""
        SELECT COUNT(*) FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = %s AND index_name = %s
    """, (table, index_name))
    return cur.fetchone()[0] > 0


# ─── 1. users.role 'admin' değerini desteklemeli ─────────

# SQLAlchemy enum NAME kullanir (buyuk harf: SUPER_ADMIN, ADMIN, USER)
cur.execute("""
    SELECT COLUMN_TYPE FROM information_schema.columns
    WHERE table_schema = DATABASE() AND table_name = 'users' AND column_name = 'role'
""")
row = cur.fetchone()
col_type = row[0].decode() if row and isinstance(row[0], bytes) else (row[0] if row else "")

if "'ADMIN'" in col_type:
    print("[--] users.role zaten 'ADMIN' iceriyor")
else:
    try:
        # Once VARCHAR'a cevir, sonra dogru ENUM degerlerini ayarla
        cur.execute("ALTER TABLE users MODIFY COLUMN role VARCHAR(20) NOT NULL DEFAULT 'USER'")
        cur.execute("UPDATE users SET role = 'SUPER_ADMIN' WHERE LOWER(role) = 'super_admin'")
        cur.execute("UPDATE users SET role = 'USER'        WHERE LOWER(role) = 'user'")
        cur.execute("""
            ALTER TABLE users
            MODIFY COLUMN role ENUM('SUPER_ADMIN','ADMIN','USER') NOT NULL DEFAULT 'USER'
        """)
        print("[OK] users.role ENUM('SUPER_ADMIN','ADMIN','USER') olarak ayarlandi")
    except Exception as e:
        print(f"[!!] role kolonu guncellenemedi: {e}")


# ─── 2. departments tablosu ───────────────────────────────

if not table_exists("departments"):
    cur.execute("""
        CREATE TABLE departments (
            id         INT AUTO_INCREMENT PRIMARY KEY,
            name       VARCHAR(200) NOT NULL,
            parent_id  INT NULL,
            sort_order INT DEFAULT 0,
            CONSTRAINT fk_dept_parent FOREIGN KEY (parent_id) REFERENCES departments(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    print("[OK] departments tablosu oluşturuldu")
else:
    print("[--] departments zaten var")


# ─── 3. users: department_id ──────────────────────────────

if not column_exists("users", "department_id"):
    cur.execute("""
        ALTER TABLE users
        ADD COLUMN department_id INT NULL,
        ADD CONSTRAINT fk_user_dept FOREIGN KEY (department_id) REFERENCES departments(id)
    """)
    print("[OK] users.department_id eklendi")
else:
    print("[--] users.department_id zaten var")


# ─── 4. tags: is_published, published_by_id, published_at ─

for col, definition in [
    ("is_published",    "TINYINT(1) NOT NULL DEFAULT 0"),
    ("published_by_id", "INT NULL"),
    ("published_at",    "DATETIME NULL"),
]:
    if not column_exists("tags", col):
        cur.execute(f"ALTER TABLE tags ADD COLUMN {col} {definition}")
        print(f"[OK] tags.{col} eklendi")
    else:
        print(f"[--] tags.{col} zaten var")

# published_by_id FK
if not index_exists("tags", "fk_tag_publisher"):
    try:
        cur.execute("""
            ALTER TABLE tags
            ADD CONSTRAINT fk_tag_publisher FOREIGN KEY (published_by_id) REFERENCES users(id)
        """)
        print("[OK] tags.published_by_id FK eklendi")
    except Exception as e:
        print(f"[!!] FK eklenemedi (devam ediliyor): {e}")


# ─── 5. user_news_states tablosu ─────────────────────────

if not table_exists("user_news_states"):
    cur.execute("""
        CREATE TABLE user_news_states (
            user_id      INT NOT NULL,
            news_item_id INT NOT NULL,
            is_read      TINYINT(1) NOT NULL DEFAULT 0,
            is_favorite  TINYINT(1) NOT NULL DEFAULT 0,
            user_note    TEXT NULL,
            updated_at   DATETIME NULL,
            PRIMARY KEY (user_id, news_item_id),
            CONSTRAINT fk_uns_user FOREIGN KEY (user_id)      REFERENCES users(id)      ON DELETE CASCADE,
            CONSTRAINT fk_uns_news FOREIGN KEY (news_item_id) REFERENCES news_items(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    print("[OK] user_news_states tablosu oluşturuldu")
else:
    print("[--] user_news_states zaten var")


# ─── 6. news_hides tablosu ───────────────────────────────

if not table_exists("news_hides"):
    cur.execute("""
        CREATE TABLE news_hides (
            id            INT AUTO_INCREMENT PRIMARY KEY,
            news_item_id  INT NOT NULL,
            user_id       INT NULL,
            department_id INT NULL,
            hidden_by_id  INT NOT NULL,
            hidden_at     DATETIME NULL,
            CONSTRAINT fk_nh_news   FOREIGN KEY (news_item_id)  REFERENCES news_items(id)   ON DELETE CASCADE,
            CONSTRAINT fk_nh_user   FOREIGN KEY (user_id)       REFERENCES users(id)         ON DELETE CASCADE,
            CONSTRAINT fk_nh_dept   FOREIGN KEY (department_id) REFERENCES departments(id)   ON DELETE CASCADE,
            CONSTRAINT fk_nh_hider  FOREIGN KEY (hidden_by_id)  REFERENCES users(id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    """)
    print("[OK] news_hides tablosu oluşturuldu")
else:
    print("[--] news_hides zaten var")

conn.commit()


# ─── 7. 29 MEB Birimi seed ───────────────────────────────

cur.execute("SELECT COUNT(*) FROM departments")
if cur.fetchone()[0] == 0:
    by_ids = {}
    for i, name in enumerate([
        "Bakan Yardımcılığı - 1",
        "Bakan Yardımcılığı - 2",
        "Bakan Yardımcılığı - 3",
        "Bakan Yardımcılığı - 4",
    ], start=1):
        cur.execute(
            "INSERT INTO departments (name, parent_id, sort_order) VALUES (%s, %s, %s)",
            (name, None, i)
        )
        by_ids[i] = cur.lastrowid

    sub_units = [
        # BY-1 altı
        ("Avrupa Birliği ve Dış İlişkiler Genel Müdürlüğü",       1, 10),
        ("Din Öğretimi Genel Müdürlüğü",                           1, 11),
        ("Hayat Boyu Öğrenme Genel Müdürlüğü",                    1, 12),
        ("Yükseköğretim ve Yurt Dışı Eğitim Genel Müdürlüğü",    1, 13),
        # BY-2 altı
        ("Destek Hizmetleri Genel Müdürlüğü",                     2, 20),
        ("Hukuk Hizmetleri Genel Müdürlüğü",                      2, 21),
        ("Özel Eğitim ve Rehberlik Hizmetleri Genel Müdürlüğü",  2, 22),
        ("Özel Öğretim Kurumları Genel Müdürlüğü",               2, 23),
        # BY-3 altı
        ("Acil Durumlar ve Savunma Planlaması Dairesi Başkanlığı", 3, 30),
        ("Bilgi İşlem Genel Müdürlüğü",                           3, 31),
        ("İnşaat ve Emlak Genel Müdürlüğü",                       3, 32),
        ("Mesleki ve Teknik Eğitim Genel Müdürlüğü",             3, 33),
        ("Strateji Geliştirme Başkanlığı",                         3, 34),
        ("Yenilik ve Eğitim Teknolojileri Genel Müdürlüğü",      3, 35),
        # BY-4 altı
        ("Milli Eğitim Akademisi Başkanlığı",                      4, 40),
        ("Ortaöğretim Genel Müdürlüğü",                           4, 41),
        ("Ölçme, Değerlendirme ve Sınav Hizmetleri Genel Müdürlüğü", 4, 42),
        ("Temel Eğitim Genel Müdürlüğü",                          4, 43),
        # Bağımsız birimler
        ("Yükseköğretim Kurulu",                                   None, 50),
        ("Talim ve Terbiye Kurulu Başkanlığı",                     None, 51),
        ("Personel Genel Müdürlüğü",                               None, 52),
        ("Teftiş Kurulu Başkanlığı",                               None, 53),
        ("Basın ve Halkla İlişkiler Müşavirliği",                  None, 54),
        ("İç Denetim Birimi Başkanlığı",                           None, 55),
        ("Özel Kalem Müdürlüğü",                                   None, 56),
    ]
    for name, by_key, order in sub_units:
        parent_id = by_ids.get(by_key) if by_key else None
        cur.execute(
            "INSERT INTO departments (name, parent_id, sort_order) VALUES (%s, %s, %s)",
            (name, parent_id, order)
        )

    conn.commit()
    cur.execute("SELECT COUNT(*) FROM departments")
    print(f"[OK] {cur.fetchone()[0]} birim eklendi")
else:
    print("[--] Birimler zaten mevcut, atlanıyor")


# ─── 8. Test kullanıcıları ───────────────────────────────

def _hash(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

cur.execute("SELECT id FROM departments WHERE name = 'Bilgi İşlem Genel Müdürlüğü'")
row = cur.fetchone()
bilgi_islem_id = row[0] if row else None

cur.execute("SELECT id FROM departments WHERE name = 'Temel Eğitim Genel Müdürlüğü'")
row = cur.fetchone()
temel_egitim_id = row[0] if row else None

TEST_USERS = [
    ("test_superadmin", "test_superadmin@haberajani.local",
     os.getenv("TEST_SUPERADMIN_PASSWORD", "SuperAdmin123!"), "SUPER_ADMIN", None),
    ("test_admin",      "test_admin@haberajani.local",
     os.getenv("TEST_ADMIN_PASSWORD",      "Admin123!"),      "ADMIN",       bilgi_islem_id),
    ("test_user",       "test_user@haberajani.local",
     os.getenv("TEST_USER_PASSWORD",       "User123!"),       "USER",        temel_egitim_id),
]

for username, email, password, role, dept_id in TEST_USERS:
    cur.execute("SELECT id FROM users WHERE username = %s", (username,))
    if cur.fetchone():
        print(f"[--] {username} zaten var")
        continue
    cur.execute(
        """INSERT INTO users (username, email, password_hash, role, is_active, must_change_password, department_id)
           VALUES (%s, %s, %s, %s, 1, 0, %s)""",
        (username, email, _hash(password), role, dept_id)
    )
    print(f"[OK] {username} ({role}) oluşturuldu  —  şifre: {password}")

conn.commit()
conn.close()
print("\n[DONE] Migration tamamlandı.")
