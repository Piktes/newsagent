import { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { tagsApi, newsApi } from '../services/api';
import {
  Newspaper, Calendar, Star, Tags, Bell, EyeOff,
  BarChart, Users, FileText, Zap, LogOut, Sun, Moon, Gauge, Radio,
  MessageSquare, AlertTriangle, Wrench
} from 'lucide-react';

const NAV_ITEMS = [
  { path: '/son-dakika', icon: <Zap size={18} style={{ color: '#ef4444' }} />, label: 'Son Dakika', key: 'breaking' },
  { path: '/', icon: <Newspaper size={18} />, label: 'Haberler', key: 'news' },
  { path: '/today', icon: <Calendar size={18} />, label: 'Bugün Ne Oldu', key: 'today' },
  { path: '/favorites', icon: <Star size={18} />, label: 'Favoriler', key: 'favs' },
  { path: '/hidden', icon: <EyeOff size={18} />, label: 'Akıştan Çıkarılanlar', key: 'hidden' },
  { path: '/tags', icon: <Tags size={18} />, label: 'Etiketler', key: 'tags' },
  { path: '/sources', icon: <Radio size={18} />, label: 'Kaynaklar', key: 'sources' },
  { path: '/notifications', icon: <Bell size={18} />, label: 'Bildirimler', key: 'notifs' },
  { path: '/feedback', icon: <MessageSquare size={18} />, label: 'Sorun Bildir', key: 'feedback', userOnly: true },
];

const ADMIN_ITEMS = [
  { path: '/admin', icon: <BarChart size={18} />, label: 'Yönetim Paneli' },
  { path: '/admin/users', icon: <Users size={18} />, label: 'Kullanıcılar' },
  { path: '/admin/logs', icon: <FileText size={18} />, label: 'Tarama Logları' },
  { path: '/admin/quota', icon: <Gauge size={18} />, label: 'API Kotası' },
  { path: '/admin/feedback', icon: <Wrench size={18} />, label: 'Sistem İyileştirmeleri' },
  { path: '/admin/error-logs', icon: <AlertTriangle size={18} />, label: 'Hata Logları' },
];

export default function Sidebar({ collapsed, onToggle, isDarkTheme, toggleTheme }) {
  const { user, logout, isAdmin } = useAuth();
  const [tags, setTags] = useState([]);
  const [todayUnread, setTodayUnread] = useState(0);
  const [breakingUnread, setBreakingUnread] = useState(0);
  const location = useLocation();

  const refreshTags = () => tagsApi.list().then(r => setTags(r.data)).catch(() => {});

  useEffect(() => {
    refreshTags();

    const fetchCounts = async () => {
      try {
        const s = new Date(); s.setHours(0, 0, 0, 0);
        const e = new Date(); e.setHours(23, 59, 59, 999);
        const [todayRes, breakingRes] = await Promise.all([
          newsApi.count({ date_from: s.toISOString(), date_to: e.toISOString() }),
          // Badge: sadece bugünün okunmamış son dakika haberleri
          newsApi.count({ breaking_only: true, date_from: s.toISOString(), date_to: e.toISOString() }),
        ]);
        setTodayUnread(todayRes.data.total ?? 0);
        setBreakingUnread(breakingRes.data.unread ?? 0);
      } catch (e) {}
    };
    fetchCounts();
  }, [location.pathname]);

  useEffect(() => {
    window.addEventListener('tags-changed', refreshTags);
    return () => window.removeEventListener('tags-changed', refreshTags);
  }, []);


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
          {NAV_ITEMS.filter(item => !(item.userOnly && isAdmin)).map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.path === '/'}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''} ${item.key === 'breaking' && breakingUnread > 0 && !isActive ? 'nav-item-breaking-highlight' : ''}`}
              title={item.label}
            >
              <span className="nav-icon">{item.icon}</span>
              {!collapsed && (
                <span className="nav-label">
                  {item.label}
                  {item.key === 'today' && todayUnread > 0 && ` (${todayUnread})`}
                </span>
              )}
              {!collapsed && item.key === 'breaking' && breakingUnread > 0 && (
                <span className="breaking-nav-badge">{breakingUnread}</span>
              )}
              {collapsed && item.key === 'breaking' && breakingUnread > 0 && (
                <span className="breaking-nav-dot" />
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
                  <span className="nav-label">
                    {tag.name}
                    {tag.is_breaking && <Zap size={10} style={{ color: '#ef4444', marginLeft: 3, flexShrink: 0 }} />}
                  </span>
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
