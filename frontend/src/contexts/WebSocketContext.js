import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const WebSocketContext = createContext(null);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export function WebSocketProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const socketRef = useRef(null);
  const listenersRef = useRef(new Map());

  const connect = useCallback(() => {
    if (!isAuthenticated || !user?.tenant_id) return;
    
    const token = localStorage.getItem('access_token');
    const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    
    // Use native WebSocket since the backend uses raw WebSocket
    const ws = new WebSocket(`${wsUrl}/ws/${user.tenant_id}?token=${token}`);
    
    ws.onopen = () => {
      console.log('WebSocket connected');
      setConnected(true);
    };
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setLastEvent(data);
        
        // Notify all listeners
        listenersRef.current.forEach((callback) => {
          callback(data);
        });
      } catch (e) {
        console.error('WebSocket message parse error:', e);
      }
    };
    
    ws.onclose = () => {
      console.log('WebSocket disconnected');
      setConnected(false);
      
      // Reconnect after 3 seconds
      setTimeout(() => {
        if (isAuthenticated) {
          connect();
        }
      }, 3000);
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    socketRef.current = ws;
    
    // Ping every 30 seconds to keep connection alive
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send('ping');
      }
    }, 30000);
    
    return () => {
      clearInterval(pingInterval);
      ws.close();
    };
  }, [isAuthenticated, user?.tenant_id]);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      if (cleanup) cleanup();
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  const subscribe = useCallback((id, callback) => {
    listenersRef.current.set(id, callback);
    return () => {
      listenersRef.current.delete(id);
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ connected, lastEvent, subscribe }}>
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
