import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Zap, X, BellRing, RefreshCw, ArrowUpDown, Tag, BarChart2,
  SlidersHorizontal, FileDown, Clock, Info,
  TrendingUp, Minus, TrendingDown, Activity,
} from 'lucide-react';
import { FaYoutube, FaXTwitter } from 'react-icons/fa6';
import { Rss, Globe } from 'lucide-react';
import { newsApi, tagsApi } from '../services/api';
import NewsCard from '../components/NewsCard';
import TrendsPanel from '../components/TrendsPanel';

const SOURCE_OPTIONS = [
  { value: 'rss',     label: 'RSS / Haber', Icon: Rss },
  { value: 'web',     label: 'Web',          Icon: Globe },
  { value: 'youtube', label: 'YouTube',      Icon: FaYoutube },
  { value: 'twitter', label: 'Twitter / X',  Icon: FaXTwitter },
  { value: 'newsapi', label: 'NewsAPI.ai',   Icon: Zap },
];

const PAGE_SIZE = 20;

function getPageNumbers(current, total) {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = [1];
  if (current > 3) pages.push('…');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

function fmtTime(isoStr) {
  if (!isoStr) return null;
  const utc = isoStr.endsWith('Z') || isoStr.includes('+') ? isoStr : isoStr + 'Z';
  const d = new Date(utc);
  return d.toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

// Time string "HH:MM" → ISO on today's date
function timeToISO(timeStr) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

// Timestamp for filenames: "20260423_1906"
function nowStamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
}

export default function BreakingNewsPage() {
  const [news, setNews]                     = useState([]);
  const [tags, setTags]                     = useState([]);
  const [counts, setCounts]                 = useState({ total: 0, unread: 0, favorites: 0, sentiment: {} });
  const [loading, setLoading]               = useState(true);
  const [page, setPage]                     = useState(1);
  const [sortOrder, setSortOrder]           = useState('desc');
  const [tagFilter, setTagFilter]           = useState('');
  const [selectedSentiment, setSelectedSentiment] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState(SOURCE_OPTIONS.map(s => s.value));
  const [newCount, setNewCount]             = useState(0);
  const [newTagNames, setNewTagNames]       = useState([]);
  const [exportingPdf, setExportingPdf]     = useState(false);

  // Time filter
  const [timeFrom, setTimeFrom] = useState('00:00');
  const [timeTo, setTimeTo]     = useState('23:59');

  const lastKnownIdRef = useRef(0);

  const breakingTags = tags.filter(t => t.is_breaking);
  const hasCustomPlatforms = selectedPlatforms.length < SOURCE_OPTIONS.length;

  const buildTimeParams = () => {
    const params = {};
    const from = timeToISO(timeFrom);
    const to   = timeToISO(timeTo);
    if (from) params.date_from = from;
    if (to)   params.date_to   = to;
    return params;
  };

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const allPlatforms = selectedPlatforms.length === SOURCE_OPTIONS.length;
      const params = {
        page, page_size: PAGE_SIZE, sort_order: sortOrder, breaking_only: true,
        ...buildTimeParams(),
      };
      if (tagFilter) params.tag_id = tagFilter;
      if (selectedSentiment) params.sentiment = selectedSentiment;
      if (!allPlatforms) params.source_types = selectedPlatforms;

      const res = await newsApi.list(params);
      setNews(res.data);

      if (page === 1) {
        const idRes = await newsApi.latestId({
          breaking_only: true,
          ...buildTimeParams(),
          ...(tagFilter ? { tag_id: tagFilter } : {}),
        });
        lastKnownIdRef.current = idRes.data.latest_id || 0;
      }
      setNewCount(0);
    } catch (err) { console.error(err); }
    setLoading(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, sortOrder, tagFilter, selectedSentiment, selectedPlatforms, timeFrom, timeTo]);

  const fetchCounts = useCallback(async () => {
    try {
      const params = { breaking_only: true, ...buildTimeParams() };
      if (tagFilter) params.tag_id = tagFilter;
      const res = await newsApi.count(params);
      setCounts(res.data);
    } catch (err) { console.error(err); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagFilter, timeFrom, timeTo]);

  useEffect(() => {
    fetchNews();
    fetchCounts();
    tagsApi.list().then(r => setTags(r.data)).catch(() => {});
  }, [page, sortOrder, tagFilter, selectedSentiment, selectedPlatforms, timeFrom, timeTo]);

  // Poll for new items every 60s — compare actual new items, not ID diff
  useEffect(() => {
    const poll = async () => {
      try {
        const idRes = await newsApi.latestId({
          breaking_only: true,
          ...buildTimeParams(),
          ...(tagFilter ? { tag_id: tagFilter } : {}),
        });
        const { latest_id, new_tags } = idRes.data;
        if (lastKnownIdRef.current > 0 && latest_id > lastKnownIdRef.current) {
          // Fetch actual new items to get accurate count
          const newRes = await newsApi.list({
            page_size: 50, sort_order: 'desc', breaking_only: true,
            ...buildTimeParams(),
            ...(tagFilter ? { tag_id: tagFilter } : {}),
          });
          const freshCount = (newRes.data || []).filter(n => n.id > lastKnownIdRef.current).length;
          if (freshCount > 0) {
            setNewCount(freshCount);
            setNewTagNames(new_tags || []);
          }
        }
        // Etiket son tarama zamanlarını da yenile
        tagsApi.list().then(r => setTags(r.data)).catch(() => {});
      } catch (e) {}
    };
    const id = setInterval(poll, 60000);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tagFilter, timeFrom, timeTo]);

  const handleUpdate = () => { fetchNews(); fetchCounts(); };

  const handleMarkAllRead = async () => {
    try {
      await newsApi.bulkMarkRead({ breaking_only: true, ...(tagFilter ? { tag_id: tagFilter } : {}) });
      fetchNews();
      fetchCounts();
      tagsApi.list().then(r => setTags(r.data)).catch(() => {});
    } catch (e) { console.error(e); }
  };

  const togglePlatform = (value) => {
    setSelectedPlatforms(prev =>
      prev.includes(value)
        ? prev.length === 1 ? prev : prev.filter(v => v !== value)
        : [...prev, value]
    );
    setPage(1);
  };

  // ── PDF Export ───────────────────────────────────────────
  const handleExportPdf = async () => {
    setExportingPdf(true);
    try {
      const tagIds = tagFilter
        ? [Number(tagFilter)]
        : breakingTags.map(t => t.id);
      const params = { tag_ids: tagIds, is_breaking: true, ...buildTimeParams() };
      const res = await newsApi.exportPdf(params);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url  = URL.createObjectURL(blob);
      const filename = `SonDakika_${nowStamp()}.pdf`;
      const a = document.createElement('a');
      a.style.display = 'none'; a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    } catch (err) {
      alert('PDF oluşturulurken hata oluştu.');
    }
    setExportingPdf(false);
  };

  // ── Sentiment ────────────────────────────────────────────
  const sentimentTotal = (counts.sentiment?.positive || 0) + (counts.sentiment?.neutral || 0) + (counts.sentiment?.negative || 0);
  const sentimentPct = {
    positive: sentimentTotal > 0 ? Math.round((counts.sentiment?.positive || 0) / sentimentTotal * 100) : 0,
    neutral:  sentimentTotal > 0 ? Math.round((counts.sentiment?.neutral  || 0) / sentimentTotal * 100) : 0,
    negative: sentimentTotal > 0 ? Math.round((counts.sentiment?.negative || 0) / sentimentTotal * 100) : 0,
  };
  const handleSentimentFilter = (key) => { setSelectedSentiment(s => s === key ? '' : key); setPage(1); };

  // ── Empty state ──────────────────────────────────────────
  if (breakingTags.length === 0 && !loading) {
    return (
      <div className="dashboard-page">
        <div className="page-header">
          <h1><Zap size={24} style={{ color: '#ef4444' }} /> Son Dakika</h1>
        </div>
        <div className="empty-state" style={{ marginTop: '3rem' }}>
          <span className="empty-icon"><Zap size={48} color="#ef4444" /></span>
          <h3>Son Dakika etiketi yok</h3>
          <p>Etiketler sayfasından bir etiketi "Son Dakika" olarak işaretleyin.</p>
        </div>
      </div>
    );
  }

  const totalPages = Math.ceil(counts.total / PAGE_SIZE);
  const from = counts.total > 0 ? (page - 1) * PAGE_SIZE + 1 : 0;
  const to   = Math.min(page * PAGE_SIZE, counts.total);

  return (
    <div className="dashboard-page">

      {/* ── New items banner ──────────────────────────── */}
      {newCount > 0 && (
        <div
          onClick={() => { setNewCount(0); setNewTagNames([]); setPage(1); fetchNews(); fetchCounts(); }}
          className="breaking-banner"
        >
          <BellRing size={16} className="pulse-icon" />
          <span>
            <strong>🔴 SON DAKİKA</strong> — {newCount} yeni haber
            {newTagNames.length > 0 && <> · <strong>{newTagNames.join(', ')}</strong></>}
            {' '}— yüklemek için tıklayın
          </span>
          <X size={14} style={{ marginLeft: 'auto', flexShrink: 0 }} onClick={e => { e.stopPropagation(); setNewCount(0); setNewTagNames([]); }} />
        </div>
      )}

      {/* ── Page header ──────────────────────────────── */}
      <div className="page-header">
        <h1><Zap size={24} style={{ color: '#ef4444' }} /> Son Dakika</h1>
      </div>

      {/* ── Info banner ──────────────────────────────── */}
      <div style={{
        display: 'flex', gap: '0.75rem', alignItems: 'flex-start',
        background: 'rgba(239,68,68,0.06)',
        border: '1px solid rgba(239,68,68,0.18)',
        borderRadius: 'var(--radius-sm)',
        padding: '0.875rem 1rem',
        marginBottom: '1rem',
        fontSize: '0.83rem',
        color: 'var(--text-secondary)',
        lineHeight: 1.6,
      }}>
        <Info size={15} style={{ flexShrink: 0, color: '#ef4444', marginTop: '0.1rem' }} />
        <div>
          <strong style={{ color: 'var(--text-primary)' }}>Son Dakika nasıl çalışır?</strong>
          <br />
          "Son Dakika" etiketleri <strong>her dakika kontrol edilir</strong>; tarama sıklığı dolduğunda
          NewsAPI.ai + aktif kaynaklarınız (Twitter/X vb.) otomatik taranır.
          Haberler etiket anahtar kelimesiyle filtrelenerek sentimen analizi sonrası eklenir.
          {breakingTags.length > 0 && (
            <div style={{ marginTop: '0.4rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {breakingTags.map(t => (
                <span key={t.id} style={{
                  display: 'inline-flex', alignItems: 'center', gap: '0.35rem',
                  background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.15)',
                  borderRadius: 'var(--radius-sm)', padding: '0.2rem 0.55rem',
                  fontSize: '0.78rem',
                }}>
                  <span style={{ color: t.color, fontWeight: 600 }}>{t.name}</span>
                  <span style={{ color: '#ef4444', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                    <Clock size={10} /> {t.scan_interval_minutes} dk
                  </span>
                  {t.last_breaking_scan && (
                    <span style={{ color: 'var(--text-muted)', borderLeft: '1px solid rgba(239,68,68,0.2)', paddingLeft: '0.35rem' }}>
                      Son tarama: {fmtTime(t.last_breaking_scan)}
                    </span>
                  )}
                  {t.last_breaking_scan && t.last_scan_items_found != null && (
                    <span style={{
                      borderLeft: '1px solid rgba(239,68,68,0.2)', paddingLeft: '0.35rem',
                      color: t.last_scan_items_found > 0 ? '#22c55e' : 'var(--text-muted)',
                      fontWeight: t.last_scan_items_found > 0 ? 600 : 400,
                    }}>
                      {t.last_scan_items_found > 0 ? `${t.last_scan_items_found} haber çekildi` : 'yeni haber yok'}
                    </span>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Stats ────────────────────────────────────── */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value">{counts.total}</span>
          <span className="stat-label">Toplam</span>
        </div>
        <div className="stat-card accent">
          <span className="stat-value">{counts.unread}</span>
          <span className="stat-label">Okunmamış</span>
        </div>
        <div className="stat-card gold">
          <span className="stat-value">{counts.favorites}</span>
          <span className="stat-label">Favori</span>
        </div>
      </div>

      {/* ── Trends Panel ─────────────────────────────── */}
      <TrendsPanel />

      {/* ── Sentiment ────────────────────────────────── */}
      {sentimentTotal > 0 && (
        <div className="sentiment-section">
          <h3 className="sentiment-section-title"><Activity size={18} /> Tutum Analizi</h3>
          <div className="sentiment-cards">
            {[
              { key: 'positive', label: 'Pozitif', Icon: TrendingUp },
              { key: 'neutral',  label: 'Nötr',    Icon: Minus },
              { key: 'negative', label: 'Negatif', Icon: TrendingDown },
            ].map(({ key, label, Icon }) => (
              <div
                key={key}
                className={`sentiment-stat-card ${key} ${selectedSentiment === key ? 'selected' : ''}`}
                onClick={() => handleSentimentFilter(key)}
              >
                <span className="sentiment-stat-emoji"><Icon size={24} /></span>
                <span className="sentiment-stat-value">{counts.sentiment?.[key] || 0}</span>
                <span className="sentiment-stat-label">{label}</span>
                <span className="sentiment-stat-pct">{sentimentPct[key]}%</span>
              </div>
            ))}
          </div>
          <div className="sentiment-bar">
            {sentimentPct.positive > 0 && <div className="sentiment-bar-segment positive" style={{ width: `${sentimentPct.positive}%` }} />}
            {sentimentPct.neutral  > 0 && <div className="sentiment-bar-segment neutral"  style={{ width: `${sentimentPct.neutral}%`  }} />}
            {sentimentPct.negative > 0 && <div className="sentiment-bar-segment negative" style={{ width: `${sentimentPct.negative}%` }} />}
          </div>
        </div>
      )}

      {/* ── Filters bar (Rapor butonu buraya) ────────── */}
      <div className="filters-bar">
        <div className="filters-bar-inner">

          <div className="filter-group">
            <span className="filter-label"><ArrowUpDown size={12} /> Sıralama</span>
            <div className="filter-chips">
              <button className={`filter-chip ${sortOrder === 'desc' ? 'active' : ''}`} onClick={() => { setSortOrder('desc'); setPage(1); }}>Yeniden Eskiye</button>
              <button className={`filter-chip ${sortOrder === 'asc'  ? 'active' : ''}`} onClick={() => { setSortOrder('asc');  setPage(1); }}>Eskiden Yeniye</button>
            </div>
          </div>

          <div className="filter-divider" />

          <div className="filter-group">
            <span className="filter-label"><Tag size={12} /> Etiket</span>
            <select className="filter-select" value={tagFilter} onChange={e => { setTagFilter(e.target.value); setPage(1); }}>
              <option value="">Tüm Son Dakika</option>
              {breakingTags.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.scan_interval_minutes} dk)</option>
              ))}
            </select>
          </div>

          <div className="filter-divider" />

          <div className="filter-group">
            <span className="filter-label"><BarChart2 size={12} /> Tutum</span>
            <select className="filter-select" value={selectedSentiment} onChange={e => { setSelectedSentiment(e.target.value); setPage(1); }}>
              <option value="">Tümü</option>
              <option value="positive">Pozitif</option>
              <option value="neutral">Nötr</option>
              <option value="negative">Negatif</option>
            </select>
          </div>

          <div className="filter-divider" />

          <div className="filter-group">
            <span className="filter-label"><SlidersHorizontal size={12} /> Kaynak</span>
            <div className="filter-chips">
              {SOURCE_OPTIONS.map(({ value, label, Icon }) => (
                <button
                  key={value}
                  className={`filter-chip source-chip ${hasCustomPlatforms ? (selectedPlatforms.includes(value) ? 'active' : 'muted') : ''}`}
                  onClick={() => togglePlatform(value)}
                  style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}
                >
                  <Icon size={11} /> {label}
                </button>
              ))}
            </div>
          </div>

          <div className="filter-divider" />

          <div className="filter-group">
            <span className="filter-label"><Clock size={12} /> Saat Aralığı</span>
            <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
              <input type="time" className="filter-select" style={{ width: 100 }} value={timeFrom} onChange={e => { setTimeFrom(e.target.value); setPage(1); }} />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
              <input type="time" className="filter-select" style={{ width: 100 }} value={timeTo}   onChange={e => { setTimeTo(e.target.value);   setPage(1); }} />
            </div>
          </div>
        </div>

        {/* Rapor butonu filtre barının sağında */}
        <div className="filters-bar-actions">
          <button
            className="btn btn-outline"
            onClick={handleExportPdf}
            disabled={exportingPdf || breakingTags.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', whiteSpace: 'nowrap' }}
          >
            {exportingPdf ? <RefreshCw size={14} className="spin" /> : <FileDown size={14} />}
            Son Dakika Raporu
          </button>
        </div>
      </div>

      {/* ── Mark all read ───────────────────────────── */}
      {counts.unread > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
          <button
            className="btn btn-sm btn-outline"
            onClick={handleMarkAllRead}
            style={{ fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: '0.35rem' }}
          >
            <Activity size={13} /> Tümünü Okundu Yap ({counts.unread})
          </button>
        </div>
      )}

      {/* ── News list ────────────────────────────────── */}
      <div className="news-list">
        {loading ? (
          <div className="loading-state"><div className="spinner large" /></div>
        ) : news.length === 0 ? (
          <div className="empty-state">
            <Zap size={48} color="#ef4444" style={{ opacity: 0.4 }} />
            <h3>Seçilen aralıkta haber yok</h3>
            <p>Saat aralığını veya filtreleri değiştirmeyi deneyin.</p>
          </div>
        ) : (
          news.map(item => (
            <NewsCard key={item.id} item={item} onUpdate={handleUpdate} isNew={false} isBreaking />
          ))
        )}
      </div>

      {/* ── Pagination ───────────────────────────────── */}
      {counts.total > 0 && (
        <div className="pagination">
          <span className="page-info">{from}–{to} / {counts.total} sonuç</span>
          <div className="pagination-controls">
            <button className="pg-btn" disabled={page === 1} onClick={() => setPage(1)}>«</button>
            <button className="pg-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)}>‹</button>
            {getPageNumbers(page, totalPages).map((n, i) =>
              n === '…'
                ? <span key={`e${i}`} className="pg-ellipsis">…</span>
                : <button key={n} className={`pg-btn ${n === page ? 'active' : ''}`} onClick={() => setPage(n)}>{n}</button>
            )}
            <button className="pg-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>›</button>
            <button className="pg-btn" disabled={page === totalPages} onClick={() => setPage(totalPages)}>»</button>
          </div>
        </div>
      )}
    </div>
  );
}
