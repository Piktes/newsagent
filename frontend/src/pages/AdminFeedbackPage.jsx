import { useState, useEffect } from 'react';
import { MessageSquare, CheckCircle, Clock, ChevronDown, ChevronUp, Send, Trash2, Paperclip, XCircle } from 'lucide-react';
import { feedbackApi } from '../services/api';

const TYPE_LABELS = { bug: 'Hata', suggestion: 'Öneri', question: 'Soru', other: 'Diğer' };
const TYPE_COLORS = {
  bug: { bg: 'rgba(239,68,68,0.1)', color: '#ef4444' },
  suggestion: { bg: 'rgba(59,130,246,0.1)', color: '#3b82f6' },
  question: { bg: 'rgba(168,85,247,0.1)', color: '#a855f7' },
  other: { bg: 'rgba(107,114,128,0.1)', color: '#6b7280' },
};

export default function AdminFeedbackPage() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [replyText, setReplyText] = useState({});
  const [submitting, setSubmitting] = useState(null);
  const [closing, setClosing] = useState(null);

  const loadTickets = (status) =>
    feedbackApi.allTickets(status === 'all' ? null : status)
      .then(r => setTickets(r.data))
      .catch(() => {});

  useEffect(() => {
    loadTickets(filter).finally(() => setLoading(false));
  }, [filter]);

  const handleAnswer = async (ticketId) => {
    const text = (replyText[ticketId] || '').trim();
    if (!text) return;
    setSubmitting(ticketId);
    try {
      await feedbackApi.answerTicket(ticketId, { response: text, status: 'answered' });
      setReplyText(r => ({ ...r, [ticketId]: '' }));
      await loadTickets(filter);
    } catch {}
    setSubmitting(null);
  };

  const handleClose = async (ticketId) => {
    if (!confirm('Bu talebi çözüldü olarak kapatmak istiyor musunuz?')) return;
    setClosing(ticketId);
    try {
      await feedbackApi.closeTicket(ticketId);
      await loadTickets(filter);
      setExpanded(null);
    } catch {}
    setClosing(null);
  };

  const handleDelete = async (ticketId) => {
    if (!confirm('Bu talebi silmek istiyor musunuz?')) return;
    try {
      await feedbackApi.deleteTicket(ticketId);
      setTickets(ts => ts.filter(t => t.id !== ticketId));
    } catch {}
  };

  const pendingCount = tickets.filter(t => t.status === 'pending').length;

  return (
    <div className="dashboard-page">
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '1.5rem' }}>
        <MessageSquare size={22} color="var(--accent)" />
        <h1 style={{ margin: 0, fontSize: '1.25rem', fontWeight: 700 }}>Sistem İyileştirmeleri</h1>
        {pendingCount > 0 && (
          <span style={{
            background: 'rgba(239,68,68,0.15)', color: '#ef4444',
            borderRadius: 999, fontSize: '0.72rem', padding: '2px 8px', fontWeight: 700,
          }}>
            {pendingCount} bekliyor
          </span>
        )}
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        {[['all', 'Tümü'], ['pending', 'Bekleyenler'], ['answered', 'Cevaplananlar'], ['resolved', 'Çözüldü']].map(([v, l]) => (
          <button
            key={v}
            onClick={() => setFilter(v)}
            style={{
              padding: '0.35rem 0.875rem', borderRadius: 6, fontSize: '0.8rem', cursor: 'pointer',
              border: '1px solid var(--border)',
              background: filter === v ? 'var(--accent)' : 'var(--bg-secondary)',
              color: filter === v ? '#fff' : 'var(--text-primary)',
              fontWeight: filter === v ? 600 : 400,
            }}
          >
            {l}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)' }}>
          <div className="spinner" style={{ margin: '0 auto 0.5rem' }} />
          Yükleniyor…
        </div>
      ) : tickets.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
          Bu filtrede talep yok.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {tickets.map(t => {
            const typeStyle = TYPE_COLORS[t.type] || TYPE_COLORS.other;
            const isOpen = expanded === t.id;
            return (
              <div key={t.id} className="card" style={{ padding: '1rem' }}>
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}
                  onClick={() => setExpanded(isOpen ? null : t.id)}
                >
                  <span style={{
                    fontSize: '0.72rem', padding: '2px 7px', borderRadius: 4,
                    background: typeStyle.bg, color: typeStyle.color, flexShrink: 0, fontWeight: 600,
                  }}>
                    {TYPE_LABELS[t.type]}
                  </span>
                  <span style={{
                    fontSize: '0.72rem', padding: '2px 7px', borderRadius: 4, flexShrink: 0,
                    background: t.status === 'resolved' ? 'rgba(107,114,128,0.1)' : t.status === 'answered' ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)',
                    color: t.status === 'resolved' ? '#9ca3af' : t.status === 'answered' ? '#22c55e' : '#ca8a04',
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}>
                    {t.status === 'resolved' ? <XCircle size={11} /> : t.status === 'answered' ? <CheckCircle size={11} /> : <Clock size={11} />}
                    {t.status === 'resolved' ? 'Çözüldü' : t.status === 'answered' ? 'Cevaplandı' : 'Bekliyor'}
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
                    {t.user_username || t.user_email}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                    {new Date(t.created_at).toLocaleDateString('tr-TR')}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(t.id); }}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'flex' }}
                    title="Sil"
                  >
                    <Trash2 size={13} />
                  </button>
                  {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </div>

                {isOpen && (
                  <div style={{ marginTop: '0.875rem', paddingTop: '0.875rem', borderTop: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.375rem' }}>
                      {t.user_email} · #{t.id}
                    </div>
                    <p style={{ margin: '0 0 0.875rem', fontSize: '0.875rem', whiteSpace: 'pre-wrap', color: 'var(--text-secondary)' }}>
                      {t.description}
                    </p>

                    {t.attachments?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.875rem' }}>
                        {t.attachments.map((fname, i) => (
                          <a key={i} href={feedbackApi.attachmentUrl(fname)} target="_blank" rel="noreferrer">
                            <img
                              src={feedbackApi.attachmentUrl(fname)}
                              alt={`Ekran görüntüsü ${i + 1}`}
                              style={{ width: 90, height: 90, objectFit: 'cover', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }}
                            />
                          </a>
                        ))}
                      </div>
                    )}

                    {t.admin_response && (
                      <div style={{
                        padding: '0.75rem', borderRadius: 6, marginBottom: '0.875rem',
                        background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
                      }}>
                        <div style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 600, marginBottom: '0.375rem' }}>
                          Mevcut Yanıt
                        </div>
                        <p style={{ margin: 0, fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>{t.admin_response}</p>
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <textarea
                        rows={3}
                        value={replyText[t.id] || ''}
                        onChange={e => setReplyText(r => ({ ...r, [t.id]: e.target.value }))}
                        placeholder="Yanıt yazın…"
                        style={{
                          flex: 1, background: 'var(--bg-secondary)', border: '1px solid var(--border)',
                          borderRadius: 6, padding: '0.5rem', color: 'var(--text-primary)',
                          fontSize: '0.875rem', resize: 'vertical', fontFamily: 'inherit',
                        }}
                      />
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', alignSelf: 'flex-end' }}>
                        <button
                          onClick={() => handleAnswer(t.id)}
                          disabled={submitting === t.id || !(replyText[t.id] || '').trim()}
                          className="btn btn-primary"
                          style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem' }}
                        >
                          <Send size={13} />
                          {submitting === t.id ? '…' : 'Yanıtla'}
                        </button>
                        {t.status !== 'resolved' && (
                          <button
                            onClick={() => handleClose(t.id)}
                            disabled={closing === t.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '0.4rem', fontSize: '0.8rem',
                              padding: '0.4rem 0.75rem', borderRadius: 6, cursor: 'pointer',
                              background: 'rgba(107,114,128,0.12)', border: '1px solid rgba(107,114,128,0.25)',
                              color: '#9ca3af',
                            }}
                          >
                            <XCircle size={13} />
                            {closing === t.id ? '…' : 'Kapat'}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
