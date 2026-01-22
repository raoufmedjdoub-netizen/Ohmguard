// Hook WebSocket pour alertes temps réel
import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import * as SecureStore from 'expo-secure-store';
import type { Alert } from '../types';

const WS_URL = 'https://app.ohmguard.fr';

export function useWebSocket(onNewAlert: (alert: Alert) => void) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);

  const connect = useCallback(async () => {
    const token = await SecureStore.getItemAsync('auth_token');
    if (!token) return;

    if (socketRef.current?.connected) return;

    socketRef.current = io(WS_URL, {
      path: '/socket.io/',
      transports: ['websocket'],
      auth: { token },
    });

    socketRef.current.on('connect', () => {
      console.log('WebSocket connected');
      setConnected(true);
      socketRef.current?.emit('subscribe', { channel: 'alerts' });
    });

    socketRef.current.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setConnected(false);
    });

    // Écouter les nouvelles alertes (chutes)
    socketRef.current.on('new_event', (data: any) => {
      if (data.event?.type === 'FALL') {
        onNewAlert(data.event as Alert);
      }
    });

    socketRef.current.on('new_radar_event', (data: any) => {
      if (data.event?.type === 'FALL') {
        onNewAlert(data.event as Alert);
      }
    });

    socketRef.current.on('event_updated', (data: any) => {
      // Géré par le composant parent
    });

  }, [onNewAlert]);

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
