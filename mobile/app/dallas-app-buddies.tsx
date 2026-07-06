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
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';

import { syncGrantedPushTokenAsync } from '../src/lib/notifications';
import { supabase } from '../src/lib/supabase';

type BuddyPartner = {
  app_connection_id: string | null;
  avatar_path: string | null;
  check_in_at: string | null;
  connected_user_id: string | null;
  created_at: string;
  id: string;
  location: string | null;
  name: string;
  notes: string | null;
  partner_kind: 'external' | 'dallas_user';
  relationship: string | null;
  time_zone: string | null;
};

type BuddyProfile = {
  avatar_path: string | null;
  display_name: string | null;
  id: string;
};

type BuddyMessage = {
  body: string;
  created_at: string;
  id: string;
  sender_user_id: string;
};

type PlannedCheckIn = {
  id: string;
  note: string | null;
  notification_id: string | null;
  partner_id: string;
  scheduled_at: string;
};

type BuddySettings = {
  checkInDate: string;
  checkInTime: string;
  location: string;
  notes: string;
  timeZone: string;
};

const emptySettings: BuddySettings = {
  checkInDate: '',
  checkInTime: '18:00',
  location: '',
  notes: '',
  timeZone: 'Europe/London',
};

const timeZones = [
  { label: 'London', value: 'Europe/London' },
  { label: 'Denmark', value: 'Europe/Copenhagen' },
  { label: 'Paris', value: 'Europe/Paris' },
  { label: 'Berlin', value: 'Europe/Berlin' },
  { label: 'Amsterdam', value: 'Europe/Amsterdam' },
  { label: 'New York', value: 'America/New_York' },
  { label: 'Chicago', value: 'America/Chicago' },
  { label: 'Los Angeles', value: 'America/Los_Angeles' },
  { label: 'Sydney', value: 'Australia/Sydney' },
  { label: 'Auckland', value: 'Pacific/Auckland' },
] as const;

export default function DallasAppBuddiesScreen() {
  const [appConnectLookup, setAppConnectLookup] = useState('');
  const [buddies, setBuddies] = useState<BuddyPartner[]>([]);
  const [buddyProfiles, setBuddyProfiles] = useState<Record<string, BuddyProfile>>({});
  const [connectingAppUser, setConnectingAppUser] = useState(false);
  const [dallasCode, setDallasCode] = useState('');
  const [expandedBuddyId, setExpandedBuddyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<BuddyMessage[]>([]);
  const [messageText, setMessageText] = useState('');
  const [plannedCheckIns, setPlannedCheckIns] = useState<PlannedCheckIn[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [settings, setSettings] = useState<BuddySettings>(emptySettings);
  const [session, setSession] = useState<Session | null>(null);
  const [showConnectSection, setShowConnectSection] = useState(true);
  const [showTimeZoneOptions, setShowTimeZoneOptions] = useState(false);

  const expandedBuddy = useMemo(
    () => buddies.find((buddy) => buddy.id === expandedBuddyId) ?? null,
    [buddies, expandedBuddyId],
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

      await Promise.all([
        loadDallasCode(),
        loadBuddies(nextSession.user.id, mounted),
        markBuddyMessagesRead(nextSession.user.id),
        syncGrantedPushTokenAsync(nextSession.user.id).catch(() => null),
      ]);
      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  async function loadDallasCode() {
    const { data, error } = await supabase.functions.invoke('accountability-app', {
      body: {
        action: 'get_code',
      },
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    setDallasCode(typeof data?.code === 'string' ? data.code : '');
  }

  async function loadBuddies(userId: string, mounted = true) {
    const { data, error } = await supabase
      .from('accountability_partners')
      .select(
        'app_connection_id, avatar_path, check_in_at, connected_user_id, created_at, id, location, name, notes, partner_kind, relationship, time_zone',
      )
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
    setBuddies(nextBuddies);
    await loadBuddyProfiles(nextBuddies, mounted);

    if (!expandedBuddyId && nextBuddies[0]) {
      handleToggleBuddy(nextBuddies[0]);
    }
  }

  async function loadBuddyProfiles(nextBuddies: BuddyPartner[], mounted = true) {
    const userIds = nextBuddies
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

  async function loadMessages(connectionId: string | null, mounted = true) {
    if (!connectionId) {
      setMessages([]);
      return;
    }

    const { data, error } = await supabase
      .from('accountability_app_messages')
      .select('body, created_at, id, sender_user_id')
      .eq('connection_id', connectionId)
      .order('created_at', { ascending: true })
      .limit(80);

    if (!mounted) {
      return;
    }

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessages(data ?? []);
  }

  async function loadPlannedCheckIns(partnerId: string, mounted = true, userId = session?.user.id) {
    if (!userId) {
      return;
    }

    const { data, error } = await supabase
      .from('accountability_planned_check_ins')
      .select('id, note, notification_id, partner_id, scheduled_at')
      .eq('user_id', userId)
      .eq('partner_id', partnerId)
      .order('scheduled_at', { ascending: true })
      .limit(8);

    if (!mounted) {
      return;
    }

    if (error) {
      setMessage(error.message);
      return;
    }

    setPlannedCheckIns(data ?? []);
  }

  async function markBuddyMessagesRead(userId: string) {
    const { data: appConnections } = await supabase
      .from('accountability_app_connections')
      .select('id')
      .or(`requester_user_id.eq.${userId},recipient_user_id.eq.${userId}`);
    const connectionIds = (appConnections ?? []).map((connection) => connection.id);

    if (!connectionIds.length) {
      return;
    }

    await supabase
      .from('accountability_app_messages')
      .update({ read_at: new Date().toISOString() })
      .in('connection_id', connectionIds)
      .neq('sender_user_id', userId)
      .is('read_at', null);
  }

  async function handleConnectDallasUser() {
    if (!session) {
      setMessage('Sign in before adding a Dallas user.');
      return;
    }

    const lookup = appConnectLookup.trim();

    if (!lookup) {
      setMessage('Enter their Dallas PIN or account email.');
      return;
    }

    setConnectingAppUser(true);
    setMessage('');

    const { error } = await supabase.functions.invoke('accountability-app', {
      body: {
        action: 'connect',
        lookup,
      },
    });

    setConnectingAppUser(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setAppConnectLookup('');
    await loadBuddies(session.user.id);
    setMessage('Dallas App Buddy connected.');
  }

  async function handleCopyDallasCode() {
    if (!dallasCode) {
      setMessage('Dallas PIN is still being created.');
      return;
    }

    await Clipboard.setStringAsync(dallasCode);
    setMessage('Dallas PIN copied.');
  }

  function handleToggleBuddy(buddy: BuddyPartner) {
    const nextExpandedId = expandedBuddyId === buddy.id ? '' : buddy.id;
    setExpandedBuddyId(nextExpandedId);
    setMessage('');
    setMessageText('');
    setShowTimeZoneOptions(false);

    if (!nextExpandedId) {
      setMessages([]);
      setPlannedCheckIns([]);
      return;
    }

    setSettings({
      checkInDate: formatDateInput(buddy.check_in_at),
      checkInTime: formatTimeInput(buddy.check_in_at) || '18:00',
      location: buddy.location ?? '',
      notes: buddy.notes ?? '',
      timeZone: buddy.time_zone ?? 'Europe/London',
    });
    loadMessages(buddy.app_connection_id);
    loadPlannedCheckIns(buddy.id);
  }

  function updateSetting(key: keyof BuddySettings, value: string) {
    setSettings((currentSettings) => ({
      ...currentSettings,
      [key]: value,
    }));
  }

  async function handleSaveSettings() {
    if (!session || !expandedBuddy) {
      return;
    }

    setSavingSettings(true);
    setMessage('');

    const { error } = await supabase
      .from('accountability_partners')
      .update({
        check_in_at: buildCheckInIso(settings.checkInDate, settings.checkInTime),
        location: settings.location.trim() || null,
        notes: settings.notes.trim() || null,
        time_zone: settings.timeZone,
        updated_at: new Date().toISOString(),
      })
      .eq('id', expandedBuddy.id)
      .eq('user_id', session.user.id);

    setSavingSettings(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadBuddies(session.user.id);
    setMessage('Buddy settings saved.');
  }

  async function handleAddPlannedCheckIn() {
    if (!session || !expandedBuddy) {
      return;
    }

    const scheduledAt = buildCheckInIso(settings.checkInDate, settings.checkInTime || '18:00');

    if (!scheduledAt) {
      setMessage('Choose a date and time before adding a planned check-in.');
      return;
    }

    const { error } = await supabase.from('accountability_planned_check_ins').insert({
      note: settings.notes.trim() || null,
      partner_id: expandedBuddy.id,
      scheduled_at: scheduledAt,
      user_id: session.user.id,
    });

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadPlannedCheckIns(expandedBuddy.id);
    setMessage('Planned check-in added.');
  }

  async function handleRemovePlannedCheckIn(plannedCheckIn: PlannedCheckIn) {
    const { error } = await supabase
      .from('accountability_planned_check_ins')
      .delete()
      .eq('id', plannedCheckIn.id)
      .eq('partner_id', plannedCheckIn.partner_id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadPlannedCheckIns(plannedCheckIn.partner_id);
    setMessage('Planned check-in removed.');
  }

  async function handleSendMessage() {
    if (!session || !expandedBuddy?.app_connection_id) {
      return;
    }

    const body = messageText.trim();

    if (!body) {
      setMessage('Enter a message before sending.');
      return;
    }

    setSendingMessage(true);
    setMessage('');

    const { error } = await supabase.functions.invoke('accountability-app', {
      body: {
        action: 'send_message',
        connectionId: expandedBuddy.app_connection_id,
        message: body,
      },
    });

    setSendingMessage(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setMessageText('');
    await loadMessages(expandedBuddy.app_connection_id);
  }

  function updateCheckInDate(nextDate: Date) {
    updateSetting('checkInDate', formatDateForInput(nextDate));

    if (!settings.checkInTime) {
      updateSetting('checkInTime', '18:00');
    }
  }

  function adjustCheckInDate(days: number) {
    const currentDate = parseCheckInDate(settings.checkInDate) ?? new Date();
    currentDate.setDate(currentDate.getDate() + days);
    updateCheckInDate(currentDate);
  }

  function adjustCheckInTime(minutes: number) {
    const currentTime = parseCheckInTime(settings.checkInTime);
    const nextTime = new Date();
    nextTime.setHours(currentTime.hour, currentTime.minute + minutes, 0, 0);
    updateSetting('checkInTime', formatTimeForInput(nextTime));
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centerPanel}>
          <ActivityIndicator color="#38635D" />
          <Text style={styles.loadingText}>Loading Dallas App Buddies...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.container}>
          <Text style={styles.eyebrow}>Dallas App Buddies</Text>
          <Text style={styles.title}>Sign in required</Text>
          <Text style={styles.copy}>Your Dallas App Buddies are available after signing in.</Text>
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
          <Text style={styles.eyebrow}>Dallas App Buddies</Text>
          <Text style={styles.title}>Dallas App Buddies</Text>
          <Text style={styles.copy}>
            Connect Dallas users here, then open a buddy to view messages, plan check-ins, and keep their settings
            current.
          </Text>

          <View style={styles.panel}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showConnectSection }}
              style={styles.connectHeader}
              onPress={() => setShowConnectSection((visible) => !visible)}
            >
              <MaterialIcons color="#38635D" name={showConnectSection ? 'expand-less' : 'expand-more'} size={24} />
              <View style={styles.connectTitleCopy}>
                <Text style={styles.sectionTitle}>Connect Dallas App Buddies</Text>
                <Text style={styles.connectSummary}>{buddies.length} connected</Text>
              </View>
            </Pressable>

            {showConnectSection ? (
              <View style={styles.connectBody}>
                <Text style={styles.mutedText}>
                  Share your PIN with another Dallas user, or enter their PIN or account email to connect in the app.
                </Text>
                <View style={styles.codePanel}>
                  <View style={styles.codeHeaderRow}>
                    <View style={styles.codeCopy}>
                      <Text style={styles.inputLabel}>Your Dallas PIN</Text>
                      <Text style={styles.codeText}>{dallasCode || 'Creating...'}</Text>
                    </View>
                    <Pressable
                      accessibilityRole="button"
                      disabled={!dallasCode}
                      style={[styles.copyButton, !dallasCode && styles.disabledButton]}
                      onPress={handleCopyDallasCode}
                    >
                      <MaterialIcons color="#38635D" name="content-copy" size={18} />
                      <Text style={styles.copyButtonText}>Copy</Text>
                    </Pressable>
                  </View>
                </View>
                <Field
                  label="Dallas PIN or email"
                  placeholder="DLS-ABCD-2345 or user@example.com"
                  value={appConnectLookup}
                  onChangeText={setAppConnectLookup}
                />
                <Pressable
                  disabled={connectingAppUser}
                  style={[styles.button, connectingAppUser && styles.disabledButton]}
                  onPress={handleConnectDallasUser}
                >
                  <Text style={styles.buttonText}>{connectingAppUser ? 'Connecting...' : 'Connect Dallas user'}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {buddies.length ? (
            <View style={styles.buddyList}>
              {buddies.map((buddy) => {
                const expanded = buddy.id === expandedBuddyId;
                const profile = buddy.connected_user_id ? buddyProfiles[buddy.connected_user_id] : undefined;
                const avatarUrl = profile?.avatar_path ? getPublicAvatarUrl(profile.avatar_path) : '';
                const displayName = profile?.display_name || buddy.name;

                return (
                  <View key={buddy.id} style={[styles.buddyItem, expanded && styles.activeBuddyItem]}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ expanded }}
                      style={styles.buddyHeader}
                      onPress={() => handleToggleBuddy(buddy)}
                    >
                      <View style={styles.smallAvatar}>
                        {avatarUrl ? (
                          <Image source={{ uri: avatarUrl }} style={styles.smallAvatarImage} />
                        ) : (
                          <Text style={styles.smallAvatarInitial}>{getInitial(displayName)}</Text>
                        )}
                      </View>
                      <View style={styles.buddyHeaderCopy}>
                        <Text style={styles.buddyName}>{displayName}</Text>
                        <Text style={styles.buddyMeta}>
                          {[settingsLabel(buddy), getLocalTime(buddy.time_zone)].filter(Boolean).join(' - ') ||
                            'Dallas app buddy'}
                        </Text>
                      </View>
                      <MaterialIcons color="#38635D" name={expanded ? 'expand-less' : 'expand-more'} size={24} />
                    </Pressable>

                    {expanded ? (
                      <View style={styles.buddyBody}>
                        <View style={styles.plannedSection}>
                          <Text style={styles.sectionTitle}>Planned check-ins</Text>
                          {plannedCheckIns.length ? (
                            <View style={styles.plannedList}>
                              {plannedCheckIns.map((plannedCheckIn) => (
                                <View key={plannedCheckIn.id} style={styles.plannedItem}>
                                  <Text style={styles.plannedTitle}>{formatDateTime(plannedCheckIn.scheduled_at)}</Text>
                                  {plannedCheckIn.note ? (
                                    <Text style={styles.plannedNote}>{plannedCheckIn.note}</Text>
                                  ) : null}
                                  <Pressable
                                    style={styles.secondaryButton}
                                    onPress={() => handleRemovePlannedCheckIn(plannedCheckIn)}
                                  >
                                    <Text style={styles.secondaryButtonText}>Remove</Text>
                                  </Pressable>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text style={styles.mutedText}>No planned check-ins yet.</Text>
                          )}

                          <View style={styles.pickerPanel}>
                            <View style={styles.pickerHeaderRow}>
                              <Pressable style={styles.stepperButton} onPress={() => adjustCheckInDate(-1)}>
                                <Text style={styles.stepperButtonText}>-</Text>
                              </Pressable>
                              <View style={styles.pickerValue}>
                                <Text style={styles.pickerValueLabel}>Date</Text>
                                <Text style={styles.pickerValueText}>{formatHumanDate(settings.checkInDate)}</Text>
                              </View>
                              <Pressable style={styles.stepperButton} onPress={() => adjustCheckInDate(1)}>
                                <Text style={styles.stepperButtonText}>+</Text>
                              </Pressable>
                            </View>

                            <View style={styles.quickDateRow}>
                              {getQuickDateOptions().map((option) => (
                                <Pressable
                                  key={option.label}
                                  style={[
                                    styles.quickDateButton,
                                    settings.checkInDate === option.value && styles.activeQuickDateButton,
                                  ]}
                                  onPress={() => updateCheckInDate(option.date)}
                                >
                                  <Text
                                    style={[
                                      styles.quickDateButtonText,
                                      settings.checkInDate === option.value && styles.activeQuickDateButtonText,
                                    ]}
                                  >
                                    {option.label}
                                  </Text>
                                </Pressable>
                              ))}
                            </View>

                            <View style={styles.pickerHeaderRow}>
                              <Pressable style={styles.stepperButton} onPress={() => adjustCheckInTime(-15)}>
                                <Text style={styles.stepperButtonText}>-</Text>
                              </Pressable>
                              <View style={styles.pickerValue}>
                                <Text style={styles.pickerValueLabel}>Time</Text>
                                <Text style={styles.pickerValueText}>{settings.checkInTime || '18:00'}</Text>
                              </View>
                              <Pressable style={styles.stepperButton} onPress={() => adjustCheckInTime(15)}>
                                <Text style={styles.stepperButtonText}>+</Text>
                              </Pressable>
                            </View>

                            <Pressable style={styles.button} onPress={handleAddPlannedCheckIn}>
                              <Text style={styles.buttonText}>Add planned check-in</Text>
                            </Pressable>
                          </View>
                        </View>

                        <View style={styles.messagePanel}>
                          <Text style={styles.sectionTitle}>Message {displayName}</Text>
                          {messages.length ? (
                            <View style={styles.messageList}>
                              {messages.map((buddyMessage) => {
                                const isMine = buddyMessage.sender_user_id === session.user.id;

                                return (
                                  <View
                                    key={buddyMessage.id}
                                    style={[styles.messageBubble, isMine ? styles.myMessageBubble : styles.theirMessageBubble]}
                                  >
                                    <Text style={[styles.messageBody, isMine && styles.myMessageBody]}>
                                      {buddyMessage.body}
                                    </Text>
                                    <Text style={[styles.messageTime, isMine && styles.myMessageTime]}>
                                      {formatDateTime(buddyMessage.created_at)}
                                    </Text>
                                  </View>
                                );
                              })}
                            </View>
                          ) : (
                            <Text style={styles.mutedText}>No messages yet.</Text>
                          )}

                          <Field
                            label="Message"
                            multiline
                            placeholder="Send a check-in or encouragement..."
                            value={messageText}
                            onChangeText={setMessageText}
                          />
                          <Pressable
                            disabled={sendingMessage}
                            style={[styles.button, sendingMessage && styles.disabledButton]}
                            onPress={handleSendMessage}
                          >
                            <Text style={styles.buttonText}>
                              {sendingMessage ? 'Sending...' : 'Send in-app message'}
                            </Text>
                          </Pressable>
                        </View>

                        <View style={styles.settingsPanel}>
                          <Text style={styles.sectionTitle}>Buddy settings</Text>
                          <Field
                            label="Location"
                            value={settings.location}
                            onChangeText={(value) => updateSetting('location', value)}
                          />
                          <View style={styles.fieldGroup}>
                            <View style={styles.timeZoneHeaderRow}>
                              <View style={styles.timeZoneHeaderCopy}>
                                <Text style={styles.inputLabel}>Timezone</Text>
                                <Text style={styles.timeZoneSummary}>{getTimeZoneLabel(settings.timeZone)}</Text>
                              </View>
                              <Pressable
                                accessibilityRole="button"
                                accessibilityState={{ expanded: showTimeZoneOptions }}
                                style={styles.timeZoneToggle}
                                onPress={() => setShowTimeZoneOptions((visible) => !visible)}
                              >
                                <MaterialIcons
                                  color="#38635D"
                                  name={showTimeZoneOptions ? 'expand-less' : 'expand-more'}
                                  size={20}
                                />
                                <Text style={styles.timeZoneToggleText}>{showTimeZoneOptions ? 'Hide' : 'Show'}</Text>
                              </Pressable>
                            </View>
                            {showTimeZoneOptions ? (
                              <View style={styles.timeZoneGrid}>
                                {timeZones.map((timeZone) => (
                                  <Pressable
                                    key={timeZone.value}
                                    style={[
                                      styles.timeZoneOption,
                                      settings.timeZone === timeZone.value && styles.activeTimeZoneOption,
                                    ]}
                                    onPress={() => updateSetting('timeZone', timeZone.value)}
                                  >
                                    <Text
                                      style={[
                                        styles.timeZoneOptionText,
                                        settings.timeZone === timeZone.value && styles.activeTimeZoneOptionText,
                                      ]}
                                    >
                                      {timeZone.label}
                                    </Text>
                                  </Pressable>
                                ))}
                              </View>
                            ) : null}
                          </View>
                          <Field
                            label="Notes"
                            multiline
                            placeholder="What kind of check-in helps with this buddy?"
                            value={settings.notes}
                            onChangeText={(value) => updateSetting('notes', value)}
                          />
                          <Pressable
                            disabled={savingSettings}
                            style={[styles.secondaryButton, savingSettings && styles.disabledButton]}
                            onPress={handleSaveSettings}
                          >
                            <Text style={styles.secondaryButtonText}>
                              {savingSettings ? 'Saving...' : 'Save buddy settings'}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>No Dallas App Buddies yet</Text>
              <Text style={styles.mutedText}>Use the connect panel above to add another Dallas user.</Text>
            </View>
          )}

          {message ? <Text style={styles.statusMessage}>{message}</Text> : null}

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

function Field({
  label,
  multiline,
  onChangeText,
  placeholder,
  value,
}: {
  label: string;
  multiline?: boolean;
  onChangeText: (value: string) => void;
  placeholder?: string;
  value: string;
}) {
  return (
    <View style={styles.fieldGroup}>
      <Text style={styles.inputLabel}>{label}</Text>
      <TextInput
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#8A948F"
        style={[styles.input, multiline && styles.multilineInput]}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
    </View>
  );
}

function buildCheckInIso(date: string, time: string) {
  const trimmedDate = date.trim();
  const trimmedTime = time.trim();

  if (!trimmedDate && !trimmedTime) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate) || !/^\d{2}:\d{2}$/.test(trimmedTime)) {
    return null;
  }

  return new Date(`${trimmedDate}T${trimmedTime}:00`).toISOString();
}

function formatDateForInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatDateInput(value: string | null) {
  return value ? value.slice(0, 10) : '';
}

function formatHumanDate(value: string) {
  const parsedDate = parseCheckInDate(value);

  if (!parsedDate) {
    return 'Choose date';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    weekday: 'short',
    year: 'numeric',
  }).format(parsedDate);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return 'Not set';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function formatTimeForInput(value: Date) {
  return `${String(value.getHours()).padStart(2, '0')}:${String(value.getMinutes()).padStart(2, '0')}`;
}

function formatTimeInput(value: string | null) {
  return value ? new Date(value).toTimeString().slice(0, 5) : '';
}

function getInitial(name: string) {
  return (name || 'D').trim().charAt(0).toUpperCase();
}

function getLocalTime(timeZone: string | null) {
  if (!timeZone) {
    return '';
  }

  try {
    return new Intl.DateTimeFormat(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      timeZone,
      timeZoneName: 'short',
    }).format(new Date());
  } catch {
    return '';
  }
}

function getPublicAvatarUrl(path: string) {
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

function getQuickDateOptions() {
  const today = new Date();
  const tomorrow = new Date();
  const nextWeek = new Date();

  tomorrow.setDate(today.getDate() + 1);
  nextWeek.setDate(today.getDate() + 7);

  return [
    { date: today, label: 'Today', value: formatDateForInput(today) },
    { date: tomorrow, label: 'Tomorrow', value: formatDateForInput(tomorrow) },
    { date: nextWeek, label: 'Next week', value: formatDateForInput(nextWeek) },
  ];
}

function getTimeZoneLabel(value: string) {
  return timeZones.find((timeZone) => timeZone.value === value)?.label ?? 'Choose a timezone';
}

function parseCheckInDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsedDate = new Date(`${value}T00:00:00`);

  return Number.isNaN(parsedDate.getTime()) ? null : parsedDate;
}

function parseCheckInTime(value: string) {
  if (!/^\d{2}:\d{2}$/.test(value)) {
    return { hour: 18, minute: 0 };
  }

  const [hour, minute] = value.split(':').map(Number);

  return {
    hour: Number.isFinite(hour) ? hour : 18,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function settingsLabel(buddy: BuddyPartner) {
  return buddy.location || buddy.relationship || 'Dallas app buddy';
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
  connectHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
  },
  connectTitleCopy: {
    flex: 1,
    gap: 2,
  },
  connectSummary: {
    color: '#697570',
    fontSize: 12,
    fontWeight: '800',
  },
  connectBody: {
    borderTopColor: '#ECE5D8',
    borderTopWidth: 1,
    gap: 12,
    paddingTop: 12,
  },
  codePanel: {
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    padding: 12,
  },
  codeHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  codeCopy: {
    flex: 1,
    gap: 4,
  },
  codeText: {
    color: '#17211F',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
  },
  copyButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#B9CDC6',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 10,
  },
  copyButtonText: {
    color: '#38635D',
    fontSize: 13,
    fontWeight: '900',
  },
  buddyList: {
    gap: 10,
  },
  buddyItem: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  activeBuddyItem: {
    borderColor: '#38635D',
  },
  buddyHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    minHeight: 68,
    padding: 12,
  },
  smallAvatar: {
    alignItems: 'center',
    backgroundColor: '#ECE5D8',
    borderRadius: 22,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
  },
  smallAvatarImage: {
    height: 44,
    width: 44,
  },
  smallAvatarInitial: {
    color: '#38635D',
    fontSize: 17,
    fontWeight: '900',
  },
  buddyHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  buddyName: {
    color: '#17211F',
    fontSize: 17,
    fontWeight: '900',
  },
  buddyMeta: {
    color: '#697570',
    fontSize: 13,
    fontWeight: '700',
  },
  buddyBody: {
    borderTopColor: '#ECE5D8',
    borderTopWidth: 1,
    gap: 16,
    padding: 12,
  },
  plannedSection: {
    gap: 10,
  },
  sectionTitle: {
    color: '#17211F',
    fontSize: 15,
    fontWeight: '900',
  },
  mutedText: {
    color: '#4F5D58',
    fontSize: 14,
    lineHeight: 20,
  },
  plannedList: {
    gap: 8,
  },
  plannedItem: {
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 10,
  },
  plannedTitle: {
    color: '#17211F',
    fontSize: 14,
    fontWeight: '900',
  },
  plannedNote: {
    color: '#4F5D58',
    fontSize: 12,
    lineHeight: 17,
  },
  pickerPanel: {
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  pickerHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  pickerValue: {
    alignItems: 'center',
    flex: 1,
    gap: 3,
  },
  pickerValueLabel: {
    color: '#697570',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  pickerValueText: {
    color: '#17211F',
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  stepperButton: {
    alignItems: 'center',
    backgroundColor: '#38635D',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  stepperButtonText: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '900',
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickDateButton: {
    alignItems: 'center',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 8,
  },
  activeQuickDateButton: {
    backgroundColor: '#38635D',
    borderColor: '#38635D',
  },
  quickDateButtonText: {
    color: '#4F5D58',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  activeQuickDateButtonText: {
    color: '#FFFFFF',
  },
  messagePanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  messageList: {
    gap: 8,
  },
  messageBubble: {
    borderRadius: 8,
    gap: 5,
    maxWidth: '88%',
    padding: 10,
  },
  myMessageBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#38635D',
  },
  theirMessageBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderWidth: 1,
  },
  messageBody: {
    color: '#17211F',
    fontSize: 14,
    lineHeight: 20,
  },
  myMessageBody: {
    color: '#FFFFFF',
  },
  messageTime: {
    color: '#697570',
    fontSize: 11,
    fontWeight: '800',
  },
  myMessageTime: {
    color: '#D9E8E3',
  },
  settingsPanel: {
    borderTopColor: '#ECE5D8',
    borderTopWidth: 1,
    gap: 12,
    paddingTop: 12,
  },
  fieldGroup: {
    gap: 6,
  },
  inputLabel: {
    color: '#697570',
    fontSize: 13,
    fontWeight: '800',
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
  timeZoneHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  timeZoneHeaderCopy: {
    flex: 1,
    gap: 3,
  },
  timeZoneSummary: {
    color: '#17211F',
    fontSize: 15,
    fontWeight: '800',
  },
  timeZoneToggle: {
    alignItems: 'center',
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    minHeight: 40,
    paddingHorizontal: 10,
  },
  timeZoneToggleText: {
    color: '#38635D',
    fontSize: 13,
    fontWeight: '900',
  },
  timeZoneGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeZoneOption: {
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  activeTimeZoneOption: {
    backgroundColor: '#38635D',
    borderColor: '#38635D',
  },
  timeZoneOptionText: {
    color: '#4F5D58',
    fontSize: 13,
    fontWeight: '800',
  },
  activeTimeZoneOptionText: {
    color: '#FFFFFF',
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
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#38635D',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: '#38635D',
    fontSize: 14,
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
  statusMessage: {
    color: '#4F5D58',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
});
