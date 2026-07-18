import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { supabase } from './supabase';

export const notificationChannelId = 'recovery-reminders';

type NotificationPermissionResult = Notifications.NotificationPermissionsStatus & {
  granted?: boolean;
  status?: string;
};

function hasGrantedNotificationPermission(permissions: Notifications.NotificationPermissionsStatus) {
  const permissionResult = permissions as NotificationPermissionResult;

  return permissionResult.granted ?? permissionResult.status === 'granted';
}

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export async function registerForPushNotificationsAsync() {
  if (!Device.isDevice) {
    throw new Error('Push notifications need a physical device.');
  }

  await ensureNotificationChannelAsync();

  const existingPermission = await Notifications.getPermissionsAsync();
  let permissionGranted = hasGrantedNotificationPermission(existingPermission);

  if (!permissionGranted) {
    const requestedPermission = await Notifications.requestPermissionsAsync();
    permissionGranted = hasGrantedNotificationPermission(requestedPermission);
  }

  if (!permissionGranted) {
    return null;
  }

  const token = await getExpoPushToken();

  return token.data;
}

export async function ensureNotificationChannelAsync() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(notificationChannelId, {
      name: 'Recovery reminders',
      importance: Notifications.AndroidImportance.HIGH,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      sound: 'default',
      vibrationPattern: [0, 500, 250, 500],
    });
  }
}

export async function registerAndSavePushTokenAsync(userId: string) {
  const token = await registerForPushNotificationsAsync();

  if (!token) {
    return null;
  }

  await savePushTokenAsync(userId, token);

  return token;
}

export async function syncGrantedPushTokenAsync(userId: string) {
  await ensureNotificationChannelAsync();

  if (!Device.isDevice) {
    return null;
  }

  const permissions = await Notifications.getPermissionsAsync();

  if (!hasGrantedNotificationPermission(permissions)) {
    return null;
  }

  const token = await getExpoPushToken();
  await savePushTokenAsync(userId, token.data);

  return token.data;
}

async function getExpoPushToken() {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

  return Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
}

async function savePushTokenAsync(userId: string, token: string) {
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
}
