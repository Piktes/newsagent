import { useState, useEffect } from 'react';
import { Mail, Download, BellOff, CheckCircle, Phone } from 'lucide-react';
import { bulletinApi } from '../services/api';

function downloadBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  window.URL.revokeObjectURL(url);
}

export default function BulletinUserPage() {
  const [sub, setSub] = useState(null);
  const [archive, setArchive] = useState([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [s, a] = await Promise.all([bulletinApi.getSubscription(), bulletinApi.myArchive()]);
      setSub(s.data); setPhone(s.data.phone_number || ''); setArchive(a.data);
    } catch (e) { console.error(e); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const toggleSub = async () => {
    setSaving(true);
    try {
      const res = sub?.subscribed ? await bulletinApi.unsubscribe() : await bulletinApi.subscribe();
      setSub(res.data);
    } catch (e) { alert('İşlem başarısız'); }
    setSaving(false);
  };

  const savePhone = async () => {
    setSaving(true);
    try { const res = await bulletinApi.updatePhone(phone.trim()); setSub(res.data); alert('Telefon kaydedildi'); }
    catch (e) { alert('Kaydedilemedi'); }
    setSaving(false);
  };

  const download = async (b) => {
    try {
      const res = await bulletinApi.pdf(b.id);
      downloadBlob(res.data, `bulten_${b.date}.pdf`);
    } catch (e) { alert('PDF indirilemedi'); }
  };

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Mail size={28} /> Bülten</h1>
      </div>

      {loading ? <div className="loading-state"><div className="spinner large" /></div> : (
        <>
          {/* Abonelik kartı */}
          <div className="card form-card" style={{ marginBottom: '1.5rem' }}>
            <h3 style={{ marginTop: 0 }}>Günlük Bülten Aboneliği</h3>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              Bülten her gün kayıtlı e-posta adresinize (<strong>{sub?.email}</strong>) PDF olarak gönderilir.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '0.75rem 0' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600,
                color: sub?.subscribed ? 'var(--positive)' : 'var(--text-muted)' }}>
                {sub?.subscribed ? <><CheckCircle size={16} /> Abonesiniz</> : <><BellOff size={16} /> Abone değilsiniz</>}
              </span>
              <button className={`btn btn-sm ${sub?.subscribed ? 'btn-outline' : 'btn-primary'}`} disabled={saving} onClick={toggleSub}>
                {sub?.subscribed ? 'Abonelikten Ayrıl' : 'Abone Ol'}
              </button>
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: '0.9rem', marginTop: '0.5rem' }}>
              <label style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.35rem', marginBottom: '0.35rem' }}>
                <Phone size={14} /> WhatsApp için telefon (opsiyonel)
              </label>
              <div style={{ display: 'flex', gap: '0.5rem', maxWidth: 340 }}>
                <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="ör. 05xx xxx xx xx"
                  style={{ flex: 1 }} />
                <button className="btn btn-sm btn-outline" disabled={saving} onClick={savePhone}>Kaydet</button>
              </div>
              <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.4rem' }}>
                Numara kayıtlıysa bülten PDF'i WhatsApp ile de gönderilebilir (sistem yapılandırıldığında).
              </p>
            </div>
          </div>

          {/* Arşiv */}
          <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <Download size={18} /> Bülten Arşivi
          </h3>
          {archive.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon"><Mail size={48} color="var(--text-muted)" /></span>
              <h3>Henüz bülten yok</h3>
              <p>Gönderilmiş bültenler burada listelenecek.</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {archive.map(b => (
                <div key={b.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{b.title || 'Günlük Bülten'}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {new Date(b.date).toLocaleDateString('tr-TR')} · {b.item_count ?? '—'} haber
                    </div>
                  </div>
                  <button className="btn btn-sm btn-outline" style={{ gap: '0.3rem' }} onClick={() => download(b)}>
                    <Download size={14} /> PDF
                  </button>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
