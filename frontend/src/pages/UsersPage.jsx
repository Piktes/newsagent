import { useState, useEffect } from 'react';
import { authApi } from '../services/api';
import { Users } from 'lucide-react';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: '', email: '', password: '', role: 'user' });

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await authApi.getUsers();
      setUsers(res.data);
    } catch (err) {
      console.error(err);
    }
    setLoading(false);
  };

  useEffect(() => { fetchUsers(); }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      await authApi.createUser(form);
      setForm({ username: '', email: '', password: '', role: 'user' });
      setShowForm(false);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.detail || 'Hata oluştu');
    }
  };

  const handleToggle = async (user) => {
    try {
      await authApi.updateUser(user.id, { is_active: !user.is_active });
      fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Bu kullanıcıyı silmek istediğinize emin misiniz?')) return;
    try {
      await authApi.deleteUser(id);
      fetchUsers();
    } catch (err) {
      alert(err.response?.data?.detail || 'Hata oluştu');
    }
  };

  return (
    <div className="dashboard-page">
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Users size={28} /> Kullanıcı Yönetimi</h1>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setEditId(null); setForm({ username: '', password: '', role: 'user' }); }}>
          {showForm ? '✕ İptal' : '+ Yeni Kullanıcı'}
        </button>
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={handleSubmit}>
          <h3>Yeni Kullanıcı</h3>
          <div className="form-row">
            <div className="form-group flex-1">
              <label>Kullanıcı Adı</label>
              <input type="text" value={form.username} onChange={(e) => setForm({...form, username: e.target.value})} required minLength={3} />
            </div>
            <div className="form-group flex-1">
              <label>E-posta</label>
              <input type="email" value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} required />
            </div>
          </div>
          <div className="form-row">
            <div className="form-group flex-1">
              <label>Şifre</label>
              <input type="password" value={form.password} onChange={(e) => setForm({...form, password: e.target.value})} required minLength={6} />
            </div>
            <div className="form-group">
              <label>Rol</label>
              <select value={form.role} onChange={(e) => setForm({...form, role: e.target.value})}>
                <option value="user">Kullanıcı</option>
                <option value="super_admin">Admin</option>
              </select>
            </div>
          </div>
          <button type="submit" className="btn btn-primary">Oluştur</button>
        </form>
      )}

      <div className="users-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Kullanıcı</th>
              <th>E-posta</th>
              <th>Rol</th>
              <th>Durum</th>
              <th>Kayıt Tarihi</th>
              <th>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan="6" style={{textAlign:'center'}}><div className="spinner"></div></td></tr>
            ) : users.map(user => (
              <tr key={user.id}>
                <td><strong>{user.username}</strong></td>
                <td>{user.email}</td>
                <td><span className={`badge ${user.role === 'super_admin' ? 'badge-purple' : 'badge-blue'}`}>
                  {user.role === 'super_admin' ? '👑 Admin' : '👤 Kullanıcı'}
                </span></td>
                <td>
                  <label className="toggle">
                    <input type="checkbox" checked={user.is_active} onChange={() => handleToggle(user)} disabled={user.role === 'super_admin'} />
                    <span className="toggle-slider"></span>
                  </label>
                </td>
                <td>{user.created_at ? new Date(user.created_at).toLocaleDateString('tr-TR') : '-'}</td>
                <td>
                  {user.role !== 'super_admin' && (
                    <button className="btn btn-sm btn-danger" onClick={() => handleDelete(user.id)}>🗑️</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
