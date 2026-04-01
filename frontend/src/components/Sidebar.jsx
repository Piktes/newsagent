import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { tagsApi } from '../services/api';

const NAV_ITEMS = [
  { path: '/', icon: '📰', label: 'Haberler' },
  { path: '/favorites', icon: '⭐', label: 'Favoriler' },
  { path: '/tags', icon: '🏷️', label: 'Etiketler' },
  { path: '/sources', icon: '📡', label: 'Kaynaklar' },
  { path: '/notifications', icon: '🔔', label: 'Bildirimler' },
];

const ADMIN_ITEMS = [
  { path: '/admin', icon: '📊', label: 'Yönetim Paneli' },
  { path: '/admin/users', icon: '👥', label: 'Kullanıcılar' },
  { path: '/admin/logs', icon: '📋', label: 'Tarama Logları' },
];

export default function Sidebar({ collapsed, onToggle }) {
  const { user, logout, isAdmin } = useAuth();
  const [tags, setTags] = useState([]);
  const location = useLocation();

  useEffect(() => {
    tagsApi.list().then(r => setTags(r.data)).catch(() => {});
  }, [location.pathname]);

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="logo" onClick={onToggle}>
          <span className="logo-icon">⚡</span>
          {!collapsed && <span className="logo-text">Meejahse</span>}
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
              {!collapsed && <span className="nav-label">{item.label}</span>}
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
        <button className="logout-btn" onClick={logout} title="Çıkış">
          {collapsed ? '🚪' : 'Çıkış Yap'}
        </button>
      </div>
    </aside>
  );
}
