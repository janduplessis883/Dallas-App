import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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
import * as ImagePicker from 'expo-image-picker';
import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
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
  const [message, setMessage] = useState('');
  const [partners, setPartners] = useState<AccountabilityPartner[]>([]);
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
        check_in_at: buildCheckInIso(form.checkInDate, form.checkInTime),
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

    if (!silent) {
      setMessage('Accountability partner saved.');
    }

    return data.id;
  }

  function handleNewPartner() {
    setForm(emptyPartnerForm);
    setSelectedPartnerId('');
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
    const body = `Hi ${form.name.trim()}, this is my Dallas accountability check-in.${checkInText} Can you check in with me?`;
    const sent = await openSms(form.mobileNumber, body);

    if (!sent) {
      return;
    }

    await markPartnerTimestamp(partnerId, 'last_notified_at');
    setMessage('Check-in message opened in Messages.');
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
    const trimmedMobile = phoneNumber.trim();

    if (!isInternationalPhoneNumber(trimmedMobile)) {
      setMessage('Add a mobile number in international format before sending SMS.');
      return false;
    }

    const separator = Platform.OS === 'ios' ? '&' : '?';
    const url = `sms:${trimmedMobile}${separator}body=${encodeURIComponent(body)}`;
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
                {partners.map((partner) => (
                  <Pressable
                    key={partner.id}
                    style={[styles.partnerCard, partner.id === selectedPartnerId && styles.activePartnerCard]}
                    onPress={() => handleSelectPartner(partner)}
                  >
                    <View style={styles.smallAvatar}>
                      {partner.avatar_path ? (
                        <Image source={{ uri: getPublicPartnerAvatarUrl(partner.avatar_path) }} style={styles.smallAvatarImage} />
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
                ))}
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

            <View style={styles.twoColumn}>
              <Field
                label="Check-in date"
                placeholder="2026-06-21"
                value={form.checkInDate}
                onChangeText={(value) => updateField('checkInDate', value)}
              />
              <Field
                label="Check-in time"
                placeholder="18:30"
                value={form.checkInTime}
                onChangeText={(value) => updateField('checkInTime', value)}
              />
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
            <Text style={styles.panelTitle}>Actions</Text>
            <Text style={styles.mutedText}>
              Invites and check-ins open your Messages app. App-to-app partner notifications can be added later when
              partners have their own Dallas account and push token.
            </Text>
            <Pressable style={styles.button} onPress={handleInvitePartner}>
              <Text style={styles.buttonText}>Invite via SMS</Text>
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={handleSendCheckIn}>
              <Text style={styles.secondaryButtonText}>Send check-in message</Text>
            </Pressable>
            {selectedPartner ? (
              <View style={styles.statusRows}>
                <InfoRow label="Invited" value={formatDateTime(selectedPartner.invited_at)} />
                <InfoRow label="Last message" value={formatDateTime(selectedPartner.last_notified_at)} />
                <InfoRow label="Scheduled check-in" value={formatDateTime(selectedPartner.check_in_at)} />
              </View>
            ) : null}
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

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
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

function formatDateInput(value: string | null) {
  if (!value) {
    return '';
  }

  return value.slice(0, 10);
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

function formatTimeInput(value: string | null) {
  if (!value) {
    return '';
  }

  return new Date(value).toTimeString().slice(0, 5);
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

function getPublicPartnerAvatarUrl(path: string) {
  return supabase.storage.from('accountability-avatars').getPublicUrl(path).data.publicUrl;
}

function isInternationalPhoneNumber(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value);
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
  partnerCard: {
    alignItems: 'center',
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 10,
  },
  activePartnerCard: {
    borderColor: '#38635D',
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
  statusRows: {
    borderTopColor: '#ECE5D8',
    borderTopWidth: 1,
  },
  infoRow: {
    borderBottomColor: '#ECE5D8',
    borderBottomWidth: 1,
    gap: 4,
    paddingVertical: 10,
  },
  infoLabel: {
    color: '#697570',
    fontSize: 13,
    fontWeight: '800',
  },
  infoValue: {
    color: '#17211F',
    fontSize: 15,
    fontWeight: '800',
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
