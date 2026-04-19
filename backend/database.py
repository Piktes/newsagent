"""
Haberajani - Database Configuration
SQLAlchemy + MySQL/SQLite
"""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, DeclarativeBase
from dotenv import load_dotenv
import os

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./haberajani.db")

# SQLite needs check_same_thread=False, MySQL doesn't
if DATABASE_URL.startswith("sqlite"):
    engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
else:
    engine = create_engine(DATABASE_URL, pool_size=10, max_overflow=20, pool_recycle=3600)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


def get_db():
    """Dependency injection for database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db():
    """Create all tables and run safe migrations."""
    from sqlalchemy import text
    Base.metadata.create_all(bind=engine)
    with engine.connect() as conn:
        # Add is_hidden column if missing
        try:
            conn.execute(text("ALTER TABLE news_items ADD COLUMN is_hidden BOOLEAN DEFAULT 0"))
            conn.commit()
        except Exception:
            pass
        # Migrate DESKTOP → BROWSER in notification_prefs
        try:
            conn.execute(text("UPDATE notification_prefs SET method='browser' WHERE method='desktop'"))
            conn.commit()
        except Exception:
            pass
