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

- Set Site URL to `https://dallas-app.onrender.com`
- Add redirect URL: `https://dallas-app.onrender.com/account-created/`
- Add redirect URL: `https://dallas-app.onrender.com/reset-password/`

In Render, make sure direct routes serve the app:

- Rewrite source: `/*`
- Rewrite destination: `/index.html`

In the mobile app `.env`:

```sh
EXPO_PUBLIC_PASSWORD_RESET_URL=https://dallas-app.onrender.com/reset-password/
EXPO_PUBLIC_SIGNUP_CONFIRMATION_URL=https://dallas-app.onrender.com/account-created/
```

In Supabase Dashboard > Authentication > Email Templates:

Confirmation signup email:

```html
<h2>Confirm your email address</h2>

<p>Follow the link below to confirm this email address and finish signing up.</p>
<p><a href="{{ .ConfirmationURL }}">Confirm email address</a></p>
```

Reset password email:

```html
<h2>Reset your password</h2>

<p>We received a request to reset your password. Follow the link below to choose a new password.</p>
<p><a href="{{ .ConfirmationURL }}">Reset password</a></p>

<p>If you didn't request this, you can safely ignore this email.</p>
```

The app passes separate redirect URLs to Supabase when it calls signup and password reset. Keep the email templates using `{{ .ConfirmationURL }}` so Supabase preserves the correct flow and tokens.
