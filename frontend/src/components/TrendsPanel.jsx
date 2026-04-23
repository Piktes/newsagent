import { useState, useEffect } from 'react';
import { Flame, RefreshCw, Globe } from 'lucide-react';
import { sourcesApi } from '../services/api';

const WOEID_OPTIONS = [
  { value: 23424969, label: 'Türkiye' },
  { value: 1,        label: 'Dünya Geneli' },
];

const DEFAULT_VISIBLE = 5;

export default function TrendsPanel() {
  const [trends, setTrends]     = useState([]);
  const [woeid, setWoeid]       = useState(23424969);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const [lastFetch, setLastFetch] = useState(null);
  const [expanded, setExpanded] = useState(false);

  const fetchTrends = async (w = woeid) => {
    setLoading(true);
    setError(null);
    try {
      const res = await sourcesApi.getTwitterTrends(w);
      setTrends(res.data.trends || []);
      setLastFetch(new Date());
    } catch (e) {
      const msg = e.response?.data?.detail || e.message;
      setError(msg);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTrends(woeid); }, [woeid]);

  const fmt = (n) => n != null ? n.toLocaleString('tr-TR') : null;

  return (
    <div className="card" style={{ padding: '1rem 1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
        <Flame size={16} color="#ef4444" />
        <span style={{ fontWeight: 700, fontSize: '0.9rem' }}>X / Twitter Trendleri</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <select
            value={woeid}
            onChange={e => setWoeid(Number(e.target.value))}
            style={{
              background: 'var(--bg-secondary)', border: '1px solid var(--border)',
              borderRadius: 4, padding: '2px 6px', fontSize: '0.775rem',
              color: 'var(--text-primary)', cursor: 'pointer',
            }}
          >
            {WOEID_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <button
            onClick={() => fetchTrends(woeid)}
            disabled={loading}
            title="Yenile"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: 'var(--text-muted)', display: 'flex', alignItems: 'center',
            }}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{
          padding: '0.625rem', borderRadius: 4, marginBottom: '0.75rem',
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          fontSize: '0.8rem', color: '#ef4444',
        }}>
          {error.includes('403') || error.includes('401')
            ? 'X API Basic tier gerekli (trends endpoint). Mevcut planınız desteklemiyor olabilir.'
            : `Trendler alınamadı: ${error}`}
        </div>
      )}

      {/* Loading */}
      {loading && trends.length === 0 && (
        <div style={{ textAlign: 'center', padding: '1.5rem 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          <div className="spinner" style={{ margin: '0 auto 0.5rem' }} />
          Trendler yükleniyor…
        </div>
      )}

      {/* Empty */}
      {!loading && !error && trends.length === 0 && (
        <div style={{ textAlign: 'center', padding: '1rem 0', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
          Trend bulunamadı
        </div>
      )}

      {/* Trend list */}
      {trends.length > 0 && (
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {(expanded ? trends : trends.slice(0, DEFAULT_VISIBLE)).map((t, i) => (
            <li key={i} style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.35rem 0.5rem', borderRadius: 4,
              background: t.matching_tags?.length > 0 ? 'rgba(239,68,68,0.07)' : 'transparent',
              border: t.matching_tags?.length > 0 ? '1px solid rgba(239,68,68,0.2)' : '1px solid transparent',
            }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', width: 18, textAlign: 'right', flexShrink: 0 }}>
                {i + 1}.
              </span>
              <span style={{
                flex: 1, fontSize: '0.82rem', fontWeight: t.matching_tags?.length > 0 ? 700 : 500,
                color: t.matching_tags?.length > 0 ? '#ef4444' : 'var(--text-primary)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>
                {t.trend_name}
              </span>
              {fmt(t.tweet_count) && (
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {fmt(t.tweet_count)}
                </span>
              )}
              {t.matching_tags?.length > 0 && (
                <span style={{
                  fontSize: '0.7rem', background: 'rgba(239,68,68,0.15)',
                  color: '#ef4444', borderRadius: 3, padding: '1px 5px', flexShrink: 0,
                }}>
                  {t.matching_tags[0]}
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* Expand / collapse */}
      {trends.length > DEFAULT_VISIBLE && (
        <button
          onClick={() => setExpanded(e => !e)}
          style={{
            width: '100%', marginTop: '0.5rem',
            background: 'none', border: '1px solid var(--border)',
            borderRadius: 4, padding: '0.3rem', cursor: 'pointer',
            fontSize: '0.775rem', color: 'var(--text-muted)',
          }}
        >
          {expanded
            ? '▲ Daralt'
            : `▼ Tümünü Göster (+${trends.length - DEFAULT_VISIBLE})`}
        </button>
      )}

      {lastFetch && !loading && (
        <div style={{ marginTop: '0.5rem', fontSize: '0.7rem', color: 'var(--text-muted)', textAlign: 'right' }}>
          {lastFetch.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} güncellendi
        </div>
      )}
    </div>
  );
}
