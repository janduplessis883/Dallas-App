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
import { Link, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';

import { deviceStorage } from '../src/lib/deviceStorage';
import { registerForPushNotificationsAsync } from '../src/lib/notifications';
import { isSupabaseConfigured, supabase } from '../src/lib/supabase';

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

const homeLinks = [
  {
    description: 'Goals, triggers, coping actions, and support resources.',
    href: '/recovery-plan',
    icon: 'flag',
    label: 'Recovery plan',
  },
  {
    description: 'Short and long vision, audio reading, and AI rewrite.',
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
    label: 'Accountability',
  },
  {
    description: 'Prepare before, stay anchored during, and debrief after events.',
    href: '/event-planning',
    icon: 'event-note',
    label: 'Event planning',
  },
  {
    description: 'Notification schedules and recovery prompts.',
    href: '/reminders',
    icon: 'notifications',
    label: 'Reminders',
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
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [pushStatus, setPushStatus] = useState('Not requested');
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const preferredNameFromSession = profile?.display_name ?? getPreferredName(session);
  const avatarUrl = profile?.avatar_path ? getPublicAvatarUrl(profile.avatar_path) : getAvatarUrl(session);
  const homeCoverUrl = profile?.home_cover_image_path
    ? getPublicHomeCoverUrl(profile.home_cover_image_path)
    : '';

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
          setAvatarFailed(false);
          setProfile(null);
          return;
        }

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
    setPushStatus('Requesting permission...');

    try {
      const token = await registerForPushNotificationsAsync();
      setPushStatus(token ? 'Push notifications ready' : 'Permission not granted');
    } catch (error) {
      setPushStatus(error instanceof Error ? error.message : 'Notification setup failed');
    }
  }

  if (importantInfoLoading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.loadingPanel}>
          <ActivityIndicator color="#38635D" />
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
              'Organising recovery plans, event plans, reminders, and personal commitments.',
              'Capturing reflective writing, prophetic vision notes, audio, and accountability check-ins.',
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
            <ActivityIndicator color="#38635D" />
            <Text style={styles.loadingText}>Checking session...</Text>
          </View>
        ) : session ? (
          <>
            {homeCoverUrl ? (
              <ImageBackground
                source={{ uri: homeCoverUrl }}
                style={styles.dashboardHero}
                imageStyle={styles.dashboardHeroImage}
              >
                <View style={styles.dashboardHeroOverlay}>
                  <View style={styles.heroTopRow}>
                    <View style={styles.avatarFrame}>
                      {avatarUrl && !avatarFailed ? (
                        <Image
                          source={{ uri: avatarUrl }}
                          style={styles.avatarImage}
                          onError={() => setAvatarFailed(true)}
                        />
                      ) : (
                        <Text style={styles.avatarInitial}>
                          {getInitial(preferredNameFromSession, session.user.email)}
                        </Text>
                      )}
                    </View>
                    <View style={styles.heroCopy}>
                      <Text style={styles.heroEyebrow}>Dallas</Text>
                      <Text style={styles.heroMeta}>{session.user.email ?? 'Signed in'}</Text>
                    </View>
                  </View>
                  <Text style={styles.heroTitle}>
                    {preferredNameFromSession ? `Welcome, ${preferredNameFromSession}` : 'Welcome'}
                  </Text>
                  <Text style={styles.heroSubtitle}>Choose a recovery practice for today.</Text>
                </View>
              </ImageBackground>
            ) : (
              <View style={styles.dashboardHero}>
                <View style={styles.heroTopRow}>
                  <View style={styles.avatarFrame}>
                    {avatarUrl && !avatarFailed ? (
                      <Image
                        source={{ uri: avatarUrl }}
                        style={styles.avatarImage}
                        onError={() => setAvatarFailed(true)}
                      />
                    ) : (
                      <Text style={styles.avatarInitial}>
                        {getInitial(preferredNameFromSession, session.user.email)}
                      </Text>
                    )}
                  </View>
                  <View style={styles.heroCopy}>
                    <Text style={styles.heroEyebrow}>Dallas</Text>
                    <Text style={styles.heroMeta}>{session.user.email ?? 'Signed in'}</Text>
                  </View>
                </View>
                <Text style={styles.heroTitle}>
                  {preferredNameFromSession ? `Welcome, ${preferredNameFromSession}` : 'Welcome'}
                </Text>
                <Text style={styles.heroSubtitle}>Choose a recovery practice for today.</Text>
              </View>
            )}

            <View style={styles.homeGrid}>
              {homeLinks.map((item) => (
                <Link key={item.href} href={item.href} asChild>
                  <Pressable style={styles.homeLink}>
                    <View style={styles.homeLinkIcon}>
                      <MaterialIcons color="#38635D" name={item.icon} size={21} />
                    </View>
                    <View style={styles.homeLinkCopy}>
                      <Text style={styles.homeLinkTitle}>{item.label}</Text>
                      <Text style={styles.homeLinkDescription}>{item.description}</Text>
                    </View>
                    <Text style={styles.homeLinkArrow}>{'>'}</Text>
                  </Pressable>
                </Link>
              ))}
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
                    placeholderTextColor="#8A948F"
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
                    placeholderTextColor="#8A948F"
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
                placeholderTextColor="#8A948F"
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
                  placeholderTextColor="#8A948F"
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

function getInitial(displayName: string, email: string | undefined) {
  return (displayName || email || 'D').trim().charAt(0).toUpperCase();
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
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
    fontWeight: '800',
    lineHeight: 40,
  },
  copy: {
    color: '#4F5D58',
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
    fontSize: 18,
    fontWeight: '900',
  },
  warningText: {
    color: '#6F3517',
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
    backgroundColor: '#38635D',
    borderRadius: 13,
    height: 26,
    justifyContent: 'center',
    width: 26,
  },
  infoMarkerText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
  },
  infoBlockTitle: {
    color: '#17211F',
    flex: 1,
    fontSize: 18,
    fontWeight: '900',
  },
  infoBulletRow: {
    flexDirection: 'row',
    gap: 10,
  },
  infoBullet: {
    backgroundColor: '#38635D',
    borderRadius: 4,
    height: 8,
    marginTop: 7,
    width: 8,
  },
  infoBulletText: {
    color: '#4F5D58',
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
  },
  responsibilityPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 16,
  },
  responsibilityTitle: {
    color: '#17211F',
    fontSize: 18,
    fontWeight: '900',
  },
  responsibilityText: {
    color: '#4F5D58',
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
    backgroundColor: '#17211F',
    borderRadius: 8,
    gap: 16,
    minHeight: 230,
    overflow: 'hidden',
    padding: 20,
  },
  dashboardHeroImage: {
    borderRadius: 8,
  },
  dashboardHeroOverlay: {
    backgroundColor: 'rgba(18, 31, 28, 0.66)',
    flex: 1,
    gap: 16,
    margin: -20,
    padding: 20,
  },
  heroTopRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  avatarFrame: {
    alignItems: 'center',
    backgroundColor: '#F7F3EA',
    borderRadius: 28,
    height: 56,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 56,
  },
  avatarImage: {
    height: 56,
    width: 56,
  },
  avatarInitial: {
    color: '#38635D',
    fontSize: 22,
    fontWeight: '900',
  },
  heroCopy: {
    flex: 1,
    gap: 3,
  },
  heroEyebrow: {
    color: '#BFD1CA',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0,
    textTransform: 'uppercase',
  },
  heroMeta: {
    color: '#E5EDE7',
    fontSize: 13,
    fontWeight: '700',
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 34,
    fontWeight: '900',
    lineHeight: 39,
  },
  heroSubtitle: {
    color: '#F7F3EA',
    fontSize: 16,
    lineHeight: 23,
  },
  panel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 10,
  },
  authPanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    gap: 14,
    padding: 16,
  },
  homeGrid: {
    gap: 10,
  },
  homeLink: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 82,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  homeLinkIcon: {
    alignItems: 'center',
    backgroundColor: '#ECE5D8',
    borderRadius: 18,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
  homeLinkCopy: {
    flex: 1,
    gap: 4,
  },
  homeLinkTitle: {
    color: '#17211F',
    fontSize: 16,
    fontWeight: '900',
  },
  homeLinkDescription: {
    color: '#4F5D58',
    fontSize: 13,
    lineHeight: 18,
  },
  homeLinkArrow: {
    color: '#38635D',
    fontSize: 20,
    fontWeight: '800',
  },
  loadingPanel: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    padding: 16,
  },
  loadingText: {
    color: '#4F5D58',
    fontSize: 14,
    fontWeight: '600',
  },
  formHeader: {
    gap: 4,
  },
  formTitle: {
    color: '#17211F',
    fontSize: 18,
    fontWeight: '800',
  },
  formCopy: {
    color: '#4F5D58',
    fontSize: 14,
    lineHeight: 20,
  },
  modeControl: {
    backgroundColor: '#ECE5D8',
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
    color: '#4F5D58',
    fontSize: 14,
    fontWeight: '800',
  },
  activeModeButtonText: {
    color: '#17211F',
  },
  fieldGroup: {
    gap: 6,
  },
  inputLabel: {
    color: '#697570',
    fontSize: 13,
    fontWeight: '700',
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
  row: {
    borderBottomColor: '#ECE5D8',
    borderBottomWidth: 1,
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowLabel: {
    color: '#697570',
    fontSize: 13,
    fontWeight: '600',
  },
  rowValue: {
    color: '#17211F',
    fontSize: 16,
    fontWeight: '700',
  },
  button: {
    alignItems: 'center',
    backgroundColor: '#38635D',
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
    fontSize: 16,
    fontWeight: '800',
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
    fontWeight: '800',
  },
  textButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
  },
  textButtonLabel: {
    color: '#38635D',
    fontSize: 14,
    fontWeight: '800',
  },
  message: {
    color: '#4F5D58',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
});
