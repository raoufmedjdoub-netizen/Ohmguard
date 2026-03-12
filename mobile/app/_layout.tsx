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

export default function RootLayout() {
  useEffect(() => {
    // Initialiser les notifications push et enregistrer le token
    registerForPushNotifications().then((token) => {
      if (token) {
        sendPushTokenToServer(token);
      }
    });

    // Gérer le tap sur une notification (ouvre le détail de l'alerte)
    // Le backend envoie event_id dans data
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
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#DC2626' },
          headerTintColor: '#fff',
          headerTitleStyle: { fontWeight: 'bold' },
          contentStyle: { backgroundColor: '#111' },
        }}
      >
        <Stack.Screen 
          name="index" 
          options={{ 
            title: 'Connexion',
            headerShown: false,
          }} 
        />
        <Stack.Screen 
          name="alerts" 
          options={{ 
            title: 'Alertes',
            headerBackVisible: false,
          }} 
        />
        <Stack.Screen 
          name="alert/[id]" 
          options={{ 
            title: 'Détail Alerte',
          }} 
        />
      </Stack>
    </>
  );
}
