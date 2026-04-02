import { useState, useEffect } from 'react';
import { useSearchParams, useLocation } from 'react-router-dom';
import { TrendingUp, Minus, TrendingDown, Activity, Newspaper, Calendar, RefreshCw } from 'lucide-react';
import { newsApi, tagsApi } from '../services/api';
import NewsCard from '../components/NewsCard';

export default function DashboardPage() {
  const [news, setNews] = useState([]);
  const [tags, setTags] = useState([]);
  const [counts, setCounts] = useState({ total: 0, unread: 0, favorites: 0, sentiment: { positive: 0, neutral: 0, negative: 0, unknown: 0 } });
  const [loading, setLoading] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState('desc');
  const [selectedTagId, setSelectedTagId] = useState('');
  const [selectedSentiment, setSelectedSentiment] = useState('');
  const [scanning, setScanning] = useState(false);

  const isToday = location.pathname === '/today';
  const tagFilter = searchParams.get('tag') || selectedTagId;

  const fetchNews = async () => {
    setLoading(true);
    try {
      const params = { page, page_size: 20, sort_order: sortOrder };
      if (tagFilter) params.tag_id = tagFilter;
      if (searchQuery) params.query = searchQuery;
      if (selectedSentiment) params.sentiment = selectedSentiment;
      
      if (isToday) {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date();
        endOfToday.setHours(23, 59, 59, 999);
        params.date_from = startOfToday.toISOString();
        params.date_to = endOfToday.toISOString();
      }

      const res = await newsApi.list(params);
      setNews(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };


  const fetchCounts = async () => {
    try {
      const res = await newsApi.count(tagFilter ? { tag_id: tagFilter } : {});
      setCounts(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchNews();
    fetchCounts();
    tagsApi.list().then(r => setTags(r.data)).catch(() => {});
  }, [tagFilter, page, sortOrder, selectedSentiment, isToday]);


  // Sync URL tag param with dropdown
  useEffect(() => {
    const urlTag = searchParams.get('tag');
    if (urlTag) {
      setSelectedTagId(urlTag);
    }
  }, [searchParams]);

  const handleSearch = async (e) => {
    e.preventDefault();
    setPage(1);
    fetchNews();

    if (!scanning) {
      setScanning(true);
      try {
        if (tagFilter && tagFilter !== "all" && tagFilter !== "") {
          await tagsApi.scan(tagFilter);
        } else {
          await tagsApi.scanAll();
        }
      } catch (err) {
        console.error('Scan trigger error:', err);
      }
      setTimeout(() => setScanning(false), 2000); // Visual feedback clear
    }
  };

  const handleSortChange = (newSort) => {
    setSortOrder(newSort);
    setPage(1);
  };

  const handleTagFilter = (tagId) => {
    setSelectedTagId(tagId);
    setPage(1);
    if (tagId) {
      setSearchParams({ tag: tagId });
    } else {
      setSearchParams({});
    }
  };

  const handleSentimentFilter = (sentiment) => {
    setSelectedSentiment(sentiment === selectedSentiment ? '' : sentiment);
    setPage(1);
  };

  const handleUpdate = () => {
    fetchNews();
    fetchCounts();
  };

  // Sentiment bar percentages
  const sentimentTotal = (counts.sentiment?.positive || 0) + (counts.sentiment?.neutral || 0) + (counts.sentiment?.negative || 0);
  const sentimentPct = {
    positive: sentimentTotal > 0 ? Math.round((counts.sentiment?.positive || 0) / sentimentTotal * 100) : 0,
    neutral: sentimentTotal > 0 ? Math.round((counts.sentiment?.neutral || 0) / sentimentTotal * 100) : 0,
    negative: sentimentTotal > 0 ? Math.round((counts.sentiment?.negative || 0) / sentimentTotal * 100) : 0,
  };

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {isToday ? <><Calendar size={28} /> Bugün Ne Oldu</> : <><Newspaper size={28} /> Haber Akışı</>}
        </h1>
        <div className="header-actions">

        </div>
      </div>

      {/* Stats - Only visible on main feed */}
      {!isToday && (
        <>
          <div className="stats-row">
            <div className="stat-card">
              <span className="stat-value">{counts.total}</span>
              <span className="stat-label">Toplam Haber</span>
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

          {/* Sentiment Distribution */}
          {sentimentTotal > 0 && (
            <div className="sentiment-section">
              <h3 className="sentiment-section-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <Activity size={20} /> Tutum Analizi Dağılımı
              </h3>
              <div className="sentiment-cards">
                <div
                  className={`sentiment-stat-card positive ${selectedSentiment === 'positive' ? 'selected' : ''}`}
                  onClick={() => handleSentimentFilter('positive')}
                >
                  <span className="sentiment-stat-emoji"><TrendingUp size={28} /></span>
                  <span className="sentiment-stat-value">{counts.sentiment?.positive || 0}</span>
                  <span className="sentiment-stat-label">Pozitif</span>
                  <span className="sentiment-stat-pct">{sentimentPct.positive}%</span>
                </div>
                <div
                  className={`sentiment-stat-card neutral ${selectedSentiment === 'neutral' ? 'selected' : ''}`}
                  onClick={() => handleSentimentFilter('neutral')}
                >
                  <span className="sentiment-stat-emoji"><Minus size={28} /></span>
                  <span className="sentiment-stat-value">{counts.sentiment?.neutral || 0}</span>
                  <span className="sentiment-stat-label">Nötr</span>
                  <span className="sentiment-stat-pct">{sentimentPct.neutral}%</span>
                </div>
                <div
                  className={`sentiment-stat-card negative ${selectedSentiment === 'negative' ? 'selected' : ''}`}
                  onClick={() => handleSentimentFilter('negative')}
                >
                  <span className="sentiment-stat-emoji"><TrendingDown size={28} /></span>
                  <span className="sentiment-stat-value">{counts.sentiment?.negative || 0}</span>
                  <span className="sentiment-stat-label">Negatif</span>
                  <span className="sentiment-stat-pct">{sentimentPct.negative}%</span>
                </div>
              </div>

              {/* Sentiment Bar */}
              <div className="sentiment-bar">
                {sentimentPct.positive > 0 && (
                  <div className="sentiment-bar-segment positive" style={{ width: `${sentimentPct.positive}%` }}>
                    {sentimentPct.positive > 8 && `${sentimentPct.positive}%`}
                  </div>
                )}
                {sentimentPct.neutral > 0 && (
                  <div className="sentiment-bar-segment neutral" style={{ width: `${sentimentPct.neutral}%` }}>
                    {sentimentPct.neutral > 8 && `${sentimentPct.neutral}%`}
                  </div>
                )}
                {sentimentPct.negative > 0 && (
                  <div className="sentiment-bar-segment negative" style={{ width: `${sentimentPct.negative}%` }}>
                    {sentimentPct.negative > 8 && `${sentimentPct.negative}%`}
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Search */}
      <form className="search-bar" onSubmit={handleSearch}>
        <input
          type="text"
          placeholder="Haberlerde ara..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button type="submit" className="btn btn-primary" disabled={scanning}>
          {scanning ? <RefreshCw size={16} className="spin" /> : '🔍'} 
          {scanning ? ' Aranıyor...' : ' Ara'}
        </button>
      </form>

      {/* Filters */}
      <div className="filters-bar">
        <div className="filter-group">
          <label className="filter-label">🔽 Sıralama</label>
          <div className="filter-chips">
            <button
              className={`filter-chip ${sortOrder === 'desc' ? 'active' : ''}`}
              onClick={() => handleSortChange('desc')}
            >
              Yeniden Eskiye
            </button>
            <button
              className={`filter-chip ${sortOrder === 'asc' ? 'active' : ''}`}
              onClick={() => handleSortChange('asc')}
            >
              Eskiden Yeniye
            </button>
          </div>
        </div>

        <div className="filter-group">
          <label className="filter-label">🏷️ Etiket</label>
          <select
            className="filter-select"
            value={selectedTagId}
            onChange={(e) => handleTagFilter(e.target.value)}
          >
            <option value="">Tüm Etiketler</option>
            {tags.map(tag => (
              <option key={tag.id} value={tag.id}>
                {tag.name}
              </option>
            ))}
          </select>
        </div>

        <div className="filter-group">
          <label className="filter-label">🎯 Tutum</label>
          <select
            className="filter-select"
            value={selectedSentiment}
            onChange={(e) => handleSentimentFilter(e.target.value)}
          >
            <option value="">Tüm Tutumlar</option>
            <option value="positive">↗️ Pozitif</option>
            <option value="neutral">➡️ Nötr</option>
            <option value="negative">↘️ Negatif</option>
          </select>
        </div>

        {(selectedTagId || selectedSentiment) && (
          <button className="btn btn-sm btn-outline filter-clear" onClick={() => { handleTagFilter(''); setSelectedSentiment(''); }}>
            ✕ Filtreleri Temizle
          </button>
        )}
      </div>

      {/* News list */}
      <div className="news-list">
        {loading ? (
          <div className="loading-state">
            <div className="spinner large"></div>
            <p>Haberler yükleniyor...</p>
          </div>
        ) : news.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">📭</span>
            <h3>Henüz haber yok</h3>
            <p>Etiket ekleyerek haber taramaya başlayın</p>
          </div>
        ) : (
          news.map(item => (
            <NewsCard key={item.id} item={item} onUpdate={() => { fetchNews(); fetchCounts(); }} />
          ))
        )}
      </div>

      {/* Pagination */}
      {news.length > 0 && (
        <div className="pagination">
          <button className="btn btn-outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            ← Önceki
          </button>
          <span className="page-info">Sayfa {page}</span>
          <button className="btn btn-outline" disabled={news.length < 20} onClick={() => setPage(p => p + 1)}>
            Sonraki →
          </button>
        </div>
      )}
    </div>
  );
}
