// Hook pour gérer l'activation/désactivation des notifications push
import { useState, useEffect, useCallback } from 'react';
import * as SecureStore from 'expo-secure-store';
import apiClient from '../api/client';

const PUSH_TOKEN_KEY = 'push_token';

export function useNotificationSettings() {
  const [enabled, setEnabled] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);

  // Charge le statut depuis le backend (ou SecureStore en fallback)
  const loadSettings = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
      if (!token) {
        setLoading(false);
        return;
      }

      const settings = await apiClient.getNotificationSettings(token);
      if (settings !== null) {
        setEnabled(settings.notifications_enabled);
        // Persister localement pour accès hors-ligne
        await SecureStore.setItemAsync(
          'notifications_enabled',
          settings.notifications_enabled ? '1' : '0'
        );
      } else {
        // Fallback sur la valeur locale
        const local = await SecureStore.getItemAsync('notifications_enabled');
        setEnabled(local !== '0');
      }
    } catch {
      const local = await SecureStore.getItemAsync('notifications_enabled');
      setEnabled(local !== '0');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  const toggle = useCallback(async (value: boolean) => {
    setToggling(true);
    try {
      const token = await SecureStore.getItemAsync(PUSH_TOKEN_KEY);
      if (!token) {
        console.log('[NotifSettings] No push token stored, cannot toggle');
        return;
      }

      const success = await apiClient.setNotificationsEnabled(token, value);
      if (success) {
        setEnabled(value);
        await SecureStore.setItemAsync('notifications_enabled', value ? '1' : '0');
        console.log(`[NotifSettings] Notifications ${value ? 'activées' : 'désactivées'}`);
      }
    } catch (err) {
      console.log('[NotifSettings] Toggle failed:', err);
    } finally {
      setToggling(false);
    }
  }, []);

  return { enabled, loading, toggling, toggle };
}
