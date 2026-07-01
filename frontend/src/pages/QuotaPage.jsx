import { useState, useEffect } from 'react';
import { Gauge, RefreshCw, Trash2, User, Users, Clock, Zap, TrendingUp, AlertTriangle, RotateCcw } from 'lucide-react';
import { adminApi } from '../services/api';
import { useAuth } from '../hooks/useAuth';

const formatDate = (iso) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('tr-TR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
};

const PIE_COLORS = ['#3B82F6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#6366f1', '#84cc16'];

// Bagimlilik gerektirmeyen, etkilesimli SVG donut grafik (hover: dilim acilir + merkez detay)
function UsagePie({ data, unitLabel = 'istek' }) {
  const [hover, setHover] = useState(null);
  const total = data.reduce((s, d) => s + (d.requests || 0), 0);
  if (!total) {
    return <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem', padding: '0.75rem 0' }}>Henüz kullanıcı bazında veri yok.</div>;
  }

  const size = 180, cx = size / 2, cy = size / 2, ro = 80, ri = 50;
  const polar = (r, deg) => {
    const a = (deg - 90) * Math.PI / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  };
  const arc = (a0, a1, rOuter, rInner) => {
    const [x0o, y0o] = polar(rOuter, a0);
    const [x1o, y1o] = polar(rOuter, a1);
    const [x1i, y1i] = polar(rInner, a1);
    const [x0i, y0i] = polar(rInner, a0);
    const large = (a1 - a0) > 180 ? 1 : 0;
    return `M ${x0o} ${y0o} A ${rOuter} ${rOuter} 0 ${large} 1 ${x1o} ${y1o} L ${x1i} ${y1i} A ${rInner} ${rInner} 0 ${large} 0 ${x0i} ${y0i} Z`;
  };

  let acc = 0;
  const segs = data.map((d, i) => {
    const frac = d.requests / total;
    const a0 = acc * 360, a1 = (acc + frac) * 360;
    acc += frac;
    const mid = (a0 + a1) / 2;
    const [mx, my] = polar(10, mid);
    return {
      d, i, a0, a1, color: PIE_COLORS[i % PIE_COLORS.length],
      ex: mx - cx, ey: my - cy,
    };
  });
  const center = hover !== null ? segs[hover] : null;

  return (
    <div style={{ display: 'flex', gap: '1.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0, overflow: 'visible' }}>
        {data.length === 1 ? (
          <circle cx={cx} cy={cy} r={(ro + ri) / 2} fill="none"
            stroke={segs[0].color} strokeWidth={hover === 0 ? (ro - ri) + 6 : (ro - ri)}
            style={{ cursor: 'pointer', transition: 'stroke-width 0.2s ease' }}
            onMouseEnter={() => setHover(0)} onMouseLeave={() => setHover(null)} />
        ) : segs.map((s) => {
          const isHover = hover === s.i;
          const dim = hover !== null && !isHover;
          return (
            <path key={s.i} d={arc(s.a0, s.a1, ro, ri)}
              fill={s.color}
              opacity={dim ? 0.3 : 1}
              transform={isHover ? `translate(${s.ex} ${s.ey})` : 'translate(0 0)'}
              style={{ transition: 'opacity 0.2s ease, transform 0.2s ease', cursor: 'pointer' }}
              onMouseEnter={() => setHover(s.i)}
              onMouseLeave={() => setHover(null)} />
          );
        })}
        <text x={cx} y={center ? cy - 4 : cy - 2} textAnchor="middle"
          style={{ fontSize: center ? '1.6rem' : '1.6rem', fontWeight: 800, fill: center ? center.color : 'var(--text-primary)', transition: 'fill 0.2s' }}>
          {center ? `${center.d.pct}%` : total.toLocaleString('tr-TR')}
        </text>
        <text x={cx} y={center ? cy + 16 : cy + 16} textAnchor="middle"
          style={{ fontSize: '0.72rem', fontWeight: center ? 600 : 400, fill: 'var(--text-muted)' }}>
          {center ? center.d.username : unitLabel}
        </text>
      </svg>
      <div style={{ flex: 1, minWidth: 200, display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {segs.map((s) => {
          const isHover = hover === s.i;
          const dim = hover !== null && !isHover;
          return (
            <div key={s.i}
              onMouseEnter={() => setHover(s.i)} onMouseLeave={() => setHover(null)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.6rem', fontSize: '0.8125rem',
                padding: '0.35rem 0.5rem', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                background: isHover ? 'var(--bg-secondary)' : 'transparent',
                opacity: dim ? 0.45 : 1, transition: 'all 0.15s',
              }}>
              <span style={{ width: 12, height: 12, borderRadius: 3, background: s.color, flexShrink: 0 }} />
              <span style={{ fontWeight: 600, color: 'var(--text-secondary)', flex: 1 }}>{s.d.username}</span>
              <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{s.d.pct}%</span>
              <span style={{ color: 'var(--text-muted)', minWidth: 70, textAlign: 'right' }}>{(s.d.requests || 0).toLocaleString('tr-TR')} {unitLabel}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Kullanici bazinda kullanim ozeti karti (fetch + pasta)
function UserUsageSection({ apiCall, unitLabel, title }) {
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const res = await apiCall(); setRows(res.data.users || []); }
    catch (e) { console.error(e); setRows([]); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="stat-card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.9375rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Users size={16} /> {title}
        </span>
        <button className="btn btn-sm btn-outline" style={{ gap: '0.3rem' }} onClick={load}>
          <RefreshCw size={13} /> Yenile
        </button>
      </div>
      {loading
        ? <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}><div className="spinner" /></div>
        : <UsagePie data={rows || []} unitLabel={unitLabel} />}
    </div>
  );
}

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
      {/* Büyük kota kartı — tam genişlik */}
      <div className="stat-card" style={{ marginBottom: '0.75rem' }}>
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
            <div style={{ marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem', fontSize: '0.8125rem' }}>
                <span style={{ color: 'var(--text-muted)' }}>Kullanılan</span>
                <span style={{ fontWeight: 700, color: gaugeColor }}>{usedPct}%</span>
              </div>
              <div style={{ height: 10, borderRadius: 99, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 99, width: `${usedPct}%`, background: gaugeColor, transition: 'width 0.6s ease' }} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <span style={{ fontSize: '2rem', fontWeight: 800, color: gaugeColor, lineHeight: 1 }}>{quota.used_tokens.toLocaleString('tr-TR')}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Kullanılan Token</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>{quota.available_tokens.toLocaleString('tr-TR')}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Kalan Token</span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-secondary)', lineHeight: 1 }}>{quota.total_tokens.toLocaleString('tr-TR')}</span>
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

      {/* İki küçük stat kart — yan yana */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div className="stat-card"><span className="stat-value">{total}</span><span className="stat-label">Toplam API Çağrısı</span></div>
        <div className="stat-card accent">
          <span className="stat-value">{logs.reduce((s, l) => s + (l.tokens_used || 1), 0)}</span>
          <span className="stat-label">Bu Sayfadaki Token</span>
        </div>
      </div>

      <UserUsageSection
        apiCall={() => adminApi.getErUsageByUser(3650)}
        unitLabel="token"
        title="Kullanıcı Bazında Token Kullanımı"
      />

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

// Elle yonetilen X cagri kotasi — X bunu vermedigi icin super_admin girer, her cagri duser
function XCallQuotaCard() {
  const { isSuperAdmin } = useAuth();
  const [q, setQ] = useState(null);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const res = await adminApi.getXCallQuota(); setQ(res.data); setInput(res.data.total_quota ? String(res.data.total_quota) : ''); }
    catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const save = async (reset) => {
    const val = parseInt(input, 10);
    if (isNaN(val) || val < 0) { alert('Geçerli bir sayı girin.'); return; }
    if (reset && !confirm('Toplam kota kaydedilip kullanılan sayaç 0\'a sıfırlansın mı?')) return;
    setSaving(true);
    try { const res = await adminApi.setXCallQuota(val, reset); setQ(res.data); }
    catch (e) { alert('Kaydedilemedi: ' + (e.response?.data?.detail || e.message)); }
    setSaving(false);
  };

  const onlyReset = async () => {
    if (!confirm('Kullanılan çağrı sayacı 0\'a sıfırlansın mı? (toplam kota değişmez)')) return;
    setSaving(true);
    try { const res = await adminApi.resetXCallQuota(); setQ(res.data); }
    catch (e) { alert('Sıfırlanamadı: ' + (e.response?.data?.detail || e.message)); }
    setSaving(false);
  };

  const used = q?.used ?? 0, total = q?.total_quota ?? 0, remaining = q?.remaining ?? 0;
  const pct = q?.used_pct ?? 0;
  const color = pct < 50 ? 'var(--positive)' : pct < 80 ? '#f59e0b' : 'var(--negative)';

  return (
    <div className="stat-card" style={{ marginBottom: '0.75rem', border: '1px solid var(--accent)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          𝕏 Çağrı Kotası — uygulama sayacı (elle yönetilen)
        </span>
        <button className="btn btn-sm btn-outline" style={{ gap: '0.3rem' }} onClick={load}><RefreshCw size={13} /> Yenile</button>
      </div>

      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}><div className="spinner" /></div> : (
        <>
          {total === 0 ? (
            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: isSuperAdmin ? '1rem' : 0 }}>
              Henüz toplam kota girilmedi. {isSuperAdmin ? 'Aşağıdan, kredinizin karşılığı toplam çağrı sayısını girin (her X araması/trend kontrolü buradan düşer).' : 'Bir süper admin toplam kotayı girmeli.'}
            </div>
          ) : (
            <>
              <div style={{ marginBottom: '1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem', fontSize: '0.8125rem' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Kullanılan</span>
                  <span style={{ fontWeight: 700, color }}>{pct}%</span>
                </div>
                <div style={{ height: 10, borderRadius: 99, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 99, width: `${Math.min(pct, 100)}%`, background: color, transition: 'width 0.6s ease' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '2rem', fontWeight: 800, color, lineHeight: 1 }}>{used.toLocaleString('tr-TR')}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Kullanılan Çağrı</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--accent)', lineHeight: 1 }}>{remaining.toLocaleString('tr-TR')}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Kalan Çağrı</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
                  <span style={{ fontSize: '2rem', fontWeight: 800, color: 'var(--text-secondary)', lineHeight: 1 }}>{total.toLocaleString('tr-TR')}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Toplam Kota</span>
                </div>
              </div>
            </>
          )}

          {isSuperAdmin ? (
            <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--border)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>Toplam kota:</span>
              <input type="number" min="0" value={input} onChange={e => setInput(e.target.value)} placeholder="ör. 20000"
                className="filter-select" style={{ width: 130, fontSize: '0.875rem', padding: '0.3rem 0.5rem' }} />
              <button className="btn btn-sm" style={{ background: 'var(--accent)', color: '#fff' }} disabled={saving} onClick={() => save(false)}>Kaydet</button>
              <button className="btn btn-sm btn-outline" disabled={saving} onClick={() => save(true)}>Kaydet & Sıfırla</button>
              <button className="btn btn-sm btn-outline" style={{ gap: '0.3rem', color: 'var(--negative)' }} disabled={saving} onClick={onlyReset}>
                <RotateCcw size={13} /> Sayacı Sıfırla
              </button>
              {q?.reset_at && <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', width: '100%' }}>Son sıfırlama: {new Date(q.reset_at).toLocaleString('tr-TR')}{q.updated_by ? ` · ${q.updated_by}` : ''}</span>}
            </div>
          ) : (
            <div style={{ marginTop: '0.75rem', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
              Kotayı yalnızca süper admin düzenleyebilir/sıfırlayabilir.
            </div>
          )}
        </>
      )}
    </div>
  );
}

// X cagrilarini turune gore ozet (trend / genel arama / hesap aramasi / dogrulama)
const KIND_META = {
  search:  { label: 'Genel Tweet Araması', color: '#3B82F6' },
  account: { label: 'Hesap Araması',       color: '#10b981' },
  trends:  { label: 'Trend Kontrolü',      color: '#f59e0b' },
  verify:  { label: 'Hesap Doğrulama',     color: '#8b5cf6' },
  other:   { label: 'Diğer',               color: '#94a3b8' },
};

function CallKindBreakdown() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const res = await adminApi.getXUsageByKind(); setData(res.data); }
    catch (e) { console.error(e); setData(null); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const kinds = data?.kinds || [];
  const total = data?.total || 0;

  return (
    <div className="stat-card" style={{ marginBottom: '1.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <span style={{ fontSize: '0.9375rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Zap size={16} /> Çağrı Türüne Göre Kullanım
        </span>
        <button className="btn btn-sm btn-outline" style={{ gap: '0.3rem' }} onClick={load}><RefreshCw size={13} /> Yenile</button>
      </div>
      {loading
        ? <div style={{ display: 'flex', justifyContent: 'center', padding: '1rem' }}><div className="spinner" /></div>
        : total === 0
          ? <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Son sıfırlamadan beri X çağrısı yapılmadı. (Trend kontrolü, genel arama ve hesap araması burada ayrı ayrı görünecek.)</div>
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {kinds.map((k) => {
                const m = KIND_META[k.kind] || KIND_META.other;
                return (
                  <div key={k.kind} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <span style={{ width: 150, fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.4rem', flexShrink: 0 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: m.color, flexShrink: 0 }} />{m.label}
                    </span>
                    <div style={{ flex: 1, height: 8, borderRadius: 99, background: 'var(--bg-secondary)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${k.pct}%`, background: m.color, borderRadius: 99, transition: 'width 0.5s ease' }} />
                    </div>
                    <span style={{ width: 46, textAlign: 'right', fontWeight: 700, fontSize: '0.8125rem' }}>{k.pct}%</span>
                    <span style={{ width: 95, textAlign: 'right', fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{k.count.toLocaleString('tr-TR')} çağrı</span>
                  </div>
                );
              })}
            </div>
          )}
    </div>
  );
}

function XApiTab() {
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    (async () => {
      try { const res = await adminApi.getXUsage(1); setUsage(res.data); } catch (e) { console.error(e); setUsage(null); }
    })();
  }, []);

  return (
    <>
      {/* GERCEK kredi durumu (402) */}
      {usage?.credits_depleted === true && (
        <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 0.875rem', borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', fontSize: '0.875rem', color: 'var(--negative)', fontWeight: 600 }}>
          <AlertTriangle size={16} /> X kredileri tükendi — yeni arama yapılamıyor (X: <code>credits depleted</code>, HTTP 402). Krediyi X developer portalından yükleyin.
        </div>
      )}
      {usage?.credits_depleted === false && (
        <div style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem 0.875rem', borderRadius: 'var(--radius-sm)', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', fontSize: '0.875rem', color: '#10b981', fontWeight: 600 }}>
          ✓ X kredileri aktif — arama yapılabiliyor.
        </div>
      )}

      {/* Asıl istenen: elle yönetilen çağrı kotası sayacı */}
      <XCallQuotaCard />

      {/* Çağrı türüne göre kırılım */}
      <CallKindBreakdown />

      {/* Kullanıcı bazında çağrı dağılımı */}
      <UserUsageSection
        apiCall={() => adminApi.getXUsageByUser(90)}
        unitLabel="çağrı"
        title="Kullanıcı Bazında X Çağrısı (uygulama içi)"
      />
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
    <div className="dashboard-page admin-page">
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
