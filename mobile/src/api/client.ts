// API Client - Connexion au backend OhmGuard
import * as SecureStore from 'expo-secure-store';

const API_URL = 'https://app.ohmguard.fr/api';

class ApiClient {
  private token: string | null = null;
  private refreshToken: string | null = null;
  private baseUrl: string;
  private isRefreshing = false;
  private refreshQueue: Array<{ resolve: (token: string) => void; reject: (err: any) => void }> = [];

  constructor() {
    this.baseUrl = API_URL;
  }

  async setTokens(accessToken: string, refreshToken?: string) {
    this.token = accessToken;
    await SecureStore.setItemAsync('auth_token', accessToken);
    if (refreshToken) {
      this.refreshToken = refreshToken;
      await SecureStore.setItemAsync('refresh_token', refreshToken);
    }
  }

  async getToken(): Promise<string | null> {
    if (!this.token) {
      this.token = await SecureStore.getItemAsync('auth_token');
    }
    return this.token;
  }

  async getRefreshToken(): Promise<string | null> {
    if (!this.refreshToken) {
      this.refreshToken = await SecureStore.getItemAsync('refresh_token');
    }
    return this.refreshToken;
  }

  async clearTokens() {
    this.token = null;
    this.refreshToken = null;
    await SecureStore.deleteItemAsync('auth_token');
    await SecureStore.deleteItemAsync('refresh_token');
  }

  // Legacy compat
  async setToken(token: string) { await this.setTokens(token); }
  async clearToken() { await this.clearTokens(); }

  private async tryRefreshToken(): Promise<string | null> {
    const rt = await this.getRefreshToken();
    if (!rt) return null;

    // If already refreshing, wait for the result
    if (this.isRefreshing) {
      return new Promise((resolve, reject) => {
        this.refreshQueue.push({ resolve, reject });
      });
    }

    this.isRefreshing = true;

    try {
      const response = await fetch(`${this.baseUrl}/auth/refresh?refresh_token=${encodeURIComponent(rt)}`, {
        method: 'POST',
      });

      if (!response.ok) {
        throw new Error('Refresh failed');
      }

      const data = await response.json();
      const newAccessToken = data.access_token;
      const newRefreshToken = data.refresh_token;

      await this.setTokens(newAccessToken, newRefreshToken);

      // Resolve all queued requests
      this.refreshQueue.forEach(q => q.resolve(newAccessToken));
      this.refreshQueue = [];

      return newAccessToken;
    } catch (err) {
      // Refresh failed — clear everything
      this.refreshQueue.forEach(q => q.reject(err));
      this.refreshQueue = [];
      await this.clearTokens();
      return null;
    } finally {
      this.isRefreshing = false;
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retry = true
  ): Promise<T> {
    const token = await this.getToken();

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    };

    const url = `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Token expired — try refresh
      if (response.status === 401 && retry) {
        const newToken = await this.tryRefreshToken();
        if (newToken) {
          return this.request<T>(endpoint, options, false);
        }
        throw new Error('Session expirée, veuillez vous reconnecter');
      }

      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Erreur réseau' }));
        throw new Error(error.detail || `Erreur ${response.status}`);
      }

      return await response.json();
    } catch (err: any) {
      throw err;
    }
  }

  // Auth
  async login(email: string, password: string) {
    const response = await fetch(`${this.baseUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Identifiants incorrects' }));
      throw new Error(error.detail || 'Erreur de connexion');
    }

    const data = await response.json();
    await this.setTokens(data.access_token, data.refresh_token);
    return data;
  }

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' }, false);
    } catch {
      // Best effort
    }
    await this.clearTokens();
  }

  async changePassword(currentPassword: string, newPassword: string) {
    return this.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    });
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  // Alerts (Events de type FALL)
  async getAlerts(status?: string) {
    const params = new URLSearchParams();
    params.append('event_type', 'FALL');
    if (status) params.append('status', status);
    params.append('limit', '50');
    return this.request<any[]>(`/events?${params.toString()}`);
  }

  async getAlert(id: string) {
    return this.request<any>(`/events/${id}`);
  }

  async acknowledgeAlert(id: string) {
    return this.request(`/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'ACK' }),
    });
  }

  async updateEvent(id: string, payload: { status: string; comment?: string }) {
    return this.request(`/events/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  // Push tokens
  async registerPushToken(pushToken: string, deviceType?: string) {
    try {
      return await this.request('/push-tokens', {
        method: 'POST',
        body: JSON.stringify({ token: pushToken, device_type: deviceType }),
      });
    } catch {
      // Silent — push registration is best-effort
    }
  }

  async deletePushToken(pushToken: string) {
    try {
      return await this.request(`/push-tokens?token=${encodeURIComponent(pushToken)}`, {
        method: 'DELETE',
      }, false);
    } catch {
      // Silent
    }
  }

  async getNotificationSettings(pushToken: string): Promise<{ registered: boolean; notifications_enabled: boolean } | null> {
    try {
      return await this.request<{ registered: boolean; notifications_enabled: boolean }>(
        `/push-tokens/settings?token=${encodeURIComponent(pushToken)}`
      );
    } catch {
      return null;
    }
  }

  async setNotificationsEnabled(pushToken: string, enabled: boolean): Promise<boolean> {
    try {
      await this.request('/push-tokens/settings', {
        method: 'PATCH',
        body: JSON.stringify({ token: pushToken, enabled }),
      });
      return true;
    } catch {
      return false;
    }
  }

  getBaseUrl() {
    return this.baseUrl.replace('/api', '');
  }
}

export const apiClient = new ApiClient();
export default apiClient;
