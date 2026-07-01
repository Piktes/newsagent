import { useState, useEffect, useRef, Fragment } from 'react';
import { tagsApi } from '../services/api';
import { Tags, Zap, X, Radio } from 'lucide-react';
import TrendsPanel from '../components/TrendsPanel';
import { useAuth } from '../hooks/useAuth';

const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

const INTERVALS = [
  { value: 15,  label: '15 dakika' },
  { value: 30,  label: '30 dakika' },
  { value: 60,  label: '1 saat' },
  { value: 120, label: '2 saat' },
];

const EMPTY_FORM = {
  name: '',
  must_phrase: '',
  match_mode: 'phrase',
  context_keywords: [],
  context_ops: [],          // kelimeler arası bağlaçlar (n-1 adet): 'and' | 'or'
  context_oper: 'and',      // 'off' = SERBEST (bağlamı zorunlu tutma); değilse per-kelime ops geçerli
  color: '#3B82F6',
  is_breaking: false,
  scan_interval_minutes: 30,
  is_published: false,
};

// ─── Bağlam gruplama (VE aynı gruba, VEYA yeni grup) — backend ile aynı mantık ──
function contextGroups(keywords, ops) {
  if (!keywords || keywords.length === 0) return [];
  const groups = [[keywords[0]]];
  for (let i = 1; i < keywords.length; i++) {
    const op = (ops && ops[i - 1]) || 'and';
    if (op === 'or') groups.push([keywords[i]]);
    else groups[groups.length - 1].push(keywords[i]);
  }
  return groups;
}

// ─── Canlı önizleme metni (parantezli) ────────────────────────────
function buildPreview(must, keywords, ops, serbest) {
  if (!must) return null;
  const mustPart = `"${must}"`;
  if (!keywords || keywords.length === 0) return mustPart;
  if (serbest) return `${mustPart}  (+${keywords.length} bağlam aramaya yardımcı, zorunlu değil)`;
  const groups = contextGroups(keywords, ops);
  const groupStrs = groups.map(g => g.length === 1 ? g[0] : `(${g.join(' VE ')})`);
  let ctxExpr = groupStrs.join(' VEYA ');
  if (groups.length > 1) ctxExpr = `(${ctxExpr})`;
  return `${mustPart} VE ${ctxExpr}`;
}

export default function TagsPage() {
  const { user, isSuperAdmin } = useAuth();
  const [tags, setTags]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [publishingId, setPublishingId] = useState(null);
  const [showForm, setShowForm]       = useState(false);
  const [editId, setEditId]           = useState(null);
  const [form, setForm]               = useState(EMPTY_FORM);
  const [ctxInput, setCtxInput]       = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting]       = useState(false);
  const ctxRef = useRef(null);

  const fetchTags = async () => {
    setLoading(true);
    try {
      const res = await tagsApi.list();
      setTags(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTags(); }, []);

  // ── form helpers ──────────────────────────────────────────────────

  const addCtxKw = (raw) => {
    const kw = raw.trim().replace(/,+$/, '');
    if (!kw) return;
    if (!form.context_keywords.includes(kw)) {
      setForm(f => ({
        ...f,
        context_keywords: [...f.context_keywords, kw],
        // ilk kelimede bağlaç yok; sonrakiler için varsayılan 'and'
        context_ops: f.context_keywords.length >= 1 ? [...(f.context_ops || []), 'and'] : [],
      }));
    }
    setCtxInput('');
  };

  const removeCtxKw = (kw) =>
    setForm(f => {
      const idx = f.context_keywords.indexOf(kw);
      if (idx < 0) return f;
      const ops = f.context_ops || [];
      const newOps = idx === 0 ? ops.slice(1) : [...ops.slice(0, idx - 1), ...ops.slice(idx)];
      return {
        ...f,
        context_keywords: f.context_keywords.filter((_, i) => i !== idx),
        context_ops: newOps,
      };
    });

  // Bir bağlaç rozetini VE ↔ VEYA arasında değiştir
  const toggleCtxOp = (j) =>
    setForm(f => {
      const ops = [...(f.context_ops || [])];
      ops[j] = ops[j] === 'or' ? 'and' : 'or';
      return { ...f, context_ops: ops };
    });

  const handleCtxKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addCtxKw(ctxInput); }
    if (e.key === 'Backspace' && !ctxInput && form.context_keywords.length > 0) {
      setForm(f => ({
        ...f,
        context_keywords: f.context_keywords.slice(0, -1),
        context_ops: (f.context_ops || []).slice(0, -1),
      }));
    }
  };

  // ── submit ────────────────────────────────────────────────────────

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      name: form.name.trim() || form.must_phrase.trim(),
      must_phrase: form.must_phrase.trim() || null,
      match_mode: form.match_mode,
      context_keywords: form.context_keywords.length > 0 ? form.context_keywords : null,
      context_ops: form.context_ops && form.context_ops.length > 0 ? form.context_ops : null,
      context_oper: form.context_oper,
      color: form.color,
      language: 'tr',
      is_breaking: form.is_breaking,
      scan_interval_minutes: form.scan_interval_minutes,
      is_published: form.is_published,
    };
    try {
      if (editId) {
        await tagsApi.update(editId, payload);
      } else {
        await tagsApi.create(payload);
      }
      setForm(EMPTY_FORM);
      setCtxInput('');
      setEditId(null);
      setShowForm(false);
      fetchTags();
      window.dispatchEvent(new CustomEvent('tags-changed'));
    } catch (err) {
      alert(err.response?.data?.detail || 'Hata oluştu');
    }
  };

  const handleEdit = (tag) => {
    setForm({
      name: tag.name || '',
      must_phrase: tag.must_phrase || '',
      match_mode: tag.match_mode || 'phrase',
      context_keywords: tag.context_keywords || [],
      context_ops: tag.context_ops || [],
      context_oper: tag.context_oper || 'and',
      color: tag.color,
      is_breaking: tag.is_breaking ?? false,
      scan_interval_minutes: tag.scan_interval_minutes ?? 30,
      is_published: tag.is_published ?? false,
    });
    setCtxInput('');
    setEditId(tag.id);
    setShowForm(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteClick = (tag) => setDeleteConfirm({ id: tag.id, name: tag.name });

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await tagsApi.delete(deleteConfirm.id);
      setDeleteConfirm(null);
      fetchTags();
      window.dispatchEvent(new CustomEvent('tags-changed'));
    } catch (err) {
      alert(err.response?.data?.detail || 'Silme hatası oluştu');
    }
    setDeleting(false);
  };

  const handlePublishToggle = async (tag) => {
    setPublishingId(tag.id);
    try {
      if (tag.is_published) {
        await tagsApi.unpublish(tag.id);
      } else {
        await tagsApi.publish(tag.id);
      }
      fetchTags();
    } catch (err) {
      alert(err.response?.data?.detail || 'İşlem başarısız');
    }
    setPublishingId(null);
  };

  const cancelForm = () => {
    setShowForm(false);
    setEditId(null);
    setForm(EMPTY_FORM);
    setCtxInput('');
  };

  // ── styles ────────────────────────────────────────────────────────

  const hint = {
    fontSize: '0.72rem',
    color: 'var(--text-muted)',
    marginTop: '0.3rem',
    lineHeight: 1.55,
  };
  const sectionLabel = {
    fontSize: '0.72rem',
    fontWeight: 600,
    color: 'var(--text-muted)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.35rem',
  };

  const preview = buildPreview(form.must_phrase, form.context_keywords, form.context_ops, form.context_oper === 'off');

  // ── render ────────────────────────────────────────────────────────

  return (
    <div style={{ maxWidth: '1600px', margin: '0 auto', animation: 'fadeIn 0.2s ease' }}>
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Tags size={28} /> Etiketler
        </h1>
        <button
          className="btn btn-primary"
          onClick={() => showForm ? cancelForm() : setShowForm(true)}
        >
          {showForm ? '✕ İptal' : '+ Yeni Etiket'}
        </button>
      </div>

      {/* ── Silme onayı (overlay — DOM konumu önemsiz) ── */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">⚠️</div>
            <h3>Etiketi Sil</h3>
            <p><strong>"{deleteConfirm.name}"</strong> etiketini ve ilişkili tüm haberleri silmek istediğinize emin misiniz?</p>
            <p className="modal-warning">Bu işlem geri alınamaz!</p>
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={handleDeleteConfirm} disabled={deleting}>
                {deleting ? '⏳ Siliniyor...' : '🗑️ Evet, Sil'}
              </button>
              <button className="btn btn-outline" onClick={() => setDeleteConfirm(null)} disabled={deleting}>İptal</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Form ── */}
      {showForm && (
        <form className="card form-card" onSubmit={handleSubmit} style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ marginTop: 0, marginBottom: '1.25rem', fontSize: '1rem' }}>
            {editId ? '✏️ Etiketi Düzenle' : '🏷️ Yeni Etiket'}
          </h3>

          {/* ── İki sütunlu form gövdesi ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>

          {/* ── Sol sütun ── */}
          <div>

          {/* ── 1. Zorunlu Arama İfadesi ── */}
          <div className="form-group" style={{ marginBottom: '1.1rem' }}>
            <div style={sectionLabel}>
              Arama İfadesi <span style={{ color: '#ef4444' }}>*</span>
            </div>
            <input
              type="text"
              value={form.must_phrase}
              onChange={(e) => {
                const v = e.target.value;
                setForm(f => ({ ...f, must_phrase: v, name: f.name || v }));
              }}
              placeholder="örn. Yusuf Tekin  veya  okul saldırı"
              required
              style={{ width: '100%', boxSizing: 'border-box' }}
            />
            <div style={hint}>
              {form.match_mode === 'all_words'
                ? <>İfadedeki <strong>her kelime</strong> haberde geçsin — sıra/yan yana şart değil. Daha çok sonuç, daha çok gürültü.<br />Örnek: <code style={{ fontSize: '0.7rem' }}>Yusuf Tekin</code> → "Yusuf" ve "Tekin" haberde ayrı ayrı da geçse olur.</>
                : <>Bu ifade haberde <strong>aynen</strong> (yan yana, sıralı) geçmeli. Kısa tutun — ek kelimeler için aşağıdaki <strong>Bağlam Kelimeleri</strong>'ni kullanın.<br />Örnek: <code style={{ fontSize: '0.7rem' }}>Yusuf Tekin</code> → "Yusuf Tekin" birlikte geçmeli ("Tekin … Yusuf" eşleşmez).</>}
            </div>

            {/* Eşleşme tipi */}
            <div style={{ display: 'flex', gap: '0.4rem', marginTop: '0.6rem' }}>
              {[
                { val: 'phrase',    label: 'Tam ifade',    desc: 'Kelimeler yan yana / sıralı geçmeli. İsim ve kalıplar için ideal.' },
                { val: 'all_words', label: 'Tüm kelimeler', desc: 'Her kelime haberde geçsin, sıra önemsiz. Daha geniş sonuç.' },
              ].map(opt => {
                const active = form.match_mode === opt.val;
                return (
                  <button
                    key={opt.val}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, match_mode: opt.val }))}
                    title={opt.desc}
                    style={{
                      flex: 1, textAlign: 'left', cursor: 'pointer',
                      padding: '0.45rem 0.6rem',
                      borderRadius: 'var(--radius-sm)',
                      border: active ? '1px solid var(--accent)' : '1px solid var(--border)',
                      background: active ? 'rgba(0,112,243,0.08)' : 'transparent',
                      color: active ? 'var(--accent-light)' : 'var(--text-secondary)',
                      transition: 'all 0.15s',
                    }}
                  >
                    <div style={{ fontSize: '0.8rem', fontWeight: 600 }}>{opt.label}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', marginTop: 2, lineHeight: 1.35 }}>{opt.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── 2. Bağlam Kelimeleri ── */}
          <div className="form-group" style={{ marginBottom: '1.1rem' }}>
            <div style={sectionLabel}>
              Bağlam Kelimeleri
              <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, marginLeft: 4, color: 'var(--text-muted)', opacity: 0.75 }}>
                — isteğe bağlı
              </span>
            </div>

            {/* Chip'ler + input */}
            <div
              onClick={() => ctxRef.current?.focus()}
              style={{
                display: 'flex', flexWrap: 'wrap', gap: '0.3rem',
                alignItems: 'center',
                minHeight: 36,
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                padding: '0.3rem 0.5rem',
                background: 'var(--bg-input)',
                cursor: 'text',
              }}
            >
              {form.context_keywords.map((kw, i) => {
                const serbest = form.context_oper === 'off';
                const op = (form.context_ops && form.context_ops[i - 1]) || 'and';
                return (
                  <Fragment key={kw}>
                    {i > 0 && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); if (!serbest) toggleCtxOp(i - 1); }}
                        title={serbest ? 'SERBEST modda bağlaç uygulanmaz' : 'VE ↔ VEYA değiştir'}
                        style={{
                          padding: '0.1rem 0.4rem', borderRadius: 5,
                          border: 'none', cursor: serbest ? 'default' : 'pointer',
                          fontSize: '0.62rem', fontWeight: 800, letterSpacing: '0.04em',
                          background: serbest ? 'var(--bg-card)' : (op === 'or' ? '#f59e0b' : 'var(--accent)'),
                          color: serbest ? 'var(--text-muted)' : '#fff',
                          opacity: serbest ? 0.5 : 1,
                        }}
                      >
                        {op === 'or' ? 'VEYA' : 'VE'}
                      </button>
                    )}
                    <span
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                        padding: '0.15rem 0.45rem',
                        borderRadius: 20,
                        background: 'rgba(0,112,243,0.13)',
                        border: '1px solid rgba(0,112,243,0.28)',
                        fontSize: '0.78rem',
                        color: 'var(--accent-light)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {kw}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); removeCtxKw(kw); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit', opacity: 0.6, padding: 0, display: 'flex', lineHeight: 1 }}
                      >
                        <X size={10} />
                      </button>
                    </span>
                  </Fragment>
                );
              })}
              <input
                ref={ctxRef}
                value={ctxInput}
                onChange={(e) => setCtxInput(e.target.value)}
                onKeyDown={handleCtxKeyDown}
                onBlur={() => ctxInput.trim() && addCtxKw(ctxInput)}
                placeholder={form.context_keywords.length === 0 ? 'Kelime yaz → Enter veya virgül ile ekle' : ''}
                style={{
                  border: 'none', outline: 'none', background: 'transparent',
                  color: 'var(--text-primary)', fontSize: '0.82rem',
                  fontFamily: 'inherit', flex: 1, minWidth: 140,
                  padding: '0.1rem 0',
                }}
              />
            </div>

            <div style={hint}>
              Ana ifadeyi <strong>daraltan</strong> ek kelimeler. Her kelime çok kelimeli olabilir ("ziyaret etti" gibi — kendi içinde sıralı aranır).
              {form.context_keywords.length > 1 && <> Aralarındaki <strong>VE / VEYA</strong> rozetine tıklayarak bağlacı değiştir (VE, VEYA'dan önceliklidir).</>}
            </div>

            {/* SERBEST toggle — sadece keyword varsa göster */}
            {form.context_keywords.length > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', marginTop: '0.6rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                <input
                  type="checkbox"
                  checked={form.context_oper === 'off'}
                  onChange={(e) => setForm(f => ({ ...f, context_oper: e.target.checked ? 'off' : 'and' }))}
                />
                <span><strong>SERBEST</strong> — bağlamı zorunlu tutma (sadece aramaya yardımcı olsun, filtreleme)</span>
              </label>
            )}
          </div>

          {/* ── Canlı önizleme ── */}
          {preview && (
            <div style={{
              padding: '0.5rem 0.75rem',
              borderRadius: 'var(--radius-sm)',
              background: 'rgba(0,112,243,0.06)',
              border: '1px solid rgba(0,112,243,0.18)',
              fontSize: '0.78rem',
            }}>
              <span style={{ color: 'var(--text-muted)', marginRight: '0.4rem' }}>Arama mantığı:</span>
              <code style={{ color: 'var(--accent-light)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>{preview}</code>
            </div>
          )}

          </div>{/* /sol sütun */}

          {/* ── Sağ sütun ── */}
          <div>

          {/* ── Görünen Ad ── */}
          <div className="form-group" style={{ marginBottom: '1.1rem' }}>
            <div style={sectionLabel}>Görünen Ad</div>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder={form.must_phrase || 'Etiketin listede gösterileceği ad'}
            />
            <div style={hint}>Boş bırakırsanız arama ifadesi kullanılır.</div>
          </div>

          {/* ── Renk ── */}
          <div className="form-group" style={{ marginBottom: '1.1rem' }}>
            <div style={sectionLabel}>Renk</div>
            <div className="color-picker">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch ${form.color === c ? 'selected' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                />
              ))}
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm(f => ({ ...f, color: e.target.value }))}
                className="color-input"
              />
            </div>
          </div>

          {/* ── Son Dakika ── */}
          <div className="form-group" style={{ marginBottom: '1.1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
              <span
                onClick={() => setForm(f => ({ ...f, is_breaking: !f.is_breaking }))}
                style={{
                  width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                  background: form.is_breaking ? '#ef4444' : 'var(--bg-input)',
                  boxShadow: 'var(--ring)',
                  position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', padding: '0 2px',
                }}
              >
                <span style={{
                  width: 16, height: 16, borderRadius: '50%', background: 'white',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  transform: form.is_breaking ? 'translateX(16px)' : 'translateX(0)',
                  transition: 'transform 0.2s', display: 'block',
                }} />
              </span>
              <Zap size={14} style={{ color: form.is_breaking ? '#ef4444' : 'var(--text-muted)' }} />
              <span style={{ fontWeight: 500, color: form.is_breaking ? '#ef4444' : 'var(--text-secondary)' }}>
                Son Dakika etiketi
              </span>
            </label>
            {form.is_breaking && (
              <div style={{ marginTop: '0.625rem', padding: '0.625rem 0.75rem', borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.06)', boxShadow: 'rgba(239,68,68,0.25) 0 0 0 1px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span>🔴 Bu etiket otomatik taranacak. Yeni haberler <strong>Son Dakika</strong> sayfasında gösterilecek.</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>Tarama sıklığı:</span>
                  <select
                    value={form.scan_interval_minutes}
                    onChange={(e) => setForm(f => ({ ...f, scan_interval_minutes: Number(e.target.value) }))}
                    className="filter-select"
                    style={{ flex: 1 }}
                  >
                    {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* ── Yayınla ── */}
          <div className="form-group" style={{ marginBottom: '1.1rem' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}>
              <span
                onClick={() => setForm(f => ({ ...f, is_published: !f.is_published }))}
                style={{
                  width: 36, height: 20, borderRadius: 10, flexShrink: 0,
                  background: form.is_published ? '#10b981' : 'var(--bg-input)',
                  boxShadow: 'var(--ring)',
                  position: 'relative', transition: 'background 0.2s', cursor: 'pointer',
                  display: 'inline-flex', alignItems: 'center', padding: '0 2px',
                }}
              >
                <span style={{
                  width: 16, height: 16, borderRadius: '50%', background: 'white',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  transform: form.is_published ? 'translateX(16px)' : 'translateX(0)',
                  transition: 'transform 0.2s', display: 'block',
                }} />
              </span>
              <Radio size={14} style={{ color: form.is_published ? '#10b981' : 'var(--text-muted)' }} />
              <span style={{ fontWeight: 500, color: form.is_published ? '#10b981' : 'var(--text-secondary)' }}>
                Kullanıcılara Yayınla
              </span>
            </label>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '0.3rem', lineHeight: 1.55 }}>
              Açıksa bu etikete ait haberler kullanıcı rolündekiler tarafından görülebilir.
            </div>
          </div>

          </div>{/* /sağ sütun */}
          </div>{/* /2-col grid */}

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>
              {editId ? 'Güncelle' : 'Oluştur'}
            </button>
            <button type="button" className="btn btn-outline" onClick={cancelForm}>İptal</button>
          </div>
        </form>
      )}

      {/* ── Etiket listesi ── */}
      {loading ? (
        <div className="loading-state"><div className="spinner large"></div></div>
      ) : (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem' }}>
        {(
          tags.map(tag => {
            const kwPreview = buildPreview(tag.must_phrase, tag.context_keywords || [], tag.context_ops || [], tag.context_oper === 'off');
            return (
              <div key={tag.id} className="tag-card" style={{ borderLeftColor: tag.color }}>
                <div className="tag-card-header">
                  <span className="tag-dot large" style={{ backgroundColor: tag.color }}></span>
                  <h3>{tag.name}</h3>
                  {tag.is_breaking && (
                    <span className="breaking-badge"><Zap size={10} /> SON DAKİKA</span>
                  )}
                </div>

                {/* Arama formülü */}
                {kwPreview && (
                  <div style={{ marginTop: '0.35rem', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {kwPreview}
                  </div>
                )}

                {/* Bağlam chip'leri */}
                {tag.context_keywords?.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.2rem', marginTop: '0.35rem' }}>
                    {tag.context_keywords.map(kw => (
                      <span key={kw} style={{ fontSize: '0.65rem', padding: '1px 6px', borderRadius: 10, background: 'rgba(0,112,243,0.1)', color: 'var(--accent-light)', border: '1px solid rgba(0,112,243,0.2)' }}>
                        {kw}
                      </span>
                    ))}
                    {tag.context_oper === 'off' && (
                      <span style={{ fontSize: '0.62rem', padding: '1px 5px', borderRadius: 10, background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}>
                        SERBEST
                      </span>
                    )}
                  </div>
                )}

                <div className="tag-card-meta" style={{ marginTop: '0.4rem' }}>
                  {tag.is_breaking && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      Her {INTERVALS.find(i => i.value === tag.scan_interval_minutes)?.label ?? `${tag.scan_interval_minutes}dk`}
                    </span>
                  )}
                  {tag.last_breaking_scan && (
                    <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                      Son tarama: {new Date((tag.last_breaking_scan.endsWith('Z') || tag.last_breaking_scan.includes('+') ? tag.last_breaking_scan : tag.last_breaking_scan + 'Z')).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>

                {/* Yayın durumu */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.5rem' }}>
                  <button
                    onClick={() => handlePublishToggle(tag)}
                    disabled={publishingId === tag.id ||
                      (!isSuperAdmin && tag.is_published && tag.published_by_id && tag.published_by_id !== user?.id)}
                    title={
                      tag.is_published && tag.published_by_id && tag.published_by_id !== user?.id && !isSuperAdmin
                        ? 'Yalnızca yayınlayan admin veya Süper Admin durdurabilir'
                        : tag.is_published ? 'Yayından kaldır' : 'Kullanıcılara yayınla'
                    }
                    style={{
                      display: 'flex', alignItems: 'center', gap: '0.35rem',
                      padding: '0.2rem 0.6rem', borderRadius: 20, fontSize: '0.72rem',
                      border: `1px solid ${tag.is_published ? '#10b981' : 'var(--border)'}`,
                      background: tag.is_published ? 'rgba(16,185,129,0.1)' : 'transparent',
                      color: tag.is_published ? '#10b981' : 'var(--text-muted)',
                      cursor: 'pointer', transition: 'all 0.15s',
                      opacity: publishingId === tag.id ? 0.5 : 1,
                    }}
                  >
                    <Radio size={11} />
                    {publishingId === tag.id ? '...' : tag.is_published ? 'Yayında' : 'Yayında değil'}
                  </button>
                  {tag.is_published && (tag.published_by_username || tag.published_by_id) && (
                    <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                      {tag.published_by_username || `#${tag.published_by_id}`} tarafından
                    </span>
                  )}
                </div>

                <div className="tag-card-actions">
                  <button className="btn btn-sm btn-outline" onClick={() => handleEdit(tag)}>✏️ Düzenle</button>
                  <button className="btn btn-sm btn-danger" onClick={() => handleDeleteClick(tag)}>🗑️ Sil</button>
                </div>
              </div>
            );
          })
        )}
      </div>
      )}

      {/* ── Trendler (tam genişlik, etiketlerin altında) ── */}
      <div style={{ marginTop: '1.5rem' }}>
        <TrendsPanel />
      </div>

      {/* ── Etiket yok mesajı (TrendsPanel'in altında, ortalı) ── */}
      {!loading && tags.length === 0 && (
        <div className="empty-state" style={{ marginTop: '2rem' }}>
          <span className="empty-icon"><Tags size={48} color="var(--text-muted)" /></span>
          <h3>Henüz etiket yok</h3>
          <p>Haber taramak için etiket ekleyin</p>
        </div>
      )}

    </div>
  );
}
