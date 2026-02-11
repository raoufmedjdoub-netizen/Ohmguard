/**
 * AlertContext - Global alert state for fall/critical events + AI camera alerts
 * 
 * Listens to WebSocket for new_radar_event, fall_event_update, and new_ai_event.
 * Maintains list of active (unacknowledged) alerts visible across all pages.
 * Plays alert sound on new critical events.
 */
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { useWebSocket } from './WebSocketContext';
import { useAuth } from './AuthContext';
import api from '@/lib/api';

const AlertContext = createContext(null);

const ALERT_TYPES = ['FALL', 'SENSITIVE_FALL', 'BED_EXIT'];
const CRITICAL_AI_TYPES = ['Fall_Detected', 'Violence', 'Fire', 'Smoke', 'Intrusion'];

const ALERT_SOUND_URL = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkJONiYaDfHl5foWMk5eTjoiDfXd0dn+IkJiXkYuFf3l0c3d/iZGYmJKMhn93c3R4gYyUmpiSioR9d3N0eIGMlJqZk42Hf3lzdHiBjJWampSTjYeAenV1eYKNlpuak5CKg312dXmCjpabnJWRi4WAfHd2eoOPl5ydl5KNiIJ8d3Z7hJCYnZ2Xk46JhIF8eHd7hJGZnp6Yk4+LiIR/ent8hpObn5+ZlI+LiYWBe3t8hpOcoJ+ZlJCMiYWBfHx9h5SdoaCal5GPi4eDfn1+iJWeop+amJKQjoqGg39+f4eVnqGgnJmUkY+LiIWCgICHlZ2hnpyZlZKQjYqHhIGBh5Wdn5ybmpeTkY+NioeEgoGHlZ2fnZuamJaTkY+OjIiEgoGHlZ2enJqZmJeTkZCOjImGhIKIlZ2enJqZmJeTkZCPjouIhYOJlp2fnZuZmJeUkpGQj42KiIaEiZadn56cm5qYl5WUkpGQj42LiYeGipednp2cm5qYl5aUk5KRkI6MiomIi5eenp2cm5qZmJeWlZSTkpGQjo2LiomLl56enZybmpqZmJeWlZSTkpGQj46NjIuMl56enZybm5qZmJeXlpWUk5KRkZCPjo2NjJednjw=';

export function AlertProvider({ children }) {
  const { subscribe } = useWebSocket();
  const { isAuthenticated } = useAuth();
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [bannerEnabled, setBannerEnabled] = useState(true);
  const audioRef = useRef(null);
  const alertTimersRef = useRef({});
  const loadedRef = useRef(false);

  // Initialize audio
  useEffect(() => {
    audioRef.current = new Audio(ALERT_SOUND_URL);
    audioRef.current.volume = 0.8;
    return () => {
      Object.values(alertTimersRef.current).forEach(clearInterval);
    };
  }, []);

  // Listen for banner toggle from Settings page
  useEffect(() => {
    const handler = (e) => setBannerEnabled(e.detail);
    window.addEventListener('banner-toggle', handler);
    return () => window.removeEventListener('banner-toggle', handler);
  }, []);

  // Load existing unresolved alerts + user preferences on mount
  useEffect(() => {
    if (!isAuthenticated || loadedRef.current) return;
    loadedRef.current = true;
    
    const loadExistingAlerts = async () => {
      try {
        // Load user banner preference
        try {
          const prefsRes = await api.get('/users/me/notifications');
          setBannerEnabled(prefsRes.data.alert_banner_enabled !== false);
        } catch {}

        const allAlerts = [];
        
        // Load radar alerts (FALL, SENSITIVE_FALL, BED_EXIT)
        for (const eventType of ALERT_TYPES) {
          for (const status of ['NEW', 'ACK']) {
            try {
              const res = await api.get('/events', {
                params: { event_type: eventType, status, limit: 50 }
              });
              if (res.data?.length) {
                allAlerts.push(...res.data.map(e => ({
                  ...e,
                  alertSource: 'radar',
                  addedAt: new Date(e.timestamp || e.occurred_at).getTime() || Date.now(),
                  updatedAt: Date.now()
                })));
              }
            } catch {}
          }
        }
        
        // Load critical AI alerts (NEW + ACK status)
        for (const aiStatus of ['NEW', 'ACK', 'ACKNOWLEDGED']) {
          try {
            const aiRes = await api.get('/ai-events', {
              params: { status: aiStatus, limit: 50 }
            });
            if (aiRes.data?.length) {
              allAlerts.push(...aiRes.data.map(e => ({
                ...e,
                type: 'AI_ALERT',
                alertSource: 'ai_camera',
                addedAt: new Date(e.timestamp || e.created_at).getTime() || Date.now(),
                updatedAt: Date.now()
              })));
            }
          } catch {}
        }
        
        if (allAlerts.length > 0) {
          setActiveAlerts(allAlerts);
        }
      } catch (e) {
        console.warn('Failed to load existing alerts:', e);
      }
    };
    
    loadExistingAlerts();
  }, [isAuthenticated]);

  const playAlertSound = useCallback(() => {
    if (!soundEnabled || !audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play().catch(() => {});
  }, [soundEnabled]);

  const addAlert = useCallback((event) => {
    if (!event) return;
    // Accept radar alerts or AI alerts
    const isRadar = ALERT_TYPES.includes(event.type);
    const isAI = event.alertSource === 'ai_camera' || event.type === 'AI_ALERT';
    if (!isRadar && !isAI) return;

    setActiveAlerts(prev => {
      const exists = prev.find(a => a.id === event.id);
      if (exists) {
        return prev.map(a => a.id === event.id ? { ...a, ...event, updatedAt: Date.now() } : a);
      }
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
      // Check if it's an AI event
      const alert = activeAlerts?.find(a => a.id === eventId);
      if (alert?.alertSource === 'ai_camera') {
        await api.patch(`/ai-events/${eventId}/status?status=ACKNOWLEDGED`);
        updateAlert(eventId, { status: 'ACKNOWLEDGED' });
      } else {
        await api.patch(`/events/${eventId}`, { status: 'ACK' });
        updateAlert(eventId, { status: 'ACK' });
      }
    } catch (e) {
      console.error('Failed to ACK alert:', e);
    }
  }, [updateAlert, activeAlerts]);

  const resolveAlert = useCallback(async (eventId) => {
    try {
      const alert = activeAlerts?.find(a => a.id === eventId);
      if (alert?.alertSource === 'ai_camera') {
        await api.patch(`/ai-events/${eventId}/status?status=RESOLVED`);
      } else {
        await api.patch(`/events/${eventId}`, { status: 'RESOLVED', comment: 'Resolu' });
      }
      dismissAlert(eventId);
    } catch (e) {
      console.error('Failed to resolve alert:', e);
    }
  }, [dismissAlert, activeAlerts]);

  const markFalseAlarm = useCallback(async (eventId) => {
    try {
      const alert = activeAlerts?.find(a => a.id === eventId);
      if (alert?.alertSource === 'ai_camera') {
        await api.patch(`/ai-events/${eventId}/status?status=FALSE_ALARM`);
      } else {
        await api.patch(`/events/${eventId}`, { status: 'FALSE_ALARM', comment: 'Fausse alarme' });
      }
      dismissAlert(eventId);
    } catch (e) {
      console.error('Failed to mark false alarm:', e);
    }
  }, [dismissAlert, activeAlerts]);

  const toggleBanner = useCallback(async (val) => {
    setBannerEnabled(val);
    try {
      await api.put('/users/me/notifications', { alert_banner_enabled: val });
    } catch {}
  }, []);

  // Subscribe to WebSocket events
  useEffect(() => {
    if (!isAuthenticated) return;

    const unsubscribe = subscribe('global-alerts', (message) => {
      if (message.type === 'new_radar_event' || message.type === 'new_event') {
        const event = message.event;
        if (event && ALERT_TYPES.includes(event.type)) {
          addAlert({ ...event, alertSource: 'radar' });
        }
      }
      else if (message.type === 'new_ai_event') {
        const event = message.event;
        if (event) {
          addAlert({
            ...event,
            type: 'AI_ALERT',
            alertSource: 'ai_camera',
          });
        }
      }
      else if (message.type === 'fall_event_update') {
        const { event_id, fall_status, ...rest } = message;
        if (event_id) {
          updateAlert(event_id, { fall_status, ...rest });
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
      bannerEnabled,
      toggleBanner,
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
