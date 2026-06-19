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
import * as Linking from 'expo-linking';
import { Link } from 'expo-router';
import type { Session } from '@supabase/supabase-js';

import { registerForPushNotificationsAsync } from '../src/lib/notifications';
import { isSupabaseConfigured, supabase } from '../src/lib/supabase';

type AuthMode = 'sign-in' | 'sign-up' | 'forgot-password';

const homeLinks = [
  {
    description: 'Goals, triggers, coping actions, and support resources.',
    href: '/recovery-plan',
    label: 'Recovery plan',
  },
  {
    description: 'Short and long vision, audio reading, and AI rewrite.',
    href: '/prophetic-vision',
    label: 'Profetic Vision',
  },
  {
    description: 'Guided reflection and structured support prompts.',
    href: '/ai-support',
    label: 'AI support',
  },
  {
    description: 'Partners, check-ins, and shared commitments.',
    href: '/accountability',
    label: 'Accountability',
  },
  {
    description: 'Notification schedules and recovery prompts.',
    href: '/reminders',
    label: 'Reminders',
  },
  {
    description: 'Preferred name, phone number, and account settings.',
    href: '/profile',
    label: 'Profile',
  },
] as const;

export default function HomeScreen() {
  const [authMode, setAuthMode] = useState<AuthMode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [preferredName, setPreferredName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionLoading, setSessionLoading] = useState(true);
  const [pushStatus, setPushStatus] = useState('Not requested');
  const configured = useMemo(() => isSupabaseConfigured(), []);
  const preferredNameFromSession = getPreferredName(session);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) {
        return;
      }

      setSession(data.session);
      setSessionLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setSessionLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

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

    const resetRedirectUrl =
      process.env.EXPO_PUBLIC_PASSWORD_RESET_URL ?? Linking.createURL('/reset-password');

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

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.keyboardArea}>
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>Dallas</Text>
        <Text style={styles.title}>
          {session ? `Welcome${preferredNameFromSession ? `, ${preferredNameFromSession}` : ''}` : 'Start with secure access'}
        </Text>
        <Text style={styles.copy}>
          {session
            ? 'Choose what you want to work on today.'
            : 'Sign in to prepare your recovery plan, reminders, and accountability support.'}
        </Text>

        {sessionLoading ? (
          <View style={styles.loadingPanel}>
            <ActivityIndicator color="#38635D" />
            <Text style={styles.loadingText}>Checking session...</Text>
          </View>
        ) : session ? (
          <View style={styles.homePanel}>
            {homeLinks.map((item) => (
              <Link key={item.href} href={item.href} asChild>
                <Pressable style={styles.homeLink}>
                  <View style={styles.homeLinkCopy}>
                    <Text style={styles.homeLinkTitle}>{item.label}</Text>
                    <Text style={styles.homeLinkDescription}>{item.description}</Text>
                  </View>
                  <Text style={styles.homeLinkArrow}>{'>'}</Text>
                </Pressable>
              </Link>
            ))}
            <StatusRow label="Signed in as" value={session.user.email ?? 'Unknown user'} />
            <Pressable
              disabled={authLoading}
              style={[styles.secondaryButton, authLoading && styles.disabledButton]}
              onPress={handleSignOut}
            >
              <Text style={styles.secondaryButtonText}>
                {authLoading ? 'Signing out...' : 'Sign out'}
              </Text>
            </Pressable>
          </View>
        ) : (
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
        )}

        {authMessage ? <Text style={styles.message}>{authMessage}</Text> : null}

        <View style={styles.panel}>
          <StatusRow label="Supabase config" value={configured ? 'Ready' : 'Missing .env values'} />
          <StatusRow label="App environment" value={process.env.EXPO_PUBLIC_APP_ENV ?? 'development'} />
          <StatusRow label="Notifications" value={pushStatus} />
        </View>

        <Pressable style={styles.button} onPress={handleNotificationCheck}>
          <Text style={styles.buttonText}>Check notifications</Text>
        </Pressable>
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

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
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
    justifyContent: 'center',
    minHeight: '100%',
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
    fontWeight: '800',
    lineHeight: 40,
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
  homePanel: {
    backgroundColor: '#FFFFFF',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
  },
  homeLink: {
    alignItems: 'center',
    borderBottomColor: '#ECE5D8',
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 12,
    minHeight: 76,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  homeLinkCopy: {
    flex: 1,
    gap: 3,
  },
  homeLinkTitle: {
    color: '#17211F',
    fontSize: 16,
    fontWeight: '800',
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
