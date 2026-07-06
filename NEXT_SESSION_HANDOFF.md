# Dallas App Handoff

Date: 2026-07-04

## Current Goal

Move Dallas App Buddies out of the main Accountability screen into their own home-page section called `Dallas App Buddies`.

The new section should:

- Show Dallas app buddies as toggle-open rows.
- Show the buddy's own uploaded profile avatar.
- Show in-app messages underneath the expanded buddy.
- Include the check-in date/time controls and buddy settings underneath the expanded buddy.
- Remove the SMS invite / Notify actions from this Dallas App Buddies flow.

## What Is Implemented

### Home screen split

File: `mobile/app/index.tsx`

- Added a new home card:
  - label: `Dallas App Buddies`
  - route: `/dallas-app-buddies`
  - icon: `forum`
- Split unread counts:
  - `Accountability` badge now counts only external/web replies from `accountability_check_in_messages`.
  - `Dallas App Buddies` badge counts unread in-app buddy messages from `accountability_app_messages`.
- Both badges are red numeric badges capped at `99+`.
- Home still refreshes counts on:
  - initial session load,
  - auth state change,
  - home focus.

### New Dallas App Buddies screen

File: `mobile/app/dallas-app-buddies.tsx`

- New Expo route at `/dallas-app-buddies`.
- Loads only `accountability_partners` where:
  - `user_id = current user`
  - `partner_kind = 'dallas_user'`
- Each buddy row toggles open/closed.
- Expanded buddy shows:
  - planned check-ins,
  - date and time picker controls,
  - in-app message thread,
  - message composer,
  - buddy settings for location, timezone, and notes.
- Sending messages uses the existing `accountability-app` Supabase function with `action: 'send_message'`.
- Opening Dallas App Buddies marks received unread `accountability_app_messages` as read.
- Buddy avatar/display name lookup:
  - uses `connected_user_id` to load `profiles.avatar_path` and `profiles.display_name`,
  - uses the public `avatars` storage bucket URL,
  - falls back to the partner name initial if no avatar is available.

### Accountability screen adjusted

File: `mobile/app/accountability.tsx`

- Accountability remains the place to connect a Dallas user by PIN/email.
- The old Dallas app messaging block has been removed from Accountability.
- The Dallas section is now titled `Connect Dallas App Buddies`.
- After connecting a Dallas user, the message says to open Dallas App Buddies from home.
- The Partners list in Accountability now shows only external partners.
- Opening Accountability now marks only external/web partner replies read.
- Important: Dallas app buddy unread messages should clear only when opening Dallas App Buddies, not Accountability.

### Push notification route updated

File: `supabase/functions/accountability-app/index.ts`

- New Dallas app connection notifications route to `/dallas-app-buddies`.
- New in-app buddy message notifications route to `/dallas-app-buddies`.

### Supabase profile visibility for buddy avatars

Files:

- `supabase/migrations/0012_accountability_app_connections.sql`
- `supabase/schema.sql`

Added policy:

```sql
"Connected Dallas buddies can view profile basics"
```

This lets connected users select each other's `profiles` rows so the app can display `display_name` and `avatar_path`.

Important caveat:

- The app only selects `avatar_path`, `display_name`, and `id`.
- The policy itself allows selecting the connected profile row. If stricter data minimization is needed later, create a dedicated view/RPC for public buddy profile basics.

## Validation Run

From `mobile/`:

```bash
npx tsc --noEmit
```

Passed after the Dallas App Buddies changes.

Previously in this session, before the Dallas App Buddies split:

```bash
npm ci --include=dev
npx tsc --noEmit
```

Both passed after updating `mobile/package-lock.json`.

Also previously verified local EAS archive:

```bash
npx eas build:inspect --platform ios --stage archive --profile production --output /private/tmp/dallas-eas-inspect --force
cd /private/tmp/dallas-eas-inspect/mobile
npm ci --include=dev --dry-run
```

The inspected archive included `mobile/package-lock.json`, and the dry-run install passed.

## EAS/TestFlight Status

Last successful production build before the unread badge / buddy-section work:

- Build ID: `e1871ea7-1150-41d8-8e68-9c7551203525`
- Build number: `8`
- Status: finished

Failed builds while trying to publish earlier badge changes:

- Build ID: `3f37838a-273b-447f-8998-7fc20e8f2829`
- Build number: `9`
- Status: errored
- Failure phase: `INSTALL_DEPENDENCIES`
- Error: `npm ci` lockfile mismatch, missing `react-native-worklets@0.8.3`

- Build ID: `57b83748-c98f-4035-9602-621f2003657b`
- Build number: `10`
- Status: errored
- Failure phase: `INSTALL_DEPENDENCIES`
- Error again: `npm ci` lockfile mismatch, missing `react-native-worklets@0.8.3`

Important clue:

- Build 10 EAS record reported the same fingerprint as build 9:
  - `b42c2a5e7e6db290b1b1ab0cb76b49faa803a5c5`
- Locally, after updating the lockfile, `npm ci` passes and the inspected EAS archive contains `react-native-worklets@0.9.2`.
- This suggests EAS may have uploaded or reused stale project contents despite the local archive being correct.

## Suggested Next Steps

1. Re-check local status:

```bash
cd /Users/janduplessis/code/janduplessis883/Dallas-App
git status --short
```

2. Re-run validation:

```bash
cd /Users/janduplessis/code/janduplessis883/Dallas-App/mobile
rg 'react-native-worklets' package-lock.json package.json
npm ci --include=dev
npx tsc --noEmit
```

3. Apply/deploy Supabase changes before expecting buddy avatars to come across:

- Apply `supabase/migrations/0012_accountability_app_connections.sql` if it has not been applied.
- Deploy `supabase/functions/accountability-app/index.ts` so buddy notifications route to `/dallas-app-buddies`.
- Confirm the `avatars` bucket is public as expected from existing profile avatar behavior.

4. Retry EAS with cache clearing:

```bash
cd /Users/janduplessis/code/janduplessis883/Dallas-App/mobile
npx eas build --platform ios --profile production --auto-submit --clear-cache --non-interactive
```

5. Watch the build:

```bash
npx eas build:list --platform ios --limit 3 --non-interactive
```

6. If it fails again, inspect the new log:

```bash
npx eas build:view BUILD_ID --json
```

Download the `logFiles[0]` URL, then decompress if needed:

```bash
curl -L -o /private/tmp/eas-build.log.bin 'SIGNED_LOG_URL'
brotli -d -f /private/tmp/eas-build.log.bin -o /private/tmp/eas-build.log
rg -n 'npm error|react-native-worklets|INSTALL_DEPENDENCIES|Using package.json' /private/tmp/eas-build.log
```

## Files Known To Be Changed

Relevant to the Dallas App Buddies work:

- `mobile/app/index.tsx`
- `mobile/app/accountability.tsx`
- `mobile/app/dallas-app-buddies.tsx`
- `supabase/functions/accountability-app/index.ts`
- `supabase/migrations/0012_accountability_app_connections.sql`
- `supabase/schema.sql`

Relevant earlier work still in the same dirty worktree:

- `mobile/package.json`
- `mobile/package-lock.json`
- `mobile/src/lib/notifications.ts`
- `mobile/app/_layout.tsx`
- `mobile/eas.json`
- `password-reset-web/README.md`
- `supabase/functions/check-in-reply/index.ts`
- `supabase/email-templates/`

Do not revert unrelated changes unless Jan explicitly asks.

## Notes For Next Session

- The attached mockup showed Dallas App Buddies as a home-page section with messages under each open buddy and settings underneath.
- SMS invite / Notify buttons were explicitly marked as not needed in the Dallas App Buddies flow.
- The current implementation schedules/stores planned check-ins in Supabase, but unlike the older Accountability screen it does not schedule local device notifications from the new Dallas App Buddies screen. Add that if Jan wants buddy planned check-ins to fire local notifications too.
- Push notification behavior still needs real-device confirmation.
- User is mainly testing on one iPhone right now.
- If Jan wants unread buddy messages to clear only when a specific buddy thread is opened, change `markBuddyMessagesRead` in `mobile/app/dallas-app-buddies.tsx` to update only the expanded buddy's `app_connection_id`.
- If Jan wants a stricter profile privacy model, replace the connected-profile RLS policy with a narrow view or RPC that returns only `id`, `display_name`, and `avatar_path`.
