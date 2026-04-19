"""
Haberajani - Authentication Module
JWT token management, password hashing, and super admin seeding.
"""
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from dotenv import load_dotenv
import os

from database import get_db
from models import User, UserRole

load_dotenv()

SECRET_KEY = os.getenv("SECRET_KEY", "haberajani-secret")
ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ─── Password Hashing ────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))


# ─── JWT Token ────────────────────────────────────────────

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token süresi dolmuş")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Geçersiz token")


# ─── Current User Dependency ─────────────────────────────

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)) -> User:
    payload = decode_token(token)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Geçersiz token")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None:
        raise HTTPException(status_code=401, detail="Kullanıcı bulunamadı")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Hesap devre dışı")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    if current_user.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=403, detail="Bu işlem için yetkiniz yok")
    return current_user


# ─── Super Admin Seed ────────────────────────────────────

def seed_super_admin(db: Session):
    """Create super admin user if not exists (first run)."""
    existing = db.query(User).filter(User.role == UserRole.SUPER_ADMIN).first()
    if existing:
        return

    admin = User(
        username=os.getenv("SUPER_ADMIN_USERNAME", "admin"),
        email=os.getenv("SUPER_ADMIN_EMAIL", "admin@haberajani.local"),
        password_hash=hash_password(os.getenv("SUPER_ADMIN_PASSWORD", "admin123")),
        role=UserRole.SUPER_ADMIN,
        is_active=True
    )
    db.add(admin)
    db.commit()
    print("[OK] Super Admin olusturuldu!")
