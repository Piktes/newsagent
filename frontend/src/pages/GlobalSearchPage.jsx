import { useState, useEffect, useRef } from 'react';
import {
  Globe, Search, Trash2,
  FileText, BarChart2, ExternalLink, Plus, TrendingUp, TrendingDown, Minus,
  X, Edit2, Check, Languages, ArrowUpDown,
} from 'lucide-react';
import { globalSearchApi } from '../services/api';

// ─── Static config ────────────────────────────────────────────────

const LANGUAGES = [
  { code: 'eng', label: 'İngilizce' },
  { code: 'deu', label: 'Almanca' },
  { code: 'fra', label: 'Fransızca' },
  { code: 'ara', label: 'Arapça' },
  { code: 'spa', label: 'İspanyolca' },
  { code: 'ita', label: 'İtalyanca' },
  { code: 'por', label: 'Portekizce' },
  { code: 'zho', label: 'Çince' },
  { code: 'jpn', label: 'Japonca' },
];

const COUNTRIES = [
  { code: 'US', label: '🇺🇸 ABD' },
  { code: 'GB', label: '🇬🇧 İngiltere' },
  { code: 'DE', label: '🇩🇪 Almanya' },
  { code: 'FR', label: '🇫🇷 Fransa' },
  { code: 'SA', label: '🇸🇦 S. Arabistan' },
  { code: 'AE', label: '🇦🇪 BAE' },
  { code: 'AU', label: '🇦🇺 Avustralya' },
  { code: 'JP', label: '🇯🇵 Japonya' },
  { code: 'CN', label: '🇨🇳 Çin' },
  { code: 'IN', label: '🇮🇳 Hindistan' },
  { code: 'BR', label: '🇧🇷 Brezilya' },
  { code: 'PL', label: '🇵🇱 Polonya' },
  { code: 'NL', label: '🇳🇱 Hollanda' },
  { code: 'ES', label: '🇪🇸 İspanya' },
  { code: 'IT', label: '🇮🇹 İtalya' },
];

const FLAG_MAP = { US:'🇺🇸', GB:'🇬🇧', DE:'🇩🇪', FR:'🇫🇷', TR:'🇹🇷', SA:'🇸🇦', AU:'🇦🇺', CA:'🇨🇦', JP:'🇯🇵', CN:'🇨🇳', RU:'🇷🇺', IN:'🇮🇳', BR:'🇧🇷', IT:'🇮🇹', ES:'🇪🇸', NL:'🇳🇱', PL:'🇵🇱', AE:'🇦🇪' };
const flag = (code) => FLAG_MAP[code?.toUpperCase()] || '🌐';

// ─── Sentiment helpers ─────────────────────────────────────────────

function SentimentMini({ value }) {
  if (value == null) return <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>—</span>;
  const pct = Math.round(((value + 1) / 2) * 100);
  const color = value < -0.15 ? '#ef4444' : value > 0.15 ? '#10b981' : '#6b7280';
  const label = value < -0.15 ? 'Olumsuz' : value > 0.15 ? 'Olumlu' : 'Nötr';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
      <div style={{ width: 60, height: 5, borderRadius: 3, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ fontSize: '0.7rem', color, fontWeight: 600 }}>{label}</span>
    </div>
  );
}

function SentimentStatsBlock({ articles }) {
  if (!articles || articles.length === 0) return null;
  const withSentiment = articles.filter(a => a.sentiment != null);
  if (withSentiment.length === 0) return null;
  const positive = withSentiment.filter(a => a.sentiment > 0.15).length;
  const negative = withSentiment.filter(a => a.sentiment < -0.15).length;
  const neutral  = withSentiment.length - positive - negative;
  const total    = withSentiment.length;
  const avg      = withSentiment.reduce((s, a) => s + a.sentiment, 0) / total;
  const posP = Math.round((positive / total) * 100);
  const negP = Math.round((negative / total) * 100);
  const neuP = 100 - posP - negP;
  return (
    <div className="card" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        Medya Tutumu
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {[
          { key: 'positive', label: 'Olumlu',  count: positive, Icon: TrendingUp },
          { key: 'neutral',  label: 'Nötr',    count: neutral,  Icon: Minus },
          { key: 'negative', label: 'Olumsuz', count: negative, Icon: TrendingDown },
        ].map(({ key, label, count, Icon }) => (
          <div key={key} className={`sentiment-stat-card ${key}`} style={{ cursor: 'default' }}>
            <span className="sentiment-stat-emoji"><Icon size={20} /></span>
            <span className="sentiment-stat-value">{count}</span>
            <span className="sentiment-stat-label">{label}</span>
          </div>
        ))}
      </div>
      <div className="sentiment-bar">
        {posP > 0 && <div className="sentiment-bar-segment positive" style={{ width: `${posP}%` }} />}
        {neuP > 0 && <div className="sentiment-bar-segment neutral"  style={{ width: `${neuP}%` }} />}
        {negP > 0 && <div className="sentiment-bar-segment negative" style={{ width: `${negP}%` }} />}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>
        <span style={{ color: '#10b981' }}>%{posP} olumlu</span>
        <span>Ort. {avg >= 0 ? '+' : ''}{avg.toFixed(2)}</span>
        <span style={{ color: '#ef4444' }}>%{negP} olumsuz</span>
      </div>
    </div>
  );
}

// ─── MultiSelect chip toggle ───────────────────────────────────────

function ChipSelect({ options, value, onChange, label }) {
  const all = !value || value.length === 0;
  return (
    <div>
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '0.35rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem' }}>
        <button
          type="button"
          onClick={() => onChange(null)}
          style={{
            padding: '0.2rem 0.55rem', borderRadius: 12, fontSize: '0.72rem', cursor: 'pointer',
            border: `1px solid ${all ? 'var(--accent)' : 'var(--border)'}`,
            background: all ? 'var(--accent-glow)' : 'var(--bg-secondary)',
            color: all ? 'var(--accent-light)' : 'var(--text-muted)',
            fontWeight: all ? 600 : 400,
          }}
        >
          Tümü
        </button>
        {options.map(opt => {
          const active = value?.includes(opt.code);
          return (
            <button
              key={opt.code}
              type="button"
              onClick={() => {
                const cur = value || [];
                onChange(active ? (cur.filter(c => c !== opt.code).length ? cur.filter(c => c !== opt.code) : null) : [...cur, opt.code]);
              }}
              style={{
                padding: '0.2rem 0.55rem', borderRadius: 12, fontSize: '0.72rem', cursor: 'pointer',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'var(--accent-glow)' : 'var(--bg-secondary)',
                color: active ? 'var(--accent-light)' : 'var(--text-muted)',
                fontWeight: active ? 600 : 400,
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Event / Article cards ─────────────────────────────────────────

function EventCard({ ev }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="card" style={{ padding: '0.875rem 1rem', marginBottom: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        {ev.image_url && (
          <img src={ev.image_url} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} onError={e => e.target.style.display='none'} />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem', lineHeight: 1.35 }}>{ev.title}</div>
          {ev.summary && (
            <p style={{ margin: '0 0 0.35rem', fontSize: '0.78rem', color: 'var(--text-secondary)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
              {ev.summary}
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
            {ev.event_date && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{ev.event_date}</span>}
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              <FileText size={10} style={{ display: 'inline', marginRight: 2 }} />{ev.article_count} makale
            </span>
            <SentimentMini value={ev.sentiment} />
            <div style={{ display: 'flex', gap: 2 }}>
              {(ev.source_countries || []).slice(0, 6).map((c, i) => (
                <span key={i} title={c} style={{ fontSize: '0.85rem' }}>{flag(c)}</span>
              ))}
            </div>
          </div>
          {ev.concepts?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginTop: '0.35rem' }}>
              {ev.concepts.slice(0, 5).map((c, i) => (
                <span key={i} style={{ fontSize: '0.65rem', padding: '1px 5px', borderRadius: 10, background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>{c}</span>
              ))}
            </div>
          )}
        </div>
        <div style={{ flexShrink: 0, color: 'var(--text-muted)' }}>
          {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
        </div>
      </div>
      {open && ev.articles?.length > 0 && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {ev.articles.map(art => <ArticleRow key={art.id} art={art} />)}
        </div>
      )}
      {open && (!ev.articles || ev.articles.length === 0) && (
        <div style={{ marginTop: '0.625rem', paddingTop: '0.625rem', borderTop: '1px solid var(--border)', fontSize: '0.78rem', color: 'var(--text-muted)', textAlign: 'center' }}>
          Bu olay için makale detayı mevcut değil.
        </div>
      )}
    </div>
  );
}

function ArticleRow({ art }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
      {art.image_url && (
        <img src={art.image_url} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} onError={e => e.target.style.display='none'} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.15rem' }}>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0 }}>{art.source_name}</span>
          {art.language && <span style={{ fontSize: '0.65rem', background: 'var(--bg-secondary)', padding: '0px 4px', borderRadius: 4, color: 'var(--text-muted)' }}>{art.language}</span>}
          {art.published_at && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }}>{art.published_at?.slice(0, 10)}</span>}
        </div>
        <div style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.15rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{art.title}</div>
        {art.body && <p style={{ margin: 0, fontSize: '0.73rem', color: 'var(--text-secondary)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{art.body}</p>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.25rem', flexShrink: 0 }}>
        <SentimentMini value={art.sentiment} />
        {art.url && (
          <a href={art.url} target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: 2 }}>
            <ExternalLink size={10} /> Oku
          </a>
        )}
      </div>
    </div>
  );
}

// ─── Search results (Dashboard-style) ────────────────────────────

function SearchResults({ search }) {
  const [sortOrder, setSortOrder] = useState('desc');
  const [sentimentFilter, setSentimentFilter] = useState('');
  const [query, setQuery] = useState('');

  const articles = (search.articles || []);
  const withSentiment = articles.filter(a => a.sentiment != null);
  const positive = withSentiment.filter(a => a.sentiment > 0.15).length;
  const negative = withSentiment.filter(a => a.sentiment < -0.15).length;
  const neutral  = withSentiment.length - positive - negative;
  const total    = withSentiment.length;
  const posP = total > 0 ? Math.round((positive / total) * 100) : 0;
  const negP = total > 0 ? Math.round((negative / total) * 100) : 0;
  const neuP = 100 - posP - negP;

  const filtered = articles
    .filter(a => {
      if (sentimentFilter === 'positive') return a.sentiment != null && a.sentiment > 0.15;
      if (sentimentFilter === 'negative') return a.sentiment != null && a.sentiment < -0.15;
      if (sentimentFilter === 'neutral')  return a.sentiment != null && a.sentiment >= -0.15 && a.sentiment <= 0.15;
      return true;
    })
    .filter(a => !query || a.title?.toLowerCase().includes(query.toLowerCase()) || a.body?.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      const da = new Date(a.published_at || 0).getTime();
      const db = new Date(b.published_at || 0).getTime();
      return sortOrder === 'desc' ? db - da : da - db;
    });

  return (
    <>
      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value">{search.article_count}</span>
          <span className="stat-label">Makale</span>
        </div>
        <div className="stat-card accent">
          <span className="stat-value">{positive}</span>
          <span className="stat-label">Olumlu</span>
        </div>
        <div className="stat-card gold">
          <span className="stat-value">{negative}</span>
          <span className="stat-label">Olumsuz</span>
        </div>
      </div>

      {/* Sentiment */}
      {total > 0 && (
        <div className="sentiment-section">
          <h3 className="sentiment-section-title"><BarChart2 size={18} /> Medya Tutumu</h3>
          <div className="sentiment-cards">
            {[
              { key: 'positive', label: 'Olumlu',  count: positive, Icon: TrendingUp },
              { key: 'neutral',  label: 'Nötr',    count: neutral,  Icon: Minus },
              { key: 'negative', label: 'Olumsuz', count: negative, Icon: TrendingDown },
            ].map(({ key, label, count, Icon }) => (
              <div
                key={key}
                className={`sentiment-stat-card ${key} ${sentimentFilter === key ? 'selected' : ''}`}
                onClick={() => setSentimentFilter(f => f === key ? '' : key)}
              >
                <span className="sentiment-stat-emoji"><Icon size={24} /></span>
                <span className="sentiment-stat-value">{count}</span>
                <span className="sentiment-stat-label">{label}</span>
                <span className="sentiment-stat-pct">{key === 'positive' ? posP : key === 'negative' ? negP : neuP}%</span>
              </div>
            ))}
          </div>
          <div className="sentiment-bar">
            {posP > 0 && <div className="sentiment-bar-segment positive" style={{ width: `${posP}%` }} />}
            {neuP > 0 && <div className="sentiment-bar-segment neutral"  style={{ width: `${neuP}%` }} />}
            {negP > 0 && <div className="sentiment-bar-segment negative" style={{ width: `${negP}%` }} />}
          </div>
        </div>
      )}

      {/* Search */}
      <form className="search-bar" onSubmit={e => e.preventDefault()}>
        <input
          type="text"
          placeholder="Makalelerde ara..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
        <button type="submit" className="btn-search">
          <Search size={14} /> Ara
        </button>
      </form>

      {/* Filters */}
      <div className="filters-bar">
        <div className="filters-bar-inner">
          <div className="filter-group">
            <span className="filter-label"><ArrowUpDown size={12} /> Sıralama</span>
            <div className="filter-chips">
              <button className={`filter-chip ${sortOrder === 'desc' ? 'active' : ''}`} onClick={() => setSortOrder('desc')}>Yeniden Eskiye</button>
              <button className={`filter-chip ${sortOrder === 'asc'  ? 'active' : ''}`} onClick={() => setSortOrder('asc')}>Eskiden Yeniye</button>
            </div>
          </div>
          <div className="filter-divider" />
          <div className="filter-group">
            <span className="filter-label"><BarChart2 size={12} /> Tutum</span>
            <select className="filter-select" value={sentimentFilter} onChange={e => setSentimentFilter(e.target.value)}>
              <option value="">Tümü</option>
              <option value="positive">Olumlu</option>
              <option value="neutral">Nötr</option>
              <option value="negative">Olumsuz</option>
            </select>
          </div>
        </div>
      </div>

      {/* Article list */}
      <div className="news-list">
        {filtered.length === 0
          ? <div className="empty-state"><span className="empty-icon"><FileText size={40} /></span><h3>Makale bulunamadı</h3></div>
          : filtered.map(art => (
            <div key={art.id} className="news-card">
              {art.image_url && (
                <img
                  src={art.image_url} alt=""
                  className="news-thumb"
                  onError={e => e.target.style.display='none'}
                />
              )}
              <div className="news-content">
                <div className="news-meta">
                  <span className="news-source">{art.source_name}</span>
                  {art.language && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', padding: '0 4px', borderRadius: 3 }}>{art.language}</span>}
                  <span className="news-date">{art.published_at ? new Date(art.published_at).toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric' }) : ''}</span>
                </div>
                <h3 className="news-title">
                  {art.url
                    ? <a href={art.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>{art.title}</a>
                    : art.title
                  }
                </h3>
                {art.body && <p className="news-summary">{art.body}</p>}
              </div>
              <div className="news-actions" style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.375rem' }}>
                {art.sentiment != null && (
                  <span className={`sentiment-badge ${art.sentiment > 0.15 ? 'positive' : art.sentiment < -0.15 ? 'negative' : 'neutral'}`}>
                    {art.sentiment > 0.15 ? <TrendingUp size={11} /> : art.sentiment < -0.15 ? <TrendingDown size={11} /> : <Minus size={11} />}
                    {art.sentiment > 0.15 ? 'Olumlu' : art.sentiment < -0.15 ? 'Olumsuz' : 'Nötr'}
                  </span>
                )}
                {art.url && (
                  <a href={art.url} target="_blank" rel="noreferrer" className="btn btn-sm btn-outline" style={{ fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <ExternalLink size={11} /> Oku
                  </a>
                )}
              </div>
            </div>
          ))
        }
      </div>
    </>
  );
}

// ─── Summary tab ──────────────────────────────────────────────────

function SummaryTab({ search, tag }) {
  const allCountries = (search.articles || []).map(a => a.country).filter(Boolean);
  const countryCounts = allCountries.reduce((acc, c) => { acc[c] = (acc[c] || 0) + 1; return acc; }, {});
  const topCountries = Object.entries(countryCounts).sort((a, b) => b[1] - a[1]).slice(0, 12);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.625rem' }}>
        {[
          { label: 'Makale',    value: search.article_count, icon: <FileText size={18} /> },
          { label: 'API Token', value: search.tokens_used,   icon: <BarChart2 size={18} /> },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <span style={{ color: 'var(--accent)' }}>{s.icon}</span>
            <div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{s.value}</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <SentimentStatsBlock articles={search.articles} />

      {topCountries.length > 0 && (
        <div className="card" style={{ padding: '1rem' }}>
          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginBottom: '0.625rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Kaynak Ülkeler
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
            {topCountries.map(([code, cnt]) => (
              <div key={code} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.25rem 0.5rem', borderRadius: 20, background: 'var(--bg-secondary)', fontSize: '0.78rem' }}>
                <span style={{ fontSize: '0.9rem' }}>{flag(code)}</span>
                <span>{code}</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem' }}>{cnt}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
        <span>Sorgu: <strong style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>{search.query_translated}</strong></span>
        <span>Son analiz: <strong style={{ color: 'var(--text-secondary)' }}>{new Date(search.searched_at).toLocaleString('tr-TR')}</strong></span>
        <span>Süre: <strong style={{ color: 'var(--text-secondary)' }}>son {search.date_range_days} gün</strong></span>
        {tag.lang_filter?.length > 0 && <span>Diller: <strong style={{ color: 'var(--text-secondary)' }}>{tag.lang_filter.join(', ')}</strong></span>}
        {tag.country_filter?.length > 0 && <span>Ülkeler: <strong style={{ color: 'var(--text-secondary)' }}>{tag.country_filter.join(', ')}</strong></span>}
      </div>
    </div>
  );
}

// ─── Confirm modal ───────────────────────────────────────────────

function ConfirmModal({ message, onConfirm, onCancel }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div className="card" style={{
        padding: '1.75rem 1.5rem', maxWidth: 380, width: '90%',
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        display: 'flex', flexDirection: 'column', gap: '1.25rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <Trash2 size={18} style={{ color: '#ef4444', flexShrink: 0, marginTop: '0.1rem' }} />
          <p style={{ margin: 0, fontSize: '0.875rem', lineHeight: 1.6, color: 'var(--text-primary)' }}>
            {message}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.625rem', justifyContent: 'flex-end' }}>
          <button
            onClick={onCancel}
            style={{ padding: '0.45rem 1rem', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-secondary)', fontSize: '0.83rem', cursor: 'pointer' }}
          >
            Vazgeç
          </button>
          <button
            onClick={onConfirm}
            style={{ padding: '0.45rem 1rem', borderRadius: 6, border: 'none', background: '#ef4444', color: '#fff', fontSize: '0.83rem', cursor: 'pointer', fontWeight: 600 }}
          >
            Sil
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── How it works info banner (page-level) ───────────────────────

function HowItWorksBanner() {
  return (
    <div style={{
      display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
      background: 'var(--global-banner-bg)',
      border: '1px solid var(--global-banner-border)',
      borderRadius: 'var(--radius-sm)',
      padding: '0.875rem 1rem',
      marginBottom: '1.25rem',
      fontSize: '0.83rem',
      color: 'var(--text-secondary)',
      lineHeight: 1.6,
    }}>
      <Globe size={15} style={{ flexShrink: 0, color: 'var(--accent)', marginTop: '0.1rem' }} />
      <div style={{ flex: 1 }}>
        <strong style={{ color: 'var(--text-primary)' }}>Global Analiz nasıl çalışır?</strong>
        <br />
        Dünya medyasının konuyu nasıl ele aldığını World Wide Web genelinde sorgular, sonuçları etiket bazında kaydeder, tutum analizini yapar.
        {' '}<strong>+ Yeni Etiket</strong> ile oluşturun, ardından <strong>Analiz Et</strong> ile sonuçları çekin.
        <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '0.625rem' }}>
          {[
            {
              icon: '📰', title: 'Nasıl Aranır?',
              desc: 'Her kelime haberde ayrı ayrı geçmeli; sıra önemli değil. Daha az kelime → daha geniş sonuç.',
              ex: 'Türkiyedeki okul saldırıları',
              tip: 'Kişi veya kurum adları tırnak içinde girilmeli — örn. "Savaş Barış" — aksi halde kelimeler ayrı ayrı aranır.',
            },
          ].map(({ icon, title, desc, ex, note, tip }) => (
            <div key={title} style={{
              flex: '1 1 180px', background: 'rgba(0,112,243,0.05)',
              border: '1px solid rgba(0,112,243,0.12)', borderRadius: 6,
              padding: '0.5rem 0.75rem', fontSize: '0.78rem',
            }}>
              <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.2rem' }}>{icon} {title}</div>
              <div style={{ color: 'var(--text-secondary)' }}>{desc}</div>
              {ex && (
                <div style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontStyle: 'italic' }}>
                  Örnek: <span style={{ fontFamily: 'var(--font-mono)', fontStyle: 'normal', color: 'var(--text-secondary)' }}>{ex}</span>
                </div>
              )}
              {tip && (
                <div style={{ color: 'var(--text-muted)', marginTop: '0.25rem', fontSize: '0.72rem' }}>
                  💡 {tip}
                </div>
              )}
              {note && (
                <div style={{ color: '#ca8a04', marginTop: '0.25rem', fontSize: '0.72rem' }}>
                  ⚠️ {note}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── New tag form ─────────────────────────────────────────────────

function NewTagForm({ onSave, onCancel }) {
  const [nameInput, setNameInput] = useState('');       // kullanıcının girdiği etiket adı
  const [queryEn, setQueryEn] = useState('');           // çevrilmiş / düzenlenmiş sorgu
  const [editingTranslation, setEditingTranslation] = useState(false);
  const [langDetected, setLangDetected] = useState(null);
  const [translating, setTranslating] = useState(false);
  const [langFilter, setLangFilter] = useState(null);
  const [countryFilter, setCountryFilter] = useState(null);
  const [saving, setSaving] = useState(false);
  const debounceRef = useRef(null);

  const handleNameChange = (val) => {
    setNameInput(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      if (!val.trim()) { setQueryEn(''); setLangDetected(null); return; }
      setTranslating(true);
      try {
        const r = await fetch('http://localhost:8000/api/global/translate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('haberajani_token')}` },
          body: JSON.stringify({ text: val }),
        });
        if (r.ok) {
          const d = await r.json();
          setLangDetected(d.lang);
          setQueryEn(d.translated);
        } else {
          setQueryEn(val);
        }
      } catch {
        setQueryEn(val);
      }
      setTranslating(false);
    }, 600);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nameInput.trim() || !queryEn.trim()) return;
    setSaving(true);
    try {
      await onSave({
        name: nameInput.trim(),
        query_en: queryEn.trim(),
        search_type: 'articles',
        lang_filter: langFilter,
        country_filter: countryFilter,
      });
    } finally {
      setSaving(false);
    }
  };

  const inputStyle = { background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 5, padding: '0.4rem 0.6rem', color: 'var(--text-primary)', fontSize: '0.8rem', fontFamily: 'inherit', width: '100%', boxSizing: 'border-box' };

  return (
    <form onSubmit={handleSubmit} className="card" style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
      <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>YENİ ETİKET</div>

      {/* Etiket adı — hem isim hem sorgu tabanı */}
      <input
        value={nameInput}
        onChange={e => handleNameChange(e.target.value)}
        placeholder="Etiket adı giriniz (örn. Okul Saldırıları)"
        required
        style={inputStyle}
      />

      {/* Turkey/Türkiye notu */}
      {/türkiye|turkey/i.test(nameInput) && (
        <div style={{ fontSize: '0.72rem', color: 'var(--accent-light)', background: 'var(--accent-glow)', border: '1px solid rgba(0,112,243,0.2)', borderRadius: 5, padding: '0.3rem 0.55rem' }}>
          💡 {langDetected === 'tr' || /türkiye/i.test(nameInput)
            ? '"Türkiye" ifadesi uluslararası medyada "Turkey" olarak da geçtiğinden her iki yazım taranır.'
            : '"Turkey" is also indexed as "Türkiye" in some sources — both spellings are covered.'}
        </div>
      )}

      {/* Çeviri satırı */}
      {(queryEn || translating) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.75rem', padding: '0.35rem 0.5rem', background: 'var(--bg-secondary)', borderRadius: 5, border: '1px solid var(--border)' }}>
          <Languages size={12} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          {translating ? (
            <span style={{ color: 'var(--text-muted)' }}>çevriliyor…</span>
          ) : editingTranslation ? (
            <>
              <input
                value={queryEn}
                onChange={e => setQueryEn(e.target.value)}
                autoFocus
                style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: '0.75rem', fontFamily: 'var(--font-mono)' }}
              />
              <button type="button" onClick={() => setEditingTranslation(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#10b981', display: 'flex', padding: 0 }}><Check size={12} /></button>
              <button type="button" onClick={() => setEditingTranslation(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', padding: 0 }}><X size={12} /></button>
            </>
          ) : (
            <>
              {langDetected && langDetected !== 'en' && (
                <span style={{ color: '#ca8a04', flexShrink: 0 }}>{langDetected === 'tr' ? 'TR→EN:' : `${langDetected}→EN:`}</span>
              )}
              <span style={{ flex: 1, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontSize: '0.73rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{queryEn}</span>
              <button type="button" onClick={() => setEditingTranslation(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 0 }} title="Düzenle"><Edit2 size={11} /></button>
            </>
          )}
        </div>
      )}

      {/* Dil filtresi */}
      <ChipSelect
        options={LANGUAGES}
        value={langFilter}
        onChange={setLangFilter}
        label="Kaynak Dil Filtresi"
      />

      {/* Ülke filtresi */}
      <ChipSelect
        options={COUNTRIES}
        value={countryFilter}
        onChange={setCountryFilter}
        label="Kaynak Ülke Filtresi"
      />

      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
        <button
          type="submit"
          disabled={saving || !nameInput.trim() || !queryEn.trim()}
          className="btn btn-primary"
          style={{ flex: 1, fontSize: '0.8rem', padding: '0.4rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem' }}
        >
          {saving ? <span className="spinner" style={{ width: 12, height: 12 }} /> : <Plus size={12} />}
          Kaydet
        </button>
        <button type="button" onClick={onCancel} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.75rem', cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          İptal
        </button>
      </div>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────

export default function GlobalSearchPage() {
  const [tags, setTags] = useState([]);
  const [selectedTag, setSelectedTag] = useState(null);
  const [search, setSearch] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [loadingResult, setLoadingResult] = useState(false);
  const [dateRange, setDateRange] = useState(30);
  const [showForm, setShowForm] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);


  const loadTags = () =>
    globalSearchApi.listTags().then(r => setTags(r.data)).catch(() => {});

  useEffect(() => { loadTags(); }, []);

  const handleSelectTag = async (tag) => {
    if (selectedTag?.id === tag.id) return;
    setSelectedTag(tag);
    setSearch(null);
    setActiveTab('summary');
    setLoadingResult(true);
    try {
      const r = await globalSearchApi.tagLatest(tag.id);
      setSearch(r.data.search || null);
      if (r.data.search?.date_range_days) setDateRange(r.data.search.date_range_days);
    } catch {}
    setLoadingResult(false);
  };

  const handleAnalyze = async () => {
    if (!selectedTag) return;
    setAnalyzing(true);
    try {
      const r = await globalSearchApi.analyzeTag(selectedTag.id, dateRange);
      setSearch(r.data);
      loadTags();
    } catch (e) {
      alert(e.response?.data?.detail || 'Analiz başarısız');
    }
    setAnalyzing(false);
  };

  const handleDeleteTag = (tagId, e) => {
    e.stopPropagation();
    setDeleteConfirm(tagId);
  };

  const confirmDelete = async () => {
    const tagId = deleteConfirm;
    setDeleteConfirm(null);
    await globalSearchApi.deleteTag(tagId).catch(() => {});
    if (selectedTag?.id === tagId) { setSelectedTag(null); setSearch(null); }
    loadTags();
  };

  const handleCreateTag = async (data) => {
    await globalSearchApi.createTag(data);
    setShowForm(false);
    loadTags();
  };

  return (
    <div className="dashboard-page admin-page">

      {deleteConfirm && (
        <ConfirmModal
          message="Bu etiketi ve tüm analiz sonuçlarını silmek istiyor musunuz? Bu işlem geri alınamaz."
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* ── Başlık ── */}
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Globe size={28} /> Global Analiz
        </h1>
      </div>

      {/* ── Açıklama banneri ── */}
      <HowItWorksBanner />

      {/* ── Yeni etiket formu ── */}
      {showForm && (
        <NewTagForm
          onSave={handleCreateTag}
          onCancel={() => setShowForm(false)}
        />
      )}

      {/* ── Etiket kartları (yatay) + ekle butonu ── */}
      {!showForm && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <button
            onClick={() => { setShowForm(true); setSelectedTag(null); setSearch(null); }}
            style={{
              padding: '0.75rem 1rem', borderRadius: 8, cursor: 'pointer',
              border: '1px dashed var(--accent)',
              background: 'var(--accent-glow)',
              color: 'var(--accent-light)',
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              fontSize: '0.85rem', fontWeight: 600,
              minWidth: 140,
            }}
          >
            <Plus size={14} /> Yeni Etiket
          </button>
          {tags.map(tag => {
            const isSelected = selectedTag?.id === tag.id;
            return (
              <div
                key={tag.id}
                onClick={() => handleSelectTag(tag)}
                style={{
                  padding: '0.75rem 1rem', borderRadius: 8, cursor: 'pointer',
                  border: `1px solid ${isSelected ? 'var(--accent)' : 'var(--border)'}`,
                  background: isSelected ? 'var(--accent-glow)' : 'var(--bg-card)',
                  transition: 'all 0.15s', minWidth: 180, maxWidth: 260,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.88rem', color: isSelected ? 'var(--accent-light)' : 'var(--text-primary)', flex: 1 }}>
                    {tag.name}
                  </span>
                  <button
                    onClick={(e) => handleDeleteTag(tag.id, e)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {tag.query_en}
                </div>
                {(tag.lang_filter?.length > 0 || tag.country_filter?.length > 0) && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', marginTop: '0.35rem' }}>
                    {(tag.lang_filter || []).map(l => (
                      <span key={l} style={{ fontSize: '0.6rem', padding: '1px 4px', borderRadius: 6, background: 'rgba(0,112,243,0.12)', color: 'var(--accent-light)' }}>{l}</span>
                    ))}
                    {(tag.country_filter || []).map(c => (
                      <span key={c} style={{ fontSize: '0.6rem', padding: '1px 4px', borderRadius: 6, background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>{flag(c)} {c}</span>
                    ))}
                  </div>
                )}
                <div style={{ fontSize: '0.65rem', color: tag.last_search ? 'var(--text-muted)' : 'var(--warning)', marginTop: '0.35rem' }}>
                  {tag.last_search
                    ? `${new Date(tag.last_search.searched_at).toLocaleDateString('tr-TR')} · ${tag.last_search.event_count} olay · ${tag.last_search.article_count} makale`
                    : 'Henüz analiz edilmedi'}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Seçili etiket sonuçları ── */}
      {!showForm && selectedTag && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
            <div>
              <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{selectedTag.name}</h2>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
                <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-secondary)' }}>{selectedTag.query_en}</code>
              </div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <select
                value={dateRange}
                onChange={e => setDateRange(Number(e.target.value))}
                style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, padding: '0.4rem 0.6rem', color: 'var(--text-primary)', fontSize: '0.82rem', cursor: 'pointer' }}
              >
                <option value={7}>Son 7 gün</option>
                <option value={14}>Son 14 gün</option>
                <option value={30}>Son 30 gün</option>
                <option value={90}>Son 90 gün</option>
              </select>
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="btn btn-primary"
                style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', padding: '0.45rem 1rem', fontSize: '0.85rem' }}
              >
                {analyzing
                  ? <><span className="spinner" style={{ width: 13, height: 13 }} /> Analiz ediliyor…</>
                  : <><Search size={13} /> Analiz Et</>
                }
              </button>
            </div>
          </div>

          {loadingResult && (
            <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
              <div className="spinner large" style={{ margin: '0 auto 0.75rem' }} />
              Sonuçlar yükleniyor…
            </div>
          )}

          {!loadingResult && !search && !analyzing && (
            <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text-muted)' }}>
              <Search size={36} style={{ marginBottom: '0.75rem', opacity: 0.25 }} />
              <div style={{ fontSize: '0.875rem' }}>Bu etiket için henüz analiz yapılmamış.</div>
              <div style={{ fontSize: '0.78rem', marginTop: '0.4rem' }}>"Analiz Et" butonuna tıklayarak başlayın.</div>
            </div>
          )}

          {!loadingResult && search && (
            <SearchResults search={search} />
          )}
        </>
      )}
    </div>
  );
}
