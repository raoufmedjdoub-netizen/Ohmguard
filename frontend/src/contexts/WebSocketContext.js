import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useAuth } from './AuthContext';

const WebSocketContext = createContext(null);

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const POLL_INTERVAL = 5000; // 5 seconds - reasonable for real-time feel without overload

export function WebSocketProvider({ children }) {
  const { user, isAuthenticated } = useAuth();
  const [connected, setConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState(null);
  const [presenceState, setPresenceState] = useState({}); // Real-time presence state by sensor_id
  const listenersRef = useRef(new Map());
  const pollingRef = useRef(null);
  const lastEventIdRef = useRef(null);
  const isPageVisibleRef = useRef(true);

  // Notify all listeners of a message
  const notifyListeners = useCallback((data) => {
    setLastEvent(data);
    listenersRef.current.forEach((callback) => {
      callback(data);
    });
  }, []);

  // Fetch latest events only (no presence state polling to avoid flickering)
  const fetchLatestEvents = useCallback(async () => {
    if (!isAuthenticated || !isPageVisibleRef.current) return;
    
    try {
      const token = localStorage.getItem('access_token');
      
      // Only fetch events - no presence state to avoid constant re-renders
      const eventsResponse = await fetch(`${BACKEND_URL}/api/events?limit=30`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      // Process events
      if (eventsResponse.ok) {
        const events = await eventsResponse.json();
        
        if (events.length > 0) {
          const latestId = events[0].id;
          
          // If we have a previous ID, find new events
          if (lastEventIdRef.current && latestId !== lastEventIdRef.current) {
            const newEvents = [];
            for (const event of events) {
              if (event.id === lastEventIdRef.current) break;
              newEvents.push(event);
            }
            
            // Notify listeners of each new event (oldest first)
            if (newEvents.length > 0) {
              newEvents.reverse().forEach(event => {
                notifyListeners({ type: 'new_radar_event', event });
              });
            }
          }
          
          lastEventIdRef.current = latestId;
        }
      }
      
      setConnected(true);
    } catch (error) {
      console.error('Polling error:', error);
      setConnected(false);
    }
  }, [isAuthenticated, notifyListeners]);

  // Start polling - DISABLED to debug flickering
  const startPolling = useCallback(() => {
    // Polling disabled - only manual refresh via forceRefresh
    console.log('Polling disabled for stability - use manual refresh');
    setConnected(true);
  }, []);

  // Stop polling
  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // Handle page visibility changes
  useEffect(() => {
    const handleVisibilityChange = () => {
      isPageVisibleRef.current = !document.hidden;
      
      if (document.hidden) {
        // Page is hidden - stop polling to save resources
        stopPolling();
      } else {
        // Page is visible - resume polling
        if (isAuthenticated) {
          startPolling();
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isAuthenticated, startPolling, stopPolling]);

  // Start/stop polling based on auth state
  useEffect(() => {
    if (isAuthenticated && user?.tenant_id) {
      startPolling();
    } else {
      stopPolling();
      setConnected(false);
    }
    
    return () => {
      stopPolling();
    };
  }, [isAuthenticated, user?.tenant_id, startPolling, stopPolling]);

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
        
        // Update last event ID
        if (events.length > 0) {
          lastEventIdRef.current = events[0].id;
        }
      }
    } catch (error) {
      console.error('Force refresh error:', error);
    }
  }, [notifyListeners]);

  return (
    <WebSocketContext.Provider value={{ 
      connected, 
      lastEvent, 
      presenceState,  // Expose real-time presence state
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
