"""
Haberajani - Departments Router
MEB birim listesi — listeleme (tüm kullanıcılar okuyabilir, admin yönetir).
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import Department, User
from schemas import DepartmentResponse
from auth import get_current_user, require_super_admin

router = APIRouter(prefix="/api/departments", tags=["Departments"])


@router.get("/", response_model=List[DepartmentResponse])
def list_departments(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(Department).order_by(Department.sort_order, Department.name).all()
