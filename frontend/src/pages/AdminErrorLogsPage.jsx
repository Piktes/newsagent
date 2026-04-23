import { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { adminApi } from '../services/api';

const LEVEL_COLORS = {
  error:    { bg: 'rgba(239,68,68,0.1)',    color: '#ef4444' },
  critical: { bg: 'rgba(239,68,68,0.2)',    color: '#dc2626' },
  warning:  { bg: 'rgba(234,179,8,0.1)',    color: '#ca8a04' },
  info:     { bg: 'rgba(59,130,246,0.1)',   color: '#3b82f6' },
};

export default function AdminErrorLogsPage() {
  const [logs, setLogs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [filter, setFilter]     = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [clearing, setClearing] = useState(false);

  const loadLogs = (level) =>
    adminApi.getErrorLogs(level === 'all' ? null : level)
      .then(r => setLogs(r.data))
      .catch(() => {});

  useEffect(() => {
    loadLogs(filter).finally(() => setLoading(false));
  }, [filter]);

  const handleClear = async () => {
    if (!confirm('Tüm hata loglarını silmek istiyor musunuz?')) return;
    setClearing(true);
    try {
      await adminApi.clearErrorLogs();
      setLogs([]);
    } catch {}
    setClearing(false);
  };

  const refresh = () => {
    setLoading(true);
    loadLogs(filter).finally(() => setLoading(false));
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '1.5rem 1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.5rem' }}>
        <AlertTriangle size={22} color="#ef4444" />
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Hata Logları</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.5rem' }}>
          <button
            onClick={refresh}
            disabled={loading}
            style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '0.35rem 0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8rem', color: 'var(--text-primary)' }}
          >
            <RefreshCw size={13} className={loading ? 'spin' : ''} /> Yenile
          </button>
          <button
            onClick={handleClear}
            disabled={clearing || logs.length === 0}
            style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '0.35rem 0.75rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8rem', color: '#ef4444' }}
          >
            <Trash2 size={13} /> Temizle
          </button>
        </div>
      </div>

      {/* Level filter */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {['all', 'critical', 'error', 'warning', 'info'].map(v => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            style={{
              padding: '0.3rem 0.75rem', borderRadius: 6, fontSize: '0.775rem', cursor: 'pointer',
              border: '1px solid var(--border)',
              background: filter === v ? (LEVEL_COLORS[v]?.bg || 'var(--accent)') : 'var(--bg-secondary)',
              color: filter === v ? (LEVEL_COLORS[v]?.color || '#fff') : 'var(--text-primary)',
              fontWeight: filter === v ? 700 : 400,
              textTransform: 'capitalize',
            }}
          >
            {v === 'all' ? 'Tümü' : v}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', fontSize: '0.8rem', color: 'var(--text-muted)', alignSelf: 'center' }}>
          {logs.length} kayıt
        </span>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ margin: '0 auto 0.5rem' }} />
          Yükleniyor…
        </div>
      ) : logs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Hata logu bulunamadı.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {logs.map(log => {
            const lvStyle = LEVEL_COLORS[log.level] || LEVEL_COLORS.info;
            const isOpen = expanded === log.id;
            return (
              <div key={log.id} className="card" style={{ padding: '0.75rem 1rem' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: log.details ? 'pointer' : 'default' }}
                  onClick={() => log.details && setExpanded(isOpen ? null : log.id)}
                >
                  <span style={{
                    fontSize: '0.7rem', padding: '2px 6px', borderRadius: 4, flexShrink: 0,
                    background: lvStyle.bg, color: lvStyle.color, fontWeight: 700, textTransform: 'uppercase',
                  }}>
                    {log.level}
                  </span>
                  {log.method && (
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', flexShrink: 0, fontFamily: 'monospace' }}>
                      {log.method}
                    </span>
                  )}
                  {log.path && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontFamily: 'monospace', flexShrink: 0, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {log.path}
                    </span>
                  )}
                  <span style={{ flex: 1, fontSize: '0.85rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {log.message}
                  </span>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {log.created_at ? new Date(log.created_at).toLocaleString('tr-TR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                  </span>
                  {log.details && (
                    isOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />
                  )}
                </div>

                {isOpen && log.details && (
                  <pre style={{
                    marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)',
                    fontSize: '0.75rem', color: 'var(--text-muted)', whiteSpace: 'pre-wrap',
                    wordBreak: 'break-all', maxHeight: 300, overflowY: 'auto', margin: 0,
                  }}>
                    {log.details}
                  </pre>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
