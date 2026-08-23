import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
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
  | 'alignment_warning_sign'
  | 'body_warning'
  | 'ideal_outcome'
  | 'mantra'
  | 'phone_background'
  | 'reminder_1'
  | 'reminder_2'
  | 'reminder_3'
  | 'anchor_1_name'
  | 'anchor_1_when'
  | 'anchor_1_questions'
  | 'anchor_1_response'
  | 'anchor_2_name'
  | 'anchor_2_when'
  | 'anchor_2_questions'
  | 'anchor_2_response'
  | 'pre_arrival'
  | 'arrival_anchor'
  | 'arrival_check_in_time'
  | 'mid_body'
  | 'mid_need'
  | 'mid_boundaries'
  | 'mid_event_check_in_time'
  | 'the_line'
  | 'departure_decision'
  | 'call_who'
  | 'call_when'
  | 'call_what'
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

type EventPlanDatabaseRow = Partial<EventPlanForm> & {
  event_reminders: EventPhoneReminder[] | null;
  event_threshold_contacts?: ThresholdSupportRequest[] | null;
  id: string;
  updated_at: string;
};

type EventPhoneReminder = {
  date: string;
  id: string;
  kind?: 'arrival' | 'manual' | 'mid_event';
  message: string;
  notification_id: string | null;
  time: string;
};

type DallasBuddy = {
  avatar_path: string | null;
  connected_user_id: string | null;
  id: string;
  mobile_number?: string | null;
  name: string;
  partner_kind?: 'external' | 'dallas_user';
};

type ExternalAnchor = {
  id: string;
  mobile_number: string | null;
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

type EventNotificationAlert = {
  body: string;
  kindLabel: string;
  title: string;
};

type ThresholdSupportContact = {
  avatarUrl?: string;
  id: string;
  kind: 'dallas_user' | 'external';
  mobile_number: string | null;
  name: string;
};

type ThresholdSupportRequest = {
  id: string;
  mobile_number: string | null;
  partner_id: string;
  partner_name: string;
  response_body?: string;
  response_created_at?: string;
  sent_at: string;
  thread_id: string;
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
const defaultCheckInReplyUrl = 'https://dallas-app.onrender.com/check-in-reply/';

const emptyPlan: EventPlanForm = {
  event_name: '',
  event_date: '',
  event_location: '',
  event_who: '',
  last_time: '',
  alignment_warning_sign: '',
  body_warning: '',
  ideal_outcome: '',
  mantra: '',
  phone_background: '',
  reminder_1: '',
  reminder_2: '',
  reminder_3: '',
  anchor_1_name: '',
  anchor_1_when: '',
  anchor_1_questions: '',
  anchor_1_response: '',
  anchor_2_name: '',
  anchor_2_when: '',
  anchor_2_questions: '',
  anchor_2_response: '',
  pre_arrival: '',
  arrival_anchor: '',
  arrival_check_in_time: '',
  mid_body: '',
  mid_need: '',
  mid_boundaries: '',
  mid_event_check_in_time: '',
  the_line: '',
  departure_decision: '',
  call_who: '',
  call_when: '',
  call_what: '',
  what_worked: '',
  what_surprised: '',
  what_change: '',
  revealed: '',
  debrief_date: '',
  debrief_who: '',
};

const latestEventPlanColumns = `${Object.keys(emptyPlan).join(', ')}, event_reminders, event_threshold_contacts, id, updated_at`;
const legacyEventPlanColumns = [
  'event_name',
  'event_date',
  'event_location',
  'event_who',
  'last_time',
  'body_warning',
  'ideal_outcome',
  'mantra',
  'phone_background',
  'reminder_1',
  'reminder_2',
  'reminder_3',
  'anchor_1_name',
  'anchor_1_when',
  'anchor_2_name',
  'anchor_2_when',
  'pre_arrival',
  'arrival_anchor',
  'mid_body',
  'mid_need',
  'the_line',
  'departure_decision',
  'call_who',
  'call_when',
  'call_what',
  'what_worked',
  'what_surprised',
  'what_change',
  'revealed',
  'debrief_date',
  'debrief_who',
  'event_reminders',
  'id',
  'updated_at',
].join(', ');
const eventPlanMigrationMessage =
  'Event plan saved with your current database schema. Run the latest Supabase event-plan migrations to save every event planner field.';
const newEventPlanColumns = new Set<EventPlanField>([
  'alignment_warning_sign',
  'anchor_1_questions',
  'anchor_1_response',
  'anchor_2_questions',
  'anchor_2_response',
  'arrival_check_in_time',
  'mid_event_check_in_time',
  'mid_boundaries',
]);
const newEventPlanPayloadColumns = new Set<string>(['event_threshold_contacts']);

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
        key: 'alignment_warning_sign',
        label: 'What would be the very first warning sign that I could be out of alignment at this event?',
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
    description: 'Give each check-in person a clear role, time, question, and answer to listen for.',
    fields: [
      { key: 'anchor_1_name', label: 'Arrival anchor person' },
      { key: 'anchor_1_when', label: 'Arrival check-in time', placeholder: '19:30' },
      {
        helper: 'One or two specific questions that get past surface answers.',
        key: 'anchor_1_questions',
        label: 'Questions they should ask at arrival',
        multiline: true,
      },
      {
        key: 'anchor_1_response',
        label: 'My planned response or talking points',
        multiline: true,
      },
      { key: 'anchor_2_name', label: 'Mid-event anchor person' },
      { key: 'anchor_2_when', label: 'Mid-event check-in time', placeholder: '21:00' },
      {
        key: 'anchor_2_questions',
        label: 'Questions they should ask mid-event',
        multiline: true,
      },
      {
        key: 'anchor_2_response',
        label: 'My planned response or talking points',
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
      {
        helper: 'This schedules a priority phone reminder when you save.',
        key: 'arrival_check_in_time',
        label: 'Arrival reminder time',
        placeholder: '19:30',
      },
      {
        helper: 'This schedules a priority phone reminder when you save.',
        key: 'mid_event_check_in_time',
        label: 'Mid-event reminder time',
        placeholder: '21:00',
      },
      { key: 'mid_body', label: 'Physical sensations I will check for', multiline: true },
      { key: 'mid_need', label: 'Mid-event: what I need right now', multiline: true },
      { key: 'mid_boundaries', label: 'Boundaries I need to protect', multiline: true },
      { key: 'the_line', label: 'The line I will not cross', multiline: true },
    ],
    title: '4. During the event',
  },
  {
    description: 'Decide before the difficult moment how you will leave and who you will contact.',
    fields: [
      { key: 'departure_decision', label: 'Pre-departure decision point', multiline: true },
      { key: 'call_what', label: 'Prepared phrase for asking for help', multiline: true },
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
  const [externalAnchors, setExternalAnchors] = useState<ExternalAnchor[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [plan, setPlan] = useState<EventPlanForm>(emptyPlan);
  const [planId, setPlanId] = useState('');
  const [phoneReminders, setPhoneReminders] = useState<EventPhoneReminder[]>([]);
  const [plans, setPlans] = useState<PlanSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [sendingThresholdContactId, setSendingThresholdContactId] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [showAnchorBuddies, setShowAnchorBuddies] = useState(false);
  const [showExternalAnchors, setShowExternalAnchors] = useState(false);
  const [showEventDatePicker, setShowEventDatePicker] = useState(false);
  const [showThresholdSupportContacts, setShowThresholdSupportContacts] = useState(false);
  const [thresholdSupportRequests, setThresholdSupportRequests] = useState<ThresholdSupportRequest[]>([]);
  const [timeSensitiveAlert, setTimeSensitiveAlert] = useState<EventNotificationAlert | null>(null);
  const handledNotificationIds = useRef(new Set<string>());

  const activePlanTitle = useMemo(() => {
    if (plan.event_name.trim()) {
      return plan.event_name.trim();
    }

    return planId ? 'Saved event plan' : 'New event plan';
  }, [plan.event_name, planId]);

  const calendarDays = useMemo(() => getCalendarDays(calendarMonth), [calendarMonth]);
  const thresholdSupportContacts = useMemo(
    () => buildThresholdSupportContacts(dallasBuddies, externalAnchors, buddyProfiles),
    [buddyProfiles, dallasBuddies, externalAnchors],
  );

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

  useEffect(() => {
    let mounted = true;

    const showEventAlert = (notification: Notifications.Notification) => {
      if (handledNotificationIds.current.has(notification.request.identifier)) {
        return;
      }

      const nextAlert = buildEventNotificationAlert(notification.request.content);

      if (mounted && nextAlert) {
        handledNotificationIds.current.add(notification.request.identifier);
        setTimeSensitiveAlert(nextAlert);
      }
    };

    const receivedSubscription = Notifications.addNotificationReceivedListener(showEventAlert);
    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      showEventAlert(response.notification);
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response && isRecentNotification(response.notification)) {
        showEventAlert(response.notification);
      }
    });

    return () => {
      mounted = false;
      receivedSubscription.remove();
      responseSubscription.remove();
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

    if (error || !data) {
      setMessage(error?.message ?? 'Could not load this event plan.');
      return;
    }

    setPlans(data ?? []);
  }

  async function loadDallasBuddies(userId: string, mounted = true) {
    const { data, error } = await supabase
      .from('accountability_partners')
      .select('avatar_path, connected_user_id, id, mobile_number, name, partner_kind')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!mounted) {
      return;
    }

    if (error || !data) {
      setMessage(error?.message ?? 'Could not save this event plan.');
      return;
    }

    const partners = data ?? [];
    const nextBuddies = partners.filter((partner) => partner.partner_kind === 'dallas_user');

    setDallasBuddies(nextBuddies);
    setExternalAnchors(
      partners
        .filter((partner) => partner.partner_kind !== 'dallas_user')
        .map((partner) => ({
          id: partner.id,
          mobile_number: partner.mobile_number ?? null,
          name: partner.name,
        })),
    );
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

    let { data, error } = await supabase
      .from('event_plans')
      .select(latestEventPlanColumns)
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single<EventPlanDatabaseRow>();

    if (isEventPlanSchemaCacheError(error)) {
      const legacyResult = await supabase
        .from('event_plans')
        .select(legacyEventPlanColumns)
        .eq('id', id)
        .eq('user_id', session.user.id)
        .single<EventPlanDatabaseRow>();

      data = legacyResult.data;
      error = legacyResult.error;
    }

    setLoading(false);

    if (error || !data) {
      setMessage(error?.message ?? 'Could not load this event plan.');
      return;
    }

    const loadedPlan = data;
    const loadedThresholdRequests = await loadThresholdSupportResponses(
      normalizeThresholdSupportRequests(loadedPlan.event_threshold_contacts),
    );

    setPlan(rowToPlan(loadedPlan));
    setPhoneReminders(normalizePhoneReminders(loadedPlan.event_reminders));
    setThresholdSupportRequests(loadedThresholdRequests);
    setPlanId(loadedPlan.id);
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
      scheduledReminders = await schedulePhoneReminders(buildReminderSchedule(phoneReminders, plan), plan.event_name.trim());
    } catch (error) {
      setSaving(false);
      setMessage(error instanceof Error ? error.message : 'Could not schedule phone reminders.');
      return;
    }

    const savedPlan = {
      ...trimPlan(plan),
      event_reminders: scheduledReminders,
      event_threshold_contacts: serializeThresholdSupportRequests(thresholdSupportRequests),
      id: planId || undefined,
      updated_at: new Date().toISOString(),
      user_id: session.user.id,
    };

    let { data, error } = await supabase
      .from('event_plans')
      .upsert(savedPlan)
      .select('id')
      .single();

    const usedLegacySchemaFallback = isEventPlanSchemaCacheError(error);

    if (usedLegacySchemaFallback) {
      const legacyResult = await supabase
        .from('event_plans')
        .upsert(stripNewEventPlanColumns(savedPlan))
        .select('id')
        .single();

      data = legacyResult.data;
      error = legacyResult.error;
    }

    setSaving(false);

    if (error || !data) {
      setMessage(error?.message ?? 'Could not save this event plan.');
      return;
    }

    const savedPlanRow = data;

    setPlanId(savedPlanRow.id);
    setPhoneReminders(scheduledReminders);
    await loadPlanSummaries(session.user.id);
    if (usedLegacySchemaFallback) {
      setMessage(eventPlanMigrationMessage);
      return;
    }

    setMessage(getEventPlanSavedMessage(scheduledReminders.length));
  }

  function handleNewPlan() {
    setPlan(emptyPlan);
    setPlanId('');
    setPhoneReminders([]);
    setThresholdSupportRequests([]);
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
        kind: 'manual',
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

  async function handleTextExternalAnchor(anchor: ExternalAnchor) {
    if (!anchor.mobile_number?.trim()) {
      setMessage(`Add a mobile number for ${anchor.name} in Accountability before sending a text.`);
      return;
    }

    const replyLink = await createExternalAnchorReplyLink(anchor);

    if (!replyLink) {
      return;
    }

    const messageBody = buildExternalAnchorMessage(anchor.name, plan, replyLink);

    const separator = Platform.OS === 'ios' ? '&' : '?';
    const smsUrl = `sms:${encodeURIComponent(anchor.mobile_number.trim())}${separator}body=${encodeURIComponent(messageBody)}`;
    const supported = await Linking.canOpenURL(smsUrl);

    if (!supported) {
      setMessage('This device cannot open a prepared SMS message.');
      return;
    }

    await Linking.openURL(smsUrl);
    setMessage(`Prepared anchor text and online reply link for ${anchor.name}.`);
  }

  async function handleAskThresholdSupport(contact: ThresholdSupportContact) {
    if (!session) {
      return;
    }

    if (!contact.mobile_number?.trim()) {
      setMessage(`Add a mobile number for ${contact.name} before sending a threshold support request.`);
      return;
    }

    setSendingThresholdContactId(contact.id);
    setMessage('');

    const request = await createThresholdSupportRequest(contact);

    setSendingThresholdContactId('');

    if (!request) {
      return;
    }

    const replyLink = buildCheckInReplyUrl(request.partner_token);
    const messageBody = buildThresholdSupportMessage(contact.name, plan, replyLink);
    const separator = Platform.OS === 'ios' ? '&' : '?';
    const smsUrl = `sms:${encodeURIComponent(contact.mobile_number.trim())}${separator}body=${encodeURIComponent(messageBody)}`;
    const supported = await Linking.canOpenURL(smsUrl);

    if (!supported) {
      setMessage('This device cannot open a prepared SMS message.');
      return;
    }

    await Linking.openURL(smsUrl);

    const nextRequest: ThresholdSupportRequest = {
      id: createReminderId(),
      mobile_number: contact.mobile_number.trim(),
      partner_id: contact.id,
      partner_name: contact.name,
      sent_at: new Date().toISOString(),
      thread_id: request.thread_id,
    };

    setThresholdSupportRequests((currentRequests) => [
      nextRequest,
      ...currentRequests.filter((currentRequest) => currentRequest.partner_id !== contact.id),
    ]);
    setMessage(`Prepared availability text and reply form for ${contact.name}. Save the event plan to keep this request with the plan.`);
  }

  async function handleRefreshThresholdResponses() {
    const refreshedRequests = await loadThresholdSupportResponses(thresholdSupportRequests);

    setThresholdSupportRequests(refreshedRequests);
    setMessage('Threshold support responses refreshed.');
  }

  async function createThresholdSupportRequest(contact: ThresholdSupportContact) {
    if (!session) {
      return null;
    }

    const { data: thread, error: threadError } = await supabase
      .from('accountability_check_in_threads')
      .insert({
        partner_id: contact.id,
        user_display_name: getSessionDisplayName(session),
        user_id: session.user.id,
      })
      .select('id, partner_token')
      .single();

    if (threadError) {
      setMessage(threadError.message);
      return null;
    }

    const { error: messageError } = await supabase.from('accountability_check_in_messages').insert({
      body: `Event support availability request prepared for ${contact.name || 'a threshold contact'}.`,
      partner_id: contact.id,
      sender_type: 'user',
      thread_id: thread.id,
      user_id: session.user.id,
    });

    if (messageError) {
      setMessage(messageError.message);
      return null;
    }

    return {
      partner_token: thread.partner_token as string,
      thread_id: thread.id as string,
    };
  }

  async function createExternalAnchorReplyLink(anchor: ExternalAnchor) {
    if (!session) {
      return '';
    }

    const { data: thread, error: threadError } = await supabase
      .from('accountability_check_in_threads')
      .insert({
        partner_id: anchor.id,
        user_display_name: getSessionDisplayName(session),
        user_id: session.user.id,
      })
      .select('id, partner_token')
      .single();

    if (threadError) {
      setMessage(threadError.message);
      return '';
    }

    const { error: messageError } = await supabase.from('accountability_check_in_messages').insert({
      body: `Event anchor invitation prepared for ${anchor.name || 'an external accountability partner'}.`,
      partner_id: anchor.id,
      sender_type: 'user',
      thread_id: thread.id,
      user_id: session.user.id,
    });

    if (messageError) {
      setMessage(messageError.message);
      return '';
    }

    return buildCheckInReplyUrl(thread.partner_token);
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centerPanel}>
          <ActivityIndicator color="#2E4737" />
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
      {timeSensitiveAlert ? (
        <Modal animationType="fade" presentationStyle="fullScreen" visible>
          <SafeAreaView style={styles.alertScreen}>
            <View style={styles.alertTopBand} />
            <View style={styles.alertContainer}>
              <View style={styles.alertPanel}>
                <View style={styles.alertAccentRow}>
                  <View style={styles.alertAccentDot} />
                  <Text style={styles.alertEyebrow}>Time-sensitive reminder</Text>
                </View>
                <Text style={styles.alertTitle}>{timeSensitiveAlert.title}</Text>
                <Text style={styles.alertBody}>{timeSensitiveAlert.body}</Text>
                <View style={styles.alertPill}>
                  <Text style={styles.alertPillText}>{timeSensitiveAlert.kindLabel}</Text>
                </View>
              </View>

              <View style={styles.alertAnchorPanel}>
                <Text style={styles.alertAnchorTitle}>Return to the plan</Text>
                <Text style={styles.alertAnchorCopy}>
                  Pause for a moment, check what you need, and use the plan you prepared.
                </Text>
              </View>

              <View style={styles.alertActions}>
                <Pressable style={styles.alertPrimaryButton} onPress={() => setTimeSensitiveAlert(null)}>
                  <Text style={styles.alertPrimaryButtonText}>I am checking in now</Text>
                </Pressable>
                <Pressable style={styles.alertSecondaryButton} onPress={() => setTimeSensitiveAlert(null)}>
                  <Text style={styles.alertSecondaryButtonText}>Dismiss</Text>
                </Pressable>
              </View>
            </View>
          </SafeAreaView>
        </Modal>
      ) : null}
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
                      placeholderTextColor="#768277"
                      style={[styles.input, field.multiline && styles.multilineInput]}
                      textAlignVertical={field.multiline ? 'top' : 'center'}
                      value={plan[field.key]}
                    />
                  )}
                </View>
              ))}

              {section.title === '3. Anchor people' ? (
                <View style={styles.fieldGroup}>
                  <View style={styles.thresholdExpander}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: showAnchorBuddies }}
                      style={styles.thresholdExpanderHeader}
                      onPress={() => setShowAnchorBuddies((visible) => !visible)}
                    >
                      <View style={styles.buddyCopy}>
                        <Text style={styles.buddyName}>Dallas App Buddies</Text>
                        <Text style={styles.buddyMeta}>
                          {dallasBuddies.length
                            ? `${dallasBuddies.length} buddy${dallasBuddies.length === 1 ? '' : 'ies'} available`
                            : 'No Dallas App Buddies connected yet'}
                        </Text>
                      </View>
                      <Text style={styles.buddyChevron}>{showAnchorBuddies ? '-' : '+'}</Text>
                    </Pressable>

                    {showAnchorBuddies ? (
                      dallasBuddies.length ? (
                        <View style={styles.thresholdExpandedList}>
                          <Text style={styles.helperText}>Choose a buddy and set a planned check-in for this event.</Text>
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
                                      placeholderTextColor="#768277"
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
                        <Text style={styles.thresholdEmptyText}>No Dallas App Buddies connected yet.</Text>
                      )
                    ) : null}
                  </View>

                  <View style={styles.thresholdExpander}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: showExternalAnchors }}
                      style={styles.thresholdExpanderHeader}
                      onPress={() => setShowExternalAnchors((visible) => !visible)}
                    >
                      <View style={styles.buddyCopy}>
                        <Text style={styles.buddyName}>External anchors</Text>
                        <Text style={styles.buddyMeta}>
                          {externalAnchors.length
                            ? `${externalAnchors.length} external contact${externalAnchors.length === 1 ? '' : 's'}`
                            : 'No external accountability contacts saved yet'}
                        </Text>
                      </View>
                      <Text style={styles.buddyChevron}>{showExternalAnchors ? '-' : '+'}</Text>
                    </Pressable>

                    {showExternalAnchors ? (
                      externalAnchors.length ? (
                        <View style={styles.thresholdExpandedList}>
                          <Text style={styles.helperText}>
                            External contacts receive a prepared text message from your phone.
                          </Text>
                          {externalAnchors.map((anchor) => (
                            <View key={anchor.id} style={styles.buddyCard}>
                              <View style={styles.buddyRow}>
                                <View style={styles.buddyAvatar}>
                                  <Text style={styles.buddyAvatarText}>{getInitial(anchor.name)}</Text>
                                </View>
                                <View style={styles.buddyCopy}>
                                  <Text style={styles.buddyName}>{anchor.name || 'External anchor'}</Text>
                                  <Text style={styles.buddyMeta}>
                                    {anchor.mobile_number ? 'Text message anchor' : 'Add mobile number in Accountability'}
                                  </Text>
                                </View>
                              </View>
                              <Pressable
                                disabled={!anchor.mobile_number}
                                style={[styles.secondaryButton, !anchor.mobile_number && styles.disabledButton]}
                                onPress={() => handleTextExternalAnchor(anchor)}
                              >
                                <Text style={styles.secondaryButtonText}>Prepare text + reply link</Text>
                              </Pressable>
                            </View>
                          ))}
                        </View>
                      ) : (
                        <Text style={styles.thresholdEmptyText}>No external accountability contacts saved yet.</Text>
                      )
                    ) : null}
                  </View>
                </View>
              ) : null}

              {section.title === '5. The threshold' ? (
                <View style={styles.fieldGroup}>
                  <Text style={styles.inputLabel}>Available support during this event</Text>
                  <Text style={styles.helperText}>
                    Send a prepared SMS with the event start details and a reply form. Responses appear here after they reply.
                  </Text>

                  <View style={styles.thresholdExpander}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded: showThresholdSupportContacts }}
                      style={styles.thresholdExpanderHeader}
                      onPress={() => setShowThresholdSupportContacts((visible) => !visible)}
                    >
                      <View style={styles.buddyCopy}>
                        <Text style={styles.buddyName}>Contacts and buddies</Text>
                        <Text style={styles.buddyMeta}>
                          {thresholdSupportContacts.length
                            ? `${thresholdSupportContacts.length} available contact${thresholdSupportContacts.length === 1 ? '' : 's'}`
                            : 'No contacts yet'}
                        </Text>
                      </View>
                      <Text style={styles.buddyChevron}>{showThresholdSupportContacts ? '-' : '+'}</Text>
                    </Pressable>

                    {showThresholdSupportContacts ? (
                      thresholdSupportContacts.length ? (
                        <View style={styles.thresholdExpandedList}>
                          {thresholdSupportContacts.map((contact) => {
                            const request = thresholdSupportRequests.find(
                              (supportRequest) => supportRequest.partner_id === contact.id,
                            );

                            return (
                              <View key={contact.id} style={styles.thresholdContactCard}>
                                <View style={styles.buddyRow}>
                                  <View style={styles.buddyAvatar}>
                                    {contact.avatarUrl ? (
                                      <Image source={{ uri: contact.avatarUrl }} style={styles.buddyAvatarImage} />
                                    ) : (
                                      <Text style={styles.buddyAvatarText}>{getInitial(contact.name)}</Text>
                                    )}
                                  </View>
                                  <View style={styles.buddyCopy}>
                                    <Text style={styles.buddyName}>{contact.name}</Text>
                                    <Text style={styles.buddyMeta}>
                                      {contact.mobile_number ? 'SMS availability request' : 'Add mobile number in Accountability'}
                                    </Text>
                                  </View>
                                </View>

                                <Pressable
                                  disabled={!contact.mobile_number || sendingThresholdContactId === contact.id}
                                  style={[
                                    styles.secondaryButton,
                                    (!contact.mobile_number || sendingThresholdContactId === contact.id) && styles.disabledButton,
                                  ]}
                                  onPress={() => handleAskThresholdSupport(contact)}
                                >
                                  <Text style={styles.secondaryButtonText}>
                                    {sendingThresholdContactId === contact.id ? 'Preparing...' : request ? 'Send again' : 'Ask availability'}
                                  </Text>
                                </Pressable>

                                {request ? (
                                  <View style={styles.thresholdResponsePanel}>
                                    <View style={styles.thresholdResponseHeader}>
                                      <Text style={styles.thresholdResponseTitle}>
                                        {request.response_body ? 'Latest response' : 'Awaiting response'}
                                      </Text>
                                      <Pressable onPress={handleRefreshThresholdResponses}>
                                        <Text style={styles.removeReminderText}>Refresh</Text>
                                      </Pressable>
                                    </View>
                                    <Text style={styles.thresholdResponseText}>
                                      {request.response_body || `Sent ${formatDate(request.sent_at)}. No reply yet.`}
                                    </Text>
                                    {request.response_created_at ? (
                                      <Text style={styles.thresholdResponseMeta}>
                                        {formatDate(request.response_created_at)}
                                      </Text>
                                    ) : null}
                                  </View>
                                ) : null}
                              </View>
                            );
                          })}
                        </View>
                      ) : (
                        <Text style={styles.thresholdEmptyText}>
                          Add accountability contacts before sending availability requests.
                        </Text>
                      )
                    ) : null}
                  </View>
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

                  {phoneReminders.filter(isManualReminder).length ? (
                    <View style={styles.reminderList}>
                      {phoneReminders.filter(isManualReminder).map((reminder, index) => (
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
                            placeholderTextColor="#768277"
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
                    <Text style={styles.mutedText}>
                      Arrival and mid-event reminders are scheduled from the plan. Add extra personal reminders here.
                    </Text>
                  )}
                </View>
              ) : null}
            </View>
          ))}

          {message ? <Text style={styles.message}>{message}</Text> : null}

          <Pressable disabled={saving} style={[styles.button, saving && styles.disabledButton]} onPress={handleSave}>
            <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save event plan'}</Text>
          </Pressable>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function buildEventNotificationAlert(content: Notifications.NotificationContent): EventNotificationAlert | null {
  const data = content.data as Record<string, unknown> | undefined;
  const type = typeof data?.type === 'string' ? data.type : '';

  if (type !== 'event_plan_reminder' && type !== 'event_buddy_check_in') {
    return null;
  }

  const kindLabel = typeof data?.alertKindLabel === 'string' ? data.alertKindLabel : 'Event reminder due';

  return {
    body: content.body || 'Pause and return to your Dallas event plan.',
    kindLabel,
    title: content.title || 'Dallas event reminder',
  };
}

function isRecentNotification(notification: Notifications.Notification) {
  const notificationDate = (notification as Notifications.Notification & { date?: number }).date;

  if (typeof notificationDate !== 'number') {
    return false;
  }

  return Date.now() - notificationDate < 10 * 60 * 1000;
}

function rowToPlan(row: EventPlanDatabaseRow): EventPlanForm {
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

function stripNewEventPlanColumns<T extends Record<string, unknown>>(value: T) {
  return Object.keys(value).reduce<Record<string, unknown>>((nextValue, key) => {
    if (!newEventPlanColumns.has(key as EventPlanField) && !newEventPlanPayloadColumns.has(key)) {
      nextValue[key] = value[key];
    }

    return nextValue;
  }, {});
}

function isEventPlanSchemaCacheError(error: unknown) {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';
  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';

  return code === 'PGRST204' || message.includes("Could not find the '") || message.includes('schema cache');
}

function getEventPlanSavedMessage(scheduledReminderCount: number) {
  if (!scheduledReminderCount) {
    return 'Event plan saved.';
  }

  return `Event plan saved. ${scheduledReminderCount} phone notification${scheduledReminderCount === 1 ? '' : 's'} scheduled, including priority arrival and mid-event reminders when set.`;
}

function normalizeThresholdSupportRequests(value: unknown): ThresholdSupportRequest[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item): ThresholdSupportRequest | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const request = item as Partial<Record<keyof ThresholdSupportRequest, unknown>>;

      if (typeof request.partner_id !== 'string' || typeof request.thread_id !== 'string') {
        return null;
      }

      return {
        id: typeof request.id === 'string' ? request.id : createReminderId(),
        mobile_number: typeof request.mobile_number === 'string' ? request.mobile_number : null,
        partner_id: request.partner_id,
        partner_name: typeof request.partner_name === 'string' ? request.partner_name : 'Support contact',
        response_body: typeof request.response_body === 'string' ? request.response_body : undefined,
        response_created_at:
          typeof request.response_created_at === 'string' ? request.response_created_at : undefined,
        sent_at: typeof request.sent_at === 'string' ? request.sent_at : new Date().toISOString(),
        thread_id: request.thread_id,
      };
    })
    .filter((request): request is ThresholdSupportRequest => Boolean(request));
}

function serializeThresholdSupportRequests(requests: ThresholdSupportRequest[]) {
  return requests.map((request) => ({
    id: request.id,
    mobile_number: request.mobile_number,
    partner_id: request.partner_id,
    partner_name: request.partner_name,
    response_body: request.response_body,
    response_created_at: request.response_created_at,
    sent_at: request.sent_at,
    thread_id: request.thread_id,
  }));
}

async function loadThresholdSupportResponses(requests: ThresholdSupportRequest[]) {
  const threadIds = requests.map((request) => request.thread_id).filter(Boolean);

  if (!threadIds.length) {
    return requests;
  }

  const { data, error } = await supabase
    .from('accountability_check_in_messages')
    .select('body, created_at, sender_type, thread_id')
    .in('thread_id', threadIds)
    .eq('sender_type', 'partner')
    .order('created_at', { ascending: false });

  if (error) {
    return requests;
  }

  const latestReplies = (data ?? []).reduce<Record<string, { body: string; created_at: string }>>((replies, item) => {
    const threadId = typeof item.thread_id === 'string' ? item.thread_id : '';

    if (threadId && !replies[threadId]) {
      replies[threadId] = {
        body: typeof item.body === 'string' ? item.body : '',
        created_at: typeof item.created_at === 'string' ? item.created_at : '',
      };
    }

    return replies;
  }, {});

  return requests.map((request) => {
    const reply = latestReplies[request.thread_id];

    return reply
      ? {
          ...request,
          response_body: reply.body,
          response_created_at: reply.created_at,
        }
      : request;
  });
}

function buildReminderSchedule(reminders: EventPhoneReminder[], plan: EventPlanForm) {
  const existingArrivalReminder = reminders.find((reminder) => reminder.kind === 'arrival');
  const existingMidEventReminder = reminders.find((reminder) => reminder.kind === 'mid_event');
  const generatedReminders = [
    buildPriorityReminder({
      date: plan.event_date,
      existingReminder: existingArrivalReminder,
      id: 'arrival',
      kind: 'arrival',
      message:
        plan.arrival_anchor.trim() ||
        plan.anchor_1_questions.trim() ||
        'Pause, arrive in yourself, and check in with your arrival anchor.',
      time: plan.arrival_check_in_time || plan.anchor_1_when,
    }),
    buildPriorityReminder({
      date: plan.event_date,
      existingReminder: existingMidEventReminder,
      id: 'mid-event',
      kind: 'mid_event',
      message:
        plan.mid_need.trim() ||
        plan.mid_body.trim() ||
        plan.anchor_2_questions.trim() ||
        'Check your body, your needs, and your boundaries before continuing.',
      time: plan.mid_event_check_in_time || plan.anchor_2_when,
    }),
  ].filter(isEventPhoneReminder);

  const staleGeneratedReminders = [existingArrivalReminder, existingMidEventReminder].filter(
    (reminder): reminder is EventPhoneReminder =>
      isEventPhoneReminder(reminder) &&
      !generatedReminders.some((generatedReminder) => generatedReminder.id === reminder.id),
  );

  return [
    ...reminders.filter(isManualReminder),
    ...staleGeneratedReminders.map((reminder) => ({
      ...reminder,
      date: '',
      message: '',
      time: '',
    })),
    ...generatedReminders,
  ];
}

function buildPriorityReminder({
  date,
  existingReminder,
  id,
  kind,
  message,
  time,
}: {
  date: string;
  existingReminder?: EventPhoneReminder;
  id: string;
  kind: 'arrival' | 'mid_event';
  message: string;
  time: string;
}): EventPhoneReminder | null {
  const trimmedDate = date.trim();
  const trimmedTime = time.trim();

  if (!trimmedDate || !trimmedTime) {
    return null;
  }

  return {
    date: trimmedDate,
    id,
    kind,
    message: message.trim(),
    notification_id: existingReminder?.notification_id ?? null,
    time: trimmedTime,
  };
}

function isManualReminder(reminder: EventPhoneReminder) {
  return !reminder.kind || reminder.kind === 'manual';
}

function isEventPhoneReminder(reminder: EventPhoneReminder | null | undefined): reminder is EventPhoneReminder {
  return Boolean(reminder);
}

function getReminderKindLabel(kind: EventPhoneReminder['kind']) {
  if (kind === 'arrival') {
    return 'Arrival check-in due';
  }

  if (kind === 'mid_event') {
    return 'Mid-event check-in due';
  }

  return 'Personal event reminder due';
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
        alertKindLabel: 'Event check-in due',
        route: '/event-planning',
        type: 'event_buddy_check_in',
      },
      interruptionLevel: 'timeSensitive',
      sound: 'default',
      sticky: true,
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
            alertKindLabel: getReminderKindLabel(reminder.kind),
            reminderId: reminder.id,
            reminderKind: reminder.kind ?? 'manual',
            route: '/event-planning',
            type: 'event_plan_reminder',
          },
          interruptionLevel: 'timeSensitive',
          sound: 'default',
          sticky: true,
          title:
            reminder.kind === 'arrival'
              ? 'Arrival check-in'
              : reminder.kind === 'mid_event'
                ? 'Mid-event check-in'
                : eventName
                  ? `${eventName} reminder`
                  : 'Dallas event reminder',
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
    .map((item): EventPhoneReminder | null => {
      if (!item || typeof item !== 'object') {
        return null;
      }

      const reminder = item as Partial<Record<keyof EventPhoneReminder, unknown>>;

      return {
        date: typeof reminder.date === 'string' ? reminder.date : '',
        id: typeof reminder.id === 'string' ? reminder.id : createReminderId(),
        kind:
          reminder.kind === 'arrival' || reminder.kind === 'mid_event' || reminder.kind === 'manual'
            ? reminder.kind
            : 'manual',
        message: typeof reminder.message === 'string' ? reminder.message : '',
        notification_id: typeof reminder.notification_id === 'string' ? reminder.notification_id : null,
        time: typeof reminder.time === 'string' ? reminder.time : '',
      };
    })
    .filter(isEventPhoneReminder);
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

function buildExternalAnchorMessage(anchorName: string, plan: EventPlanForm, replyLink: string) {
  const eventName = plan.event_name.trim() || 'an event';
  const eventDate = plan.event_date.trim() ? ` on ${formatDateValue(plan.event_date.trim())}` : '';
  const arrivalTime = plan.arrival_check_in_time.trim() || plan.anchor_1_when.trim();
  const midEventTime = plan.mid_event_check_in_time.trim() || plan.anchor_2_when.trim();
  const checkInTimes = [arrivalTime && `arrival check-in at ${arrivalTime}`, midEventTime && `mid-event check-in at ${midEventTime}`]
    .filter(Boolean)
    .join(' and ');
  const questions = [plan.anchor_1_questions.trim(), plan.anchor_2_questions.trim()].filter(Boolean).join(' / ');
  const helpPhrase = plan.call_what.trim();

  return [
    `Hi ${anchorName || ''}`.trim() + ', I am naming you as an anchor for ' + eventName + eventDate + '.',
    checkInTimes ? `Could you check in with me for the ${checkInTimes}?` : 'Could you check in with me during it?',
    questions ? `Helpful question(s): ${questions}` : '',
    helpPhrase ? `If I ask for help, this is the phrase I am preparing: "${helpPhrase}"` : '',
    `Reply online here: ${replyLink}`,
    'Thank you for helping me stay connected to my plan.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function buildThresholdSupportMessage(contactName: string, plan: EventPlanForm, replyLink: string) {
  const eventName = plan.event_name.trim() || 'my event';
  const eventDate = plan.event_date.trim() ? formatDateValue(plan.event_date.trim()) : 'the event date';
  const eventStartTime =
    plan.arrival_check_in_time.trim() ||
    plan.anchor_1_when.trim() ||
    plan.call_when.trim() ||
    'the start time';
  const helpPhrase = plan.call_what.trim();

  return [
    `Hi ${contactName || ''}`.trim() + `, I am preparing for ${eventName} on ${eventDate} at ${eventStartTime}.`,
    'Would you be available during the event if I need support or a call?',
    helpPhrase ? `If I ask for help, this is the phrase I am preparing: "${helpPhrase}"` : '',
    `Please reply here: ${replyLink}`,
    'Thank you for helping me stay connected to my plan.',
  ]
    .filter(Boolean)
    .join('\n\n');
}

function getSessionDisplayName(session: Session) {
  const preferredName = session.user.user_metadata?.preferred_name;

  return typeof preferredName === 'string' && preferredName.trim()
    ? preferredName.trim()
    : session.user.email || 'Dallas user';
}

function buildCheckInReplyUrl(token: string) {
  const configuredUrl = process.env.EXPO_PUBLIC_CHECK_IN_REPLY_URL ?? defaultCheckInReplyUrl;
  const separator = configuredUrl.includes('?') ? '&' : '?';

  return `${configuredUrl}${separator}token=${encodeURIComponent(token)}`;
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

function buildThresholdSupportContacts(
  buddies: DallasBuddy[],
  anchors: ExternalAnchor[],
  profiles: Record<string, BuddyProfile>,
) {
  const contacts = [
    ...buddies.map((buddy): ThresholdSupportContact => ({
      avatarUrl: getBuddyAvatarUrl(buddy, profiles),
      id: buddy.id,
      kind: 'dallas_user',
      mobile_number: buddy.mobile_number ?? null,
      name: getBuddyDisplayName(buddy, profiles),
    })),
    ...anchors.map((anchor): ThresholdSupportContact => ({
      id: anchor.id,
      kind: 'external',
      mobile_number: anchor.mobile_number,
      name: anchor.name || 'External anchor',
    })),
  ];

  return contacts.filter(
    (contact, index) => contacts.findIndex((candidate) => candidate.id === contact.id) === index,
  );
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
    backgroundColor: '#F7F7F5',
  },
  alertScreen: {
    backgroundColor: '#F7F7F5',
    flex: 1,
  },
  alertTopBand: {
    backgroundColor: '#2E4737',
    height: 8,
  },
  alertContainer: {
    flex: 1,
    gap: 14,
    justifyContent: 'center',
    padding: 24,
    paddingBottom: 34,
  },
  alertPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 18,
    shadowColor: '#171717',
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
  },
  alertAccentRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  alertAccentDot: {
    backgroundColor: '#F1B84B',
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  alertEyebrow: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  alertTitle: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 37,
  },
  alertBody: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 18,
    fontWeight: '700',
    lineHeight: 26,
  },
  alertPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#EEF1EC',
    borderColor: '#E7D982',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  alertPillText: {
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '900',
  },
  alertAnchorPanel: {
    backgroundColor: '#E7EFEC',
    borderColor: '#C8DBD4',
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 14,
  },
  alertAnchorTitle: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 15,
    fontWeight: '900',
  },
  alertAnchorCopy: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  alertActions: {
    gap: 10,
  },
  alertPrimaryButton: {
    alignItems: 'center',
    backgroundColor: '#2E4737',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 18,
  },
  alertPrimaryButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope',
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  alertSecondaryButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 18,
  },
  alertSecondaryButtonText: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 15,
    fontWeight: '900',
  },
  keyboardArea: {
    flex: 1,
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
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 18,
    fontWeight: '900',
  },
  mutedText: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 14,
    lineHeight: 20,
  },
  savedList: {
    gap: 8,
  },
  savedPlan: {
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
    padding: 12,
  },
  activeSavedPlan: {
    borderColor: '#2E4737',
  },
  savedPlanTitle: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 15,
    fontWeight: '900',
  },
  savedPlanMeta: {
    color: '#768277',
    fontFamily: 'Manrope',
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
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
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
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 15,
    fontWeight: '900',
  },
  buddyCopy: {
    flex: 1,
    gap: 2,
  },
  buddyName: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 15,
    fontWeight: '900',
  },
  buddyMeta: {
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '700',
  },
  buddyChevron: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 20,
    fontWeight: '900',
    minWidth: 22,
    textAlign: 'center',
  },
  buddyExpanded: {
    borderTopColor: '#E7E6E2',
    borderTopWidth: 1,
    gap: 9,
    padding: 10,
  },
  thresholdExpander: {
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  thresholdExpanderHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 58,
    padding: 10,
  },
  thresholdExpandedList: {
    borderTopColor: '#E7E6E2',
    borderTopWidth: 1,
    gap: 10,
    padding: 10,
  },
  thresholdEmptyText: {
    borderTopColor: '#E7E6E2',
    borderTopWidth: 1,
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 14,
    lineHeight: 20,
    padding: 10,
  },
  thresholdContactCard: {
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 10,
  },
  thresholdResponsePanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 5,
    padding: 10,
  },
  thresholdResponseHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  thresholdResponseTitle: {
    color: '#2E4737',
    flex: 1,
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '900',
  },
  thresholdResponseText: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
  thresholdResponseMeta: {
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '700',
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
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
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
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '900',
  },
  removeReminderText: {
    color: '#A33D32',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '900',
  },
  pickerPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
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
    backgroundColor: '#2E4737',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  stepperButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope',
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
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 10,
    fontWeight: '900',
    textTransform: 'uppercase',
  },
  pickerValueText: {
    color: '#171717',
    fontFamily: 'Manrope',
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
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 6,
  },
  activeQuickDateButton: {
    backgroundColor: '#E7EFEC',
    borderColor: '#2E4737',
  },
  quickDateButtonText: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 11,
    fontWeight: '900',
    lineHeight: 14,
    textAlign: 'center',
  },
  activeQuickDateButtonText: {
    color: '#2E4737',
  },
  inputLabel: {
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '800',
  },
  helperText: {
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 12,
    lineHeight: 17,
  },
  datePickerButton: {
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 12,
  },
  datePickerButtonText: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '700',
  },
  placeholderText: {
    color: '#768277',
    fontWeight: '500',
  },
  calendarPanel: {
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
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
    backgroundColor: '#E7E6E2',
    borderRadius: 8,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  calendarNavText: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 18,
    fontWeight: '900',
  },
  calendarTitle: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '900',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  calendarDayLabel: {
    color: '#768277',
    fontFamily: 'Manrope',
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
    backgroundColor: '#2E4737',
    borderRadius: 8,
  },
  calendarDayText: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '800',
  },
  selectedCalendarDayText: {
    color: '#FFFFFF',
  },
  input: {
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    color: '#171717',
    fontFamily: 'Manrope',
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
  smallButton: {
    alignItems: 'center',
    backgroundColor: '#2E4737',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 36,
    paddingHorizontal: 14,
  },
  smallButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope',
    fontSize: 14,
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
