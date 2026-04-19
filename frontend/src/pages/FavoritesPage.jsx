import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookMarked, Plus, Pencil, Trash2, X, Check, Newspaper } from 'lucide-react';
import { listsApi } from '../services/api';

export default function FavoritesPage() {
  const [lists, setLists] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editName, setEditName] = useState('');
  const navigate = useNavigate();

  const fetchLists = async () => {
    setLoading(true);
    try {
      const res = await listsApi.list();
      setLists(res.data);
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  useEffect(() => { fetchLists(); }, []);

  const handleCreate = async (e) => {
    e.preventDefault();
    if (!newName.trim()) return;
    try {
      await listsApi.create({ name: newName.trim() });
      setNewName('');
      setCreating(false);
      fetchLists();
    } catch (err) { console.error(err); }
  };

  const handleRename = async (id) => {
    if (!editName.trim()) return;
    try {
      await listsApi.rename(id, { name: editName.trim() });
      setEditId(null);
      fetchLists();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`"${name}" listesini silmek istediğinize emin misiniz?`)) return;
    try {
      await listsApi.delete(id);
      fetchLists();
    } catch (err) { console.error(err); }
  };

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <BookMarked size={24} /> Favoriler
        </h1>
        <button className="btn btn-primary" style={{ gap: '0.375rem', display: 'flex', alignItems: 'center' }} onClick={() => setCreating(true)}>
          <Plus size={16} /> Yeni Liste
        </button>
      </div>

      {creating && (
        <form className="card" style={{ padding: '1rem', marginBottom: '1rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }} onSubmit={handleCreate}>
          <input
            className="filter-select"
            style={{ flex: 1, padding: '0.5rem 0.75rem' }}
            placeholder="Liste adı..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            autoFocus
          />
          <button type="submit" className="btn btn-primary btn-sm" style={{ gap: '0.3rem', display: 'flex', alignItems: 'center' }} disabled={!newName.trim()}>
            <Check size={14} /> Oluştur
          </button>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => { setCreating(false); setNewName(''); }}>
            <X size={14} />
          </button>
        </form>
      )}

      {loading ? (
        <div className="loading-state"><div className="spinner large" /></div>
      ) : lists.length === 0 ? (
        <div className="empty-state">
          <span className="empty-icon"><Newspaper size={48} color="var(--text-muted)" /></span>
          <h3>Henüz liste yok</h3>
          <p>Yeni bir liste oluşturun, haberleri yıldız butonuyla ekleyin</p>
          {!creating && (
            <button className="btn btn-primary" style={{ marginTop: '1rem', gap: '0.375rem', display: 'flex', alignItems: 'center' }} onClick={() => setCreating(true)}>
              <Plus size={16} /> Yeni Liste Oluştur
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {lists.map(lst => (
            <div key={lst.id} className="card" style={{ padding: '1.25rem', cursor: 'pointer' }}
              onClick={() => editId !== lst.id && navigate(`/lists/${lst.id}`)}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                {editId === lst.id ? (
                  <input
                    className="filter-select"
                    style={{ flex: 1, padding: '0.25rem 0.5rem', fontSize: '0.9rem' }}
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRename(lst.id); if (e.key === 'Escape') setEditId(null); }}
                    autoFocus
                    onClick={e => e.stopPropagation()}
                  />
                ) : (
                  <div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', letterSpacing: '-0.2px' }}>{lst.name}</h3>
                    <span style={{ fontSize: '0.8125rem', color: 'var(--text-muted)' }}>{lst.item_count} haber</span>
                  </div>
                )}
                <div style={{ display: 'flex', gap: '0.25rem', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                  {editId === lst.id ? (
                    <>
                      <button className="icon-btn" onClick={() => handleRename(lst.id)} title="Kaydet"><Check size={14} /></button>
                      <button className="icon-btn" onClick={() => setEditId(null)} title="İptal"><X size={14} /></button>
                    </>
                  ) : (
                    <>
                      <button className="icon-btn" onClick={() => { setEditId(lst.id); setEditName(lst.name); }} title="Yeniden Adlandır"><Pencil size={14} /></button>
                      <button className="icon-btn" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(lst.id, lst.name)} title="Sil"><Trash2 size={14} /></button>
                    </>
                  )}
                </div>
              </div>
              {editId !== lst.id && (
                <div style={{ marginTop: '1rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {lst.created_at ? new Date(lst.created_at).toLocaleDateString('tr-TR') : ''}
                  </span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--accent)', fontWeight: 500 }}>Görüntüle →</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
