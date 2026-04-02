import { useState, useEffect } from 'react';
import { tagsApi } from '../services/api';
import { Tags } from 'lucide-react';

const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];
const LANGUAGES = [
  { value: 'tr', label: 'Türkçe' },
  { value: 'global', label: 'Global (EN)' },
  { value: 'both', label: 'İkisi' },
];

export default function TagsPage() {
  const [tags, setTags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', color: '#3B82F6', language: 'both' });
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { id, name }
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
      setForm({ name: '', color: '#3B82F6', language: 'both' });
      setEditId(null);
      setShowForm(false);
      fetchTags();
    } catch (err) {
      alert(err.response?.data?.detail || 'Hata oluştu');
    }
  };

  const handleEdit = (tag) => {
    setForm({ name: tag.name, color: tag.color, language: tag.language });
    setEditId(tag.id);
    setShowForm(true);
  };

  const handleDeleteClick = (tag) => {
    setDeleteConfirm({ id: tag.id, name: tag.name });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await tagsApi.delete(deleteConfirm.id);
      setDeleteConfirm(null);
      fetchTags();
    } catch (err) {
      console.error('Delete error:', err);
      alert(err.response?.data?.detail || 'Silme hatası oluştu');
    }
    setDeleting(false);
  };

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Tags size={28} /> Etiketler</h1>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ name: '', color: '#3B82F6', language: 'both' }); }}>
          {showForm ? '✕ İptal' : '+ Yeni Etiket'}
        </button>
      </div>

      {/* Custom Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-icon">⚠️</div>
            <h3>Etiketi Sil</h3>
            <p><strong>"{deleteConfirm.name}"</strong> etiketini ve ilişkili tüm haberleri silmek istediğinize emin misiniz?</p>
            <p className="modal-warning">Bu işlem geri alınamaz!</p>
            <div className="modal-actions">
              <button
                className="btn btn-danger"
                onClick={handleDeleteConfirm}
                disabled={deleting}
              >
                {deleting ? '⏳ Siliniyor...' : '🗑️ Evet, Sil'}
              </button>
              <button
                className="btn btn-outline"
                onClick={() => setDeleteConfirm(null)}
                disabled={deleting}
              >
                İptal
              </button>
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
              </div>
              <div className="tag-card-meta">
                <span className="tag-lang">{LANGUAGES.find(l => l.value === tag.language)?.label}</span>
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
