# Dallas Account Web

Small hosted page for Supabase auth email links.

It handles two flows:

- `/account-created` shows a confirmation message after signup email verification.
- `/reset-password` lets a member choose a new password from a recovery email.

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

- Set Site URL to your Render URL, for example `https://dallas-account.onrender.com`
- Add redirect URL: `https://dallas-account.onrender.com/account-created/`
- Add redirect URL: `https://dallas-account.onrender.com/reset-password/`

In Render, make sure direct routes serve the app:

- Rewrite source: `/*`
- Rewrite destination: `/index.html`

In the mobile app `.env`:

```sh
EXPO_PUBLIC_PASSWORD_RESET_URL=https://dallas-account.onrender.com/reset-password
EXPO_PUBLIC_SIGNUP_CONFIRMATION_URL=https://dallas-account.onrender.com/account-created
```

If Render returns `Not Found`, use the trailing-slash versions in the mobile app too:

```sh
EXPO_PUBLIC_PASSWORD_RESET_URL=https://dallas-account.onrender.com/reset-password/
EXPO_PUBLIC_SIGNUP_CONFIRMATION_URL=https://dallas-account.onrender.com/account-created/
```
