import { useState, useEffect } from 'react';
import { authApi } from '../services/api';
import { Users, Info } from 'lucide-react';

export default function UsersPage() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ username: '', emailPrefix: '', role: 'user' });

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
      await authApi.createUser({
        username: form.username,
        email: `${form.emailPrefix}@meb.gov.tr`,
        role: form.role,
        password: '123456',
      });
      setForm({ username: '', emailPrefix: '', role: 'user' });
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

  const handleResetPassword = async (user) => {
    if (!confirm(`"${user.username}" kullanıcısının şifresi 123456 olarak sıfırlanacak. Devam edilsin mi?`)) return;
    try {
      await authApi.resetUserPassword(user.id);
      alert('Şifre 123456 olarak sıfırlandı. Kullanıcı bir sonraki girişte şifresini değiştirmek zorunda kalacak.');
    } catch (err) {
      alert(err.response?.data?.detail || 'Hata oluştu');
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
    <div className="dashboard-page admin-page">
      <div className="page-header">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}><Users size={28} /> Kullanıcı Yönetimi</h1>
        <button className="btn btn-primary" onClick={() => { setShowForm(!showForm); setForm({ username: '', emailPrefix: '', role: 'user' }); }}>
          {showForm ? '✕ İptal' : '+ Yeni Kullanıcı'}
        </button>
      </div>

      {/* Bilgi Paneli */}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Info size={15} style={{ color: 'var(--accent)', flexShrink: 0 }} />
          <strong style={{ color: 'var(--text-primary)', fontSize: '0.9rem' }}>Kullanıcı hesapları hakkında</strong>
        </div>
        <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.2rem' }}>
          <li>Eklenen kullanıcı sisteme <strong>e-posta adresiyle</strong> giriş yapar (ör. <code style={{ background: 'rgba(0,0,0,0.1)', padding: '0 4px', borderRadius: 3 }}>ad.soyad@meb.gov.tr</code>).</li>
          <li>İlk giriş şifresi otomatik olarak <strong>123456</strong> atanır; kullanıcı giriş sonrasında şifresini değiştirmek zorunda kalır.</li>
          <li>Şifre sıfırlamak için tablodaki <strong>🔑</strong> butonunu kullanın — şifre tekrar 123456 yapılır.</li>
          <li>Hesabı geçici olarak kapatmak için <strong>Durum</strong> sütunundaki toggle'ı kapatın.</li>
        </ul>
      </div>

      {showForm && (
        <form className="card form-card" onSubmit={handleSubmit}>
          <h3>Yeni Kullanıcı</h3>
          <div className="form-row">
            <div className="form-group flex-1">
              <label>Kullanıcı Adı</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({...form, username: e.target.value})}
                placeholder="ör: ahmet.yilmaz"
                required
                minLength={3}
              />
            </div>
            <div className="form-group flex-1">
              <label>E-posta</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <input
                  type="text"
                  value={form.emailPrefix}
                  onChange={(e) => setForm({...form, emailPrefix: e.target.value})}
                  placeholder="ad.soyad"
                  required
                  style={{ borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)', flex: 1 }}
                />
                <span style={{
                  padding: '0 0.625rem',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--bg-secondary)',
                  border: '1px solid var(--border)',
                  borderLeft: 'none',
                  borderRadius: '0 var(--radius-sm) var(--radius-sm) 0',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)',
                  whiteSpace: 'nowrap',
                }}>@meb.gov.tr</span>
              </div>
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
                    <div style={{ display: 'flex', gap: '0.375rem' }}>
                      <button
                        className="btn btn-sm"
                        style={{ background: 'rgba(234,179,8,0.12)', color: '#ca8a04', border: '1px solid rgba(234,179,8,0.25)' }}
                        onClick={() => handleResetPassword(user)}
                        title="Şifreyi 123456 olarak sıfırla"
                      >
                        🔑
                      </button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleDelete(user.id)}>🗑️</button>
                    </div>
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
