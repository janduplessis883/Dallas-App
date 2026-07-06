import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';

import { ensureNotificationChannelAsync, notificationChannelId, syncGrantedPushTokenAsync } from '../src/lib/notifications';
import { supabase } from '../src/lib/supabase';

type EventPlanField =
  | 'event_name'
  | 'event_date'
  | 'event_location'
  | 'event_who'
  | 'last_time'
  | 'body_warning'
  | 'ideal_outcome'
  | 'mantra'
  | 'phone_background'
  | 'reminder_1'
  | 'reminder_2'
  | 'reminder_3'
  | 'anchor_1_name'
  | 'anchor_1_when'
  | 'anchor_2_name'
  | 'anchor_2_when'
  | 'questions_for_me'
  | 'what_to_say'
  | 'pre_arrival'
  | 'arrival_anchor'
  | 'mid_body'
  | 'mid_need'
  | 'the_line'
  | 'departure_decision'
  | 'call_who'
  | 'call_when'
  | 'call_what'
  | 'decompression'
  | 'what_worked'
  | 'what_surprised'
  | 'what_change'
  | 'revealed'
  | 'debrief_date'
  | 'debrief_who';

type EventPlanForm = Record<EventPlanField, string>;

type EventPlanRow = EventPlanForm & {
  event_reminders: EventPhoneReminder[] | null;
  id: string;
  updated_at: string;
};

type EventPhoneReminder = {
  date: string;
  id: string;
  message: string;
  notification_id: string | null;
  time: string;
};

type DallasBuddy = {
  avatar_path: string | null;
  connected_user_id: string | null;
  id: string;
  name: string;
};

type BuddyProfile = {
  avatar_path: string | null;
  display_name: string | null;
  id: string;
};

type BuddyCheckInDraft = {
  date: string;
  note: string;
  time: string;
};

type PlanSummary = {
  event_date: string | null;
  event_name: string | null;
  id: string;
  updated_at: string;
};

type FieldConfig = {
  helper?: string;
  key: EventPlanField;
  label: string;
  multiline?: boolean;
  placeholder?: string;
};

type SectionConfig = {
  description?: string;
  fields: FieldConfig[];
  title: string;
};

const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const emptyPlan: EventPlanForm = {
  event_name: '',
  event_date: '',
  event_location: '',
  event_who: '',
  last_time: '',
  body_warning: '',
  ideal_outcome: '',
  mantra: '',
  phone_background: '',
  reminder_1: '',
  reminder_2: '',
  reminder_3: '',
  anchor_1_name: '',
  anchor_1_when: '',
  anchor_2_name: '',
  anchor_2_when: '',
  questions_for_me: '',
  what_to_say: '',
  pre_arrival: '',
  arrival_anchor: '',
  mid_body: '',
  mid_need: '',
  the_line: '',
  departure_decision: '',
  call_who: '',
  call_when: '',
  call_what: '',
  decompression: '',
  what_worked: '',
  what_surprised: '',
  what_change: '',
  revealed: '',
  debrief_date: '',
  debrief_who: '',
};

const planSections: SectionConfig[] = [
  {
    description: 'Name the terrain before you enter it.',
    fields: [
      { key: 'event_name', label: 'Event', placeholder: 'Dinner, party, conference...' },
      { key: 'event_date', label: 'Date', placeholder: '21 June 2026' },
      { key: 'event_location', label: 'Location' },
      { key: 'event_who', label: 'Who will be there', multiline: true },
      {
        helper: 'Past experience and anticipated terrain both count as data.',
        key: 'last_time',
        label: 'What happened last time, or what could happen?',
        multiline: true,
      },
      {
        helper: 'What sensation tells me I am drifting? Where do I feel it first?',
        key: 'body_warning',
        label: "The body's early warning",
        multiline: true,
      },
    ],
    title: '1. The event',
  },
  {
    description: 'Choose the outcome, reminders, and visual anchors before the day arrives.',
    fields: [
      {
        helper: 'Write it out, then visualize it before the event.',
        key: 'ideal_outcome',
        label: 'Ideal outcome',
        multiline: true,
      },
      { key: 'mantra', label: 'My mantra for this event', placeholder: 'One line in my own voice' },
      {
        key: 'phone_background',
        label: 'Phone background I will switch to',
        placeholder: 'Name the image or reminder',
      },
    ],
    title: '2. The protection',
  },
  {
    description: 'Identify the people who will know about this plan.',
    fields: [
      {
        helper: 'Specific questions that get past surface answers.',
        key: 'questions_for_me',
        label: 'Questions they should ask me',
        multiline: true,
      },
      {
        key: 'what_to_say',
        label: 'What I will say to them',
        multiline: true,
      },
    ],
    title: '3. Anchor people',
  },
  {
    description: 'A short plan for staying connected to yourself while you are there.',
    fields: [
      { key: 'pre_arrival', label: 'Pre-arrival ritual', multiline: true },
      { key: 'arrival_anchor', label: 'Arrival anchor', multiline: true },
      { key: 'mid_body', label: 'Mid-event: what I notice in my body', multiline: true },
      { key: 'mid_need', label: 'Mid-event: what I need right now', multiline: true },
      { key: 'the_line', label: 'The line I will not cross', multiline: true },
    ],
    title: '4. During the event',
  },
  {
    description: 'Decide before the difficult moment how you will leave and who you will contact.',
    fields: [
      { key: 'departure_decision', label: 'Pre-departure decision point', multiline: true },
      { key: 'call_who', label: 'The call I make: who' },
      { key: 'call_when', label: 'The call I make: when' },
      { key: 'call_what', label: 'What I plan to say', multiline: true },
      { key: 'decompression', label: 'Decompression in the first hour', multiline: true },
    ],
    title: '5. The threshold',
  },
  {
    description: 'Complete this after the event so the experience becomes learning.',
    fields: [
      { key: 'what_worked', label: 'What worked', multiline: true },
      { key: 'what_surprised', label: 'What surprised me', multiline: true },
      { key: 'what_change', label: 'What I would change next time', multiline: true },
      { key: 'revealed', label: 'One thing this event revealed', multiline: true },
      { key: 'debrief_date', label: 'Date of debrief with coach' },
      { key: 'debrief_who', label: 'Coach or team member' },
    ],
    title: '6. Integration',
  },
];

export default function EventPlanningScreen() {
  const [addingBuddyCheckInId, setAddingBuddyCheckInId] = useState('');
  const [buddyCheckInDrafts, setBuddyCheckInDrafts] = useState<Record<string, BuddyCheckInDraft>>({});
  const [buddyProfiles, setBuddyProfiles] = useState<Record<string, BuddyProfile>>({});
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [dallasBuddies, setDallasBuddies] = useState<DallasBuddy[]>([]);
  const [expandedBuddyId, setExpandedBuddyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [plan, setPlan] = useState<EventPlanForm>(emptyPlan);
  const [planId, setPlanId] = useState('');
  const [phoneReminders, setPhoneReminders] = useState<EventPhoneReminder[]>([]);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [showEventDatePicker, setShowEventDatePicker] = useState(false);

  const activePlanTitle = useMemo(() => {
    if (plan.event_name.trim()) {
      return plan.event_name.trim();
    }

    return planId ? 'Saved event plan' : 'New event plan';
  }, [plan.event_name, planId]);

  const calendarDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      const nextSession = sessionData.session;

      if (!mounted) {
        return;
      }

      setSession(nextSession);

      if (!nextSession) {
        setLoading(false);
        return;
      }

      await loadPlanSummaries(nextSession.user.id, mounted);
      await loadDallasBuddies(nextSession.user.id, mounted);
      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  async function loadPlanSummaries(userId: string, mounted = true) {
    const { data, error } = await supabase
      .from('event_plans')
      .select('id, event_date, event_name, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(20);

    if (!mounted) {
      return;
    }

    if (error) {
      setMessage(error.message);
      return;
    }

    setPlans(data ?? []);
  }

  async function loadDallasBuddies(userId: string, mounted = true) {
    const { data, error } = await supabase
      .from('accountability_partners')
      .select('avatar_path, connected_user_id, id, name')
      .eq('user_id', userId)
      .eq('partner_kind', 'dallas_user')
      .order('created_at', { ascending: false });

    if (!mounted) {
      return;
    }

    if (error) {
      setMessage(error.message);
      return;
    }

    const nextBuddies = data ?? [];
    setDallasBuddies(nextBuddies);
    await loadBuddyProfiles(nextBuddies, mounted);
  }

  async function loadBuddyProfiles(buddies: DallasBuddy[], mounted = true) {
    const userIds = buddies
      .map((buddy) => buddy.connected_user_id)
      .filter((userId): userId is string => Boolean(userId));

    if (!userIds.length) {
      setBuddyProfiles({});
      return;
    }

    const { data } = await supabase
      .from('profiles')
      .select('avatar_path, display_name, id')
      .in('id', userIds);

    if (!mounted) {
      return;
    }

    setBuddyProfiles(
      (data ?? []).reduce<Record<string, BuddyProfile>>((profiles, profile) => {
        profiles[profile.id] = profile;
        return profiles;
      }, {}),
    );
  }

  async function handleLoadPlan(id: string) {
    if (!session) {
      return;
    }

    setLoading(true);
    setMessage('');

    const { data, error } = await supabase
      .from('event_plans')
      .select(`${Object.keys(emptyPlan).join(', ')}, event_reminders, id, updated_at`)
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single<EventPlanRow>();

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setPlan(rowToPlan(data));
    setPhoneReminders(normalizePhoneReminders(data.event_reminders));
    setPlanId(data.id);
    setMessage('Event plan loaded.');
  }

  async function handleSave() {
    if (!session) {
      setMessage('Sign in before saving an event plan.');
      return;
    }

    if (!plan.event_name.trim()) {
      setMessage('Add an event name before saving.');
      return;
    }

    setSaving(true);
    setMessage('');

    let scheduledReminders: EventPhoneReminder[];

    try {
      scheduledReminders = await schedulePhoneReminders(phoneReminders, plan.event_name.trim());
    } catch (error) {
      setSaving(false);
      setMessage(error instanceof Error ? error.message : 'Could not schedule phone reminders.');
      return;
    }

    const savedPlan = {
      ...trimPlan(plan),
      event_reminders: scheduledReminders,
      id: planId || undefined,
      updated_at: new Date().toISOString(),
      user_id: session.user.id,
    };

    const { data, error } = await supabase
      .from('event_plans')
      .upsert(savedPlan)
      .select('id')
      .single();

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setPlanId(data.id);
    setPhoneReminders(scheduledReminders);
    await loadPlanSummaries(session.user.id);
    setMessage(
      scheduledReminders.length
        ? `Event plan saved. ${scheduledReminders.length} phone notification${scheduledReminders.length === 1 ? '' : 's'} scheduled.`
        : 'Event plan saved.',
    );
  }

  function handleNewPlan() {
    setPlan(emptyPlan);
    setPlanId('');
    setPhoneReminders([]);
    setMessage('');
    setCalendarMonth(startOfMonth(new Date()));
    setShowEventDatePicker(false);
  }

  function updateField(key: EventPlanField, value: string) {
    setPlan((currentPlan) => ({
      ...currentPlan,
      [key]: value,
    }));
  }

  function handleSelectEventDate(date: Date) {
    updateField('event_date', toDateValue(date));
    setCalendarMonth(startOfMonth(date));
    setShowEventDatePicker(false);
  }

  function handleToggleEventDatePicker() {
    const selectedDate = parseDateValue(plan.event_date);

    if (selectedDate) {
      setCalendarMonth(startOfMonth(selectedDate));
    }

    setShowEventDatePicker((visible) => !visible);
  }

  function handleAddPhoneReminder() {
    setPhoneReminders((currentReminders) => [
      ...currentReminders,
      {
        date: plan.event_date || toDateValue(new Date()),
        id: createReminderId(),
        message: '',
        notification_id: null,
        time: '18:00',
      },
    ]);
  }

  function handleUpdatePhoneReminder(id: string, updates: Partial<EventPhoneReminder>) {
    setPhoneReminders((currentReminders) =>
      currentReminders.map((reminder) =>
        reminder.id === id
          ? {
              ...reminder,
              ...updates,
              notification_id: null,
            }
          : reminder,
      ),
    );
  }

  async function handleRemovePhoneReminder(id: string) {
    const reminder = phoneReminders.find((item) => item.id === id);

    if (reminder?.notification_id) {
      await Notifications.cancelScheduledNotificationAsync(reminder.notification_id).catch(() => null);
    }

    setPhoneReminders((currentReminders) => currentReminders.filter((item) => item.id !== id));
  }

  function handleSetReminderDate(id: string, date: Date) {
    handleUpdatePhoneReminder(id, { date: toDateValue(date) });
  }

  function handleAdjustReminderDate(id: string, days: number) {
    const reminder = phoneReminders.find((item) => item.id === id);
    const currentDate = parseDateValue(reminder?.date ?? '') ?? new Date();
    const nextDate = new Date(currentDate);

    nextDate.setDate(currentDate.getDate() + days);
    handleSetReminderDate(id, nextDate);
  }

  function handleAdjustReminderTime(id: string, minutes: number) {
    const reminder = phoneReminders.find((item) => item.id === id);
    const currentTime = parseReminderTime(reminder?.time ?? '18:00');
    const nextTime = new Date();

    nextTime.setHours(currentTime.hour, currentTime.minute + minutes, 0, 0);
    handleUpdatePhoneReminder(id, { time: formatTimeForInput(nextTime) });
  }

  function handleToggleBuddy(buddy: DallasBuddy) {
    const nextExpandedBuddyId = expandedBuddyId === buddy.id ? '' : buddy.id;

    setExpandedBuddyId(nextExpandedBuddyId);
    setMessage('');

    if (nextExpandedBuddyId) {
      ensureBuddyDraft(buddy.id);
    }
  }

  function ensureBuddyDraft(buddyId: string) {
    setBuddyCheckInDrafts((currentDrafts) => {
      if (currentDrafts[buddyId]) {
        return currentDrafts;
      }

      return {
        ...currentDrafts,
        [buddyId]: {
          date: plan.event_date || toDateValue(new Date()),
          note: '',
          time: '18:00',
        },
      };
    });
  }

  function updateBuddyDraft(buddyId: string, updates: Partial<BuddyCheckInDraft>) {
    const defaultDraft: BuddyCheckInDraft = {
      date: plan.event_date || toDateValue(new Date()),
      note: '',
      time: '18:00',
    };

    setBuddyCheckInDrafts((currentDrafts) => ({
      ...currentDrafts,
      [buddyId]: {
        ...defaultDraft,
        ...currentDrafts[buddyId],
        ...updates,
      },
    }));
  }

  function handleSetBuddyDraftDate(buddyId: string, date: Date) {
    updateBuddyDraft(buddyId, { date: toDateValue(date) });
  }

  function handleAdjustBuddyDraftDate(buddyId: string, days: number) {
    const draft = buddyCheckInDrafts[buddyId];
    const currentDate = parseDateValue(draft?.date ?? '') ?? new Date();
    const nextDate = new Date(currentDate);

    nextDate.setDate(currentDate.getDate() + days);
    handleSetBuddyDraftDate(buddyId, nextDate);
  }

  function handleAdjustBuddyDraftTime(buddyId: string, minutes: number) {
    const draft = buddyCheckInDrafts[buddyId];
    const currentTime = parseReminderTime(draft?.time ?? '18:00');
    const nextTime = new Date();

    nextTime.setHours(currentTime.hour, currentTime.minute + minutes, 0, 0);
    updateBuddyDraft(buddyId, { time: formatTimeForInput(nextTime) });
  }

  async function handleAddBuddyCheckIn(buddy: DallasBuddy) {
    if (!session) {
      return;
    }

    const draft = buddyCheckInDrafts[buddy.id] ?? {
      date: plan.event_date || toDateValue(new Date()),
      note: '',
      time: '18:00',
    };
    const scheduledAt = buildLocalIso(draft.date, draft.time || '18:00');

    if (!scheduledAt) {
      setMessage('Choose a date and time before adding a buddy check-in.');
      return;
    }

    setAddingBuddyCheckInId(buddy.id);
    setMessage('');

    const buddyName = getBuddyDisplayName(buddy, buddyProfiles);
    const notificationId = await scheduleBuddyCheckInNotification({
      buddyName,
      scheduledAt,
      userId: session.user.id,
    });

    const { error } = await supabase.from('accountability_planned_check_ins').insert({
      notification_id: notificationId,
      note: draft.note.trim() || eventCheckInNote(plan.event_name),
      partner_id: buddy.id,
      scheduled_at: scheduledAt,
      user_id: session.user.id,
    });

    setAddingBuddyCheckInId('');

    if (error) {
      if (notificationId) {
        await Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => null);
      }

      setMessage(error.message);
      return;
    }

    updateBuddyDraft(buddy.id, { note: '' });
    setMessage(
      notificationId
        ? `Check-in set with ${buddyName}. Notification scheduled.`
        : `Check-in set with ${buddyName}. Enable notifications to get an alert.`,
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centerPanel}>
          <ActivityIndicator color="#38635D" />
          <Text style={styles.loadingText}>Loading event plans...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.container}>
          <Text style={styles.eyebrow}>Event planning</Text>
          <Text style={styles.title}>Sign in required</Text>
          <Text style={styles.copy}>Your event plans are available after signing in.</Text>
          <Link href="/" asChild>
            <Pressable style={styles.button}>
              <Text style={styles.buttonText}>Back to sign in</Text>
            </Pressable>
          </Link>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardArea}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>Event planning</Text>
          <Text style={styles.title}>{activePlanTitle}</Text>
          <Text style={styles.copy}>
            Prepare before the event, stay anchored during it, and turn the experience into learning afterwards.
          </Text>

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Saved plans</Text>
              <Pressable style={styles.smallButton} onPress={handleNewPlan}>
                <Text style={styles.smallButtonText}>New</Text>
              </Pressable>
            </View>

            {plans.length ? (
              <View style={styles.savedList}>
                {plans.map((savedPlan) => (
                  <Pressable
                    key={savedPlan.id}
                    style={[styles.savedPlan, savedPlan.id === planId && styles.activeSavedPlan]}
                    onPress={() => handleLoadPlan(savedPlan.id)}
                  >
                    <Text style={styles.savedPlanTitle}>{savedPlan.event_name || 'Untitled event'}</Text>
                    <Text style={styles.savedPlanMeta}>
                      {savedPlan.event_date || formatDate(savedPlan.updated_at)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            ) : (
              <Text style={styles.mutedText}>No event plans saved yet.</Text>
            )}
          </View>

          {planSections.map((section) => (
            <View key={section.title} style={styles.panel}>
              <Text style={styles.panelTitle}>{section.title}</Text>
              {section.description ? <Text style={styles.mutedText}>{section.description}</Text> : null}

              {section.fields.map((field) => (
                <View key={field.key} style={styles.fieldGroup}>
                  <Text style={styles.inputLabel}>{field.label}</Text>
                  {field.helper ? <Text style={styles.helperText}>{field.helper}</Text> : null}
                  {field.key === 'event_date' ? (
                    <>
                      <Pressable style={styles.datePickerButton} onPress={handleToggleEventDatePicker}>
                        <Text style={[styles.datePickerButtonText, !plan.event_date && styles.placeholderText]}>
                          {plan.event_date ? formatDateValue(plan.event_date) : 'Choose event date'}
                        </Text>
                      </Pressable>

                      {showEventDatePicker ? (
                        <View style={styles.calendarPanel}>
                          <View style={styles.calendarHeader}>
                            <Pressable
                              style={styles.calendarNavButton}
                              onPress={() => setCalendarMonth(addMonths(calendarMonth, -1))}
                            >
                              <Text style={styles.calendarNavText}>{'<'}</Text>
                            </Pressable>
                            <Text style={styles.calendarTitle}>{formatMonthYear(calendarMonth)}</Text>
                            <Pressable
                              style={styles.calendarNavButton}
                              onPress={() => setCalendarMonth(addMonths(calendarMonth, 1))}
                            >
                              <Text style={styles.calendarNavText}>{'>'}</Text>
                            </Pressable>
                          </View>

                          <View style={styles.calendarGrid}>
                            {dayLabels.map((dayLabel) => (
                              <Text key={dayLabel} style={styles.calendarDayLabel}>
                                {dayLabel}
                              </Text>
                            ))}

                            {calendarDays.map((date, index) => {
                              const dateValue = date ? toDateValue(date) : `blank-${index}`;
                              const selected = date ? dateValue === plan.event_date : false;

                              return date ? (
                                <Pressable
                                  key={dateValue}
                                  style={[styles.calendarDay, selected && styles.selectedCalendarDay]}
                                  onPress={() => handleSelectEventDate(date)}
                                >
                                  <Text style={[styles.calendarDayText, selected && styles.selectedCalendarDayText]}>
                                    {date.getDate()}
                                  </Text>
                                </Pressable>
                              ) : (
                                <View key={dateValue} style={styles.calendarDay} />
                              );
                            })}
                          </View>
                        </View>
                      ) : null}
                    </>
                  ) : (
                    <TextInput
                      multiline={field.multiline}
                      onChangeText={(value) => updateField(field.key, value)}
                      placeholder={field.placeholder}
                      placeholderTextColor="#8A948F"
                      style={[styles.input, field.multiline && styles.multilineInput]}
                      textAlignVertical={field.multiline ? 'top' : 'center'}
                      value={plan[field.key]}
                    />
                  )}
                </View>
              ))}

              {section.title === '3. Anchor people' ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.inputLabel}>Dallas App Buddies</Text>
                  <Text style={styles.helperText}>Choose a buddy and set a planned check-in for this event.</Text>

                  {dallasBuddies.length ? (
                    <View style={styles.buddyList}>
                      {dallasBuddies.map((buddy) => {
                        const expanded = expandedBuddyId === buddy.id;
                        const draft = buddyCheckInDrafts[buddy.id] ?? {
                          date: plan.event_date || toDateValue(new Date()),
                          note: '',
                          time: '18:00',
                        };
                        const buddyName = getBuddyDisplayName(buddy, buddyProfiles);
                        const avatarUrl = getBuddyAvatarUrl(buddy, buddyProfiles);

                        return (
                          <View key={buddy.id} style={styles.buddyCard}>
                            <Pressable style={styles.buddyRow} onPress={() => handleToggleBuddy(buddy)}>
                              <View style={styles.buddyAvatar}>
                                {avatarUrl ? (
                                  <Image source={{ uri: avatarUrl }} style={styles.buddyAvatarImage} />
                                ) : (
                                  <Text style={styles.buddyAvatarText}>{getInitial(buddyName)}</Text>
                                )}
                              </View>
                              <View style={styles.buddyCopy}>
                                <Text style={styles.buddyName}>{buddyName}</Text>
                                <Text style={styles.buddyMeta}>{expanded ? 'Hide check-in setup' : 'Set check-in'}</Text>
                              </View>
                              <Text style={styles.buddyChevron}>{expanded ? '-' : '+'}</Text>
                            </Pressable>

                            {expanded ? (
                              <View style={styles.buddyExpanded}>
                                <View style={styles.pickerPanel}>
                                  <View style={styles.pickerHeaderRow}>
                                    <Pressable
                                      style={styles.stepperButton}
                                      onPress={() => handleAdjustBuddyDraftDate(buddy.id, -1)}
                                    >
                                      <Text style={styles.stepperButtonText}>-</Text>
                                    </Pressable>
                                    <View style={styles.pickerValue}>
                                      <Text style={styles.pickerValueLabel}>Date</Text>
                                      <Text style={styles.pickerValueText}>{formatHumanDate(draft.date)}</Text>
                                    </View>
                                    <Pressable
                                      style={styles.stepperButton}
                                      onPress={() => handleAdjustBuddyDraftDate(buddy.id, 1)}
                                    >
                                      <Text style={styles.stepperButtonText}>+</Text>
                                    </Pressable>
                                  </View>

                                  <View style={styles.quickDateRow}>
                                    {getQuickDateOptions().map((option) => (
                                      <Pressable
                                        key={option.label}
                                        style={[
                                          styles.quickDateButton,
                                          draft.date === option.value && styles.activeQuickDateButton,
                                        ]}
                                        onPress={() => handleSetBuddyDraftDate(buddy.id, option.date)}
                                      >
                                        <Text
                                          style={[
                                            styles.quickDateButtonText,
                                            draft.date === option.value && styles.activeQuickDateButtonText,
                                          ]}
                                        >
                                          {option.label}
                                        </Text>
                                      </Pressable>
                                    ))}
                                  </View>

                                  <View style={styles.pickerHeaderRow}>
                                    <Pressable
                                      style={styles.stepperButton}
                                      onPress={() => handleAdjustBuddyDraftTime(buddy.id, -15)}
                                    >
                                      <Text style={styles.stepperButtonText}>-</Text>
                                    </Pressable>
                                    <View style={styles.pickerValue}>
                                      <Text style={styles.pickerValueLabel}>Time</Text>
                                      <Text style={styles.pickerValueText}>{draft.time || '18:00'}</Text>
                                    </View>
                                    <Pressable
                                      style={styles.stepperButton}
                                      onPress={() => handleAdjustBuddyDraftTime(buddy.id, 15)}
                                    >
                                      <Text style={styles.stepperButtonText}>+</Text>
                                    </Pressable>
                                  </View>
                                </View>

                                <Text style={styles.inputLabel}>Check-in note</Text>
                                <TextInput
                                  onChangeText={(value) => updateBuddyDraft(buddy.id, { note: value })}
                                  placeholder="What should this buddy ask or know?"
                                  placeholderTextColor="#8A948F"
                                  style={styles.input}
                                  value={draft.note}
                                />
                                <Pressable
                                  disabled={addingBuddyCheckInId === buddy.id}
                                  style={[styles.button, addingBuddyCheckInId === buddy.id && styles.disabledButton]}
                                  onPress={() => handleAddBuddyCheckIn(buddy)}
                                >
                                  <Text style={styles.buttonText}>
                                    {addingBuddyCheckInId === buddy.id ? 'Adding...' : 'Add buddy check-in'}
                                  </Text>
                                </Pressable>
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={styles.mutedText}>No Dallas App Buddies connected yet.</Text>
                  )}
                </View>
              ) : null}

              {section.title === '2. The protection' ? (
                <View style={styles.fieldGroup}>
                  <View style={styles.reminderHeader}>
                    <View style={styles.reminderHeaderCopy}>
                      <Text style={styles.inputLabel}>Phone notifications</Text>
                      <Text style={styles.helperText}>
                        Schedule as many real phone reminders as you need for this event.
                      </Text>
                    </View>
                    <Pressable style={styles.smallButton} onPress={handleAddPhoneReminder}>
                      <Text style={styles.smallButtonText}>Add</Text>
                    </Pressable>
                  </View>

                  {phoneReminders.length ? (
                    <View style={styles.reminderList}>
                      {phoneReminders.map((reminder, index) => (
                        <View key={reminder.id} style={styles.reminderCard}>
                          <View style={styles.reminderCardHeader}>
                            <Text style={styles.reminderCardTitle}>Notification {index + 1}</Text>
                            <Pressable onPress={() => handleRemovePhoneReminder(reminder.id)}>
                              <Text style={styles.removeReminderText}>Remove</Text>
                            </Pressable>
                          </View>

                          <View style={styles.pickerPanel}>
                            <View style={styles.pickerHeaderRow}>
                              <Pressable
                                style={styles.stepperButton}
                                onPress={() => handleAdjustReminderDate(reminder.id, -1)}
                              >
                                <Text style={styles.stepperButtonText}>-</Text>
                              </Pressable>
                              <View style={styles.pickerValue}>
                                <Text style={styles.pickerValueLabel}>Date</Text>
                                <Text style={styles.pickerValueText}>{formatHumanDate(reminder.date)}</Text>
                              </View>
                              <Pressable
                                style={styles.stepperButton}
                                onPress={() => handleAdjustReminderDate(reminder.id, 1)}
                              >
                                <Text style={styles.stepperButtonText}>+</Text>
                              </Pressable>
                            </View>

                            <View style={styles.quickDateRow}>
                              {getQuickDateOptions().map((option) => (
                                <Pressable
                                  key={option.label}
                                  style={[
                                    styles.quickDateButton,
                                    reminder.date === option.value && styles.activeQuickDateButton,
                                  ]}
                                  onPress={() => handleSetReminderDate(reminder.id, option.date)}
                                >
                                  <Text
                                    style={[
                                      styles.quickDateButtonText,
                                      reminder.date === option.value && styles.activeQuickDateButtonText,
                                    ]}
                                  >
                                    {option.label}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>

                            <View style={styles.pickerHeaderRow}>
                              <Pressable
                                style={styles.stepperButton}
                                onPress={() => handleAdjustReminderTime(reminder.id, -15)}
                              >
                                <Text style={styles.stepperButtonText}>-</Text>
                              </Pressable>
                              <View style={styles.pickerValue}>
                                <Text style={styles.pickerValueLabel}>Time</Text>
                                <Text style={styles.pickerValueText}>{reminder.time || '18:00'}</Text>
                              </View>
                              <Pressable
                                style={styles.stepperButton}
                                onPress={() => handleAdjustReminderTime(reminder.id, 15)}
                              >
                                <Text style={styles.stepperButtonText}>+</Text>
                              </Pressable>
                            </View>
                          </View>

                          <Text style={styles.inputLabel}>Notification text</Text>
                          <TextInput
                            onChangeText={(value) => handleUpdatePhoneReminder(reminder.id, { message: value })}
                            placeholder="Notification message"
                            placeholderTextColor="#8A948F"
                            style={styles.input}
                            value={reminder.message}
                          />
                          {reminder.notification_id ? (
                            <Text style={styles.helperText}>Scheduled on this phone.</Text>
                          ) : null}
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.mutedText}>No phone notifications yet.</Text>
                  )}
                </View>
              ) : null}
            </View>
          ))}

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <Pressable disabled={saving} style={[styles.button, saving && styles.disabledButton]} onPress={handleSave}>
            <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save event plan'}</Text>
          </Pressable>

          <Link href="/" asChild>
            <Pressable style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>Back home</Text>
            </Pressable>
          </Link>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function rowToPlan(row: EventPlanRow): EventPlanForm {
  return Object.keys(emptyPlan).reduce((nextPlan, key) => {
    const fieldKey = key as EventPlanField;
    nextPlan[fieldKey] = row[fieldKey] ?? '';
    return nextPlan;
  }, { ...emptyPlan });
}

function trimPlan(plan: EventPlanForm) {
  return Object.keys(plan).reduce((nextPlan, key) => {
    const fieldKey = key as EventPlanField;
    nextPlan[fieldKey] = plan[fieldKey].trim();
    return nextPlan;
  }, {} as EventPlanForm);
}

async function scheduleBuddyCheckInNotification({
  buddyName,
  scheduledAt,
  userId,
}: {
  buddyName: string;
  scheduledAt: string;
  userId: string;
}) {
  const scheduledDate = new Date(scheduledAt);

  if (!Number.isFinite(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
    return null;
  }

  await ensureNotificationChannelAsync();

  const permissions = await Notifications.getPermissionsAsync();
  let permissionGranted = hasGrantedNotificationPermission(permissions);

  if (!permissionGranted) {
    const requestedPermissions = await Notifications.requestPermissionsAsync();
    permissionGranted = hasGrantedNotificationPermission(requestedPermissions);
  }

  if (!permissionGranted) {
    return null;
  }

  await syncGrantedPushTokenAsync(userId).catch(() => null);

  return Notifications.scheduleNotificationAsync({
    content: {
      body: `Your event check-in with ${buddyName} is due now.`,
      data: {
        route: '/dallas-app-buddies',
        type: 'event_buddy_check_in',
      },
      sound: 'default',
      title: 'Dallas event check-in',
    },
    trigger: {
      channelId: notificationChannelId,
      date: scheduledDate,
      type: Notifications.SchedulableTriggerInputTypes.DATE,
    } as Notifications.NotificationTriggerInput,
  });
}

async function schedulePhoneReminders(reminders: EventPhoneReminder[], eventName: string) {
  const remindersWithContent = reminders.filter(hasReminderContent);

  for (const reminder of remindersWithContent) {
    if (!reminder.date.trim() || !reminder.time.trim() || !reminder.message.trim()) {
      throw new Error('Complete the date, time, and message for each phone notification.');
    }

    const scheduledAt = parseReminderDateTime(reminder.date, reminder.time);

    if (!scheduledAt) {
      throw new Error('Use YYYY-MM-DD for dates and HH:mm for notification times.');
    }

    if (scheduledAt.getTime() <= Date.now()) {
      throw new Error('Phone notifications need to be scheduled for a future time.');
    }
  }

  await Promise.all(
    reminders
      .map((reminder) => reminder.notification_id)
      .filter((notificationId): notificationId is string => Boolean(notificationId))
      .map((notificationId) => Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => null)),
  );

  if (!remindersWithContent.length) {
    return [];
  }

  await ensureNotificationChannelAsync();

  const permissions = await Notifications.getPermissionsAsync();
  let permissionGranted = hasGrantedNotificationPermission(permissions);

  if (!permissionGranted) {
    const requestedPermissions = await Notifications.requestPermissionsAsync();
    permissionGranted = hasGrantedNotificationPermission(requestedPermissions);
  }

  if (!permissionGranted) {
    throw new Error('Allow notifications before scheduling event reminders.');
  }

  const scheduledNotificationIds: string[] = [];

  try {
    const scheduledReminders: EventPhoneReminder[] = [];

    for (const reminder of remindersWithContent) {
      const scheduledAt = parseReminderDateTime(reminder.date, reminder.time);

      if (!scheduledAt) {
        continue;
      }

      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          body: reminder.message.trim(),
          data: {
            reminderId: reminder.id,
            type: 'event_plan_reminder',
          },
          sound: false,
          title: eventName ? `${eventName} reminder` : 'Dallas event reminder',
        },
        trigger: {
          channelId: notificationChannelId,
          date: scheduledAt,
          type: Notifications.SchedulableTriggerInputTypes.DATE,
        } as Notifications.NotificationTriggerInput,
      });

      scheduledNotificationIds.push(notificationId);
      scheduledReminders.push({
        ...reminder,
        date: reminder.date.trim(),
        message: reminder.message.trim(),
        notification_id: notificationId,
        time: reminder.time.trim(),
      });
    }

    return scheduledReminders;
  } catch (error) {
    await Promise.all(
      scheduledNotificationIds.map((notificationId) =>
        Notifications.cancelScheduledNotificationAsync(notificationId).catch(() => null),
      ),
    );

    throw error;
  }
}

function hasReminderContent(reminder: EventPhoneReminder) {
  return Boolean(reminder.date.trim() || reminder.time.trim() || reminder.message.trim());
}

function hasGrantedNotificationPermission(permissions: Notifications.NotificationPermissionsStatus) {
  const permissionResult = permissions as Notifications.NotificationPermissionsStatus & {
    granted?: boolean;
    status?: string;
  };

  return permissionResult.granted ?? permissionResult.status === 'granted';
}

function normalizePhoneReminders(value: unknown): EventPhoneReminder[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const reminder = item as Partial<Record<keyof EventPhoneReminder, unknown>>;

      return {
        date: typeof reminder.date === 'string' ? reminder.date : '',
        id: typeof reminder.id === 'string' ? reminder.id : createReminderId(),
        message: typeof reminder.message === 'string' ? reminder.message : '',
        notification_id: typeof reminder.notification_id === 'string' ? reminder.notification_id : null,
        time: typeof reminder.time === 'string' ? reminder.time : '',
      };
    })
    .filter((reminder): reminder is EventPhoneReminder => Boolean(reminder));
}

function parseReminderDateTime(dateValue: string, timeValue: string) {
  const date = parseDateValue(dateValue.trim());
  const [hours, minutes] = timeValue.trim().split(':').map(Number);

  if (!date || !Number.isInteger(hours) || !Number.isInteger(minutes)) {
    return null;
  }

  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    return null;
  }

  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes);
}

function buildLocalIso(dateValue: string, timeValue: string) {
  const scheduledDate = parseReminderDateTime(dateValue, timeValue);

  return scheduledDate ? scheduledDate.toISOString() : null;
}

function eventCheckInNote(eventName: string) {
  const trimmedEventName = eventName.trim();

  return trimmedEventName ? `Event check-in for ${trimmedEventName}` : null;
}

function formatHumanDate(value: string) {
  const parsedDate = parseDateValue(value);

  if (!parsedDate) {
    return 'Choose date';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
  }).format(parsedDate);
}

function formatTimeForInput(value: Date) {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

function getQuickDateOptions() {
  const today = new Date();
  const tomorrow = new Date();
  const nextWeek = new Date();

  tomorrow.setDate(today.getDate() + 1);
  nextWeek.setDate(today.getDate() + 7);

  return [
    { date: today, label: 'Today', value: toDateValue(today) },
    { date: tomorrow, label: 'Tomorrow', value: toDateValue(tomorrow) },
    { date: nextWeek, label: 'Next week', value: toDateValue(nextWeek) },
  ];
}

function parseReminderTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return { hour: 18, minute: 0 };
  }

  const [hour, minute] = value.split(':').map(Number);

  return {
    hour: Number.isFinite(hour) ? hour : 18,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function createReminderId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getBuddyAvatarUrl(buddy: DallasBuddy, profiles: Record<string, BuddyProfile>) {
  const profile = buddy.connected_user_id ? profiles[buddy.connected_user_id] : null;

  if (profile?.avatar_path) {
    return supabase.storage.from('avatars').getPublicUrl(profile.avatar_path).data.publicUrl;
  }

  if (buddy.avatar_path) {
    return supabase.storage.from('accountability-avatars').getPublicUrl(buddy.avatar_path).data.publicUrl;
  }

  return '';
}

function getBuddyDisplayName(buddy: DallasBuddy, profiles: Record<string, BuddyProfile>) {
  const profile = buddy.connected_user_id ? profiles[buddy.connected_user_id] : null;
  const profileName = profile?.display_name?.trim();

  return profileName || buddy.name || 'Dallas buddy';
}

function getInitial(value: string) {
  return (value || 'D').trim().charAt(0).toUpperCase();
}

function formatDate(value: string | null) {
  if (!value) {
    return 'Recently updated';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function addMonths(value: Date, amount: number) {
  return new Date(value.getFullYear(), value.getMonth() + amount, 1);
}

function formatDateValue(value: string) {
  const date = parseDateValue(value);

  if (!date) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

function formatMonthYear(value: Date) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'long',
    year: 'numeric',
  }).format(value);
}

function getCalendarDays(month: Date) {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const firstDay = new Date(year, monthIndex, 1).getDay();
  const days: Array<Date | null> = [];

  for (let index = 0; index < firstDay; index += 1) {
    days.push(null);
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    days.push(new Date(year, monthIndex, day));
  }

  while (days.length % 7 !== 0) {
    days.push(null);
  }

  return days;
}

function parseDateValue(value: string) {
  const [year, month, day] = value.split('-').map(Number);

  if (!year || !month || !day) {
    return null;
  }

  const date = new Date(year, month - 1, day);

  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }

  return date;
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function toDateValue(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F3EA',
  },
  keyboardArea: {
    flex: 1,
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
    gap: 14,
    padding: 16,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  panelTitle: {
    color: '#17211F',
    fontSize: 18,
    fontWeight: '900',
  },
  mutedText: {
    color: '#4F5D58',
    fontSize: 14,
    lineHeight: 20,
  },
  savedList: {
    gap: 8,
  },
  savedPlan: {
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
    padding: 12,
  },
  activeSavedPlan: {
    borderColor: '#38635D',
  },
  savedPlanTitle: {
    color: '#17211F',
    fontSize: 15,
    fontWeight: '900',
  },
  savedPlanMeta: {
    color: '#697570',
    fontSize: 13,
    fontWeight: '700',
  },
  fieldGroup: {
    gap: 6,
  },
  buddyList: {
    gap: 10,
  },
  buddyCard: {
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  buddyRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  buddyAvatar: {
    alignItems: 'center',
    backgroundColor: '#E7EFEC',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 36,
  },
  buddyAvatarImage: {
    height: '100%',
    width: '100%',
  },
  buddyAvatarText: {
    color: '#38635D',
    fontSize: 15,
    fontWeight: '900',
  },
  buddyCopy: {
    flex: 1,
    gap: 2,
  },
  buddyName: {
    color: '#17211F',
    fontSize: 15,
    fontWeight: '900',
  },
  buddyMeta: {
    color: '#697570',
    fontSize: 12,
    fontWeight: '700',
  },
  buddyChevron: {
    color: '#38635D',
    fontSize: 20,
    fontWeight: '900',
    minWidth: 22,
    textAlign: 'center',
  },
  buddyExpanded: {
    borderTopColor: '#DED7C9',
    borderTopWidth: 1,
    gap: 9,
    padding: 10,
  },
  reminderHeader: {
    alignItems: 'flex-start',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  reminderHeaderCopy: {
    flex: 1,
    gap: 4,
  },
  reminderList: {
    gap: 8,
  },
  reminderCard: {
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    gap: 9,
    padding: 10,
  },
  reminderCardHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  reminderCardTitle: {
    color: '#17211F',
    fontSize: 14,
    fontWeight: '900',
  },
  removeReminderText: {
    color: '#A33A2B',
    fontSize: 13,
    fontWeight: '900',
  },
  pickerPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 10,
  },
  pickerHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'space-between',
  },
  stepperButton: {
    alignItems: 'center',
    backgroundColor: '#38635D',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  stepperButtonText: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 23,
  },
  pickerValue: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
  },
  pickerValueLabel: {
    color: '#697570',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  pickerValueText: {
    color: '#17211F',
    fontSize: 17,
    fontWeight: '900',
    lineHeight: 21,
    textAlign: 'center',
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: 6,
  },
  quickDateButton: {
    alignItems: 'center',
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 6,
  },
  activeQuickDateButton: {
    backgroundColor: '#E7EFEC',
    borderColor: '#38635D',
  },
  quickDateButtonText: {
    color: '#4F5D58',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 14,
    textAlign: 'center',
  },
  activeQuickDateButtonText: {
    color: '#38635D',
  },
  inputLabel: {
    color: '#697570',
    fontSize: 13,
    fontWeight: '800',
  },
  helperText: {
    color: '#697570',
    fontSize: 12,
    lineHeight: 17,
  },
  datePickerButton: {
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  datePickerButtonText: {
    color: '#17211F',
    fontSize: 16,
    fontWeight: '700',
  },
  placeholderText: {
    color: '#8A948F',
    fontWeight: '500',
  },
  calendarPanel: {
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  calendarHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  calendarNavButton: {
    alignItems: 'center',
    backgroundColor: '#ECE5D8',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  calendarNavText: {
    color: '#38635D',
    fontSize: 18,
    fontWeight: '900',
  },
  calendarTitle: {
    color: '#17211F',
    fontSize: 16,
    fontWeight: '900',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayLabel: {
    color: '#697570',
    fontSize: 12,
    fontWeight: '900',
    paddingBottom: 8,
    textAlign: 'center',
    width: `${100 / 7}%`,
  },
  calendarDay: {
    alignItems: 'center',
    aspectRatio: 1,
    justifyContent: 'center',
    width: `${100 / 7}%`,
  },
  selectedCalendarDay: {
    backgroundColor: '#38635D',
    borderRadius: 8,
  },
  calendarDayText: {
    color: '#17211F',
    fontSize: 14,
    fontWeight: '800',
  },
  selectedCalendarDayText: {
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    color: '#17211F',
    fontSize: 16,
    minHeight: 48,
    paddingHorizontal: 12,
  },
  multilineInput: {
    minHeight: 104,
    paddingTop: 12,
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
  smallButton: {
    alignItems: 'center',
    backgroundColor: '#38635D',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 14,
  },
  smallButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
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
