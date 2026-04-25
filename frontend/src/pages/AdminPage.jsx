import { useState, useEffect } from 'react';
import { adminApi } from '../services/api';
import { BarChart2, Tags, Radio, Zap, Clock, User, RefreshCw } from 'lucide-react';

const SOURCE_TYPE_LABELS = {
  rss: 'RSS', twitter: 'Twitter/X', youtube: 'YouTube',
  web: 'Web', newsapi: 'NewsAPI', instagram: 'Instagram', eksisozluk: 'Ekşi Sözlük',
};

const INTERVAL_LABEL = (m) => {
  if (m < 60) return `${m} dk`;
  if (m % 60 === 0) return `${m / 60} sa`;
  return `${Math.floor(m / 60)}sa ${m % 60}dk`;
};

function Section({ icon, title, children }) {
  return (
    <div style={{ marginBottom: '2rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.875rem' }}>
        {icon}
        <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>{title}</h2>
      </div>
      {children}
    </div>
  );
}

export default function AdminPage() {
  const [stats, setStats]       = useState(null);
  const [overview, setOverview] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState('tags'); // tags | sources | automations

  useEffect(() => {
    Promise.all([adminApi.getStats(), adminApi.getOverview()])
      .then(([s, o]) => { setStats(s.data); setOverview(o.data); })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading-state"><div className="spinner large" /></div>;

  const { top_tags = [], sources = [], automations = [] } = overview || {};

  // Group automations by user
  const byUser = automations.reduce((acc, a) => {
    const key = a.owner_email;
    if (!acc[key]) acc[key] = { owner: a.owner, email: a.owner_email, tags: [] };
    acc[key].tags.push(a);
    return acc;
  }, {});

  return (
    <div className="dashboard-page" style={{ maxWidth: 1100 }}>
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <BarChart2 size={26} /> Yönetim Paneli
        </h1>
        <button
          className="btn btn-outline"
          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.825rem' }}
          onClick={() => { setLoading(true); Promise.all([adminApi.getStats(), adminApi.getOverview()]).then(([s,o])=>{setStats(s.data);setOverview(o.data);}).finally(()=>setLoading(false)); }}
        >
          <RefreshCw size={13} /> Yenile
        </button>
      </div>

      {/* KPI cards */}
      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '2rem' }}>
          {[
            { icon: '📰', val: stats.total_news,      label: 'Toplam Haber', cls: '' },
            { icon: '📬', val: stats.total_unread,    label: 'Okunmamış',   cls: 'accent' },
            { icon: '⭐', val: stats.total_favorites, label: 'Favori',       cls: 'gold' },
            { icon: '🏷️', val: stats.total_tags,      label: 'Etiket',       cls: '' },
            { icon: '📡', val: stats.total_sources,   label: 'Kaynak',       cls: '' },
            { icon: '👥', val: stats.total_users,     label: 'Kullanıcı',    cls: '' },
          ].map(s => (
            <div key={s.label} className={`stat-card large ${s.cls}`} style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <span style={{ fontSize: '1.75rem', lineHeight: 1, flexShrink: 0 }}>{s.icon}</span>
              <div>
                <div className="stat-value" style={{ marginBottom: '0.1rem' }}>{s.val}</div>
                <div className="stat-label">{s.label}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.625rem' }}>
        {[
          { key: 'tags',        icon: <Tags size={15} />,   label: `Etiketler (${top_tags.length})` },
          { key: 'sources',     icon: <Radio size={15} />,  label: `Kaynaklar (${sources.length})` },
          { key: 'automations', icon: <Clock size={15} />,  label: `Otomasyonlar (${Object.keys(byUser).length} kullanıcı)` },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.375rem',
              padding: '0.4rem 1rem', borderRadius: '6px 6px 0 0', fontSize: '0.85rem', cursor: 'pointer',
              border: '1px solid var(--border)', borderBottom: activeTab === t.key ? '2px solid var(--accent)' : '1px solid var(--border)',
              background: activeTab === t.key ? 'var(--bg-card)' : 'var(--bg-secondary)',
              color: activeTab === t.key ? 'var(--accent)' : 'var(--text-muted)',
              fontWeight: activeTab === t.key ? 700 : 400,
              marginBottom: -1,
            }}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Etiketler ── */}
      {activeTab === 'tags' && (
        <Section icon={<Tags size={16} color="var(--accent)" />} title="En Çok Haber Bulunan Etiketler">
          <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
            <table className="data-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Etiket</th>
                  <th>Kullanıcı</th>
                  <th style={{ textAlign: 'center' }}>Haber</th>
                  <th style={{ textAlign: 'center' }}>Tarama</th>
                  <th style={{ textAlign: 'center' }}>Son Dakika</th>
                </tr>
              </thead>
              <tbody>
                {top_tags.map((t, i) => (
                  <tr key={t.id}>
                    <td style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{i + 1}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: t.color, flexShrink: 0 }} />
                        <strong style={{ fontSize: '0.875rem' }}>{t.name}</strong>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8rem' }}>
                        <div>{t.owner}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{t.owner_email}</div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        display: 'inline-block', minWidth: 40, padding: '2px 8px', borderRadius: 20,
                        background: t.news_count > 0 ? 'rgba(59,130,246,0.12)' : 'var(--bg-secondary)',
                        color: t.news_count > 0 ? 'var(--accent)' : 'var(--text-muted)',
                        fontSize: '0.8rem', fontWeight: 600,
                      }}>
                        {t.news_count}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {INTERVAL_LABEL(t.scan_interval_minutes)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      {t.is_breaking
                        ? <Zap size={14} color="#ef4444" title="Son dakika aktif" />
                        : <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>}
                    </td>
                  </tr>
                ))}
                {top_tags.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>Henüz etiket yok</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ── Kaynaklar ── */}
      {activeTab === 'sources' && (
        <Section icon={<Radio size={16} color="var(--accent)" />} title="Tüm Kaynaklar">
          <div className="card" style={{ overflow: 'hidden', padding: 0 }}>
            <table className="data-table" style={{ margin: 0 }}>
              <thead>
                <tr>
                  <th>Kaynak Adı</th>
                  <th>Tür</th>
                  <th>URL / Hesap</th>
                  <th>Ekleyen Kullanıcı</th>
                  <th style={{ textAlign: 'center' }}>Durum</th>
                  <th style={{ textAlign: 'center' }}>Varsayılan</th>
                </tr>
              </thead>
              <tbody>
                {sources.map(s => (
                  <tr key={s.id}>
                    <td><strong style={{ fontSize: '0.875rem' }}>{s.name}</strong></td>
                    <td>
                      <span style={{
                        fontSize: '0.75rem', padding: '2px 7px', borderRadius: 4,
                        background: 'var(--bg-secondary)', color: 'var(--text-muted)',
                      }}>
                        {SOURCE_TYPE_LABELS[s.type] || s.type}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.78rem', color: 'var(--text-muted)', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.url || '—'}
                    </td>
                    <td>
                      <div style={{ fontSize: '0.8rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <User size={11} /> {s.owner}
                        </div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{s.owner_email}</div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <span style={{
                        fontSize: '0.72rem', padding: '2px 7px', borderRadius: 4,
                        background: s.is_active ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
                        color: s.is_active ? '#22c55e' : '#ef4444',
                      }}>
                        {s.is_active ? 'Aktif' : 'Pasif'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {s.is_default ? '✓' : '—'}
                    </td>
                  </tr>
                ))}
                {sources.length === 0 && (
                  <tr><td colSpan={6} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem' }}>Henüz kaynak yok</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>
      )}

      {/* ── Otomasyonlar ── */}
      {activeTab === 'automations' && (
        <Section icon={<Clock size={16} color="var(--accent)" />} title="Kullanıcı Otomasyonları">
          {Object.entries(byUser).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Henüz otomasyon yok
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {Object.entries(byUser).map(([email, u]) => (
                <div key={email} className="card" style={{ padding: '1rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%', background: 'var(--accent)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.875rem', fontWeight: 700, color: '#fff', flexShrink: 0,
                    }}>
                      {u.owner[0]?.toUpperCase()}
                    </div>
                    <div>
                      <div style={{ fontWeight: 700, fontSize: '0.875rem' }}>{u.owner}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{email}</div>
                    </div>
                    <span style={{ marginLeft: 'auto', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {u.tags.length} etiket
                    </span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {u.tags.map(tag => (
                      <div key={tag.tag_id} style={{
                        display: 'flex', alignItems: 'center', gap: '0.4rem',
                        padding: '0.35rem 0.75rem', borderRadius: 20, fontSize: '0.8rem',
                        border: `1px solid ${tag.tag_color}33`,
                        background: `${tag.tag_color}11`,
                      }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: tag.tag_color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 600 }}>{tag.tag_name}</span>
                        <span style={{
                          background: 'var(--bg-secondary)', borderRadius: 10,
                          padding: '1px 6px', fontSize: '0.72rem', color: 'var(--text-muted)',
                        }}>
                          {INTERVAL_LABEL(tag.scan_interval_minutes)}
                        </span>
                        {tag.is_breaking && <Zap size={11} color="#ef4444" />}
                        {tag.last_count != null && (
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>
                            ({tag.last_count} haber)
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}
    </div>
  );
}
