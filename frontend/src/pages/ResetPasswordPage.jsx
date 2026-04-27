import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { authApi } from '../services/api';
import { Sun, Moon } from 'lucide-react';

export default function ResetPasswordPage({ isDarkTheme, toggleTheme }) {
  const { token } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState('');

  const logoSrc = isDarkTheme ? '/meb-logo-white.png' : '/meb-logo-red.png';

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg('Geçersiz bağlantı');
    }
  }, [token]);

  const handleReset = async () => {
    setStatus('loading');
    try {
      await authApi.resetPasswordWithToken(token);
      setStatus('success');
      setTimeout(() => navigate('/login'), 3000);
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.response?.data?.detail || 'Bir hata oluştu');
    }
  };

  return (
    <div className="login-page" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div className="login-bg">
        <div className="login-orb login-orb-1"></div>
        <div className="login-orb login-orb-2"></div>
        <div className="login-orb login-orb-3"></div>
      </div>

      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
      }}>
        <img src={logoSrc} alt="" style={{ width: '82vmin', opacity: isDarkTheme ? 0.05 : 0.06, userSelect: 'none' }} />
      </div>

      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

          <img src={logoSrc} alt="MEB" style={{
            height: 68, width: 'auto', marginBottom: '-22px', position: 'relative', zIndex: 2,
            filter: isDarkTheme ? 'drop-shadow(0 2px 10px rgba(0,0,0,0.6))' : 'drop-shadow(0 2px 8px rgba(0,0,0,0.18))',
          }} />

          <div className="login-card">
            <button type="button" className="btn btn-outline"
              style={{ position: 'absolute', top: '20px', right: '20px', padding: '0.5rem', borderRadius: '50%' }}
              onClick={toggleTheme} title="Tema Değiştir">
              {isDarkTheme ? <Sun size={18} /> : <Moon size={18} />}
            </button>

            <div className="login-logo" style={{ paddingTop: '1.25rem' }}>
              <h1>Şifre Sıfırlama</h1>
              <p className="login-subtitle">Şifreniz 123456 olarak sıfırlanacak</p>
            </div>

            <div style={{ padding: '0.25rem 0 1rem' }}>
              {status === 'idle' && (
                <>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', textAlign: 'center', marginBottom: '1.25rem', lineHeight: 1.6 }}>
                    Onayladığınızda şifreniz <strong>123456</strong> olarak sıfırlanacak ve giriş sonrası yeni şifre belirlemeniz istenecektir.
                  </p>
                  <button className="login-btn" onClick={handleReset}>
                    Şifremi Sıfırla
                  </button>
                </>
              )}

              {status === 'loading' && (
                <div style={{ textAlign: 'center', padding: '1rem' }}>
                  <span className="spinner" style={{ display: 'inline-block' }} />
                </div>
              )}

              {status === 'success' && (
                <div style={{
                  background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
                  borderRadius: 'var(--radius-sm)', padding: '1rem 1.25rem',
                  color: 'var(--text-primary)', lineHeight: 1.6, fontSize: '0.9rem', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>✅</div>
                  <strong>Şifreniz sıfırlandı!</strong><br />
                  Şifreniz <strong>123456</strong> olarak ayarlandı.<br />
                  <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Giriş sayfasına yönlendiriliyorsunuz…</span>
                </div>
              )}

              {status === 'error' && (
                <div style={{
                  background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 'var(--radius-sm)', padding: '1rem 1.25rem',
                  color: 'var(--text-primary)', lineHeight: 1.6, fontSize: '0.9rem', textAlign: 'center',
                }}>
                  <div style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>❌</div>
                  <strong>Hata</strong><br />
                  {errorMsg}
                </div>
              )}
            </div>

            <div style={{ textAlign: 'center', marginTop: '0.25rem' }}>
              <Link to="/login" style={{ color: 'var(--accent)', fontSize: '0.875rem', textDecoration: 'none' }}>
                ← Giriş sayfasına dön
              </Link>
            </div>
          </div>

        </div>
      </div>

      <footer style={{ position: 'relative', zIndex: 1, padding: '0.75rem 1.5rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem' }}>
        <div style={{
          width: '100%', height: '1px',
          background: isDarkTheme
            ? 'linear-gradient(to right, transparent, rgba(255,255,255,0.18) 25%, rgba(255,255,255,0.18) 75%, transparent)'
            : 'linear-gradient(to right, transparent, rgba(0,0,0,0.14) 25%, rgba(0,0,0,0.14) 75%, transparent)',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
          <img src={logoSrc} alt="MEB" style={{ height: 20, width: 'auto', opacity: 0.75 }} />
          <span style={{ fontSize: '0.7rem', color: isDarkTheme ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)' }}>
            Bu uygulama T.C. Millî Eğitim Bakanlığı Bilgi İşlem Genel Müdürlüğü tarafından geliştirilmiştir &nbsp;·&nbsp; © 2026 Tüm hakları saklıdır
          </span>
        </div>
      </footer>
    </div>
  );
}
