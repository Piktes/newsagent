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
  changePassword: (current_password, new_password) =>
    api.put('/auth/change-password', { current_password, new_password }),
  getUsers: () => api.get('/auth/users'),
  createUser: (data) => api.post('/auth/users', data),
  updateUser: (id, data) => api.put(`/auth/users/${id}`, data),
  deleteUser: (id) => api.delete(`/auth/users/${id}`),
  resetUserPassword: (id) => api.post(`/auth/users/${id}/reset-password`),
};

// ─── Tags ─────────────────────────────────────────────
export const tagsApi = {
  list: () => api.get('/tags/'),
  create: (data) => api.post('/tags/', data),
  update: (id, data) => api.put(`/tags/${id}`, data),
  delete: (id) => api.delete(`/tags/${id}`),
  scan: (id, daysBack = 30, sourceTypes = null) => {
    const params = new URLSearchParams({ days_back: daysBack });
    if (sourceTypes && sourceTypes.length) sourceTypes.forEach(t => params.append('source_types', t));
    return api.post(`/tags/${id}/scan?${params}`);
  },
  scanAll: (daysBack = 30, sourceTypes = null) => {
    const params = new URLSearchParams({ days_back: daysBack });
    if (sourceTypes && sourceTypes.length) sourceTypes.forEach(t => params.append('source_types', t));
    return api.post(`/tags/scan-all?${params}`);
  },
};

// ─── Sources ──────────────────────────────────────────
export const sourcesApi = {
  list: () => api.get('/sources/'),
  create: (data) => api.post('/sources/', data),
  update: (id, data) => api.put(`/sources/${id}`, data),
  delete: (id) => api.delete(`/sources/${id}`),
  getQuotas: () => api.get('/sources/quotas'),
  verifyTwitter: (handle) => api.get('/sources/twitter/verify', { params: { handle } }),
  verifyYoutube: (url)    => api.get('/sources/youtube/verify', { params: { url } }),
  getTwitterTrends: (woeid = 23424969) => api.get('/sources/twitter/trends', { params: { woeid } }),
};

// ─── News ─────────────────────────────────────────────
export const newsApi = {
  list: (params) => {
    // source_types is an array — serialize as repeated query params
    const { source_types, ...rest } = params || {};
    const searchParams = new URLSearchParams();
    Object.entries(rest).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') searchParams.append(k, v); });
    if (source_types?.length) source_types.forEach(t => searchParams.append('source_types', t));
    return api.get('/news/?' + searchParams.toString());
  },
  listHidden: (params) => api.get('/news/', { params: { ...params, show_hidden: true, page_size: 100 } }),
  get: (id) => api.get(`/news/${id}`),
  count: (params) => api.get('/news/count', { params }),
  latestId: (params) => api.get('/news/latest-id', { params }),
  toggleRead: (id) => api.put(`/news/${id}/read`),
  bulkMarkRead: (params) => api.put('/news/bulk/mark-read', null, { params }),
  toggleFavorite: (id) => api.put(`/news/${id}/favorite`),
  toggleHide: (id) => api.put(`/news/${id}/hide`),
  updateNote: (id, note) => api.put(`/news/${id}/note`, { note }),
  exportCsv: (tagId) => api.get('/news/export/csv', { params: { tag_id: tagId }, responseType: 'blob' }),
  exportPdf: (params) => {
    // tag_ids is an array — serialize as repeated query params
    const { tag_ids, ...rest } = params || {};
    const searchParams = new URLSearchParams();
    Object.entries(rest).forEach(([k, v]) => { if (v !== undefined && v !== null && v !== '') searchParams.append(k, v); });
    if (tag_ids?.length) tag_ids.forEach(id => searchParams.append('tag_ids', id));
    return api.get('/news/export/pdf?' + searchParams.toString(), { responseType: 'blob' });
  },
  bulkDeleteBySourceType: (sourceType) =>
    api.delete('/news/bulk/by-source-type', { params: { source_type: sourceType } }),
};

// ─── Notifications ────────────────────────────────────
export const notificationsApi = {
  getPrefs: () => api.get('/notifications/preferences'),
  savePref: (data) => api.post('/notifications/preferences', data),
  deletePref: (id) => api.delete(`/notifications/preferences/${id}`),
};

// ─── Favorite Lists ───────────────────────────────────────
export const listsApi = {
  list: () => api.get('/lists/'),
  create: (data) => api.post('/lists/', data),
  rename: (id, data) => api.put(`/lists/${id}`, data),
  delete: (id) => api.delete(`/lists/${id}`),
  getItems: (id, params) => api.get(`/lists/${id}/items`, { params }),
  addItem: (listId, newsId) => api.post(`/lists/${listId}/items/${newsId}`),
  removeItem: (listId, newsId) => api.delete(`/lists/${listId}/items/${newsId}`),
  getListsForNews: (newsId) => api.get(`/lists/for-news/${newsId}`),
};

// ─── Admin ────────────────────────────────────────────
export const adminApi = {
  getStats: () => api.get('/admin/stats'),
  getSmtp: () => api.get('/admin/smtp'),
  updateSmtp: (data) => api.put('/admin/smtp', data),
  getScanLogs: (limit) => api.get('/admin/scan-logs', { params: { limit } }),
  clearScanLogs: () => api.delete('/admin/scan-logs'),
  getErQuota: () => api.get('/admin/er-quota'),
  getErLogs: (page, page_size) => api.get('/admin/er-logs', { params: { page, page_size } }),
  clearErLogs: () => api.delete('/admin/er-logs'),
  getXUsage: (days = 7) => api.get('/admin/x-usage', { params: { days } }),
  getOverview: () => api.get('/admin/overview'),
  getErrorLogs: (level, limit = 100) => api.get('/admin/error-logs', { params: { level, limit } }),
  clearErrorLogs: () => api.delete('/admin/error-logs'),
};

// ─── Feedback ─────────────────────────────────────────
export const feedbackApi = {
  create: (formData) => api.post('/feedback/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),
  myTickets: () => api.get('/feedback/'),
  allTickets: (status) => api.get('/feedback/all', { params: status ? { status } : {} }),
  answerTicket: (id, data) => api.put(`/feedback/${id}/answer`, data),
  closeTicket: (id, note) => api.put(`/feedback/${id}/close`, { note: note || null }),
  deleteTicket: (id) => api.delete(`/feedback/${id}`),
  attachmentUrl: (filename) => `${API_BASE}/feedback/attachment/${filename}`,
};

export const globalSearchApi = {
  // Tag CRUD
  listTags:     ()           => api.get('/global/tags'),
  createTag:    (data)       => api.post('/global/tags', data),
  deleteTag:    (id)         => api.delete(`/global/tags/${id}`),
  analyzeTag:   (id, days)   => api.post(`/global/tags/${id}/analyze`, null, { params: { date_range_days: days } }),
  tagLatest:    (id)         => api.get(`/global/tags/${id}/latest`),
  // Legacy search endpoints (kept for now)
  search:        (data)      => api.post('/global/search', data),
  listSearches:  (page = 1)  => api.get('/global/searches', { params: { page } }),
  getSearch:     (id)        => api.get(`/global/searches/${id}`),
  refreshSearch: (id)        => api.post(`/global/searches/${id}/refresh`),
  deleteSearch:  (id)        => api.delete(`/global/searches/${id}`),
};

export default api;
