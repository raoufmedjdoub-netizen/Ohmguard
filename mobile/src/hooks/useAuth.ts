// Hook d'authentification
import { useState, useEffect, useCallback } from 'react';
import { router } from 'expo-router';
import apiClient from '../api/client';
import type { User } from '../types';

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const checkAuth = useCallback(async () => {
    try {
      const token = await apiClient.getToken();
      if (token) {
        const userData = await apiClient.getCurrentUser();
        setUser(userData as User);
      }
    } catch (err) {
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
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.login(email, password);
      setUser(response.user);
      router.replace('/alerts');
    } catch (err: any) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    setLoading(true);
    try {
      await apiClient.logout();
      setUser(null);
      router.replace('/');
    } finally {
      setLoading(false);
    }
  };

  return { user, loading, error, login, logout, checkAuth };
}
