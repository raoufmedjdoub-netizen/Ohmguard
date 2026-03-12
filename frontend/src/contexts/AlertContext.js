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

/**
 * Joue un chime d'urgence 4 notes descendantes via Web Audio API.
 * DO - SI - SOL - MI (880 → 660 → 550 → 440 Hz)
 */
function playUrgencyChime(volume = 0.8) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [880, 660, 550, 440];
    const noteDuration = 0.18;
    const gapDuration = 0.04;

    notes.forEach((freq, i) => {
      const startTime = ctx.currentTime + i * (noteDuration + gapDuration);

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0, startTime);
      gain.gain.linearRampToValueAtTime(volume, startTime + 0.02);
      gain.gain.setValueAtTime(volume, startTime + noteDuration - 0.04);
      gain.gain.linearRampToValueAtTime(0, startTime + noteDuration);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + noteDuration);
    });

    const totalDuration = notes.length * (noteDuration + gapDuration) + 0.1;
    setTimeout(() => ctx.close(), totalDuration * 1000);
  } catch (e) {
    // Web Audio API non disponible
  }
}

export function AlertProvider({ children }) {
  const { subscribe } = useWebSocket();
  const { isAuthenticated } = useAuth();
  const [activeAlerts, setActiveAlerts] = useState([]);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [bannerEnabled, setBannerEnabled] = useState(true);
  const alertTimersRef = useRef({});
  const loadedRef = useRef(false);

  useEffect(() => {
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
        
        // Load radar alerts (FALL, SENSITIVE_FALL, BED_EXIT) - uniquement NEW
        for (const eventType of ALERT_TYPES) {
          try {
            const res = await api.get('/events', {
              params: { event_type: eventType, status: 'NEW', limit: 50 }
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
        
        // Load AI alerts - uniquement NEW
        try {
          const aiRes = await api.get('/ai-events', {
            params: { status: 'NEW', limit: 50 }
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
    if (!soundEnabled) return;
    playUrgencyChime(0.8);
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

    // Ne pas jouer le son sur fall_detected (chute suspectée non confirmée)
    const isSuspectedOnly = event.type === 'FALL' && event.fall_status === 'fall_detected';
    if (!isSuspectedOnly) {
      playAlertSound();
    }
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
      addAlert,
      updateAlert
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
