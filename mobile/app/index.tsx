import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageBackground,
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
import * as Notifications from 'expo-notifications';
import { Link, useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';

import { deviceStorage } from '../src/lib/deviceStorage';
import { registerAndSavePushTokenAsync, syncGrantedPushTokenAsync } from '../src/lib/notifications';
import { isSupabaseConfigured, supabase } from '../src/lib/supabase';
import { colors, type } from '../src/theme/designTokens';

const loginLogo = require('../assets/login-logo.png');
const importantInfoStorageKey = 'dallas.important_info_acknowledged';
const defaultSignupConfirmationUrl = 'https://dallas-app.onrender.com/account-created/';
const defaultPasswordResetUrl = 'https://dallas-app.onrender.com/reset-password/';

type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password';

type HomeProfile = {
  avatar_path: string | null;
  display_name: string | null;
  home_cover_image_path: string | null;
};

type HomeContext = {
  currentCheckIn: { note: string | null } | null;
  eventPlan: { event_date: string; event_name: string } | null;
  futureReminders: HomeReminder[];
  plannedCheckIns: HomePlannedCheckIn[];
};

type HomePlannedCheckIn = {
  id: string;
  note: string | null;
  notification_id: string | null;
  partner_id: string;
  partner_name: string;
  scheduled_at: string;
};

type HomeReminder = {
  id: string;
  kind: 'check_in' | 'personal';
  label: string;
  scheduled_at: string;
  title: string;
};

const homeLinks = [
  {
    description: 'Goals and commitments.',
    href: '/recovery-plan',
    icon: 'flag',
    label: 'Recovery plan',
  },
  {
    description: 'Store and revisit the existing vision.',
    href: '/prophetic-vision',
    icon: 'auto-awesome',
    label: 'Prophetic Vision',
  },
  {
    description: 'Guided reflection and structured support prompts.',
    href: '/ai-support',
    icon: 'psychology',
    label: 'AI support',
  },
  {
    description: 'Partners, check-ins, and shared commitments.',
    href: '/accountability',
    icon: 'groups',
    label: 'Reminders',
  },
  {
    description: 'Dallas app buddy messages, check-ins, and settings.',
    href: '/dallas-app-buddies',
    icon: 'forum',
    label: 'Check-in',
  },
  {
    description: 'Prepare before and after an event.',
    href: '/event-planning',
    icon: 'event-note',
    label: 'Event planning',
  },
  {
    description: 'Plan for predictable difficult moments.',
    href: '/danger-zone-planning',
    icon: 'warning',
    label: 'Plan for difficult moments',
  },
  {
    description: 'Notification schedules and recovery prompts.',
    href: '/reminders',
    icon: 'notifications',
    label: 'Reminder settings',
  },
  {
    description: 'Preferred name, phone number, and account settings.',
    href: '/profile',
    icon: 'person',
    label: 'Profile',
  },
  {
    description: 'API key, notifications, safety information, sign out, and app details.',
    href: '/settings',
    icon: 'settings',
    label: 'Settings',
  },
] as const;

const primaryHomeHrefs = new Set([
  '/recovery-plan',
  '/event-planning',
  '/danger-zone-planning',
]);


function getAvatarUrl(session: Session | null) {
  const avatarUrl = session?.user.user_metadata?.avatar_url;

  return typeof avatarUrl === 'string' ? avatarUrl : '';
}

function getPublicAvatarUrl(path: string) {
  return supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;
}

function getPublicHomeCoverUrl(path: string) {
  return supabase.storage.from('home-covers').getPublicUrl(path).data.publicUrl;
}

export default function HomeScreen() {
  const router = useRouter();
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [profile, setProfile] = useState<HomeProfile | null>(null);
  const [importantInfoAccepted, setImportantInfoAccepted] = useState(false);
  const [importantInfoLoading, setImportantInfoLoading] = useState(true);
  const [accountabilityUnreadCount, setAccountabilityUnreadCount] = useState(0);
  const [buddiesUnreadCount, setBuddiesUnreadCount] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [pushStatus, setPushStatus] = useState('Not requested');
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const [homeContext, setHomeContext] = useState<HomeContext>({ currentCheckIn: null, eventPlan: null, futureReminders: [], plannedCheckIns: [] });
  const [completingCheckIn, setCompletingCheckIn] = useState(false);
  const [startingCheckIn, setStartingCheckIn] = useState(false);
  const [homeMessage, setHomeMessage] = useState('');
  const [selectedCheckInId, setSelectedCheckInId] = useState<string | null>(null);
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const preferredNameFromSession = profile?.display_name ?? getPreferredName(session);
  const avatarUrl = profile?.avatar_path ? getPublicAvatarUrl(profile.avatar_path) : getAvatarUrl(session);
  const nextPlannedCheckIn = homeContext.plannedCheckIns[0] ?? null;
  const selectedCheckIn = homeContext.plannedCheckIns.find((checkIn) => checkIn.id === selectedCheckInId) ?? null;
  const hasPlannedCheckInToday = nextPlannedCheckIn ? isHomeDateToday(nextPlannedCheckIn.scheduled_at) : false;
  const checkInWindowActive = nextPlannedCheckIn
    ? isCheckInWindowActive(nextPlannedCheckIn.scheduled_at, currentTime)
    : false;
  const selectedCheckInWindowActive = selectedCheckIn
    ? isCheckInWindowActive(selectedCheckIn.scheduled_at, currentTime)
    : false;
  const homeCoverUrl = profile?.home_cover_image_path
    ? getPublicHomeCoverUrl(profile.home_cover_image_path)
    : '';
  const primaryHomeLinks = homeLinks.filter((item) => primaryHomeHrefs.has(item.href));

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 30_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let mounted = true;

    deviceStorage.getItem(importantInfoStorageKey).then((value) => {
      if (!mounted) {
        return;
      }

      setImportantInfoAccepted(value === 'true');
      setImportantInfoLoading(false);
    }).catch(() => {
      if (!mounted) {
        return;
      }

      setImportantInfoAccepted(false);
      setImportantInfoLoading(false);
    });

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }

      setSession(data.session);
      setSessionLoading(false);

      if (data.session) {
        syncSavedPushToken(data.session.user.id);
        loadUnreadCounts(data.session.user.id, mounted);
        loadHomeContext(data.session.user.id).then((context) => mounted && setHomeContext(context));
        loadHomeProfile(data.session.user.id).then((nextProfile) => {
          if (mounted) {
            setProfile(nextProfile);
          }
        });
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) {
        return;
      }

      setSession(nextSession);
      setAvatarFailed(false);
      setProfile(null);
      setSessionLoading(false);

      if (nextSession) {
        syncSavedPushToken(nextSession.user.id);
        loadUnreadCounts(nextSession.user.id, mounted);
        loadHomeContext(nextSession.user.id).then((context) => mounted && setHomeContext(context));
        loadHomeProfile(nextSession.user.id).then((nextProfile) => {
          if (mounted) {
            setProfile(nextProfile);
          }
        });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;

      supabase.auth.getSession().then(({ data }) => {
        if (!active) {
          return;
        }

        setSession(data.session);
        setSessionLoading(false);

        if (!data.session) {
          setAccountabilityUnreadCount(0);
          setBuddiesUnreadCount(0);
          setHomeContext({ currentCheckIn: null, eventPlan: null, futureReminders: [], plannedCheckIns: [] });
          setAvatarFailed(false);
          setProfile(null);
          return;
        }

        syncSavedPushToken(data.session.user.id);
        loadUnreadCounts(data.session.user.id, active);
        loadHomeContext(data.session.user.id).then((context) => active && setHomeContext(context));
        loadHomeProfile(data.session.user.id).then((nextProfile) => {
          if (active) {
            setProfile(nextProfile);
          }
        });
      });

      return () => {
        active = false;
      };
    }, []),
  );

  async function handleAcceptImportantInfo() {
    try {
      await deviceStorage.setItem(importantInfoStorageKey, 'true');
    } catch {
      // Acknowledgement storage should not block entering the app.
    }

    setImportantInfoAccepted(true);
  }

  async function handleCompleteCheckIn() {
    if (!session || !selectedCheckIn || completingCheckIn || startingCheckIn) {
      return;
    }

    setCompletingCheckIn(true);
    setHomeMessage('');

    const { error } = await supabase.from('accountability_check_ins').insert({
      note: selectedCheckIn.note,
      partner_id: selectedCheckIn.partner_id,
      user_id: session.user.id,
    });

    if (error) {
      setHomeMessage(error.message);
    } else {
      const removed = await removePlannedCheckIn(selectedCheckIn);
      setHomeMessage(removed
        ? `Check-in with ${selectedCheckIn.partner_name} completed.`
        : 'Check-in was completed, but the planned reminder could not be removed.');
    }

    setCompletingCheckIn(false);
  }

  async function handleCheckInNow() {
    if (!session || !selectedCheckIn || completingCheckIn || startingCheckIn) {
      return;
    }

    setStartingCheckIn(true);
    setHomeMessage('');

    const removed = await removePlannedCheckIn(selectedCheckIn);

    if (removed) {
      router.push(`/dallas-app-buddies?buddyId=${encodeURIComponent(selectedCheckIn.partner_id)}`);
    }

    setStartingCheckIn(false);
  }

  async function removePlannedCheckIn(checkIn: HomePlannedCheckIn) {
    if (!session) {
      return false;
    }

    const { error } = await supabase
      .from('accountability_planned_check_ins')
      .delete()
      .eq('id', checkIn.id)
      .eq('user_id', session.user.id);

    if (error) {
      setHomeMessage(error.message);
      return false;
    }

    if (checkIn.notification_id) {
      await Notifications.cancelScheduledNotificationAsync(checkIn.notification_id).catch(() => null);
    }

    const context = await loadHomeContext(session.user.id);
    setHomeContext(context);
    setSelectedCheckInId(null);
    return true;
  }

  async function loadUnreadCounts(userId: string, active = true) {
    const [{ count: webReplyCount }, { data: appConnections }] = await Promise.all([
      supabase
        .from('accountability_check_in_messages')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('sender_type', 'partner')
        .is('read_at', null),
      supabase
        .from('accountability_app_connections')
        .select('id')
        .or(`requester_user_id.eq.${userId},recipient_user_id.eq.${userId}`),
    ]);

    const connectionIds = (appConnections ?? []).map((connection) => connection.id);
    let appMessageCount = 0;

    if (connectionIds.length) {
      const { count } = await supabase
        .from('accountability_app_messages')
        .select('id', { count: 'exact', head: true })
        .in('connection_id', connectionIds)
        .neq('sender_user_id', userId)
        .is('read_at', null);

      appMessageCount = count ?? 0;
    }

    if (active) {
      setAccountabilityUnreadCount(webReplyCount ?? 0);
      setBuddiesUnreadCount(appMessageCount);
    }
  }

  async function handleAuthSubmit() {
    if (!configured) {
      setAuthMessage('Add Supabase URL and anon key to .env first.');
      return;
    }

    const trimmedEmail = email.trim();
    const trimmedPreferredName = preferredName.trim();
    const trimmedPhoneNumber = phoneNumber.trim();

    if (!trimmedEmail || password.length < 6) {
      setAuthMessage('Enter an email and a password with at least 6 characters.');
      return;
    }

    if (authMode === 'sign-up' && !trimmedPreferredName) {
      setAuthMessage('Enter your preferred name.');
      return;
    }

    if (authMode === 'sign-up' && !isInternationalPhoneNumber(trimmedPhoneNumber)) {
      setAuthMessage('Enter your phone number in international format, like +14155552671.');
      return;
    }

    setAuthLoading(true);
    setAuthMessage('');

    const signupConfirmationRedirectUrl = getConfiguredUrl(
      process.env.EXPO_PUBLIC_SIGNUP_CONFIRMATION_URL,
      defaultSignupConfirmationUrl,
    );

    const result =
      authMode === 'sign-in'
        ? await supabase.auth.signInWithPassword({
            email: trimmedEmail,
            password,
          })
        : await supabase.auth.signUp({
            email: trimmedEmail,
            password,
            options: {
              emailRedirectTo: signupConfirmationRedirectUrl,
              data: {
                phone_number: trimmedPhoneNumber,
                preferred_name: trimmedPreferredName,
              },
            },
          });

    setAuthLoading(false);

    if (result.error) {
      setAuthMessage(getFriendlyAuthError(result.error.message));
      return;
    }

    if (authMode === 'sign-up' && !result.data.session) {
      setAuthMessage('Account created. Check your email to confirm before signing in.');
      return;
    }

    setPassword('');
    setAuthMessage(authMode === 'sign-in' ? 'Signed in.' : 'Account ready.');
  }

  async function handlePasswordReset() {
    if (!configured) {
      setAuthMessage('Add Supabase URL and anon key to .env first.');
      return;
    }

    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      setAuthMessage('Enter the email address for your account.');
      return;
    }

    setAuthLoading(true);
    setAuthMessage('');

    const resetRedirectUrl = getConfiguredUrl(
      process.env.EXPO_PUBLIC_PASSWORD_RESET_URL,
      defaultPasswordResetUrl,
    );

    const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
      redirectTo: resetRedirectUrl,
    });

    setAuthLoading(false);

    if (error) {
      setAuthMessage(getFriendlyAuthError(error.message));
      return;
    }

    setAuthMessage('Password reset email sent. Check your inbox for the recovery link.');
    setAuthMode('sign-in');
  }

  async function handleSignOut() {
    setAuthLoading(true);
    setAuthMessage('');

    const { error } = await supabase.auth.signOut();

    setAuthLoading(false);
    setPassword('');
    setAuthMessage(error ? getFriendlyAuthError(error.message) : 'Signed out.');
  }

  async function handleNotificationCheck() {
    if (!session) {
      setPushStatus('Sign in before enabling notifications.');
      return;
    }

    setPushStatus('Requesting permission...');

    try {
      const token = await registerAndSavePushTokenAsync(session.user.id);
      setPushStatus(token ? 'Push notifications ready' : 'Permission not granted');
    } catch (error) {
      setPushStatus(error instanceof Error ? error.message : 'Notification setup failed');
    }
  }

  if (importantInfoLoading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loadingPanel}>
          <ActivityIndicator color="#2E4737" />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!importantInfoAccepted) {
    return (
      <SafeAreaView style={styles.screen}>
        <ScrollView contentContainerStyle={styles.container}>
          <Image source={loginLogo} style={styles.importantLogo} />
          <Text style={styles.eyebrow}>Dallas</Text>
          <Text style={styles.title}>Important information</Text>
          <Text style={styles.copy}>
            Please read this before using Dallas. The app is designed to support reflection, planning, reminders, and
            accountability. It is not a crisis service or a replacement for professional care.
          </Text>

          <View style={styles.warningPanel}>
            <Text style={styles.warningTitle}>Not medical or clinical treatment</Text>
            <Text style={styles.warningText}>
              Dallas does not provide diagnosis, therapy, medical advice, detox support, emergency response, or
              treatment. Decisions about health, medication, recovery, or safety should be made with qualified
              professionals in your location.
            </Text>
          </View>

          <ImportantInfoBlock
            marker="1"
            title="Use qualified local support"
            items={[
              'Speak with licensed healthcare, mental health, addiction, or recovery professionals when making care decisions.',
              'Use your local emergency or crisis services if you may harm yourself, harm someone else, or need urgent help.',
              'Choose accountability partners who are willing, informed, and appropriate for the type of support you need.',
            ]}
          />

          <ImportantInfoBlock
            marker="2"
            title="What Dallas can help with"
            items={[
              'Organising event plans, danger-zone plans, reminders, and personal commitments.',
              'Capturing reflective writing, stored prophetic vision notes, audio, and accountability check-ins.',
              'Supporting motivation and structure through AI-assisted rewriting and prompts.',
            ]}
          />

          <ImportantInfoBlock
            marker="3"
            title="What Dallas cannot do"
            items={[
              'It cannot monitor your safety, contact help on your behalf, or guarantee a response from another person.',
              'It cannot replace therapy, medical care, sponsor support, or emergency services.',
              'AI responses may be incomplete or wrong and should not be relied on for medical or crisis decisions.',
            ]}
          />

          <View style={styles.responsibilityPanel}>
            <Text style={styles.responsibilityTitle}>Your responsibility</Text>
            <Text style={styles.responsibilityText}>
              By continuing, you acknowledge these limits and agree to seek appropriate local professional or emergency
              support whenever your wellbeing or safety requires it.
            </Text>
          </View>

          <Pressable style={styles.button} onPress={handleAcceptImportantInfo}>
            <Text style={styles.buttonText}>I understand and agree</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardArea}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        {sessionLoading ? (
          <View style={styles.loadingPanel}>
            <ActivityIndicator color="#2E4737" />
            <Text style={styles.loadingText}>Checking session...</Text>
          </View>
        ) : session ? (
          <>
            <View style={styles.brandHeader}>
              <Image source={loginLogo} style={styles.brandLogo} />
              <View style={styles.brandCopy}>
                <Text style={styles.brandName}>Dallas</Text>
                <Text style={styles.brandTagline}>Recovery planning</Text>
              </View>
            </View>

            {homeCoverUrl ? (
              <ImageBackground
                source={{ uri: homeCoverUrl }}
                style={styles.dashboardHero}
                imageStyle={styles.dashboardHeroImage}
              >
                <View style={styles.dashboardHeroOverlay}>
                  <HeroContent
                    avatarFailed={avatarFailed}
                    avatarUrl={avatarUrl}
                    email={session.user.email}
                    name={preferredNameFromSession}
                    onAvatarFailed={() => setAvatarFailed(true)}
                  />
                </View>
              </ImageBackground>
            ) : (
              <View style={styles.dashboardHero}>
                <HeroContent
                  avatarFailed={avatarFailed}
                  avatarUrl={avatarUrl}
                  email={session.user.email}
                  name={preferredNameFromSession}
                  onAvatarFailed={() => setAvatarFailed(true)}
                />
              </View>
            )}

            <View style={styles.greetingRow}>
              <View style={styles.greetingCopy}>
                <Text style={styles.greetingText}>Good {getTimeOfDay()}, {preferredNameFromSession || 'there'}</Text>
                <Text style={styles.greetingSubtext}>You only need to take the next helpful step.</Text>
              </View>
              <MaterialIcons color={colors.primary} name="wb-sunny" size={24} />
            </View>

            <View style={styles.todayPanel}>
              <Text style={styles.sectionEyebrow}>Today</Text>
              <Text style={styles.sectionHeading}>What would help right now?</Text>
              <Text style={styles.sectionCopy}>A short check-in can help you choose your next supportive step.</Text>
              <View style={[styles.checkInStatusRow, checkInWindowActive && styles.checkInWindowStatusRow]}>
                <View style={[
                  styles.statusDot,
                  homeContext.currentCheckIn ? styles.statusDotComplete : styles.statusDotPending,
                  checkInWindowActive && styles.checkInWindowDot,
                ]} />
                <Text style={styles.checkInStatusText}>
                  {homeContext.currentCheckIn?.note || (hasPlannedCheckInToday
                    ? `Check-in planned with ${nextPlannedCheckIn?.partner_name ?? 'your buddy'}`
                    : 'No check-in recorded today')}
                </Text>
              </View>
              {homeContext.futureReminders.length ? (
                <View style={styles.reminderList}>
                  <Text style={styles.reminderListLabel}>Upcoming reminders</Text>
                  {homeContext.futureReminders.map((reminder) => reminder.kind === 'check_in' ? (
                    <Pressable
                      key={`${reminder.kind}-${reminder.id}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: selectedCheckInId === reminder.id }}
                      onPress={() => {
                        setSelectedCheckInId(reminder.id);
                        setHomeMessage('');
                      }}
                      style={[styles.upcomingRow, styles.selectableReminderRow, selectedCheckInId === reminder.id && styles.selectedReminderRow]}
                    >
                      <MaterialIcons color={reminder.kind === 'check_in' ? colors.support : colors.primary} name={reminder.kind === 'check_in' ? 'schedule' : 'notifications'} size={20} />
                      <View style={styles.upcomingCopy}>
                        <Text style={styles.upcomingLabel}>{reminder.label}</Text>
                        <Text style={styles.upcomingValue}>{reminder.title} · {formatHomeDate(reminder.scheduled_at)}</Text>
                      </View>
                    </Pressable>
                  ) : (
                    <View key={`${reminder.kind}-${reminder.id}`} style={styles.upcomingRow}>
                      <MaterialIcons color={colors.primary} name="notifications" size={20} />
                      <View style={styles.upcomingCopy}>
                        <Text style={styles.upcomingLabel}>{reminder.label}</Text>
                        <Text style={styles.upcomingValue}>{reminder.title} · {formatHomeDate(reminder.scheduled_at)}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              ) : null}
              {homeContext.eventPlan ? (
                <Link href="/event-planning" asChild>
                  <Pressable style={styles.upcomingRow}>
                    <MaterialIcons color={colors.warning} name="event" size={20} />
                    <View style={styles.upcomingCopy}>
                      <Text style={styles.upcomingLabel}>Upcoming event</Text>
                      <Text style={styles.upcomingValue}>{homeContext.eventPlan.event_name || 'Event plan'} · {homeContext.eventPlan.event_date}</Text>
                    </View>
                  </Pressable>
                </Link>
              ) : null}
              {homeContext.plannedCheckIns.length ? (
                <>
                  {selectedCheckIn ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: completingCheckIn || startingCheckIn }}
                      disabled={completingCheckIn || startingCheckIn}
                      onPress={handleCheckInNow}
                      style={StyleSheet.flatten([
                        styles.primaryAction,
                        selectedCheckInWindowActive && styles.checkInWindowAction,
                        (completingCheckIn || startingCheckIn) && styles.disabledAction,
                      ])}
                    >
                      <MaterialIcons color={colors.white} name="check-circle" size={22} />
                      <Text style={styles.primaryActionText}>{startingCheckIn ? 'Opening...' : 'Check in now'}</Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ disabled: true }}
                      disabled
                      style={[styles.primaryAction, styles.disabledAction]}
                    >
                      <MaterialIcons color={colors.white} name="check-circle" size={22} />
                      <Text style={styles.primaryActionText}>Check in now</Text>
                    </Pressable>
                  )}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ disabled: !selectedCheckIn || completingCheckIn || startingCheckIn }}
                    disabled={!selectedCheckIn || completingCheckIn || startingCheckIn}
                    onPress={handleCompleteCheckIn}
                    style={[styles.completeCheckInAction, (!selectedCheckIn || completingCheckIn || startingCheckIn) && styles.disabledAction]}
                  >
                    <MaterialIcons color={selectedCheckIn && !startingCheckIn ? colors.primary : colors.muted} name="task-alt" size={22} />
                    <Text style={[styles.completeCheckInActionText, (!selectedCheckIn || startingCheckIn) && styles.disabledCompleteCheckInActionText]}>{completingCheckIn ? 'Completing...' : 'Complete check-in'}</Text>
                  </Pressable>
                </>
              ) : null}
              {homeMessage ? <Text style={styles.homeMessage}>{homeMessage}</Text> : null}
            </View>

            <View style={styles.homeSection}>
              <Text style={styles.sectionEyebrow}>Your support</Text>
              <View style={styles.supportRow}>
                <Link href="/accountability" asChild>
                  <Pressable style={styles.supportCard}>
                    <MaterialIcons color={colors.support} name="groups" size={22} />
                    <View style={styles.supportCardCopy}>
                  <Text style={styles.supportCardTitle}>Reminders</Text>
                  <Text style={styles.supportCardText}>{accountabilityUnreadCount ? `${accountabilityUnreadCount} unread` : 'Plan reminders with your people'}</Text>
                    </View>
                  </Pressable>
                </Link>
                <Link href="/dallas-app-buddies" asChild>
                  <Pressable style={styles.supportCard}>
                    <MaterialIcons color={colors.primary} name="forum" size={22} />
                    <View style={styles.supportCardCopy}>
                  <Text style={styles.supportCardTitle}>Check-in</Text>
                      <Text style={styles.supportCardText}>{buddiesUnreadCount ? `${buddiesUnreadCount} unread` : 'Message a Dallas buddy'}</Text>
                    </View>
                  </Pressable>
                </Link>
              </View>
            </View>

            <View style={styles.homeSection}>
              <Text style={styles.sectionEyebrow}>Plan ahead</Text>
              <View style={styles.homeGrid}>
              {primaryHomeLinks.map((item) => (
                <Link key={item.href} href={item.href} asChild>
                  <Pressable style={styles.homeLink}>
                    <View style={[styles.homeLinkIcon, { backgroundColor: getHomeLinkAccent(item.href).surface }]}>
                      <MaterialIcons color={getHomeLinkAccent(item.href).color} name={item.icon} size={21} />
                    </View>
                    <View style={styles.homeLinkCopy}>
                      <View style={styles.homeLinkTitleRow}>
                        <Text style={styles.homeLinkTitle}>{item.label}</Text>
                        {item.href === '/accountability' && accountabilityUnreadCount > 0 ? (
                          <View style={styles.notificationBadge}>
                            <Text style={styles.notificationBadgeText}>
                              {accountabilityUnreadCount > 99 ? '99+' : accountabilityUnreadCount}
                            </Text>
                          </View>
                        ) : null}
                        {item.href === '/dallas-app-buddies' && buddiesUnreadCount > 0 ? (
                          <View style={styles.notificationBadge}>
                            <Text style={styles.notificationBadgeText}>
                              {buddiesUnreadCount > 99 ? '99+' : buddiesUnreadCount}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                      <Text style={styles.homeLinkDescription}>{item.description}</Text>
                    </View>
                    <Text style={[styles.homeLinkArrow, { color: getHomeLinkAccent(item.href).color }]}>{'>'}</Text>
                  </Pressable>
                </Link>
              ))}
            </View>
            </View>

            <View style={styles.moreToolsPanel}>
              <Text style={styles.sectionEyebrow}>More tools</Text>
              <View style={styles.moreToolsGrid}>
                {[
                  { href: '/ai-support', icon: 'psychology', label: 'AI support' },
                  { href: '/prophetic-vision', icon: 'auto-awesome', label: 'Prophetic Vision' },
                  { href: '/reminders', icon: 'notifications-none', label: 'Reminder settings' },
                  { href: '/profile', icon: 'person', label: 'Profile' },
                ].map((item) => (
                  <Link key={item.href} href={item.href as never} asChild>
                    <Pressable style={styles.moreTool}>
                      <MaterialIcons color={colors.quiet} name={item.icon as keyof typeof MaterialIcons.glyphMap} size={19} />
                      <Text style={styles.moreToolText}>{item.label}</Text>
                    </Pressable>
                  </Link>
                ))}
              </View>
            </View>

            <Pressable
              disabled={authLoading}
              style={[styles.secondaryButton, authLoading && styles.disabledButton]}
              onPress={handleSignOut}
            >
              <Text style={styles.secondaryButtonText}>
                {authLoading ? 'Signing out...' : 'Sign out'}
              </Text>
            </Pressable>
          </>
        ) : (
          <>
          <Image source={loginLogo} style={styles.loginLogo} />
          <Text style={styles.eyebrow}>Dallas</Text>
          <Text style={styles.title}>Start with secure access</Text>
          <Text style={styles.copy}>
            Sign in to prepare your recovery plan, reminders, and accountability support.
          </Text>
          <View style={styles.authPanel}>
            {authMode === 'forgot-password' ? (
              <View style={styles.formHeader}>
                <Text style={styles.formTitle}>Reset password</Text>
                <Text style={styles.formCopy}>Enter your email and Supabase will send a recovery link.</Text>
              </View>
            ) : (
              <View style={styles.modeControl}>
                <Pressable
                  style={[styles.modeButton, authMode === 'sign-in' && styles.activeModeButton]}
                  onPress={() => {
                    setAuthMode('sign-in');
                    setAuthMessage('');
                  }}
                >
                  <Text
                    style={[
                      styles.modeButtonText,
                      authMode === 'sign-in' && styles.activeModeButtonText,
                    ]}
                  >
                    Sign in
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.modeButton, authMode === 'sign-up' && styles.activeModeButton]}
                  onPress={() => {
                    setAuthMode('sign-up');
                    setAuthMessage('');
                  }}
                >
                  <Text
                    style={[
                      styles.modeButtonText,
                      authMode === 'sign-up' && styles.activeModeButtonText,
                    ]}
                  >
                    Create account
                  </Text>
                </Pressable>
              </View>
            )}

            {authMode === 'sign-up' ? (
              <>
                <View style={styles.fieldGroup}>
                  <Text style={styles.inputLabel}>Preferred name</Text>
                  <TextInput
                    autoCapitalize="words"
                    autoComplete="name"
                    onChangeText={setPreferredName}
                    placeholder="What should we call you?"
                    placeholderTextColor="#768277"
                    style={styles.input}
                    textContentType="givenName"
                    value={preferredName}
                  />
                </View>

                <View style={styles.fieldGroup}>
                  <Text style={styles.inputLabel}>Phone number</Text>
                  <TextInput
                    autoCapitalize="none"
                    autoComplete="tel"
                    inputMode="tel"
                    keyboardType="phone-pad"
                    onChangeText={setPhoneNumber}
                    placeholder="+14155552671"
                    placeholderTextColor="#768277"
                    style={styles.input}
                    textContentType="telephoneNumber"
                    value={phoneNumber}
                  />
                </View>
              </>
            ) : null}

            <View style={styles.fieldGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                inputMode="email"
                keyboardType="email-address"
                onChangeText={setEmail}
                placeholder="you@example.com"
                placeholderTextColor="#768277"
                style={styles.input}
                textContentType="emailAddress"
                value={email}
              />
            </View>

            {authMode !== 'forgot-password' ? (
              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>Password</Text>
                <TextInput
                  autoCapitalize="none"
                  autoComplete={authMode === 'sign-in' ? 'current-password' : 'new-password'}
                  onChangeText={setPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor="#768277"
                  secureTextEntry
                  style={styles.input}
                  textContentType={authMode === 'sign-in' ? 'password' : 'newPassword'}
                  value={password}
                />
              </View>
            ) : null}

            <Pressable
              disabled={authLoading}
              style={[styles.button, authLoading && styles.disabledButton]}
              onPress={authMode === 'forgot-password' ? handlePasswordReset : handleAuthSubmit}
            >
              <Text style={styles.buttonText}>
                {authLoading
                  ? 'Working...'
                  : authMode === 'sign-in'
                    ? 'Sign in'
                    : authMode === 'sign-up'
                      ? 'Create account'
                      : 'Send reset email'}
              </Text>
            </Pressable>

            {authMode === 'sign-in' ? (
              <Pressable
                disabled={authLoading}
                style={styles.textButton}
                onPress={() => {
                  setAuthMode('forgot-password');
                  setPassword('');
                  setAuthMessage('');
                }}
              >
                <Text style={styles.textButtonLabel}>Forgot password?</Text>
              </Pressable>
            ) : null}

            {authMode === 'forgot-password' ? (
              <Pressable
                disabled={authLoading}
                style={styles.textButton}
                onPress={() => {
                  setAuthMode('sign-in');
                  setAuthMessage('');
                }}
              >
                <Text style={styles.textButtonLabel}>Back to sign in</Text>
              </Pressable>
            ) : null}
          </View>
          </>
        )}

        {authMessage ? <Text style={styles.message}>{authMessage}</Text> : null}

        {!sessionLoading && !session ? (
          <>
            <View style={styles.panel}>
              <StatusRow label="Supabase config" value={configured ? 'Ready' : 'Missing .env values'} />
              <StatusRow label="App environment" value={process.env.EXPO_PUBLIC_APP_ENV ?? 'development'} />
              <StatusRow label="Notifications" value={pushStatus} />
            </View>

            <Pressable style={styles.button} onPress={handleNotificationCheck}>
              <Text style={styles.buttonText}>Check notifications</Text>
            </Pressable>
          </>
        ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function isInternationalPhoneNumber(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

function getFriendlyAuthError(message: string) {
  if (message.toLowerCase().includes('email rate limit exceeded')) {
    return 'Email limit reached. Please wait before sending another auth email, or configure custom SMTP in Supabase.';
  }

  return message;
}

function getPreferredName(session: Session | null) {
  const preferredName = session?.user.user_metadata?.preferred_name;

  return typeof preferredName === 'string' ? preferredName : '';
}

function syncSavedPushToken(userId: string) {
  syncGrantedPushTokenAsync(userId).catch(() => {
    // Push token sync should not block loading the home screen.
  });
}

async function loadHomeProfile(userId: string) {
  const { data, error } = await supabase
    .from('profiles')
    .select('avatar_path, display_name, home_cover_image_path')
    .eq('id', userId)
    .maybeSingle<HomeProfile>();

  if (error) {
    return null;
  }

  return data;
}

async function loadHomeContext(userId: string): Promise<HomeContext> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [currentCheckInResult, plannedCheckInsResult, recoveryRemindersResult, eventResult] = await Promise.all([
    supabase
      .from('accountability_check_ins')
      .select('note')
      .eq('user_id', userId)
      .gte('completed_at', startOfDay.toISOString())
      .order('completed_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('accountability_planned_check_ins')
      .select('id, note, notification_id, partner_id, scheduled_at')
      .eq('user_id', userId)
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true }),
    supabase
      .from('recovery_reminders')
      .select('id, scheduled_at, title')
      .eq('user_id', userId)
      .eq('enabled', true)
      .eq('status', 'scheduled')
      .gte('scheduled_at', new Date().toISOString())
      .order('scheduled_at', { ascending: true }),
    supabase
      .from('event_plans')
      .select('event_date, event_name')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(10),
  ]);

  const plannedCheckIns = plannedCheckInsResult.data ?? [];
  const partnerIds = [...new Set(plannedCheckIns.map((checkIn) => checkIn.partner_id))];
  let partnerNames = new Map<string, string>();

  if (partnerIds.length) {
    const { data: partners } = await supabase
      .from('accountability_partners')
      .select('id, name')
      .in('id', partnerIds);
    partnerNames = new Map((partners ?? []).map((partner) => [partner.id, partner.name]));
  }

  const plannedCheckInsWithBuddies: HomePlannedCheckIn[] = plannedCheckIns.map((checkIn) => ({
    ...checkIn,
    partner_name: partnerNames.get(checkIn.partner_id) ?? 'your buddy',
  }));

  const futureReminders: HomeReminder[] = [
    ...plannedCheckInsWithBuddies.map((checkIn) => ({
      id: checkIn.id,
      kind: 'check_in' as const,
      label: `Check-in planned with ${checkIn.partner_name}`,
      scheduled_at: checkIn.scheduled_at,
      title: checkIn.note || 'Planned check-in',
    })),
    ...(recoveryRemindersResult.data ?? []).map((reminder) => ({
      id: reminder.id,
      kind: 'personal' as const,
      label: 'Personal reminder',
      scheduled_at: reminder.scheduled_at,
      title: reminder.title,
    })),
  ].sort((left, right) => Date.parse(left.scheduled_at) - Date.parse(right.scheduled_at));

  const eventPlan = (eventResult.data ?? [])
    .filter((plan) => typeof plan.event_date === 'string' && plan.event_date.trim() && isHomeDateUpcoming(plan.event_date))
    .sort((a, b) => compareHomeDates(a.event_date, b.event_date))[0] ?? null;

  return {
    currentCheckIn: currentCheckInResult.data ?? null,
    eventPlan,
    futureReminders,
    plannedCheckIns: plannedCheckInsWithBuddies,
  };
}

function compareHomeDates(left: string, right: string) {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
    return left.localeCompare(right);
  }

  return leftTime - rightTime;
}

function isHomeDateUpcoming(value: string, now = new Date()) {
  const trimmedValue = value.trim();

  // Event plans are date-based, so an event scheduled for today is still upcoming.
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    const today = [now.getFullYear(), now.getMonth() + 1, now.getDate()]
      .map((part) => String(part).padStart(2, '0'));

    return trimmedValue >= `${today[0]}-${today[1]}-${today[2]}`;
  }

  const parsedTime = Date.parse(trimmedValue);
  return !Number.isNaN(parsedTime) && parsedTime >= now.getTime();
}

function isHomeDateToday(value: string, now = new Date()) {
  const trimmedValue = value.trim();
  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmedValue);

  if (dateOnlyMatch) {
    return Number(dateOnlyMatch[1]) === now.getFullYear()
      && Number(dateOnlyMatch[2]) === now.getMonth() + 1
      && Number(dateOnlyMatch[3]) === now.getDate();
  }

  const parsed = new Date(trimmedValue);

  return !Number.isNaN(parsed.getTime())
    && parsed.getFullYear() === now.getFullYear()
    && parsed.getMonth() === now.getMonth()
    && parsed.getDate() === now.getDate();
}

function isCheckInWindowActive(value: string, now = new Date()) {
  const scheduledTime = Date.parse(value);
  const tenMinutes = 10 * 60 * 1000;

  if (Number.isNaN(scheduledTime)) {
    return false;
  }

  const difference = scheduledTime - now.getTime();
  return difference >= -tenMinutes && difference <= tenMinutes;
}

function formatHomeDate(value: string) {
  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

function getTimeOfDay() {
  const hour = new Date().getHours();

  if (hour < 12) {
    return 'morning';
  }

  if (hour < 18) {
    return 'afternoon';
  }

  return 'evening';
}

function getInitial(displayName: string, email: string | undefined) {
  return (displayName || email || 'D').trim().charAt(0).toUpperCase();
}

function getHomeLinkAccent(href: string) {
  switch (href) {
    case '/prophetic-vision':
      return { color: '#725620', surface: '#F3E8C7' };
    case '/accountability':
      return { color: '#829480', surface: '#EEF1EC' };
    case '/event-planning':
      return { color: '#768277', surface: '#EEF1EC' };
    case '/danger-zone-planning':
      return { color: '#A33D32', surface: '#FFF8F7' };
    case '/reminders':
      return { color: '#2E4737', surface: '#FFF8F7' };
    default:
      return { color: '#2E4737', surface: '#EEF1EC' };
  }
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function HeroContent({
  avatarFailed,
  avatarUrl,
  email,
  name,
  onAvatarFailed,
}: {
  avatarFailed: boolean;
  avatarUrl: string;
  email: string | undefined;
  name: string;
  onAvatarFailed: () => void;
}) {
  return (
    <>
      <View style={styles.heroTopRow}>
        <View style={styles.heroIconBadge}>
          <MaterialIcons color="#FFFFFF" name="eco" size={24} />
        </View>
        <View style={styles.avatarFrame}>
          {avatarUrl && !avatarFailed ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImage} onError={onAvatarFailed} />
          ) : (
            <Text style={styles.avatarInitial}>{getInitial(name, email)}</Text>
          )}
        </View>
      </View>
      <Text style={styles.heroTitle}>Stay prepared. Stay connected.</Text>
      <Text style={styles.heroSubtitle}>Your plan. Your people. Your path.</Text>
    </>
  );
}

function ImportantInfoBlock({ items, marker, title }: { items: string[]; marker: string; title: string }) {
  return (
    <View style={styles.infoBlock}>
      <View style={styles.infoBlockHeader}>
        <View style={styles.infoMarker}>
          <Text style={styles.infoMarkerText}>{marker}</Text>
        </View>
        <Text style={styles.infoBlockTitle}>{title}</Text>
      </View>
      {items.map((item) => (
        <View key={item} style={styles.infoBulletRow}>
          <View style={styles.infoBullet} />
          <Text style={styles.infoBulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function getConfiguredUrl(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
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
  brandHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'center',
    paddingTop: 4,
  },
  brandLogo: {
    height: 54,
    resizeMode: 'contain',
    width: 54,
  },
  brandCopy: {
    gap: 0,
  },
  brandName: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 38,
    fontWeight: '900',
    lineHeight: 42,
  },
  brandTagline: {
    color: '#829480',
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
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
    fontSize: type.screenTitle,
    fontWeight: '800',
    lineHeight: 40,
  },
  copy: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 16,
    lineHeight: 24,
  },
  importantLogo: {
    alignSelf: 'center',
    height: 108,
    resizeMode: 'contain',
    width: 108,
  },
  warningPanel: {
    backgroundColor: '#FFF8E8',
    borderColor: '#E0A52B',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  warningTitle: {
    color: '#6F3517',
    fontFamily: 'Manrope',
    fontSize: 18,
    fontWeight: '900',
  },
  warningText: {
    color: '#6F3517',
    fontFamily: 'Manrope',
    fontSize: 15,
    lineHeight: 22,
  },
  infoBlock: {
    gap: 12,
  },
  infoBlockHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  infoMarker: {
    alignItems: 'center',
    backgroundColor: '#2E4737',
    borderRadius: 13,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  infoMarkerText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '900',
  },
  infoBlockTitle: {
    color: '#171717',
    flex: 1,
    fontFamily: 'Manrope',
    fontSize: 18,
    fontWeight: '900',
  },
  infoBulletRow: {
    flexDirection: 'row',
    gap: 10,
  },
  infoBullet: {
    backgroundColor: '#2E4737',
    borderRadius: 4,
    height: 8,
    marginTop: 7,
    width: 8,
  },
  infoBulletText: {
    color: '#777777',
    flex: 1,
    fontFamily: 'Manrope',
    fontSize: 15,
    lineHeight: 22,
  },
  responsibilityPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  responsibilityTitle: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 18,
    fontWeight: '900',
  },
  responsibilityText: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 15,
    lineHeight: 22,
  },
  loginLogo: {
    alignSelf: 'center',
    height: 132,
    marginBottom: -4,
    resizeMode: 'contain',
    width: 132,
  },
  dashboardHero: {
    backgroundColor: '#EEF1EC',
    borderRadius: 8,
    gap: 16,
    minHeight: 224,
    overflow: 'hidden',
    padding: 22,
  },
  dashboardHeroImage: {
    borderRadius: 8,
  },
  dashboardHeroOverlay: {
    backgroundColor: 'rgba(255, 255, 255, 0.46)',
    flex: 1,
    gap: 16,
    margin: -22,
    padding: 22,
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'space-between',
  },
  heroIconBadge: {
    alignItems: 'center',
    backgroundColor: '#829480',
    borderRadius: 26,
    height: 52,
    justifyContent: 'center',
    width: 52,
  },
  avatarFrame: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DCD4C4',
    borderRadius: 24,
    borderWidth: 1,
    height: 48,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 48,
  },
  avatarImage: {
    height: 48,
    width: 48,
  },
  avatarInitial: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 19,
    fontWeight: '900',
  },
  heroCopy: {
    flex: 1,
    gap: 3,
  },
  heroEyebrow: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  heroMeta: {
    color: '#2F3E39',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '700',
  },
  heroTitle: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 30,
    fontWeight: '900',
    lineHeight: 36,
    maxWidth: 280,
  },
  heroSubtitle: {
    color: '#2F3E39',
    fontFamily: 'Manrope',
    fontSize: 16,
    lineHeight: 23,
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
  },
  authPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  homeGrid: {
    gap: 12,
  },
  homeSection: {
    gap: 10,
  },
  greetingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
    justifyContent: 'space-between',
  },
  greetingCopy: {
    flex: 1,
    gap: 3,
  },
  greetingText: {
    color: colors.ink,
    fontFamily: 'Manrope',
    fontSize: 20,
    fontWeight: '900',
  },
  greetingSubtext: {
    color: colors.muted,
    fontFamily: 'Manrope',
    fontSize: type.supporting,
    lineHeight: 18,
  },
  sectionEyebrow: {
    color: colors.primary,
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  sectionHeading: {
    color: colors.ink,
    fontFamily: 'Manrope',
    fontSize: 20,
    fontWeight: '900',
  },
  sectionTitle: {
    color: colors.ink,
    fontFamily: 'Manrope',
    fontSize: type.sectionTitle,
    fontWeight: '900',
  },
  sectionCopy: {
    color: colors.muted,
    fontFamily: 'Manrope',
    fontSize: type.body,
    lineHeight: 21,
  },
  todayPanel: {
    backgroundColor: colors.primarySoft,
    borderColor: '#BFD1C8',
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  primaryAction: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: 10,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
    marginTop: 4,
    paddingHorizontal: 16,
  },
  checkInWindowAction: {
    backgroundColor: '#A33D32',
  },
  primaryActionText: {
    color: colors.white,
    fontFamily: 'Manrope',
    fontSize: type.button,
    fontWeight: '900',
  },
  completeCheckInAction: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.primary,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 16,
  },
  completeCheckInActionText: {
    color: colors.primary,
    fontFamily: 'Manrope',
    fontSize: type.button,
    fontWeight: '900',
  },
  disabledCompleteCheckInActionText: {
    color: colors.muted,
  },
  disabledAction: {
    opacity: 0.6,
  },
  homeMessage: {
    color: colors.primary,
    fontFamily: 'Manrope',
    fontSize: type.supporting,
    fontWeight: '700',
    lineHeight: 18,
  },
  checkInStatusRow: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    minHeight: 42,
    paddingHorizontal: 10,
  },
  checkInWindowStatusRow: {
    backgroundColor: '#FFF1EF',
    borderColor: '#E7BDB7',
    borderWidth: 1,
  },
  statusDot: {
    borderRadius: 5,
    height: 10,
    width: 10,
  },
  statusDotComplete: {
    backgroundColor: colors.support,
  },
  statusDotPending: {
    backgroundColor: colors.warning,
  },
  checkInWindowDot: {
    backgroundColor: '#A33D32',
  },
  checkInStatusText: {
    color: colors.ink,
    flex: 1,
    fontFamily: 'Manrope',
    fontSize: type.supporting,
    fontWeight: '800',
  },
  upcomingRow: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.74)',
    borderRadius: 8,
    flexDirection: 'row',
    gap: 8,
    minHeight: 48,
    paddingHorizontal: 10,
  },
  selectableReminderRow: {
    borderColor: 'transparent',
    borderWidth: 1,
  },
  selectedReminderRow: {
    backgroundColor: '#E4EEE8',
    borderColor: colors.primary,
  },
  reminderList: {
    gap: 6,
  },
  reminderListLabel: {
    color: colors.quiet,
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  upcomingCopy: {
    flex: 1,
    gap: 2,
  },
  upcomingLabel: {
    color: colors.quiet,
    fontFamily: 'Manrope',
    fontSize: 12,
    fontWeight: '800',
  },
  upcomingValue: {
    color: colors.ink,
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '900',
  },
  supportRow: {
    flexDirection: 'row',
    gap: 10,
  },
  supportCard: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 10,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 74,
    padding: 12,
  },
  supportCardCopy: {
    flex: 1,
    gap: 2,
  },
  supportCardTitle: {
    color: colors.ink,
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '900',
  },
  supportCardText: {
    color: colors.muted,
    fontFamily: 'Manrope',
    fontSize: 12,
    lineHeight: 16,
  },
  moreToolsPanel: {
    gap: 10,
  },
  moreToolsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  moreTool: {
    alignItems: 'center',
    backgroundColor: colors.white,
    borderColor: colors.border,
    borderRadius: 9,
    borderWidth: 1,
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    gap: 8,
    minHeight: 44,
    paddingHorizontal: 10,
  },
  moreToolText: {
    color: colors.ink,
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '800',
  },
  homeLink: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E3DCCA',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 14,
    minHeight: 90,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  homeLinkIcon: {
    alignItems: 'center',
    backgroundColor: '#EEF3E9',
    borderRadius: 8,
    height: 56,
    justifyContent: 'center',
    width: 56,
  },
  homeLinkCopy: {
    flex: 1,
    gap: 4,
  },
  homeLinkTitle: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '900',
  },
  homeLinkTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  notificationBadge: {
    alignItems: 'center',
    backgroundColor: '#A33D32',
    borderRadius: 14,
    justifyContent: 'center',
    minHeight: 28,
    minWidth: 28,
    paddingHorizontal: 8,
  },
  notificationBadgeText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '900',
  },
  homeLinkDescription: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 15,
    lineHeight: 21,
  },
  homeLinkArrow: {
    fontFamily: 'Manrope',
    fontSize: 26,
    fontWeight: '800',
  },
  loadingPanel: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#E7E6E2',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 16,
  },
  loadingText: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '600',
  },
  formHeader: {
    gap: 4,
  },
  formTitle: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 18,
    fontWeight: '800',
  },
  formCopy: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 14,
    lineHeight: 20,
  },
  modeControl: {
    backgroundColor: '#E7E6E2',
    borderRadius: 8,
    flexDirection: 'row',
    padding: 4,
  },
  modeButton: {
    alignItems: 'center',
    borderRadius: 6,
    flex: 1,
    minHeight: 38,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  activeModeButton: {
    backgroundColor: '#FFFFFF',
  },
  modeButtonText: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '800',
  },
  activeModeButtonText: {
    color: '#171717',
  },
  fieldGroup: {
    gap: 6,
  },
  inputLabel: {
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '700',
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
  row: {
    borderBottomColor: '#E7E6E2',
    borderBottomWidth: 1,
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: {
    color: '#768277',
    fontFamily: 'Manrope',
    fontSize: 13,
    fontWeight: '600',
  },
  rowValue: {
    color: '#171717',
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '700',
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#2E4737',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 18,
  },
  disabledButton: {
    opacity: 0.64,
  },
  buttonText: {
    color: '#FFFFFF',
    fontFamily: 'Manrope',
    fontSize: 16,
    fontWeight: '800',
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
    fontWeight: '800',
  },
  textButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  textButtonLabel: {
    color: '#2E4737',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '800',
  },
  message: {
    color: '#777777',
    fontFamily: 'Manrope',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
});
