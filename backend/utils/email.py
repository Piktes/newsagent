"""
SMTP e-posta gönderme yardımcısı.
Önce DB'deki smtp_settings tablosunu okur (is_active=True),
yoksa ortam değişkenlerine döner: SMTP_HOST, SMTP_PORT, SMTP_FROM, SMTP_USER, SMTP_PASS
"""
import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


def send_password_reset_email(to_email: str, token: str, smtp_cfg=None) -> None:
    if smtp_cfg and smtp_cfg.host:
        host      = smtp_cfg.host
        port      = smtp_cfg.port or 587
        from_addr = smtp_cfg.from_email or "haberajani@meb.gov.tr"
        username  = smtp_cfg.username or ""
        password  = smtp_cfg.password or ""
    else:
        host      = os.getenv("SMTP_HOST", "")
        port      = int(os.getenv("SMTP_PORT", "25"))
        from_addr = os.getenv("SMTP_FROM", "haberajani@meb.gov.tr")
        username  = os.getenv("SMTP_USER", "")
        password  = os.getenv("SMTP_PASS", "")

    if not host:
        raise RuntimeError("SMTP sunucusu tanımlanmamış (DB'de aktif SMTP ayarı yok, SMTP_HOST env de boş)")

    base_url   = os.getenv("APP_BASE_URL", "http://localhost:5173")
    reset_link = f"{base_url}/reset-password/{token}"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Haber Ajanı — Şifre Sıfırlama"
    msg["From"]    = from_addr
    msg["To"]      = to_email

    html = f"""<!DOCTYPE html>
<html lang="tr">
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;background:#f4f6fb;margin:0;padding:24px;">
  <div style="max-width:480px;margin:0 auto;background:#fff;border-radius:8px;
              padding:32px;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    <h2 style="color:#1e40af;margin-top:0;">Haber Ajanı — Şifre Sıfırlama</h2>
    <p>Hesabınız için bir şifre sıfırlama isteği aldık.</p>
    <p>Aşağıdaki butona tıklayarak şifrenizi sıfırlayabilirsiniz.
       Bağlantı <strong>15 dakika</strong> geçerlidir.</p>
    <p style="text-align:center;margin:28px 0;">
      <a href="{reset_link}"
         style="background:#2563eb;color:#fff;padding:12px 28px;
                border-radius:6px;text-decoration:none;font-weight:bold;
                display:inline-block;">
        Şifremi Sıfırla
      </a>
    </p>
    <p style="font-size:0.85em;color:#6b7280;">
      Bu isteği siz yapmadıysanız bu e-postayı dikkate almayınız.
    </p>
    <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;">
    <p style="font-size:0.8em;color:#9ca3af;text-align:center;">
      T.C. Millî Eğitim Bakanlığı — Haber Ajanı Sistemi
    </p>
  </div>
</body>
</html>"""

    msg.attach(MIMEText(html, "html", "utf-8"))

    with smtplib.SMTP(host, port, timeout=10) as server:
        server.ehlo()
        try:
            server.starttls()
            server.ehlo()
        except smtplib.SMTPNotSupportedError:
            pass  # relay STARTTLS desteklemiyorsa düz bağlantıyla devam et
        if username and password:
            server.login(username, password)
        server.sendmail(from_addr, [to_email], msg.as_string())
