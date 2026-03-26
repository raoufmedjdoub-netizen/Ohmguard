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
  const [mustChangePassword, setMustChangePassword] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const token = await apiClient.getToken();
      if (token) {
        const userData = await apiClient.getCurrentUser();
        setUser(userData as User);
        setTimeout(() => { router.replace('/alerts'); }, 100);
      }
    } catch (err: any) {
      await apiClient.clearTokens();
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const login = async (email: string, password: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.login(email, password);

      // Check if user must change password
      if (response.must_change_password) {
        setMustChangePassword(true);
        setLoading(false);
        return { mustChangePassword: true };
      }

      const userData = await apiClient.getCurrentUser();
      setUser(userData as User);
      router.replace('/alerts');
      return { mustChangePassword: false };
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      await apiClient.changePassword(currentPassword, newPassword);
      setMustChangePassword(false);
      // Fetch user and navigate
      const userData = await apiClient.getCurrentUser();
      setUser(userData as User);
      router.replace('/alerts');
    } catch (err: any) {
      throw err;
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      // Delete push token from server before logout
      const pushToken = await SecureStore.getItemAsync('push_token');
      if (pushToken) {
        await apiClient.deletePushToken(pushToken);
        await SecureStore.deleteItemAsync('push_token');
      }
      await apiClient.logout();
      setUser(null);
      router.replace('/');
    } finally {
      setLoading(false);
    }
  };

  return { user, loading, error, mustChangePassword, login, logout, changePassword, checkAuth };
}
