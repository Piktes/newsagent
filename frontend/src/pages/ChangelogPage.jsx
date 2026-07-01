import { useState, useEffect } from 'react';
import { adminApi } from '../services/api';
import { History, RefreshCw } from 'lucide-react';

export default function ChangelogPage() {
  const [commits, setCommits] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    setLoading(true);
    adminApi.getVersion()
      .then(r => { setCommits(r.data.commits || []); setError(r.data.error || null); })
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => { refresh(); }, []);

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <History size={26} /> Son Değişiklikler
        </h1>
        <button
          className="btn btn-outline"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem' }}
          onClick={refresh}
        >
          <RefreshCw size={13} /> Yenile
        </button>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner large" /></div>
      ) : commits.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          Sunucuda git geçmişi okunamadı.
          {error && (
            <div style={{ marginTop: '0.75rem' }}>
              <code style={{ fontSize: '0.75rem', color: 'var(--danger)', whiteSpace: 'pre-wrap' }}>{error}</code>
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="card" style={{ padding: '1rem', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Sunucuda çalışan güncel sürüm</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', marginTop: '0.25rem' }}>
              <code style={{ fontSize: '0.8rem', color: 'var(--accent)' }}>{commits[0].hash}</code>
              <span style={{ fontWeight: 600 }}>{commits[0].message}</span>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>
              {new Date(commits[0].date).toLocaleString('tr-TR')}
            </div>
          </div>

          <div className="card" style={{ padding: 0 }}>
            {commits.slice(1).map((c, i) => (
              <div key={c.hash} style={{
                display: 'flex', gap: '0.75rem', alignItems: 'baseline',
                padding: '0.75rem 1rem',
                borderBottom: i < commits.length - 2 ? '1px solid var(--border)' : 'none',
              }}>
                <code style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>{c.hash}</code>
                <span style={{ flex: 1, fontSize: '0.875rem' }}>{c.message}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0, whiteSpace: 'nowrap' }}>
                  {new Date(c.date).toLocaleString('tr-TR')}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
