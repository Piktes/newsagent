import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Zap, Sun, Moon, Eye, EyeOff } from 'lucide-react';

export default function LoginPage({ isDarkTheme, toggleTheme }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Giriş başarısız');
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-bg">
        <div className="login-orb login-orb-1"></div>
        <div className="login-orb login-orb-2"></div>
        <div className="login-orb login-orb-3"></div>
      </div>

      <div className="login-card">
        <button
          type="button"
          className="btn btn-outline"
          style={{ position: 'absolute', top: '20px', right: '20px', padding: '0.5rem', borderRadius: '50%' }}
          onClick={toggleTheme}
          title="Tema Değiştir"
        >
          {isDarkTheme ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <div className="login-logo">
          <span className="login-logo-icon"><Zap size={48} color="var(--accent)" /></span>
          <h1>Haber Ajanı</h1>
          <p className="login-subtitle">Sosyal Medya Haber Ajanı</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}

          <div className="form-group">
            <label htmlFor="username">Kullanıcı Adı</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="admin"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Şifre</label>
            <div className="input-eye-wrap">
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••"
                required
              />
              <button type="button" className="eye-btn" onClick={() => setShowPassword(v => !v)} tabIndex={-1}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? <span className="spinner" /> : 'Giriş Yap'}
          </button>
        </form>

        <div className="login-footer-note">
          <strong>ℹ️ Bilgi:</strong> Sisteme giriş için kurumsal <strong>@meb.gov.tr</strong> e-posta adresiniz gereklidir.
          İlk girişte şifreniz <strong>123456</strong> olarak tanımlanmıştır — giriş sonrası değiştirmeniz zorunludur.
        </div>
      </div>
    </div>
  );
}
