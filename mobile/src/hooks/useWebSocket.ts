// Hook WebSocket pour alertes temps réel
import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import apiClient from '../api/client';
import type { Alert } from '../types';

export function useWebSocket(onNewAlert: (alert: Alert) => void) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(async () => {
    const token = await SecureStore.getItemAsync('auth_token');
    if (!token) {
      console.log('[WS] No auth token, skipping connection');
      return;
    }

    if (socketRef.current?.connected) {
      console.log('[WS] Already connected');
      return;
    }

    // Get WebSocket URL from API client
    const wsUrl = apiClient.getBaseUrl();
    console.log('[WS] Connecting to:', wsUrl);

    socketRef.current = io(wsUrl, {
      path: '/api/socket.io',
      transports: ['polling', 'websocket'],
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current.on('connect', () => {
      console.log('[WS] Connected!');
      setConnected(true);
      // Rejoindre la room tenant (même protocole que le frontend web)
      socketRef.current?.emit('join_tenant', { token });
    });

    socketRef.current.on('joined', (data: any) => {
      console.log('[WS] Joined rooms:', data.rooms);
    });

    socketRef.current.on('disconnect', (reason) => {
      console.log('[WS] Disconnected:', reason);
      setConnected(false);
    });

    socketRef.current.on('connect_error', (error) => {
      console.log('[WS] Connection error:', error.message);
      setConnected(false);
    });

    // Listen for new events (falls)
    socketRef.current.on('new_event', (data: any) => {
      console.log('[WS] new_event received:', data);
      if (data.event?.type === 'FALL') {
        const alert = normalizeAlert(data.event);
        onNewAlert(alert);
      }
    });

    socketRef.current.on('new_radar_event', (data: any) => {
      console.log('[WS] new_radar_event received:', data);
      if (data.event?.type === 'FALL') {
        const alert = normalizeAlert(data.event);
        onNewAlert(alert);
      }
    });

    socketRef.current.on('radar_event', (data: any) => {
      console.log('[WS] radar_event received:', data);
      // Handle presence events that might be falls
      if (data.type === 'FALL' || data.event_type === 'FALL') {
        const alert = normalizeAlert(data);
        onNewAlert(alert);
      }
    });

  }, [onNewAlert]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      console.log('[WS] Disconnecting...');
      socketRef.current.disconnect();
      socketRef.current = null;
      setConnected(false);
    }
  }, []);

  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  return { connected, reconnect: connect };
}

// Normalize alert data from various WebSocket event formats
function normalizeAlert(data: any): Alert {
  return {
    id: data.id || data.event_id || `temp-${Date.now()}`,
    type: data.type || data.event_type || 'FALL',
    status: normalizeStatus(data.status || 'NEW'),
    timestamp: data.timestamp || data.occurred_at || new Date().toISOString(),
    sensor_id: data.sensor_id || data.radar_id || '',
    radar_name: data.radar_name || data.sensor_name || '',
    location_path: data.location_path || buildLocationPath(data),
    location: data.location,
    acknowledged_at: data.acknowledged_at,
    acknowledged_by: data.acknowledged_by,
  };
}

// Build location path from location object
function buildLocationPath(data: any): string {
  const parts = [];
  if (data.client_name) parts.push(data.client_name);
  if (data.building_name) parts.push(data.building_name);
  if (data.floor_name) parts.push(data.floor_name);
  if (data.room_name) parts.push(data.room_name);
  if (data.location?.client_name) parts.push(data.location.client_name);
  if (data.location?.building_name) parts.push(data.location.building_name);
  if (data.location?.floor_name) parts.push(data.location.floor_name);
  if (data.location?.room_name) parts.push(data.location.room_name);
  return parts.join(' > ') || 'Localisation inconnue';
}

// Normalize status (backend uses ACK, we display as ACKNOWLEDGED)
function normalizeStatus(status: string): 'NEW' | 'ACKNOWLEDGED' | 'RESOLVED' {
  if (status === 'ACK' || status === 'ACKNOWLEDGED') return 'ACKNOWLEDGED';
  if (status === 'RESOLVED') return 'RESOLVED';
  return 'NEW';
}
