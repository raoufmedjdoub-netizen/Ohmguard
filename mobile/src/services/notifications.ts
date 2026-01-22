// Service de notifications push
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import apiClient from '../api/client';

// Configuration des notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export async function registerForPushNotifications(): Promise<string | null> {
  if (!Device.isDevice) {
    console.log('Push notifications require a physical device');
    return null;
  }

  // Demander les permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') {
    console.log('Permission for notifications denied');
    return null;
  }

  // Obtenir le token Expo Push
  const token = await Notifications.getExpoPushTokenAsync({
    projectId: 'your-project-id', // Remplacer par votre projectId EAS
  });

  // Configuration Android
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('alerts', {
      name: 'Alertes de chute',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 500, 250, 500],
      lightColor: '#DC2626',
      sound: 'alert.wav',
    });
  }

  return token.data;
}

export async function sendPushTokenToServer(pushToken: string) {
  try {
    // Envoyer le token au backend pour les notifications
    // À implémenter côté backend si nécessaire
    console.log('Push token:', pushToken);
  } catch (error) {
    console.error('Error sending push token:', error);
  }
}

export function addNotificationReceivedListener(
  callback: (notification: Notifications.Notification) => void
) {
  return Notifications.addNotificationReceivedListener(callback);
}

export function addNotificationResponseListener(
  callback: (response: Notifications.NotificationResponse) => void
) {
  return Notifications.addNotificationResponseReceivedListener(callback);
}

// Notification locale pour tester
export async function sendLocalNotification(title: string, body: string, data?: any) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      sound: 'alert.wav',
      priority: Notifications.AndroidNotificationPriority.MAX,
      data,
    },
    trigger: null, // Immédiat
  });
}
