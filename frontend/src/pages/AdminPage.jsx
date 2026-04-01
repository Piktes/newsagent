import { useState, useEffect } from 'react';
import { adminApi } from '../services/api';

export default function AdminPage() {
  const [stats, setStats] = useState(null);
  const [smtp, setSmtp] = useState({ host: '', port: 587, username: '', password: '', from_email: '', is_active: false });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [statsRes, smtpRes] = await Promise.all([adminApi.getStats(), adminApi.getSmtp()]);
        setStats(statsRes.data);
        if (smtpRes.data) {
          setSmtp({ ...smtpRes.data, password: '' });
        }
      } catch (err) {
        console.error(err);
      }
      setLoading(false);
    };
    fetchData();
  }, []);

  const handleSmtpSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = { ...smtp };
      if (!data.password) delete data.password;
      await adminApi.updateSmtp(data);
      alert('SMTP ayarları kaydedildi!');
    } catch (err) {
      alert(err.response?.data?.detail || 'Hata oluştu');
    }
    setSaving(false);
  };

  if (loading) return <div className="loading-state"><div className="spinner large"></div></div>;

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1>📊 Yönetim Paneli</h1>
      </div>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card large">
            <span className="stat-icon">📰</span>
            <span className="stat-value">{stats.total_news}</span>
            <span className="stat-label">Toplam Haber</span>
          </div>
          <div className="stat-card large accent">
            <span className="stat-icon">📬</span>
            <span className="stat-value">{stats.total_unread}</span>
            <span className="stat-label">Okunmamış</span>
          </div>
          <div className="stat-card large gold">
            <span className="stat-icon">⭐</span>
            <span className="stat-value">{stats.total_favorites}</span>
            <span className="stat-label">Favori</span>
          </div>
          <div className="stat-card large">
            <span className="stat-icon">🏷️</span>
            <span className="stat-value">{stats.total_tags}</span>
            <span className="stat-label">Etiket</span>
          </div>
          <div className="stat-card large">
            <span className="stat-icon">📡</span>
            <span className="stat-value">{stats.total_sources}</span>
            <span className="stat-label">Kaynak</span>
          </div>
          <div className="stat-card large">
            <span className="stat-icon">👥</span>
            <span className="stat-value">{stats.total_users}</span>
            <span className="stat-label">Kullanıcı</span>
          </div>
        </div>
      )}

      <div className="card form-card">
        <h3>📧 SMTP Ayarları</h3>
        <form onSubmit={handleSmtpSave}>
          <div className="form-row">
            <div className="form-group flex-1">
              <label>SMTP Host</label>
              <input type="text" value={smtp.host || ''} onChange={(e) => setSmtp({...smtp, host: e.target.value})} placeholder="smtp.gmail.com" />
            </div>
            <div className="form-group">
              <label>Port</label>
              <input type="number" value={smtp.port} onChange={(e) => setSmtp({...smtp, port: parseInt(e.target.value)})} />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group flex-1">
              <label>Kullanıcı Adı</label>
              <input type="text" value={smtp.username || ''} onChange={(e) => setSmtp({...smtp, username: e.target.value})} />
            </div>
            <div className="form-group flex-1">
              <label>Şifre</label>
              <input type="password" value={smtp.password || ''} onChange={(e) => setSmtp({...smtp, password: e.target.value})} placeholder="••••••" />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group flex-1">
              <label>Gönderen E-posta</label>
              <input type="email" value={smtp.from_email || ''} onChange={(e) => setSmtp({...smtp, from_email: e.target.value})} />
            </div>
            <div className="form-group">
              <label>Aktif</label>
              <label className="toggle">
                <input type="checkbox" checked={smtp.is_active} onChange={(e) => setSmtp({...smtp, is_active: e.target.checked})} />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? 'Kaydediliyor...' : 'Kaydet'}
          </button>
        </form>
      </div>
    </div>
  );
}
