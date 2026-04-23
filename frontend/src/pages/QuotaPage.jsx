import { useState, useEffect } from 'react';
import { Gauge, RefreshCw, Trash2, User, Clock, Zap, TrendingUp, AlertTriangle } from 'lucide-react';
import { adminApi } from '../services/api';

const formatDate = (iso) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

function NewsApiTab() {
  const [quota, setQuota] = useState(null);
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loadingQuota, setLoadingQuota] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [clearing, setClearing] = useState(false);
  const PAGE_SIZE = 50;

  const fetchQuota = async () => {
    setLoadingQuota(true);
    try { const res = await adminApi.getErQuota(); setQuota(res.data); } catch (e) { console.error(e); }
    setLoadingQuota(false);
  };

  const fetchLogs = async (p = page) => {
    setLoadingLogs(true);
    try {
      const res = await adminApi.getErLogs(p, PAGE_SIZE);
      setLogs(res.data.items); setTotal(res.data.total);
    } catch (e) { console.error(e); }
    setLoadingLogs(false);
  };

  useEffect(() => { fetchQuota(); fetchLogs(1); }, []);
  useEffect(() => { fetchLogs(page); }, [page]);

  const handleClearLogs = async () => {
    if (!confirm('Tüm API kullanım logları silinsin mi?')) return;
    setClearing(true);
    await adminApi.clearErLogs();
    setLogs([]); setTotal(0); setPage(1);
    setClearing(false);
  };

  const usedPct = quota?.used_pct ?? 0;
  const gaugeColor = usedPct < 50 ? 'var(--positive)' : usedPct < 80 ? '#f59e0b' : 'var(--negative)';
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <>
      <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card" style={{ flex: '2', minWidth: 0 }}>
          {loadingQuota ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}><div className="spinner" /></div>
          ) : quota ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                  NewsAPI.ai — Aylık Token Kullanımı
                </span>
                <button className="btn btn-sm btn-outline" style={{ gap: '0.3rem' }} onClick={fetchQuota}>
                  <RefreshCw size={13} /> Yenile
                </button>
              </div>
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem', fontSize: '0.8125rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Kullanılan</span>
                  <span style={{ fontWeight: 700, color: gaugeColor }}>{usedPct}%</span>
                </div>
                <div style={{ height: 10, borderRadius: 99, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 99, width: `${usedPct}%`, background: gaugeColor, transition: 'width 0.6s ease' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <span style={{ fontSize: '1.75rem', fontWeight: 800, color: gaugeColor, lineHeight: 1 }}>{quota.used_tokens.toLocaleString('tr-TR')}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Kullanılan Token</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>{quota.available_tokens.toLocaleString('tr-TR')}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Kalan Token</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-secondary)', lineHeight: 1 }}>{quota.total_tokens.toLocaleString('tr-TR')}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Toplam Paket</span>
                </div>
              </div>
              {usedPct >= 80 && (
                <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.8125rem', color: 'var(--negative)' }}>
                  <AlertTriangle size={14} /> Kota %{usedPct} doldu. Yeni API çağrıları kısıtlanabilir.
                </div>
              )}
            </>
          ) : (
            <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Kota bilgisi alınamadı.</span>
          )}
        </div>
        <div className="stat-card"><span className="stat-value">{total}</span><span className="stat-label">Toplam API Çağrısı</span></div>
        <div className="stat-card accent">
          <span className="stat-value">{logs.reduce((s, l) => s + (l.tokens_used || 1), 0)}</span>
          <span className="stat-label">Bu Sayfadaki Token</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '0.9375rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <TrendingUp size={16} /> Kullanım Geçmişi
          {total > 0 && <span style={{ fontSize: '0.75rem', fontWeight: 400, color: 'var(--text-muted)' }}>({total} kayıt)</span>}
        </h3>
        {total > 0 && (
          <button className="btn btn-sm btn-outline" style={{ gap: '0.3rem', color: 'var(--negative)' }} onClick={handleClearLogs} disabled={clearing}>
            {clearing ? <RefreshCw size={13} className="spin" /> : <Trash2 size={13} />} Logları Temizle
          </button>
        )}
      </div>

      {loadingLogs ? <div className="loading-state"><div className="spinner large" /></div>
        : logs.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon"><Gauge size={48} /></span>
            <h3>Henüz log yok</h3>
            <p>NewsAPI.ai çağrıları yapıldıkça burada görünecek.</p>
          </div>
        ) : (
          <>
            <div style={{ borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--ring)' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                    {[[User, 'Kullanıcı'], [Zap, 'İşlem'], [TrendingUp, 'Token'], [Clock, 'Tarih']].map(([Icon, label]) => (
                      <th key={label} style={{ padding: '0.625rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.03em', whiteSpace: 'nowrap' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}><Icon size={13} /> {label}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, i) => (
                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)' }}>
                      <td style={{ padding: '0.5rem 1rem', color: 'var(--text-secondary)', fontWeight: 500 }}>{log.username}</td>
                      <td style={{ padding: '0.5rem 1rem', color: 'var(--text-primary)', maxWidth: 380 }}>{log.action}</td>
                      <td style={{ padding: '0.5rem 1rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-pill)', background: 'rgba(0,112,243,0.08)', color: 'var(--accent)', fontWeight: 700, fontSize: '0.75rem' }}>
                          <Zap size={11} /> {log.tokens_used}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem 1rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatDate(log.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem', marginTop: '1rem' }}>
                <button className="btn btn-sm btn-outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Önceki</button>
                <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.8125rem', color: 'var(--text-muted)', padding: '0 0.5rem' }}>Sayfa {page} / {totalPages}</span>
                <button className="btn btn-sm btn-outline" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Sonraki →</button>
              </div>
            )}
          </>
        )}
    </>
  );
}

function XApiTab() {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(7);

  const fetchUsage = async (d = days) => {
    setLoading(true);
    try { const res = await adminApi.getXUsage(d); setUsage(res.data); } catch (e) { console.error(e); setUsage(null); }
    setLoading(false);
  };

  useEffect(() => { fetchUsage(days); }, [days]);

  const usedPct = usage?.used_pct ?? 0;
  const gaugeColor = usedPct < 50 ? 'var(--positive)' : usedPct < 80 ? '#f59e0b' : 'var(--negative)';

  return (
    <>
      <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card" style={{ flex: '2', minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
              𝕏 API — Proje Kullanımı
            </span>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              <select
                value={days}
                onChange={e => setDays(Number(e.target.value))}
                className="filter-select"
                style={{ fontSize: '0.8125rem', padding: '0.25rem 0.5rem' }}
              >
                {[7, 14, 30, 60, 90].map(d => <option key={d} value={d}>Son {d} gün</option>)}
              </select>
              <button className="btn btn-sm btn-outline" style={{ gap: '0.3rem' }} onClick={() => fetchUsage(days)}>
                <RefreshCw size={13} /> Yenile
              </button>
            </div>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}><div className="spinner" /></div>
          ) : usage ? (
            <>
              <div style={{ marginBottom: '0.75rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem', fontSize: '0.8125rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Kullanılan</span>
                  <span style={{ fontWeight: 700, color: gaugeColor }}>{usedPct}%</span>
                </div>
                <div style={{ height: 10, borderRadius: 99, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(usedPct, 100)}%`, background: gaugeColor, transition: 'width 0.6s ease' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <span style={{ fontSize: '1.75rem', fontWeight: 800, color: gaugeColor, lineHeight: 1 }}>{(usage.project_usage || 0).toLocaleString('tr-TR')}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Kullanılan İstek</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>{(usage.remaining || 0).toLocaleString('tr-TR')}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Kalan İstek</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <span style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--text-secondary)', lineHeight: 1 }}>{(usage.project_cap || 0).toLocaleString('tr-TR')}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Toplam Limit</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
                  <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10b981', lineHeight: 1 }}>${(usage.estimated_cost || 0).toFixed(2)}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tahmini Maliyet</span>
                </div>
              </div>
              <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Birim maliyet: $0.005 / istek · Toplam kredi: $100.00 = 20.000 istek
              </div>
              {usedPct >= 80 && (
                <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: '0.8125rem', color: 'var(--negative)' }}>
                  <AlertTriangle size={14} /> X API kullanımı %{usedPct} seviyesinde. Kalan kredileri dikkatli kullanın.
                </div>
              )}
            </>
          ) : (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '0.5rem 0' }}>
              X API kullanım verisi alınamadı. Bearer Token doğru yapılandırıldığından emin olun.
            </div>
          )}
        </div>

        {usage && (
          <>
            <div className="stat-card">
              <span className="stat-value">${(usage.estimated_cost || 0).toFixed(2)}</span>
              <span className="stat-label">Harcanan ($)</span>
            </div>
            <div className="stat-card accent">
              <span className="stat-value">${(100 - (usage.estimated_cost || 0)).toFixed(2)}</span>
              <span className="stat-label">Kalan Kredi ($)</span>
            </div>
          </>
        )}
      </div>

      {usage?.daily_usage?.length > 0 && (
        <>
          <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.9375rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <TrendingUp size={16} /> Günlük Kullanım
          </h3>
          <div style={{ borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--ring)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8125rem' }}>
              <thead>
                <tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '0.625rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Tarih</th>
                  <th style={{ padding: '0.625rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>İstek Sayısı</th>
                  <th style={{ padding: '0.625rem 1rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>Maliyet</th>
                </tr>
              </thead>
              <tbody>
                {[...usage.daily_usage].reverse().map((row, i) => {
                  const count = row.usage || 0;
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)' }}>
                      <td style={{ padding: '0.5rem 1rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {row.date ? new Date(row.date).toLocaleDateString('tr-TR') : '-'}
                      </td>
                      <td style={{ padding: '0.5rem 1rem' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', padding: '0.15rem 0.5rem', borderRadius: 'var(--radius-pill)', background: 'rgba(0,112,243,0.08)', color: 'var(--accent)', fontWeight: 700, fontSize: '0.75rem' }}>
                          {count.toLocaleString('tr-TR')}
                        </span>
                      </td>
                      <td style={{ padding: '0.5rem 1rem', color: '#10b981', fontWeight: 600, fontSize: '0.8125rem' }}>
                        ${(count * 0.005).toFixed(3)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

export default function QuotaPage() {
  const [activeTab, setActiveTab] = useState('newsapi');

  const tabStyle = (key) => ({
    padding: '0.5rem 1.25rem',
    borderRadius: 'var(--radius-sm)',
    border: 'none',
    cursor: 'pointer',
    fontWeight: 600,
    fontSize: '0.875rem',
    background: activeTab === key ? 'var(--accent)' : 'transparent',
    color: activeTab === key ? '#fff' : 'var(--text-muted)',
    transition: 'all 0.15s',
  });

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1><Gauge size={24} /> API Kotası</h1>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: '0.375rem', marginBottom: '1.5rem', padding: '0.25rem', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', width: 'fit-content', boxShadow: 'var(--ring)' }}>
        <button style={tabStyle('newsapi')} onClick={() => setActiveTab('newsapi')}>
          📰 NewsAPI.ai
        </button>
        <button style={tabStyle('x')} onClick={() => setActiveTab('x')}>
          𝕏 X API
        </button>
      </div>

      {activeTab === 'newsapi' ? <NewsApiTab /> : <XApiTab />}
    </div>
  );
}
