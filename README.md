# Dallas

Dallas is a mobile-first recovery planning and accountability app built with Expo React Native and Supabase. It helps members prepare for high-risk moments, store personal recovery anchors, schedule reminders, and stay connected to trusted accountability support.

The app is designed as a practical support tool. It is not a crisis service, medical product, clinical treatment platform, or replacement for qualified professional care.

## Product Scope

Dallas brings several recovery-support workflows into one authenticated mobile experience:

- Secure account access through Supabase Auth.
- A signed-in home dashboard with profile context, unread accountability indicators, and links into the main tools.
- Recovery planning and holding-page scaffolds for structured goals, commitments, triggers, coping actions, and support resources.
- Prophetic Vision storage for short-form and long-form recovery identity statements, a cover image, and an audio reading.
- AI-assisted Prophetic Vision rewriting through a Supabase Edge Function.
- Event planning for preparing before, staying anchored during, and reflecting after known risk events.
- Danger Zone planning for predictable high-risk windows such as travel, weekends, time alone, or days off.
- Accountability partners, planned check-ins, threaded check-in replies, app buddy messaging, and unread counts.
- Reminder and notification support through Expo Notifications and stored push tokens.
- Profile and settings screens for preferred names, contact details, avatar/home-cover images, notification checks, account deletion, and legal/safety information.

## Repository Layout

```text
.
├── mobile/                 Expo React Native app
│   ├── app/                Expo Router screens
│   ├── src/components/     Shared React Native components
│   ├── src/lib/            Supabase, storage, and notification helpers
│   └── assets/             App icons, splash assets, and logos
├── password-reset-web/     Hosted web pages for auth-related flows
├── supabase/
│   ├── functions/          Supabase Edge Functions
│   ├── migrations/         Ordered database and storage migrations
│   ├── email-templates/    Supabase auth email templates
│   └── schema.sql          Consolidated schema snapshot
└── NEXT_SESSION_HANDOFF.md Development handoff notes
```

## Mobile App

The mobile app uses Expo Router, React Native, TypeScript, Supabase Auth, Supabase Postgres, Supabase Storage, Supabase Edge Functions, and Expo Notifications.

Important screens include:

- `mobile/app/index.tsx`: auth flow, important information acknowledgement, signed-in dashboard, profile summary, and primary navigation tiles.
- `mobile/app/prophetic-vision.tsx`: Prophetic Vision editor, markdown previews, cover image upload, audio upload/recording, playback, AI rewrite, and Supabase persistence.
- `mobile/app/accountability.tsx`: accountability partner management and check-in workflows.
- `mobile/app/dallas-app-buddies.tsx`: app buddy connections and messages.
- `mobile/app/event-planning.tsx`: event preparation, reminders, boundaries, anchors, and reflection.
- `mobile/app/danger-zone-planning.tsx`: high-risk window planning entry point.
- `mobile/app/reminders.tsx`: notification readiness and reminder status.
- `mobile/app/profile.tsx`: profile details, avatar, home cover image, and contact data.
- `mobile/app/settings.tsx`: app configuration status, legal/safety information, sign out, and account deletion access.

## Supabase Integration

Dallas relies on Supabase for authentication, row-level secured user data, file storage, push-token records, and server-side AI calls.

The mobile Supabase client lives in `mobile/src/lib/supabase.ts`. It reads the public Supabase URL and anon key from Expo public environment variables, persists sessions through the app's device storage abstraction, and sends an application header of `dallas-mobile`.

Core database areas include:

- `profiles`: display names, contact details, avatars, and home cover images.
- `recovery_plans`: structured recovery plan content.
- `prophetic_visions`: one or more saved Prophetic Vision records per user, including short text, long text, audio path, audio file name, and cover image path.
- `event_plans`: event and danger-zone planning data.
- `accountability_partners`: trusted partner records.
- `accountability_check_ins`: check-in records.
- `accountability_planned_check_ins`: scheduled check-ins and local notification references.
- `accountability_check_in_threads` and `accountability_check_in_messages`: threaded web reply support.
- `accountability_app_connections` and `accountability_app_messages`: in-app accountability buddy messaging.
- `push_tokens`: Expo push token storage for notification workflows.

Row-level security policies are defined in `supabase/schema.sql` and the migration files. The main data model follows a user-owned pattern where rows include `user_id` or profile identity fields and policies restrict access to the authenticated owner or appropriate accountability participant.

## Prophetic Vision

The Prophetic Vision feature is a first-class app page linked from the signed-in home dashboard.

It is backed by:

- The `public.prophetic_visions` table.
- The public `prophetic-vision-covers` storage bucket for cover images.
- The private `prophetic-vision-audio` storage bucket for audio readings.
- The `rewrite-prophetic-vision` Supabase Edge Function for AI rewriting.

The mobile screen loads the latest Prophetic Vision for the signed-in user, saves changes with Supabase `upsert`, uploads cover images and audio files to Supabase Storage, creates signed audio URLs for playback, and invokes the rewrite Edge Function when requested.

## Edge Functions

Supabase Edge Functions are stored under `supabase/functions/`:

- `rewrite-prophetic-vision`: rewrites recovery-focused Prophetic Vision text with OpenAI and returns strict JSON containing short and long versions.
- `accountability-app`: supports accountability app connection and messaging flows.
- `check-in-reply`: handles web-based check-in reply behavior.
- `delete-account`: removes user-owned database rows and storage objects during account deletion.

## Auth And Web Flows

The `password-reset-web/` package contains simple hosted web pages used by Supabase email flows:

- Account creation confirmation.
- Password reset.
- Password reset handoff pages.
- Privacy and home pages.
- Redirect configuration for static hosting.

Supabase email templates live in `supabase/email-templates/` and point users into the relevant hosted flows.

## Notifications

Notification support is handled by `mobile/src/lib/notifications.ts` and app-level scheduling code. The app stores Expo push tokens in Supabase, schedules local reminders for planned check-ins and event-plan anchors, and exposes status checks in the mobile UI.

## Design Notes

The app uses a warm, calm recovery-support palette with deep green actions, restrained accent colors, off-white page backgrounds, and white cards for content surfaces. Screen-level backgrounds use the warm off-white `#F9F7F0` so the interface feels softer than stark white while preserving contrast for panels and inputs.

## Safety Notes

Dallas includes visible user-facing safety and legal information. The product language should continue to avoid promises of monitoring, diagnosis, treatment, clinical support, emergency response, or guaranteed accountability partner availability.

AI-generated content should remain framed as drafting and reflection support. Users should review AI rewrites before saving and should rely on qualified local professionals or emergency services when health, safety, or crisis needs are involved.

## Maintenance Notes

- Keep schema changes represented in both ordered migrations and the consolidated `supabase/schema.sql` snapshot.
- Preserve row-level security whenever adding user-owned tables or storage buckets.
- Keep Supabase Storage paths scoped by user id where possible.
- Avoid placing service-role behavior in the mobile app.
- Keep account deletion coverage updated when adding new user-owned tables or storage buckets.
- Prefer app-wide helpers in `mobile/src/lib/` for Supabase, device storage, and notifications rather than duplicating client setup in screens.
