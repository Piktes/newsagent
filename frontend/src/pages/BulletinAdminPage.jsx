import { useState, useEffect } from 'react';
import { BookOpen, RefreshCw, Send, CheckCircle, EyeOff, RotateCcw, Plus, Download, Undo2, FileText, Trash2 } from 'lucide-react';
import { bulletinApi, tagsApi } from '../services/api';

const STATUS = {
  draft:    { label: 'Taslak',    color: 'var(--text-muted)' },
  approved: { label: 'Onaylandı', color: '#f59e0b' },
  sent:     { label: 'Gönderildi', color: 'var(--positive)' },
  failed:   { label: 'Başarısız', color: 'var(--negative)' },
};

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove(); window.URL.revokeObjectURL(url);
}

export default function BulletinAdminPage() {
  const [tab, setTab] = useState('drafts');
  const [bulletins, setBulletins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [items, setItems] = useState([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [deliveries, setDeliveries] = useState([]);
  const [busy, setBusy] = useState(false);
  const [tags, setTags] = useState([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newTagIds, setNewTagIds] = useState([]);

  const loadBulletins = async () => {
    setLoading(true);
    try { const res = await bulletinApi.list(); setBulletins(res.data); }
    catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { loadBulletins(); tagsApi.list().then(r => setTags(r.data)).catch(() => {}); }, []);

  const openBulletin = async (b) => {
    setSelected(b); setItems([]); setItemsLoading(true); setDeliveries([]);
    try {
      const res = await bulletinApi.items(b.id); setItems(res.data);
      if (b.status === 'sent') { const d = await bulletinApi.deliveries(b.id); setDeliveries(d.data); }
    } catch (e) { console.error(e); }
    setItemsLoading(false);
  };

  const refreshSelected = async () => {
    await loadBulletins();
    if (selected) { const r = await bulletinApi.get(selected.id); setSelected(r.data); }
  };

  const doExclude = async (newsId, currentlyIn) => {
    try {
      if (currentlyIn) await bulletinApi.exclude(selected.id, newsId);
      else await bulletinApi.include(selected.id, newsId);
      const res = await bulletinApi.items(selected.id); setItems(res.data);
      refreshSelected();
    } catch (e) { alert('İşlem başarısız'); }
  };

  const approve = async () => {
    setBusy(true);
    try { await bulletinApi.approve(selected.id); await refreshSelected(); }
    catch (e) { alert(e.response?.data?.detail || 'Onaylanamadı'); }
    setBusy(false);
  };

  const send = async () => {
    if (!confirm('Bülten tüm abonelere gönderilsin mi?')) return;
    setBusy(true);
    try {
      const res = await bulletinApi.send(selected.id);
      alert(`Gönderildi — ${res.data.sent} başarılı, ${res.data.failed} başarısız (${res.data.recipients} alıcı)`);
      await refreshSelected();
      const d = await bulletinApi.deliveries(selected.id); setDeliveries(d.data);
    } catch (e) { alert(e.response?.data?.detail || 'Gönderilemedi'); }
    setBusy(false);
  };

  const sendAll = async () => {
    if (!confirm('Bugünün tüm taslakları onaylanıp gönderilsin mi?')) return;
    setBusy(true);
    try { const res = await bulletinApi.sendAll(); alert(res.data.detail + ` (${res.data.sent} başarılı, ${res.data.failed} başarısız)`); await loadBulletins(); }
    catch (e) { alert('Toplu gönderim başarısız'); }
    setBusy(false);
  };

  const resend = async (userId) => {
    setBusy(true);
    try { const res = await bulletinApi.resend(selected.id, userId); const d = await bulletinApi.deliveries(selected.id); setDeliveries(d.data); }
    catch (e) { alert('Tekrar gönderilemedi'); }
    setBusy(false);
  };

  const createBulletin = async () => {
    if (newTagIds.length === 0) { alert('En az bir etiket seçin'); return; }
    setBusy(true);
    try { await bulletinApi.create({ tag_ids: newTagIds }); setShowCreate(false); setNewTagIds([]); await loadBulletins(); }
    catch (e) { alert('Oluşturulamadı'); }
    setBusy(false);
  };

  const downloadPdf = async (b) => {
    try { const res = await bulletinApi.pdf(b.id); downloadBlob(res.data, `bulten_${b.date}.pdf`); }
    catch (e) { alert('PDF alınamadı'); }
  };

  const deleteBulletin = async (b) => {
    if (!confirm('Bu bülteni silmek istiyor musunuz? (Etiketler ve haberler etkilenmez)')) return;
    setBusy(true);
    try {
      await bulletinApi.delete(b.id);
      if (selected?.id === b.id) { setSelected(null); setItems([]); }
      await loadBulletins();
    } catch (e) { alert(e.response?.data?.detail || 'Silinemedi'); }
    setBusy(false);
  };

  return (
    <div className="dashboard-page admin-page">
      <div className="page-header" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><BookOpen size={28} /> Bülten</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button className="btn btn-sm btn-outline" style={{ gap: '0.3rem' }} onClick={() => setShowCreate(s => !s)}><Plus size={14} /> Yeni Bülten</button>
          <button className="btn btn-sm btn-primary" style={{ gap: '0.3rem' }} disabled={busy} onClick={sendAll}><Send size={14} /> Hepsini Onayla & Gönder</button>
          <button className="btn btn-sm btn-outline" onClick={loadBulletins}><RefreshCw size={14} /></button>
        </div>
      </div>

      {showCreate && (
        <div className="card form-card" style={{ marginBottom: '1rem' }}>
          <h3 style={{ marginTop: 0 }}>Yeni Bülten — etiket seç</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginBottom: '0.75rem' }}>
            {tags.map(t => {
              const on = newTagIds.includes(t.id);
              return (
                <button key={t.id} type="button" onClick={() => setNewTagIds(ids => on ? ids.filter(i => i !== t.id) : [...ids, t.id])}
                  style={{ padding: '0.3rem 0.7rem', borderRadius: 20, cursor: 'pointer',
                    border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                    background: on ? 'rgba(0,112,243,0.1)' : 'transparent',
                    color: on ? 'var(--accent-light)' : 'var(--text-secondary)', fontSize: '0.8rem' }}>
                  {t.name}
                </button>
              );
            })}
          </div>
          <button className="btn btn-sm btn-primary" disabled={busy} onClick={createBulletin}>Oluştur</button>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1rem', alignItems: 'start' }}>
        {/* Sol: bülten listesi */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {loading ? <div className="spinner" /> : bulletins.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Bülten yok. 09:00'da otomatik taslak oluşur veya "Yeni Bülten" ile oluşturun.</div>
          ) : bulletins.map(b => {
            const st = STATUS[b.status] || STATUS.draft;
            const active = selected?.id === b.id;
            return (
              <button key={b.id} onClick={() => openBulletin(b)} style={{ textAlign: 'left', cursor: 'pointer',
                padding: '0.6rem 0.75rem', borderRadius: 'var(--radius-sm)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'rgba(0,112,243,0.06)' : 'var(--bg-card)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{b.title || 'Bülten'}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: st.color }}>{st.label}</span>
                    {b.status !== 'sent' && (
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteBulletin(b); }}
                        title="Bülteni sil"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 0, display: 'flex' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </span>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 2 }}>
                  {new Date(b.date).toLocaleDateString('tr-TR')} · {b.item_count ?? '—'} haber
                </div>
              </button>
            );
          })}
        </div>

        {/* Sağ: önizleme / loglar */}
        <div>
          {!selected ? (
            <div style={{ color: 'var(--text-muted)', padding: '1rem' }}>Önizlemek için soldan bir bülten seçin.</div>
          ) : (
            <>
              <div className="stat-card" style={{ marginBottom: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{selected.title || 'Bülten'} <span style={{ fontSize: '0.72rem', color: (STATUS[selected.status] || {}).color }}>· {(STATUS[selected.status] || {}).label}</span></div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{new Date(selected.date).toLocaleDateString('tr-TR')} · {items.length} haber</div>
                </div>
                <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                  <button className="btn btn-sm btn-outline" style={{ gap: '0.3rem' }} onClick={() => downloadPdf(selected)}><FileText size={13} /> PDF Önizle</button>
                  {selected.status === 'draft' && <button className="btn btn-sm btn-outline" style={{ gap: '0.3rem', color: '#f59e0b' }} disabled={busy} onClick={approve}><CheckCircle size={13} /> Onayla</button>}
                  {selected.status === 'approved' && <button className="btn btn-sm btn-primary" style={{ gap: '0.3rem' }} disabled={busy} onClick={send}><Send size={13} /> Gönder</button>}
                </div>
              </div>

              {selected.status === 'sent' && (
                <div style={{ marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <button className={`btn btn-sm ${tab === 'drafts' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('drafts')}>Haberler</button>
                    <button className={`btn btn-sm ${tab === 'logs' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setTab('logs')}>Teslimat Logları ({deliveries.length})</button>
                  </div>
                </div>
              )}

              {selected.status === 'sent' && tab === 'logs' ? (
                <div style={{ borderRadius: 'var(--radius)', overflow: 'hidden', boxShadow: 'var(--ring)' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead><tr style={{ background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)' }}>
                      {['Kullanıcı', 'Alıcı', 'Kanal', 'Saat', 'Durum', ''].map(h => <th key={h} style={{ padding: '0.5rem 0.75rem', textAlign: 'left', fontWeight: 600, color: 'var(--text-muted)' }}>{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {deliveries.map(d => (
                        <tr key={d.id} style={{ borderBottom: '1px solid var(--border)' }}>
                          <td style={{ padding: '0.4rem 0.75rem' }}>{d.username || '—'}</td>
                          <td style={{ padding: '0.4rem 0.75rem', color: 'var(--text-muted)' }}>{d.email}</td>
                          <td style={{ padding: '0.4rem 0.75rem' }}>{d.channel}</td>
                          <td style={{ padding: '0.4rem 0.75rem', color: 'var(--text-muted)' }}>{d.sent_at ? new Date(d.sent_at).toLocaleString('tr-TR') : '—'}</td>
                          <td style={{ padding: '0.4rem 0.75rem' }}>
                            <span title={d.error || ''} style={{ fontWeight: 700, color: d.status === 'sent' ? 'var(--positive)' : 'var(--negative)' }}>
                              {d.status === 'sent' ? 'Başarılı' : 'Başarısız'}
                            </span>
                          </td>
                          <td style={{ padding: '0.4rem 0.75rem' }}>
                            {d.user_id && <button className="btn btn-sm btn-outline" style={{ gap: '0.25rem' }} disabled={busy} onClick={() => resend(d.user_id)}><RotateCcw size={12} /> Tekrar</button>}
                          </td>
                        </tr>
                      ))}
                      {deliveries.length === 0 && <tr><td colSpan={6} style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>Kayıt yok.</td></tr>}
                    </tbody>
                  </table>
                </div>
              ) : (
                itemsLoading ? <div className="spinner" /> : items.length === 0 ? (
                  <div style={{ color: 'var(--text-muted)', padding: '1rem' }}>Bu bülten için haber yok.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {items.map(it => (
                      <div key={it.id} style={{ display: 'flex', gap: '0.75rem', padding: '0.6rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                        {it.thumbnail && <img src={it.thumbnail} alt="" style={{ width: 90, height: 62, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} onError={e => e.target.style.display = 'none'} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>{it.source_name} · {it.published_at ? new Date(it.published_at).toLocaleDateString('tr-TR') : ''}</div>
                          <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{it.title}</div>
                        </div>
                        {selected.status !== 'sent' && (
                          <button className="btn btn-sm btn-outline" style={{ gap: '0.25rem', color: 'var(--negative)', alignSelf: 'center' }} onClick={() => doExclude(it.id, true)} title="Bültenden çıkar">
                            <EyeOff size={13} /> Çıkar
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}

              {/* Çıkarılanları geri alma */}
              {selected.status !== 'sent' && selected.excluded_news_ids?.length > 0 && (
                <div style={{ marginTop: '0.75rem', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                  {selected.excluded_news_ids.length} haber bültenden çıkarıldı.
                  <button className="btn btn-sm btn-outline" style={{ marginLeft: '0.5rem', gap: '0.25rem' }} onClick={async () => { for (const id of selected.excluded_news_ids) { await bulletinApi.include(selected.id, id); } const res = await bulletinApi.items(selected.id); setItems(res.data); refreshSelected(); }}>
                    <Undo2 size={12} /> Hepsini geri al
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
