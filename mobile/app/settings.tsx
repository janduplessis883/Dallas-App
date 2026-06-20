import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { MaterialIcons } from '@expo/vector-icons';
import { Link, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import { deviceStorage } from '../src/lib/deviceStorage';
import { clearSupabaseLocalSession, isSupabaseConfigured, supabase } from '../src/lib/supabase';

const importantInfoStorageKey = 'dallas.important_info_acknowledged';
const openAiApiKeyStorageKey = 'dallas.openai_api_key';

export default function SettingsScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [openAiApiKey, setOpenAiApiKey] = useState('');
  const [openAiKeySaved, setOpenAiKeySaved] = useState(false);
  const [permissionStatus, setPermissionStatus] = useState('Checking...');
  const [savingOpenAiKey, setSavingOpenAiKey] = useState(false);
  const [scheduledCount, setScheduledCount] = useState(0);
  const [showLegalInfo, setShowLegalInfo] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [testingNotifications, setTestingNotifications] = useState(false);

  const appVersion = useMemo(() => {
    return Constants.expoConfig?.version ?? Constants.nativeAppVersion ?? 'Unknown';
  }, []);
  const appEnvironment = process.env.EXPO_PUBLIC_APP_ENV ?? (__DEV__ ? 'development' : 'production');
  const supabaseHost = getSupabaseHost(process.env.EXPO_PUBLIC_SUPABASE_URL);

  useEffect(() => {
    let mounted = true;

    async function loadSettings() {
      const [savedOpenAiApiKey, permissions, scheduledNotifications] = await Promise.all([
        deviceStorage.getItem(openAiApiKeyStorageKey),
        Notifications.getPermissionsAsync(),
        Notifications.getAllScheduledNotificationsAsync(),
      ]);

      if (!mounted) {
        return;
      }

      setOpenAiKeySaved(Boolean(savedOpenAiApiKey));
      setPermissionStatus(permissions.status);
      setScheduledCount(scheduledNotifications.length);
      setLoading(false);
    }

    loadSettings();

    return () => {
      mounted = false;
    };
  }, []);

  async function refreshNotificationStatus() {
    const permissions = await Notifications.getPermissionsAsync();
    const scheduledNotifications = await Notifications.getAllScheduledNotificationsAsync();

    setPermissionStatus(permissions.status);
    setScheduledCount(scheduledNotifications.length);
  }

  async function handleSaveOpenAiKey() {
    const trimmedKey = openAiApiKey.trim();

    if (!trimmedKey.startsWith('sk-')) {
      setMessage('Enter a valid OpenAI API key that starts with sk-.');
      return;
    }

    setSavingOpenAiKey(true);
    setMessage('');

    await deviceStorage.setItem(openAiApiKeyStorageKey, trimmedKey);

    setSavingOpenAiKey(false);
    setOpenAiApiKey('');
    setOpenAiKeySaved(true);
    setMessage('OpenAI API key saved on this device.');
  }

  async function handleClearOpenAiKey() {
    setSavingOpenAiKey(true);
    setMessage('');

    await deviceStorage.removeItem(openAiApiKeyStorageKey);

    setSavingOpenAiKey(false);
    setOpenAiApiKey('');
    setOpenAiKeySaved(false);
    setMessage('OpenAI API key removed from this device.');
  }

  async function handleSendTestNotification() {
    setTestingNotifications(true);
    setMessage('');

    const permissions = await Notifications.getPermissionsAsync();
    let finalStatus = permissions.status;

    if (finalStatus !== 'granted') {
      const requestedPermissions = await Notifications.requestPermissionsAsync();
      finalStatus = requestedPermissions.status;
    }

    setPermissionStatus(finalStatus);

    if (finalStatus !== 'granted') {
      setTestingNotifications(false);
      setMessage('Allow notifications before sending a test.');
      return;
    }

    await Notifications.scheduleNotificationAsync({
      content: {
        body: 'This is a local notification test from Dallas.',
        sound: false,
        title: 'Dallas settings test',
      },
      trigger: {
        seconds: 5,
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      },
    });

    await refreshNotificationStatus();
    setTestingNotifications(false);
    setMessage('Test notification scheduled. Background the app and wait 5 seconds.');
  }

  async function handleResetLegalInfo() {
    await deviceStorage.removeItem(importantInfoStorageKey);
    setMessage('Legal and safety acknowledgement reset. You will see it again before entering the app.');
  }

  async function handleSignOut() {
    setSigningOut(true);
    setMessage('');

    await supabase.auth.signOut();
    await clearSupabaseLocalSession();

    setSigningOut(false);
    router.replace('/');
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.centerPanel}>
          <ActivityIndicator color="#38635D" />
          <Text style={styles.loadingText}>Loading settings...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.eyebrow}>Settings</Text>
        <Text style={styles.title}>App settings</Text>
        <Text style={styles.copy}>Manage device settings, notifications, safety information, and app status.</Text>

        <View style={styles.panel}>
          <IconTitle icon="vpn-key" title="OpenAI API key" />
          <Text style={styles.mutedText}>
            Store an API key on this device for AI features. It is not saved to your Dallas account.
          </Text>
          <InfoRow label="Status" value={openAiKeySaved ? 'Saved on this device' : 'Not saved'} />

          <View style={styles.fieldGroup}>
            <Text style={styles.inputLabel}>API key</Text>
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
            <ButtonLabel
              icon="save"
              text={savingOpenAiKey ? 'Saving...' : openAiKeySaved ? 'Replace API key' : 'Save API key'}
            />
          </Pressable>

          {openAiKeySaved ? (
            <Pressable
              disabled={savingOpenAiKey}
              style={[styles.secondaryButton, savingOpenAiKey && styles.disabledButton]}
              onPress={handleClearOpenAiKey}
            >
              <SecondaryButtonLabel icon="delete" text="Remove API key" />
            </Pressable>
          ) : null}
        </View>

        <View style={styles.panel}>
          <IconTitle icon="notifications" title="Notifications" />
          <InfoRow label="Permission" value={permissionStatus} />
          <InfoRow label="Scheduled notifications" value={String(scheduledCount)} />

          <Pressable
            disabled={testingNotifications}
            style={[styles.button, testingNotifications && styles.disabledButton]}
            onPress={handleSendTestNotification}
          >
            <ButtonLabel
              icon="notifications-active"
              text={testingNotifications ? 'Scheduling...' : 'Send test notification'}
            />
          </Pressable>
        </View>

        <View style={styles.panel}>
          <IconTitle icon="health-and-safety" title="Legal and safety information" />
          <Text style={styles.mutedText}>
            Review the Dallas safety limits or reset your acknowledgement so it appears again on entry.
          </Text>

          <Pressable style={styles.secondaryButton} onPress={() => setShowLegalInfo((value) => !value)}>
            <SecondaryButtonLabel
              icon={showLegalInfo ? 'visibility-off' : 'visibility'}
              text={showLegalInfo ? 'Hide safety information' : 'View safety information'}
            />
          </Pressable>

          {showLegalInfo ? <LegalSafetyInfo /> : null}

          <Pressable style={styles.secondaryButton} onPress={handleResetLegalInfo}>
            <SecondaryButtonLabel icon="restart-alt" text="Reset acknowledgement" />
          </Pressable>
        </View>

        <View style={styles.panel}>
          <IconTitle icon="info" title="App details" />
          <InfoRow label="App version" value={appVersion} />
          <InfoRow label="Environment" value={appEnvironment} />
          <InfoRow label="Supabase config" value={isSupabaseConfigured() ? 'Ready' : 'Missing .env values'} />
          <InfoRow label="Supabase project" value={supabaseHost} />
          <InfoRow label="Runtime" value={Constants.executionEnvironment ?? 'Unknown'} />
        </View>

        <Pressable
          disabled={signingOut}
          style={[styles.dangerButton, signingOut && styles.disabledButton]}
          onPress={handleSignOut}
        >
          <View style={styles.buttonLabelRow}>
            <MaterialIcons color="#FFFFFF" name="logout" size={20} />
            <Text style={styles.dangerButtonText}>{signingOut ? 'Signing out...' : 'Sign out'}</Text>
          </View>
        </Pressable>

        {message ? <Text style={styles.message}>{message}</Text> : null}

        <Link href="/" asChild>
          <Pressable style={styles.secondaryButton}>
            <SecondaryButtonLabel icon="home" text="Back home" />
          </Pressable>
        </Link>
      </ScrollView>
    </SafeAreaView>
  );
}

function getSupabaseHost(value: string | undefined) {
  if (!value) {
    return 'Not configured';
  }

  try {
    return new URL(value).hostname;
  } catch {
    return 'Invalid URL';
  }
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function ButtonLabel({ icon, text }: { icon: keyof typeof MaterialIcons.glyphMap; text: string }) {
  return (
    <View style={styles.buttonLabelRow}>
      <MaterialIcons color="#FFFFFF" name={icon} size={20} />
      <Text style={styles.buttonText}>{text}</Text>
    </View>
  );
}

function IconTitle({ icon, title }: { icon: keyof typeof MaterialIcons.glyphMap; title: string }) {
  return (
    <View style={styles.panelTitleRow}>
      <View style={styles.panelTitleIcon}>
        <MaterialIcons color="#38635D" name={icon} size={20} />
      </View>
      <Text style={styles.panelTitle}>{title}</Text>
    </View>
  );
}

function SecondaryButtonLabel({ icon, text }: { icon: keyof typeof MaterialIcons.glyphMap; text: string }) {
  return (
    <View style={styles.buttonLabelRow}>
      <MaterialIcons color="#38635D" name={icon} size={20} />
      <Text style={styles.secondaryButtonText}>{text}</Text>
    </View>
  );
}

function LegalSafetyInfo() {
  return (
    <View style={styles.legalPanel}>
      <Text style={styles.legalTitle}>Not medical or clinical treatment</Text>
      <Text style={styles.legalText}>
        Dallas does not provide diagnosis, therapy, medical advice, detox support, emergency response, or treatment.
        Decisions about health, medication, recovery, or safety should be made with qualified professionals in your
        location.
      </Text>

      <Text style={styles.legalTitle}>Use qualified local support</Text>
      <Text style={styles.legalText}>
        Use local emergency or crisis services if you may harm yourself, harm someone else, or need urgent help. Choose
        accountability partners who are willing, informed, and appropriate for the support you need.
      </Text>

      <Text style={styles.legalTitle}>AI limits</Text>
      <Text style={styles.legalText}>
        AI responses may be incomplete or wrong and should not be relied on for medical, clinical, legal, or crisis
        decisions.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F7F3EA',
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
  panelTitleRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  panelTitleIcon: {
    alignItems: 'center',
    backgroundColor: '#ECE5D8',
    borderRadius: 8,
    height: 34,
    justifyContent: 'center',
    width: 34,
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
  buttonLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
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
  dangerButton: {
    alignItems: 'center',
    backgroundColor: '#B3261E',
    borderRadius: 8,
    justifyContent: 'center',
    minHeight: 50,
    paddingHorizontal: 18,
  },
  dangerButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  disabledButton: {
    opacity: 0.64,
  },
  legalPanel: {
    backgroundColor: '#F9F7F0',
    borderColor: '#DED7C9',
    borderRadius: 8,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  legalTitle: {
    color: '#17211F',
    fontSize: 14,
    fontWeight: '800',
  },
  legalText: {
    color: '#4F5D58',
    fontSize: 14,
    lineHeight: 20,
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
