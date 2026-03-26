// Hook pour gérer les alertes avec pagination et cache offline
import { useState, useCallback, useEffect, useRef } from 'react';
import * as SecureStore from 'expo-secure-store';
import apiClient from '../api/client';
import type { Alert } from '../types';

const CACHE_KEY = 'cached_alerts';
const PAGE_SIZE = 30;

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

export type AlertFilter = 'ALL' | 'NEW' | 'ACKNOWLEDGED';

export function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<AlertFilter>('ALL');
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const offsetRef = useRef(0);

  // Load cached alerts on startup
  const loadCache = useCallback(async () => {
    try {
      const cached = await SecureStore.getItemAsync(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setAlerts(parsed);
        }
      }
    } catch {}
  }, []);

  // Save alerts to cache
  const saveCache = useCallback(async (data: Alert[]) => {
    try {
      // Keep only the last 50 alerts in cache (SecureStore size limit)
      const toCache = data.slice(0, 50);
      await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(toCache));
    } catch {}
  }, []);

  const fetchAlerts = useCallback(async (reset = true) => {
    try {
      setError(null);
      if (reset) {
        offsetRef.current = 0;
      }

      const params = new URLSearchParams();
      params.append('event_type', 'FALL');
      params.append('limit', String(PAGE_SIZE));
      params.append('skip', String(offsetRef.current));

      const data = await apiClient.getAlerts();

      if (!data || !Array.isArray(data)) {
        setAlerts([]);
        setHasMore(false);
        return;
      }

      const normalizedAlerts = data.map(normalizeAlert);
      normalizedAlerts.sort((a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      if (reset) {
        setAlerts(normalizedAlerts);
        saveCache(normalizedAlerts);
      } else {
        setAlerts(prev => {
          const existingIds = new Set(prev.map(a => a.id));
          const newAlerts = normalizedAlerts.filter(a => !existingIds.has(a.id));
          const merged = [...prev, ...newAlerts];
          saveCache(merged);
          return merged;
        });
      }

      setHasMore(normalizedAlerts.length >= PAGE_SIZE);
      offsetRef.current += normalizedAlerts.length;
    } catch (err: any) {
      setError(err.message);
      // Try loading from cache on network error
      if (alerts.length === 0) {
        await loadCache();
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [saveCache, loadCache]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await fetchAlerts(true);
  }, [fetchAlerts]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    await fetchAlerts(false);
  }, [fetchAlerts, loadingMore, hasMore]);

  const addAlert = useCallback((alert: Alert) => {
    setAlerts(prev => {
      if (prev.some(a => a.id === alert.id)) return prev;
      const updated = [alert, ...prev];
      saveCache(updated);
      return updated;
    });
  }, [saveCache]);

  const updateAlert = useCallback((id: string, updates: Partial<Alert>) => {
    setAlerts(prev => {
      const updated = prev.map(a => a.id === id ? { ...a, ...updates } : a);
      saveCache(updated);
      return updated;
    });
  }, [saveCache]);

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
    loadCache().then(() => fetchAlerts(true));
  }, []);

  // Filtered views
  const filteredAlerts = filter === 'ALL'
    ? alerts
    : alerts.filter(a => a.status === filter);

  const activeAlerts = alerts.filter(a => a.status === 'NEW');
  const acknowledgedAlerts = alerts.filter(a => a.status !== 'NEW');

  return {
    alerts: filteredAlerts,
    allAlerts: alerts,
    activeAlerts,
    acknowledgedAlerts,
    loading,
    refreshing,
    error,
    filter,
    setFilter,
    hasMore,
    loadingMore,
    refresh,
    loadMore,
    addAlert,
    updateAlert,
    acknowledgeAlert,
  };
}
