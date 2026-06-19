# Dallas

Mobile-first recovery planning and accountability app.

## Stack

- Expo React Native with TypeScript
- Supabase for auth, Postgres, and row-level security
- Supabase Edge Functions for server-side OpenAI calls
- Expo Notifications for mobile reminders and accountability prompts

## Getting Started

```sh
cd mobile
cp .env.example .env
npm run start
```

Add your Supabase project URL and anon key to `mobile/.env` before building auth or data-backed screens.
