#!/bin/bash
# =============================================================================
# Haberajani — Deploy Script (Ubuntu + MySQL + systemd + nginx)
# Kullanım: sudo ./deploy.sh
# =============================================================================

set -e

# ── Sunucu Ayarları ──────────────────────────────────────────────────────────
APP_DIR="/opt/haberajani"
BACKEND_SERVICE="haberajani"
VENV_DIR="$APP_DIR/backend/venv"
FRONTEND_DIR="$APP_DIR/frontend"
BACKEND_DIR="$APP_DIR/backend"

# DB — @ işareti URL'de %40 olarak encode edilmiştir
DB_HOST="localhost"
DB_NAME="haberajani"
DB_USER="haberajani"
DB_PASS='REMOVED'
DATABASE_URL="mysql+pymysql://${DB_USER}:${DB_PASS}@${DB_HOST}/${DB_NAME}"
# ─────────────────────────────────────────────────────────────────────────────

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
log()  { echo -e "${GREEN}[OK]${NC}   $1"; }
warn() { echo -e "${YELLOW}[!!]${NC}   $1"; }
fail() { echo -e "${RED}[HATA]${NC} $1"; exit 1; }

echo ""
echo "============================================="
echo "  Haberajani Deploy — $(date '+%d.%m.%Y %H:%M')"
echo "============================================="

# ── 1. Git ───────────────────────────────────────────────────────────────────
log "Kod güncelleniyor..."
cd "$APP_DIR"
git fetch origin
git reset --hard origin/master
log "Güncel commit: $(git log -1 --format='%h — %s')"

# ── 2. Python bağımlılıkları ─────────────────────────────────────────────────
log "Python bağımlılıkları yükleniyor..."
cd "$BACKEND_DIR"
[ ! -d "$VENV_DIR" ] && python3 -m venv "$VENV_DIR" && warn "Yeni virtualenv oluşturuldu"
source "$VENV_DIR/bin/activate"
pip install -q --upgrade pip
pip install -q -r requirements.txt
log "Python bağımlılıkları hazır"

# ── 3. DB migration'ları ─────────────────────────────────────────────────────
log "DB migration'ları çalıştırılıyor..."
export DATABASE_URL

# SQLAlchemy tablo oluşturma (yeni tablolar varsa ekler, mevcutlara dokunmaz)
python - <<'PYEOF'
import os, sys
sys.path.insert(0, '.')
os.environ.setdefault('DATABASE_URL', os.environ['DATABASE_URL'])
from database import engine, Base
import models  # tüm modelleri yükle
Base.metadata.create_all(bind=engine)
print("  Tablolar kontrol edildi / oluşturuldu")
PYEOF

# migrate_*.py scriptleri varsa sırayla çalıştır
for script in $(ls "$BACKEND_DIR"/migrate_*.py 2>/dev/null | sort); do
    name=$(basename "$script")
    warn "Migration çalıştırılıyor: $name"
    python "$script" && log "$name tamamlandı" || warn "$name atlandı (zaten uygulanmış olabilir)"
done

log "DB migration tamamlandı"

# ── 4. Backend restart ───────────────────────────────────────────────────────
log "Backend servisi yeniden başlatılıyor..."
systemctl restart "$BACKEND_SERVICE"
sleep 3
systemctl is-active --quiet "$BACKEND_SERVICE" \
    && log "Backend servisi aktif" \
    || fail "Backend başlatılamadı — 'journalctl -u $BACKEND_SERVICE -n 50' kontrol edin"

# ── 5. Frontend build ────────────────────────────────────────────────────────
log "Frontend build başlatılıyor..."
cd "$FRONTEND_DIR"
npm ci --silent
npm run build
log "Frontend build tamamlandı → dist/"

# ── 6. Nginx yeniden yükle ───────────────────────────────────────────────────
if command -v nginx &>/dev/null; then
    nginx -t && systemctl reload nginx
    log "Nginx yeniden yüklendi"
else
    warn "Nginx bulunamadı, atlandı"
fi

# ── Özet ─────────────────────────────────────────────────────────────────────
echo ""
echo "============================================="
log "Deploy tamamlandı!"
echo "  Commit : $(git log -1 --format='%h — %s')"
echo "  Tarih  : $(date '+%d.%m.%Y %H:%M:%S')"
echo "============================================="
echo ""
