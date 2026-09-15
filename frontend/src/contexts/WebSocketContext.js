/**
 * WebSocketContext - Real-time communication using Socket.IO
 * 
 * Provides real-time event streaming from the backend via Socket.IO.
 * Socket.IO automatically handles reconnection and fallback to polling
 * if WebSocket connection fails.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const WebSocketContext = createContext(null);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export function WebSocketProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [connected, setConnected] = useState(false);
  const [rooms, setRooms] = useState([]);
  const [lastEvent, setLastEvent] = useState(null);
  const socketRef = useRef(null);
  const listenersRef = useRef(new Map());
  const reconnectAttemptRef = useRef(0);
  // Radars dont les positions en direct sont affichées : sensorId -> nombre d'abonnés
  const watchedSensorsRef = useRef(new Map());
  const joinedRef = useRef(false);

  // Notify all listeners of a message
  const notifyListeners = useCallback((data) => {
    setLastEvent(data);
    listenersRef.current.forEach((callback) => {
      callback(data);
    });
  }, []);

  // Initialize Socket.IO connection
  useEffect(() => {
    if (!isAuthenticated || !user?.tenant_id) {
      return;
    }

    const token = localStorage.getItem('access_token');
    if (!token) {
      console.log('No token available for Socket.IO connection');
      return;
    }

    // Create Socket.IO connection via /api path (routed through Kubernetes ingress)
    const socket = io(BACKEND_URL, {
      path: '/api/socket.io',
      transports: ['polling', 'websocket'], // Start with polling (more reliable in preview)
      auth: {
        token: token
      },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      forceNew: true
    });

    socketRef.current = socket;

    // Connection events
    socket.on('connect', () => {
      console.log('Socket.IO connected:', socket.id);
      console.log('Socket.IO transport:', socket.io.engine.transport.name);
      setConnected(true);
      reconnectAttemptRef.current = 0;

      // Join rooms after connection (the server derives the tenant from the token)
      socket.emit('join_tenant', { token });
    });

    // Log transport upgrades
    socket.io.engine.on('upgrade', (transport) => {
      console.log('Socket.IO upgraded to:', transport.name);
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket.IO disconnected:', reason);
      joinedRef.current = false;
      setConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Socket.IO connection error:', error.message);
      reconnectAttemptRef.current++;
      setConnected(false);
    });

    // Confirmation of joining rooms
    socket.on('joined', (data) => {
      console.log('Joined rooms:', data.rooms, 'role:', data.role);
      setRooms(data.rooms || []);
      joinedRef.current = true;
      // (Ré)abonnement aux radars suivis : les rooms sont perdues à chaque reconnexion
      watchedSensorsRef.current.forEach((_, sensorId) => {
        socket.emit('watch_sensor', { sensor_id: sensorId });
      });
    });

    // Live positions of people tracked by a watched radar
    socket.on('target_positions', (data) => {
      notifyListeners({
        type: 'target_positions',
        ...data
      });
    });

    // Listen for new events
    socket.on('new_event', (data) => {
      console.log('New event received:', data);
      notifyListeners({
        type: 'new_radar_event',
        event: data.event || data
      });
    });

    // Listen for presence updates
    socket.on('presence_update', (data) => {
      console.log('Presence update:', data);
      notifyListeners({
        type: 'presence_update',
        ...data
      });
    });

    // Listen for sensor status changes
    socket.on('sensor_status', (data) => {
      console.log('Sensor status:', data);
      notifyListeners({
        type: 'sensor_status',
        ...data
      });
    });

    // Listen for new sensor registrations
    socket.on('sensor_registered', (data) => {
      console.log('Sensor registered:', data);
      notifyListeners({
        type: 'sensor_registered',
        ...data
      });
    });

    // Listen for fall event status updates
    socket.on('fall_event_update', (data) => {
      console.log('Fall event update:', data);
      notifyListeners({
        type: 'fall_event_update',
        ...data
      });
    });

    // Listen for AI camera events (Seedoo)
    socket.on('new_ai_event', (data) => {
      console.log('New AI event received:', data);
      notifyListeners({
        type: 'new_ai_event',
        event: data.event || data
      });
    });

    // Cleanup on unmount
    return () => {
      console.log('Disconnecting Socket.IO...');
      socket.emit('leave_tenant', {});
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isAuthenticated, user?.tenant_id, notifyListeners]);

  // Subscribe to events
  const subscribe = useCallback((id, callback) => {
    listenersRef.current.set(id, callback);
    return () => {
      listenersRef.current.delete(id);
    };
  }, []);

  // Start receiving live positions for a radar; returns the unwatch function
  const watchSensor = useCallback((sensorId) => {
    if (!sensorId) return () => {};
    const watched = watchedSensorsRef.current;
    const count = watched.get(sensorId) || 0;
    watched.set(sensorId, count + 1);
    if (count === 0 && joinedRef.current) {
      socketRef.current?.emit('watch_sensor', { sensor_id: sensorId });
    }

    return () => {
      const remaining = (watched.get(sensorId) || 1) - 1;
      if (remaining > 0) {
        watched.set(sensorId, remaining);
        return;
      }
      watched.delete(sensorId);
      if (joinedRef.current) {
        socketRef.current?.emit('unwatch_sensor', { sensor_id: sensorId });
      }
    };
  }, []);

  // Force refresh - fetch latest events manually
  const forceRefresh = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${BACKEND_URL}/api/events?limit=50`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const events = await response.json();
        notifyListeners({ type: 'force_refresh', events });
      }
    } catch (error) {
      console.error('Force refresh error:', error);
    }
  }, [notifyListeners]);

  // Get connection status details
  const getConnectionInfo = useCallback(() => {
    const socket = socketRef.current;
    return {
      connected,
      socketId: socket?.id,
      transport: socket?.io?.engine?.transport?.name,
      reconnectAttempts: reconnectAttemptRef.current
    };
  }, [connected]);

  return (
    <WebSocketContext.Provider value={{ 
      connected, 
      rooms,
      lastEvent, 
      subscribe,
      watchSensor,
      forceRefresh,
      getConnectionInfo
    }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}
