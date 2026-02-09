/**
 * useLastState Hook
 * React hook for consuming the Last State API with real-time updates
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import api from '@/lib/api';
import { useWebSocket } from '@/contexts/WebSocketContext';

// Refresh interval in ms
const REFRESH_INTERVAL = 30000; // 30 seconds

/**
 * Hook for fetching and managing last state of sensors
 * @param {Object} options - Options object
 * @param {string} options.buildingId - Building ID to filter by
 * @param {string} options.floorId - Floor ID to filter by
 * @param {boolean} options.autoRefresh - Enable auto refresh (default: true)
 * @param {number} options.refreshInterval - Refresh interval in ms (default: 30000)
 */
export function useLastState({ 
  buildingId = null, 
  floorId = null, 
  autoRefresh = true,
  refreshInterval = REFRESH_INTERVAL 
} = {}) {
  const [sensors, setSensors] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    online: 0,
    offline: 0,
    unknown: 0
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  
  const { lastMessage } = useSocket();
  const intervalRef = useRef(null);

  // Fetch data from API
  const fetchData = useCallback(async () => {
    if (!buildingId && !floorId) {
      setLoading(false);
      return;
    }

    try {
      const params = new URLSearchParams();
      if (buildingId) params.append('building_id', buildingId);
      if (floorId) params.append('floor_id', floorId);
      
      const response = await api.get(`/last-state/sensors?${params.toString()}`);
      const data = response.data;
      
      setSensors(data.sensors || []);
      setStats({
        total: data.sensors_count || 0,
        online: data.online_count || 0,
        offline: data.offline_count || 0,
        unknown: data.unknown_count || 0
      });
      setLastUpdated(new Date());
      setError(null);
    } catch (err) {
      console.error('Error fetching last state:', err);
      setError(err.response?.data?.detail || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [buildingId, floorId]);

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto refresh
  useEffect(() => {
    if (autoRefresh && (buildingId || floorId)) {
      intervalRef.current = setInterval(fetchData, refreshInterval);
      return () => clearInterval(intervalRef.current);
    }
  }, [autoRefresh, refreshInterval, fetchData, buildingId, floorId]);

  // Handle WebSocket messages for real-time updates
  useEffect(() => {
    if (!lastMessage) return;

    const { type, sensor_id, ...data } = lastMessage;

    if (type === 'sensor_state_update' || type === 'presence_update') {
      // Update specific sensor in the list
      setSensors(prev => prev.map(sensor => {
        if (sensor.sensor_id === sensor_id) {
          return {
            ...sensor,
            ...data,
            status: data.status || sensor.status,
            last_seen_at: data.timestamp || data.last_seen_at || sensor.last_seen_at,
            presence_detected: data.presence_detected ?? sensor.presence_detected,
            target_count: data.target_count ?? sensor.target_count,
            last_event_type: data.last_event_type || sensor.last_event_type
          };
        }
        return sensor;
      }));

      // Recalculate stats
      setSensors(prev => {
        const newStats = { total: prev.length, online: 0, offline: 0, unknown: 0 };
        prev.forEach(s => {
          newStats[s.status] = (newStats[s.status] || 0) + 1;
        });
        setStats(newStats);
        return prev;
      });
    }

    if (type === 'fall_alert') {
      // Force refresh on fall alert
      fetchData();
    }
  }, [lastMessage, fetchData]);

  // Manual refresh
  const refresh = useCallback(() => {
    setLoading(true);
    fetchData();
  }, [fetchData]);

  return {
    sensors,
    stats,
    loading,
    error,
    lastUpdated,
    refresh
  };
}

/**
 * Hook for fetching single sensor last state
 * @param {string} sensorId - Sensor ID
 */
export function useSensorLastState(sensorId) {
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  const { lastMessage } = useSocket();

  const fetchState = useCallback(async () => {
    if (!sensorId) {
      setLoading(false);
      return;
    }

    try {
      const response = await api.get(`/last-state/sensor/${sensorId}`);
      setState(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching sensor state:', err);
      setError(err.response?.data?.detail || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [sensorId]);

  useEffect(() => {
    fetchState();
  }, [fetchState]);

  // Handle WebSocket updates
  useEffect(() => {
    if (!lastMessage || !sensorId) return;

    const { type, sensor_id, ...data } = lastMessage;

    if ((type === 'sensor_state_update' || type === 'presence_update') && sensor_id === sensorId) {
      setState(prev => prev ? { ...prev, ...data } : data);
    }
  }, [lastMessage, sensorId]);

  return { state, loading, error, refresh: fetchState };
}

/**
 * Hook for fetching last state stats
 * @param {string} buildingId - Optional building ID
 */
export function useLastStateStats(buildingId = null) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchStats = useCallback(async () => {
    try {
      const params = buildingId ? `?building_id=${buildingId}` : '';
      const response = await api.get(`/last-state/stats${params}`);
      setStats(response.data);
      setError(null);
    } catch (err) {
      console.error('Error fetching stats:', err);
      setError(err.response?.data?.detail || 'Erreur de chargement');
    } finally {
      setLoading(false);
    }
  }, [buildingId]);

  useEffect(() => {
    fetchStats();
    
    // Refresh every minute
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, [fetchStats]);

  return { stats, loading, error, refresh: fetchStats };
}

export default useLastState;
