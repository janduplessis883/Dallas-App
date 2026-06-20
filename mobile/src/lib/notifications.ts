import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    throw new Error('Push notifications need a physical device.');
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('recovery-reminders', {
      name: 'Recovery reminders',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const existingPermission = await Notifications.getPermissionsAsync();
  let finalStatus = existingPermission.status;

  if (existingPermission.status !== 'granted') {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermission.status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  const token = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined,
  );

  return token.data;
}

export async function registerAndSavePushTokenAsync(userId: string) {
  const token = await registerForPushNotificationsAsync();

  if (!token) {
    return null;
  }

  const { error } = await supabase.from('push_tokens').upsert(
    {
      last_seen_at: new Date().toISOString(),
      platform: Platform.OS,
      token,
      user_id: userId,
    },
    { onConflict: 'token' },
  );

  if (error) {
    throw error;
  }

  return token;
}
