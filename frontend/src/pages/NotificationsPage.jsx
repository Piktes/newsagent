import { useState, useEffect } from 'react';
import { notificationsApi, tagsApi } from '../services/api';

export default function NotificationsPage() {
  const [prefs, setPrefs] = useState([]);
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ tag_id: '', method: 'desktop', enabled: true });

  const fetchData = async () => {
    setLoading(true);
    try {
      const [prefRes, tagRes] = await Promise.all([notificationsApi.getPrefs(), tagsApi.list()]);
      setPrefs(prefRes.data);
      setTags(tagRes.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await notificationsApi.savePref({ ...form, tag_id: parseInt(form.tag_id) });
      setForm({ tag_id: '', method: 'desktop', enabled: true });
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Hata oluştu');
    }
  };

  const handleDelete = async (id) => {
    try {
      await notificationsApi.deletePref(id);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const requestPermission = () => {
    if ('Notification' in window) {
      Notification.requestPermission();
    }
  };

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1>🔔 Bildirim Tercihleri</h1>
        <button className="btn btn-outline" onClick={requestPermission}>
          🔔 Bildirim İzni Ver
        </button>
      </div>

      <form className="card form-card" onSubmit={handleSubmit}>
        <h3>Bildirim Ekle</h3>
        <div className="form-row">
          <div className="form-group flex-1">
            <label>Etiket</label>
            <select value={form.tag_id} onChange={(e) => setForm({ ...form, tag_id: e.target.value })} required>
              <option value="">Etiket seçin...</option>
              {tags.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>Yöntem</label>
            <select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option value="desktop">Masaüstü</option>
              <option value="email">E-posta</option>
              <option value="both">İkisi</option>
            </select>
          </div>
        </div>
        <button type="submit" className="btn btn-primary">Kaydet</button>
      </form>

      <div className="notification-prefs-list">
        {loading ? (
          <div className="loading-state"><div className="spinner large"></div></div>
        ) : prefs.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon">🔕</span>
            <h3>Bildirim tercihi yok</h3>
            <p>Etiket bazlı bildirim ekleyin</p>
          </div>
        ) : (
          prefs.map(pref => (
            <div key={pref.id} className="pref-card">
              <div className="pref-info">
                <h3>{pref.tag_name}</h3>
                <span className="pref-method">
                  {pref.method === 'desktop' && '🖥️ Masaüstü'}
                  {pref.method === 'email' && '📧 E-posta'}
                  {pref.method === 'both' && '🖥️ + 📧 İkisi'}
                </span>
              </div>
              <div className="pref-actions">
                <span className={`status-dot ${pref.enabled ? 'active' : 'inactive'}`}></span>
                <button className="btn btn-sm btn-danger" onClick={() => handleDelete(pref.id)}>🗑️</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
