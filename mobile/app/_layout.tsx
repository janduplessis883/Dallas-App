import { useEffect, useRef, useState } from 'react';
import * as Notifications from 'expo-notifications';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Platform, View } from 'react-native';

import { AppNavigation } from '../src/components/AppNavigation';
import '../src/lib/notifications';
import { supabase } from '../src/lib/supabase';
import { colors } from '../src/theme/designTokens';

export default function RootLayout() {
  const [hasSession, setHasSession] = useState(false);
  const router = useRouter();
  const handledNotificationIds = useRef(new Set<string>());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setHasSession(Boolean(data.session)));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') {
      return undefined;
    }

    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href =
      'https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700;800&display=swap';
    document.head.appendChild(fontLink);

    return () => {
      document.head.removeChild(fontLink);
    };
  }, []);

  useEffect(() => {
    const handleNotificationResponse = (response: Notifications.NotificationResponse) => {
      const notification = response.notification;
      if (handledNotificationIds.current.has(notification.request.identifier)) return;
      handledNotificationIds.current.add(notification.request.identifier);

      const data = notification.request.content.data ?? {};
      const route = data.route;

      if (data.type === 'accountability_app_message' || route === '/dallas-app-buddies') {
        const buddyId = data.buddyId;
        const connectionId = data.connectionId;
        const params = buddyId ? { buddyId: String(buddyId) } : connectionId ? { connectionId: String(connectionId) } : undefined;
        router.push(params ? { pathname: '/dallas-app-buddies', params } : '/dallas-app-buddies');
      } else if (route === '/') {
        router.push('/');
      } else if (route === '/event-planning') {
        router.push('/event-planning');
      } else if (route === '/accountability') {
        router.push('/accountability');
      } else if (route === '/reminders') {
        const reminderId = data.reminderId;
        router.push(reminderId ? { pathname: '/reminders', params: { reminderId: String(reminderId) } } : '/reminders');
      }
    };

    const initialResponse = Notifications.getLastNotificationResponse();
    if (initialResponse) handleNotificationResponse(initialResponse);
    const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);

    return () => subscription.remove();
  }, [router]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, backgroundColor: colors.background }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: {
              backgroundColor: colors.background,
            },
          }}
        />
      </View>
      {hasSession ? <AppNavigation /> : null}
      <StatusBar style="dark" />
    </View>
  );
}
