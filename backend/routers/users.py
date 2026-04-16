"""
Haberajani - Users Router
Login, user CRUD, admin-only operations.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import User, UserRole
from schemas import LoginRequest, TokenResponse, UserCreate, UserUpdate, UserResponse
from auth import (
    hash_password, verify_password, create_access_token,
    get_current_user, require_admin
)

router = APIRouter(prefix="/api/auth", tags=["Auth & Users"])


# ─── Login ────────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
def login(request: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == request.username).first()
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
    # Check duplicates
    if db.query(User).filter(User.username == data.username).first():
        raise HTTPException(status_code=400, detail="Bu kullanıcı adı zaten kullanılıyor")
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=400, detail="Bu e-posta adresi zaten kullanılıyor")

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        role=data.role,
        is_active=True
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
