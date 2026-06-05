# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Haberajani** — a Turkish social media news aggregator. Users define search tags; a background scheduler scans multiple free sources hourly, de-duplicates via URL hash, and runs Turkish BERT sentiment analysis on results.

## Commands

### Backend
```bash
cd backend
pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
# API docs: http://localhost:8000/docs
```

### Frontend
```bash
cd frontend
npm install
npm run dev          # http://localhost:5173
npm run build        # outputs to dist/
npm run lint
```

### Start Both
```bat
start.bat            # Windows — launches both in separate cmd windows
```

### Tests (backend only)
```bash
cd backend
pytest test_backends.py -v
pytest test_social.py -v
pytest test_wrapper.py -v
```

### Database utilities
```bash
python backfill_sentiment.py   # re-run sentiment on existing articles
python migrate_sentiment.py    # schema migration script
```

## Architecture

### Backend (`backend/`)

**Request lifecycle**: FastAPI → router → SQLAlchemy ORM (SessionLocal via `get_db()` dependency) → SQLite (default) or MySQL.

**Auth flow**: `POST /api/auth/login` → bcrypt verify → JWT (HS256, 24h) → client sends `Authorization: Bearer` header → `get_current_user()` dependency validates token and injects `User` model. `require_admin()` wraps endpoints that need SUPER_ADMIN role.

**Scheduler** (`scheduler.py`): APScheduler fires `scan_all_users()` every hour (+ once 30s after startup). For each user tag it iterates active sources (or falls back to 6 free default engines), calls `engine.search(query, language, max_results)`, filters by tag relevance (Turkish-normalized phrase match), deduplicates via SHA-256 of normalized URL (`url_hash` unique column), runs sentiment, and inserts `NewsItem` rows.

**Engine pattern** (`engines/`):
- `base.py` defines `BaseNewsEngine` (abstract) and `NewsResult` dataclass.
- Concrete engines: `RssEngine` (Google News RSS), `TwitterEngine` (DDGS fallback or Tweepy), `YoutubeEngine`, `WebEngine`, `InstagramEngine`, `EksiSozlukEngine`.
- All free-tier engines use the `ddgs` library (DuckDuckGo) as fallback when no API key is configured.

**Sentiment** (`engines/sentiment_engine.py`): Singleton loading `incidelen/bert-base-turkish-sentiment-analysis-cased` via Hugging Face Transformers on first call. Lazy-loaded — first scan after startup is slow. `analyze_sentiment(text)` returns `(label, score)`.

**Routers** (all prefixed `/api`):
| File | Prefix | Notable detail |
|---|---|---|
| `routers/users.py` | `/auth` | login + user CRUD (admin only) |
| `routers/tags.py` | `/tags` | create tag → triggers background scan immediately |
| `routers/sources.py` | `/sources` | custom source CRUD + API quota tracking |
| `routers/news.py` | `/news` | pagination/filtering, read/favorite/note toggles, CSV export |
| `routers/notifications.py` | `/notifications` | per-tag prefs + WebSocket (`/ws/{user_id}`) |
| `routers/admin.py` | `/admin` | stats, SMTP config, scan logs |

**Environment variables** (backend — all have defaults):
```
DATABASE_URL          # MySQL: mysql+pymysql://root:1234@localhost/haberajani?charset=utf8mb4
SECRET_KEY            # default: haberajani-secret
ACCESS_TOKEN_EXPIRE_MINUTES  # default: 1440 (24h)
SUPER_ADMIN_USERNAME / _EMAIL / _PASSWORD  # seeded on first startup
```

**MySQL bağlantı bilgileri (local dev):**
- Host: localhost
- User: root
- Password: 1234
- Database: haberajani

### Frontend (`frontend/src/`)

**Auth state**: `useAuth` context (in `hooks/useAuth.jsx`) reads `haberajani_token` / `haberajani_user` from localStorage. Axios interceptor in `services/api.js` injects the token and redirects to `/login` on 401.

**Routing**: React Router v7. `ProtectedRoute` wraps all authenticated pages; admin routes additionally check `user.role === 'super_admin'`. Main layout (`AppLayout`) renders `Sidebar` + outlet.

**API calls**: All grouped in `services/api.js` under `authApi`, `tagsApi`, `sourcesApi`, `newsApi`, `notificationsApi`, `adminApi`. Base URL from `VITE_API_BASE` env var, defaults to `http://localhost:8000/api`.

**Theme**: Dark by default; toggled in `Sidebar.jsx`, persisted to localStorage. CSS custom properties (`--bg-primary`, `--accent`, etc.) in `index.css`.

## Key Data Relationships

```
User ──< Tag ──< NewsItem
         │
         └──< NotificationPref
User ──< NewsSource  (custom; if none, scheduler uses 6 default free engines)
User ──< ApiQuota    (per SourceType, resets daily)
```

`NewsItem.url_hash` (SHA-256 of normalized URL) enforces de-duplication at the DB level.

## Non-obvious Behaviors

- **Super admin seeded on startup**: If `SUPER_ADMIN_USERNAME` doesn't exist in the DB, it is created automatically each time the app starts.
- **Tag language field** controls which query language the scheduler uses when searching: `TR` → Turkish queries only, `GLOBAL` → English, `BOTH` → both passes.
- **Relevance filter is post-fetch**: Engines return up to `max_results` items; scheduler then discards any where the tag phrase doesn't appear in title or summary (after Turkish normalization — lowercased, ı→i, ğ→g, etc.).
- **Sentiment is optional**: If the BERT model fails to load or throws, `(None, None)` is stored; the app continues without sentiment data.
- **MySQL support**: Set `DATABASE_URL=mysql+pymysql://user:pass@host/db`; the engine switches to connection pooling (`pool_size=5, pool_recycle=3600`).

## Rol Yapısı (3 Katman)

| Rol | Yetki |
|---|---|
| `user` | Sadece `is_published=True` olan etiketlerin haberlerini görür. Etiket/kaynak yönetemez. |
| `admin` | Etiket oluşturur, haber çeker, son dakika schedule'ı yönetir, haberleri yayınlar. |
| `super_admin` | Admin'in her şeyi + haber gizleme (kullanıcı/birim bazlı) + API Kota + Sistem İyileştirmeleri sekmesi. |

**Yetki dependency'leri** (`auth.py`):
- `require_admin()` → admin VEYA super_admin
- `require_super_admin()` → yalnızca super_admin

## Kullanıcı Grupları (Birimler)

29 MEB birimi `departments` tablosunda, hiyerarşi `parent_id` ile tutulur.
Migration: `python migrate_roles_departments.py`

**Test kullanıcıları** (migrate_roles_departments.py ile oluşturulur):
| Kullanıcı | Rol | Şifre |
|---|---|---|
| `test_superadmin` | super_admin | SuperAdmin123! |
| `test_admin` | admin | Admin123! |
| `test_user` | user | User123! |

## Yayınlama Mekanizması

- `Tag.is_published` switch → ON ise kullanıcı rolü görür
- `Tag.published_by_id` → yayınlayan admin kaydı
- Başka admin aynı tag'i yayınlamaya çalışırsa → 409 hatası
- Endpoint: `PATCH /api/tags/{id}/publish` ve `/unpublish`

## Haber Gizleme (Süper Admin)

- `NewsHide` tablosu: `news_item_id` + `user_id?` + `department_id?`
- Endpoint: `POST /api/news/{id}/hide-for` — body: `{user_id}` veya `{department_id}`
- News sorgusu kullanıcı rolü için NewsHide filtresi uygular

## UserNewsState

`is_read`, `is_favorite`, `user_note` artık `NewsItem` üzerinde değil, `UserNewsState` tablosunda (user_id + news_item_id composite PK). Her kullanıcı için ayrı durum.

## Active Development

Tamamlanan geliştirmeler (push edilmedi):
- 3 katmanlı rol sistemi (user / admin / super_admin)
- 29 MEB birimi DB'de, `departments` tablosu
- `User.department_id` FK
- `Tag.is_published` + publish/unpublish endpoint'leri
- `UserNewsState` modeli (per-user is_read/favorite/note)
- `NewsHide` modeli (süper admin gizleme)
- `require_admin` / `require_super_admin` auth dependency'leri
- Frontend: `isAdmin` / `isSuperAdmin` hook'ları
- Frontend: Sidebar rol bazlı filtreleme (superAdminOnly öğeleri)
- Frontend: TagsPage yayınla switch + kart toggle
- Frontend: UsersPage birim dropdown + 3 rol seçeneği
- Frontend: App.jsx rota kısıtlamaları (adminOnly / superAdminOnly)
- Feedback cevaplama → yalnızca super_admin
- API Kota sayfası → yalnızca super_admin
