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
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import * as Notifications from 'expo-notifications';
import { Link } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '../src/lib/supabase';

type AccountabilityPartner = {
  avatar_path: string | null;
  check_in_at: string | null;
  consent_confirmed_at: string | null;
  created_at: string;
  id: string;
  invited_at: string | null;
  last_notified_at: string | null;
  location: string | null;
  mobile_number: string | null;
  name: string;
  notes: string | null;
  relationship: string | null;
  time_zone: string | null;
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

const timeZones = [
  { label: 'London', value: 'Europe/London' },
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
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const selectedPartner = useMemo(
    () => partners.find((partner) => partner.id === selectedPartnerId) ?? null,
    [partners, selectedPartnerId],
  );
  const selectedAvatarUrl = selectedPartner?.avatar_path
    ? getPublicPartnerAvatarUrl(selectedPartner.avatar_path)
    : '';
  const selectedLocalTime = getLocalTime(form.timeZone);

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

      await loadPartners(nextSession.user.id, mounted);
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
        'avatar_path, check_in_at, consent_confirmed_at, created_at, id, invited_at, last_notified_at, location, mobile_number, name, notes, relationship, time_zone',
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
          <ActivityIndicator color="#38635D" />
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardArea}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>Accountability</Text>
          <Text style={styles.title}>Stay connected</Text>
          <Text style={styles.copy}>
            Add trusted people, plan check-ins, and send support messages when you need a steady connection.
          </Text>

          <View style={styles.panel}>
            <View style={styles.panelHeader}>
              <Text style={styles.panelTitle}>Partners</Text>
              <Pressable style={styles.smallButton} onPress={handleNewPartner}>
                <Text style={styles.smallButtonText}>New</Text>
              </Pressable>
            </View>

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
                            {[partner.location, getLocalTime(partner.time_zone)].filter(Boolean).join(' - ')}
                          </Text>
                        </View>
                      </Pressable>

                      {selected ? (
                        <View style={styles.inlineActions}>
                          <View style={styles.inlineActionRow}>
                            <Pressable style={styles.inlinePrimaryButton} onPress={handleInvitePartner}>
                              <Text style={styles.inlinePrimaryButtonText}>SMS invite</Text>
                            </Pressable>
                            <Pressable style={styles.inlineSecondaryButton} onPress={handleSendCheckIn}>
                              <Text style={styles.inlineSecondaryButtonText}>Notify</Text>
                            </Pressable>
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
                        </View>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.mutedText}>No partners yet. Add your first support contact below.</Text>
            )}
          </View>

          <View style={styles.panel}>
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
              <Text style={styles.inputLabel}>Timezone</Text>
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
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Completed check-ins</Text>
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
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Partner replies</Text>
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
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Partner Dallas account</Text>
            <Text style={styles.mutedText}>
              Later, partners will be able to create their own Dallas account from an invite. For now, SMS invite keeps them outside the app.
            </Text>
          </View>

          {message ? <Text style={styles.message}>{message}</Text> : null}

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
        placeholderTextColor="#8A948F"
        style={[styles.input, multiline && styles.multilineInput]}
        textAlignVertical={multiline ? 'top' : 'center'}
        value={value}
      />
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
}: {
  partnerName: string;
  scheduledAt: string;
}) {
  const scheduledDate = new Date(scheduledAt);
  const secondsUntilDue = Math.floor((scheduledDate.getTime() - Date.now()) / 1000);

  if (!Number.isFinite(secondsUntilDue) || secondsUntilDue <= 0) {
    return null;
  }

  const permissions = await Notifications.getPermissionsAsync();
  let finalStatus = permissions.status;

  if (finalStatus !== 'granted') {
    const requestedPermissions = await Notifications.requestPermissionsAsync();
    finalStatus = requestedPermissions.status;
  }

  if (finalStatus !== 'granted') {
    return null;
  }

  return Notifications.scheduleNotificationAsync({
    content: {
      body: `Your planned check-in with ${partnerName} is due now.`,
      sound: false,
      title: 'Dallas check-in due',
    },
    trigger: {
      seconds: secondsUntilDue,
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
    },
  });
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
  partnerList: {
    gap: 8,
  },
  partnerItem: {
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  activePartnerItem: {
    borderColor: '#38635D',
  },
  partnerCard: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    padding: 10,
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
  partnerCardCopy: {
    flex: 1,
    gap: 2,
  },
  partnerName: {
    color: '#17211F',
    fontSize: 16,
    fontWeight: '900',
  },
  partnerMeta: {
    color: '#697570',
    fontSize: 13,
    fontWeight: '700',
  },
  inlineActions: {
    borderTopColor: '#ECE5D8',
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
    backgroundColor: '#38635D',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 10,
  },
  inlinePrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  inlineSecondaryButton: {
    alignItems: 'center',
    borderColor: '#38635D',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 38,
    paddingHorizontal: 10,
  },
  inlineSecondaryButtonText: {
    color: '#38635D',
    fontSize: 13,
    fontWeight: '900',
  },
  inlineStatusText: {
    color: '#697570',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
  },
  inlineSectionTitle: {
    color: '#17211F',
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
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 10,
  },
  plannedItemCopy: {
    gap: 3,
  },
  plannedItemTitle: {
    color: '#17211F',
    fontSize: 14,
    fontWeight: '900',
  },
  plannedItemNote: {
    color: '#4F5D58',
    fontSize: 12,
    lineHeight: 17,
  },
  plannedItemActions: {
    flexDirection: 'row',
    gap: 8,
  },
  miniPrimaryButton: {
    alignItems: 'center',
    backgroundColor: '#38635D',
    borderRadius: 8,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 8,
  },
  miniPrimaryButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },
  miniSecondaryButton: {
    alignItems: 'center',
    borderColor: '#38635D',
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: 'center',
    minHeight: 34,
    paddingHorizontal: 8,
  },
  miniSecondaryButtonText: {
    color: '#38635D',
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
    backgroundColor: '#ECE5D8',
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
    color: '#38635D',
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
  twoColumn: {
    flexDirection: 'row',
    gap: 10,
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
  pickerHint: {
    color: '#697570',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 17,
    textAlign: 'center',
  },
  historyList: {
    gap: 8,
  },
  historyItem: {
    alignItems: 'center',
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
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
    color: '#17211F',
    fontSize: 14,
    fontWeight: '900',
  },
  historyPartner: {
    color: '#38635D',
    fontSize: 13,
    fontWeight: '900',
  },
  historyNote: {
    color: '#4F5D58',
    fontSize: 13,
    lineHeight: 18,
  },
  historyAvatar: {
    alignItems: 'center',
    backgroundColor: '#ECE5D8',
    borderColor: '#DED7C9',
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
    color: '#38635D',
    fontSize: 17,
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
