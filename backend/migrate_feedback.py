"""
Migration: create feedback_tickets and error_logs tables.
Run once: python migrate_feedback.py
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv(override=True)

from sqlalchemy import create_engine, text

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./haberajani.db")
engine = create_engine(DATABASE_URL)

with engine.connect() as conn:
    # feedback_tickets
    try:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS feedback_tickets (
                id INTEGER PRIMARY KEY AUTO_INCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id),
                type VARCHAR(20) NOT NULL DEFAULT 'bug',
                subject VARCHAR(200) NOT NULL,
                description TEXT NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                admin_response TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at DATETIME
            )
        """))
        conn.commit()
        print("[OK] feedback_tickets tablosu hazır.")
    except Exception as e:
        print(f"[feedback_tickets] {e}")

    # error_logs
    try:
        conn.execute(text("""
            CREATE TABLE IF NOT EXISTS error_logs (
                id INTEGER PRIMARY KEY AUTO_INCREMENT,
                level VARCHAR(10) DEFAULT 'error',
                path VARCHAR(500),
                method VARCHAR(10),
                message TEXT NOT NULL,
                details TEXT,
                user_id INTEGER,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """))
        conn.commit()
        print("[OK] error_logs tablosu hazır.")
    except Exception as e:
        print(f"[error_logs] {e}")

print("Migrasyon tamamlandı.")
