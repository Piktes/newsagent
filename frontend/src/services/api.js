import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
});

// Add JWT token to all requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('haberajani_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle 401 responses
api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only redirect if it's a 401 and we are NOT on the login page OR it wasn't a login request
    if (
      error.response?.status === 401 && 
      !window.location.pathname.includes('/login') && 
      !error.config.url.includes('/auth/login')
    ) {
      localStorage.removeItem('haberajani_token');
      localStorage.removeItem('haberajani_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// ─── Auth ─────────────────────────────────────────────
export const authApi = {
  login: (username, password) =>
    api.post('/auth/login', { username, password }),
  getMe: () => api.get('/auth/me'),
  getUsers: () => api.get('/auth/users'),
  createUser: (data) => api.post('/auth/users', data),
  updateUser: (id, data) => api.put(`/auth/users/${id}`, data),
  deleteUser: (id) => api.delete(`/auth/users/${id}`),
};

// ─── Tags ─────────────────────────────────────────────
export const tagsApi = {
  list: () => api.get('/tags/'),
  create: (data) => api.post('/tags/', data),
  update: (id, data) => api.put(`/tags/${id}`, data),
  delete: (id) => api.delete(`/tags/${id}`),
  scan: (id) => api.post(`/tags/${id}/scan`),
  scanAll: () => api.post(`/tags/scan-all`),
};

// ─── Sources ──────────────────────────────────────────
export const sourcesApi = {
  list: () => api.get('/sources/'),
  create: (data) => api.post('/sources/', data),
  update: (id, data) => api.put(`/sources/${id}`, data),
  delete: (id) => api.delete(`/sources/${id}`),
  getQuotas: () => api.get('/sources/quotas'),
};

// ─── News ─────────────────────────────────────────────
export const newsApi = {
  list: (params) => api.get('/news/', { params }),
  get: (id) => api.get(`/news/${id}`),
  count: (params) => api.get('/news/count', { params }),
  toggleRead: (id) => api.put(`/news/${id}/read`),
  toggleFavorite: (id) => api.put(`/news/${id}/favorite`),
  updateNote: (id, note) => api.put(`/news/${id}/note`, { note }),
  exportCsv: (tagId) => api.get('/news/export/csv', { params: { tag_id: tagId }, responseType: 'blob' }),
};

// ─── Notifications ────────────────────────────────────
export const notificationsApi = {
  getPrefs: () => api.get('/notifications/preferences'),
  savePref: (data) => api.post('/notifications/preferences', data),
  deletePref: (id) => api.delete(`/notifications/preferences/${id}`),
};

// ─── Admin ────────────────────────────────────────────
export const adminApi = {
  getStats: () => api.get('/admin/stats'),
  getSmtp: () => api.get('/admin/smtp'),
  updateSmtp: (data) => api.put('/admin/smtp', data),
  getScanLogs: (limit) => api.get('/admin/scan-logs', { params: { limit } }),
  clearScanLogs: () => api.delete('/admin/scan-logs'),
};

export default api;
