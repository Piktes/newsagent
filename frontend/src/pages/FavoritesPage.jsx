import { useState, useEffect } from 'react';
import { newsApi } from '../services/api';
import NewsCard from '../components/NewsCard';

export default function FavoritesPage() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchFavorites = async () => {
    setLoading(true);
    try {
      const res = await newsApi.list({ is_favorite: true, page_size: 50 });
      setNews(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchFavorites(); }, []);

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1>⭐ Favoriler</h1>
        <span className="badge">{news.length} haber</span>
      </div>

      <div className="news-list">
        {loading ? (
          <div className="loading-state">
            <div className="spinner large"></div>
            <p>Favoriler yükleniyor...</p>
          </div>
        ) : news.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">⭐</span>
            <h3>Favori haber yok</h3>
            <p>Haberleri yıldızlayarak favorilere ekleyin</p>
          </div>
        ) : (
          news.map(item => (
            <NewsCard key={item.id} item={item} onUpdate={fetchFavorites} />
          ))
        )}
      </div>
    </div>
  );
}
