"""
Meejahse - Notifications Router
Notification preferences and WebSocket endpoint.
"""
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List
import json

from database import get_db
from models import NotificationPref, Tag, User
from schemas import NotificationPrefCreate, NotificationPrefResponse
from auth import get_current_user

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

# Active WebSocket connections per user
active_connections: dict[int, list[WebSocket]] = {}


@router.get("/preferences", response_model=List[NotificationPrefResponse])
def list_prefs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    prefs = db.query(NotificationPref).filter(
        NotificationPref.user_id == current_user.id
    ).all()

    result = []
    for p in prefs:
        resp = NotificationPrefResponse.model_validate(p)
        tag = db.query(Tag).filter(Tag.id == p.tag_id).first()
        if tag:
            resp.tag_name = tag.name
        result.append(resp)
    return result


@router.post("/preferences", response_model=NotificationPrefResponse, status_code=201)
def create_pref(
    data: NotificationPrefCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Check tag exists
    tag = db.query(Tag).filter(Tag.id == data.tag_id, Tag.user_id == current_user.id).first()
    if not tag:
        raise HTTPException(status_code=404, detail="Etiket bulunamadı")

    # Check existing pref
    existing = db.query(NotificationPref).filter(
        NotificationPref.user_id == current_user.id,
        NotificationPref.tag_id == data.tag_id
    ).first()
    if existing:
        existing.method = data.method
        existing.enabled = data.enabled
        db.commit()
        db.refresh(existing)
        resp = NotificationPrefResponse.model_validate(existing)
        resp.tag_name = tag.name
        return resp

    pref = NotificationPref(
        user_id=current_user.id,
        tag_id=data.tag_id,
        method=data.method,
        enabled=data.enabled
    )
    db.add(pref)
    db.commit()
    db.refresh(pref)
    resp = NotificationPrefResponse.model_validate(pref)
    resp.tag_name = tag.name
    return resp


@router.delete("/preferences/{pref_id}", status_code=204)
def delete_pref(
    pref_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    pref = db.query(NotificationPref).filter(
        NotificationPref.id == pref_id,
        NotificationPref.user_id == current_user.id
    ).first()
    if not pref:
        raise HTTPException(status_code=404, detail="Bildirim tercihi bulunamadı")

    db.delete(pref)
    db.commit()


# ─── WebSocket ────────────────────────────────────────────

@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    await websocket.accept()

    if user_id not in active_connections:
        active_connections[user_id] = []
    active_connections[user_id].append(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            # Keep-alive pong
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        active_connections[user_id].remove(websocket)
        if not active_connections[user_id]:
            del active_connections[user_id]


async def send_notification(user_id: int, message: dict):
    """Send notification to all active WebSocket connections for a user."""
    if user_id in active_connections:
        for ws in active_connections[user_id]:
            try:
                await ws.send_text(json.dumps(message, ensure_ascii=False))
            except Exception:
                pass
