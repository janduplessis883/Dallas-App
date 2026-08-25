import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { Link, useLocalSearchParams } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { deviceStorage } from '../src/lib/deviceStorage';
import { ensureNotificationChannelAsync, notificationChannelId } from '../src/lib/notifications';
import {
  deleteRecoveryReminder,
  disableRecoveryReminder,
  getReminderUserId,
  loadRecoveryReminders,
  saveRecoveryReminder,
  type StoredRecoveryReminder,
} from '../src/lib/recoveryReminders';
import { EmptyState } from '../src/components/EmptyState';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { SectionCard } from '../src/components/SectionCard';

const remindersStorageKey = 'dallas.reminders';
const quietHoursStorageKey = 'dallas.reminder-quiet-hours';
const reminderMigrationKeyPrefix = 'dallas.reminders.server-migrated.';

type Reminder = StoredRecoveryReminder;

type QuietHours = {
  enabled: boolean;
  end: string;
  start: string;
};

type NotificationPermissionResult = Notifications.NotificationPermissionsStatus & {
  canAskAgain?: boolean;
  granted?: boolean;
  status?: string;
};

function getPermissionStatusLabel(permissions: Notifications.NotificationPermissionsStatus) {
  const permissionResult = permissions as NotificationPermissionResult;

  if (permissionResult.granted ?? permissionResult.status === 'granted') {
    return 'granted';
  }

  return permissionResult.canAskAgain ? 'undetermined' : 'denied';
}

function hasGrantedNotificationPermission(permissions: Notifications.NotificationPermissionsStatus) {
  return getPermissionStatusLabel(permissions) === 'granted';
}

function getTomorrowDate() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return formatDate(date);
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getReminderDate(date: string, time: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) {
    return null;
  }

  const parsed = new Date(`${date}T${time}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatReminderDate(date: string, time: string) {
  const parsed = getReminderDate(date, time);
  return parsed
    ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed)
    : `${date} at ${time}`;
}

function isTimeInQuietHours(time: string, start: string, end: string) {
  if (start === end) {
    return false;
  }

  return start < end ? time >= start && time < end : time >= start || time < end;
}

function adjustForQuietHours(date: Date, quietHours: QuietHours) {
  if (!quietHours.enabled || !isTimeInQuietHours(formatTime(date), quietHours.start, quietHours.end)) {
    return date;
  }

  const next = new Date(date);
  if (quietHours.start >= quietHours.end || formatTime(date) >= quietHours.start) {
    next.setDate(next.getDate() + 1);
  }
  const [hour, minute] = quietHours.end.split(':').map(Number);
  next.setHours(hour, minute, 0, 0);
  return next;
}

function formatTime(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export default function RemindersScreen() {
  const { reminderId } = useLocalSearchParams<{ reminderId?: string }>();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [permissionStatus, setPermissionStatus] = useState('Checking...');
  const [scheduledCount, setScheduledCount] = useState(0);
  const [working, setWorking] = useState(false);
  const [showTestTools, setShowTestTools] = useState(false);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [titleInput, setTitleInput] = useState('');
  const [messageInput, setMessageInput] = useState('');
  const [dateInput, setDateInput] = useState(getTomorrowDate());
  const [timeInput, setTimeInput] = useState('18:00');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [previewReminder, setPreviewReminder] = useState<Reminder | null>(null);
  const [quietHours, setQuietHours] = useState<QuietHours>({ enabled: false, end: '07:00', start: '22:00' });
  const [savingQuietHours, setSavingQuietHours] = useState(false);

  useEffect(() => {
    refreshNotificationStatus();
  }, []);

  async function refreshNotificationStatus() {
    setLoading(true);
    try {
      const permissions = await Notifications.getPermissionsAsync();
      const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();

      setPermissionStatus(getPermissionStatusLabel(permissions));
      setScheduledCount(scheduledNotifications.length);
      const stored = await loadStoredReminders();
      const durableReminders = await loadDurableReminders(stored);
      const storedQuietHours = await loadQuietHours();
      setReminders(durableReminders);
      setQuietHours(storedQuietHours);
      if (reminderId) {
        const linkedReminder = durableReminders.find((reminder) => reminder.id === reminderId);
        if (linkedReminder) {
          startEditingReminder(linkedReminder);
        }
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not load reminders.');
    } finally {
      setLoading(false);
    }
  }

  async function loadStoredReminders() {
    const value = await deviceStorage.getItem(remindersStorageKey);

    if (!value) {
      return [];
    }

    try {
      const parsed = JSON.parse(value) as Reminder[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async function saveStoredReminders(nextReminders: Reminder[]) {
    await deviceStorage.setItem(remindersStorageKey, JSON.stringify(nextReminders));
    setReminders(nextReminders);
  }

  async function loadDurableReminders(localReminders: Reminder[]) {
    const userId = await getReminderUserId();

    if (!userId) {
      return localReminders;
    }

    const migrationKey = `${reminderMigrationKeyPrefix}${userId}`;
    const migrated = await deviceStorage.getItem(migrationKey);

    if (!migrated) {
      for (const reminder of localReminders) {
        const scheduledAt = getReminderDate(reminder.date, reminder.time);
        if (scheduledAt) {
          await saveRecoveryReminder(userId, reminder, scheduledAt);
        }
      }
      await deviceStorage.setItem(migrationKey, 'true');
    }

    const durableReminders = await loadRecoveryReminders(userId, localReminders);
    await saveStoredReminders(durableReminders);
    return durableReminders;
  }

  async function requireReminderUserId() {
    const userId = await getReminderUserId();
    if (!userId) {
      throw new Error('Sign in before saving a reminder.');
    }
    return userId;
  }

  async function loadQuietHours(): Promise<QuietHours> {
    const value = await deviceStorage.getItem(quietHoursStorageKey);
    if (!value) {
      return { enabled: false, end: '07:00', start: '22:00' };
    }
    try {
      return JSON.parse(value) as QuietHours;
    } catch {
      return { enabled: false, end: '07:00', start: '22:00' };
    }
  }

  async function handleSaveQuietHours() {
    setSavingQuietHours(true);
    setMessage('');

    try {
      await deviceStorage.setItem(quietHoursStorageKey, JSON.stringify(quietHours));
      setMessage(quietHours.enabled ? `Quiet hours saved: ${quietHours.start}–${quietHours.end}.` : 'Quiet hours turned off.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save quiet hours.');
    } finally {
      setSavingQuietHours(false);
    }
  }

  async function scheduleReminder(reminder: Reminder) {
    const parsedDate = getReminderDate(reminder.date, reminder.time);

    if (!parsedDate || parsedDate.getTime() <= Date.now()) {
      throw new Error('Choose a future date and time for this reminder.');
    }

    await ensureNotificationChannelAsync();
    const permissions = await Notifications.getPermissionsAsync();
    let permissionGranted = hasGrantedNotificationPermission(permissions);

    if (!permissionGranted) {
      const requestedPermissions = await Notifications.requestPermissionsAsync();
      permissionGranted = hasGrantedNotificationPermission(requestedPermissions);
      setPermissionStatus(getPermissionStatusLabel(requestedPermissions));
    }

    if (!permissionGranted) {
      throw new Error('Allow notifications before saving a reminder.');
    }

    const scheduledDate = adjustForQuietHours(parsedDate, quietHours);

    return Notifications.scheduleNotificationAsync({
      content: {
        body: reminder.message || 'Take a moment to reconnect with your plan.',
        data: { reminderId: reminder.id, route: '/reminders', type: 'recovery_reminder' },
        sound: 'default',
        title: reminder.title,
      },
      trigger: {
        channelId: notificationChannelId,
        date: scheduledDate,
        type: Notifications.SchedulableTriggerInputTypes.DATE,
      } as Notifications.NotificationTriggerInput,
    });
  }

  async function handleSaveReminder() {
    if (!titleInput.trim()) {
      setMessage('Add a short title for this reminder.');
      return;
    }

    setWorking(true);
    setMessage('');

    try {
      const existing = reminders.find((reminder) => reminder.id === editingId);
      const userId = await requireReminderUserId();
      const parsedDate = getReminderDate(dateInput, timeInput);

      if (!parsedDate || parsedDate.getTime() <= Date.now()) {
        throw new Error('Choose a future date and time for this reminder.');
      }

      const scheduledAt = adjustForQuietHours(parsedDate, quietHours);

      if (existing?.notificationId) {
        await Notifications.cancelScheduledNotificationAsync(existing.notificationId).catch(() => null);
      }

      const nextReminder: Reminder = {
        date: dateInput,
        enabled: true,
        id: editingId ?? String(Date.now()),
        message: messageInput.trim(),
        notificationId: null,
        time: timeInput,
        title: titleInput.trim(),
        snoozedUntil: null,
      };
      await saveRecoveryReminder(userId, nextReminder, scheduledAt);
      nextReminder.notificationId = await scheduleReminder(nextReminder);
      const nextReminders = editingId
        ? reminders.map((reminder) => reminder.id === editingId ? nextReminder : reminder)
        : [nextReminder, ...reminders];

      await saveStoredReminders(nextReminders);
      resetReminderForm();
      setMessage('Reminder saved.');
      await refreshNotificationStatus();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not save this reminder.');
    } finally {
      setWorking(false);
    }
  }

  async function handleDeleteReminder(reminder: Reminder) {
    setWorking(true);
    try {
      const userId = await requireReminderUserId();
      await deleteRecoveryReminder(userId, reminder.id);
      if (reminder.notificationId) {
        await Notifications.cancelScheduledNotificationAsync(reminder.notificationId).catch(() => null);
      }
      await saveStoredReminders(reminders.filter((item) => item.id !== reminder.id));
      setMessage('Reminder removed.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not remove this reminder.');
    } finally {
      setWorking(false);
      await refreshNotificationStatus();
    }
  }

  async function handleSnoozeReminder(reminder: Reminder) {
    setWorking(true);
    try {
      const userId = await requireReminderUserId();
      const snoozedUntil = formatDate(new Date());
      await disableRecoveryReminder(userId, reminder.id, snoozedUntil);
      if (reminder.notificationId) {
        await Notifications.cancelScheduledNotificationAsync(reminder.notificationId).catch(() => null);
      }
      const nextReminders = reminders.map((item) => item.id === reminder.id
        ? { ...item, enabled: false, notificationId: null, snoozedUntil }
        : item);
      await saveStoredReminders(nextReminders);
      setMessage(`${reminder.title} snoozed for today.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not snooze this reminder.');
    } finally {
      setWorking(false);
      await refreshNotificationStatus();
    }
  }

  async function handleToggleReminder(reminder: Reminder) {
    setWorking(true);
    try {
      const userId = await requireReminderUserId();
      if (reminder.notificationId) {
        await Notifications.cancelScheduledNotificationAsync(reminder.notificationId).catch(() => null);
      }
      const nextReminder: Reminder = { ...reminder, enabled: !reminder.enabled, notificationId: null };
      if (nextReminder.enabled) {
        const scheduledAt = getReminderDate(nextReminder.date, nextReminder.time);
        if (!scheduledAt || scheduledAt.getTime() <= Date.now()) {
          throw new Error('Choose a future date and time before turning this reminder back on.');
        }
        await saveRecoveryReminder(userId, nextReminder, scheduledAt);
        nextReminder.notificationId = await scheduleReminder(nextReminder);
      } else {
        await disableRecoveryReminder(userId, nextReminder.id);
      }
      await saveStoredReminders(reminders.map((item) => item.id === reminder.id ? nextReminder : item));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not update this reminder.');
    } finally {
      setWorking(false);
      await refreshNotificationStatus();
    }
  }

  function startEditingReminder(reminder: Reminder) {
    setEditingId(reminder.id);
    setTitleInput(reminder.title);
    setMessageInput(reminder.message);
    setDateInput(reminder.date);
    setTimeInput(reminder.time);
  }

  function resetReminderForm() {
    setEditingId(null);
    setTitleInput('');
    setMessageInput('');
    setDateInput(getTomorrowDate());
    setTimeInput('18:00');
  }

  async function requestPermissions() {
    setWorking(true);
    setMessage('');

    const permissions = await Notifications.requestPermissionsAsync();
    const permissionGranted = hasGrantedNotificationPermission(permissions);

    setPermissionStatus(getPermissionStatusLabel(permissions));
    setWorking(false);
    setMessage(permissionGranted ? 'Notifications are allowed.' : 'Notifications are not allowed yet.');
  }

  async function sendTestNotification() {
    setWorking(true);
    setMessage('');

    const permissions = await Notifications.getPermissionsAsync();
    let permissionGranted = hasGrantedNotificationPermission(permissions);

    if (!permissionGranted) {
      const requestedPermissions = await Notifications.requestPermissionsAsync();
      permissionGranted = hasGrantedNotificationPermission(requestedPermissions);
      setPermissionStatus(getPermissionStatusLabel(requestedPermissions));
    }

    if (!permissionGranted) {
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
          <ActivityIndicator color="#2E4737" />
          <Text style={styles.loadingText}>Checking notifications...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.eyebrow}>Reminders</Text>
        <Text style={styles.title}>Your reminders</Text>
        <Text style={styles.copy}>
          Gentle prompts can help you stay connected to your plan. You can change or clear reminders at any time.
        </Text>

        <View style={styles.statusPanel}>
          <InfoRow label="Permission" value={permissionStatus} />
          <InfoRow label="Active reminders" value={String(reminders.filter((reminder) => reminder.enabled).length)} />
          <InfoRow label="Scheduled on device" value={String(scheduledCount)} />
        </View>

        <SectionCard title="Quiet hours" description="Reminders scheduled during this window move to the end of quiet hours.">
          <View style={styles.quietToggleRow}>
            <Text style={styles.quietToggleLabel}>{quietHours.enabled ? 'Quiet hours on' : 'Quiet hours off'}</Text>
            <Pressable accessibilityRole="switch" accessibilityState={{ checked: quietHours.enabled }} onPress={() => setQuietHours((current) => ({ ...current, enabled: !current.enabled }))}>
              <Text style={styles.actionText}>{quietHours.enabled ? 'On' : 'Off'}</Text>
            </Pressable>
          </View>
          <View style={styles.formRow}>
            <TextInput accessibilityLabel="Quiet hours start" placeholder="22:00" placeholderTextColor="#768277" style={[styles.input, styles.halfInput]} value={quietHours.start} onChangeText={(start) => setQuietHours((current) => ({ ...current, start }))} />
            <TextInput accessibilityLabel="Quiet hours end" placeholder="07:00" placeholderTextColor="#768277" style={[styles.input, styles.halfInput]} value={quietHours.end} onChangeText={(end) => setQuietHours((current) => ({ ...current, end }))} />
          </View>
          <Pressable
            disabled={savingQuietHours}
            style={[styles.secondaryButton, savingQuietHours && styles.disabledButton]}
            onPress={handleSaveQuietHours}
          >
            <Text style={styles.secondaryButtonText}>{savingQuietHours ? 'Updating...' : 'Save quiet hours'}</Text>
          </Pressable>
        </SectionCard>

        <SectionCard title={editingId ? 'Edit reminder' : 'Add a reminder'}>
          <TextInput
            placeholder="Reminder title"
            placeholderTextColor="#768277"
            style={styles.input}
            value={titleInput}
            onChangeText={setTitleInput}
          />
          <TextInput
            placeholder="Optional message"
            placeholderTextColor="#768277"
            style={[styles.input, styles.multilineInput]}
            multiline
            textAlignVertical="top"
            value={messageInput}
            onChangeText={setMessageInput}
          />
          <View style={styles.formRow}>
            <TextInput
              accessibilityLabel="Reminder date in YYYY-MM-DD format"
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#768277"
              style={[styles.input, styles.halfInput]}
              value={dateInput}
              onChangeText={setDateInput}
            />
            <TextInput
              accessibilityLabel="Reminder time in 24-hour format"
              placeholder="18:00"
              placeholderTextColor="#768277"
              style={[styles.input, styles.halfInput]}
              value={timeInput}
              onChangeText={setTimeInput}
            />
          </View>
          <PrimaryButton loading={working} onPress={handleSaveReminder}>{editingId ? 'Save changes' : 'Add reminder'}</PrimaryButton>
          {editingId ? (
            <Pressable style={styles.textButton} onPress={resetReminderForm}>
              <Text style={styles.textButtonText}>Cancel editing</Text>
            </Pressable>
          ) : null}
        </SectionCard>

        <View style={styles.reminderList}>
          <Text style={styles.sectionTitle}>Scheduled reminders</Text>
          {reminders.length ? reminders.map((reminder) => (
            <View key={reminder.id} style={styles.reminderRow}>
              <View style={styles.reminderCopy}>
                <Text style={styles.reminderTitle}>{reminder.title}</Text>
                <Text style={styles.reminderMeta}>{formatReminderDate(reminder.date, reminder.time)}</Text>
                {reminder.message ? <Text style={styles.reminderMessage}>{reminder.message}</Text> : null}
              </View>
              <View style={styles.reminderActions}>
                <Pressable accessibilityRole="switch" accessibilityState={{ checked: reminder.enabled }} onPress={() => handleToggleReminder(reminder)}>
                  <Text style={[styles.toggleText, reminder.enabled ? styles.enabledText : styles.disabledText]}>{reminder.enabled ? 'On' : 'Off'}</Text>
                </Pressable>
                <Pressable style={styles.actionPressable} onPress={() => startEditingReminder(reminder)}><Text style={styles.actionText}>Edit</Text></Pressable>
                <Pressable style={styles.actionPressable} onPress={() => setPreviewReminder(reminder)}><Text style={styles.actionText}>Preview</Text></Pressable>
                {reminder.enabled ? <Pressable style={styles.actionPressable} onPress={() => handleSnoozeReminder(reminder)}><Text style={styles.actionText}>Snooze</Text></Pressable> : null}
                <Pressable style={styles.actionPressable} onPress={() => handleDeleteReminder(reminder)}><Text style={styles.deleteText}>Delete</Text></Pressable>
              </View>
            </View>
          )) : <EmptyState title="No reminders yet" description="Add one for a planned check-in or supportive routine." />}
        </View>

        {previewReminder ? (
          <View style={styles.previewPanel}>
            <Text style={styles.previewEyebrow}>Notification preview</Text>
            <Text style={styles.previewTitle}>{previewReminder.title}</Text>
            <Text style={styles.previewBody}>{previewReminder.message || 'Take a moment to reconnect with your plan.'}</Text>
            <Pressable style={styles.textButton} onPress={() => setPreviewReminder(null)}><Text style={styles.textButtonText}>Close preview</Text></Pressable>
          </View>
        ) : null}

        {permissionStatus !== 'granted' ? (
          <View style={styles.permissionPanel}>
            <Text style={styles.permissionTitle}>Notifications are not active</Text>
            <Text style={styles.permissionCopy}>{permissionStatus === 'denied' ? 'Notifications are blocked. Open your device settings, allow Dallas notifications, then return here.' : 'Allow notifications if you want Dallas to remind you about planned check-ins.'}</Text>
            {permissionStatus !== 'denied' ? <PrimaryButton loading={working} onPress={requestPermissions}>Allow reminders</PrimaryButton> : null}
          </View>
        ) : null}

        {message ? <Text style={styles.message}>{message}</Text> : null}

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
    backgroundColor: '#F7F7F5',
  },
  container: {
    gap: 18,
    minHeight: '100%',
    padding: 24,
    paddingBottom: 136,
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
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 39,
  },
  copy: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 16,
    lineHeight: 24,
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
  },
  statusPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
    borderRadius: 10,
    borderWidth: 1,
  },
  editorPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  quietToggleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  quietToggleLabel: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '800',
  },
  sectionTitle: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 17,
    fontWeight: '900',
  },
  input: {
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 15,
    minHeight: 46,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  multilineInput: {
    minHeight: 72,
  },
  formRow: {
    flexDirection: 'row',
    gap: 8,
  },
  halfInput: {
    flex: 1,
  },
  reminderList: {
    gap: 10,
  },
  reminderRow: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  reminderCopy: {
    gap: 3,
  },
  reminderTitle: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 15,
    fontWeight: '900',
  },
  reminderMeta: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '800',
  },
  reminderMessage: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 13,
    lineHeight: 18,
  },
  reminderActions: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 16,
  },
  toggleText: {
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '900',
  },
  enabledText: {
    color: '#829480',
  },
  disabledText: {
    color: '#768277',
  },
  actionText: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '900',
  },
  actionPressable: {
    justifyContent: 'center',
    minHeight: 44,
  },
  deleteText: {
    color: '#A33D32',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '900',
  },
  emptyText: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 14,
    lineHeight: 20,
  },
  previewPanel: {
    backgroundColor: '#EEF1EC',
    borderColor: '#BFD1C8',
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
    padding: 14,
  },
  previewEyebrow: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  previewTitle: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '900',
  },
  previewBody: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 14,
    lineHeight: 20,
  },
  textButton: {
    alignItems: 'center',
    minHeight: 34,
    justifyContent: 'center',
  },
  textButtonText: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '800',
  },
  permissionPanel: {
    backgroundColor: '#FFF8E8',
    borderColor: '#E0A52B',
    borderRadius: 10,
    borderWidth: 1,
    gap: 10,
    padding: 14,
  },
  permissionTitle: {
    color: '#6F3517',
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '900',
  },
  permissionCopy: {
    color: '#6F3517',
    fontFamily: 'Manrope',
    fontSize: 14,
    lineHeight: 20,
  },
  testPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
    borderRadius: 10,
    borderWidth: 1,
  },
  testHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    minHeight: 50,
    paddingHorizontal: 14,
  },
  testTitle: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 15,
    fontWeight: '900',
  },
  testToggle: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '800',
  },
  testBody: {
    borderTopColor: '#E7E6E2',
    borderTopWidth: 1,
    gap: 10,
    padding: 14,
  },
  testCopy: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 13,
    lineHeight: 18,
  },
  infoRow: {
    borderBottomColor: '#E7E6E2',
    borderBottomWidth: 1,
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  infoLabel: {
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '800',
  },
  infoValue: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '900',
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#2E4737',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 18,
  },
  buttonText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#2E4737',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 18,
  },
  secondaryButtonText: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '900',
  },
  disabledButton: {
    opacity: 0.64,
  },
  loadingText: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '700',
  },
  message: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
});
