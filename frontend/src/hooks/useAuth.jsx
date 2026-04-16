import { createContext, useContext, useState, useEffect } from 'react';
import { authApi } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('haberajani_token');
    const savedUser = localStorage.getItem('haberajani_user');
    if (token && savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch {
        localStorage.removeItem('haberajani_token');
        localStorage.removeItem('haberajani_user');
      }
    }
    setLoading(false);
  }, []);

  const login = async (username, password) => {
    const res = await authApi.login(username, password);
    const { access_token, user: userData } = res.data;
    localStorage.setItem('haberajani_token', access_token);
    localStorage.setItem('haberajani_user', JSON.stringify(userData));
    setUser(userData);
    return userData;
  };

  const logout = () => {
    localStorage.removeItem('haberajani_token');
    localStorage.removeItem('haberajani_user');
    setUser(null);
  };

  const isAdmin = user?.role === 'super_admin';

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, isAdmin }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
