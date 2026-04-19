import { useState, useEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { tagsApi, newsApi } from '../services/api';
const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';
const WS_BASE = API_BASE.replace(/^http/, 'ws').replace('/api', '');
import {
  Newspaper, Calendar, Star, Tags, Radio, Bell, EyeOff,
  BarChart, Users, FileText, Zap, LogOut, Sun, Moon
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/', icon: <Newspaper size={18} />, label: 'Haberler', key: 'news' },
  { path: '/today', icon: <Calendar size={18} />, label: 'Bugün Ne Oldu', key: 'today' },
  { path: '/favorites', icon: <Star size={18} />, label: 'Favoriler', key: 'favs' },
  { path: '/hidden', icon: <EyeOff size={18} />, label: 'Akıştan Çıkarılanlar', key: 'hidden' },
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
  const wsRef = useRef(null);

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

  // WebSocket for real-time browser notifications
  useEffect(() => {
    if (!user?.id) return;
    const ws = new WebSocket(`${WS_BASE}/ws/${user.id}`);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'new_news' && 'Notification' in window && Notification.permission === 'granted') {
          new Notification(`Yeni Haberler: ${msg.tag}`, {
            body: `${msg.count} yeni haber bulundu`,
            icon: '/favicon.ico',
          });
        }
      } catch (_) {}
    };
    return () => { ws.close(); };
  }, [user?.id]);

  return (
    <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <div className="logo" onClick={onToggle}>
          <span className="logo-icon"><Zap size={24} color="var(--accent)" /></span>
          {!collapsed && <span className="logo-text">Haber Ajanı</span>}
        </div>
        {!collapsed && (
          <div className="sidebar-user-top">
            <div className="user-avatar" style={{ width: 30, height: 30, fontSize: '0.75rem' }}>{user?.username?.[0]?.toUpperCase()}</div>
            <div className="user-details">
              <span className="user-name" style={{ fontSize: '0.8rem' }}>{user?.username}</span>
              <span className="user-role" style={{ fontSize: '0.7rem' }}>{isAdmin ? 'Admin' : 'Kullanıcı'}</span>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.25rem' }}>
              <button className="icon-btn" onClick={toggleTheme} title={isDarkTheme ? 'Açık Tema' : 'Koyu Tema'}>
                {isDarkTheme ? <Sun size={14} /> : <Moon size={14} />}
              </button>
              <button className="icon-btn" onClick={logout} title="Çıkış Yap">
                <LogOut size={14} />
              </button>
            </div>
          </div>
        )}
        {collapsed && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem', paddingTop: '0.5rem' }}>
            <div className="user-avatar" style={{ width: 28, height: 28, fontSize: '0.7rem' }}>{user?.username?.[0]?.toUpperCase()}</div>
            <button className="icon-btn" onClick={toggleTheme} title={isDarkTheme ? 'Açık Tema' : 'Koyu Tema'}>
              {isDarkTheme ? <Sun size={13} /> : <Moon size={13} />}
            </button>
            <button className="icon-btn" onClick={logout} title="Çıkış Yap">
              <LogOut size={13} />
            </button>
          </div>
        )}
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
            {tags.map(tag => {
              const activeTagId = new URLSearchParams(location.search).get('tag');
              const isTagActive = activeTagId === String(tag.id);
              return (
                <NavLink
                  key={tag.id}
                  to={`/?tag=${tag.id}`}
                  className={() => `nav-item tag-item${isTagActive ? ' active' : ''}`}
                >
                  <span
                    className="tag-dot"
                    style={{
                      backgroundColor: isTagActive ? tag.color : 'var(--text-muted)',
                      boxShadow: isTagActive ? `0 0 0 2px var(--bg-primary), 0 0 0 4px ${tag.color}` : 'none',
                    }}
                  />
                  <span className="nav-label">{tag.name}</span>
                  {isTagActive && (
                    <span style={{
                      marginLeft: 'auto',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      backgroundColor: tag.color,
                      flexShrink: 0,
                    }} />
                  )}
                </NavLink>
              );
            })}
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

      <div className="sidebar-footer" style={{ padding: '0.5rem 0.75rem' }} />
    </aside>
  );
}
