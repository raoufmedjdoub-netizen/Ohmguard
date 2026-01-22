// Hook pour gérer les alertes
import { useState, useCallback, useEffect } from 'react';
import apiClient from '../api/client';
import type { Alert } from '../types';

export function useAlerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAlerts = useCallback(async () => {
    try {
      setError(null);
      const data = await apiClient.getAlerts();
      // Filtrer uniquement les chutes
      const fallAlerts = data.filter((e: any) => e.type === 'FALL');
      setAlerts(fallAlerts as Alert[]);
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
      // Éviter les doublons
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
      updateAlert(id, { status: 'ACKNOWLEDGED' });
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  }, [updateAlert]);

  useEffect(() => {
    fetchAlerts();
  }, [fetchAlerts]);

  // Séparer alertes actives et acquittées
  const activeAlerts = alerts.filter(a => a.status === 'NEW');
  const acknowledgedAlerts = alerts.filter(a => a.status === 'ACKNOWLEDGED');

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
