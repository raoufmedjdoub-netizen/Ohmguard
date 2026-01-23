// Types pour l'application OhmGuard Alerts

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Alert {
  id: string;
  type: 'FALL' | 'PRE_FALL' | string;
  status: 'NEW' | 'ACK' | 'ACKNOWLEDGED' | 'RESOLVED' | string;
  timestamp: string;
  sensor_id: string;
  radar_name: string;
  location_path: string;
  location?: {
    client_name?: string;
    building_name?: string;
    floor_name?: string;
    room_name?: string;
  };
  acknowledged_at?: string;
  acknowledged_by?: string;
}

export interface ApiError {
  detail: string;
}
