"""
WhatsApp belge (PDF) gönderici — Meta WhatsApp Cloud API.

Kimlik bilgisi ortam değişkenlerinden okunur:
  WHATSAPP_TOKEN        : Kalıcı erişim jetonu (System User token)
  WHATSAPP_PHONE_ID     : Gönderen telefon numarası ID'si
  WHATSAPP_API_VERSION  : (ops.) graph API sürümü, varsayılan v21.0

Kimlik bilgisi yoksa RuntimeError("WhatsApp yapılandırılmamış") fırlatır — çağıran taraf
bunu teslimat logunda "başarısız / yapılandırılmamış" olarak kaydeder (best-effort kanal).

NOT: Bu resmi API yalnızca 24 saatlik konuşma penceresinde serbest metin/medya gönderir;
kullanıcı daha önce mesaj atmadıysa önceden onaylı bir "template" gerekir. Aşağıdaki akış
media upload → document mesajıdır; template gereği kurumsal kuruluma göre eklenebilir.
"""
import os
import requests


def _config():
    token = os.getenv("WHATSAPP_TOKEN", "")
    phone_id = os.getenv("WHATSAPP_PHONE_ID", "")
    version = os.getenv("WHATSAPP_API_VERSION", "v21.0")
    return token, phone_id, version


def is_configured() -> bool:
    token, phone_id, _ = _config()
    return bool(token and phone_id)


def _normalize_phone(phone: str) -> str:
    """Sadece rakamlar (uluslararası format). Baştaki 0/+ temizlenir; 0 ile başlıyorsa TR (90) eklenir."""
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if digits.startswith("0"):
        digits = "90" + digits[1:]
    return digits


def send_whatsapp_document(phone: str, pdf_bytes: bytes, filename: str, caption: str = "") -> None:
    token, phone_id, version = _config()
    if not (token and phone_id):
        raise RuntimeError("WhatsApp yapılandırılmamış (WHATSAPP_TOKEN / WHATSAPP_PHONE_ID env yok)")

    to = _normalize_phone(phone)
    if not to:
        raise RuntimeError("Geçersiz telefon numarası")

    base = f"https://graph.facebook.com/{version}/{phone_id}"
    headers = {"Authorization": f"Bearer {token}"}

    # 1) Medyayı yükle
    up = requests.post(
        f"{base}/media",
        headers=headers,
        data={"messaging_product": "whatsapp", "type": "application/pdf"},
        files={"file": (filename, pdf_bytes, "application/pdf")},
        timeout=30,
    )
    if up.status_code != 200:
        raise RuntimeError(f"WhatsApp medya yükleme hatası: HTTP {up.status_code} {up.text[:300]}")
    media_id = up.json().get("id")
    if not media_id:
        raise RuntimeError(f"WhatsApp medya id alınamadı: {up.text[:300]}")

    # 2) Belge mesajını gönder
    msg = requests.post(
        f"{base}/messages",
        headers={**headers, "Content-Type": "application/json"},
        json={
            "messaging_product": "whatsapp",
            "to": to,
            "type": "document",
            "document": {"id": media_id, "filename": filename, "caption": caption[:1000]},
        },
        timeout=30,
    )
    if msg.status_code not in (200, 201):
        raise RuntimeError(f"WhatsApp mesaj hatası: HTTP {msg.status_code} {msg.text[:300]}")
