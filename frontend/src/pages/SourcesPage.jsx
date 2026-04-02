import { useState, useEffect } from 'react';
import { sourcesApi } from '../services/api';
import { Radio } from 'lucide-react';

const SOURCE_TYPES = [
  { value: 'rss', label: 'RSS Feed', icon: '📡' },
  { value: 'twitter', label: 'Twitter/X', icon: '𝕏' },
  { value: 'youtube', label: 'YouTube', icon: '▶️' },
  { value: 'web', label: 'Web Scraping', icon: '🌐' },
  { value: 'newsapi', label: 'NewsAPI', icon: '📰' },
];

export default function SourcesPage() {
  const [sources, setSources] = useState([]);
  const [quotas, setQuotas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'rss', url: '', api_key: '', is_default: false });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [srcRes, quotaRes] = await Promise.all([sourcesApi.list(), sourcesApi.getQuotas()]);
      setSources(srcRes.data);
      setQuotas(quotaRes.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await sourcesApi.create(form);
      setForm({ name: '', type: 'rss', url: '', api_key: '', is_default: false });
      setShowForm(false);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Hata oluştu');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Bu kaynağı silmek istediğinize emin misiniz?')) return;
    try {
      await sourcesApi.delete(id);
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Hata oluştu');
    }
  };

  const handleToggle = async (source) => {
    try {
      await sourcesApi.update(source.id, { is_active: !source.is_active });
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Radio size={28} /> Haber Kaynakları</h1>
        <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ İptal' : '+ Yeni Kaynak'}
        </button>
      </div>

      {/* Quotas */}
      {quotas.length > 0 && (
        <div className="stats-row">
          {quotas.map((q, i) => (
            <div key={i} className="stat-card">
              <span className="stat-value">{q.daily_used}/{q.daily_limit}</span>
              <span className="stat-label">{q.source_type} API Kota</span>
              <div className="quota-bar">
                <div
                  className="quota-fill"
                  style={{ width: `${Math.min((q.daily_used / q.daily_limit) * 100, 100)}%` }}
                ></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <form className="card form-card" onSubmit={handleSubmit}>
          <h3>Yeni Kaynak Ekle</h3>
          <div className="form-row">
            <div className="form-group flex-1">
              <label>Kaynak Adı</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ör: TRT Haber RSS"
                required
              />
            </div>
            <div className="form-group">
              <label>Tip</label>
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {SOURCE_TYPES.map(t => <option key={t.value} value={t.value}>{t.icon} {t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label>URL (opsiyonel)</label>
            <input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://example.com/rss"
            />
          </div>
          <div className="form-group">
            <label>API Key (opsiyonel)</label>
            <input
              type="password"
              value={form.api_key}
              onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              placeholder="API key girilmezse scraping yapılır"
            />
          </div>
          <button type="submit" className="btn btn-primary">Kaynak Ekle</button>
        </form>
      )}

      <div className="sources-list">
        {loading ? (
          <div className="loading-state"><div className="spinner large"></div></div>
        ) : sources.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon"><Radio size={48} color="var(--text-muted)" /></span>
            <h3>Kaynak tanımlanmamış</h3>
            <p>Kaynak eklenmeden de Google News RSS ile haber taranır</p>
          </div>
        ) : (
          sources.map(source => {
            const typeInfo = SOURCE_TYPES.find(t => t.value === source.type);
            return (
              <div key={source.id} className={`source-card ${source.is_active ? '' : 'inactive'}`}>
                <div className="source-header">
                  <span className="source-icon">{typeInfo?.icon}</span>
                  <div className="source-info">
                    <h3>{source.name}</h3>
                    <span className="source-type">{typeInfo?.label}</span>
                  </div>
                  <label className="toggle">
                    <input type="checkbox" checked={source.is_active} onChange={() => handleToggle(source)} />
                    <span className="toggle-slider"></span>
                  </label>
                </div>
                {source.url && <p className="source-url">{source.url}</p>}
                <div className="source-badges">
                  {source.has_api_key && <span className="badge badge-green">🔑 API Key</span>}
                  {!source.has_api_key && <span className="badge badge-orange">🕐 Scraping</span>}
                </div>
                <div className="source-actions">
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(source.id)}>🗑️ Sil</button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
