import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import {
  TrendingUp, Minus, TrendingDown, Activity, Newspaper, Calendar,
  RefreshCw, FileDown, Search, Rss, Globe, Zap,
  X, Check, BellRing, ChevronDown,
  ArrowUpDown, Tag, BarChart2, SlidersHorizontal,
} from 'lucide-react';
import { FaYoutube, FaXTwitter } from 'react-icons/fa6';
import { newsApi, tagsApi } from '../services/api';
import NewsCard from '../components/NewsCard';
import TrendsPanel from '../components/TrendsPanel';

const SOURCE_OPTIONS = [
  { value: 'rss',         label: 'RSS / Haber',    Icon: Rss },
  { value: 'web',         label: 'Web',             Icon: Globe },
  { value: 'youtube',     label: 'YouTube',         Icon: FaYoutube },
  { value: 'twitter',     label: 'Twitter / X',     Icon: FaXTwitter },
  { value: 'newsapi',     label: 'NewsAPI.ai',      Icon: Zap },
];

/* ── Kaynak Multi-Select Dropdown ──────────────────────────────────── */
function SourceMultiSelect({ selected, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = (value) => {
    onChange(prev => {
      if (prev.includes(value)) {
        if (prev.length === 1) return prev;
        return prev.filter(v => v !== value);
      }
      return [...prev, value];
    });
  };

  const allSelected = selected.length === SOURCE_OPTIONS.length;
  const label = allSelected
    ? 'Tüm Kaynaklar'
    : `${selected.length} Kaynak Seçili`;

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="filter-select"
        style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', cursor: 'pointer', minWidth: 148, width: '100%' }}
        onClick={() => setOpen(o => !o)}
      >
        <span style={{ flex: 1, textAlign: 'left', fontSize: '0.8rem' }}>{label}</span>
        <ChevronDown size={12} style={{ opacity: 0.55, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
      </button>

      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 5px)', left: 0, zIndex: 200,
          background: 'var(--bg-card)', borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-modal)', minWidth: 200, padding: '0.375rem',
          display: 'flex', flexDirection: 'column', gap: '0.1rem',
        }}>
          {SOURCE_OPTIONS.map(({ value, label, Icon }) => {
            const checked = selected.includes(value);
            return (
              <label
                key={value}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.6rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', background: checked ? 'rgba(0,112,243,0.06)' : 'transparent', userSelect: 'none' }}
                onClick={() => toggle(value)}
              >
                <span style={{ width: 15, height: 15, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center', background: checked ? 'var(--accent)' : 'transparent', boxShadow: checked ? 'none' : 'var(--ring)', flexShrink: 0 }}>
                  {checked && <Check size={10} color="white" />}
                </span>
                <Icon size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.8125rem' }}>{label}</span>
              </label>
            );
          })}
          <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.25rem', paddingTop: '0.25rem' }}>
            <button
              type="button"
              className="btn btn-sm btn-outline"
              style={{ width: '100%', justifyContent: 'center', fontSize: '0.75rem' }}
              onClick={() => onChange(allSelected ? [SOURCE_OPTIONS[0].value] : SOURCE_OPTIONS.map(s => s.value))}
            >
              {allSelected ? 'Tümünü Kaldır' : 'Tümünü Seç'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Platform Seçim Popup ──────────────────────────────────────────── */
function PlatformPopup({ selected, onConfirm, onClose }) {
  const [local, setLocal] = useState(selected);
  const toggle = (v) => setLocal(prev =>
    prev.includes(v) ? prev.filter(x => x !== v) : [...prev, v]
  );
  const allSelected = local.length === SOURCE_OPTIONS.length;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', maxWidth: 360 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', letterSpacing: '-0.32px' }}>Platform Seç</h3>
          <button className="btn btn-sm btn-outline" onClick={onClose}><X size={14} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '1rem' }}>
          {SOURCE_OPTIONS.map(({ value, label, Icon }) => (
            <label key={value} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', boxShadow: local.includes(value) ? 'var(--ring-accent)' : 'var(--ring)', background: local.includes(value) ? 'rgba(0,112,243,0.05)' : 'transparent' }}>
              <input type="checkbox" checked={local.includes(value)} onChange={() => toggle(value)} style={{ display: 'none' }} />
              <span style={{ width: 16, height: 16, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: local.includes(value) ? 'var(--accent)' : 'transparent', boxShadow: local.includes(value) ? 'none' : 'var(--ring)', flexShrink: 0 }}>
                {local.includes(value) && <Check size={11} color="white" />}
              </span>
              <Icon size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{label}</span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
          <button className="btn btn-sm btn-outline" onClick={() => setLocal(allSelected ? [] : SOURCE_OPTIONS.map(s => s.value))}>
            {allSelected ? 'Tümünü Kaldır' : 'Tümünü Seç'}
          </button>
          <button className="btn btn-primary btn-sm" onClick={() => onConfirm(local)} disabled={local.length === 0}>
            Ara ({local.length})
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── PDF Etiket Seçim Popup ─────────────────────────────────────────── */
function PdfPopup({ tags, onConfirm, onClose }) {
  const [selected, setSelected] = useState(tags.map(t => t.id));
  const toggle = (id) => setSelected(prev =>
    prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
  );
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ textAlign: 'left', maxWidth: 360 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', letterSpacing: '-0.32px' }}>PDF Raporu — Etiket Seç</h3>
          <button className="btn btn-sm btn-outline" onClick={onClose}><X size={14} /></button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '1rem' }}>
          {tags.map(tag => (
            <label key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer', boxShadow: selected.includes(tag.id) ? 'var(--ring-accent)' : 'var(--ring)', background: selected.includes(tag.id) ? 'rgba(0,112,243,0.05)' : 'transparent' }}>
              <input type="checkbox" checked={selected.includes(tag.id)} onChange={() => toggle(tag.id)} style={{ display: 'none' }} />
              <span style={{ width: 16, height: 16, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', background: selected.includes(tag.id) ? 'var(--accent)' : 'transparent', boxShadow: selected.includes(tag.id) ? 'none' : 'var(--ring)', flexShrink: 0 }}>
                {selected.includes(tag.id) && <Check size={11} color="white" />}
              </span>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.color, flexShrink: 0 }} />
              <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{tag.name}</span>
            </label>
          ))}
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'space-between' }}>
          <button className="btn btn-sm btn-outline" onClick={() => setSelected(selected.length === tags.length ? [] : tags.map(t => t.id))}>
            {selected.length === tags.length ? 'Tümünü Kaldır' : 'Tümünü Seç'}
          </button>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn btn-sm btn-outline" onClick={onClose}>İptal</button>
            <button className="btn btn-primary btn-sm" style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }} onClick={() => onConfirm(selected)} disabled={selected.length === 0}>
              <FileDown size={14} /> Rapor Oluştur ({selected.length})
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

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

/* ── Ana Bileşen ──────────────────────────────────────────────────── */
export default function DashboardPage() {
  const [news, setNews] = useState([]);
  const [tags, setTags] = useState([]);
  const [counts, setCounts] = useState({ total: 0, unread: 0, favorites: 0, sentiment: { positive: 0, neutral: 0, negative: 0, unknown: 0 } });
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [selectedSentiment, setSelectedSentiment] = useState('');
  const [scanning, setScanning] = useState(false);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exportingPdf, setExportingPdf] = useState(false);

  // Platform popup
  const [showPlatformPopup, setShowPlatformPopup] = useState(false);
  const [selectedPlatforms, setSelectedPlatforms] = useState(SOURCE_OPTIONS.map(s => s.value));

  // PDF popup
  const [showPdfPopup, setShowPdfPopup] = useState(false);

  // New news banner
  const [newCount, setNewCount] = useState(0);
  const [newTags, setNewTags] = useState([]);
  const lastKnownIdRef = useRef(0);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);

  const isNewItem = (item) =>
    isToday && !item.is_read && item.published_at &&
    (Date.now() - new Date(item.published_at).getTime()) < 60 * 60 * 1000;

  const isToday = location.pathname === '/today';
  const tagFilter = searchParams.get('tag') || selectedTagId;

  const fetchNews = useCallback(async (sourcePlatforms) => {
    setLoading(true);
    try {
      const platforms = sourcePlatforms || selectedPlatforms;
      const allPlatforms = platforms.length === SOURCE_OPTIONS.length;
      const params = { page, page_size: PAGE_SIZE, sort_order: sortOrder };
      if (tagFilter) params.tag_id = tagFilter;
      if (debouncedQuery) params.query = debouncedQuery;
      if (selectedSentiment) params.sentiment = selectedSentiment;
      if (!allPlatforms) params.source_types = platforms;

      if (isToday) {
        const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(); endOfToday.setHours(23, 59, 59, 999);
        params.date_from = startOfToday.toISOString();
        params.date_to = endOfToday.toISOString();
      } else {
        if (dateFrom) params.date_from = new Date(dateFrom).toISOString();
        if (dateTo) { const dt = new Date(dateTo); dt.setHours(23, 59, 59, 999); params.date_to = dt.toISOString(); }
      }

      const res = await newsApi.list(params);
      setNews(res.data);
      if (page === 1) {
        const idParams = {};
        if (tagFilter) idParams.tag_id = tagFilter;
        const idRes = await newsApi.latestId(idParams);
        lastKnownIdRef.current = idRes.data.latest_id || 0;
        if (idRes.data.last_fetched_at) setLastFetchedAt(idRes.data.last_fetched_at);
      }
      setNewCount(0);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  }, [page, sortOrder, tagFilter, debouncedQuery, selectedSentiment, selectedPlatforms, isToday, dateFrom, dateTo]);

  const fetchCounts = useCallback(async () => {
    try {
      const params = {};
      if (tagFilter) params.tag_id = tagFilter;
      if (isToday) {
        const s = new Date(); s.setHours(0, 0, 0, 0);
        const e = new Date(); e.setHours(23, 59, 59, 999);
        params.date_from = s.toISOString();
        params.date_to = e.toISOString();
      } else {
        if (dateFrom) params.date_from = new Date(dateFrom).toISOString();
        if (dateTo) { const dt = new Date(dateTo); dt.setHours(23, 59, 59, 999); params.date_to = dt.toISOString(); }
      }
      const allPlatforms = selectedPlatforms.length === 0 || selectedPlatforms.length === SOURCE_OPTIONS.length;
      if (!allPlatforms) params.source_types = selectedPlatforms;
      const res = await newsApi.count(params);
      setCounts(res.data);
    } catch (err) { console.error(err); }
  }, [tagFilter, isToday, dateFrom, dateTo, selectedPlatforms]);

  // Initial load (filter changes)
  useEffect(() => {
    fetchNews();
    fetchCounts();
    tagsApi.list().then(r => setTags(r.data)).catch(() => {});
  }, [tagFilter, page, sortOrder, debouncedQuery, selectedSentiment, isToday, dateFrom, dateTo, selectedPlatforms]);

  // Debounce searchQuery → debouncedQuery
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
      setPage(1);
    }, searchQuery === '' ? 0 : 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Sync URL tag param; clear state tag when route changes
  useEffect(() => {
    const urlTag = searchParams.get('tag');
    if (urlTag) setSelectedTagId(urlTag);
    else setSelectedTagId('');
  }, [location.pathname, searchParams]);

  // Poll for new news every 30 seconds
  useEffect(() => {
    const poll = async () => {
      try {
        const params = { since_id: lastKnownIdRef.current };
        if (tagFilter) params.tag_id = tagFilter;
        const res = await newsApi.latestId(params);
        const { latest_id, new_tags } = res.data;
        if (lastKnownIdRef.current > 0 && latest_id > lastKnownIdRef.current) {
          // Fetch actual new items to get accurate count (ID range ≠ item count)
          const pollParams = { page_size: 50, sort_order: 'desc', ...(tagFilter ? { tag_id: tagFilter } : {}) };
        if (isToday) {
          const s = new Date(); s.setHours(0, 0, 0, 0);
          const e = new Date(); e.setHours(23, 59, 59, 999);
          pollParams.date_from = s.toISOString();
          pollParams.date_to = e.toISOString();
        }
        const newRes = await newsApi.list(pollParams);
          const freshIds = new Set(
            (newRes.data || []).filter(n => n.id > lastKnownIdRef.current).map(n => n.id)
          );
          if (freshIds.size > 0) {
            setNewCount(freshIds.size);
            setNewTags(new_tags || []);
          }
        }
      } catch (e) {}
    };
    const interval = setInterval(poll, 30000);
    return () => clearInterval(interval);
  }, [tagFilter, isToday]);

  const handleSearch = (e) => {
    e?.preventDefault();
    setDebouncedQuery(searchQuery);
    setPage(1);
  };

  const handleFetchNews = async (platforms) => {
    setSelectedPlatforms(platforms);
    setShowPlatformPopup(false);
    setScanning(true);
    const preScanFetchedAt = lastFetchedAt;
    const allSelected = platforms.length === SOURCE_OPTIONS.length;
    const scanTypes = allSelected ? null : platforms;
    try {
      if (tagFilter && tagFilter !== '') await tagsApi.scan(tagFilter, 30, scanTypes);
      else await tagsApi.scanAll(30, scanTypes);
    } catch (e) {}
    // Poll /latest-id until last_fetched_at changes → scan complete
    let attempts = 0;
    const pollScanComplete = async () => {
      attempts++;
      try {
        const idParams = {};
        if (tagFilter) idParams.tag_id = tagFilter;
        const idRes = await newsApi.latestId(idParams);
        const newFetchedAt = idRes.data.last_fetched_at;
        if (newFetchedAt && newFetchedAt !== preScanFetchedAt) {
          setLastFetchedAt(newFetchedAt);
          lastKnownIdRef.current = idRes.data.latest_id || lastKnownIdRef.current;
          await fetchNews(platforms);
          fetchCounts();
          setScanning(false);
          return;
        }
      } catch (e) {}
      if (attempts < 12) setTimeout(pollScanComplete, 5000);
      else setScanning(false);
    };
    setTimeout(pollScanComplete, 8000);
  };

  const handleNewNewsBanner = async () => {
    setNewCount(0);
    setNewTags([]);
    await fetchNews();
    fetchCounts();
  };

  const handleSortChange = (s) => { setSortOrder(s); setPage(1); };

  const handleTagFilter = (tagId) => {
    setSelectedTagId(tagId);
    setPage(1);
    tagId ? setSearchParams({ tag: tagId }) : setSearchParams({});
  };

  const handleSentimentFilter = (s) => {
    setSelectedSentiment(s === selectedSentiment ? '' : s);
    setPage(1);
  };

  const togglePlatform = (value) => {
    setSelectedPlatforms(prev => {
      if (prev.includes(value)) {
        if (prev.length === 1) return prev;
        return prev.filter(v => v !== value);
      }
      return [...prev, value];
    });
    setPage(1);
  };

  const clearAllFilters = () => {
    handleTagFilter('');
    setSelectedSentiment('');
    setDateFrom('');
    setDateTo('');
    setSelectedPlatforms(SOURCE_OPTIONS.map(s => s.value));
    setSearchQuery('');
    setDebouncedQuery('');
    setPage(1);
  };

  const handleUpdate = () => { fetchNews(); fetchCounts(); };

  const handleExportPdf = () => setShowPdfPopup(true);

  const doPdfExport = async (tagIds) => {
    setShowPdfPopup(false);
    setExportingPdf(true);
    try {
      const params = {};
      if (tagIds.length < tags.length) params.tag_ids = tagIds;
      if (!isToday) {
        if (dateFrom) params.date_from = new Date(dateFrom).toISOString();
        if (dateTo) { const dt = new Date(dateTo); dt.setHours(23, 59, 59, 999); params.date_to = dt.toISOString(); }
      } else {
        const s = new Date(); s.setHours(0, 0, 0, 0);
        const e = new Date(); e.setHours(23, 59, 59, 999);
        params.date_from = s.toISOString();
        params.date_to = e.toISOString();
      }
      const res = await newsApi.exportPdf(params);
      const blob = new Blob([res.data], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const d = new Date();
      const pad = n => String(n).padStart(2, '0');
      const stamp = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
      const disposition = res.headers['content-disposition'] || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `Haberajani_${stamp}.pdf`;
      const a = document.createElement('a');
      a.style.display = 'none'; a.href = url; a.download = filename;
      document.body.appendChild(a); a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    } catch (err) {
      console.error(err);
      alert('PDF oluşturulurken hata oluştu.');
    }
    setExportingPdf(false);
  };

  // Sentiment stats
  const sentimentTotal = (counts.sentiment?.positive || 0) + (counts.sentiment?.neutral || 0) + (counts.sentiment?.negative || 0);
  const sentimentPct = {
    positive: sentimentTotal > 0 ? Math.round((counts.sentiment?.positive || 0) / sentimentTotal * 100) : 0,
    neutral:  sentimentTotal > 0 ? Math.round((counts.sentiment?.neutral  || 0) / sentimentTotal * 100) : 0,
    negative: sentimentTotal > 0 ? Math.round((counts.sentiment?.negative || 0) / sentimentTotal * 100) : 0,
  };

  const activeTag = tags.find(t => String(t.id) === String(tagFilter));
  const hasCustomPlatforms = selectedPlatforms.length < SOURCE_OPTIONS.length;
  const hasActiveFilters = !!(selectedTagId || selectedSentiment || dateFrom || dateTo || hasCustomPlatforms);
  const SENTIMENT_LABELS = { positive: 'Pozitif', neutral: 'Nötr', negative: 'Negatif' };

  return (
    <div className="dashboard-page">
      {/* New news banner */}
      {newCount > 0 && (
        <div onClick={handleNewNewsBanner} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.625rem 1rem', marginBottom: '1rem', borderRadius: 'var(--radius)', cursor: 'pointer', background: 'rgba(0,112,243,0.06)', boxShadow: 'rgba(0,112,243,0.25) 0px 0px 0px 1px' }}>
          <BellRing size={16} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--accent)' }}>
            {newCount} yeni haber geldi
            {newTags.length > 0 && (
              <span style={{ fontWeight: 400, color: 'var(--text-secondary)' }}>
                {' '}— <strong style={{ color: 'var(--accent)' }}>{newTags.join(', ')}</strong>
              </span>
            )}
            {' '}— yüklemek için tıklayın
          </span>
          <X size={14} style={{ marginLeft: 'auto', color: 'var(--text-muted)', flexShrink: 0 }} onClick={e => { e.stopPropagation(); setNewCount(0); setNewTags([]); }} />
        </div>
      )}

      <div className="page-header">
        <h1>
          {isToday ? <><Calendar size={24} /> Bugün Ne Oldu</> : <><Newspaper size={24} /> Haber Akışı</>}
        </h1>
        {lastFetchedAt && (
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
            <RefreshCw size={11} />
            Son tarama: {new Date((lastFetchedAt.endsWith('Z') || lastFetchedAt.includes('+') ? lastFetchedAt : lastFetchedAt + 'Z')).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })}
          </span>
        )}
      </div>

      {/* Active tag banner */}
      {activeTag && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.5rem 1rem', marginBottom: '1rem', borderRadius: 'var(--radius)', background: `${activeTag.color}14`, boxShadow: `${activeTag.color}44 0px 0px 0px 1px` }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: activeTag.color, flexShrink: 0, boxShadow: `0 0 6px ${activeTag.color}` }} />
          <span style={{ fontWeight: 600, color: activeTag.color, fontSize: '0.875rem' }}>{activeTag.name}</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>etiketi için filtrelenmiş</span>
          <button onClick={() => handleTagFilter('')} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value">{counts.total}</span>
          <span className="stat-label">Toplam{isToday ? ' Bugün' : ''}</span>
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

      {/* Sentiment */}
      {sentimentTotal > 0 && (
        <div className="sentiment-section">
          <h3 className="sentiment-section-title"><Activity size={18} /> Tutum Analizi</h3>
          <div className="sentiment-cards">
            {[
              { key: 'positive', label: 'Pozitif', Icon: TrendingUp },
              { key: 'neutral',  label: 'Nötr',    Icon: Minus },
              { key: 'negative', label: 'Negatif', Icon: TrendingDown },
            ].map(({ key, label, Icon }) => (
              <div key={key} className={`sentiment-stat-card ${key} ${selectedSentiment === key ? 'selected' : ''}`} onClick={() => handleSentimentFilter(key)}>
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

      {/* Trendler */}
      <TrendsPanel />

      {/* Haberleri Çek */}
      <button
        className="btn-fetch"
        onClick={() => setShowPlatformPopup(true)}
        disabled={scanning}
      >
        <RefreshCw size={13} className={scanning ? 'spin' : ''} />
        {scanning ? 'Çekiliyor...' : 'Haberleri Çek'}
      </button>

      {/* Search */}
      <form className="search-bar" onSubmit={handleSearch}>
        <input
          type="text"
          placeholder="Haberlerde ara..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button type="submit" className="btn-search">
          <Search size={14} />
          Ara
        </button>
      </form>

      {/* Aktif filtreler özeti */}
      {hasActiveFilters && (
        <div className="active-filters-row">
          {selectedTagId && activeTag && (
            <button className="active-filter-chip" onClick={() => handleTagFilter('')}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: activeTag.color, flexShrink: 0 }} />
              {activeTag.name} <X size={10} />
            </button>
          )}
          {selectedSentiment && (
            <button className="active-filter-chip" onClick={() => { setSelectedSentiment(''); setPage(1); }}>
              <BarChart2 size={10} /> {SENTIMENT_LABELS[selectedSentiment]} <X size={10} />
            </button>
          )}
          {(dateFrom || dateTo) && (
            <button className="active-filter-chip" onClick={() => { setDateFrom(''); setDateTo(''); setPage(1); }}>
              <Calendar size={10} /> {dateFrom || '...'} — {dateTo || '...'} <X size={10} />
            </button>
          )}
          {hasCustomPlatforms && SOURCE_OPTIONS.filter(s => selectedPlatforms.includes(s.value)).map(({ value, label, Icon }) => (
            <button key={value} className="active-filter-chip" onClick={() => togglePlatform(value)}>
              <Icon size={10} /> {label} <X size={10} />
            </button>
          ))}
          <button className="active-filter-chip active-filter-clear" onClick={clearAllFilters}>
            <X size={10} /> Tümünü Temizle
          </button>
        </div>
      )}

      {/* Filtreler */}
      <div className="filters-bar">
        <div className="filters-bar-inner">
          <div className="filter-group">
            <span className="filter-label"><ArrowUpDown size={12} /> Sıralama</span>
            <div className="filter-chips">
              <button className={`filter-chip ${sortOrder === 'desc' ? 'active' : ''}`} onClick={() => handleSortChange('desc')}>Yeniden Eskiye</button>
              <button className={`filter-chip ${sortOrder === 'asc'  ? 'active' : ''}`} onClick={() => handleSortChange('asc')}>Eskiden Yeniye</button>
            </div>
          </div>

          <div className="filter-divider" />

          <div className="filter-group">
            <span className="filter-label"><Tag size={12} /> Etiket</span>
            <select className="filter-select" value={selectedTagId} onChange={(e) => handleTagFilter(e.target.value)}>
              <option value="">Tüm Etiketler</option>
              {tags.map(tag => <option key={tag.id} value={tag.id}>{tag.name}</option>)}
            </select>
          </div>

          <div className="filter-divider" />

          <div className="filter-group">
            <span className="filter-label"><BarChart2 size={12} /> Tutum</span>
            <select className="filter-select" value={selectedSentiment} onChange={(e) => handleSentimentFilter(e.target.value)}>
              <option value="">Tümü</option>
              <option value="positive">Pozitif</option>
              <option value="neutral">Nötr</option>
              <option value="negative">Negatif</option>
            </select>
          </div>

          <div className="filter-divider" />

          <div className="filter-group">
            <span className="filter-label"><SlidersHorizontal size={12} /> Kaynak</span>
            <SourceMultiSelect
              selected={selectedPlatforms}
              onChange={(updater) => {
                setSelectedPlatforms(typeof updater === 'function' ? updater(selectedPlatforms) : updater);
                setPage(1);
              }}
            />
          </div>

          {!isToday && (
            <>
              <div className="filter-divider" />
              <div className="filter-group">
                <span className="filter-label"><Calendar size={12} /> Tarih</span>
                <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                  <input type="date" className="filter-select" style={{ width: 130 }} value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                  <input type="date" className="filter-select" style={{ width: 130 }} value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
                </div>
              </div>
            </>
          )}
        </div>

        <div className="filters-bar-actions">
          <button className="btn btn-outline" style={{ gap: '0.375rem', whiteSpace: 'nowrap' }} onClick={handleExportPdf} disabled={exportingPdf}>
            {exportingPdf ? <RefreshCw size={14} className="spin" /> : <FileDown size={14} />}
            Rapor Al
          </button>
        </div>
      </div>

      {/* News list */}
      <div className="news-list">
        {loading ? (
          <div className="loading-state"><div className="spinner large" /></div>
        ) : news.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon"><Newspaper size={48} /></span>
            <h3>Henüz haber yok</h3>
            <p>{isToday ? 'Bugün için haber bulunamadı' : 'Etiket ekleyerek haber taramaya başlayın'}</p>
          </div>
        ) : (
          news.map(item => (
            <NewsCard key={item.id} item={item} onUpdate={handleUpdate} isNew={isNewItem(item)} />
          ))
        )}
      </div>

      {/* Pagination */}
      {counts.total > 0 && (() => {
        const totalPages = Math.ceil(counts.total / PAGE_SIZE);
        const from = (page - 1) * PAGE_SIZE + 1;
        const to = Math.min(page * PAGE_SIZE, counts.total);
        const pageNums = getPageNumbers(page, totalPages);
        return (
          <div className="pagination">
            <span className="page-info">{from}–{to} / {counts.total} sonuç</span>
            <div className="pagination-controls">
              <button className="pg-btn" disabled={page === 1} onClick={() => setPage(1)} title="İlk sayfa">«</button>
              <button className="pg-btn" disabled={page === 1} onClick={() => setPage(p => p - 1)} title="Önceki">‹</button>
              {pageNums.map((n, i) =>
                n === '…'
                  ? <span key={`e${i}`} className="pg-ellipsis">…</span>
                  : <button key={n} className={`pg-btn ${n === page ? 'active' : ''}`} onClick={() => setPage(n)}>{n}</button>
              )}
              <button className="pg-btn" disabled={page === totalPages} onClick={() => setPage(p => p + 1)} title="Sonraki">›</button>
              <button className="pg-btn" disabled={page === totalPages} onClick={() => setPage(totalPages)} title="Son sayfa">»</button>
            </div>
          </div>
        );
      })()}

      {/* Popups */}
      {showPlatformPopup && (
        <PlatformPopup
          selected={selectedPlatforms}
          onConfirm={handleFetchNews}
          onClose={() => setShowPlatformPopup(false)}
        />
      )}
      {showPdfPopup && tags.length > 0 && (
        <PdfPopup
          tags={tags}
          onConfirm={doPdfExport}
          onClose={() => setShowPdfPopup(false)}
        />
      )}
    </div>
  );
}
