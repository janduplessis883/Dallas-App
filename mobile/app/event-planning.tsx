import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Link } from 'expo-router';
import type { Session } from '@supabase/supabase-js';

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
  id: string;
  updated_at: string;
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
      { key: 'reminder_1', label: 'Phone reminder 1', placeholder: 'Time + message' },
      { key: 'reminder_2', label: 'Phone reminder 2', placeholder: 'Time + message' },
      { key: 'reminder_3', label: 'Phone reminder 3', placeholder: 'Time + message' },
    ],
    title: '2. The protection',
  },
  {
    description: 'Identify the people who will know about this plan.',
    fields: [
      { key: 'anchor_1_name', label: 'Anchor one' },
      { key: 'anchor_1_when', label: 'Anchor one check-in when' },
      { key: 'anchor_2_name', label: 'Anchor two' },
      { key: 'anchor_2_when', label: 'Anchor two check-in when' },
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
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()));
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [plan, setPlan] = useState<EventPlanForm>(emptyPlan);
  const [planId, setPlanId] = useState('');
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

  async function handleLoadPlan(id: string) {
    if (!session) {
      return;
    }

    setLoading(true);
    setMessage('');

    const { data, error } = await supabase
      .from('event_plans')
      .select(`${Object.keys(emptyPlan).join(', ')}, id, updated_at`)
      .eq('id', id)
      .eq('user_id', session.user.id)
      .single<EventPlanRow>();

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setPlan(rowToPlan(data));
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

    const savedPlan = {
      ...trimPlan(plan),
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
    await loadPlanSummaries(session.user.id);
    setMessage('Event plan saved.');
  }

  function handleNewPlan() {
    setPlan(emptyPlan);
    setPlanId('');
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
