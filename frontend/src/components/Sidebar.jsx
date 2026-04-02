import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { tagsApi, newsApi } from '../services/api';
import {
  Newspaper, Calendar, Star, Tags, Radio, Bell, 
  BarChart, Users, FileText, Zap, LogOut, Sun, Moon
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', icon: <Newspaper size={18} />, label: 'Haberler', key: 'news' },
  { path: '/today', icon: <Calendar size={18} />, label: 'Bugün Ne Oldu', key: 'today' },
  { path: '/favorites', icon: <Star size={18} />, label: 'Favoriler', key: 'favs' },
  { path: '/tags', icon: <Tags size={18} />, label: 'Etiketler', key: 'tags' },
  { path: '/sources', icon: <Radio size={18} />, label: 'Kaynaklar', key: 'sources' },
  { path: '/notifications', icon: <Bell size={18} />, label: 'Bildirimler', key: 'notifs' },
];

const ADMIN_ITEMS = [
  { path: '/admin', icon: <BarChart size={18} />, label: 'Yönetim Paneli' },
  { path: '/admin/users', icon: <Users size={18} />, label: 'Kullanıcılar' },
  { path: '/admin/logs', icon: <FileText size={18} />, label: 'Tarama Logları' },
];

export default function Sidebar({ collapsed, onToggle, isDarkTheme, toggleTheme }) {
  const { user, logout, isAdmin } = useAuth();
  const [tags, setTags] = useState([]);
  const [todayUnread, setTodayUnread] = useState(0);
  const location = useLocation();

  useEffect(() => {
    tagsApi.list().then(r => setTags(r.data)).catch(() => {});
    
    const fetchCount = async () => {
      try {
        const { data } = await newsApi.count();
        if (data.today_unread !== undefined) setTodayUnread(data.today_unread);
      } catch (e) {}
    };
    fetchCount();
  }, [location.pathname]);

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="logo" onClick={onToggle}>
          <span className="logo-icon"><Zap size={24} color="var(--accent)" /></span>
          {!collapsed && <span className="logo-text">Haber Ajanı</span>}
        </div>
      </div>

      <nav className="sidebar-nav">
        <div className="nav-section">
          {!collapsed && <span className="nav-section-title">MENÜ</span>}
          {NAV_ITEMS.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && (
                <span className="nav-label">
                  {item.label}
                  {item.key === 'today' && todayUnread > 0 && ` (${todayUnread})`}
                </span>
              )}
            </NavLink>
          ))}
        </div>

        {!collapsed && tags.length > 0 && (
          <div className="nav-section">
            <span className="nav-section-title">ETİKETLER</span>
            {tags.map(tag => (
              <NavLink
                key={tag.id}
                to={`/?tag=${tag.id}`}
                className="nav-item tag-item"
              >
                <span className="tag-dot" style={{ backgroundColor: tag.color }}></span>
                <span className="nav-label">{tag.name}</span>
              </NavLink>
            ))}
          </div>
        )}

        {isAdmin && (
          <div className="nav-section">
            {!collapsed && <span className="nav-section-title">YÖNETİM</span>}
            {ADMIN_ITEMS.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
                title={item.label}
              >
                <span className="nav-icon">{item.icon}</span>
                {!collapsed && <span className="nav-label">{item.label}</span>}
              </NavLink>
            ))}
          </div>
        )}
      </nav>

      <div className="sidebar-footer">
        <div className="user-info">
          <div className="user-avatar">{user?.username?.[0]?.toUpperCase()}</div>
          {!collapsed && (
            <div className="user-details">
              <span className="user-name">{user?.username}</span>
              <span className="user-role">{isAdmin ? 'Admin' : 'Kullanıcı'}</span>
            </div>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <button 
            className="btn btn-outline" 
            style={{ flex: 1, padding: '0.5rem', justifyContent: 'center' }}
            onClick={toggleTheme}
            title={isDarkTheme ? 'Açık Tema' : 'Koyu Tema'}
          >
            {isDarkTheme ? <Sun size={16} /> : <Moon size={16} />} 
            {!collapsed && <span style={{ marginLeft: '4px' }}>{isDarkTheme ? 'Açık Tema' : 'Koyu Tema'}</span>}
          </button>
        </div>

        <button className="logout-btn" onClick={logout} title="Çıkış">
          {collapsed ? <LogOut size={16} /> : <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}><LogOut size={16} /> Çıkış Yap</span>}
        </button>
      </div>
    </aside>
  );
}
