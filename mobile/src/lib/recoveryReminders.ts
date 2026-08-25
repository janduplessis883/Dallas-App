import { supabase } from './supabase';

export type StoredRecoveryReminder = {
  date: string;
  enabled: boolean;
  id: string;
  message: string;
  notificationId: string | null;
  snoozedUntil: string | null;
  time: string;
  title: string;
};

type RecoveryReminderRow = {
  enabled: boolean;
  id: string;
  message: string;
  scheduled_at: string;
  snoozed_until: string | null;
  status: 'scheduled' | 'processing' | 'delivered' | 'cancelled';
  title: string;
};

export async function getReminderUserId() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session?.user.id ?? null;
}

export async function loadRecoveryReminders(userId: string, localReminders: StoredRecoveryReminder[]) {
  const { data, error } = await supabase
    .from('recovery_reminders')
    .select('enabled, id, message, scheduled_at, snoozed_until, status, title')
    .eq('user_id', userId)
    .order('scheduled_at', { ascending: true });

  if (error) {
    throw error;
  }

  const localNotificationIds = new Map(localReminders.map((reminder) => [reminder.id, reminder.notificationId]));

  return ((data ?? []) as RecoveryReminderRow[]).map((row) => toStoredReminder(row, localNotificationIds.get(row.id) ?? null));
}

export async function saveRecoveryReminder(userId: string, reminder: StoredRecoveryReminder, scheduledAt: Date) {
  const { error } = await supabase.from('recovery_reminders').upsert({
    enabled: reminder.enabled,
    id: reminder.id,
    message: reminder.message,
    next_attempt_at: scheduledAt.toISOString(),
    scheduled_at: scheduledAt.toISOString(),
    snoozed_until: reminder.snoozedUntil,
    status: reminder.enabled ? 'scheduled' : 'cancelled',
    time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    title: reminder.title,
    updated_at: new Date().toISOString(),
    user_id: userId,
  });

  if (error) {
    throw error;
  }
}

export async function disableRecoveryReminder(userId: string, reminderId: string, snoozedUntil: string | null = null) {
  const { error } = await supabase
    .from('recovery_reminders')
    .update({
      enabled: false,
      snoozed_until: snoozedUntil,
      status: 'cancelled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', reminderId)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
}

export async function deleteRecoveryReminder(userId: string, reminderId: string) {
  const { error } = await supabase
    .from('recovery_reminders')
    .delete()
    .eq('id', reminderId)
    .eq('user_id', userId);

  if (error) {
    throw error;
  }
}

function toStoredReminder(row: RecoveryReminderRow, notificationId: string | null): StoredRecoveryReminder {
  const scheduledAt = new Date(row.scheduled_at);

  return {
    date: `${scheduledAt.getFullYear()}-${String(scheduledAt.getMonth() + 1).padStart(2, '0')}-${String(scheduledAt.getDate()).padStart(2, '0')}`,
    enabled: row.enabled && row.status !== 'delivered' && row.status !== 'cancelled',
    id: row.id,
    message: row.message,
    notificationId,
    snoozedUntil: row.snoozed_until,
    time: `${String(scheduledAt.getHours()).padStart(2, '0')}:${String(scheduledAt.getMinutes()).padStart(2, '0')}`,
    title: row.title,
  };
}
