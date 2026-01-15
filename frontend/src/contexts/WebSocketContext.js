import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';

const WebSocketContext = createContext(null);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

export function WebSocketProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const [connectionType, setConnectionType] = useState(null); // 'websocket' | 'sse' | null
  const socketRef = useRef(null);
  const eventSourceRef = useRef(null);
  const listenersRef = useRef(new Map());
  const reconnectTimeoutRef = useRef(null);

  // Notify all listeners of a message
  const notifyListeners = useCallback((data) => {
    setLastEvent(data);
    listenersRef.current.forEach((callback) => {
      callback(data);
    });
  }, []);

  // Connect via Server-Sent Events (more reliable in proxy environments)
  const connectSSE = useCallback(() => {
    if (!isAuthenticated || !user?.tenant_id) return;
    
    const token = localStorage.getItem('access_token');
    const sseUrl = `${BACKEND_URL}/api/events/stream/${user.tenant_id}?token=${token}`;
    
    console.log('Connecting via SSE...');
    
    const eventSource = new EventSource(sseUrl);
    
    eventSource.onopen = () => {
      console.log('SSE connected');
      setConnected(true);
      setConnectionType('sse');
    };
    
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Ignore ping messages
        if (data.type === 'ping' || data.type === 'connected') {
          return;
        }
        
        notifyListeners(data);
      } catch (e) {
        console.error('SSE message parse error:', e);
      }
    };
    
    eventSource.onerror = (error) => {
      console.error('SSE error:', error);
      setConnected(false);
      setConnectionType(null);
      eventSource.close();
      
      // Reconnect after 5 seconds
      if (isAuthenticated) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connectSSE();
        }, 5000);
      }
    };
    
    eventSourceRef.current = eventSource;
  }, [isAuthenticated, user?.tenant_id, notifyListeners]);

  // Connect via WebSocket (try first, fallback to SSE)
  const connectWebSocket = useCallback(() => {
    if (!isAuthenticated || !user?.tenant_id) return;
    
    const token = localStorage.getItem('access_token');
    const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    
    console.log('Attempting WebSocket connection...');
    
    try {
      const ws = new WebSocket(`${wsUrl}/ws/${user.tenant_id}?token=${token}`);
      
      // Set connection timeout
      const connectionTimeout = setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          console.log('WebSocket timeout, falling back to SSE');
          ws.close();
          connectSSE();
        }
      }, 5000);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        clearTimeout(connectionTimeout);
        setConnected(true);
        setConnectionType('websocket');
      };
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          notifyListeners(data);
        } catch (e) {
          console.error('WebSocket message parse error:', e);
        }
      };
      
      ws.onclose = () => {
        console.log('WebSocket disconnected');
        clearTimeout(connectionTimeout);
        setConnected(false);
        setConnectionType(null);
        
        // Fall back to SSE on disconnect
        if (isAuthenticated) {
          console.log('Falling back to SSE');
          connectSSE();
        }
      };
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        clearTimeout(connectionTimeout);
      };
      
      socketRef.current = ws;
      
      // Ping every 30 seconds to keep connection alive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send('ping');
        }
      }, 30000);
      
      return () => {
        clearTimeout(connectionTimeout);
        clearInterval(pingInterval);
        ws.close();
      };
    } catch (error) {
      console.error('WebSocket failed, falling back to SSE:', error);
      connectSSE();
    }
  }, [isAuthenticated, user?.tenant_id, notifyListeners, connectSSE]);

  // Main connect function - tries WebSocket first, then SSE
  const connect = useCallback(() => {
    if (!isAuthenticated || !user?.tenant_id) {
      console.log('Not authenticated or no tenant_id');
      return;
    }
    
    // Try WebSocket first
    connectWebSocket();
  }, [isAuthenticated, user?.tenant_id, connectWebSocket]);

  // Cleanup and connect on mount/auth change
  useEffect(() => {
    // Cleanup function
    const cleanup = () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
    
    cleanup();
    
    if (isAuthenticated && user?.tenant_id) {
      connect();
    }
    
    return cleanup;
  }, [isAuthenticated, user?.tenant_id, connect]);

  // Subscribe to events
  const subscribe = useCallback((id, callback) => {
    listenersRef.current.set(id, callback);
    return () => {
      listenersRef.current.delete(id);
    };
  }, []);

  // Force refresh - for manual refresh button
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

  return (
    <WebSocketContext.Provider value={{ 
      connected, 
      connectionType,
      lastEvent, 
      subscribe,
      forceRefresh
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
