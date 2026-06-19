# Dallas Password Reset Web

Small hosted page for Supabase password recovery links.

## Render setup

- Root directory: `password-reset-web`
- Build command: `npm install && npm run build`
- Publish directory: `dist`

## Environment variables

Set these in Render:

```sh
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
```

## Supabase Auth setup

In Supabase Dashboard > Authentication > URL Configuration:

- Set Site URL to your Render URL, for example `https://dallas-password-reset.onrender.com`
- Add redirect URL: `https://dallas-password-reset.onrender.com`

Use that same URL as `redirectTo` when calling `resetPasswordForEmail`.
