import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';

import {
  ensureNotificationChannelAsync,
  notificationChannelId,
  syncGrantedPushTokenAsync,
} from '../src/lib/notifications';
import { supabase } from '../src/lib/supabase';
import { SectionCard } from '../src/components/SectionCard';

type AccountabilityPartner = {
  app_connection_id: string | null;
  avatar_path: string | null;
  check_in_at: string | null;
  connected_user_id: string | null;
  consent_confirmed_at: string | null;
  created_at: string;
  id: string;
  invited_at: string | null;
  last_notified_at: string | null;
  location: string | null;
  mobile_number: string | null;
  name: string;
  notes: string | null;
  partner_kind: 'external' | 'dallas_user';
  relationship: string | null;
  time_zone: string | null;
};

type AccountabilityProfile = {
  display_name: string | null;
};

type AccountabilityCheckIn = {
  completed_at: string;
  id: string;
  note: string | null;
  partner_id: string;
};

type AccountabilityPlannedCheckIn = {
  id: string;
  note: string | null;
  notification_id: string | null;
  partner_id: string;
  scheduled_at: string;
};

type AccountabilityThreadMessage = {
  body: string;
  created_at: string;
  id: string;
  partner_id: string;
  sender_type: 'user' | 'partner';
};

type PartnerForm = {
  checkInDate: string;
  checkInTime: string;
  location: string;
  mobileNumber: string;
  name: string;
  notes: string;
  relationship: string;
  timeZone: string;
};

type SectionKey = 'partners' | 'details' | 'replies' | 'history';
type QuickCheckInStatus = 'okay' | 'support' | 'struggling';

const emptyPartnerForm: PartnerForm = {
  checkInDate: '',
  checkInTime: '',
  location: '',
  mobileNumber: '',
  name: '',
  notes: '',
  relationship: '',
  timeZone: 'Europe/London',
};

const defaultCheckInReplyUrl = 'https://dallas-app.onrender.com/check-in-reply/';

type NotificationPermissionResult = Notifications.NotificationPermissionsStatus & {
  granted?: boolean;
  status?: string;
};

function hasGrantedNotificationPermission(permissions: Notifications.NotificationPermissionsStatus) {
  const permissionResult = permissions as NotificationPermissionResult;

  return permissionResult.granted ?? permissionResult.status === 'granted';
}

const timeZones = [
  { label: 'London', value: 'Europe/London' },
  { label: 'Denmark', value: 'Europe/Copenhagen' },
  { label: 'Paris', value: 'Europe/Paris' },
  { label: 'Berlin', value: 'Europe/Berlin' },
  { label: 'Amsterdam', value: 'Europe/Amsterdam' },
  { label: 'Madrid', value: 'Europe/Madrid' },
  { label: 'Rome', value: 'Europe/Rome' },
  { label: 'Stockholm', value: 'Europe/Stockholm' },
  { label: 'Oslo', value: 'Europe/Oslo' },
  { label: 'Zurich', value: 'Europe/Zurich' },
  { label: 'Dublin', value: 'Europe/Dublin' },
  { label: 'Lisbon', value: 'Europe/Lisbon' },
  { label: 'Brussels', value: 'Europe/Brussels' },
  { label: 'Johannesburg', value: 'Africa/Johannesburg' },
  { label: 'New York', value: 'America/New_York' },
  { label: 'Chicago', value: 'America/Chicago' },
  { label: 'Denver', value: 'America/Denver' },
  { label: 'Los Angeles', value: 'America/Los_Angeles' },
  { label: 'Toronto', value: 'America/Toronto' },
  { label: 'Sydney', value: 'Australia/Sydney' },
  { label: 'Auckland', value: 'Pacific/Auckland' },
  { label: 'Dubai', value: 'Asia/Dubai' },
  { label: 'Singapore', value: 'Asia/Singapore' },
  { label: 'Tokyo', value: 'Asia/Tokyo' },
] as const;

export default function AccountabilityScreen() {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Record<SectionKey, boolean>>({
    details: false,
    history: false,
    partners: true,
    replies: false,
  });
  const [form, setForm] = useState<PartnerForm>(emptyPartnerForm);
  const [loading, setLoading] = useState(true);
  const [addingPlannedCheckIn, setAddingPlannedCheckIn] = useState(false);
  const [checkIns, setCheckIns] = useState<AccountabilityCheckIn[]>([]);
  const [completingCheckIn, setCompletingCheckIn] = useState(false);
  const [completingPlannedCheckInId, setCompletingPlannedCheckInId] = useState('');
  const [message, setMessage] = useState('');
  const [partnerMessages, setPartnerMessages] = useState<AccountabilityThreadMessage[]>([]);
  const [partners, setPartners] = useState<AccountabilityPartner[]>([]);
  const [plannedCheckIns, setPlannedCheckIns] = useState<AccountabilityPlannedCheckIn[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedPartnerId, setSelectedPartnerId] = useState('');
  const [session, setSession] = useState<Session | null>(null);
  const [showTimeZoneOptions, setShowTimeZoneOptions] = useState(false);
  const [userDisplayName, setUserDisplayName] = useState('');
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [quickCheckInStatus, setQuickCheckInStatus] = useState<QuickCheckInStatus | null>(null);
  const [quickCheckInNote, setQuickCheckInNote] = useState('');
  const [quickCheckInMessage, setQuickCheckInMessage] = useState('');
  const [messageSentFeedback, setMessageSentFeedback] = useState<string | null>(null);
  const [checkInSavedFeedback, setCheckInSavedFeedback] = useState(false);

  const selectedPartner = useMemo(
    () => partners.find((partner) => partner.id === selectedPartnerId) ?? null,
    [partners, selectedPartnerId],
  );
  const selectedAvatarUrl = selectedPartner?.avatar_path
    ? getPublicPartnerAvatarUrl(selectedPartner.avatar_path)
    : '';
  const selectedLocalTime = getLocalTime(form.timeZone);
  const selectedTimeZoneLabel = getTimeZoneLabel(form.timeZone);
  const hasDallasBuddies = partners.some((partner) => partner.partner_kind === 'dallas_user');

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
        loadPartners(nextSession.user.id, mounted),
        loadUserDisplayName(nextSession.user.id, mounted, nextSession.user.user_metadata, nextSession.user.email),
        markUnreadAccountabilityMessagesRead(nextSession.user.id),
        syncGrantedPushTokenAsync(nextSession.user.id).catch(() => null),
      ]);
      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  async function loadPartners(userId: string, mounted = true) {
    const { data, error } = await supabase
      .from('accountability_partners')
      .select(
        'app_connection_id, avatar_path, check_in_at, connected_user_id, consent_confirmed_at, created_at, id, invited_at, last_notified_at, location, mobile_number, name, notes, partner_kind, relationship, time_zone',
      )
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!mounted) {
      return;
    }

    if (error) {
      setMessage(error.message);
      return;
    }

    setPartners(data ?? []);
  }

  async function loadUserDisplayName(
    userId: string,
    mounted = true,
    metadata: Record<string, unknown> = {},
    email: string | undefined = undefined,
  ) {
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', userId)
      .maybeSingle<AccountabilityProfile>();

    if (!mounted) {
      return;
    }

    if (error) {
      setUserDisplayName(getFallbackUserDisplayName(metadata, email));
      return;
    }

    setUserDisplayName(data?.display_name || getFallbackUserDisplayName(metadata, email));
  }

  async function loadCheckIns(partnerId: string, mounted = true, userId = session?.user.id) {
    if (!userId || !partnerId) {
      setCheckIns([]);
      return;
    }

    const { data, error } = await supabase
      .from('accountability_check_ins')
      .select('completed_at, id, note, partner_id')
      .eq('user_id', userId)
      .eq('partner_id', partnerId)
      .order('completed_at', { ascending: false })
      .limit(8);

    if (!mounted) {
      return;
    }

    if (error) {
      setMessage(error.message);
      return;
    }

    setCheckIns(data ?? []);
  }

  async function loadPlannedCheckIns(partnerId: string, mounted = true, userId = session?.user.id) {
    if (!userId || !partnerId) {
      setPlannedCheckIns([]);
      return;
    }

    const { data, error } = await supabase
      .from('accountability_planned_check_ins')
      .select('id, note, notification_id, partner_id, scheduled_at')
      .eq('user_id', userId)
      .eq('partner_id', partnerId)
      .order('scheduled_at', { ascending: true })
      .limit(6);

    if (!mounted) {
      return;
    }

    if (error) {
      setMessage(error.message);
      return;
    }

    setPlannedCheckIns(data ?? []);
  }

  async function loadPartnerMessages(partnerId: string, mounted = true, userId = session?.user.id) {
    if (!userId || !partnerId) {
      setPartnerMessages([]);
      return;
    }

    const { data, error } = await supabase
      .from('accountability_check_in_messages')
      .select('body, created_at, id, partner_id, sender_type')
      .eq('user_id', userId)
      .eq('partner_id', partnerId)
      .eq('sender_type', 'partner')
      .order('created_at', { ascending: false })
      .limit(8);

    if (!mounted) {
      return;
    }

    if (error) {
      setMessage(error.message);
      return;
    }

    setPartnerMessages(data ?? []);
  }

  async function markUnreadAccountabilityMessagesRead(userId: string) {
    await supabase
      .from('accountability_check_in_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('sender_type', 'partner')
      .is('read_at', null);
  }

  async function savePartner({ silent = false } = {}) {
    if (!session) {
      setMessage('Sign in before saving accountability partners.');
      return '';
    }

    const trimmedName = form.name.trim();
    const trimmedMobile = form.mobileNumber.trim();

    if (!trimmedName) {
      setMessage('Enter the partner name.');
      return '';
    }

    if (trimmedMobile && !isInternationalPhoneNumber(trimmedMobile)) {
      setMessage('Use international phone format, like +441234567890.');
      return '';
    }

    setSaving(true);
    if (!silent) {
      setMessage('');
    }

    const { data, error } = await supabase
      .from('accountability_partners')
      .upsert({
        id: selectedPartnerId || undefined,
        location: form.location.trim() || null,
        mobile_number: trimmedMobile || null,
        name: trimmedName,
        notes: form.notes.trim() || null,
        phone: trimmedMobile || null,
        relationship: form.relationship.trim() || null,
        time_zone: form.timeZone,
        updated_at: new Date().toISOString(),
        user_id: session.user.id,
      })
      .select('id')
      .single();

    setSaving(false);

    if (error) {
      setMessage(error.message);
      return '';
    }

    setSelectedPartnerId(data.id);
    await loadPartners(session.user.id);
    await loadCheckIns(data.id, true, session.user.id);
    await loadPlannedCheckIns(data.id, true, session.user.id);
    await loadPartnerMessages(data.id, true, session.user.id);

    if (!silent) {
      setMessage('Accountability partner saved.');
    }

    return data.id;
  }

  function handleNewPartner() {
    setForm(emptyPartnerForm);
    setSelectedPartnerId('');
    setCheckIns([]);
    setPlannedCheckIns([]);
    setPartnerMessages([]);
    setAvatarFailed(false);
    setMessage('');
  }

  function handleSelectPartner(partner: AccountabilityPartner) {
    setSelectedPartnerId(partner.id);
    setAvatarFailed(false);
    setMessage('');
    setForm({
      checkInDate: formatDateInput(partner.check_in_at),
      checkInTime: formatTimeInput(partner.check_in_at),
      location: partner.location ?? '',
      mobileNumber: partner.mobile_number ?? '',
      name: partner.name,
      notes: partner.notes ?? '',
      relationship: partner.relationship ?? '',
      timeZone: partner.time_zone ?? 'Europe/London',
    });
    if (quickCheckInStatus && quickCheckInStatus !== 'okay') {
      setQuickCheckInMessage(buildQuickCheckInMessage(partner.name, quickCheckInStatus, quickCheckInNote));
    }
    loadCheckIns(partner.id);
    loadPlannedCheckIns(partner.id);
    loadPartnerMessages(partner.id);
  }

  async function handleAvatarUpload() {
    if (!session) {
      setMessage('Sign in before uploading a partner avatar.');
      return;
    }

    const partnerId = selectedPartnerId || (await savePartner({ silent: true }));

    if (!partnerId) {
      return;
    }

    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      setMessage('Photo library permission is needed to choose an avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ['images'],
      quality: 0.8,
    });

    if (result.canceled) {
      return;
    }

    const asset = result.assets[0];
    const contentType = asset.mimeType ?? 'image/jpeg';
    const extension = getImageExtension(contentType, asset.uri);
    const avatarPath = `${session.user.id}/${partnerId}/avatar.${extension}`;

    setUploadingAvatar(true);
    setMessage('');

    const response = await fetch(asset.uri);
    const imageData = await response.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('accountability-avatars')
      .upload(avatarPath, imageData, {
        cacheControl: '0',
        contentType,
        upsert: true,
      });

    if (uploadError) {
      setUploadingAvatar(false);
      setMessage(uploadError.message);
      return;
    }

    const { error: profileError } = await supabase
      .from('accountability_partners')
      .update({
        avatar_path: avatarPath,
        updated_at: new Date().toISOString(),
      })
      .eq('id', partnerId)
      .eq('user_id', session.user.id);

    setUploadingAvatar(false);

    if (profileError) {
      setMessage(profileError.message);
      return;
    }

    setAvatarFailed(false);
    await loadPartners(session.user.id);
    setMessage('Partner avatar updated.');
  }

  async function handleInvitePartner() {
    if (!session) {
      return;
    }

    const partnerId = selectedPartnerId || (await savePartner({ silent: true }));

    if (!partnerId) {
      return;
    }

    const body = `Hi ${form.name.trim()}, I am adding you as an accountability partner in Dallas. Can I check in with you when I need support?`;
    const sent = await openSms(form.mobileNumber, body);

    if (!sent) {
      return;
    }

    await markPartnerTimestamp(partnerId, 'invited_at');
    setMessage('Invite opened in Messages.');
  }

  async function handleSendCheckIn() {
    if (!session) {
      return;
    }

    const partnerId = selectedPartnerId || (await savePartner({ silent: true }));

    if (!partnerId) {
      return;
    }

    const checkInText =
      form.checkInDate || form.checkInTime
        ? ` My next check-in is planned for ${[form.checkInDate, form.checkInTime].filter(Boolean).join(' at ')}.`
        : '';
    const replyLink = await createCheckInThread({
      body: `Check-in message sent to ${form.name.trim()}.${checkInText}`,
      partnerId,
    });

    if (!replyLink) {
      return;
    }

    const body = `Hi ${form.name.trim()}, this is my Dallas accountability check-in.${checkInText} Can you check in with me?\n\nReply here: ${replyLink}`;
    const sent = await openSms(form.mobileNumber, body);

    if (!sent) {
      return;
    }

    await markPartnerTimestamp(partnerId, 'last_notified_at');
    setMessage('Check-in message opened in Messages.');
  }

  async function createCheckInThread({
    body,
    partnerId,
    plannedCheckInId = null,
  }: {
    body: string;
    partnerId: string;
    plannedCheckInId?: string | null;
  }) {
    if (!session) {
      return '';
    }

    const { data: thread, error: threadError } = await supabase
      .from('accountability_check_in_threads')
      .insert({
        partner_id: partnerId,
        planned_check_in_id: plannedCheckInId,
        user_display_name: userDisplayName || session.user.email || 'Dallas user',
        user_id: session.user.id,
      })
      .select('id, partner_token')
      .single();

    if (threadError) {
      setMessage(threadError.message);
      return '';
    }

    const { error: messageError } = await supabase.from('accountability_check_in_messages').insert({
      body,
      partner_id: partnerId,
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

  async function handleAddPlannedCheckIn() {
    if (!session) {
      return;
    }

    const partnerId = selectedPartnerId || (await savePartner({ silent: true }));

    if (!partnerId) {
      return;
    }

    const scheduledAt = buildCheckInIso(form.checkInDate, form.checkInTime || '18:00');

    if (!scheduledAt) {
      setMessage('Choose a date and time before adding a planned check-in.');
      return;
    }

    setAddingPlannedCheckIn(true);
    setMessage('');
    const partnerName = getPartnerName(partnerId, partners, form.name);
    const notificationId = await scheduleCheckInNotification({
      partnerName,
      scheduledAt,
      userId: session.user.id,
    });

    const { error } = await supabase.from('accountability_planned_check_ins').insert({
      notification_id: notificationId,
      note: form.notes.trim() || null,
      partner_id: partnerId,
      scheduled_at: scheduledAt,
      user_id: session.user.id,
    });

    setAddingPlannedCheckIn(false);

    if (error) {
      await cancelCheckInNotification(notificationId);
      setMessage(error.message);
      return;
    }

    await loadPlannedCheckIns(partnerId);
    setMessage(
      notificationId
        ? `Planned check-in added for ${partnerName}. Notification scheduled.`
        : `Planned check-in added for ${partnerName}. Enable notifications to get an alert.`,
    );
  }

  async function handleMarkCheckInCompleted() {
    if (!session) {
      return;
    }

    const partnerId = selectedPartnerId || (await savePartner({ silent: true }));

    if (!partnerId) {
      return;
    }

    await createCompletedCheckIn({
      note: form.notes.trim() || null,
      partnerId,
    });
  }

  async function handleQuickCheckIn(status: QuickCheckInStatus) {
    const notes: Record<QuickCheckInStatus, string> = {
      okay: 'I am doing okay.',
      support: 'I could use some support.',
      struggling: 'I am struggling right now.',
    };
    const note = notes[status];

    setQuickCheckInStatus(status);
    setQuickCheckInNote(note);
    setQuickCheckInMessage(selectedPartner ? buildQuickCheckInMessage(selectedPartner.name, status, note) : '');
    setMessage(status === 'okay' ? 'Save this check-in when you are ready.' : 'Choose someone to message, then review and send the prepared message.');
  }

  async function handleSaveQuickCheckIn() {
    if (!quickCheckInStatus) {
      return;
    }

    if (!selectedPartnerId) {
      setExpandedSections((current) => ({ ...current, partners: true }));
      setMessage('Choose a trusted person below before saving this check-in.');
      return;
    }

    const completed = await createCompletedCheckIn({
      note: quickCheckInNote.trim() || null,
      partnerId: selectedPartnerId,
    });

    if (completed) {
      setCheckInSavedFeedback(true);
      playMessageSentSound();
    }
  }

  async function handleSendQuickCheckIn() {
    if (!session || !quickCheckInStatus || quickCheckInStatus === 'okay') {
      return;
    }

    if (!selectedPartner) {
      setMessage('Choose someone to message before sending this check-in.');
      return;
    }

    const body = quickCheckInMessage.trim();

    if (!body) {
      setMessage('Review the message before sending.');
      return;
    }

    setCompletingCheckIn(true);
    setMessage('Sending your check-in...');

    let sent = false;

    if (selectedPartner.partner_kind === 'dallas_user') {
      if (!selectedPartner.app_connection_id) {
        setCompletingCheckIn(false);
        setMessage('This Dallas buddy is not connected for in-app messaging yet.');
        return;
      }

      const { error } = await supabase.functions.invoke('accountability-app', {
        body: {
          action: 'send_message',
          connectionId: selectedPartner.app_connection_id,
          message: body,
        },
      });
      sent = !error;
      if (error) {
        setMessage(error.message);
      }
    } else {
      const replyLink = await createCheckInThread({ body, partnerId: selectedPartner.id });
      sent = Boolean(replyLink) && await openSms(selectedPartner.mobile_number ?? '', `${body}\n\nReply here: ${replyLink}`);
    }

    if (!sent) {
      setCompletingCheckIn(false);
      return;
    }

    const completed = await createCompletedCheckIn({
      note: quickCheckInNote.trim() || null,
      partnerId: selectedPartner.id,
    });
    setCompletingCheckIn(false);

    if (completed) {
      setMessage(`Check-in sent to ${selectedPartner.name} and marked complete.`);
      setMessageSentFeedback(selectedPartner.name);
      playMessageSentSound();
    }
  }

  function getQuickCheckInPrompt() {
    switch (quickCheckInStatus) {
      case 'okay':
        return 'Keep your plan close and record what helped today.';
      case 'support':
        return 'Choose someone to contact, then take one small supportive step.';
      case 'struggling':
        return 'You do not have to handle this alone. Contact someone you trust now.';
      default:
        return '';
    }
  }

  function renderQuickContactPicker(label: string) {
    return (
      <>
        <Text style={styles.quickContactLabel}>{label}</Text>
        {partners.length ? (
          <View style={styles.quickContactList}>
            {partners.map((partner) => (
              <Pressable
                key={partner.id}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedPartnerId === partner.id }}
                style={[styles.quickContactOption, selectedPartnerId === partner.id && styles.selectedQuickContactOption]}
                onPress={() => handleSelectPartner(partner)}
              >
                <View style={styles.quickContactAvatar}>
                  {partner.avatar_path ? (
                    <Image
                      source={{ uri: getPublicPartnerAvatarUrl(partner.avatar_path) }}
                      style={styles.quickContactAvatarImage}
                    />
                  ) : (
                    <Text style={styles.quickContactAvatarInitial}>{getInitial(partner.name)}</Text>
                  )}
                </View>
                <View style={styles.quickContactCopy}>
                  <Text style={styles.quickContactName}>{partner.name}</Text>
                  <Text style={styles.quickContactType}>
                    {partner.partner_kind === 'dallas_user' ? 'In-app message' : 'SMS message'}
                  </Text>
                </View>
                <MaterialIcons
                  color={selectedPartnerId === partner.id ? '#2E4737' : '#768277'}
                  name={selectedPartnerId === partner.id ? 'check-circle' : 'chevron-right'}
                  size={22}
                />
              </Pressable>
            ))}
          </View>
        ) : (
          <View style={styles.quickNoContactsPanel}>
            <Text style={styles.quickNoContactsText}>You have no saved contacts yet.</Text>
            <Link href="/dallas-app-buddies" asChild>
              <Pressable style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Find a Dallas buddy</Text>
              </Pressable>
            </Link>
          </View>
        )}
        {partners.length && !hasDallasBuddies ? (
          <Link href="/dallas-app-buddies" asChild>
            <Pressable style={styles.textButton}>
              <Text style={styles.textButtonLabel}>Find or connect with a Dallas buddy</Text>
            </Pressable>
          </Link>
        ) : null}
      </>
    );
  }

  async function handleCompletePlannedCheckIn(plannedCheckIn: AccountabilityPlannedCheckIn) {
    setCompletingPlannedCheckInId(plannedCheckIn.id);

    const completed = await createCompletedCheckIn({
      note: plannedCheckIn.note,
      partnerId: plannedCheckIn.partner_id,
    });

    if (!completed) {
      setCompletingPlannedCheckInId('');
      return;
    }

    await cancelCheckInNotification(plannedCheckIn.notification_id);

    const { error } = await supabase
      .from('accountability_planned_check_ins')
      .delete()
      .eq('id', plannedCheckIn.id)
      .eq('partner_id', plannedCheckIn.partner_id);

    setCompletingPlannedCheckInId('');

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadPlannedCheckIns(plannedCheckIn.partner_id);
  }

  async function handleRemovePlannedCheckIn(plannedCheckIn: AccountabilityPlannedCheckIn) {
    await cancelCheckInNotification(plannedCheckIn.notification_id);

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

  async function createCompletedCheckIn({
    note,
    partnerId,
  }: {
    note: string | null;
    partnerId: string;
  }) {
    if (!session) {
      return false;
    }

    setCompletingCheckIn(true);
    setMessage('');

    const { error } = await supabase.from('accountability_check_ins').insert({
      completed_at: new Date().toISOString(),
      note,
      partner_id: partnerId,
      user_id: session.user.id,
    });

    setCompletingCheckIn(false);

    if (error) {
      setMessage(error.message);
      return false;
    }

    await loadCheckIns(partnerId);
    setMessage(`Check-in with ${getPartnerName(partnerId, partners, form.name)} marked complete.`);
    return true;
  }

  async function markPartnerTimestamp(partnerId: string, field: 'invited_at' | 'last_notified_at') {
    if (!session) {
      return;
    }

    const { error } = await supabase
      .from('accountability_partners')
      .update({
        [field]: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', partnerId)
      .eq('user_id', session.user.id);

    if (error) {
      setMessage(error.message);
      return;
    }

    await loadPartners(session.user.id);
  }

  async function openSms(phoneNumber: string, body: string) {
    const trimmedMobile = normalizePhoneNumber(phoneNumber);

    if (!isInternationalPhoneNumber(trimmedMobile)) {
      setMessage('Add a mobile number in international format before sending SMS.');
      return false;
    }

    const url =
      Platform.OS === 'ios'
        ? `sms:/open?addresses=${encodeURIComponent(trimmedMobile)}&body=${encodeURIComponent(body)}`
        : `sms:${trimmedMobile}?body=${encodeURIComponent(body)}`;
    const canOpen = await Linking.canOpenURL(url);

    if (!canOpen) {
      setMessage('This device cannot open SMS links.');
      return false;
    }

    await Linking.openURL(url);
    return true;
  }

  function toggleSection(sectionKey: SectionKey) {
    setExpandedSections((currentSections) => ({
      ...currentSections,
      [sectionKey]: !currentSections[sectionKey],
    }));
  }

  function updateField(key: keyof PartnerForm, value: string) {
    setForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  function updateCheckInDate(nextDate: Date) {
    updateField('checkInDate', formatDateForInput(nextDate));

    if (!form.checkInTime) {
      updateField('checkInTime', '18:00');
    }
  }

  function adjustCheckInDate(days: number) {
    const currentDate = parseCheckInDate(form.checkInDate) ?? new Date();
    currentDate.setDate(currentDate.getDate() + days);
    updateCheckInDate(currentDate);
  }

  function adjustCheckInTime(minutes: number) {
    const currentTime = parseCheckInTime(form.checkInTime);
    const nextTime = new Date();
    nextTime.setHours(currentTime.hour, currentTime.minute + minutes, 0, 0);
    updateField('checkInTime', formatTimeForInput(nextTime));
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centerPanel}>
          <ActivityIndicator color="#2E4737" />
          <Text style={styles.loadingText}>Loading accountability partners...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.container}>
          <Text style={styles.eyebrow}>Accountability</Text>
          <Text style={styles.title}>Sign in required</Text>
          <Text style={styles.copy}>Your accountability partners are available after signing in.</Text>
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
      <Modal
        animationType="fade"
        transparent
        visible={Boolean(messageSentFeedback) || checkInSavedFeedback}
        onRequestClose={() => {
          setMessageSentFeedback(null);
          setCheckInSavedFeedback(false);
        }}
      >
        <View style={styles.feedbackOverlay}>
          <View style={styles.feedbackCard}>
            <View style={styles.feedbackIcon}>
              <MaterialIcons color="#FFFFFF" name="check" size={28} />
            </View>
            <Text style={styles.feedbackTitle}>{checkInSavedFeedback ? 'Check-in saved' : 'Message sent'}</Text>
            <Text style={styles.feedbackCopy}>
              {checkInSavedFeedback
                ? 'Your “I’m okay” check-in has been saved to your history.'
                : `Your check-in was sent to ${messageSentFeedback ?? 'your Dallas buddy'} and saved to your history.`}
            </Text>
            <Pressable
              style={styles.feedbackButton}
              onPress={() => {
                setMessageSentFeedback(null);
                setCheckInSavedFeedback(false);
              }}
            >
              <Text style={styles.feedbackButtonText}>Done</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardArea}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>Accountability</Text>
          <Text style={styles.title}>Stay connected</Text>
          <Text style={styles.copy}>
            Choose a buddy, take the next action, and keep replies and completed check-ins together.
          </Text>

          <SectionCard title="How are you doing right now?" description="Choose the closest fit. This is a check-in, not a judgment.">
            <View style={styles.quickCheckInGrid}>
              {([
                ['okay', 'I’m okay', 'Keep my plan close'],
                ['support', 'I need support', 'Reach out to someone'],
                ['struggling', 'I’m struggling', 'Take the next safe step'],
              ] as const).map(([status, title, description]) => (
                <Pressable
                  key={status}
                  accessibilityRole="button"
                  accessibilityState={{ selected: quickCheckInStatus === status }}
                  style={[styles.quickCheckInOption, quickCheckInStatus === status && styles.selectedQuickCheckInOption]}
                  onPress={() => handleQuickCheckIn(status)}
                >
                  <Text style={styles.quickCheckInTitle}>{title}</Text>
                  <Text style={styles.quickCheckInDescription}>{description}</Text>
                </Pressable>
              ))}
            </View>
            {quickCheckInStatus ? (
              <View style={styles.quickNextStepPanel}>
                <Text style={styles.quickNextStepTitle}>Next step</Text>
                <Text style={styles.quickNextStepCopy}>{getQuickCheckInPrompt()}</Text>
                <TextInput
                  multiline
                  placeholder="Optional reflection"
                  placeholderTextColor="#768277"
                  style={styles.quickReflectionInput}
                  textAlignVertical="top"
                  value={quickCheckInNote}
                  onChangeText={setQuickCheckInNote}
                />
                {quickCheckInStatus === 'okay' ? (
                  <>
                    {renderQuickContactPicker('1. Select a partner to save this check-in')}
                    <Pressable
                      disabled={completingCheckIn || !selectedPartnerId}
                      style={[styles.button, (completingCheckIn || !selectedPartnerId) && styles.disabledButton]}
                      onPress={handleSaveQuickCheckIn}
                    >
                      <Text style={styles.buttonText}>
                        {completingCheckIn ? 'Saving...' : selectedPartnerId ? '2. Save check-in' : 'Select a partner first'}
                      </Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    {renderQuickContactPicker('1. Choose someone to message')}
                    {selectedPartner ? (
                      <>
                        <Text style={styles.quickContactLabel}>2. Review your message</Text>
                        <TextInput
                          multiline
                          placeholder="Your check-in message"
                          placeholderTextColor="#768277"
                          style={styles.quickReflectionInput}
                          textAlignVertical="top"
                          value={quickCheckInMessage}
                          onChangeText={setQuickCheckInMessage}
                        />
                        <Pressable disabled={completingCheckIn} style={[styles.button, completingCheckIn && styles.disabledButton]} onPress={handleSendQuickCheckIn}>
                          <Text style={styles.buttonText}>{completingCheckIn ? 'Sending...' : `3. Send to ${selectedPartner.name}`}</Text>
                        </Pressable>
                      </>
                    ) : null}
                  </>
                )}
                {quickCheckInStatus !== 'okay' ? (
                  <>
                    {quickCheckInStatus === 'struggling' ? (
                      <Text style={styles.safetyNote}>
                        Dallas is not emergency or medical care. If you may be in immediate danger, contact local emergency services or a qualified professional now.
                      </Text>
                    ) : null}
                    <Link href="/dallas-app-buddies" asChild>
                      <Pressable style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Message a Dallas buddy</Text>
                      </Pressable>
                    </Link>
                    <Link href="/recovery-plan" asChild>
                      <Pressable style={styles.secondaryButton}>
                        <Text style={styles.secondaryButtonText}>Review support plan</Text>
                      </Pressable>
                    </Link>
                    <Link href="/settings" asChild>
                      <Pressable style={styles.textButton}>
                        <Text style={styles.textButtonLabel}>View safety information</Text>
                      </Pressable>
                    </Link>
                  </>
                ) : null}
              </View>
            ) : null}
          </SectionCard>

          <CollapsibleSection
            expanded={expandedSections.partners}
            summary={selectedPartner ? `Selected: ${selectedPartner.name}` : `${partners.length} saved`}
            title="Buddies"
            onToggle={() => toggleSection('partners')}
          >
            {partners.length ? (
              <View style={styles.partnerList}>
                {partners.map((partner) => {
                  const selected = partner.id === selectedPartnerId;

                  return (
                    <View key={partner.id} style={[styles.partnerItem, selected && styles.activePartnerItem]}>
                      <Pressable style={styles.partnerCard} onPress={() => handleSelectPartner(partner)}>
                        <View style={styles.smallAvatar}>
                          {partner.avatar_path ? (
                            <Image
                              source={{ uri: getPublicPartnerAvatarUrl(partner.avatar_path) }}
                              style={styles.smallAvatarImage}
                            />
                          ) : (
                            <Text style={styles.smallAvatarInitial}>{getInitial(partner.name)}</Text>
                          )}
                        </View>
                        <View style={styles.partnerCardCopy}>
                          <Text style={styles.partnerName}>{partner.name}</Text>
                          <Text style={styles.partnerMeta}>
                            {partner.partner_kind === 'dallas_user'
                              ? 'Dallas App Buddy'
                              : 'External Contact'}
                          </Text>
                        </View>
                      </Pressable>

                      {selected ? (
                        <View style={styles.inlineActions}>
                          <View style={styles.inlineActionRow}>
                            {partner.partner_kind === 'dallas_user' ? (
                              <Link href={`/dallas-app-buddies?buddyId=${partner.id}`} asChild>
                                <Pressable style={styles.inlinePrimaryButton}>
                                  <Text style={styles.inlinePrimaryButtonText}>Open app chat</Text>
                                </Pressable>
                              </Link>
                            ) : (
                              <>
                                <Pressable style={styles.inlinePrimaryButton} onPress={handleInvitePartner}>
                                  <Text style={styles.inlinePrimaryButtonText}>SMS invite</Text>
                                </Pressable>
                                <Pressable style={styles.inlineSecondaryButton} onPress={handleSendCheckIn}>
                                  <Text style={styles.inlineSecondaryButtonText}>Notify</Text>
                                </Pressable>
                              </>
                            )}
                          </View>
                          <Text style={styles.inlineStatusText}>
                            Invited: {formatDateTime(partner.invited_at)} · Last message: {formatDateTime(partner.last_notified_at)}
                          </Text>
                          <Text style={styles.inlineStatusText}>
                            Last completed: {formatDateTime(checkIns[0]?.completed_at ?? null)}
                          </Text>

                          <View style={styles.plannedSection}>
                            <Text style={styles.inlineSectionTitle}>Planned check-ins</Text>
                            {plannedCheckIns.length ? (
                              <View style={styles.plannedList}>
                                {plannedCheckIns.map((plannedCheckIn) => (
                                  <View key={plannedCheckIn.id} style={styles.plannedItem}>
                                    <View style={styles.plannedItemCopy}>
                                      <Text style={styles.plannedItemTitle}>
                                        {formatDateTime(plannedCheckIn.scheduled_at)}
                                      </Text>
                                      {plannedCheckIn.note ? (
                                        <Text style={styles.plannedItemNote}>{plannedCheckIn.note}</Text>
                                      ) : null}
                                    </View>
                                    <View style={styles.plannedItemActions}>
                                      <Pressable
                                        disabled={Boolean(completingPlannedCheckInId)}
                                        style={[
                                          styles.miniPrimaryButton,
                                          completingPlannedCheckInId === plannedCheckIn.id && styles.disabledButton,
                                        ]}
                                        onPress={() => handleCompletePlannedCheckIn(plannedCheckIn)}
                                      >
                                        <Text style={styles.miniPrimaryButtonText}>
                                          {completingPlannedCheckInId === plannedCheckIn.id ? 'Saving' : 'Done'}
                                        </Text>
                                      </Pressable>
                                      <Pressable
                                        disabled={Boolean(completingPlannedCheckInId)}
                                        style={styles.miniSecondaryButton}
                                        onPress={() => handleRemovePlannedCheckIn(plannedCheckIn)}
                                      >
                                        <Text style={styles.miniSecondaryButtonText}>Remove</Text>
                                      </Pressable>
                                    </View>
                                  </View>
                                ))}
                              </View>
                            ) : (
                              <Text style={styles.inlineStatusText}>No planned check-ins yet.</Text>
                            )}

                            <View style={styles.pickerPanel}>
                              <View style={styles.pickerHeaderRow}>
                                <Pressable style={styles.stepperButton} onPress={() => adjustCheckInDate(-1)}>
                                  <Text style={styles.stepperButtonText}>-</Text>
                                </Pressable>
                                <View style={styles.pickerValue}>
                                  <Text style={styles.pickerValueLabel}>Date</Text>
                                  <Text style={styles.pickerValueText}>{formatHumanDate(form.checkInDate)}</Text>
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
                                      form.checkInDate === option.value && styles.activeQuickDateButton,
                                    ]}
                                    onPress={() => updateCheckInDate(option.date)}
                                  >
                                    <Text
                                      style={[
                                        styles.quickDateButtonText,
                                        form.checkInDate === option.value && styles.activeQuickDateButtonText,
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
                                  <Text style={styles.pickerValueText}>{form.checkInTime || '18:00'}</Text>
                                </View>
                                <Pressable style={styles.stepperButton} onPress={() => adjustCheckInTime(15)}>
                                  <Text style={styles.stepperButtonText}>+</Text>
                                </Pressable>
                              </View>

                              <Pressable
                                disabled={addingPlannedCheckIn}
                                style={[styles.inlinePrimaryButton, addingPlannedCheckIn && styles.disabledButton]}
                                onPress={handleAddPlannedCheckIn}
                              >
                                <Text style={styles.inlinePrimaryButtonText}>
                                  {addingPlannedCheckIn ? 'Adding...' : 'Add planned check-in'}
                                </Text>
                              </Pressable>
                            </View>
                          </View>

                          <View style={styles.inlineActivitySection}>
                            <View style={styles.inlineActivityHeader}>
                              <Text style={styles.inlineSectionTitle}>Replies</Text>
                              <Text style={styles.inlineStatusText}>{partnerMessages.length} received</Text>
                            </View>
                            {partnerMessages.length ? partnerMessages.map((partnerMessage) => (
                              <View key={partnerMessage.id} style={styles.inlineReplyItem}>
                                <Text style={styles.inlineReplyTime}>{formatDateTime(partnerMessage.created_at)}</Text>
                                <Text style={styles.inlineReplyBody}>{partnerMessage.body}</Text>
                              </View>
                            )) : <Text style={styles.inlineStatusText}>No replies yet.</Text>}
                          </View>

                          <View style={styles.inlineActivitySection}>
                            <View style={styles.inlineActivityHeader}>
                              <Text style={styles.inlineSectionTitle}>Completed check-ins</Text>
                              <Text style={styles.inlineStatusText}>{checkIns.length} recent</Text>
                            </View>
                            <Pressable
                              disabled={completingCheckIn}
                              style={[styles.inlineSecondaryButton, completingCheckIn && styles.disabledButton]}
                              onPress={handleMarkCheckInCompleted}
                            >
                              <Text style={styles.inlineSecondaryButtonText}>
                                {completingCheckIn ? 'Saving...' : 'Mark completed'}
                              </Text>
                            </Pressable>
                            {checkIns.length ? checkIns.map((checkIn) => (
                              <View key={checkIn.id} style={styles.inlineReplyItem}>
                                <Text style={styles.inlineReplyTime}>{formatDateTime(checkIn.completed_at)}</Text>
                                {checkIn.note ? <Text style={styles.inlineReplyBody}>{checkIn.note}</Text> : null}
                              </View>
                            )) : <Text style={styles.inlineStatusText}>No completed check-ins yet.</Text>}
                          </View>
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptyStatePanel}>
                <Text style={styles.mutedText}>No buddies yet. Add them from the Buddies area.</Text>
                <Link href="/dallas-app-buddies" asChild>
                  <Pressable style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Go to Buddies</Text>
                  </Pressable>
                </Link>
              </View>
            )}
          </CollapsibleSection>

          {false && <CollapsibleSection
            expanded={expandedSections.details}
            summary={selectedPartnerId ? form.name || 'Selected partner' : 'Create or update an external partner'}
            title={selectedPartnerId ? 'Partner details' : 'New partner'}
            onToggle={() => toggleSection('details')}
          >
            <View style={styles.avatarRow}>
              <View style={styles.avatarFrame}>
                {selectedAvatarUrl && !avatarFailed ? (
                  <Image
                    source={{ uri: selectedAvatarUrl }}
                    style={styles.avatarImage}
                    onError={() => setAvatarFailed(true)}
                  />
                ) : (
                  <Text style={styles.avatarInitial}>{getInitial(form.name)}</Text>
                )}
              </View>
              <View style={styles.avatarCopy}>
                <Text style={styles.panelTitle}>{selectedPartnerId ? 'Edit partner' : 'New partner'}</Text>
                <Text style={styles.mutedText}>Their local time: {selectedLocalTime || 'Choose a timezone'}</Text>
              </View>
            </View>

            <Pressable
              disabled={uploadingAvatar}
              style={[styles.secondaryButton, uploadingAvatar && styles.disabledButton]}
              onPress={handleAvatarUpload}
            >
              <Text style={styles.secondaryButtonText}>
                {uploadingAvatar ? 'Uploading...' : selectedAvatarUrl ? 'Change avatar' : 'Upload avatar'}
              </Text>
            </Pressable>

            <Field label="Name" value={form.name} onChangeText={(value) => updateField('name', value)} />
            <Field
              inputMode="tel"
              label="Mobile number"
              placeholder="+441234567890"
              value={form.mobileNumber}
              onChangeText={(value) => updateField('mobileNumber', value)}
            />
            <Field label="Location" value={form.location} onChangeText={(value) => updateField('location', value)} />
            <Field
              label="Relationship"
              placeholder="Sponsor, friend, coach..."
              value={form.relationship}
              onChangeText={(value) => updateField('relationship', value)}
            />

            <View style={styles.fieldGroup}>
              <View style={styles.timeZoneHeaderRow}>
                <View style={styles.timeZoneHeaderCopy}>
                  <Text style={styles.inputLabel}>Timezone</Text>
                  <Text style={styles.timeZoneSummary}>{selectedTimeZoneLabel}</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: showTimeZoneOptions }}
                  style={styles.timeZoneToggle}
                  onPress={() => setShowTimeZoneOptions((isVisible) => !isVisible)}
                >
                  <MaterialIcons
                    color="#2E4737"
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
                      style={[styles.timeZoneOption, form.timeZone === timeZone.value && styles.activeTimeZoneOption]}
                      onPress={() => updateField('timeZone', timeZone.value)}
                    >
                      <Text
                        style={[
                          styles.timeZoneOptionText,
                          form.timeZone === timeZone.value && styles.activeTimeZoneOptionText,
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
              placeholder="What should this person know? What kind of check-in helps?"
              value={form.notes}
              onChangeText={(value) => updateField('notes', value)}
            />

            <Pressable disabled={saving} style={[styles.button, saving && styles.disabledButton]} onPress={() => savePartner()}>
              <Text style={styles.buttonText}>{saving ? 'Saving...' : 'Save partner'}</Text>
            </Pressable>
          </CollapsibleSection>}

          {false && <CollapsibleSection
            expanded={expandedSections.replies}
            summary={`${partnerMessages.length} web replies`}
            title="Partner replies"
            onToggle={() => toggleSection('replies')}
          >
            <Text style={styles.mutedText}>
              Replies sent from check-in links appear here for the selected partner.
            </Text>

            {partnerMessages.length ? (
              <View style={styles.historyList}>
                {partnerMessages.map((partnerMessage) => (
                  <View key={partnerMessage.id} style={styles.historyItem}>
                    <View style={styles.historyCopy}>
                      <Text style={styles.historyTitle}>{formatDateTime(partnerMessage.created_at)}</Text>
                      <Text style={styles.historyPartner}>
                        from {getPartnerName(partnerMessage.partner_id, partners, form.name)}
                      </Text>
                      <Text style={styles.historyNote}>{partnerMessage.body}</Text>
                    </View>
                    <HistoryPartnerAvatar
                      fallbackName={form.name}
                      partner={partners.find((partner) => partner.id === partnerMessage.partner_id) ?? null}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.mutedText}>
                {selectedPartnerId ? 'No partner replies yet.' : 'Select a partner to view replies.'}
              </Text>
            )}
          </CollapsibleSection>}

          {false && <CollapsibleSection
            expanded={expandedSections.history}
            summary={`${checkIns.length} recent check-ins`}
            title="Completed check-ins"
            onToggle={() => toggleSection('history')}
          >
            <Text style={styles.mutedText}>
              Mark a real check-in after it happens and keep a simple history that names the partner.
            </Text>

            <Pressable
              disabled={completingCheckIn}
              style={[styles.button, completingCheckIn && styles.disabledButton]}
              onPress={handleMarkCheckInCompleted}
            >
              <Text style={styles.buttonText}>{completingCheckIn ? 'Saving...' : 'Mark completed check-in'}</Text>
            </Pressable>

            {checkIns.length ? (
              <View style={styles.historyList}>
                {checkIns.map((checkIn) => (
                  <View key={checkIn.id} style={styles.historyItem}>
                    <View style={styles.historyCopy}>
                      <Text style={styles.historyTitle}>{formatDateTime(checkIn.completed_at)}</Text>
                      <Text style={styles.historyPartner}>
                        with {getPartnerName(checkIn.partner_id, partners, form.name)}
                      </Text>
                      {checkIn.note ? <Text style={styles.historyNote}>{checkIn.note}</Text> : null}
                    </View>
                    <HistoryPartnerAvatar
                      fallbackName={form.name}
                      partner={partners.find((partner) => partner.id === checkIn.partner_id) ?? null}
                    />
                  </View>
                ))}
              </View>
            ) : (
              <Text style={styles.mutedText}>
                {selectedPartnerId ? 'No completed check-ins yet.' : 'Save or select a partner to start history.'}
              </Text>
            )}
          </CollapsibleSection>}

          {message ? <Text style={styles.message}>{message}</Text> : null}

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({
  inputMode,
  label,
  multiline,
  onChangeText,
  placeholder,
  value,
}: {
  inputMode?: 'text' | 'tel';
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
        inputMode={inputMode}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#768277"
        style={[styles.input, multiline && styles.multilineInput]}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
    </View>
  );
}

function CollapsibleSection({
  action,
  children,
  expanded,
  onToggle,
  summary,
  title,
}: {
  action?: ReactNode;
  children: ReactNode;
  expanded: boolean;
  onToggle: () => void;
  summary?: string;
  title: string;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.collapsibleHeaderRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded }}
          style={styles.collapsibleHeaderButton}
          onPress={onToggle}
        >
          <MaterialIcons color="#2E4737" name={expanded ? 'expand-less' : 'expand-more'} size={24} />
          <View style={styles.collapsibleTitleCopy}>
            <Text style={styles.panelTitle}>{title}</Text>
            {summary ? <Text style={styles.collapsibleSummary}>{summary}</Text> : null}
          </View>
        </Pressable>
        {action}
      </View>
      {expanded ? <View style={styles.collapsibleBody}>{children}</View> : null}
    </View>
  );
}

function HistoryPartnerAvatar({
  fallbackName,
  partner,
}: {
  fallbackName: string;
  partner: AccountabilityPartner | null;
}) {
  if (partner?.avatar_path) {
    return (
      <View style={styles.historyAvatar}>
        <Image source={{ uri: getPublicPartnerAvatarUrl(partner.avatar_path) }} style={styles.historyAvatarImage} />
      </View>
    );
  }

  return (
    <View style={styles.historyAvatar}>
      <Text style={styles.historyAvatarInitial}>{getInitial(partner?.name ?? fallbackName)}</Text>
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

function buildCheckInReplyUrl(token: string) {
  const configuredUrl = process.env.EXPO_PUBLIC_CHECK_IN_REPLY_URL ?? defaultCheckInReplyUrl;
  const separator = configuredUrl.includes('?') ? '&' : '?';

  return `${configuredUrl}${separator}token=${encodeURIComponent(token)}`;
}

function formatDateForInput(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function formatDateInput(value: string | null) {
  if (!value) {
    return '';
  }

  return value.slice(0, 10);
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
  if (!value) {
    return '';
  }

  return new Date(value).toTimeString().slice(0, 5);
}

function buildQuickCheckInMessage(name: string, status: QuickCheckInStatus, note: string) {
  const statusText = {
    okay: 'okay',
    support: 'like I could use some support',
    struggling: 'like I am struggling right now',
  }[status];
  const defaultNote = {
    okay: 'I am doing okay.',
    support: 'I could use some support.',
    struggling: 'I am struggling right now.',
  }[status];
  const noteText = note.trim() && note.trim() !== defaultNote ? ` ${note.trim()}` : '';

  return `Hi ${name}, I’m checking in. I’m feeling ${statusText}.${noteText} Could you check in with me?`;
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

function getImageExtension(contentType: string, uri: string) {
  if (contentType.includes('png')) {
    return 'png';
  }

  if (contentType.includes('webp')) {
    return 'webp';
  }

  const uriExtension = uri.split('.').pop()?.toLowerCase();

  return uriExtension && uriExtension.length <= 5 ? uriExtension : 'jpg';
}

function getInitial(name: string) {
  return (name || 'A').trim().charAt(0).toUpperCase();
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

function getTimeZoneLabel(value: string) {
  return timeZones.find((timeZone) => timeZone.value === value)?.label ?? 'Choose a timezone';
}

function getFallbackUserDisplayName(metadata: Record<string, unknown>, email: string | undefined) {
  return getMetadataValue(metadata.preferred_name) || email || 'Dallas user';
}

function getMetadataValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function getPartnerName(partnerId: string, partners: AccountabilityPartner[], fallbackName: string) {
  const partnerName = partners.find((partner) => partner.id === partnerId)?.name ?? fallbackName.trim();

  return partnerName || 'this partner';
}

function getPublicPartnerAvatarUrl(path: string) {
  return supabase.storage.from('accountability-avatars').getPublicUrl(path).data.publicUrl;
}

function isInternationalPhoneNumber(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

function normalizePhoneNumber(value: string) {
  return value.trim().replace(/[^\d+]/g, '');
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

async function cancelCheckInNotification(notificationId: string | null) {
  if (!notificationId) {
    return;
  }

  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch {
    // The notification may already have fired or been cleared by the OS.
  }
}

async function scheduleCheckInNotification({
  partnerName,
  scheduledAt,
  userId,
}: {
  partnerName: string;
  scheduledAt: string;
  userId: string;
}) {
  const scheduledDate = new Date(scheduledAt);
  const secondsUntilDue = Math.floor((scheduledDate.getTime() - Date.now()) / 1000);

  if (!Number.isFinite(secondsUntilDue) || secondsUntilDue <= 0) {
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
      body: `Your planned check-in with ${partnerName} is due now.`,
      data: {
        route: '/accountability',
        type: 'planned_check_in',
      },
      sound: 'default',
      title: 'Dallas check-in due',
    },
    trigger: {
      channelId: notificationChannelId,
      seconds: secondsUntilDue,
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
    },
  });
}

async function playMessageSentSound() {
  try {
    const permissions = await Notifications.getPermissionsAsync();
    if (!hasGrantedNotificationPermission(permissions)) {
      return;
    }

    await ensureNotificationChannelAsync();
    await Notifications.scheduleNotificationAsync({
      content: {
        body: 'Your check-in was delivered successfully.',
        sound: 'default',
        title: 'Message sent',
      },
      trigger: null,
    });
  } catch {
    // The in-app confirmation remains available if notification sound is unavailable.
  }
}

const styles = StyleSheet.create({
  quickCheckInGrid: {
    gap: 8,
  },
  quickCheckInOption: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D0DDD6',
    borderRadius: 9,
    borderWidth: 1,
    gap: 2,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  selectedQuickCheckInOption: {
    backgroundColor: '#EEF1EC',
    borderColor: '#829480',
  },
  quickCheckInTitle: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 15,
    fontWeight: '900',
  },
  quickCheckInDescription: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 13,
    lineHeight: 18,
  },
  quickNextStepPanel: {
    backgroundColor: '#F7F7F5',
    borderColor: '#D0DDD6',
    borderRadius: 10,
    borderWidth: 1,
    gap: 9,
    padding: 12,
  },
  quickNextStepTitle: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '900',
  },
  quickNextStepCopy: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 14,
    lineHeight: 20,
  },
  quickContactLabel: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '900',
  },
  quickContactList: {
    gap: 7,
  },
  quickContactOption: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    minHeight: 52,
    paddingHorizontal: 12,
  },
  quickContactAvatar: {
    alignItems: 'center',
    backgroundColor: '#E7E6E2',
    borderRadius: 20,
    height: 40,
    justifyContent: 'center',
    marginRight: 10,
    overflow: 'hidden',
    width: 40,
  },
  quickContactAvatarImage: {
    height: 40,
    width: 40,
  },
  quickContactAvatarInitial: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '900',
  },
  selectedQuickContactOption: {
    backgroundColor: '#EEF1EC',
    borderColor: '#829480',
  },
  quickContactCopy: {
    gap: 2,
    flex: 1,
  },
  quickContactName: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '900',
  },
  quickContactType: {
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '700',
  },
  quickNoContactsPanel: {
    gap: 8,
  },
  quickNoContactsText: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 13,
  },
  quickReflectionInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 15,
    minHeight: 68,
    padding: 10,
  },
  feedbackOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 33, 31, 0.45)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  feedbackCard: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    gap: 10,
    maxWidth: 360,
    padding: 26,
    width: '100%',
  },
  feedbackIcon: {
    alignItems: 'center',
    backgroundColor: '#2E4737',
    borderRadius: 30,
    height: 60,
    justifyContent: 'center',
    width: 60,
  },
  feedbackTitle: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 23,
    fontWeight: '900',
    marginTop: 4,
  },
  feedbackCopy: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  feedbackButton: {
    alignItems: 'center',
    backgroundColor: '#2E4737',
    borderRadius: 10,
    justifyContent: 'center',
    marginTop: 6,
    minHeight: 48,
    paddingHorizontal: 28,
    width: '100%',
  },
  feedbackButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '900',
  },
  safetyNote: {
    color: '#6F3517',
    fontFamily: 'Manrope',
    fontSize: 12,
    lineHeight: 17,
  },
  textButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  textButtonLabel: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '800',
  },
  screen: {
    flex: 1,
    backgroundColor: '#F7F7F5',
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
    fontFamily: 'DM Mono',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  title: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: -1.2,
    lineHeight: 34,
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
    borderRadius: 10,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  panelHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  collapsibleHeaderRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  collapsibleHeaderButton: {
    alignItems: 'center',
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
  },
  collapsibleTitleCopy: {
    flex: 1,
    gap: 2,
  },
  collapsibleSummary: {
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '800',
  },
  collapsibleBody: {
    gap: 14,
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
  partnerList: {
    gap: 8,
  },
  partnerItem: {
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  activePartnerItem: {
    borderColor: '#2E4737',
  },
  partnerCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  smallAvatar: {
    alignItems: 'center',
    backgroundColor: '#E7E6E2',
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
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 17,
    fontWeight: '900',
  },
  partnerCardCopy: {
    flex: 1,
    gap: 2,
  },
  partnerName: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '900',
  },
  partnerMeta: {
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '700',
  },
  inlineActions: {
    borderTopColor: '#E7E6E2',
    borderTopWidth: 1,
    gap: 8,
    padding: 10,
    paddingTop: 9,
  },
  inlineActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  inlinePrimaryButton: {
    alignItems: 'center',
    backgroundColor: '#2E4737',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 10,
  },
  inlinePrimaryButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '900',
  },
  inlineSecondaryButton: {
    alignItems: 'center',
    borderColor: '#2E4737',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 10,
  },
  inlineSecondaryButtonText: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '900',
  },
  inlineStatusText: {
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  emptyStatePanel: {
    gap: 12,
    paddingVertical: 8,
  },
  inlineActivitySection: {
    borderTopColor: '#E7E6E2',
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 14,
  },
  inlineActivityHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inlineReplyItem: {
    backgroundColor: '#F7F7F5',
    borderRadius: 8,
    gap: 3,
    padding: 10,
  },
  inlineReplyTime: {
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '800',
  },
  inlineReplyBody: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 14,
    lineHeight: 20,
  },
  inlineSectionTitle: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '900',
  },
  plannedSection: {
    gap: 10,
    paddingTop: 4,
  },
  plannedList: {
    gap: 8,
  },
  plannedItem: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 10,
  },
  plannedItemCopy: {
    gap: 3,
  },
  plannedItemTitle: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '900',
  },
  plannedItemNote: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 12,
    lineHeight: 17,
  },
  plannedItemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  miniPrimaryButton: {
    alignItems: 'center',
    backgroundColor: '#2E4737',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 8,
  },
  miniPrimaryButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '900',
  },
  miniSecondaryButton: {
    alignItems: 'center',
    borderColor: '#2E4737',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 8,
  },
  miniSecondaryButtonText: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '900',
  },
  avatarRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  avatarFrame: {
    alignItems: 'center',
    backgroundColor: '#E7E6E2',
    borderRadius: 36,
    height: 72,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 72,
  },
  avatarImage: {
    height: 72,
    width: 72,
  },
  avatarInitial: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 28,
    fontWeight: '900',
  },
  avatarCopy: {
    flex: 1,
    gap: 4,
  },
  fieldGroup: {
    flex: 1,
    gap: 6,
  },
  inputLabel: {
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '800',
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
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 15,
    fontWeight: '800',
  },
  timeZoneToggle: {
    alignItems: 'center',
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 3,
    minHeight: 40,
    paddingHorizontal: 10,
  },
  timeZoneToggleText: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '900',
  },
  timeZoneGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeZoneOption: {
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  activeTimeZoneOption: {
    backgroundColor: '#2E4737',
    borderColor: '#2E4737',
  },
  timeZoneOptionText: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '800',
  },
  activeTimeZoneOptionText: {
    color: '#FFFFFF',
  },
  twoColumn: {
    flexDirection: 'row',
    gap: 10,
  },
  pickerPanel: {
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
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
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  pickerValueText: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 17,
    fontWeight: '900',
    textAlign: 'center',
  },
  stepperButton: {
    alignItems: 'center',
    backgroundColor: '#2E4737',
    borderRadius: 8,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  stepperButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope',
    fontSize: 22,
    fontWeight: '900',
  },
  quickDateRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickDateButton: {
    alignItems: 'center',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 8,
  },
  activeQuickDateButton: {
    backgroundColor: '#2E4737',
    borderColor: '#2E4737',
  },
  quickDateButtonText: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
  },
  activeQuickDateButtonText: {
    color: '#FFFFFF',
  },
  pickerHint: {
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center',
  },
  codePanel: {
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 6,
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
    gap: 6,
  },
  codeText: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 0,
  },
  copyButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#2E4737',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 10,
  },
  copyButtonText: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '900',
  },
  historyList: {
    gap: 8,
  },
  historyItem: {
    alignItems: 'center',
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 4,
    justifyContent: 'space-between',
    padding: 12,
  },
  historyCopy: {
    flex: 1,
    gap: 4,
    paddingRight: 12,
  },
  historyTitle: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '900',
  },
  historyPartner: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '900',
  },
  historyNote: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 13,
    lineHeight: 18,
  },
  historyAvatar: {
    alignItems: 'center',
    backgroundColor: '#E7E6E2',
    borderColor: '#E7E6E2',
    borderRadius: 22,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 44,
  },
  historyAvatarImage: {
    height: 44,
    width: 44,
  },
  historyAvatarInitial: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 17,
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
