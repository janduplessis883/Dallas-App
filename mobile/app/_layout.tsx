import { useEffect, useState } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';

import { AppNavigation } from '../src/components/AppNavigation';
import '../src/lib/notifications';
import { supabase } from '../src/lib/supabase';

export default function RootLayout() {
  const [hasSession, setHasSession] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setHasSession(Boolean(data.session)));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setHasSession(Boolean(session));
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: {
            backgroundColor: '#FFFFFF',
          },
        }}
      />
      {hasSession ? <AppNavigation /> : null}
      <StatusBar style="dark" />
    </View>
  );
}
