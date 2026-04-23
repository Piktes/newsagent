import { useState, useEffect, useRef } from 'react';
import { MessageSquare, Send, CheckCircle, Clock, ChevronDown, ChevronUp, Paperclip, X, ImageIcon, XCircle } from 'lucide-react';
import { feedbackApi } from '../services/api';

const TYPE_LABELS = { bug: 'Hata Bildirimi', suggestion: 'Öneri', question: 'Soru', other: 'Diğer' };
const STATUS_LABELS = { pending: 'Bekliyor', answered: 'Cevaplandı', resolved: 'Çözüldü' };
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

function SuccessModal({ onClose }) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
          padding: '2rem 2.5rem', maxWidth: 400, width: '90%', textAlign: 'center',
          boxShadow: '0 20px 60px rgba(0,0,0,0.4)',
        }}
      >
        <div style={{
          width: 56, height: 56, borderRadius: '50%', margin: '0 auto 1rem',
          background: 'rgba(34,197,94,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <CheckCircle size={28} color="#22c55e" />
        </div>
        <h3 style={{ margin: '0 0 0.5rem', fontSize: '1.1rem', fontWeight: 700 }}>Kaydınız Oluşturuldu</h3>
        <p style={{ margin: '0 0 1.5rem', fontSize: '0.875rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
          Talebiniz alındı. En kısa sürede incelenip size geri dönüş yapılacaktır.
        </p>
        <button
          onClick={onClose}
          className="btn btn-primary"
          style={{ minWidth: 100 }}
        >
          Tamam
        </button>
      </div>
    </div>
  );
}

export default function FeedbackPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [form, setForm] = useState({ type: 'bug', subject: '', description: '' });
  const [files, setFiles] = useState([]);   // { file, preview }
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState(null);
  const fileInputRef = useRef();

  const loadTickets = () =>
    feedbackApi.myTickets().then(r => setTickets(r.data)).catch(() => {});

  useEffect(() => {
    loadTickets().finally(() => setLoading(false));
  }, []);

  const handleFiles = (selected) => {
    const next = [...files];
    for (const f of Array.from(selected)) {
      if (!ALLOWED_TYPES.includes(f.type)) {
        setError(`"${f.name}" desteklenmiyor. Yalnızca JPG, PNG, GIF, WEBP yüklenebilir.`);
        continue;
      }
      if (f.size > 5 * 1024 * 1024) {
        setError(`"${f.name}" çok büyük (max 5 MB).`);
        continue;
      }
      if (next.length >= 5) { setError('En fazla 5 görsel eklenebilir.'); break; }
      next.push({ file: f, preview: URL.createObjectURL(f) });
    }
    setFiles(next);
  };

  const removeFile = (idx) => {
    URL.revokeObjectURL(files[idx].preview);
    setFiles(files.filter((_, i) => i !== idx));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.subject.trim() || !form.description.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('type', form.type);
      fd.append('subject', form.subject);
      fd.append('description', form.description);
      files.forEach(({ file }) => fd.append('files', file));

      await feedbackApi.create(fd);
      setForm({ type: 'bug', subject: '', description: '' });
      files.forEach(f => URL.revokeObjectURL(f.preview));
      setFiles([]);
      setShowModal(true);
      await loadTickets();
    } catch (err) {
      setError(err.response?.data?.detail || 'Gönderim başarısız oldu.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '1.5rem 1rem' }}>
      {showModal && <SuccessModal onClose={() => setShowModal(false)} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.5rem' }}>
        <MessageSquare size={22} color="var(--accent)" />
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Sorun Bildir</h1>
      </div>

      {/* Submit form */}
      <div className="card" style={{ padding: '1.25rem', marginBottom: '1.5rem' }}>
        <p style={{ margin: '0 0 1rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          Bir sorun bildirmek, öneri iletmek veya soru sormak için formu doldurun.
        </p>
        <form onSubmit={handleSubmit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4, color: 'var(--text-muted)' }}>Tür</label>
              <select
                value={form.type}
                onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                style={{
                  width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '0.5rem', color: 'var(--text-primary)', fontSize: '0.875rem',
                }}
              >
                {Object.entries(TYPE_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4, color: 'var(--text-muted)' }}>Konu</label>
              <input
                type="text"
                value={form.subject}
                onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                placeholder="Kısa bir başlık girin"
                maxLength={200}
                style={{
                  width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '0.5rem', color: 'var(--text-primary)', fontSize: '0.875rem',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 4, color: 'var(--text-muted)' }}>Açıklama</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Sorunu veya önerinizi ayrıntılı olarak açıklayın…"
              rows={5}
              style={{
                width: '100%', background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                borderRadius: 6, padding: '0.5rem', color: 'var(--text-primary)', fontSize: '0.875rem',
                resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Screenshot upload */}
          <div style={{ marginBottom: '0.875rem' }}>
            <label style={{ display: 'block', fontSize: '0.8rem', marginBottom: 6, color: 'var(--text-muted)' }}>
              Ekran Görüntüleri <span style={{ fontWeight: 400 }}>(isteğe bağlı — max 5 görsel, 5 MB)</span>
            </label>

            {files.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                {files.map((f, i) => (
                  <div key={i} style={{ position: 'relative', width: 80, height: 80 }}>
                    <img
                      src={f.preview}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)' }}
                    />
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      style={{
                        position: 'absolute', top: -6, right: -6,
                        width: 18, height: 18, borderRadius: '50%',
                        background: '#ef4444', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                      }}
                    >
                      <X size={11} color="#fff" />
                    </button>
                  </div>
                ))}
                {files.length < 5 && (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    style={{
                      width: 80, height: 80, borderRadius: 6, border: '2px dashed var(--border)',
                      background: 'var(--bg-secondary)', cursor: 'pointer', display: 'flex',
                      flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
                      color: 'var(--text-muted)', fontSize: '0.7rem',
                    }}
                  >
                    <Paperclip size={16} />
                    Ekle
                  </button>
                )}
              </div>
            )}

            {files.length === 0 && (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: '100%', padding: '0.75rem', borderRadius: 6,
                  border: '2px dashed var(--border)', background: 'var(--bg-secondary)',
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  gap: '0.5rem', color: 'var(--text-muted)', fontSize: '0.825rem',
                }}
              >
                <ImageIcon size={16} />
                Ekran görüntüsü ekleyin (JPG, PNG, GIF, WEBP)
              </button>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/gif,image/webp"
              multiple
              style={{ display: 'none' }}
              onChange={e => { handleFiles(e.target.files); e.target.value = ''; }}
            />
          </div>

          {error && (
            <div style={{ padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 6, fontSize: '0.825rem', color: '#ef4444', marginBottom: '0.75rem' }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="submit"
              disabled={submitting || !form.subject.trim() || !form.description.trim()}
              className="btn btn-primary"
              style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.875rem' }}
            >
              <Send size={14} />
              {submitting ? 'Gönderiliyor…' : 'Gönder'}
            </button>
          </div>
        </form>
      </div>

      {/* Ticket list */}
      <h2 style={{ margin: '0 0 0.75rem', fontSize: '1rem', fontWeight: 600 }}>Geçmiş Taleplerim</h2>
      {loading ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ margin: '0 auto 0.5rem' }} />
          Yükleniyor…
        </div>
      ) : tickets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Henüz talep oluşturulmadı.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {tickets.map(t => (
            <div key={t.id} className="card" style={{ padding: '1rem' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                onClick={() => setExpanded(expanded === t.id ? null : t.id)}
              >
                <span style={{
                  fontSize: '0.72rem', padding: '2px 7px', borderRadius: 4,
                  background: t.status === 'resolved' ? 'rgba(107,114,128,0.1)' : t.status === 'answered' ? 'rgba(34,197,94,0.12)' : 'rgba(234,179,8,0.12)',
                  color: t.status === 'resolved' ? '#9ca3af' : t.status === 'answered' ? '#22c55e' : '#ca8a04',
                  display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0,
                }}>
                  {t.status === 'resolved' ? <XCircle size={11} /> : t.status === 'answered' ? <CheckCircle size={11} /> : <Clock size={11} />}
                  {STATUS_LABELS[t.status]}
                </span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', background: 'var(--bg-secondary)', borderRadius: 4, padding: '2px 6px', flexShrink: 0 }}>
                  {TYPE_LABELS[t.type]}
                </span>
                <span style={{ flex: 1, fontWeight: 600, fontSize: '0.875rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.subject}
                </span>
                {t.attachments?.length > 0 && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <Paperclip size={11} />{t.attachments.length}
                  </span>
                )}
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                  {new Date(t.created_at).toLocaleDateString('tr-TR')}
                </span>
                {expanded === t.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </div>

              {expanded === t.id && (
                <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                  <p style={{ margin: '0 0 0.75rem', fontSize: '0.875rem', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>
                    {t.description}
                  </p>

                  {t.attachments?.length > 0 && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.75rem' }}>
                      {t.attachments.map((fname, i) => (
                        <a key={i} href={feedbackApi.attachmentUrl(fname)} target="_blank" rel="noreferrer">
                          <img
                            src={feedbackApi.attachmentUrl(fname)}
                            alt={`Ekran görüntüsü ${i + 1}`}
                            style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }}
                          />
                        </a>
                      ))}
                    </div>
                  )}

                  {t.admin_response && (
                    <div style={{
                      padding: '0.75rem', borderRadius: 6,
                      background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
                    }}>
                      <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600, marginBottom: '0.375rem' }}>
                        Yönetici Yanıtı
                      </div>
                      <p style={{ margin: 0, fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>{t.admin_response}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
