// Hook WebSocket pour alertes temps réel
import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import apiClient from '../api/client';
import type { Alert } from '../types';

const recentEventIds = new Set<string>();

function markProcessed(id: string): boolean {
  if (recentEventIds.has(id)) return false;
  recentEventIds.add(id);
  setTimeout(() => recentEventIds.delete(id), 30000);
  return true;
}

export function useWebSocket(onNewAlert: (alert: Alert) => void) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  // Use ref for callback to avoid reconnecting when callback changes
  const onNewAlertRef = useRef(onNewAlert);
  onNewAlertRef.current = onNewAlert;

  const connect = useCallback(async () => {
    const token = await SecureStore.getItemAsync('auth_token');
    if (!token) return;

    if (socketRef.current?.connected) return;

    const wsUrl = apiClient.getBaseUrl();

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
      setConnected(true);
      socketRef.current?.emit('join_tenant', { token });
    });

    socketRef.current.on('disconnect', () => setConnected(false));
    socketRef.current.on('connect_error', () => setConnected(false));

    const handleFallEvent = (data: any) => {
      const event = data?.event || data;
      if (!event) return;

      const eventType = event.type || event.event_type;
      if (eventType !== 'FALL') return;

      const eventId = event.id || event.event_id;
      if (!eventId || !markProcessed(eventId)) return;

      onNewAlertRef.current(normalizeAlert(event));
    };

    socketRef.current.on('new_event', handleFallEvent);
    socketRef.current.on('new_radar_event', handleFallEvent);
    socketRef.current.on('radar_event', handleFallEvent);

  }, []); // No deps — callback is via ref

  const disconnect = useCallback(() => {
    if (socketRef.current) {
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

function buildLocationPath(data: any): string {
  const parts: string[] = [];
  const loc = data.location || {};
  const clientName = loc.client_name || data.client_name;
  const buildingName = loc.building_name || data.building_name;
  const floorName = loc.floor_name || data.floor_name;
  const roomName = loc.room_name || data.room_name;
  if (clientName) parts.push(clientName);
  if (buildingName) parts.push(buildingName);
  if (floorName) parts.push(floorName);
  if (roomName) parts.push(roomName);
  return parts.join(' > ') || 'Localisation inconnue';
}

function normalizeStatus(status: string): 'NEW' | 'ACKNOWLEDGED' | 'RESOLVED' {
  if (status === 'ACK' || status === 'ACKNOWLEDGED') return 'ACKNOWLEDGED';
  if (status === 'RESOLVED') return 'RESOLVED';
  return 'NEW';
}
