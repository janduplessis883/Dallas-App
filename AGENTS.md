# Dallas agent guidance

## Scope and context

Dallas is a recovery planning and accountability app built with Expo React Native and Supabase, with a separate Vite website for auth and check-in reply flows. Ignore `rentboy/`; it is outside the Dallas project scope.

- Read `README.md` for product scope and architecture.
- Before changing mobile code, read `mobile/AGENTS.md` and follow its versioned Expo documentation requirement.
- For buddy invitations, blocking, disconnection, or planned check-ins, read `CONTEXT.md` for domain terminology and lifecycle rules. Update it when an intentional behavior change alters those rules.
- Treat `NEXT_SESSION_HANDOFF.md` as historical implementation context; verify its claims against current code and migrations before relying on them.

## Working boundaries

- `mobile/app/` contains Expo Router screens. `mobile/src/components/` contains shared UI; `mobile/src/lib/` contains shared client, storage, and notification helpers.
- `password-reset-web/` is an independently installed and built Vite package. Its entry points are declared in `vite.config.js`.
- `supabase/functions/` contains Deno Edge Functions. `supabase/migrations/` contains database and storage changes; `supabase/schema.sql` is the consolidated snapshot.
- Run npm commands inside the relevant package; there is no root npm package. Use the existing npm lockfiles when installing dependencies.

## Mobile changes

- Reuse the Supabase client, device storage abstraction, and notification helpers in `mobile/src/lib/`. Preserve native and web behavior when changing platform-dependent code.
- Reuse shared components and `mobile/src/theme/designTokens.ts` for UI changes. Follow the surrounding screen's conventions when integrating existing styles.
- When changing navigation or check-in workflows, trace the related unread indicators, read-state updates, notification routes, and reminder scheduling or cancellation.
- Keep external accountability partner replies and Dallas app buddy messaging distinct; verify that opening one flow clears only its corresponding unread state.

## Backend and auth changes

- Add a new migration for schema, policy, RPC, or storage changes and update `supabase/schema.sql` to match. Inspect existing migration identifiers and dependencies before choosing the next identifier; the directory contains both numbered and timestamped migrations.
- Preserve row-level security and participant authorization. Scope user-owned storage paths by user ID and keep private audio access through signed URLs.
- Keep service-role credentials and AI API keys in server-side configuration. Client environment variables must contain only values intended for public exposure; use `.env.example` for configuration guidance.
- When adding user-owned tables or storage buckets, update deletion coverage in `supabase/functions/delete-account/index.ts`, including relevant relationship cleanup.
- For auth-link changes, check the mobile redirect configuration, website routes, `password-reset-web/public/_redirects`, and `supabase/email-templates/` together. Read `password-reset-web/README.md` for hosting context and preserve the email templates' `{{ .ConfirmationURL }}` token handling.

## Validation

Run checks for the affected package after code changes:

- Mobile TypeScript: run `npx tsc --noEmit` from `mobile/`.
- Mobile interaction changes: run the appropriate start script from `mobile/package.json` and exercise the changed flow on the relevant platform. Native permissions, device storage, audio, and notifications require platform-specific verification.
- Website: run `npm run build` from `password-reset-web/` and manually exercise the affected direct route and auth or reply flow.
- Backend: verify changed migrations and functions in a suitable development environment. For access-control changes, check both permitted access and rejection of an unrelated user's access.

The mobile and website packages currently have no test or lint scripts. Report which checks ran and any checks blocked by missing credentials, services, or device access; distinguish static checks from runtime verification.

## Product language

Keep recovery-support language calm and practical. Preserve visible safety and legal information. Avoid claims of diagnosis, treatment, emergency response, monitoring, or guaranteed partner availability. Frame AI rewrites as drafts for the user to review before saving.
