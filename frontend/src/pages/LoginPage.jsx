import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Sun, Moon, Eye, EyeOff } from 'lucide-react';

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

  const logoSrc = isDarkTheme ? '/meb-logo-white.png' : '/meb-logo-red.png';

  return (
    <div className="login-page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      {/* Arkaplan orb'ları */}
      <div className="login-bg">
        <div className="login-orb login-orb-1"></div>
        <div className="login-orb login-orb-2"></div>
        <div className="login-orb login-orb-3"></div>
      </div>

      {/* MEB logo watermark — tüm arka planı kaplıyor */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <img
          src={logoSrc}
          alt=""
          style={{ width: '55vmin', opacity: isDarkTheme ? 0.05 : 0.06, userSelect: 'none' }}
        />
      </div>

      {/* Kart */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
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
            <h1>Haber Ajanı</h1>
            <p className="login-subtitle">Sosyal Medya Haber Ajanı</p>
          </div>

          <form onSubmit={handleSubmit} className="login-form">
            {error && <div className="login-error">{error}</div>}

            <div className="form-group">
              <label htmlFor="username">E-posta</label>
              <input
                id="username"
                type="email"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="kullanici@meb.gov.tr"
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

      {/* Footer bar */}
      <footer style={{
        position: 'relative', zIndex: 1,
        background: isDarkTheme ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.7)',
        backdropFilter: 'blur(8px)',
        borderTop: `1px solid ${isDarkTheme ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.1)'}`,
        padding: '0.625rem 1.5rem',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem',
      }}>
        <img src={logoSrc} alt="MEB" style={{ height: 22, width: 'auto', opacity: 0.8 }} />
        <span style={{
          fontSize: '0.72rem',
          color: isDarkTheme ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)',
        }}>
          Bu uygulama T.C. Millî Eğitim Bakanlığı Bilgi İşlem Genel Müdürlüğü tarafından geliştirilmiştir &nbsp;·&nbsp; © 2026 Tüm hakları saklıdır
        </span>
      </footer>
    </div>
  );
}
