// Hook pour gérer les alertes
import { useState, useCallback, useEffect } from 'react';
import apiClient from '../api/client';
import type { Alert } from '../types';

function normalizeStatus(status: string): 'NEW' | 'ACKNOWLEDGED' | 'RESOLVED' {
  if (status === 'ACK' || status === 'ACKNOWLEDGED') return 'ACKNOWLEDGED';
  if (status === 'RESOLVED') return 'RESOLVED';
  return 'NEW';
}

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

function buildLocationPath(event: any): string {
  const parts: string[] = [];
  const loc = event.location || {};
  const clientName = loc.client_name || event.client_name;
  const buildingName = loc.building_name || event.building_name;
  const floorName = loc.floor_name || event.floor_name;
  const roomName = loc.room_name || event.room_name;

  if (clientName) parts.push(clientName);
  if (buildingName) parts.push(buildingName);
  if (floorName) parts.push(floorName);
  if (roomName) parts.push(roomName);

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
      const data = await apiClient.getAlerts();

      if (!data || !Array.isArray(data)) {
        setAlerts([]);
        return;
      }

      const normalizedAlerts = data.map(normalizeAlert);
      normalizedAlerts.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      setAlerts(normalizedAlerts);
    } catch (err: any) {
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
    setAlerts(prev => {
      if (prev.some(a => a.id === alert.id)) return prev;
      return [alert, ...prev];
    });
  }, []);

  const updateAlert = useCallback((id: string, updates: Partial<Alert>) => {
    setAlerts(prev => prev.map(a =>
      a.id === id ? { ...a, ...updates } : a
    ));
  }, []);

  const acknowledgeAlert = useCallback(async (id: string) => {
    try {
      await apiClient.acknowledgeAlert(id);
      updateAlert(id, {
        status: 'ACKNOWLEDGED',
        acknowledged_at: new Date().toISOString()
      });
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [updateAlert]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

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
