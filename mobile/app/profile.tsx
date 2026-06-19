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
import * as SecureStore from 'expo-secure-store';
import { Link } from 'expo-router';
import type { Session } from '@supabase/supabase-js';

import { supabase } from '../src/lib/supabase';

const openAiApiKeyStorageKey = 'dallas.openai_api_key';

type ProfileRow = {
  avatar_path: string | null;
  display_name: string | null;
  phone_number: string | null;
};

export default function ProfileScreen() {
  const [avatarUrl, setAvatarUrl] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [openAiKeySaved, setOpenAiKeySaved] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [savingOpenAiKey, setSavingOpenAiKey] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  const signedUpAt = useMemo(() => formatDate(session?.user.created_at), [session]);

  useEffect(() => {
    let mounted = true;

    async function loadProfile() {
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

      const metadata = nextSession.user.user_metadata;
      const savedOpenAiApiKey = await SecureStore.getItemAsync(openAiApiKeyStorageKey);

      if (!mounted) {
        return;
      }

      setOpenAiKeySaved(Boolean(savedOpenAiApiKey));
      setDisplayName(getMetadataValue(metadata.preferred_name));
      setPhoneNumber(getMetadataValue(metadata.phone_number));
      setAvatarUrl(getMetadataValue(metadata.avatar_url));
      setImageFailed(false);

      const { data, error } = await supabase
        .from('profiles')
        .select('avatar_path, display_name, phone_number')
        .eq('id', nextSession.user.id)
        .maybeSingle<ProfileRow>();

      if (!mounted) {
        return;
      }

      if (error) {
        setMessage(error.message);
      }

      if (data) {
        setDisplayName(data.display_name ?? getMetadataValue(metadata.preferred_name));
        setPhoneNumber(data.phone_number ?? getMetadataValue(metadata.phone_number));

        if (data.avatar_path) {
          setAvatarUrl(getPublicAvatarUrl(data.avatar_path));
          setImageFailed(false);
        }
      }

      setLoading(false);
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, []);

  async function handleSaveProfile() {
    if (!session) {
      setMessage('Sign in before editing your profile.');
      return;
    }

    const trimmedDisplayName = displayName.trim();
    const trimmedPhoneNumber = phoneNumber.trim();

    if (!trimmedDisplayName) {
      setMessage('Enter your preferred name.');
      return;
    }

    if (!isInternationalPhoneNumber(trimmedPhoneNumber)) {
      setMessage('Enter your phone number in international format, like +14155552671.');
      return;
    }

    setSavingProfile(true);
    setMessage('');

    const { error: authError } = await supabase.auth.updateUser({
      data: {
        phone_number: trimmedPhoneNumber,
        preferred_name: trimmedDisplayName,
      },
    });

    if (authError) {
      setSavingProfile(false);
      setMessage(authError.message);
      return;
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      display_name: trimmedDisplayName,
      id: session.user.id,
      phone_number: trimmedPhoneNumber,
      updated_at: new Date().toISOString(),
    });

    setSavingProfile(false);

    if (profileError) {
      setMessage(profileError.message);
      return;
    }

    setMessage('Profile updated.');
  }

  async function handleAvatarUpload() {
    if (!session) {
      setMessage('Sign in before uploading an avatar.');
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
    const avatarPath = `${session.user.id}/avatar.${extension}`;

    setAvatarUrl(asset.uri);
    setImageFailed(false);
    setSavingAvatar(true);
    setMessage('');

    const response = await fetch(asset.uri);
    const imageData = await response.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(avatarPath, imageData, {
        cacheControl: '0',
        contentType,
        upsert: true,
      });

    if (uploadError) {
      setSavingAvatar(false);
      setMessage(uploadError.message);
      return;
    }

    const publicAvatarUrl = getPublicAvatarUrl(avatarPath, Date.now());

    const { error: authError } = await supabase.auth.updateUser({
      data: {
        avatar_path: avatarPath,
        avatar_url: publicAvatarUrl,
      },
    });

    if (authError) {
      setSavingAvatar(false);
      setMessage(authError.message);
      return;
    }

    const { error: profileError } = await supabase.from('profiles').upsert({
      avatar_path: avatarPath,
      display_name: displayName.trim() || null,
      id: session.user.id,
      phone_number: phoneNumber.trim() || null,
      updated_at: new Date().toISOString(),
    });

    setSavingAvatar(false);

    if (profileError) {
      setMessage(profileError.message);
      return;
    }

    setAvatarUrl(publicAvatarUrl);
    setImageFailed(false);
    setMessage('Avatar updated.');
  }

  async function handleChangePassword() {
    if (!session) {
      setMessage('Sign in before changing your password.');
      return;
    }

    if (newPassword.length < 6) {
      setMessage('Enter a new password with at least 6 characters.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setMessage('Passwords do not match.');
      return;
    }

    setSavingPassword(true);
    setMessage('');

    const { error } = await supabase.auth.updateUser({ password: newPassword });

    setSavingPassword(false);

    if (error) {
      setMessage(error.message);
      return;
    }

    setNewPassword('');
    setConfirmPassword('');
    setMessage('Password updated.');
  }

  async function handleSaveOpenAiKey() {
    const trimmedKey = openAiApiKey.trim();

    if (!trimmedKey.startsWith('sk-')) {
      setMessage('Enter a valid OpenAI API key that starts with sk-.');
      return;
    }

    setSavingOpenAiKey(true);
    setMessage('');

    await SecureStore.setItemAsync(openAiApiKeyStorageKey, trimmedKey);

    setSavingOpenAiKey(false);
    setOpenAiApiKey('');
    setOpenAiKeySaved(true);
    setMessage('OpenAI API key saved on this device.');
  }

  async function handleClearOpenAiKey() {
    setSavingOpenAiKey(true);
    setMessage('');

    await SecureStore.deleteItemAsync(openAiApiKeyStorageKey);

    setSavingOpenAiKey(false);
    setOpenAiApiKey('');
    setOpenAiKeySaved(false);
    setMessage('OpenAI API key removed from this device.');
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centerPanel}>
          <ActivityIndicator color="#38635D" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.container}>
          <Text style={styles.eyebrow}>Profile</Text>
          <Text style={styles.title}>Sign in required</Text>
          <Text style={styles.copy}>Your profile is available after signing in.</Text>
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
          <Text style={styles.eyebrow}>Profile</Text>
          <Text style={styles.title}>Member details</Text>
          <Text style={styles.copy}>Manage your account details, profile image, and password.</Text>

          <View style={styles.panel}>
            <View style={styles.avatarRow}>
              <View style={styles.avatarFrame}>
                {avatarUrl && !imageFailed ? (
                  <Image
                    source={{ uri: avatarUrl }}
                    style={styles.avatarImage}
                    onError={() => {
                      setImageFailed(true);
                      setMessage('Avatar uploaded, but the image URL could not be displayed. Check that the avatars storage bucket is public and the migration has been applied.');
                    }}
                  />
                ) : (
                  <Text style={styles.avatarInitial}>{getInitial(displayName, session.user.email)}</Text>
                )}
              </View>
              <View style={styles.avatarCopy}>
                <Text style={styles.panelTitle}>Profile image</Text>
                <Text style={styles.mutedText}>Upload a square avatar for your member profile.</Text>
              </View>
            </View>
            <Pressable
              disabled={savingAvatar}
              style={[styles.secondaryButton, savingAvatar && styles.disabledButton]}
              onPress={handleAvatarUpload}
            >
              <Text style={styles.secondaryButtonText}>
                {savingAvatar ? 'Uploading...' : 'Upload avatar'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Account</Text>
            <InfoRow label="Email" value={session.user.email ?? 'Unknown'} />
            <InfoRow label="First signed up" value={signedUpAt} />

            <View style={styles.fieldGroup}>
              <Text style={styles.inputLabel}>Preferred name</Text>
              <TextInput
                autoCapitalize="words"
                autoComplete="name"
                onChangeText={setDisplayName}
                placeholder="What should we call you?"
                placeholderTextColor="#8A948F"
                style={styles.input}
                textContentType="givenName"
                value={displayName}
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

            <Pressable
              disabled={savingProfile}
              style={[styles.button, savingProfile && styles.disabledButton]}
              onPress={handleSaveProfile}
            >
              <Text style={styles.buttonText}>
                {savingProfile ? 'Saving...' : 'Save profile'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>Change password</Text>
            <View style={styles.fieldGroup}>
              <Text style={styles.inputLabel}>New password</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="new-password"
                onChangeText={setNewPassword}
                placeholder="At least 6 characters"
                placeholderTextColor="#8A948F"
                secureTextEntry
                style={styles.input}
                textContentType="newPassword"
                value={newPassword}
              />
            </View>

            <View style={styles.fieldGroup}>
              <Text style={styles.inputLabel}>Confirm password</Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="new-password"
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
              disabled={savingPassword}
              style={[styles.button, savingPassword && styles.disabledButton]}
              onPress={handleChangePassword}
            >
              <Text style={styles.buttonText}>
                {savingPassword ? 'Updating...' : 'Update password'}
              </Text>
            </Pressable>
          </View>

          <View style={styles.panel}>
            <Text style={styles.panelTitle}>AI settings</Text>
            <Text style={styles.mutedText}>
              Add your OpenAI API key for AI features that run from this app. The key is stored only on this device.
            </Text>
            <InfoRow label="OpenAI API key" value={openAiKeySaved ? 'Saved on this device' : 'Not saved'} />

            <View style={styles.fieldGroup}>
              <Text style={styles.inputLabel}>OpenAI API key</Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setOpenAiApiKey}
                placeholder="sk-..."
                placeholderTextColor="#8A948F"
                secureTextEntry
                style={styles.input}
                value={openAiApiKey}
              />
            </View>

            <Pressable
              disabled={savingOpenAiKey}
              style={[styles.button, savingOpenAiKey && styles.disabledButton]}
              onPress={handleSaveOpenAiKey}
            >
              <Text style={styles.buttonText}>
                {savingOpenAiKey ? 'Saving...' : openAiKeySaved ? 'Replace API key' : 'Save API key'}
              </Text>
            </Pressable>

            {openAiKeySaved ? (
              <Pressable
                disabled={savingOpenAiKey}
                style={[styles.secondaryButton, savingOpenAiKey && styles.disabledButton]}
                onPress={handleClearOpenAiKey}
              >
                <Text style={styles.secondaryButtonText}>Remove API key</Text>
              </Pressable>
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

function formatDate(value: string | undefined) {
  if (!value) {
    return 'Unknown';
  }

  return new Intl.DateTimeFormat(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
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

function getInitial(displayName: string, email: string | undefined) {
  return (displayName || email || 'D').trim().charAt(0).toUpperCase();
}

function getMetadataValue(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function getPublicAvatarUrl(path: string, cacheKey?: number) {
  const publicUrl = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl;

  return cacheKey ? `${publicUrl}?v=${cacheKey}` : publicUrl;
}

function isInternationalPhoneNumber(value: string) {
  return /^\+[1-9]\d{7,14}$/.test(value);
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
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
  panelTitle: {
    color: '#17211F',
    fontSize: 16,
    fontWeight: '800',
  },
  avatarRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 14,
  },
  avatarFrame: {
    alignItems: 'center',
    backgroundColor: '#ECE5D8',
    borderColor: '#DED7C9',
    borderRadius: 36,
    borderWidth: 1,
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
    fontWeight: '800',
  },
  avatarCopy: {
    flex: 1,
    gap: 4,
  },
  mutedText: {
    color: '#4F5D58',
    fontSize: 14,
    lineHeight: 20,
  },
  infoRow: {
    borderBottomColor: '#ECE5D8',
    borderBottomWidth: 1,
    gap: 4,
    paddingBottom: 12,
  },
  infoLabel: {
    color: '#697570',
    fontSize: 13,
    fontWeight: '700',
  },
  infoValue: {
    color: '#17211F',
    fontSize: 16,
    fontWeight: '800',
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
  disabledButton: {
    opacity: 0.64,
  },
  loadingText: {
    color: '#4F5D58',
    fontSize: 14,
    fontWeight: '600',
  },
  message: {
    color: '#4F5D58',
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
  },
});
