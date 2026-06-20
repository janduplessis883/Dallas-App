import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function RemindersScreen() {
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [permissionStatus, setPermissionStatus] = useState('Checking...');
  const [scheduledCount, setScheduledCount] = useState(0);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    refreshNotificationStatus();
  }, []);

  async function refreshNotificationStatus() {
    setLoading(true);

    const permissions = await Notifications.getPermissionsAsync();
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();

    setPermissionStatus(permissions.status);
    setScheduledCount(scheduledNotifications.length);
    setLoading(false);
  }

  async function requestPermissions() {
    setWorking(true);
    setMessage('');

    const permissions = await Notifications.requestPermissionsAsync();

    setPermissionStatus(permissions.status);
    setWorking(false);
    setMessage(permissions.status === 'granted' ? 'Notifications are allowed.' : 'Notifications are not allowed yet.');
  }

  async function sendTestNotification() {
    setWorking(true);
    setMessage('');

    const permissions = await Notifications.getPermissionsAsync();
    let finalStatus = permissions.status;

    if (finalStatus !== 'granted') {
      const requestedPermissions = await Notifications.requestPermissionsAsync();
      finalStatus = requestedPermissions.status;
      setPermissionStatus(finalStatus);
    }

    if (finalStatus !== 'granted') {
      setWorking(false);
      setMessage('Allow notifications before sending a test.');
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        body: 'This is a local notification test from Dallas.',
        sound: false,
        title: 'Dallas reminder test',
      },
      trigger: {
        seconds: 5,
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      },
    });

    await refreshNotificationStatus();
    setWorking(false);
    setMessage('Test notification scheduled. Background the app and wait 5 seconds.');
  }

  async function cancelScheduledNotifications() {
    setWorking(true);
    setMessage('');

    await Notifications.cancelAllScheduledNotificationsAsync();
    await refreshNotificationStatus();

    setWorking(false);
    setMessage('Scheduled notifications cleared.');
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centerPanel}>
          <ActivityIndicator color="#38635D" />
          <Text style={styles.loadingText}>Checking notifications...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>Reminders</Text>
        <Text style={styles.title}>Notification test</Text>
        <Text style={styles.copy}>
          Send a local notification from the simulator or device. For the cleanest test, tap the button, background the
          app, and wait a few seconds.
        </Text>

        <View style={styles.panel}>
          <InfoRow label="Permission" value={permissionStatus} />
          <InfoRow label="Scheduled notifications" value={String(scheduledCount)} />
        </View>

        <Pressable disabled={working} style={[styles.button, working && styles.disabledButton]} onPress={sendTestNotification}>
          <Text style={styles.buttonText}>{working ? 'Working...' : 'Send test notification'}</Text>
        </Pressable>

        <Pressable disabled={working} style={[styles.secondaryButton, working && styles.disabledButton]} onPress={requestPermissions}>
          <Text style={styles.secondaryButtonText}>Request permission</Text>
        </Pressable>

        <Pressable
          disabled={working}
          style={[styles.secondaryButton, working && styles.disabledButton]}
          onPress={cancelScheduledNotifications}
        >
          <Text style={styles.secondaryButtonText}>Clear scheduled notifications</Text>
        </Pressable>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Link href="/" asChild>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back home</Text>
          </Pressable>
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F3EA',
  },
  container: {
    gap: 18,
    minHeight: '100%',
    padding: 24,
    paddingTop: 36,
  },
  centerPanel: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'center',
    padding: 24,
  },
  eyebrow: {
    color: '#38635D',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: '#17211F',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 39,
  },
  copy: {
    color: '#4F5D58',
    fontSize: 16,
    lineHeight: 24,
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
  },
  infoRow: {
    borderBottomColor: '#ECE5D8',
    borderBottomWidth: 1,
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoLabel: {
    color: '#697570',
    fontSize: 13,
    fontWeight: '800',
  },
  infoValue: {
    color: '#17211F',
    fontSize: 16,
    fontWeight: '900',
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#38635D',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 18,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#38635D',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: '#38635D',
    fontSize: 16,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.64,
  },
  loadingText: {
    color: '#4F5D58',
    fontSize: 14,
    fontWeight: '700',
  },
  message: {
    color: '#4F5D58',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
});
