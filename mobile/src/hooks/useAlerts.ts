// Hook pour gérer les alertes
import { useState, useCallback, useEffect } from 'react';
import apiClient from '../api/client';
import type { Alert } from '../types';

// Normalize status from backend (ACK -> ACKNOWLEDGED)
function normalizeStatus(status: string): 'NEW' | 'ACKNOWLEDGED' | 'RESOLVED' {
  if (status === 'ACK' || status === 'ACKNOWLEDGED') return 'ACKNOWLEDGED';
  if (status === 'RESOLVED') return 'RESOLVED';
  return 'NEW';
}

// Normalize alert from API response
function normalizeAlert(event: any): Alert {
  return {
    id: event.id,
    type: event.type || event.event_type || 'FALL',
    status: normalizeStatus(event.status || 'NEW'),
    timestamp: event.timestamp || event.occurred_at || new Date().toISOString(),
    sensor_id: event.sensor_id || '',
    radar_name: event.radar_name || '',
    location_path: event.location_path || buildLocationPath(event),
    location: event.location,
    acknowledged_at: event.acknowledged_at,
    acknowledged_by: event.acknowledged_by,
  };
}

// Build location path from event data
function buildLocationPath(event: any): string {
  const parts = [];
  if (event.client_name) parts.push(event.client_name);
  if (event.building_name) parts.push(event.building_name);
  if (event.floor_name) parts.push(event.floor_name);
  if (event.room_name) parts.push(event.room_name);
  return parts.join(' > ') || 'Localisation inconnue';
}

export function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      setError(null);
      console.log('[Alerts] Fetching alerts...');
      const data = await apiClient.getAlerts();
      console.log('[Alerts] Received', data?.length || 0, 'events');
      
      // Normalize all alerts
      const normalizedAlerts = (data || []).map(normalizeAlert);
      
      // Sort by timestamp (newest first)
      normalizedAlerts.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      setAlerts(normalizedAlerts);
    } catch (err: any) {
      console.log('[Alerts] Error fetching:', err.message);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAlerts();
  }, [fetchAlerts]);

  const addAlert = useCallback((alert: Alert) => {
    console.log('[Alerts] Adding new alert:', alert.id);
    setAlerts(prev => {
      // Éviter les doublons
      if (prev.some(a => a.id === alert.id)) {
        console.log('[Alerts] Alert already exists, skipping');
        return prev;
      }
      return [alert, ...prev];
    });
  }, []);

  const updateAlert = useCallback((id: string, updates: Partial<Alert>) => {
    console.log('[Alerts] Updating alert:', id, updates);
    setAlerts(prev => prev.map(a => 
      a.id === id ? { ...a, ...updates } : a
    ));
  }, []);

  const acknowledgeAlert = useCallback(async (id: string) => {
    console.log('[Alerts] Acknowledging alert:', id);
    try {
      await apiClient.acknowledgeAlert(id);
      updateAlert(id, { 
        status: 'ACKNOWLEDGED',
        acknowledged_at: new Date().toISOString()
      });
      return true;
    } catch (err: any) {
      console.log('[Alerts] Acknowledge error:', err.message);
      setError(err.message);
      return false;
    }
  }, [updateAlert]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Séparer alertes actives et acquittées
  const activeAlerts = alerts.filter(a => a.status === 'NEW');
  const acknowledgedAlerts = alerts.filter(a => a.status !== 'NEW');

  return {
    alerts,
    activeAlerts,
    acknowledgedAlerts,
    loading,
    refreshing,
    error,
    refresh,
    addAlert,
    updateAlert,
    acknowledgeAlert,
  };
}
