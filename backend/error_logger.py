"""
Haberajani - Error Logger
Persist unhandled errors to the error_logs table.
"""
import traceback


def log_error(message: str, details: str = None, path: str = None,
              method: str = None, user_id: int = None, level: str = "error"):
    """Write an error entry to DB. Never raises — safe to call from anywhere."""
    try:
        from database import SessionLocal
        from models import ErrorLog
        db = SessionLocal()
        try:
            entry = ErrorLog(
                level=level,
                path=(path or "")[:500],
                method=(method or "")[:10],
                message=str(message)[:2000],
                details=(str(details)[:5000] if details else None),
                user_id=user_id,
            )
            db.add(entry)
            db.commit()
        except Exception:
            db.rollback()
        finally:
            db.close()
    except Exception:
        pass


def log_exception(exc: Exception, path: str = None, method: str = None, user_id: int = None):
    """Convenience wrapper that formats the full traceback as details."""
    log_error(
        message=f"{type(exc).__name__}: {exc}",
        details=traceback.format_exc(),
        path=path,
        method=method,
        user_id=user_id,
        level="error",
    )
