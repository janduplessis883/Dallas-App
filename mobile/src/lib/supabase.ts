import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import { deviceStorage } from './deviceStorage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabaseAuthStorageKey = getSupabaseAuthStorageKey(supabaseUrl);

export function isSupabaseConfigured() {
  return Boolean(supabaseUrl && supabaseAnonKey);
}

export const supabase = createClient(
  supabaseUrl ?? 'https://placeholder.supabase.co',
  supabaseAnonKey ?? 'placeholder-anon-key',
  {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      persistSession: true,
      storage: deviceStorage,
    },
    global: {
      headers: {
        'x-application-name': 'dallas-mobile',
      },
    },
  },
);

export async function clearSupabaseLocalSession() {
  try {
    await supabase.auth.signOut({ scope: 'local' });
  } finally {
    if (supabaseAuthStorageKey) {
      await deviceStorage.removeItem(supabaseAuthStorageKey);
      await deviceStorage.removeItem(`${supabaseAuthStorageKey}-code-verifier`);
    }
  }
}

function getSupabaseAuthStorageKey(value: string | undefined) {
  if (!value) {
    return '';
  }

  try {
    const hostname = new URL(value).hostname;
    const projectRef = hostname.split('.')[0];

    return projectRef ? `sb-${projectRef}-auth-token` : '';
  } catch {
    return '';
  }
}
