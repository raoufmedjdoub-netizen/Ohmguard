// Hook d'authentification
import { useState, useEffect, useCallback } from 'react';
import { router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import apiClient from '../api/client';
import type { User } from '../types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    console.log('[Auth] Checking authentication...');
    try {
      const token = await apiClient.getToken();
      if (token) {
        console.log('[Auth] Token found, verifying...');
        const userData = await apiClient.getCurrentUser();
        console.log('[Auth] User verified:', userData);
        setUser(userData as User);
        // Si on est sur la page de login et qu'on est connecté, rediriger vers alerts
        setTimeout(() => {
          router.replace('/alerts');
        }, 100);
      } else {
        console.log('[Auth] No token found');
      }
    } catch (err: any) {
      console.log('[Auth] Auth check failed:', err.message);
      await apiClient.clearToken();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string, password: string) => {
    console.log('[Auth] Login attempt for:', email);
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.login(email, password);
      console.log('[Auth] Login successful');
      setUser(response.user || { email, full_name: email, id: '', role: 'user' });
      router.replace('/alerts');
    } catch (err: any) {
      console.log('[Auth] Login failed:', err.message);
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    console.log('[Auth] Logging out...');
    setLoading(true);
    try {
      // Supprimer le push token du serveur avant de se déconnecter
      // pour ne plus recevoir de notifications sur cet appareil
      const pushToken = await SecureStore.getItemAsync('push_token');
      if (pushToken) {
        await apiClient.deletePushToken(pushToken);
        await SecureStore.deleteItemAsync('push_token');
        console.log('[Auth] Push token deleted from server');
      }
      await apiClient.logout();
      setUser(null);
      router.replace('/');
    } finally {
      setLoading(false);
    }
  };

  return { user, loading, error, login, logout, checkAuth };
}
