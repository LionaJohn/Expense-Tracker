import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach Token authentication
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Token ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor to handle unauthenticated 401s
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // If unauthorized, clear invalid token
      const isAuthEndpoint = error.config.url.includes('/api/auth/');
      if (!isAuthEndpoint) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.dispatchEvent(new Event('auth-expired'));
      }
    }
    return Promise.reject(error);
  }
);

export const authAPI = {
  login: async (username, password) => {
    const response = await api.post('/api/auth/login/', { username, password });
    return response.data;
  },
  demoLogin: async () => {
    const response = await api.post('/api/auth/demo/');
    return response.data;
  },
  register: async (username, email, password) => {
    const response = await api.post('/api/auth/register/', { username, email, password });
    return response.data;
  },
  logout: async () => {
    try {
      await api.post('/api/auth/logout/');
    } catch {
      // Ignore errors on logout
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  },
  getUser: async () => {
    const response = await api.get('/api/auth/user/');
    return response.data;
  },
};

export const expenseAPI = {
  list: async (params = {}) => {
    const response = await api.get('/api/expenses/', { params });
    return response.data;
  },
  create: async (data) => {
    const response = await api.post('/api/expenses/', data);
    return response.data;
  },
  update: async (id, data) => {
    const response = await api.put(`/api/expenses/${id}/`, data);
    return response.data;
  },
  delete: async (id) => {
    const response = await api.delete(`/api/expenses/${id}/`);
    return response.data;
  },
  getMonthlyTotal: async (params = {}) => {
    const response = await api.get('/api/expenses/monthly_total/', { params });
    return response.data;
  },
  getSummary: async () => {
    const response = await api.get('/api/expenses/summary/');
    return response.data;
  },
};

export default api;
