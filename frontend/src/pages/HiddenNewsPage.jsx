import { useState, useEffect, useCallback } from 'react';
import { EyeOff, Newspaper, ArrowUpDown, Tag, BarChart2, Calendar, X, TrendingUp, Minus, TrendingDown, Activity, RefreshCw, Radio } from 'lucide-react';
import { newsApi, tagsApi } from '../services/api';
import NewsCard from '../components/NewsCard';

const SOURCE_OPTIONS = [
  { value: 'rss', label: 'RSS / Haber' },
  { value: 'web', label: 'Web' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'twitter', label: 'Twitter / X' },
  { value: 'newsapi', label: 'NewsAPI.ai' },
];

export default function HiddenNewsPage() {
  const [news, setNews] = useState([]);
  const [tags, setTags] = useState([]);
  const [counts, setCounts] = useState({ total: 0, sentiment: { positive: 0, neutral: 0, negative: 0 } });
  const [loading, setLoading] = useState(true);
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [selectedSentiment, setSelectedSentiment] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const fetchNews = useCallback(async () => {
    setLoading(true);
    try {
      const params = { show_hidden: true, page, page_size: 20, sort_order: sortOrder };
      if (selectedTagId) params.tag_id = selectedTagId;
      if (selectedSentiment) params.sentiment = selectedSentiment;
      if (selectedSource) params.source_types = [selectedSource];
      if (dateFrom) params.date_from = new Date(dateFrom).toISOString();
      if (dateTo) { const dt = new Date(dateTo); dt.setHours(23,59,59,999); params.date_to = dt.toISOString(); }
      const res = await newsApi.list(params);
      setNews(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  }, [page, sortOrder, selectedTagId, selectedSentiment, selectedSource, dateFrom, dateTo]);

  const fetchCounts = useCallback(async () => {
    try {
      // Count hidden items via list length approximation
      const res = await newsApi.list({ show_hidden: true, page_size: 100 });
      const items = res.data;
      const sentiment = { positive: 0, neutral: 0, negative: 0 };
      items.forEach(i => { if (i.sentiment && sentiment[i.sentiment] !== undefined) sentiment[i.sentiment]++; });
      setCounts({ total: items.length, sentiment });
    } catch (_) {}
  }, []);

  useEffect(() => {
    tagsApi.list().then(r => setTags(r.data)).catch(() => {});
    fetchCounts();
  }, []);

  useEffect(() => { fetchNews(); }, [fetchNews]);

  const sentimentTotal = (counts.sentiment?.positive || 0) + (counts.sentiment?.neutral || 0) + (counts.sentiment?.negative || 0);
  const sentimentPct = {
    positive: sentimentTotal > 0 ? Math.round((counts.sentiment?.positive || 0) / sentimentTotal * 100) : 0,
    neutral:  sentimentTotal > 0 ? Math.round((counts.sentiment?.neutral  || 0) / sentimentTotal * 100) : 0,
    negative: sentimentTotal > 0 ? Math.round((counts.sentiment?.negative || 0) / sentimentTotal * 100) : 0,
  };

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <EyeOff size={24} /> Akıştan Çıkarılanlar
        </h1>
        <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{counts.total} haber</span>
      </div>

      {/* Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value">{counts.total}</span>
          <span className="stat-label">Toplam Gizli</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--success)' }}>{counts.sentiment?.positive || 0}</span>
          <span className="stat-label">Pozitif</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--warning)' }}>{counts.sentiment?.neutral || 0}</span>
          <span className="stat-label">Nötr</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ color: 'var(--danger)' }}>{counts.sentiment?.negative || 0}</span>
          <span className="stat-label">Negatif</span>
        </div>
      </div>

      {/* Sentiment bar */}
      {sentimentTotal > 0 && (
        <div className="sentiment-section">
          <h3 className="sentiment-section-title"><Activity size={18} /> Tutum Analizi</h3>
          <div className="sentiment-cards">
            {[
              { key: 'positive', label: 'Pozitif', Icon: TrendingUp },
              { key: 'neutral',  label: 'Nötr',    Icon: Minus },
              { key: 'negative', label: 'Negatif', Icon: TrendingDown },
            ].map(({ key, label, Icon }) => (
              <div key={key} className={`sentiment-stat-card ${key} ${selectedSentiment === key ? 'selected' : ''}`}
                onClick={() => setSelectedSentiment(s => s === key ? '' : key)}>
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
            <select className="filter-select" value={selectedTagId} onChange={e => { setSelectedTagId(e.target.value); setPage(1); }}>
              <option value="">Tüm Etiketler</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
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
            <span className="filter-label"><Radio size={12} /> Kaynak</span>
            <select className="filter-select" value={selectedSource} onChange={e => { setSelectedSource(e.target.value); setPage(1); }}>
              <option value="">Tümü</option>
              {SOURCE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="filter-divider" />
          <div className="filter-group">
            <span className="filter-label"><Calendar size={12} /> Tarih</span>
            <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
              <input type="date" className="filter-select" style={{ width: 130 }} value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
              <input type="date" className="filter-select" style={{ width: 130 }} value={dateTo} onChange={e => { setDateTo(e.target.value); setPage(1); }} />
            </div>
          </div>
        </div>
        {(selectedTagId || selectedSentiment || selectedSource || dateFrom || dateTo) && (
          <div className="filters-bar-actions">
            <button className="btn btn-sm btn-outline" style={{ gap: '0.375rem' }} onClick={() => { setSelectedTagId(''); setSelectedSentiment(''); setSelectedSource(''); setDateFrom(''); setDateTo(''); setPage(1); }}>
              <X size={12} /> Temizle
            </button>
          </div>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="loading-state"><div className="spinner large" /></div>
      ) : news.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon"><Newspaper size={48} color="var(--text-muted)" /></span>
          <h3>Akıştan çıkarılan haber yok</h3>
          <p>Bir haberi akıştan çıkardığınızda burada görünür</p>
        </div>
      ) : (
        <>
          <div className="news-list">
            {news.map(item => (
              <NewsCard key={item.id} item={item} onUpdate={() => { fetchNews(); fetchCounts(); }} showRestoreButton={true} />
            ))}
          </div>
          <div className="pagination">
            <button className="btn btn-outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Önceki</button>
            <span className="page-info">Sayfa {page}</span>
            <button className="btn btn-outline" disabled={news.length < 20} onClick={() => setPage(p => p + 1)}>Sonraki →</button>
          </div>
        </>
      )}
    </div>
  );
}
