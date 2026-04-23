import { useState, useEffect } from 'react';
import { tagsApi } from '../services/api';
import { Tags, Zap } from 'lucide-react';

const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];
const LANGUAGES = [
  { value: 'tr', label: 'Türkçe' },
  { value: 'global', label: 'Global (EN)' },
  { value: 'both', label: 'İkisi' },
];
const INTERVALS = [
  { value: 15,  label: '15 dakika' },
  { value: 30,  label: '30 dakika' },
  { value: 60,  label: '1 saat' },
  { value: 120, label: '2 saat' },
];

const EMPTY_FORM = { name: '', color: '#3B82F6', language: 'both', is_breaking: false, scan_interval_minutes: 30 };

export default function TagsPage() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting, setDeleting] = useState(false);

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

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editId) {
        await tagsApi.update(editId, form);
      } else {
        await tagsApi.create(form);
      }
      setForm(EMPTY_FORM);
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
      name: tag.name,
      color: tag.color,
      language: tag.language,
      is_breaking: tag.is_breaking ?? false,
      scan_interval_minutes: tag.scan_interval_minutes ?? 30,
    });
    setEditId(tag.id);
    setShowForm(true);
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

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Tags size={28} /> Etiketler</h1>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditId(null); setForm(EMPTY_FORM); }}>
          {showForm ? '✕ İptal' : '+ Yeni Etiket'}
        </button>
      </div>

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

      {showForm && (
        <form className="card form-card" onSubmit={handleSubmit}>
          <h3>{editId ? 'Etiketi Düzenle' : 'Yeni Etiket'}</h3>
          <div className="form-row">
            <div className="form-group flex-1">
              <label>Etiket Adı</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="ör: Yapay Zeka"
                required
              />
            </div>
            <div className="form-group">
              <label>Dil</label>
              <select value={form.language} onChange={(e) => setForm({ ...form, language: e.target.value })}>
                {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label>Renk</label>
            <div className="color-picker">
              {COLORS.map(c => (
                <button
                  key={c}
                  type="button"
                  className={`color-swatch ${form.color === c ? 'selected' : ''}`}
                  style={{ backgroundColor: c }}
                  onClick={() => setForm({ ...form, color: c })}
                />
              ))}
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="color-input"
              />
            </div>
          </div>

          {/* Son Dakika */}
          <div className="form-group" style={{ marginTop: '0.75rem' }}>
            <label
              style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', userSelect: 'none' }}
            >
              <span
                onClick={() => setForm({ ...form, is_breaking: !form.is_breaking })}
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
                  transition: 'transform 0.2s',
                  display: 'block',
                }} />
              </span>
              <Zap size={14} style={{ color: form.is_breaking ? '#ef4444' : 'var(--text-muted)' }} />
              <span style={{ fontWeight: 500, color: form.is_breaking ? '#ef4444' : 'var(--text-secondary)' }}>
                Son Dakika etiketi
              </span>
            </label>
            {form.is_breaking && (
              <div style={{ marginTop: '0.625rem', padding: '0.625rem 0.75rem', borderRadius: 'var(--radius-sm)', background: 'rgba(239,68,68,0.06)', boxShadow: 'rgba(239,68,68,0.25) 0 0 0 1px', fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <span>🔴 Bu etiket otomatik taranacak. Yeni haberler <strong>Son Dakika</strong> sayfasında yanıp sönen badge ile gösterilecek.</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{ whiteSpace: 'nowrap', fontSize: '0.8125rem' }}>Tarama sıklığı:</span>
                  <select
                    value={form.scan_interval_minutes}
                    onChange={(e) => setForm({ ...form, scan_interval_minutes: Number(e.target.value) })}
                    className="filter-select"
                    style={{ flex: 1 }}
                  >
                    {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                  </select>
                </div>
              </div>
            )}
          </div>

          <button type="submit" className="btn btn-primary">{editId ? 'Güncelle' : 'Oluştur'}</button>
        </form>
      )}

      <div className="tags-grid">
        {loading ? (
          <div className="loading-state"><div className="spinner large"></div></div>
        ) : tags.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon"><Tags size={48} color="var(--text-muted)" /></span>
            <h3>Henüz etiket yok</h3>
            <p>Haber taramak için etiket ekleyin</p>
          </div>
        ) : (
          tags.map(tag => (
            <div key={tag.id} className="tag-card" style={{ borderLeftColor: tag.color }}>
              <div className="tag-card-header">
                <span className="tag-dot large" style={{ backgroundColor: tag.color }}></span>
                <h3>{tag.name}</h3>
                {tag.is_breaking && (
                  <span className="breaking-badge">
                    <Zap size={10} /> SON DAKİKA
                  </span>
                )}
              </div>
              <div className="tag-card-meta">
                <span className="tag-lang">{LANGUAGES.find(l => l.value === tag.language)?.label}</span>
                {tag.is_breaking && (
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    Her {INTERVALS.find(i => i.value === tag.scan_interval_minutes)?.label ?? `${tag.scan_interval_minutes}dk`}
                  </span>
                )}
                {tag.last_breaking_scan && (
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    Son tarama: {new Date((tag.last_breaking_scan.endsWith('Z') || tag.last_breaking_scan.includes('+') ? tag.last_breaking_scan : tag.last_breaking_scan + 'Z')).toLocaleString('tr-TR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}
                  </span>
                )}
              </div>
              <div className="tag-card-actions">
                <button className="btn btn-sm btn-outline" onClick={() => handleEdit(tag)}>✏️ Düzenle</button>
                <button className="btn btn-sm btn-danger" onClick={() => handleDeleteClick(tag)}>🗑️ Sil</button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
