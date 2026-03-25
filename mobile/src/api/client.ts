// API Client - Connexion au backend OhmGuard
import * as SecureStore from 'expo-secure-store';

// URL de l'API - directement configurée pour le preview
// En production, remplacer par l'URL du serveur déployé
const API_URL = 'https://alert-feed-live.preview.emergentagent.com/api';

// Log pour debug
console.log('[API] Using URL:', API_URL);

class ApiClient {
  private token: string | null = null;
  private baseUrl: string;

  constructor() {
    this.baseUrl = API_URL;
    console.log('[API] Client initialized with URL:', this.baseUrl);
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
    console.log('[API] Headers:', JSON.stringify(headers));

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      console.log('[API] Response status:', response.status);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Erreur réseau' }));
        console.log('[API] Error response:', JSON.stringify(error));
        throw new Error(error.detail || `Erreur ${response.status}`);
      }

      const data = await response.json();
      console.log('[API] Response data length:', Array.isArray(data) ? data.length : 'object');
      return data;
    } catch (err: any) {
      console.log('[API] Fetch error:', err.message);
      throw err;
    }
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
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } catch (err: any) {
      console.log('[API] Logout API call failed (best effort):', err.message);
    }
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
  async registerPushToken(pushToken: string, deviceType?: string) {
    try {
      return await this.request('/push-tokens', {
        method: 'POST',
        body: JSON.stringify({ token: pushToken, device_type: deviceType }),
      });
    } catch (err) {
      console.log('[API] Push token registration failed:', err);
    }
  }

  // Delete push token (on logout)
  async deletePushToken(pushToken: string) {
    try {
      return await this.request(`/push-tokens?token=${encodeURIComponent(pushToken)}`, {
        method: 'DELETE',
      });
    } catch (err) {
      console.log('[API] Push token deletion failed:', err);
    }
  }

  // Get notification settings for a token
  async getNotificationSettings(pushToken: string): Promise<{ registered: boolean; notifications_enabled: boolean } | null> {
    try {
      return await this.request<{ registered: boolean; notifications_enabled: boolean }>(
        `/push-tokens/settings?token=${encodeURIComponent(pushToken)}`
      );
    } catch (err) {
      console.log('[API] Get notification settings failed:', err);
      return null;
    }
  }

  // Enable or disable push notifications for a token
  async setNotificationsEnabled(pushToken: string, enabled: boolean): Promise<boolean> {
    try {
      await this.request('/push-tokens/settings', {
        method: 'PATCH',
        body: JSON.stringify({ token: pushToken, enabled }),
      });
      return true;
    } catch (err) {
      console.log('[API] Set notification settings failed:', err);
      return false;
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
