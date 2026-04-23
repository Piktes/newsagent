import { useState, useEffect } from 'react';
import { sourcesApi } from '../services/api';
import { Radio, Search, CheckCircle, XCircle, Loader, Pencil, X, Info } from 'lucide-react';

const SOURCE_TYPES = [
  { value: 'twitter', label: 'Twitter/X',  icon: '𝕏' },
  { value: 'youtube', label: 'YouTube Kanal', icon: '▶️' },
];

const EMPTY_FORM = { name: '', type: 'twitter', url: '', api_key: '', is_default: false };

export default function SourcesPage() {
  const [sources, setSources]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [showForm, setShowForm]           = useState(false);
  const [form, setForm]                   = useState(EMPTY_FORM);

  // Twitter verify state
  const [twitterVerify, setTwitterVerify] = useState(null);
  const [twitterInput, setTwitterInput]   = useState('');

  // YouTube verify state
  const [ytVerify, setYtVerify]           = useState(null);
  const [ytInput, setYtInput]             = useState('');

  // Edit modal
  const [editSource, setEditSource] = useState(null);
  const [editForm, setEditForm]     = useState({ name: '', url: '', api_key: '' });
  const [editSaving, setEditSaving] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    try {
      const srcRes = await sourcesApi.list();
      setSources(srcRes.data.filter(s => s.type === 'twitter' || s.type === 'youtube'));
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, []);

  const resetVerify = () => {
    setTwitterVerify(null); setTwitterInput('');
    setYtVerify(null);      setYtInput('');
  };

  const switchType = (type) => {
    setForm({ ...EMPTY_FORM, type });
    resetVerify();
  };

  // ── Twitter verify ──────────────────────────────────────
  const handleVerifyTwitter = async () => {
    const handle = twitterInput.trim();
    if (!handle) return;
    setTwitterVerify('loading');
    try {
      const res = await sourcesApi.verifyTwitter(handle);
      setTwitterVerify(res.data);
      if (res.data.exists && !res.data.protected) {
        setForm(f => ({
          ...f,
          url: `@${res.data.username}`,
          name: f.name || `𝕏 @${res.data.username}`,
        }));
      }
    } catch (err) {
      setTwitterVerify({ exists: false, error: err.response?.data?.detail || 'Doğrulama başarısız' });
    }
  };

  // ── YouTube verify ──────────────────────────────────────
  const handleVerifyYoutube = async () => {
    const url = ytInput.trim();
    if (!url) return;
    setYtVerify('loading');
    try {
      const res = await sourcesApi.verifyYoutube(url);
      setYtVerify(res.data);
      if (res.data.exists) {
        setForm(f => ({
          ...f,
          url: res.data.channel_url,
          name: f.name || `▶️ ${res.data.name}`,
        }));
      }
    } catch (err) {
      setYtVerify({ exists: false, error: err.response?.data?.detail || 'Kanal bulunamadı' });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await sourcesApi.create(form);
      setForm(EMPTY_FORM);
      setShowForm(false);
      resetVerify();
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Hata oluştu');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Bu kaynağı silmek istediğinize emin misiniz?')) return;
    try { await sourcesApi.delete(id); fetchData(); }
    catch (err) { alert(err.response?.data?.detail || 'Hata oluştu'); }
  };

  const handleToggle = async (source) => {
    try { await sourcesApi.update(source.id, { is_active: !source.is_active }); fetchData(); }
    catch (err) { console.error(err); }
  };

  const openEdit = (source) => {
    setEditSource(source);
    setEditForm({ name: source.name, url: source.url || '', api_key: '' });
  };
  const closeEdit = () => setEditSource(null);

  const handleEditSave = async (e) => {
    e.preventDefault();
    setEditSaving(true);
    try {
      const payload = { name: editForm.name, url: editForm.url };
      if (editForm.api_key) payload.api_key = editForm.api_key;
      await sourcesApi.update(editSource.id, payload);
      closeEdit();
      fetchData();
    } catch (err) {
      alert(err.response?.data?.detail || 'Güncelleme başarısız');
    } finally {
      setEditSaving(false);
    }
  };

  const isTwitter = form.type === 'twitter';
  const isYoutube = form.type === 'youtube';

  const canSubmit = isTwitter
    ? (twitterVerify?.exists && !twitterVerify?.protected)
    : isYoutube
      ? ytVerify?.exists
      : true;

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Radio size={28} /> Haber Kaynakları
        </h1>
        <button
          className="btn btn-primary"
          onClick={() => { setShowForm(!showForm); setForm(EMPTY_FORM); resetVerify(); }}
        >
          {showForm ? '✕ İptal' : '+ Yeni Kaynak'}
        </button>
      </div>

      {/* ── Info Banner ──────────────────────────────────── */}
      <div style={{
        background: 'rgba(59,130,246,0.07)',
        border: '1px solid rgba(59,130,246,0.2)',
        borderRadius: 'var(--radius-sm)',
        padding: '1rem 1.25rem',
        marginBottom: '1.25rem',
        fontSize: '0.85rem',
        color: 'var(--text-secondary)',
        lineHeight: 1.7,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Info size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>Kaynaklar nasıl çalışır?</strong>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1.5rem' }}>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              𝕏 Twitter / X
            </div>
            Bir X hesabı ekleyin (ör. <code style={{ background: 'rgba(0,0,0,0.08)', padding: '0 4px', borderRadius: 3 }}>@ntv_haber</code>).
            Her tarama döngüsünde tanımlı tüm etiketler bu hesabın tweet'lerinde aranır.
            Arama X API v2 ile yapılır; sadece herkese açık hesaplar desteklenir.
            Yeni tweet'ler gerçek zamanlı olarak habere dönüşür, aynı tweet tekrar eklenmez (URL kontrolü).
          </div>
          <div>
            <div style={{ fontWeight: 600, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>
              ▶️ YouTube Kanalı
            </div>
            Bir kanal URL veya @handle ekleyin (ör. <code style={{ background: 'rgba(0,0,0,0.08)', padding: '0 4px', borderRadius: 3 }}>@ntvturkiye</code>).
            Her tarama döngüsünde kanalın son 15 videosu RSS üzerinden çekilir,
            etiket anahtar kelimeleriyle başlık veya açıklamada eşleşen videolar habere dönüşür.
            API key gerekmez; YouTube RSS ücretsiz ve limitsizdir.
          </div>
        </div>
      </div>

      {/* ── New Source Form ──────────────────────────────── */}
      {showForm && (
        <form className="card form-card" onSubmit={handleSubmit}>
          {/* Tip seçici */}
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
            {SOURCE_TYPES.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => switchType(t.value)}
                style={{
                  flex: 1,
                  padding: '0.5rem 1rem',
                  borderRadius: 'var(--radius-sm)',
                  border: form.type === t.value
                    ? '1.5px solid var(--accent)'
                    : '1.5px solid var(--border)',
                  background: form.type === t.value
                    ? 'rgba(0,112,243,0.08)'
                    : 'transparent',
                  color: form.type === t.value ? 'var(--accent)' : 'var(--text-secondary)',
                  fontWeight: form.type === t.value ? 600 : 400,
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                  transition: 'all 0.15s',
                }}
              >
                <span>{t.icon}</span> {t.label}
              </button>
            ))}
          </div>

          <div className="form-group">
            <label>Kaynak Adı</label>
            <input
              type="text"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder={isTwitter ? 'ör: NTV Haber' : 'ör: NTV YouTube'}
              required
            />
          </div>

          {/* ── Twitter verify ── */}
          {isTwitter && (
            <div className="form-group">
              <label>Twitter/X Hesabı</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={twitterInput}
                  onChange={e => { setTwitterInput(e.target.value); setTwitterVerify(null); }}
                  placeholder="@ntv_haber veya https://x.com/ntv_haber"
                  style={{ flex: 1 }}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleVerifyTwitter())}
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleVerifyTwitter}
                  disabled={twitterVerify === 'loading' || !twitterInput.trim()}
                  style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                >
                  {twitterVerify === 'loading'
                    ? <><Loader size={14} className="spin" /> Kontrol ediliyor…</>
                    : <><Search size={14} /> Hesabı Kontrol Et</>}
                </button>
              </div>

              {twitterVerify && twitterVerify !== 'loading' && (
                <div style={{
                  marginTop: '0.625rem', padding: '0.75rem', borderRadius: 'var(--radius-sm)',
                  background: twitterVerify.exists && !twitterVerify.protected ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)',
                  border: `1px solid ${twitterVerify.exists && !twitterVerify.protected ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                }}>
                  {!twitterVerify.exists ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--negative)', fontSize: '0.875rem' }}>
                      <XCircle size={16} /><span>{twitterVerify.error || 'Hesap bulunamadı.'}</span>
                    </div>
                  ) : twitterVerify.protected ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--negative)', fontSize: '0.875rem' }}>
                      <XCircle size={16} /><span><strong>@{twitterVerify.username}</strong> hesabı gizli.</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {twitterVerify.profile_image_url && <img src={twitterVerify.profile_image_url} alt="" style={{ width: 40, height: 40, borderRadius: '50%' }} />}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          <CheckCircle size={15} color="var(--positive)" />
                          <strong>{twitterVerify.name}</strong>
                          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>@{twitterVerify.username}</span>
                        </div>
                        <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          {(twitterVerify.followers_count || 0).toLocaleString('tr-TR')} takipçi · {(twitterVerify.tweet_count || 0).toLocaleString('tr-TR')} tweet
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <input type="hidden" value={form.url} />
              <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>
                🔑 Sistem Bearer Token kullanılır, API key gerekmez.
              </div>
            </div>
          )}

          {/* ── YouTube verify ── */}
          {isYoutube && (
            <div className="form-group">
              <label>YouTube Kanal URL veya @handle</label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  value={ytInput}
                  onChange={e => { setYtInput(e.target.value); setYtVerify(null); }}
                  placeholder="@ntvturkiye veya youtube.com/@ntvturkiye"
                  style={{ flex: 1 }}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleVerifyYoutube())}
                />
                <button
                  type="button"
                  className="btn btn-outline"
                  onClick={handleVerifyYoutube}
                  disabled={ytVerify === 'loading' || !ytInput.trim()}
                  style={{ whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '0.375rem' }}
                >
                  {ytVerify === 'loading'
                    ? <><Loader size={14} className="spin" /> Kontrol ediliyor…</>
                    : <><Search size={14} /> Kanalı Kontrol Et</>}
                </button>
              </div>

              {ytVerify && ytVerify !== 'loading' && (
                <div style={{
                  marginTop: '0.625rem', padding: '0.75rem', borderRadius: 'var(--radius-sm)',
                  background: ytVerify.exists ? 'rgba(16,185,129,0.07)' : 'rgba(239,68,68,0.07)',
                  border: `1px solid ${ytVerify.exists ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.25)'}`,
                }}>
                  {!ytVerify.exists ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--negative)', fontSize: '0.875rem' }}>
                      <XCircle size={16} /><span>{ytVerify.error || 'Kanal bulunamadı.'}</span>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      {ytVerify.thumbnail && (
                        <img src={ytVerify.thumbnail} alt="" style={{ width: 52, height: 36, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      )}
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                          <CheckCircle size={15} color="var(--positive)" />
                          <strong>{ytVerify.name}</strong>
                        </div>
                        <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                          RSS'te {ytVerify.video_count} video · {ytVerify.channel_url}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
              <input type="hidden" value={form.url} />
              <div style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginTop: '0.375rem' }}>
                📡 API key gerekmez — YouTube RSS ile ücretsiz izlenir.
              </div>
            </div>
          )}

          <button type="submit" className="btn btn-primary" disabled={!canSubmit}>
            Kaynak Ekle
          </button>
          {!canSubmit && (
            <span style={{ fontSize: '0.775rem', color: 'var(--text-muted)', marginLeft: '0.5rem' }}>
              Önce kanalı/hesabı kontrol edin
            </span>
          )}
        </form>
      )}

      {/* ── Sources List ─────────────────────────────────── */}
      <div className="sources-list">
        {loading ? (
          <div className="loading-state"><div className="spinner large" /></div>
        ) : sources.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon"><Radio size={48} color="var(--text-muted)" /></span>
            <h3>Kaynak tanımlanmamış</h3>
            <p>Twitter/X hesabı veya YouTube kanalı ekleyerek başlayın</p>
          </div>
        ) : (
          sources.map(source => {
            const typeInfo = SOURCE_TYPES.find(t => t.value === source.type);
            const isYT = source.type === 'youtube';
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
                    <span className="toggle-slider" />
                  </label>
                </div>
                {source.url && (
                  <p className="source-url" style={{ color: isYT ? '#ff0000' : 'var(--accent)', wordBreak: 'break-all' }}>
                    {isYT ? `▶️ ${source.url}` : `𝕏 ${source.url}`}
                  </p>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <div className="source-badges" style={{ margin: 0 }}>
                    {isYT
                      ? <span className="badge badge-green">📡 RSS</span>
                      : <span className="badge badge-green">🔑 Bearer Token</span>
                    }
                  </div>
                  <div className="source-actions" style={{ marginLeft: 'auto' }}>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => openEdit(source)}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}
                    >
                      <Pencil size={12} /> Düzenle
                    </button>
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(source.id)}>
                      🗑️ Sil
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Edit Modal ───────────────────────────────────── */}
      {editSource && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeEdit(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 1000,
            background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem',
          }}
        >
          <div className="card" style={{ width: '100%', maxWidth: 480, padding: '1.75rem', borderRadius: 'var(--radius)', boxShadow: '0 20px 60px rgba(0,0,0,0.35)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>
                {SOURCE_TYPES.find(t => t.value === editSource.type)?.icon}{' '}
                {editSource.name} — Düzenle
              </h3>
              <button type="button" onClick={closeEdit} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleEditSave}>
              <div className="form-group">
                <label>Kaynak Adı</label>
                <input type="text" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} required />
              </div>

              {editSource.type === 'twitter' ? (
                <div className="form-group">
                  <label>Twitter/X Hesabı</label>
                  <input type="text" value={editSource.url} disabled style={{ opacity: 0.55 }} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                    Hesap değiştirmek için kaynağı silip yeniden ekleyin.
                  </span>
                </div>
              ) : editSource.type === 'youtube' ? (
                <div className="form-group">
                  <label>YouTube Kanal URL</label>
                  <input type="text" value={editForm.url} onChange={e => setEditForm({ ...editForm, url: e.target.value })} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', display: 'block' }}>
                    Kanal değiştirirseniz yeni URL için doğrulama yapılmaz — dikkatli olun.
                  </span>
                </div>
              ) : null}

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button type="submit" className="btn btn-primary" disabled={editSaving} style={{ flex: 1 }}>
                  {editSaving ? <><Loader size={14} className="spin" style={{ marginRight: 6 }} />Kaydediliyor…</> : 'Kaydet'}
                </button>
                <button type="button" className="btn btn-outline" onClick={closeEdit}>İptal</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
