import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Linking from 'expo-linking';
import { Link } from 'expo-router';

import { supabase } from '../src/lib/supabase';

export default function ResetPasswordScreen() {
  const [confirmPassword, setConfirmPassword] = useState('');
  const [initializing, setInitializing] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryReady, setRecoveryReady] = useState(false);

  useEffect(() => {
    async function prepareRecoverySession(url: string | null) {
      const params = getUrlParams(url);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const type = params.get('type');

      if (accessToken && refreshToken && type === 'recovery') {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          setMessage(error.message);
        } else {
          setRecoveryReady(true);
        }

        setInitializing(false);
        return;
      }

      const { data } = await supabase.auth.getSession();

      setRecoveryReady(Boolean(data.session));
      setMessage(data.session ? '' : 'Open this screen from the password recovery email link.');
      setInitializing(false);
    }

    Linking.getInitialURL().then(prepareRecoverySession);

    const subscription = Linking.addEventListener('url', ({ url }) => {
      setInitializing(true);
      prepareRecoverySession(url);
    });

    return () => {
      subscription.remove();
    };
  }, []);

  async function handleUpdatePassword() {
    if (password.length < 6) {
      setMessage('Enter a new password with at least 6 characters.');
      return;
    }

    if (password !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    setLoading(true);
    setMessage('');

    const { error } = await supabase.auth.updateUser({ password });

    setLoading(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setConfirmPassword('');
    setPassword('');
    setMessage('Password updated. You can now return to sign in.');
  }

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.container}
      >
        <Text style={styles.eyebrow}>Dallas</Text>
        <Text style={styles.title}>Set a new password</Text>
        <Text style={styles.copy}>Choose a secure password to regain access to your account.</Text>

        <View style={styles.panel}>
          {initializing ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#38635D" />
              <Text style={styles.loadingText}>Checking recovery link...</Text>
            </View>
          ) : (
            <>
              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>New password</Text>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="new-password"
                  editable={recoveryReady && !loading}
                  onChangeText={setPassword}
                  placeholder="At least 6 characters"
                  placeholderTextColor="#8A948F"
                  secureTextEntry
                  style={styles.input}
                  textContentType="newPassword"
                  value={password}
                />
              </View>

              <View style={styles.fieldGroup}>
                <Text style={styles.inputLabel}>Confirm password</Text>
                <TextInput
                  autoCapitalize="none"
                  autoComplete="new-password"
                  editable={recoveryReady && !loading}
                  onChangeText={setConfirmPassword}
                  placeholder="Repeat your new password"
                  placeholderTextColor="#8A948F"
                  secureTextEntry
                  style={styles.input}
                  textContentType="newPassword"
                  value={confirmPassword}
                />
              </View>

              <Pressable
                disabled={!recoveryReady || loading}
                style={[styles.button, (!recoveryReady || loading) && styles.disabledButton]}
                onPress={handleUpdatePassword}
              >
                <Text style={styles.buttonText}>
                  {loading ? 'Updating...' : 'Update password'}
                </Text>
              </Pressable>
            </>
          )}
        </View>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Link href="/" asChild>
          <Pressable style={styles.secondaryButton}>
            <Text style={styles.secondaryButtonText}>Back to sign in</Text>
          </Pressable>
        </Link>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function getUrlParams(url: string | null) {
  const params = new URLSearchParams();

  if (!url) {
    return params;
  }

  const queryStart = url.indexOf('?');
  const hashStart = url.indexOf('#');

  if (queryStart >= 0) {
    const queryEnd = hashStart >= 0 ? hashStart : url.length;
    appendParams(params, url.slice(queryStart + 1, queryEnd));
  }

  if (hashStart >= 0) {
    appendParams(params, url.slice(hashStart + 1));
  }

  return params;
}

function appendParams(params: URLSearchParams, value: string) {
  const nextParams = new URLSearchParams(value);

  nextParams.forEach((nextValue, key) => {
    params.set(key, nextValue);
  });
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F3EA',
  },
  container: {
    flex: 1,
    gap: 18,
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
    gap: 14,
    padding: 16,
  },
  loadingRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  loadingText: {
    color: '#4F5D58',
    fontSize: 14,
    fontWeight: '600',
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
  message: {
    color: '#4F5D58',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
});
