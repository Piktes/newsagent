"""Tüm haberleri, tarama loglarını ve ER kullanım loglarını siler. Etiketler/kullanıcılar korunur."""
from database import SessionLocal
from models import NewsItem, ScanLog, EventRegistryUsageLog, ErrorLog

db = SessionLocal()
try:
    n = db.query(NewsItem).delete()
    s = db.query(ScanLog).delete()
    e = db.query(EventRegistryUsageLog).delete()
    el = db.query(ErrorLog).delete()
    db.commit()
    print(f"Silindi → NewsItem: {n}, ScanLog: {s}, ER Log: {e}, ErrorLog: {el}")
finally:
    db.close()
