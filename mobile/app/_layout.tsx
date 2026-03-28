// Layout principal de l'application
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  registerForPushNotifications,
  sendPushTokenToServer,
  addNotificationResponseListener
} from '../src/services/notifications';
import { router } from 'expo-router';
import { colors } from '../src/theme';

export default function RootLayout() {
  useEffect(() => {
    registerForPushNotifications().then((token) => {
      if (token) {
        sendPushTokenToServer(token);
      }
    });

    const subscription = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data;
      const eventId = data?.event_id || data?.alertId;
      if (eventId) {
        router.push(`/alert/${eventId}`);
      }
    });

    return () => subscription.remove();
  }, []);

  return (
    <>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.textPrimary,
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen
          name="index"
          options={{ title: 'Connexion', headerShown: false }}
        />
        <Stack.Screen
          name="alerts"
          options={{ title: 'Alertes', headerShown: false, headerBackVisible: false }}
        />
        <Stack.Screen
          name="alert/[id]"
          options={{ title: 'Detail Alerte' }}
        />
        <Stack.Screen
          name="profile"
          options={{ title: 'Mon profil' }}
        />
      </Stack>
    </>
  );
}
