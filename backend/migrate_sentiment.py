"""
Migration script to add sentiment columns to existing news_items table.
Run this once after updating models.py.
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "meejahse.db")


def migrate():
    if not os.path.exists(DB_PATH):
        print("Database not found, will be created on first run.")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Check if columns already exist
    cursor.execute("PRAGMA table_info(news_items)")
    columns = [col[1] for col in cursor.fetchall()]

    if "sentiment" not in columns:
        print("Adding 'sentiment' column...")
        cursor.execute("ALTER TABLE news_items ADD COLUMN sentiment VARCHAR(20)")

    if "sentiment_score" not in columns:
        print("Adding 'sentiment_score' column...")
        cursor.execute("ALTER TABLE news_items ADD COLUMN sentiment_score FLOAT")

    conn.commit()
    conn.close()
    print("✅ Migration completed!")


if __name__ == "__main__":
    migrate()
