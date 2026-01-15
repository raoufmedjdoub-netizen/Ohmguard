import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';

const WebSocketContext = createContext(null);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const POLLING_INTERVAL = 3000; // 3 seconds polling fallback

export function WebSocketProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const socketRef = useRef(null);
  const listenersRef = useRef(new Map());
  const pollingRef = useRef(null);
  const lastEventIdRef = useRef(null);
  const wsRetriesRef = useRef(0);
  const usePollingRef = useRef(false);

  // Polling fallback function
  const startPolling = useCallback(() => {
    if (pollingRef.current) return;
    
    console.log('Starting polling fallback for real-time updates');
    usePollingRef.current = true;
    setConnected(true); // Mark as connected since polling is working
    
    const poll = async () => {
      try {
        const token = localStorage.getItem('access_token');
        const response = await fetch(`${BACKEND_URL}/api/events?limit=20`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        
        if (response.ok) {
          const events = await response.json();
          
          // Check for new events
          if (events.length > 0) {
            const latestId = events[0].id;
            
            if (lastEventIdRef.current && latestId !== lastEventIdRef.current) {
              // Find new events
              const newEvents = [];
              for (const event of events) {
                if (event.id === lastEventIdRef.current) break;
                newEvents.push(event);
              }
              
              // Notify listeners of new events
              newEvents.reverse().forEach(event => {
                const data = { type: 'new_radar_event', event };
                setLastEvent(data);
                listenersRef.current.forEach(callback => callback(data));
              });
            }
            
            lastEventIdRef.current = latestId;
          }
        }
      } catch (error) {
        console.error('Polling error:', error);
      }
    };
    
    // Initial poll
    poll();
    
    // Set up interval
    pollingRef.current = setInterval(poll, POLLING_INTERVAL);
  }, []);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    usePollingRef.current = false;
  }, []);

  const connect = useCallback(() => {
    if (!isAuthenticated || !user?.tenant_id) {
      console.log('WebSocket: Not authenticated or no tenant_id, starting polling');
      startPolling();
      return;
    }
    
    const token = localStorage.getItem('access_token');
    const wsUrl = BACKEND_URL.replace('https://', 'wss://').replace('http://', 'ws://');
    
    try {
      const ws = new WebSocket(`${wsUrl}/ws/${user.tenant_id}?token=${token}`);
      
      ws.onopen = () => {
        console.log('WebSocket connected');
        setConnected(true);
        stopPolling();
        wsRetriesRef.current = 0;
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
        wsRetriesRef.current++;
        
        // After 3 failed attempts, switch to polling
        if (wsRetriesRef.current >= 3) {
          console.log('WebSocket unavailable, switching to polling');
          startPolling();
        } else if (isAuthenticated) {
          // Reconnect after increasing delay
          setTimeout(() => {
            connect();
          }, Math.min(1000 * wsRetriesRef.current, 5000));
        }
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
    } catch (error) {
      console.error('WebSocket connection failed, using polling:', error);
      startPolling();
    }
  }, [isAuthenticated, user?.tenant_id, startPolling, stopPolling]);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      if (cleanup) cleanup();
      if (socketRef.current) {
        socketRef.current.close();
      }
      stopPolling();
    };
  }, [connect, stopPolling]);

  const subscribe = useCallback((id, callback) => {
    listenersRef.current.set(id, callback);
    return () => {
      listenersRef.current.delete(id);
    };
  }, []);

  // Force refresh function for manual updates
  const forceRefresh = useCallback(async () => {
    try {
      const token = localStorage.getItem('access_token');
      const response = await fetch(`${BACKEND_URL}/api/events?limit=50`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const events = await response.json();
        // Notify listeners to refresh
        listenersRef.current.forEach(callback => {
          callback({ type: 'force_refresh', events });
        });
      }
    } catch (error) {
      console.error('Force refresh error:', error);
    }
  }, []);

  return (
    <WebSocketContext.Provider value={{ 
      connected: connected || usePollingRef.current, 
      lastEvent, 
      subscribe,
      forceRefresh,
      isPolling: usePollingRef.current
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
