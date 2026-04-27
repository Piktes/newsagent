"""
Migration: feedback_tickets tablosuna attachments kolonu ekler.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from database import engine
from sqlalchemy import text

with engine.connect() as conn:
    try:
        conn.execute(text(
            "ALTER TABLE feedback_tickets ADD COLUMN attachments TEXT NULL"
        ))
        conn.commit()
        print("OK: attachments kolonu eklendi.")
    except Exception as e:
        if "Duplicate column name" in str(e) or "1060" in str(e):
            print("SKIP: attachments kolonu zaten mevcut.")
        else:
            raise
