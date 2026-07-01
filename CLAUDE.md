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
> Login formu e-posta alanıdır — giriş için e-posta kullanılır, username değil.

| E-posta | Rol | Şifre |
|---|---|---|
| `test_superadmin@haberajani.local` | super_admin | SuperAdmin123! |
| `test_admin@haberajani.local` | admin | Admin123! |
| `test_user@haberajani.local` | user | User123! |

**Seed super admin** (uygulama ilk başladığında otomatik):
| E-posta | Şifre |
|---|---|
| `admin@haberajani.local` | `admin123` |

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

Tamamlanan geliştirmeler (commit: 44fb769, push edildi):
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

## Etiket Arama Mantığı (match_mode + context_ops)

Etiket araması iki katmanlıdır: **ana ifade** (`must_phrase`) + **bağlam kelimeleri** (`context_keywords`).

- **`Tag.match_mode`** (`phrase` | `all_words`): ana ifade nasıl eşleşir?
  - `phrase` (varsayılan): kelimeler **yan yana/sıralı** geçmeli (tam ifade). Post-filtrede `must in combined_text`.
  - `all_words`: ifadedeki **her kelime** geçsin, sıra önemsiz. Post-filtrede `all(w in combined_text)`.
  - Upstream'e etkisi: `phrase` → tırnaklı/exact; `all_words` → tırnaksız. Motorlara `exact: bool` bayrağı
    geçilir (`engines/*` search imzaları). NewsAPI: `phrase`→tek keyword, `all_words`→kelime listesi + `keywordOper=and`.
- **`Tag.context_ops`** (JSON, n-1 bağlaç): bağlam kelimeleri arası **per-kelime VE/VEYA**.
  `scheduler.context_groups()` VE aynı gruba ekler, VEYA yeni grup açar → sonuç `OR(AND-grupları)` (VE önceliği).
  `eval_context()` bunu değerlendirir. `context_oper='off'` = SERBEST (bağlamı filtre olarak kullanma).
  Eski etiketler (context_ops yok) `context_oper` ile geriye uyumlu.
- Frontend `TagsPage.jsx`: eşleşme tipi seçici + çip aralarında tıklanabilir VE/VEYA rozetleri + **canlı parantezli önizleme** (`buildPreview`).

## Kaynak Tarama Davranışı

- **Ücretsiz motorlar (rss/youtube/web/twitter) HER ZAMAN çalışır** — özel kaynaklara EK (eski "ya hep ya hiç"
  davranışı kaldırıldı). `scheduler.scan_for_user_tag` içinde free_engines + custom sources ardışık taranır.
- **`NewsItem.source_id`**: haber bir özel kaynaktan geldiyse o `news_sources.id` ile işaretlenir.
  `NewsItem.source_custom_name` (property) kaynak adını verir. Frontend: NewsCard'da **"📌 Özel Kaynak" badge**;
  DashboardPage'de **"Özel Kaynak" filtresi** (`source_id` / `custom_only` params — `routers/news.py:list_news`).
- **NewsAPI limiti 200** (tarama başına `max_results=200`).
- `Tag.published_by_username` (property) → yayınlayan admin kullanıcı adı (TagResponse'ta; UI'da "… tarafından").

## Bülten Sistemi (Günlük Bülten)

Her sabah **09:00 (Europe/Istanbul)** yayınlanmış her etiket için taze haber çekilir + **taslak** bülten oluşur
(`scheduler.daily_bulletin_job`, `cron` job). **Otomatik gönderilmez** — admin/süperadmin önizler, haber çıkarır,
onaylar, sonra abonelere gönderir.

**Modeller:** `Bulletin` (date, tag_ids JSON, status: draft|approved|sent|failed, excluded_news_ids JSON,
approved_by/at, sent_at), `BulletinDelivery` (bulletin_id, user_id, email, channel: email|whatsapp, status, error, sent_at).
`User.phone_number` (WhatsApp), `User.bulletin_subscribed` (opt-out, varsayılan True).

**Akış / dosyalar:**
- `bulletin_service.py`: `bulletin_items()`, `generate_pdf()`, `send_bulletin()`, `resend_to_user()`.
- `utils/pdf.py` `build_news_pdf(items, ...)`: mevcut `news.py:export_pdf` şablonuyla aynı görünüm + **her habere görsel** (thumbnail gömülür).
- `utils/email.py` `send_email(..., attachments=[(name,bytes,'pdf')])`: **şifre sıfırlamayla aynı SMTP** (DB'deki aktif `SmtpSettings` → haberajani@meb.gov.tr).
- `utils/whatsapp.py` `send_whatsapp_document()`: Meta Cloud API (env `WHATSAPP_TOKEN`/`WHATSAPP_PHONE_ID`; yoksa "yapılandırılmamış" olarak başarısız loglanır).
- `routers/bulletin.py` (`/api/bulletin`): admin (list/get/items/exclude/include/approve/send/send-all/create/deliveries/resend/pdf) + kullanıcı (subscription, phone, my/archive, pdf).
- Frontend: `BulletinAdminPage.jsx` (taslak önizleme + çıkar/onay/gönder + teslimat logları + tekrar gönder),
  `BulletinUserPage.jsx` (abone ol/ayrıl + telefon + PDF arşivi), Sidebar'da rol bazlı "Bülten", DashboardPage'de 09:00 notu.

## X (Twitter) API Kotası — kendi sayacımız

X, çağrı/istek sayısı ve $ bakiyeyi API'den vermediği için **kendi kota sayacımızı** tutuyoruz:
- **`XUsageLog`** (`x_usage_logs`): her X çağrısı `kind` (search|account|trends|verify) + user + `requests_used` ile loglanır (`twitter_engine._log_usage`).
- **`XCallQuota`** (`x_call_quota`, tek satır): süperadmin **toplam kotayı** girer; her çağrı düşer; **sıfırlanabilir**.
- Uçlar: `/api/admin/x-call-quota` (GET/PUT/reset — PUT/reset yalnız super_admin), `/api/admin/x-usage-by-user`, `/api/admin/x-usage-by-kind`.
- `/api/admin/x-usage`: X'in `usage/tweets` ucundan **gerçek post-çekme tavanı** + **kredi durumu** (gerçek arama denemesiyle 402 "credits depleted" tespiti). Not: `usage/tweets` maliyeti/istek sayısını vermez (yalnız post sayısı).
- Frontend: `QuotaPage.jsx` X sekmesi — çağrı kotası sayacı, çağrı türü kırılımı, kullanıcı bazında etkileşimli SVG pasta grafik.

## Ek Migration'lar

Şema değişikliklerinden sonra (hepsi idempotent, `py <dosya>` ile çalışır):
```
py migrate_tag_match_mode.py      # tags.match_mode
py migrate_tag_context_ops.py     # tags.context_ops
py migrate_x_usage_logs.py        # x_usage_logs (+ kind kolonu)
py migrate_x_call_quota.py        # x_call_quota
py migrate_bulletin.py            # bulletins, bulletin_deliveries, users.phone_number/bulletin_subscribed
py migrate_news_source_id.py      # news_items.source_id
```

> **Login notu:** Giriş `username` alanı `User.email` ile eşleşir (`routers/users.py:login`) — kullanıcı adıyla değil **e-posta** ile giriş yapılır.
