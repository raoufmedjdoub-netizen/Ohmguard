import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API_BASE = `${BACKEND_URL}/api`;

// Create axios instance
const api = axios.create({
  baseURL: API_BASE,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - handle token refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      const refreshToken = localStorage.getItem('refresh_token');
      if (refreshToken) {
        try {
          const response = await axios.post(`${API_BASE}/auth/refresh`, null, {
            params: { refresh_token: refreshToken }
          });
          
          const { access_token, refresh_token: newRefreshToken } = response.data;
          localStorage.setItem('access_token', access_token);
          localStorage.setItem('refresh_token', newRefreshToken);
          
          originalRequest.headers.Authorization = `Bearer ${access_token}`;
          return api(originalRequest);
        } catch (refreshError) {
          localStorage.removeItem('access_token');
          localStorage.removeItem('refresh_token');
          window.location.href = '/login';
          return Promise.reject(refreshError);
        }
      }
    }
    
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data),
  refresh: (refreshToken) => api.post('/auth/refresh', null, { params: { refresh_token: refreshToken } }),
  me: () => api.get('/auth/me')
};

// Tenants API
export const tenantsAPI = {
  list: () => api.get('/tenants'),
  get: (id) => api.get(`/tenants/${id}`),
  create: (data) => api.post('/tenants', data)
};

// Sites API
export const sitesAPI = {
  list: (tenantId) => api.get('/sites', { params: { tenant_id: tenantId } }),
  get: (id) => api.get(`/sites/${id}`),
  create: (data) => api.post('/sites', data)
};

// Zones API
export const zonesAPI = {
  list: (siteId) => api.get('/zones', { params: { site_id: siteId } }),
  create: (data) => api.post('/zones', data)
};

// Sensors API
export const sensorsAPI = {
  list: (params) => api.get('/sensors', { params }),
  get: (id) => api.get(`/sensors/${id}`),
  create: (data) => api.post('/sensors', data),
  update: (id, data) => api.patch(`/sensors/${id}`, data),
  rotateKey: (id) => api.post(`/sensors/${id}/rotate-key`),
  delete: (id) => api.delete(`/sensors/${id}`),
  assign: (id, data) => api.post(`/radars/${id}/assign`, data),
  unassign: (id) => api.post(`/radars/${id}/unassign`)
};

// Events API
export const eventsAPI = {
  list: (params) => api.get('/events', { params }),
  get: (id) => api.get(`/events/${id}`),
  getDetail: (id) => api.get(`/events/${id}/detail`),
  update: (id, data) => api.patch(`/events/${id}`, data),
  getComments: (id) => api.get(`/events/${id}/comments`),
  count: (params) => api.get('/events/count', { params }),
  createRadarEvent: (data) => api.post('/events/radar', data)
};

// AI Sensors API
export const aiSensorsAPI = {
  list: (params) => api.get('/ai-sensors', { params }),
  get: (id) => api.get(`/ai-sensors/${id}`),
  create: (data) => api.post('/ai-sensors', data),
  update: (id, data) => api.patch(`/ai-sensors/${id}`, data),
  delete: (id) => api.delete(`/ai-sensors/${id}`)
};

// AI Events API
export const aiEventsAPI = {
  list: (params) => api.get('/ai-events', { params }),
  get: (id) => api.get(`/ai-events/${id}`),
  count: (params) => api.get('/ai-events/count', { params }),
  updateStatus: (id, status) => api.patch(`/ai-events/${id}/status`, null, { params: { status } }),
  clear: () => api.delete('/ai-events/clear')
};

// Alert Rules API
export const rulesAPI = {
  list: () => api.get('/rules'),
  create: (data) => api.post('/rules', data),
  delete: (id) => api.delete(`/rules/${id}`)
};

// Users API
export const usersAPI = {
  list: () => api.get('/users'),
  update: (id, data) => api.patch(`/users/${id}`, data),
  assignable: () => api.get('/users/assignable')
};

// Notifications API
export const notificationsAPI = {
  list: (params) => api.get('/notifications', { params })
};

// Audit Logs API
export const auditAPI = {
  list: (params) => api.get('/audit-logs', { params })
};

// Stats API
export const statsAPI = {
  overview: () => api.get('/stats/overview')
};

// Health API
export const healthAPI = {
  check: () => api.get('/health')
};

// Simulator API
export const simulatorAPI = {
  createEvent: (deviceId, eventType, severity, confidence) => 
    api.post('/simulator/event', null, {
      params: { device_id: deviceId, event_type: eventType, severity, confidence }
    })
};

// Device Configuration API
export const deviceConfigAPI = {
  // Configuration
  getLatest: (deviceId) => api.get(`/devices/${deviceId}/config/latest`),
  getVersions: (deviceId, limit = 10) => api.get(`/devices/${deviceId}/config/versions`, { params: { limit } }),
  sendConfig: (deviceId, config, mqttOptions = {}) => api.post(`/devices/${deviceId}/config/send`, { config, mqttOptions }),
  validateConfig: (deviceId, config) => api.post(`/devices/${deviceId}/config/validate`, { config }),
  rollback: (deviceId, versionNumber) => api.post(`/devices/${deviceId}/config/rollback/${versionNumber}`),
  retry: (deviceId, versionId) => api.post(`/devices/${deviceId}/config/retry/${versionId}`),
  getSchema: (deviceId) => api.get(`/devices/${deviceId}/config/schema`),
  
  // Commands
  sendCommand: (deviceId, commandType, params = null) => api.post(`/devices/${deviceId}/command`, { command_type: commandType, params }),
  getCommandHistory: (deviceId, limit = 20) => api.get(`/devices/${deviceId}/commands/history`, { params: { limit } }),
  
  // State
  getState: (deviceId) => api.get(`/devices/${deviceId}/state`),
  
  // Enums and metadata
  getCommandTypes: () => api.get('/devices/command-types'),
  getConfigEnums: () => api.get('/devices/config-enums'),
  
  // Templates
  getTemplates: () => api.get('/config/templates'),
  createTemplate: (name, config, description = null) => api.post('/config/templates/create', { name, config, description, isSystem: false }),
  getTemplate: (templateId) => api.get(`/config/templates/${templateId}`),
  deleteTemplate: (templateId) => api.delete(`/config/templates/${templateId}`)
};

// Command types for reference
export const COMMAND_TYPES = {
  UPLOAD_APP_LOGS: 1,
  UPLOAD_DEV_LOGS: 2,
  REBOOT_DEVICE: 3,
  CANCEL_ALARM: 4,
  REBOOT_UPLOAD_LOG: 6,
  CANCEL_FALL: 7,
  UPDATE_BASE_URL: 8,
  DOWNLOAD_FIRMWARE: 10,
  UPDATE_WIFI: 16
};

export default api;
