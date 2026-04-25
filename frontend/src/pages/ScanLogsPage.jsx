import { useState, useEffect } from 'react';
import { adminApi } from '../services/api';
import { FileText } from 'lucide-react';

export default function ScanLogsPage() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const res = await adminApi.getScanLogs(100);
      setLogs(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchLogs(); }, []);

  const handleClear = async () => {
    if (!confirm('Tüm tarama loglarını silmek istediğinize emin misiniz?')) return;
    try {
      await adminApi.clearScanLogs();
      fetchLogs();
    } catch (err) {
      console.error(err);
    }
  };

  const statusBadge = (status) => {
    const map = {
      success: { class: 'badge-green', icon: '✅' },
      failed: { class: 'badge-red', icon: '❌' },
      partial: { class: 'badge-orange', icon: '⚠️' },
    };
    const info = map[status] || map.failed;
    return <span className={`badge ${info.class}`}>{info.icon} {status}</span>;
  };

  return (
    <div className="dashboard-page admin-page">
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><FileText size={28} /> Tarama Logları</h1>
        <button className="btn btn-outline btn-danger" onClick={handleClear} title="Tüm logları temizle">
          🗑️ Temizle
        </button>
      </div>

      <div className="users-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tarih</th>
              <th>Durum</th>
              <th>Bulunan</th>
              <th>Süre</th>
              <th>Hata</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="5" style={{textAlign:'center'}}><div className="spinner"></div></td></tr>
            ) : logs.length === 0 ? (
              <tr><td colSpan="5" style={{textAlign:'center', padding: '2rem', color: 'var(--text-muted)'}}>Henüz tarama logu yok</td></tr>
            ) : logs.map(log => (
              <tr key={log.id}>
                <td>{log.scanned_at ? new Date(log.scanned_at).toLocaleString('tr-TR') : '-'}</td>
                <td>{statusBadge(log.status)}</td>
                <td><strong>{log.items_found}</strong> haber</td>
                <td>{log.duration_seconds ? `${log.duration_seconds}s` : '-'}</td>
                <td className="error-cell">{log.error_message || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
