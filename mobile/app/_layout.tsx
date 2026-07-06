import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import '../src/lib/notifications';

export default function RootLayout() {
  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: '#F7F3EA' },
        }}
      />
      <StatusBar style="dark" />
    </>
  );
}
