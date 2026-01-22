// API Client - Connexion au backend OhmGuard
import * as SecureStore from 'expo-secure-store';

const API_URL = 'https://app.ohmguard.fr/api';

class ApiClient {
  private token: string | null = null;

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

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Erreur réseau' }));
      throw new Error(error.detail || `Erreur ${response.status}`);
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string) {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);

    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData.toString(),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Identifiants incorrects' }));
      throw new Error(error.detail || 'Erreur de connexion');
    }

    const data = await response.json();
    await this.setToken(data.access_token);
    return data;
  }

  async logout() {
    await this.clearToken();
  }

  async getCurrentUser() {
    return this.request('/auth/me');
  }

  // Alerts (Events de type FALL)
  async getAlerts(status?: string) {
    const params = new URLSearchParams();
    params.append('type', 'FALL');
    if (status) params.append('status', status);
    params.append('limit', '50');
    
    return this.request<any[]>(`/events?${params.toString()}`);
  }

  async getAlert(id: string) {
    return this.request<any>(`/events/${id}`);
  }

  async acknowledgeAlert(id: string) {
    return this.request(`/events/${id}/acknowledge`, {
      method: 'POST',
    });
  }
}

export const apiClient = new ApiClient();
export default apiClient;
