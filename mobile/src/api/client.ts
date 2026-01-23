// API Client - Connexion au backend OhmGuard
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

// URL de l'API - configurable via app.json extra ou par défaut
const getApiUrl = () => {
  // En développement, on peut utiliser l'URL de preview
  // En production, ce sera l'URL du serveur déployé
  const configuredUrl = Constants.expoConfig?.extra?.apiUrl;
  if (configuredUrl) return configuredUrl;
  
  // Default pour le développement - à changer pour la production
  return 'https://live-monitor-2.preview.emergentagent.com/api';
};

const API_URL = getApiUrl();

// Log pour debug
console.log('[API] Using URL:', API_URL);

class ApiClient {
  private token: string | null = null;
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_URL;
  }

  async setToken(token: string) {
    this.token = token;
    await SecureStore.setItemAsync('auth_token', token);
  }

  async getToken(): Promise<string | null> {
    if (!this.token) {
      this.token = await SecureStore.getItemAsync('auth_token');
    }
    return this.token;
  }

  async clearToken() {
    this.token = null;
    await SecureStore.deleteItemAsync('auth_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.getToken();
    
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const url = `${this.baseUrl}${endpoint}`;
    console.log('[API] Request:', options.method || 'GET', url);

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Erreur réseau' }));
      console.log('[API] Error:', response.status, error);
      throw new Error(error.detail || `Erreur ${response.status}`);
    }

    const data = await response.json();
    return data;
  }

  // Auth
  async login(email: string, password: string) {
    console.log('[API] Login attempt for:', email);
    
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Identifiants incorrects' }));
      console.log('[API] Login error:', error);
      throw new Error(error.detail || 'Erreur de connexion');
    }

    const data = await response.json();
    console.log('[API] Login success, token received');
    await this.setToken(data.access_token);
    return data;
  }

  async logout() {
    console.log('[API] Logout');
    await this.clearToken();
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  // Alerts (Events de type FALL)
  async getAlerts(status?: string) {
    const params = new URLSearchParams();
    params.append('event_type', 'FALL'); // Backend uses event_type not type
    if (status) params.append('status', status);
    params.append('limit', '50');
    
    const data = await this.request<any[]>(`/events?${params.toString()}`);
    return data;
  }

  async getAlert(id: string) {
    return this.request<any>(`/events/${id}`);
  }

  async acknowledgeAlert(id: string) {
    return this.request(`/events/${id}/acknowledge`, {
      method: 'POST',
    });
  }

  // Register push token
  async registerPushToken(pushToken: string) {
    try {
      return await this.request('/auth/push-token', {
        method: 'POST',
        body: JSON.stringify({ push_token: pushToken }),
      });
    } catch (err) {
      console.log('[API] Push token registration failed (endpoint may not exist):', err);
      // Silently fail if endpoint doesn't exist
    }
  }

  // Get base URL (for WebSocket)
  getBaseUrl() {
    // Remove /api suffix for WebSocket URL
    return this.baseUrl.replace('/api', '');
  }
}

export const apiClient = new ApiClient();
export default apiClient;
