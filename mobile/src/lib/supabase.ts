import 'react-native-url-polyfill/auto';

import { createClient } from '@supabase/supabase-js';

import { deviceStorage } from './deviceStorage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

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
