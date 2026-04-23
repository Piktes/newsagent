"""
Haberajani - Feedback Router
Users submit support tickets with optional screenshots; admins view and respond.
"""
import os
import json
import uuid

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import desc
from datetime import datetime, timezone
from typing import List, Optional

from database import get_db
from models import FeedbackTicket, TicketStatus, User
from schemas import TicketAnswerRequest, TicketCloseRequest, FeedbackTicketResponse
from auth import get_current_user, require_admin

router = APIRouter(prefix="/api/feedback", tags=["Feedback"])

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'uploads', 'feedback')
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp'}
ALLOWED_MIME_TYPES = {'image/jpeg', 'image/png', 'image/gif', 'image/webp'}
MAX_FILE_SIZE = 5 * 1024 * 1024  # 5 MB per file
MAX_FILES = 5


def _parse_attachments(ticket: FeedbackTicket) -> List[str]:
    if not ticket.attachments:
        return []
    try:
        return json.loads(ticket.attachments)
    except Exception:
        return []


def _enrich(ticket: FeedbackTicket) -> dict:
    return {
        "id": ticket.id,
        "user_id": ticket.user_id,
        "user_email": ticket.user.email if ticket.user else None,
        "user_username": ticket.user.username if ticket.user else None,
        "type": ticket.type,
        "subject": ticket.subject,
        "description": ticket.description,
        "status": ticket.status,
        "admin_response": ticket.admin_response,
        "attachments": _parse_attachments(ticket),
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
    }


async def _save_files(files: List[UploadFile]) -> List[str]:
    saved = []
    for f in files:
        if not f or not f.filename:
            continue
        ext = os.path.splitext(f.filename)[1].lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Geçersiz dosya uzantısı: {f.filename}. Yalnızca görsel dosyalar kabul edilir.")
        if f.content_type not in ALLOWED_MIME_TYPES:
            raise HTTPException(status_code=400, detail=f"Geçersiz dosya türü: {f.content_type}. Yalnızca görsel dosyalar kabul edilir.")
        content = await f.read()
        if len(content) > MAX_FILE_SIZE:
            raise HTTPException(status_code=400, detail=f"Dosya çok büyük (max 5 MB): {f.filename}")
        safe_name = f"{uuid.uuid4().hex}{ext}"
        with open(os.path.join(UPLOAD_DIR, safe_name), 'wb') as out:
            out.write(content)
        saved.append(safe_name)
    return saved


@router.post("/", response_model=FeedbackTicketResponse, status_code=201)
async def create_ticket(
    type: str = Form("bug"),
    subject: str = Form(...),
    description: str = Form(...),
    files: Optional[List[UploadFile]] = File(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if len(subject.strip()) < 3:
        raise HTTPException(status_code=400, detail="Konu en az 3 karakter olmalıdır")
    if len(description.strip()) < 10:
        raise HTTPException(status_code=400, detail="Açıklama en az 10 karakter olmalıdır")

    upload_list = [f for f in (files or []) if f and f.filename]
    if len(upload_list) > MAX_FILES:
        raise HTTPException(status_code=400, detail=f"En fazla {MAX_FILES} görsel yüklenebilir")

    saved_files = await _save_files(upload_list)

    ticket = FeedbackTicket(
        user_id=current_user.id,
        type=type,
        subject=subject.strip(),
        description=description.strip(),
        status=TicketStatus.PENDING,
        attachments=json.dumps(saved_files) if saved_files else None,
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return _enrich(ticket)


@router.get("/attachment/{filename}")
def get_attachment(
    filename: str,
    current_user: User = Depends(get_current_user),
):
    # Prevent path traversal
    safe = os.path.basename(filename)
    ext = os.path.splitext(safe)[1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Geçersiz dosya")
    path = os.path.join(UPLOAD_DIR, safe)
    if not os.path.exists(path):
        raise HTTPException(status_code=404, detail="Dosya bulunamadı")
    return FileResponse(path)


@router.get("/", response_model=List[FeedbackTicketResponse])
def my_tickets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tickets = (
        db.query(FeedbackTicket)
        .filter(FeedbackTicket.user_id == current_user.id)
        .order_by(desc(FeedbackTicket.created_at))
        .all()
    )
    return [_enrich(t) for t in tickets]


@router.get("/all", response_model=List[FeedbackTicketResponse])
def all_tickets(
    status: str = None,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    q = db.query(FeedbackTicket).order_by(desc(FeedbackTicket.created_at))
    if status:
        q = q.filter(FeedbackTicket.status == status)
    return [_enrich(t) for t in q.all()]


@router.put("/{ticket_id}/answer", response_model=FeedbackTicketResponse)
def answer_ticket(
    ticket_id: int,
    data: TicketAnswerRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    ticket = db.query(FeedbackTicket).filter(FeedbackTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    ticket.admin_response = data.response
    ticket.status = data.status
    ticket.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ticket)
    return _enrich(ticket)


@router.put("/{ticket_id}/close", response_model=FeedbackTicketResponse)
def close_ticket(
    ticket_id: int,
    data: TicketCloseRequest,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    ticket = db.query(FeedbackTicket).filter(FeedbackTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    ticket.status = TicketStatus.RESOLVED
    if data.note:
        ticket.admin_response = (ticket.admin_response or "") + ("\n\n" if ticket.admin_response else "") + data.note
    ticket.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(ticket)
    return _enrich(ticket)


@router.delete("/{ticket_id}", status_code=204)
def delete_ticket(
    ticket_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    ticket = db.query(FeedbackTicket).filter(FeedbackTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Talep bulunamadı")
    # Clean up uploaded files
    for fname in _parse_attachments(ticket):
        fpath = os.path.join(UPLOAD_DIR, os.path.basename(fname))
        if os.path.exists(fpath):
            os.remove(fpath)
    db.delete(ticket)
    db.commit()
