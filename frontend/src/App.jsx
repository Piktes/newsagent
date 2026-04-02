import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { AuthProvider, useAuth } from './hooks/useAuth';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import FavoritesPage from './pages/FavoritesPage';
import TagsPage from './pages/TagsPage';
import SourcesPage from './pages/SourcesPage';
import NotificationsPage from './pages/NotificationsPage';
import AdminPage from './pages/AdminPage';
import UsersPage from './pages/UsersPage';
import ScanLogsPage from './pages/ScanLogsPage';

function ProtectedRoute({ children, adminOnly = false }) {
  const { user, loading, isAdmin } = useAuth();
  if (loading) return <div className="loading-state"><div className="spinner large"></div></div>;
  if (!user) return <Navigate to="/login" />;
  if (adminOnly && !isAdmin) return <Navigate to="/" />;
  return children;
}

function AppLayout({ isDarkTheme, toggleTheme }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  return (
    <div className={`app-layout ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <Sidebar 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
        isDarkTheme={isDarkTheme}
        toggleTheme={toggleTheme}
      />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/today" element={<DashboardPage />} />
          <Route path="/favorites" element={<FavoritesPage />} />
          <Route path="/tags" element={<TagsPage />} />
          <Route path="/sources" element={<SourcesPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
          <Route path="/admin/users" element={<ProtectedRoute adminOnly><UsersPage /></ProtectedRoute>} />
          <Route path="/admin/logs" element={<ProtectedRoute adminOnly><ScanLogsPage /></ProtectedRoute>} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  const [isDarkTheme, setIsDarkTheme] = useState(() => {
    const saved = localStorage.getItem('meejahse_theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    if (isDarkTheme) {
      document.body.classList.remove('light-theme');
      localStorage.setItem('meejahse_theme', 'dark');
    } else {
      document.body.classList.add('light-theme');
      localStorage.setItem('meejahse_theme', 'light');
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
