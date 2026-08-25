import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { MaterialIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Notifications from 'expo-notifications';
import { Link, useFocusEffect, useLocalSearchParams } from 'expo-router';
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
  mobile_number: string | null;
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

type ExternalReply = {
  body: string;
  created_at: string;
  id: string;
};

type CompletedCheckIn = {
  completed_at: string;
  id: string;
  note: string | null;
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

type BuddySection = 'chat' | 'check-ins' | 'details';
type BuddyInvitation = { id: string; requester_user_id: string; requester_name: string; created_at: string };

type BuddySummary = {
  lastMessage: string | null;
  lastMessageAt: string | null;
  nextCheckIn: string | null;
  unreadCount: number;
};

type BuddySummaryRow = {
  connection_id: string | null;
  last_message: string | null;
  last_message_at: string | null;
  latest_received_at: string | null;
  latest_received_message: string | null;
  latest_received_sender_user_id: string | null;
  next_check_in: string | null;
  partner_id: string;
  unread_count: number;
};

type LatestBuddyMessage = {
  body: string;
  buddyId: string;
  createdAt: string;
  senderUserId: string;
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

async function getFunctionErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : 'Dallas accountability request failed.';
  const context = (error as { context?: { text?: () => Promise<string> } } | null)?.context;

  if (!context || typeof context.text !== 'function') {
    return fallback;
  }

  try {
    const responseText = await context.text();
    const responseJson = JSON.parse(responseText) as { error?: unknown };

    return typeof responseJson.error === 'string' && responseJson.error.trim()
      ? responseJson.error
      : fallback;
  } catch {
    return fallback;
  }
}

export default function DallasAppBuddiesScreen() {
  const { buddyId } = useLocalSearchParams<{ buddyId?: string }>();
  const [appConnectLookup, setAppConnectLookup] = useState('');
  const [newBuddyName, setNewBuddyName] = useState('');
  const [newBuddyMobile, setNewBuddyMobile] = useState('');
  const [newBuddyRelationship, setNewBuddyRelationship] = useState('');
  const [newBuddyLocation, setNewBuddyLocation] = useState('');
  const [addingExternalBuddy, setAddingExternalBuddy] = useState(false);
  const [buddies, setBuddies] = useState<BuddyPartner[]>([]);
  const [buddyProfiles, setBuddyProfiles] = useState<Record<string, BuddyProfile>>({});
  const [buddySummaries, setBuddySummaries] = useState<Record<string, BuddySummary>>({});
  const [connectingAppUser, setConnectingAppUser] = useState(false);
  const [dallasCode, setDallasCode] = useState('');
  const [expandedBuddyId, setExpandedBuddyId] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState('');
  const [messages, setMessages] = useState<BuddyMessage[]>([]);
  const [externalReplies, setExternalReplies] = useState<ExternalReply[]>([]);
  const [completedCheckIns, setCompletedCheckIns] = useState<CompletedCheckIn[]>([]);
  const [messageText, setMessageText] = useState('');
  const [latestMessage, setLatestMessage] = useState<LatestBuddyMessage | null>(null);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [plannedCheckIns, setPlannedCheckIns] = useState<PlannedCheckIn[]>([]);
  const [completingPlannedCheckInId, setCompletingPlannedCheckInId] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [deletingBuddy, setDeletingBuddy] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [sendingMessage, setSendingMessage] = useState(false);
  const [settings, setSettings] = useState<BuddySettings>(emptySettings);
  const [session, setSession] = useState<Session | null>(null);
  const [showConnectSection, setShowConnectSection] = useState(false);
  const [showTimeZoneOptions, setShowTimeZoneOptions] = useState(false);
  const [activeBuddySection, setActiveBuddySection] = useState<BuddySection>('chat');
  const [incomingInvitations, setIncomingInvitations] = useState<BuddyInvitation[]>([]);
  const [editingPlannedCheckInId, setEditingPlannedCheckInId] = useState<string | null>(null);
  const scrollViewRef = useRef<ScrollView | null>(null);
  const messageScrollViewRef = useRef<ScrollView | null>(null);
  const buddyOffsets = useRef<Record<string, number>>({});
  const jumpToChatBottomRef = useRef(false);

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

      try {
        await Promise.all([
          loadDallasCode(),
          loadBuddies(nextSession.user.id, mounted),
          markBuddyMessagesRead(nextSession.user.id),
          markExternalRepliesRead(nextSession.user.id),
          loadIncomingInvitations(nextSession.user.id),
          syncGrantedPushTokenAsync(nextSession.user.id).catch(() => null),
        ]);
      } catch (error) {
        if (mounted) {
          setLoadError(error instanceof Error ? error.message : 'Could not load Dallas App Buddies.');
        }
      }
      setLoading(false);
    }

    load();

    return () => {
      mounted = false;
    };
  }, []);

  useFocusEffect(useCallback(() => {
    if (!session) {
      return undefined;
    }

    const userId = session.user.id;
    let mounted = true;

    async function refreshBuddyPage() {
      await loadBuddies(userId, mounted);

      if (mounted && expandedBuddy) {
        if (expandedBuddy.partner_kind === 'external') {
          await loadExternalReplies(expandedBuddy.id, mounted);
        } else {
          await loadMessages(expandedBuddy.app_connection_id, mounted);
        }
      }
    }

    refreshBuddyPage();

    return () => {
      mounted = false;
    };
  }, [expandedBuddyId, session]));

  useEffect(() => {
    const hasChatMessages = messages.length > 0 || externalReplies.length > 0;

    if (!jumpToChatBottomRef.current || activeBuddySection !== 'chat' || !hasChatMessages) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      messageScrollViewRef.current?.scrollToEnd({ animated: true });
      jumpToChatBottomRef.current = false;
    });

    return () => cancelAnimationFrame(frame);
  }, [
    activeBuddySection,
    externalReplies.length,
    externalReplies[externalReplies.length - 1]?.id,
    messages.length,
    messages[messages.length - 1]?.id,
  ]);

  async function retryLoad() {
    if (!session) {
      return;
    }
    setLoadError('');
    setLoading(true);
    try {
      await loadBuddies(session.user.id);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load Dallas App Buddies.');
    } finally {
      setLoading(false);
    }
  }

  async function loadDallasCode() {
    const { data, error } = await supabase.functions.invoke('accountability-app', {
      body: {
        action: 'get_code',
      },
    });

    if (error) {
      setMessage(await getFunctionErrorMessage(error));
      return;
    }

    setDallasCode(typeof data?.code === 'string' ? data.code : '');
  }

  async function loadBuddies(userId: string, mounted = true) {
    const { data, error } = await supabase
      .from('accountability_partners')
      .select(
        'app_connection_id, avatar_path, check_in_at, connected_user_id, created_at, id, location, mobile_number, name, notes, partner_kind, relationship, time_zone',
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

    const nextBuddies = data ?? [];
    setBuddies(nextBuddies);
    await loadBuddyProfiles(nextBuddies, mounted);
    await loadBuddySummaries(nextBuddies, userId, mounted);

    if (!expandedBuddyId && nextBuddies[0]) {
      handleToggleBuddy(nextBuddies.find((buddy) => buddy.id === buddyId) ?? nextBuddies[0]);
    }
  }

  async function loadIncomingInvitations(userId: string) {
    const { data } = await supabase.from('accountability_app_invitations').select('id, requester_user_id, created_at')
      .eq('recipient_user_id', userId).eq('status', 'pending').order('created_at', { ascending: false });
    const invitations = data ?? [];
    const requesterIds = invitations.map((invitation) => invitation.requester_user_id);
    const { data: profiles } = requesterIds.length ? await supabase.from('profiles').select('id, display_name').in('id', requesterIds) : { data: [] };
    const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name || 'Dallas user']));
    setIncomingInvitations(invitations.map((invitation) => ({ ...invitation, requester_name: names.get(invitation.requester_user_id) || 'Dallas user' })) as BuddyInvitation[]);
  }

  async function handleInvitation(invitationId: string, action: 'accept_invitation' | 'decline_invitation' | 'block') {
    const { error } = await supabase.functions.invoke('accountability-app', { body: { action, invitationId } });
    if (error || !session) { setMessage(error ? await getFunctionErrorMessage(error) : 'Could not update invitation.'); return; }
    await Promise.all([loadIncomingInvitations(session.user.id), loadBuddies(session.user.id)]);
  }

  async function loadBuddySummaries(nextBuddies: BuddyPartner[], _userId: string, mounted = true) {
    const { data, error } = await supabase.rpc('get_buddy_summaries');

    if (!mounted) {
      return;
    }

    if (error) {
      setMessage(error.message);
      return;
    }

    const rows = (data ?? []) as BuddySummaryRow[];
    const rowsByPartner = new Map(rows.map((row) => [row.partner_id, row]));

    const nextSummaries = nextBuddies.reduce<Record<string, BuddySummary>>((summaries, buddy) => {
      const row = rowsByPartner.get(buddy.id);

      summaries[buddy.id] = {
        lastMessage: row?.last_message ?? null,
        lastMessageAt: row?.last_message_at ?? null,
        nextCheckIn: row?.next_check_in ?? null,
        unreadCount: Number(row?.unread_count ?? 0),
      };
      return summaries;
    }, {});

    const newestMessage = rows
      .map((row) => {
        return row.latest_received_message && row.latest_received_at && row.latest_received_sender_user_id
          ? {
              body: row.latest_received_message,
              buddyId: row.partner_id,
              createdAt: row.latest_received_at,
              senderUserId: row.latest_received_sender_user_id,
            }
          : null;
      })
      .filter((message): message is LatestBuddyMessage => Boolean(message))
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime())[0] ?? null;

    setLatestMessage(newestMessage);
    setBuddySummaries(nextSummaries);
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

  async function loadExternalReplies(partnerId: string, mounted = true) {
    const { data, error } = await supabase
      .from('accountability_check_in_messages')
      .select('body, created_at, id')
      .eq('partner_id', partnerId)
      .eq('sender_type', 'partner')
      .order('created_at', { ascending: true })
      .limit(80);

    if (!mounted) {
      return;
    }

    if (error) {
      setMessage(error.message);
      return;
    }

    setExternalReplies(data ?? []);
  }

  async function loadCompletedCheckIns(partnerId: string, mounted = true, userId = session?.user.id) {
    if (!userId) {
      setCompletedCheckIns([]);
      return;
    }

    const { data, error } = await supabase
      .from('accountability_check_ins')
      .select('completed_at, id, note')
      .eq('user_id', userId)
      .eq('partner_id', partnerId)
      .order('completed_at', { ascending: false });

    if (!mounted) {
      return;
    }

    if (error) {
      setMessage(error.message);
      return;
    }

    setCompletedCheckIns(data ?? []);
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
      .order('scheduled_at', { ascending: true });

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

  async function markExternalRepliesRead(userId: string) {
    await supabase
      .from('accountability_check_in_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('sender_type', 'partner')
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
      setMessage(await getFunctionErrorMessage(error));
      return;
    }

    setAppConnectLookup('');
    await loadBuddies(session.user.id);
    setMessage('Buddy invitation sent.');
  }

  async function handleAddExternalBuddy() {
    if (!session) {
      return;
    }

    const name = newBuddyName.trim();
    const mobileNumber = newBuddyMobile.trim();

    if (!name || !mobileNumber) {
      setMessage('Enter a name and mobile number to add an outside-app buddy.');
      return;
    }

    setAddingExternalBuddy(true);
    setMessage('');
    const { error } = await supabase.from('accountability_partners').insert({
      location: newBuddyLocation.trim() || null,
      mobile_number: mobileNumber,
      name,
      phone: mobileNumber,
      partner_kind: 'external',
      relationship: newBuddyRelationship.trim() || null,
      time_zone: 'Europe/London',
      user_id: session.user.id,
    });
    setAddingExternalBuddy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setNewBuddyName('');
    setNewBuddyMobile('');
    setNewBuddyRelationship('');
    setNewBuddyLocation('');
    await loadBuddies(session.user.id);
    setMessage('Buddy added. Use Messages to send their first check-in.');
  }

  async function handleMessageExternalBuddy() {
    if (!session || !expandedBuddy?.mobile_number) {
      setMessage('Add a mobile number for this buddy first.');
      return;
    }

    const body = messageText.trim() || `Hi ${expandedBuddy.name}, checking in from Dallas. How are you doing?`;
    const { data: thread, error: threadError } = await supabase
      .from('accountability_check_in_threads')
      .insert({
        partner_id: expandedBuddy.id,
        user_display_name: session.user.user_metadata?.display_name || session.user.email || 'Dallas user',
        user_id: session.user.id,
      })
      .select('id, partner_token')
      .single();

    if (threadError) {
      setMessage(threadError.message);
      return;
    }

    const { error: messageError } = await supabase.from('accountability_check_in_messages').insert({
      body,
      partner_id: expandedBuddy.id,
      sender_type: 'user',
      thread_id: thread.id,
      user_id: session.user.id,
    });

    if (messageError) {
      setMessage(messageError.message);
      return;
    }

    const replyUrl = `https://dallas-app.onrender.com/check-in-reply/?token=${encodeURIComponent(thread.partner_token)}`;
    const url = `sms:${expandedBuddy.mobile_number}?body=${encodeURIComponent(`${body}\n\nReply here: ${replyUrl}`)}`;
    if (await Linking.canOpenURL(url)) {
      await Linking.openURL(url);
      setMessage('Message opened in Messages.');
    } else {
      setMessage('This device cannot open Messages.');
    }
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
    setActiveBuddySection('chat');
    setMessage('');
    setMessageText('');
    setComposerExpanded(false);
    setShowTimeZoneOptions(false);
    setEditingPlannedCheckInId(null);
    jumpToChatBottomRef.current = Boolean(nextExpandedId);

    if (!nextExpandedId) {
      setMessages([]);
      setExternalReplies([]);
      setCompletedCheckIns([]);
      setPlannedCheckIns([]);
      return;
    }

    requestAnimationFrame(() => {
      const offset = buddyOffsets.current[buddy.id];
      if (typeof offset === 'number') {
        scrollViewRef.current?.scrollTo({ animated: true, y: Math.max(0, offset - 18) });
      }
    });

    setSettings({
      checkInDate: formatDateInput(buddy.check_in_at),
      checkInTime: formatTimeInput(buddy.check_in_at) || '18:00',
      location: buddy.location ?? '',
      notes: buddy.notes ?? '',
      timeZone: buddy.time_zone ?? 'Europe/London',
    });
    if (buddy.partner_kind === 'external') {
      loadExternalReplies(buddy.id);
    } else {
      loadMessages(buddy.app_connection_id);
    }
    loadPlannedCheckIns(buddy.id);
    loadCompletedCheckIns(buddy.id);
  }

  function handleJumpToLatestMessage() {
    if (!latestMessage) {
      return;
    }

    const buddy = buddies.find((candidate) => candidate.id === latestMessage.buddyId);

    if (!buddy) {
      return;
    }

    jumpToChatBottomRef.current = true;

    if (expandedBuddyId !== buddy.id) {
      handleToggleBuddy(buddy);
    } else {
      setActiveBuddySection('chat');
    }

    requestAnimationFrame(() => {
      const offset = buddyOffsets.current[buddy.id];
      if (typeof offset === 'number') {
        scrollViewRef.current?.scrollTo({ animated: true, y: Math.max(0, offset - 18) });
      }
    });
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

  async function handleDeleteBuddy() {
    if (!session || !expandedBuddy) {
      return;
    }

    setDeletingBuddy(true);
    setMessage('');

    if (expandedBuddy.partner_kind === 'dallas_user' && expandedBuddy.app_connection_id) {
      const { error } = await supabase.functions.invoke('accountability-app', {
        body: { action: 'disconnect', connectionId: expandedBuddy.app_connection_id },
      });

      setDeletingBuddy(false);

      if (error) {
        setMessage(await getFunctionErrorMessage(error));
        return;
      }

      setShowDeleteDialog(false);
      setExpandedBuddyId('');
      setMessages([]);
      setPlannedCheckIns([]);
      setSettings(emptySettings);
      await loadBuddies(session.user.id);
      setMessage('Buddy disconnected.');
      return;
    }

    const { error } = await supabase
      .from('accountability_partners')
      .delete()
      .eq('id', expandedBuddy.id)
      .eq('user_id', session.user.id);

    setDeletingBuddy(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setShowDeleteDialog(false);
    setExpandedBuddyId('');
    setMessages([]);
    setPlannedCheckIns([]);
    setSettings(emptySettings);
    await loadBuddies(session.user.id);
    setMessage('Buddy deleted.');
  }

  async function handleBlockBuddy() {
    if (!session || !expandedBuddy?.app_connection_id) {
      return;
    }

    setDeletingBuddy(true);
    setMessage('');
    const { error } = await supabase.functions.invoke('accountability-app', {
      body: { action: 'block', connectionId: expandedBuddy.app_connection_id },
    });
    setDeletingBuddy(false);

    if (error) {
      setMessage(await getFunctionErrorMessage(error));
      return;
    }

    setExpandedBuddyId('');
    setMessages([]);
    setPlannedCheckIns([]);
    setSettings(emptySettings);
    await loadBuddies(session.user.id);
    setMessage('Buddy blocked. You can manage blocked buddies from your profile.');
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

    const query = editingPlannedCheckInId
      ? supabase
        .from('accountability_planned_check_ins')
        .update({ note: settings.notes.trim() || null, scheduled_at: scheduledAt, updated_at: new Date().toISOString() })
        .eq('id', editingPlannedCheckInId)
        .eq('partner_id', expandedBuddy.id)
      : supabase.from('accountability_planned_check_ins').insert({
        note: settings.notes.trim() || null,
        partner_id: expandedBuddy.id,
        scheduled_at: scheduledAt,
        user_id: session.user.id,
      });
    const { error } = await query;

    if (error) {
      setMessage(await getFunctionErrorMessage(error));
      return;
    }

    await loadPlannedCheckIns(expandedBuddy.id);
    setEditingPlannedCheckInId(null);
    setMessage(editingPlannedCheckInId ? 'Planned check-in updated.' : 'Planned check-in added.');
  }

  function handleEditPlannedCheckIn(plannedCheckIn: PlannedCheckIn) {
    setEditingPlannedCheckInId(plannedCheckIn.id);
    setSettings((current) => ({
      ...current,
      checkInDate: formatDateInput(plannedCheckIn.scheduled_at),
      checkInTime: formatTimeInput(plannedCheckIn.scheduled_at) || '18:00',
      notes: plannedCheckIn.note ?? current.notes,
    }));
    setMessage('Update the date or time, then save the planned check-in.');
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
    if (editingPlannedCheckInId === plannedCheckIn.id) {
      setEditingPlannedCheckInId(null);
    }
    setMessage('Planned check-in removed.');
  }

  async function handleCompletePlannedCheckIn(plannedCheckIn: PlannedCheckIn) {
    if (!session || completingPlannedCheckInId) {
      return;
    }

    setCompletingPlannedCheckInId(plannedCheckIn.id);
    setMessage('');

    const { error: completionError } = await supabase.from('accountability_check_ins').insert({
      note: plannedCheckIn.note,
      partner_id: plannedCheckIn.partner_id,
      user_id: session.user.id,
    });

    if (completionError) {
      setCompletingPlannedCheckInId(null);
      setMessage(completionError.message);
      return;
    }

    const { error: removalError } = await supabase
      .from('accountability_planned_check_ins')
      .delete()
      .eq('id', plannedCheckIn.id)
      .eq('partner_id', plannedCheckIn.partner_id)
      .eq('user_id', session.user.id);

    if (removalError) {
      setCompletingPlannedCheckInId(null);
      setMessage('Check-in completed, but the planned check-in could not be removed.');
      return;
    }

    if (plannedCheckIn.notification_id) {
      await Notifications.cancelScheduledNotificationAsync(plannedCheckIn.notification_id).catch(() => null);
    }

    await Promise.all([
      loadPlannedCheckIns(plannedCheckIn.partner_id),
      loadCompletedCheckIns(plannedCheckIn.partner_id),
      loadBuddySummaries(buddies, session.user.id),
    ]);
    setCompletingPlannedCheckInId(null);
    setMessage('Check-in completed.');
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
    jumpToChatBottomRef.current = true;
    await loadMessages(expandedBuddy.app_connection_id);
    await loadBuddySummaries(buddies, session.user.id);
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
          <ActivityIndicator color="#2E4737" />
          <Text style={styles.loadingText}>Loading Dallas App Buddies...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.container}>
          <Text style={styles.eyebrow}>Check-in</Text>
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

  const latestBuddy = latestMessage ? buddies.find((buddy) => buddy.id === latestMessage.buddyId) ?? null : null;
  const latestBuddyProfile = latestBuddy?.connected_user_id ? buddyProfiles[latestBuddy.connected_user_id] : undefined;
  const latestSenderName = latestMessage && latestMessage.senderUserId === session.user.id
    ? 'You'
    : latestBuddyProfile?.display_name || latestBuddy?.name || 'Your buddy';

  return (
    <SafeAreaView style={styles.screen}>
      <Modal
        animationType="fade"
        transparent
        visible={showDeleteDialog}
        onRequestClose={() => {
          if (!deletingBuddy) {
            setShowDeleteDialog(false);
          }
        }}
      >
        <View style={styles.deleteOverlay}>
          <View style={styles.deleteDialog}>
            <Text style={styles.deleteTitle}>
              {expandedBuddy?.partner_kind === 'dallas_user' ? 'Disconnect' : 'Delete'} {expandedBuddy?.name ?? 'this buddy'}?
            </Text>
            <Text style={styles.deleteCopy}>
              {expandedBuddy?.partner_kind === 'dallas_user'
                ? 'This removes the buddy, messages, and check-ins for both of you. You can reconnect only through a new invitation.'
                : 'This removes the buddy and their check-ins, planned check-ins, and web reply history from your account.'}
            </Text>
            <View style={styles.deleteActions}>
              <Pressable
                disabled={deletingBuddy}
                style={styles.secondaryButton}
                onPress={() => setShowDeleteDialog(false)}
              >
                <Text style={styles.secondaryButtonText}>Cancel</Text>
              </Pressable>
              <Pressable
                disabled={deletingBuddy}
                style={[styles.dangerButton, deletingBuddy && styles.disabledButton]}
                onPress={handleDeleteBuddy}
              >
                <Text style={styles.dangerButtonText}>
                  {deletingBuddy ? 'Removing...' : expandedBuddy?.partner_kind === 'dallas_user' ? 'Disconnect buddy' : 'Delete buddy'}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardArea}>
        <ScrollView ref={scrollViewRef} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.eyebrow}>Check-in</Text>
          <Text style={styles.title}>Check-in with your people</Text>
          <Text style={styles.copy}>
            Add every accountability buddy here. In-app buddies connect with a Dallas PIN; outside-app buddies receive
            a message with a secure web reply link.
          </Text>

          <View style={styles.panel}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: showConnectSection }}
              style={styles.connectHeader}
              onPress={() => setShowConnectSection((visible) => !visible)}
            >
              <MaterialIcons color="#2E4737" name={showConnectSection ? 'expand-less' : 'expand-more'} size={24} />
              <View style={styles.connectTitleCopy}>
                <Text style={styles.sectionTitle}>Add a buddy</Text>
                <Text style={styles.connectSummary}>{buddies.length} saved</Text>
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
                      <MaterialIcons color="#2E4737" name="content-copy" size={18} />
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
                <View style={styles.addBuddyDivider} />
                <Text style={styles.sectionTitle}>Add someone outside the app</Text>
                <Text style={styles.mutedText}>They will receive a message and use the web interface to reply.</Text>
                <Field label="Name" placeholder="Their name" value={newBuddyName} onChangeText={setNewBuddyName} />
                <Field
                  inputMode="tel"
                  label="Mobile number"
                  placeholder="+441234567890"
                  value={newBuddyMobile}
                  onChangeText={setNewBuddyMobile}
                />
                <Field
                  label="Relationship"
                  placeholder="Friend, sponsor, coach..."
                  value={newBuddyRelationship}
                  onChangeText={setNewBuddyRelationship}
                />
                <Field label="Location" placeholder="Optional" value={newBuddyLocation} onChangeText={setNewBuddyLocation} />
                <Pressable
                  disabled={addingExternalBuddy}
                  style={[styles.button, addingExternalBuddy && styles.disabledButton]}
                  onPress={handleAddExternalBuddy}
                >
                  <Text style={styles.buttonText}>{addingExternalBuddy ? 'Adding...' : 'Add outside-app buddy'}</Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          {incomingInvitations.length ? (
            <View style={styles.panel}>
              <Text style={styles.sectionTitle}>Buddy requests</Text>
              {incomingInvitations.map((invitation) => (
                <View key={invitation.id} style={styles.plannedCheckInItem}>
                  <Text style={styles.checkInHistoryDate}>{invitation.requester_name} wants to connect</Text>
                  <View style={styles.plannedActions}>
                    <Pressable style={styles.miniSecondaryButton} onPress={() => handleInvitation(invitation.id, 'accept_invitation')}><Text style={styles.miniSecondaryButtonText}>Accept</Text></Pressable>
                    <Pressable style={styles.miniSecondaryButton} onPress={() => handleInvitation(invitation.id, 'decline_invitation')}><Text style={styles.miniSecondaryButtonText}>Decline</Text></Pressable>
                    <Pressable style={styles.miniSecondaryButton} onPress={() => handleInvitation(invitation.id, 'block')}><Text style={styles.miniSecondaryButtonText}>Block</Text></Pressable>
                  </View>
                </View>
              ))}
            </View>
          ) : null}

          {latestMessage && latestBuddy ? (
            <View style={styles.latestMessageCard}>
              <View style={styles.latestMessageHeader}>
                <View style={styles.latestMessageAvatar}>
                  {latestBuddyProfile?.avatar_path ? (
                    <Image
                      source={{ uri: getPublicAvatarUrl(latestBuddyProfile.avatar_path) }}
                      style={styles.latestMessageAvatarImage}
                    />
                  ) : (
                    <Text style={styles.latestMessageAvatarInitial}>{getInitial(latestSenderName)}</Text>
                  )}
                </View>
                <View style={styles.latestMessageCopy}>
                  <Text style={styles.latestMessageEyebrow}>Latest message from {latestSenderName}</Text>
                  <Text numberOfLines={2} style={styles.latestMessageBody}>{latestMessage.body}</Text>
                  <Text style={styles.latestMessageTime}>{formatRelativeTime(latestMessage.createdAt)}</Text>
                </View>
              </View>
              <Pressable style={styles.latestMessageButton} onPress={handleJumpToLatestMessage}>
                <MaterialIcons color="#FFFFFF" name="forum" size={18} />
                <Text style={styles.latestMessageButtonText}>Jump to conversation</Text>
              </Pressable>
            </View>
          ) : null}

          {loadError ? (
            <View style={styles.errorPanel}>
              <Text style={styles.errorTitle}>We could not load your buddies</Text>
              <Text style={styles.errorText}>{loadError}</Text>
              <Pressable style={styles.secondaryButton} onPress={retryLoad}><Text style={styles.secondaryButtonText}>Try again</Text></Pressable>
            </View>
          ) : buddies.length ? (
            <View style={styles.buddyList}>
              {buddies.map((buddy) => {
                const expanded = buddy.id === expandedBuddyId;
                const profile = buddy.connected_user_id ? buddyProfiles[buddy.connected_user_id] : undefined;
                const avatarUrl = profile?.avatar_path ? getPublicAvatarUrl(profile.avatar_path) : '';
                const displayName = profile?.display_name || buddy.name;
                const summary = buddySummaries[buddy.id];

                return (
                  <View
                    key={buddy.id}
                    style={[styles.buddyItem, expanded && styles.activeBuddyItem]}
                    onLayout={(event) => {
                      buddyOffsets.current[buddy.id] = event.nativeEvent.layout.y;
                    }}
                  >
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
                          {[settingsLabel(buddy), getLocalTime(buddy.time_zone)].filter(Boolean).join(' · ')}
                        </Text>
                        <Text numberOfLines={1} style={styles.buddyPreview}>
                          {summary?.lastMessage || 'No messages yet'}
                          {summary?.lastMessageAt ? ` · ${formatRelativeTime(summary.lastMessageAt)}` : ''}
                        </Text>
                      </View>
                      {summary?.unreadCount ? (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadBadgeText}>{summary.unreadCount > 99 ? '99+' : summary.unreadCount}</Text>
                        </View>
                      ) : null}
                      <MaterialIcons color="#2E4737" name={expanded ? 'expand-less' : 'expand-more'} size={24} />
                    </Pressable>

                    {expanded ? (
                      <View style={styles.buddyBody}>
                        <View style={styles.buddyTabs} accessibilityRole="tablist">
                          {([
                            ['chat', 'Chat'],
                            ['check-ins', 'Check-ins'],
                            ['details', 'Details'],
                          ] as const).map(([key, label]) => (
                            <Pressable
                              key={key}
                              accessibilityRole="tab"
                              accessibilityState={{ selected: activeBuddySection === key }}
                              style={[styles.buddyTab, activeBuddySection === key && styles.activeBuddyTab]}
                              onPress={() => setActiveBuddySection(key)}
                            >
                              <Text style={[styles.buddyTabText, activeBuddySection === key && styles.activeBuddyTabText]}>{label}</Text>
                            </Pressable>
                          ))}
                        </View>

                        {activeBuddySection === 'check-ins' ? <View style={styles.plannedSection}>
                          <Text style={styles.sectionTitle}>Planned check-ins</Text>
                          {plannedCheckIns.length ? (
                            <View style={styles.checkInHistoryList}>
                              {plannedCheckIns.map((plannedCheckIn) => (
                                <View key={plannedCheckIn.id} style={[styles.checkInHistoryItem, styles.plannedCheckInItem]}>
                                  <Text style={styles.checkInHistoryDate}>{formatDateTime(plannedCheckIn.scheduled_at)}</Text>
                                  <Text style={styles.plannedCheckInStatus}>Check-in planned</Text>
                                  {plannedCheckIn.note ? <Text style={styles.checkInHistoryNote}>{plannedCheckIn.note}</Text> : null}
                                  <View style={styles.plannedActions}>
                                    <Pressable
                                      disabled={Boolean(completingPlannedCheckInId)}
                                      style={[styles.miniSecondaryButton, completingPlannedCheckInId && styles.disabledButton]}
                                      onPress={() => handleEditPlannedCheckIn(plannedCheckIn)}
                                    >
                                      <Text style={styles.miniSecondaryButtonText}>Edit</Text>
                                    </Pressable>
                                    <Pressable
                                      disabled={Boolean(completingPlannedCheckInId)}
                                      style={[styles.secondaryButton, completingPlannedCheckInId && styles.disabledButton]}
                                      onPress={() => handleRemovePlannedCheckIn(plannedCheckIn)}
                                    >
                                      <Text style={styles.secondaryButtonText}>Remove</Text>
                                    </Pressable>
                                    <Pressable
                                      disabled={Boolean(completingPlannedCheckInId)}
                                      style={[styles.miniSecondaryButton, completingPlannedCheckInId && styles.disabledButton]}
                                      onPress={() => handleCompletePlannedCheckIn(plannedCheckIn)}
                                    >
                                      <Text style={styles.miniSecondaryButtonText}>
                                        {completingPlannedCheckInId === plannedCheckIn.id ? 'Completing...' : 'Complete'}
                                      </Text>
                                    </Pressable>
                                  </View>
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text style={styles.mutedText}>No planned check-ins yet.</Text>
                          )}

                          <Text style={styles.historyGroupTitle}>Past check-ins</Text>
                          {completedCheckIns.length ? (
                            <View style={styles.checkInHistoryList}>
                              {completedCheckIns.map((checkIn) => (
                                <View key={checkIn.id} style={styles.checkInHistoryItem}>
                                  <Text style={styles.checkInHistoryDate}>{formatDateTime(checkIn.completed_at)}</Text>
                                  <Text style={styles.checkInHistoryStatus}>Check-in completed</Text>
                                  {checkIn.note ? <Text style={styles.checkInHistoryNote}>{checkIn.note}</Text> : null}
                                </View>
                              ))}
                            </View>
                          ) : (
                            <Text style={styles.mutedText}>No completed check-ins yet.</Text>
                          )}

                          {false && <View style={styles.pickerPanel}>
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
                              <Text style={styles.buttonText}>{editingPlannedCheckInId ? 'Save planned check-in' : 'Add planned check-in'}</Text>
                            </Pressable>
                            {editingPlannedCheckInId ? (
                              <Pressable style={styles.expandComposerButton} onPress={() => setEditingPlannedCheckInId(null)}>
                                <Text style={styles.expandComposerText}>Cancel edit</Text>
                              </Pressable>
                            ) : null}
                          </View>}
                        </View> : null}

                        {activeBuddySection === 'chat' ? <View style={styles.messagePanel}>
                          <Text style={styles.sectionTitle}>{buddy.partner_kind === 'dallas_user' ? `Message ${displayName}` : `Message ${displayName} via Messages`}</Text>
                          {buddy.partner_kind !== 'dallas_user' ? (
                            <Text style={styles.mutedText}>Your message includes a secure web link so they can reply without the app.</Text>
                          ) : null}
                          {buddy.partner_kind === 'external' ? (
                            externalReplies.length ? (
                              <ScrollView
                                ref={messageScrollViewRef}
                                nestedScrollEnabled
                                style={styles.messageHistory}
                                contentContainerStyle={styles.messageList}
                              >
                                {externalReplies.map((reply) => (
                                  <View key={reply.id} style={[styles.messageBubble, styles.theirMessageBubble]}>
                                    <Text style={styles.messageBody}>{reply.body}</Text>
                                    <Text style={styles.messageTime}>{formatDateTime(reply.created_at)}</Text>
                                  </View>
                                ))}
                              </ScrollView>
                            ) : (
                              <View style={styles.chatEmptyState}>
                                <Text style={styles.chatEmptyTitle}>No replies yet</Text>
                                <Text style={styles.mutedText}>When your external contact replies, it will appear here.</Text>
                              </View>
                            )
                          ) : messages.length ? (
                            <ScrollView
                              ref={messageScrollViewRef}
                              nestedScrollEnabled
                              style={styles.messageHistory}
                              contentContainerStyle={styles.messageList}
                            >
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
                            </ScrollView>
                          ) : (
                            <View style={styles.chatEmptyState}>
                              <Text style={styles.chatEmptyTitle}>Start the conversation</Text>
                              <Text style={styles.mutedText}>A short, honest message can make the next check-in easier.</Text>
                            </View>
                          )}

                          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                            <View style={styles.quickMessageRow}>
                            {['I’m okay', 'Can we talk?', 'Can we check in later?'].map((quickMessage) => (
                              <Pressable key={quickMessage} style={styles.quickMessageButton} onPress={() => setMessageText(quickMessage)}>
                                <Text style={styles.quickMessageText}>{quickMessage}</Text>
                              </Pressable>
                            ))}
                            </View>
                          </ScrollView>
                          <Field
                            label="Message"
                            multiline={composerExpanded}
                            placeholder="Send a check-in or encouragement..."
                            value={messageText}
                            onChangeText={setMessageText}
                          />
                          <Pressable style={styles.expandComposerButton} onPress={() => setComposerExpanded((expanded) => !expanded)}>
                            <Text style={styles.expandComposerText}>{composerExpanded ? 'Use compact composer' : 'Expand composer'}</Text>
                          </Pressable>
                          <Pressable
                            disabled={sendingMessage}
                            style={[styles.button, sendingMessage && styles.disabledButton]}
                            onPress={buddy.partner_kind === 'dallas_user' ? handleSendMessage : handleMessageExternalBuddy}
                          >
                            <Text style={styles.buttonText}>
                              {sendingMessage ? 'Sending...' : buddy.partner_kind === 'dallas_user' ? 'Send in-app message' : 'Open message'}
                            </Text>
                          </Pressable>
                        </View> : null}

                        {activeBuddySection === 'details' ? <View style={styles.settingsPanel}>
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
                          <Pressable
                            disabled={savingSettings || deletingBuddy}
                            style={[styles.dangerButton, (savingSettings || deletingBuddy) && styles.disabledButton]}
                            onPress={() => setShowDeleteDialog(true)}
                          >
                            <Text style={styles.dangerButtonText}>
                              {buddy.partner_kind === 'dallas_user' ? 'Disconnect buddy' : 'Delete buddy'}
                            </Text>
                          </Pressable>
                          {buddy.partner_kind === 'dallas_user' && buddy.app_connection_id ? (
                            <Pressable
                              disabled={savingSettings || deletingBuddy}
                              style={[styles.dangerButton, (savingSettings || deletingBuddy) && styles.disabledButton]}
                              onPress={handleBlockBuddy}
                            >
                              <Text style={styles.dangerButtonText}>{deletingBuddy ? 'Blocking...' : 'Block buddy'}</Text>
                            </Pressable>
                          ) : null}
                        </View> : null}
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

function formatRelativeTime(value: string | null) {
  if (!value) {
    return 'No recent activity';
  }

  const diffMinutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));

  if (diffMinutes < 1) {
    return 'just now';
  }

  if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);

  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }

  const diffDays = Math.round(diffHours / 24);
  return `${diffDays}d ago`;
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
  return buddy.partner_kind === 'external'
    ? 'External Contact'
    : buddy.location || buddy.relationship || 'Dallas App Buddy';
}

const styles = StyleSheet.create({
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
  latestMessageCard: {
    backgroundColor: '#EEF1EC',
    borderColor: '#D5DED9',
    borderRadius: 12,
    borderWidth: 1,
    gap: 14,
    padding: 14,
  },
  latestMessageHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  latestMessageAvatar: {
    alignItems: 'center',
    backgroundColor: '#E7E6E2',
    borderRadius: 24,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  latestMessageAvatarImage: {
    height: 48,
    width: 48,
  },
  latestMessageAvatarInitial: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 19,
    fontWeight: '900',
  },
  latestMessageCopy: {
    flex: 1,
    gap: 3,
  },
  latestMessageEyebrow: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '900',
  },
  latestMessageBody: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 20,
  },
  latestMessageTime: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 12,
  },
  latestMessageButton: {
    alignItems: 'center',
    backgroundColor: '#2E4737',
    borderRadius: 9,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 14,
  },
  latestMessageButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '900',
  },
  errorPanel: {
    backgroundColor: '#FFF8F7',
    borderColor: '#D9A6A1',
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  errorTitle: {
    color: '#A33D32',
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '900',
  },
  errorText: {
    color: '#A33D32',
    fontFamily: 'Manrope',
    fontSize: 14,
    lineHeight: 20,
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
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '800',
  },
  connectBody: {
    borderTopColor: '#E7E6E2',
    borderTopWidth: 1,
    gap: 12,
    paddingTop: 12,
  },
  addBuddyDivider: {
    borderTopColor: '#E7E6E2',
    borderTopWidth: 1,
    marginTop: 4,
    paddingTop: 14,
  },
  codePanel: {
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
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
    color: '#171717',
    fontFamily: 'Manrope',
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
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '900',
  },
  buddyList: {
    gap: 10,
  },
  buddyItem: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  activeBuddyItem: {
    borderColor: '#2E4737',
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
  buddyHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  buddyName: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 17,
    fontWeight: '900',
  },
  buddyMeta: {
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '700',
  },
  buddyPreview: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 12,
    lineHeight: 16,
  },
  unreadBadge: {
    alignItems: 'center',
    backgroundColor: '#A33D32',
    borderRadius: 12,
    justifyContent: 'center',
    minHeight: 24,
    minWidth: 24,
    paddingHorizontal: 6,
  },
  unreadBadgeText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '900',
  },
  buddyBody: {
    borderTopColor: '#E7E6E2',
    borderTopWidth: 1,
    gap: 16,
    padding: 12,
  },
  buddyTabs: {
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    padding: 3,
  },
  buddyTab: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 6,
  },
  activeBuddyTab: {
    backgroundColor: '#FFFFFF',
  },
  buddyTabText: {
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '800',
  },
  activeBuddyTabText: {
    color: '#2E4737',
  },
  plannedSection: {
    gap: 10,
  },
  checkInHistoryList: {
    gap: 8,
  },
  checkInHistoryItem: {
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    padding: 12,
  },
  plannedCheckInItem: {
    backgroundColor: '#EEF1EC',
    borderColor: '#B9CDC6',
  },
  checkInHistoryDate: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '900',
  },
  checkInHistoryStatus: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '800',
  },
  plannedCheckInStatus: {
    color: '#768277',
    fontFamily: 'DM Mono',
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  checkInHistoryNote: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 13,
    lineHeight: 18,
  },
  historyGroupTitle: {
    borderTopColor: '#E7E6E2',
    borderTopWidth: 1,
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 15,
    fontWeight: '900',
    marginTop: 8,
    paddingTop: 14,
  },
  nextCheckInBanner: {
    alignItems: 'center',
    backgroundColor: '#EEF1EC',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 7,
    minHeight: 38,
    paddingHorizontal: 10,
  },
  nextCheckInText: {
    color: '#829480',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '900',
  },
  sectionTitle: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 15,
    fontWeight: '900',
  },
  mutedText: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 14,
    lineHeight: 20,
  },
  plannedList: {
    gap: 8,
  },
  plannedItem: {
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 10,
  },
  plannedTitle: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '900',
  },
  plannedNote: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 12,
    lineHeight: 17,
  },
  plannedActions: {
    flexDirection: 'row',
    gap: 8,
  },
  miniSecondaryButton: {
    alignItems: 'center',
    borderColor: '#2E4737',
    borderRadius: 7,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 12,
  },
  miniSecondaryButtonText: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '800',
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
  messagePanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 12,
    padding: 12,
  },
  chatEmptyState: {
    backgroundColor: '#F7F7F5',
    borderRadius: 8,
    gap: 3,
    padding: 12,
  },
  chatEmptyTitle: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '900',
  },
  quickMessageRow: {
    flexDirection: 'row',
    gap: 6,
  },
  quickMessageButton: {
    backgroundColor: '#EEF1EC',
    borderRadius: 16,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 9,
  },
  quickMessageText: {
    color: '#829480',
    fontFamily: 'Manrope',
    fontSize: 11,
    fontWeight: '800',
  },
  expandComposerButton: {
    alignSelf: 'flex-end',
    minHeight: 44,
    justifyContent: 'center',
  },
  expandComposerText: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '800',
  },
  messageList: {
    gap: 8,
  },
  messageHistory: {
    maxHeight: 320,
  },
  messageBubble: {
    borderRadius: 8,
    gap: 5,
    maxWidth: '88%',
    padding: 10,
  },
  myMessageBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#2E4737',
  },
  theirMessageBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#F7F7F5',
    borderColor: '#E7E6E2',
    borderWidth: 1,
  },
  messageBody: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 14,
    lineHeight: 20,
  },
  myMessageBody: {
    color: '#FFFFFF',
  },
  messageTime: {
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 11,
    fontWeight: '800',
  },
  myMessageTime: {
    color: '#D9E8E3',
  },
  settingsPanel: {
    borderTopColor: '#E7E6E2',
    borderTopWidth: 1,
    gap: 12,
    paddingTop: 12,
  },
  fieldGroup: {
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
    fontSize: 15,
    fontWeight: '900',
  },
  secondaryButton: {
    alignItems: 'center',
    borderColor: '#2E4737',
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 42,
    paddingHorizontal: 14,
  },
  secondaryButtonText: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '900',
  },
  dangerButton: {
    alignItems: 'center',
    backgroundColor: '#A33D32',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 48,
    paddingHorizontal: 14,
  },
  dangerButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '900',
  },
  deleteOverlay: {
    alignItems: 'center',
    backgroundColor: 'rgba(23, 23, 23, 0.42)',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  deleteDialog: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    maxWidth: 420,
    padding: 20,
    width: '100%',
  },
  deleteTitle: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 20,
    fontWeight: '800',
  },
  deleteCopy: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 14,
    lineHeight: 21,
  },
  deleteActions: {
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'flex-end',
    paddingTop: 4,
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
  statusMessage: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '700',
    lineHeight: 20,
  },
});
