import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { RefreshCw, X } from 'lucide-react';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import FavoritesPage from './pages/FavoritesPage';
import TagsPage from './pages/TagsPage';
import SourcesPage from './pages/SourcesPage';
import NotificationsPage from './pages/NotificationsPage';
import HiddenNewsPage from './pages/HiddenNewsPage';
import ListDetailPage from './pages/ListDetailPage';
import AdminPage from './pages/AdminPage';
import UsersPage from './pages/UsersPage';
import ScanLogsPage from './pages/ScanLogsPage';
import QuotaPage from './pages/QuotaPage';
import BreakingNewsPage from './pages/BreakingNewsPage';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <div className="loading-state"><div className="spinner large"></div></div>;
  if (!user) return <Navigate to="/login" />;
  if (adminOnly && !isAdmin) return <Navigate to="/" />;
  return children;
}

function AppLayout({ isDarkTheme, toggleTheme }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [scanToast, setScanToast] = useState(null); // { tags: [], dismissed: bool }
  const wsRef = useRef(null);
  const { user } = useAuth();
  const WS_BASE = (import.meta.env.VITE_API_BASE || 'http://localhost:8000/api')
    .replace(/^http/, 'ws').replace(/\/api$/, '');

  useEffect(() => {
    if (!user?.id) return;
    const connect = () => {
      const ws = new WebSocket(`${WS_BASE}/api/notifications/ws/${user.id}`);
      wsRef.current = ws;
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          if (msg.type === 'scan_started') {
            setScanToast({ tags: msg.tags || [], total: msg.total || 0, completed: 0, finished: false });
          } else if (msg.type === 'scan_progress') {
            setScanToast(prev => prev ? { ...prev, completed: msg.completed, total: msg.total, currentTag: msg.tag } : null);
          } else if (msg.type === 'scan_finished') {
            setScanToast(prev => prev ? { ...prev, finished: true, completed: prev.total } : null);
            setTimeout(() => setScanToast(null), 3000);
          } else if (msg.type === 'new_news' && 'Notification' in window && Notification.permission === 'granted') {
            const isBreaking = msg.is_breaking;
            new Notification(
              isBreaking ? `🔴 SON DAKİKA: ${msg.tag}` : `Yeni Haberler: ${msg.tag}`,
              { body: `${msg.count} yeni haber bulundu`, icon: '/favicon.ico' }
            );
          }
        } catch {}
      };
      ws.onclose = () => setTimeout(connect, 5000);
    };
    connect();
    return () => wsRef.current?.close();
  }, [user?.id]);

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        isDarkTheme={isDarkTheme}
        toggleTheme={toggleTheme}
      />
      {scanToast && (
        <div className={`scan-toast ${scanToast.finished ? 'finished' : 'running'}`}>
          <div className="scan-toast-header">
            <RefreshCw size={14} className={scanToast.finished ? '' : 'spin'} />
            <div className="scan-toast-text">
              {scanToast.finished
                ? 'Haber taraması tamamlandı.'
                : scanToast.currentTag
                  ? `"${scanToast.currentTag}" taranıyor…`
                  : 'Haber taraması başlıyor…'}
            </div>
            {scanToast.total > 0 && (
              <span className="scan-toast-counter">{scanToast.completed}/{scanToast.total}</span>
            )}
            <button className="scan-toast-close" onClick={() => setScanToast(null)}><X size={13} /></button>
          </div>
          {scanToast.total > 0 && (
            <div className="scan-toast-progress-track">
              <div
                className="scan-toast-progress-bar"
                style={{ width: `${scanToast.total > 0 ? Math.round((scanToast.completed / scanToast.total) * 100) : 0}%` }}
              />
            </div>
          )}
        </div>
      )}
      <main className="main-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/today" element={<DashboardPage />} />
          <Route path="/son-dakika" element={<BreakingNewsPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/tags" element={<TagsPage />} />
          <Route path="/sources" element={<SourcesPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/hidden" element={<HiddenNewsPage />} />
          <Route path="/lists/:id" element={<ListDetailPage />} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute adminOnly><UsersPage /></ProtectedRoute>} />
          <Route path="/admin/logs" element={<ProtectedRoute adminOnly><ScanLogsPage /></ProtectedRoute>} />
          <Route path="/admin/quota" element={<ProtectedRoute adminOnly><QuotaPage /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    const saved = localStorage.getItem('haberajani_theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    if (isDarkTheme) {
      document.body.classList.remove('light-theme');
      localStorage.setItem('haberajani_theme', 'dark');
    } else {
      document.body.classList.add('light-theme');
      localStorage.setItem('haberajani_theme', 'light');
    }
  }, [isDarkTheme]);

  const toggleTheme = () => setIsDarkTheme(!isDarkTheme);

  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage isDarkTheme={isDarkTheme} toggleTheme={toggleTheme} />} />
          <Route path="/*" element={<ProtectedRoute><AppLayout isDarkTheme={isDarkTheme} toggleTheme={toggleTheme} /></ProtectedRoute>} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
