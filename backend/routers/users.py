"""
Haberajani - Users Router
Login, user CRUD, admin-only operations.
"""
import re
import secrets
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import User, UserRole, PasswordResetToken
from schemas import LoginRequest, TokenResponse, UserCreate, UserUpdate, UserResponse, ChangePasswordRequest
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_admin
)

router = APIRouter(prefix="/api/auth", tags=["Auth & Users"])


def _validate_password_strength(password: str):
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Şifre en az 8 karakter olmalıdır")
    if not re.search(r'[A-Z]', password):
        raise HTTPException(status_code=400, detail="Şifre en az bir büyük harf içermelidir")
    if not re.search(r'[a-z]', password):
        raise HTTPException(status_code=400, detail="Şifre en az bir küçük harf içermelidir")
    if not re.search(r'\d', password):
        raise HTTPException(status_code=400, detail="Şifre en az bir rakam içermelidir")
    if not re.search(r'[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;\'`~/]', password):
        raise HTTPException(status_code=400, detail="Şifre en az bir sembol içermelidir (!@#$% vb.)")


# ─── Login ────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.username).first()
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Kullanıcı adı veya şifre hatalı")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Hesap devre dışı")

    token = create_access_token(data={"sub": str(user.id), "role": user.role.value})
    return TokenResponse(
        access_token=token,
        user=UserResponse.model_validate(user)
    )


# ─── Current User ────────────────────────────────────────

@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user


# ─── Change Password ─────────────────────────────────────

@router.put("/change-password")
def change_password(
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if not verify_password(data.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Mevcut şifre hatalı")
    _validate_password_strength(data.new_password)
    current_user.password_hash = hash_password(data.new_password)
    current_user.must_change_password = False
    db.commit()
    return {"detail": "Şifre başarıyla değiştirildi"}


# ─── User CRUD (Admin Only) ─────────────────────────────

@router.get("/users", response_model=List[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    return db.query(User).order_by(User.created_at.desc()).all()


@router.post("/users", response_model=UserResponse, status_code=201)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    if not data.email.endswith("@meb.gov.tr"):
        raise HTTPException(status_code=400, detail="Sadece @meb.gov.tr uzantılı e-posta adresleri kabul edilir")
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kullanılıyor")
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Bu e-posta adresi zaten kullanılıyor")

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password("123456"),
        role=data.role,
        is_active=True,
        must_change_password=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.put("/users/{user_id}", response_model=UserResponse)
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")

    if data.email is not None:
        if not data.email.endswith("@meb.gov.tr"):
            raise HTTPException(status_code=400, detail="Sadece @meb.gov.tr uzantılı e-posta adresleri kabul edilir")
        existing = db.query(User).filter(User.email == data.email, User.id != user_id).first()
        if existing:
            raise HTTPException(status_code=400, detail="Bu e-posta zaten kullanılıyor")
        user.email = data.email
    if data.is_active is not None:
        user.is_active = data.is_active
    if data.role is not None:
        user.role = data.role

    db.commit()
    db.refresh(user)
    return user


@router.post("/users/{user_id}/reset-password", status_code=200)
def reset_user_password(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if user.role == UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=400, detail="Super Admin şifresi sıfırlanamaz")
    user.password_hash = hash_password("123456")
    user.must_change_password = True
    db.commit()
    return {"detail": "Şifre 123456 olarak sıfırlandı"}


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="Kullanıcı bulunamadı")
    if user.role == UserRole.SUPER_ADMIN:
        raise HTTPException(status_code=400, detail="Super Admin silinemez")

    db.delete(user)
    db.commit()


# ─── Forgot / Reset Password ─────────────────────────────

class ForgotPasswordRequest(BaseModel):
    email: str


@router.post("/forgot-password", status_code=200)
def forgot_password(data: ForgotPasswordRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    # Always return success to avoid email enumeration
    if not user or not user.is_active:
        return {"detail": "Eğer bu e-posta kayıtlıysa sıfırlama bağlantısı gönderildi"}

    # Invalidate any existing tokens for this user
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == user.id,
        PasswordResetToken.used == False  # noqa: E712
    ).update({"used": True})

    token_value = secrets.token_urlsafe(64)
    reset_token = PasswordResetToken(
        token=token_value,
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
    )
    db.add(reset_token)
    db.commit()

    try:
        from utils.email import send_password_reset_email
        send_password_reset_email(user.email, token_value)
    except Exception as e:
        print(f"[ForgotPassword] E-posta gönderilemedi: {e}")
        # Don't expose error details to client

    return {"detail": "Eğer bu e-posta kayıtlıysa sıfırlama bağlantısı gönderildi"}


@router.post("/reset-password/{token}", status_code=200)
def reset_password_via_token(token: str, db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    record = db.query(PasswordResetToken).filter(
        PasswordResetToken.token == token,
        PasswordResetToken.used == False  # noqa: E712
    ).first()

    if not record:
        raise HTTPException(status_code=400, detail="Geçersiz veya kullanılmış bağlantı")

    expires = record.expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if now > expires:
        raise HTTPException(status_code=400, detail="Bağlantının süresi dolmuş (15 dakika)")

    user = db.query(User).filter(User.id == record.user_id).first()
    if not user:
        raise HTTPException(status_code=400, detail="Kullanıcı bulunamadı")

    user.password_hash = hash_password("123456")
    user.must_change_password = True
    record.used = True
    db.commit()

    return {"detail": "Şifreniz 123456 olarak sıfırlandı. Giriş sonrası yeni şifre belirlemeniz gerekecek."}
