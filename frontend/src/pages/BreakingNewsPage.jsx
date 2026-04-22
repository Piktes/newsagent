import { useState, useEffect, useRef, useCallback } from 'react';
import { Zap, X, BellRing, RefreshCw, ArrowUpDown, Tag, BarChart2, SlidersHorizontal } from 'lucide-react';
import { FaYoutube, FaXTwitter } from 'react-icons/fa6';
import { Rss, Globe } from 'lucide-react';
import { newsApi, tagsApi } from '../services/api';
import NewsCard from '../components/NewsCard';

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

export default function BreakingNewsPage() {
  const [news, setNews] = useState([]);
  const [tags, setTags] = useState([]);
  const [counts, setCounts] = useState({ total: 0, unread: 0, favorites: 0, sentiment: {} });
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState('desc');
  const [tagFilter, setTagFilter] = useState('');
  const [selectedSentiment, setSelectedSentiment] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState(SOURCE_OPTIONS.map(s => s.value));
  const [newCount, setNewCount] = useState(0);
  const [newTagNames, setNewTagNames] = useState([]);
  const lastKnownIdRef = useRef(0);

  const breakingTags = tags.filter(t => t.is_breaking);
  const hasCustomPlatforms = selectedPlatforms.length < SOURCE_OPTIONS.length;

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const allPlatforms = selectedPlatforms.length === SOURCE_OPTIONS.length;
      const params = { page, page_size: PAGE_SIZE, sort_order: sortOrder, breaking_only: true };
      if (tagFilter) params.tag_id = tagFilter;
      if (selectedSentiment) params.sentiment = selectedSentiment;
      if (!allPlatforms) params.source_types = selectedPlatforms;

      const res = await newsApi.list(params);
      setNews(res.data);

      if (page === 1) {
        const idRes = await newsApi.latestId({ breaking_only: true, ...(tagFilter ? { tag_id: tagFilter } : {}) });
        lastKnownIdRef.current = idRes.data.latest_id || 0;
      }
      setNewCount(0);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [page, sortOrder, tagFilter, selectedSentiment, selectedPlatforms]);

  const fetchCounts = useCallback(async () => {
    try {
      const params = { breaking_only: true };
      if (tagFilter) params.tag_id = tagFilter;
      const res = await newsApi.count(params);
      setCounts(res.data);
    } catch (err) { console.error(err); }
  }, [tagFilter]);

  useEffect(() => {
    fetchNews();
    fetchCounts();
    tagsApi.list().then(r => setTags(r.data)).catch(() => {});
  }, [page, sortOrder, tagFilter, selectedSentiment, selectedPlatforms]);

  // Poll for new items every 60s
  useEffect(() => {
    const poll = async () => {
      try {
        const idRes = await newsApi.latestId({ breaking_only: true, since_id: lastKnownIdRef.current, ...(tagFilter ? { tag_id: tagFilter } : {}) });
        const { latest_id, new_tags } = idRes.data;
        if (lastKnownIdRef.current > 0 && latest_id > lastKnownIdRef.current) {
          setNewCount(latest_id - lastKnownIdRef.current);
          setNewTagNames(new_tags || []);
        }
      } catch (e) {}
    };
    const id = setInterval(poll, 60000);
    return () => clearInterval(id);
  }, [tagFilter]);

  const handleUpdate = () => { fetchNews(); fetchCounts(); };

  const togglePlatform = (value) => {
    setSelectedPlatforms(prev =>
      prev.includes(value)
        ? prev.length === 1 ? prev : prev.filter(v => v !== value)
        : [...prev, value]
    );
    setPage(1);
  };

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
  const to = Math.min(page * PAGE_SIZE, counts.total);

  return (
    <div className="dashboard-page">
      {/* New items banner */}
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

      <div className="page-header">
        <h1><Zap size={24} style={{ color: '#ef4444' }} /> Son Dakika</h1>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Son 24 saat</span>
      </div>

      {/* Stats */}
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

      {/* Filters */}
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
              {breakingTags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
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
        </div>
      </div>

      {/* News list */}
      <div className="news-list">
        {loading ? (
          <div className="loading-state"><div className="spinner large" /></div>
        ) : news.length === 0 ? (
          <div className="empty-state">
            <Zap size={48} color="#ef4444" style={{ opacity: 0.4 }} />
            <h3>Son 24 saatte haber yok</h3>
            <p>Son Dakika etiketleri için henüz haber çekilmedi.</p>
          </div>
        ) : (
          news.map(item => (
            <NewsCard key={item.id} item={item} onUpdate={handleUpdate} isNew={false} isBreaking />
          ))
        )}
      </div>

      {/* Pagination */}
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
