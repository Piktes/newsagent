import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { authApi } from '../services/api';
import { KeyRound, CheckCircle2, XCircle } from 'lucide-react';

function PasswordRule({ met, text }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.8rem',
      color: met ? '#22c55e' : 'var(--text-muted)' }}>
      {met ? <CheckCircle2 size={13} /> : <XCircle size={13} />}
      {text}
    </div>
  );
}

function checkRules(pw) {
  return {
    length:    pw.length >= 8,
    upper:     /[A-Z]/.test(pw),
    lower:     /[a-z]/.test(pw),
    digit:     /\d/.test(pw),
    symbol:    /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\;'`~/]/.test(pw),
  };
}

export default function ChangePasswordPage() {
  const { user, updateUser } = useAuth();
  const navigate = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const rules = checkRules(next);
  const allRulesMet = Object.values(rules).every(Boolean);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!allRulesMet) { setError('Şifre tüm kuralları karşılamalıdır'); return; }
    if (next !== confirm) { setError('Yeni şifreler eşleşmiyor'); return; }
    setLoading(true);
    try {
      await authApi.changePassword(current, next);
      updateUser({ must_change_password: false });
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Şifre değiştirilemedi');
    }
    setLoading(false);
  };

  return (
    <div className="login-page">
      <div className="login-bg">
        <div className="login-orb login-orb-1" />
        <div className="login-orb login-orb-2" />
        <div className="login-orb login-orb-3" />
      </div>

      <div className="login-card" style={{ maxWidth: 440 }}>
        <div className="login-logo">
          <span className="login-logo-icon"><KeyRound size={48} color="var(--accent)" /></span>
          <h1 style={{ fontSize: '1.5rem' }}>Şifre Değiştir</h1>
          <p className="login-subtitle">
            Hoş geldiniz, <strong>{user?.username}</strong>. Devam etmek için şifrenizi değiştirin.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          {error && <div className="login-error">{error}</div>}

          <div className="form-group">
            <label>Mevcut Şifre</label>
            <input type="password" value={current} onChange={e => setCurrent(e.target.value)}
              placeholder="••••••" required autoFocus />
          </div>

          <div className="form-group">
            <label>Yeni Şifre</label>
            <input type="password" value={next} onChange={e => setNext(e.target.value)}
              placeholder="••••••••" required />
            {next.length > 0 && (
              <div style={{ marginTop: '0.5rem', display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                <PasswordRule met={rules.length} text="En az 8 karakter" />
                <PasswordRule met={rules.upper}  text="En az 1 büyük harf" />
                <PasswordRule met={rules.lower}  text="En az 1 küçük harf" />
                <PasswordRule met={rules.digit}  text="En az 1 rakam" />
                <PasswordRule met={rules.symbol} text="En az 1 sembol (!@#$% vb.)" />
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Yeni Şifre (Tekrar)</label>
            <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)}
              placeholder="••••••••" required />
            {confirm.length > 0 && next !== confirm && (
              <div style={{ color: '#ef4444', fontSize: '0.8rem', marginTop: '0.25rem' }}>Şifreler eşleşmiyor</div>
            )}
          </div>

          <button type="submit" className="login-btn" disabled={loading || !allRulesMet || next !== confirm}>
            {loading ? <span className="spinner" /> : 'Şifreyi Kaydet'}
          </button>
        </form>
      </div>
    </div>
  );
}
