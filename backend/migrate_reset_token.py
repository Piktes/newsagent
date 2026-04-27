"""
Migration: password_reset_tokens tablosunu oluşturur.
"""
import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from database import engine, Base
from models import PasswordResetToken  # noqa: registers table

Base.metadata.create_all(bind=engine, tables=[PasswordResetToken.__table__])
print("password_reset_tokens tablosu oluşturuldu / zaten mevcuttu.")
