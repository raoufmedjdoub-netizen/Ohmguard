/**
 * AlertContext - Global alert state for fall/critical events
 * 
 * Listens to WebSocket for new_radar_event and fall_event_update.
 * Maintains list of active (unacknowledged) alerts visible across all pages.
 * Plays alert sound on new critical events.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useWebSocket } from './WebSocketContext';
import { useAuth } from './AuthContext';
import api from '@/lib/api';

const AlertContext = createContext(null);

const ALERT_TYPES = ['FALL', 'SENSITIVE_FALL', 'BED_EXIT'];

const ALERT_SOUND_URL = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkJONiYaDfHl5foWMk5eTjoiDfXd0dn+IkJiXkYuFf3l0c3d/iZGYmJKMhn93c3R4gYyUmpiSioR9d3N0eIGMlJqZk42Hf3lzdHiBjJWampSTjYeAenV1eYKNlpuak5CKg312dXmCjpabnJWRi4WAfHd2eoOPl5ydl5KNiIJ8d3Z7hJCYnZ2Xk46JhIF8eHd7hJGZnp6Yk4+KhoN+eXh7hZKanp+Zk4+LiIR/ent8hpObn5+ZlI+LiYWBe3t8hpOcoJ+ZlJCMiYWBfHx9h5SdoaCal5GPi4eDfn1+iJWeop+amJKQjoqGg39+f4eVnqGgnJmUkY+LiIWCgICHlZ2hnpyZlZKQjYqHhIGBh5Wdn5ybmpeTkY+NioeEgoGHlZ2fnZuamJaTkY+OjIiEgoGHlZ2enJqZmJeTkZCOjImGhIKIlZ2enJqZmJeTkZCPjouIhYOJlp2fnZuZmJeUkpGQj42KiIaEiZadn56cm5qYl5WUkpGQj42LiYeGipednp2cm5qYl5aUk5KRkI6MiomIi5eenp2cm5qZmJeWlZSTkpGQjo2LiomLl56enZybmpqZmJeWlZSTkpGQj46NjIuMl56enZybm5qZmJeXlpWUk5KRkZCPjo2NjJednjw=';

export function AlertProvider({ children }) {
  const { subscribe } = useWebSocket();
  const { isAuthenticated } = useAuth();
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const audioRef = useRef(null);
  const alertTimersRef = useRef({});

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio(ALERT_SOUND_URL);
    audioRef.current.volume = 0.8;
    return () => {
      // Cleanup timers
      Object.values(alertTimersRef.current).forEach(clearInterval);
    };
  }, []);

  const playAlertSound = useCallback(() => {
    if (!soundEnabled || !audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  }, [soundEnabled]);

  const addAlert = useCallback((event) => {
    if (!event || !ALERT_TYPES.includes(event.type)) return;

    setActiveAlerts(prev => {
      // Check if alert already exists for this event
      const exists = prev.find(a => a.id === event.id);
      if (exists) {
        // Update existing alert
        return prev.map(a => a.id === event.id ? { ...a, ...event, updatedAt: Date.now() } : a);
      }
      // Add new alert
      return [{ ...event, addedAt: Date.now(), updatedAt: Date.now() }, ...prev];
    });

    playAlertSound();
  }, [playAlertSound]);

  const updateAlert = useCallback((eventId, updates) => {
    setActiveAlerts(prev =>
      prev.map(a => a.id === eventId ? { ...a, ...updates, updatedAt: Date.now() } : a)
    );
  }, []);

  const dismissAlert = useCallback((eventId) => {
    setActiveAlerts(prev => prev.filter(a => a.id !== eventId));
  }, []);

  const acknowledgeAlert = useCallback(async (eventId) => {
    try {
      await api.patch(`/events/${eventId}`, { status: 'ACK' });
      updateAlert(eventId, { status: 'ACK' });
    } catch (e) {
      console.error('Failed to ACK alert:', e);
    }
  }, [updateAlert]);

  const resolveAlert = useCallback(async (eventId) => {
    try {
      await api.patch(`/events/${eventId}`, { status: 'RESOLVED' });
      dismissAlert(eventId);
    } catch (e) {
      console.error('Failed to resolve alert:', e);
    }
  }, [dismissAlert]);

  const markFalseAlarm = useCallback(async (eventId) => {
    try {
      await api.patch(`/events/${eventId}`, { status: 'FALSE_ALARM' });
      dismissAlert(eventId);
    } catch (e) {
      console.error('Failed to mark false alarm:', e);
    }
  }, [dismissAlert]);

  // Subscribe to WebSocket events
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribe = subscribe('global-alerts', (message) => {
      if (message.type === 'new_radar_event' || message.type === 'new_event') {
        const event = message.event;
        if (event && ALERT_TYPES.includes(event.type)) {
          addAlert(event);
        }
      }
      else if (message.type === 'fall_event_update') {
        const { event_id, fall_status, ...rest } = message;
        if (event_id) {
          updateAlert(event_id, { fall_status, ...rest });
          // Play sound for critical status updates
          if (['fall_confirmed', 'calling'].includes(fall_status)) {
            playAlertSound();
          }
        }
      }
      else if (message.type === 'event_updated') {
        const { event_id, update } = message;
        if (update?.status === 'RESOLVED' || update?.status === 'FALSE_ALARM') {
          dismissAlert(event_id);
        } else if (update?.status === 'ACK') {
          updateAlert(event_id, { status: 'ACK' });
        }
      }
    });

    return unsubscribe;
  }, [isAuthenticated, subscribe, addAlert, updateAlert, dismissAlert, playAlertSound]);

  return (
    <AlertContext.Provider value={{
      activeAlerts,
      soundEnabled,
      setSoundEnabled,
      acknowledgeAlert,
      resolveAlert,
      markFalseAlarm,
      dismissAlert,
      addAlert
    }}>
      {children}
    </AlertContext.Provider>
  );
}

export function useAlerts() {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlerts must be used within AlertProvider');
  }
  return context;
}
