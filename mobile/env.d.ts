declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_SUPABASE_URL?: string;
    EXPO_PUBLIC_SUPABASE_ANON_KEY?: string;
    EXPO_PUBLIC_APP_ENV?: 'development' | 'preview' | 'production';
    EXPO_PUBLIC_PASSWORD_RESET_URL?: string;
    EXPO_PUBLIC_SIGNUP_CONFIRMATION_URL?: string;
  }
}
