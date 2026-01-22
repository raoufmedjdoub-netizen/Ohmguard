// Layout principal de l'application
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { 
  registerForPushNotifications,
  addNotificationResponseListener 
} from '../src/services/notifications';
import { router } from 'expo-router';

export default function RootLayout() {
  useEffect(() => {
    // Initialiser les notifications push
    registerForPushNotifications();

    // Gérer le tap sur une notification
    const subscription = addNotificationResponseListener((response) => {
      const alertId = response.notification.request.content.data?.alertId;
      if (alertId) {
        router.push(`/alert/${alertId}`);
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
