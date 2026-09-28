# Dallas Message Moderation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-enforced filtering and reporting for both Dallas buddy messages and external check-in replies, an admin-only in-app moderation center backed by `profiles.user_role`, and ship a reviewed App Store build.

**Architecture:** Supabase Postgres is the source of truth for roles, reports, message removal, suspensions, and audit records. Authenticated Edge Functions validate all user and admin actions, store reports, and send/retry Resend email; Expo screens only provide discovery and UI. Public Vite pages explain support, reporting, and retention, and the production mobile build is uploaded to App Store Connect after Supabase is ready.

**Tech Stack:** Expo SDK 56 / React Native / TypeScript, Supabase Postgres / Auth / Edge Functions, Resend, Vite, EAS Build and Submit.

**Spec:** `docs/superpowers/specs/2026-09-28-ugc-moderation-design.md`

## Global Constraints

- New profiles have `user_role = 'user'`; `admin` can be set only through a direct database update inside Supabase.
- No client can promote itself or another user; enforce role writes in the database and check the persisted role in every moderation Edge Function.
- Both message write paths use the same server-side prohibited-content policy before insertion.
- Reports, evidence snapshots, and audit records are private and retained for 12 months.
- The external check-in one-time token is never stored in or emailed with a report.
- Keep message reporting separate from existing buddy block behavior.
- Never expose the Resend key or service-role key to the mobile app or website.
- Update `supabase/schema.sql` and account-deletion behavior with every schema change.
- Follow `mobile/AGENTS.md`: consult exact Expo SDK 56 docs before changing mobile code.
- Preserve unrelated existing working-tree changes; only stage files created for this work if Git metadata becomes writable.

## Review Focus

- Client attempts to set or update `profiles.user_role` to `admin`: verify the database rejects it while a direct Supabase SQL update works.
- A non-admin calls moderation endpoints directly: verify no queue, report, email status, or action is exposed.
- A forged, stale, or unrelated source ID is reported: verify reporter ownership and incoming-message checks reject it without revealing content.
- Resend is unavailable or times out: verify report persistence and retry state remain intact and repeat attempts do not duplicate email.
- A reported message was removed or the reporter/subject account was deleted: verify the report snapshot/audit retention and UI marker remain consistent through expiry.

---

### Task 1: Add protected roles, report data, and moderation audit schema

**Files:**
- Create: migration generated with `supabase migration new message_moderation` (inspect the generated filename; do not invent it).
- Modify: `supabase/schema.sql`
- Modify: `supabase/functions/delete-account/index.ts`
- Verify current Supabase docs/changelog for RLS, trigger execution roles, and scheduled jobs before implementing SQL.

**Interfaces:**
- Produces `profiles.user_role` (`user | admin`, default `user`), private moderation report rows, append-only moderation audit rows, soft-removal metadata for both message tables, and suspension state/audit representation used by later tasks.
- Ordinary clients cannot read report/audit tables or change role, delivery, review, removal, or suspension fields.

- [ ] Inspect current migration identifiers and create the migration using the Supabase CLI. Include constraints, indexes, RLS, grants, column-level profile privileges that exclude `user_role`, report/delivery/review fields, audit fields, removal fields, and 12-month expiry timestamps.
- [ ] Apply the migration in the development project and confirm the expected columns, constraints, and RLS state using a read-only schema query.
- [ ] Mirror the final migration definitions in `supabase/schema.sql` without disturbing existing local edits.
- [ ] Update account deletion to clear reporter/subject/actor references as specified while retaining evidence and audit rows until expiry.
- [ ] Run `supabase db advisors` (or the supported MCP advisor equivalent) and resolve relevant findings.

### Task 2: Implement server filtering, report intake, and email delivery

**Files:**
- Create: `supabase/functions/_shared/message-moderation.ts`
- Create: `supabase/functions/submit-message-report/index.ts`
- Create: `supabase/functions/admin-moderation/index.ts`
- Modify: `supabase/functions/accountability-app/index.ts`
- Modify: `supabase/functions/check-in-reply/index.ts`
- Modify: Supabase configuration/deployment files only if required by current CLI conventions.

**Interfaces:**
- `moderateMessage(text: string): { allowed: boolean; reason?: string }` is the shared deterministic policy used before either message insert.
- `submit-message-report` accepts `{ source: 'buddy_message' | 'external_check_in_reply', messageId: string, reason: string, idempotencyKey: string }`; derives reporter and snapshot server-side and returns `{ reportId: string, emailStatus: 'sent' | 'queued' }`.
- `admin-moderation` supports authenticated admin actions `list_reports`, `get_report`, `set_report_status`, `retry_email`, `remove_message`, `restore_message`, `suspend_account`, and `reinstate_account` with validated bounded inputs.

- [ ] Add server policy checks before inserts and confirm rejected content produces no stored message and no push notification in either path.
- [ ] Close direct-write bypasses: remove authenticated INSERT on `accountability_app_messages` (the app sends through `accountability-app`), and constrain authenticated `accountability_check_in_messages` inserts to `sender_type = 'user'`; the partner reply Edge Function uses server credentials. Restrict client updates of both tables to `read_at` only.
- [ ] Validate report ownership from the referenced message, not client-supplied reporter, subject, snapshot, or thread token; reject own messages and unrelated IDs.
- [ ] Persist the report before calling Resend; use the report ID for idempotency; store bounded delivery diagnostics and return a saved/queued receipt after email failure.
- [ ] Implement admin authorization by resolving the authenticated user ID then reading `profiles.user_role` with the server-only Supabase client on every admin operation.
- [ ] Implement status transitions, retry backoff, soft removal/restore, account suspension/reinstatement, and audit records; require internal reasons for destructive or account-level actions.
- [ ] Add a scheduled delivery retry and report/audit purge for 12-month expiry, using current supported Supabase scheduling primitives; deploy and inspect function logs/configuration.
- [ ] Deploy the migration and functions to Dallas project `bigsklrfoqkvsdgfickw`; check secret names without printing values and ensure `RESEND_API_KEY` exists before enabling delivery. Never output secret values.

### Task 3: Add reporting and admin moderation mobile screens

**Files:**
- Create: `mobile/app/moderation.tsx`
- Modify: `mobile/app/dallas-app-buddies.tsx`
- Modify: `mobile/src/components/AppNavigation.tsx`
- Modify: `mobile/app/profile.tsx` or another existing signed-in role-load boundary, selected after tracing startup/profile flows.

**Interfaces:**
- Mobile loads the current user's `user_role` from their own profile; this controls only whether the Moderation link is shown.
- Every screen action calls the Edge Function interfaces in Task 2 and handles queued email, authorization rejection, and retry state.

- [ ] Add report actions for incoming Buddy messages and external check-in replies, with reason selection and a confirmation disclosure before submission.
- [ ] Add the admin-only Moderation navigation item and guarded route; load queue and report detail only through `admin-moderation`.
- [ ] Add review/dismiss/resolve, retry email, remove/restore message, suspend/reinstate account controls with confirmation and required reason where applicable.
- [ ] Update message rendering to show a neutral removal marker and hide removed text for normal participants.
- [ ] Run `npx tsc --noEmit` from `mobile/` and resolve errors without reverting unrelated user changes.
- [ ] Build the app with the configured EAS production profile after all release prerequisites are met.

### Task 4: Update public support and privacy information

**Files:**
- Modify: `password-reset-web/home/index.html`
- Modify: `password-reset-web/privacy/index.html`
- Modify: relevant CSS only if needed for the support contact presentation.

- [ ] Add the public contact `hello@attribut.me` and describe how to report either message type.
- [ ] Explain report contents, support email routing, 12-month retention, account deletion handling, and the mailbox-copy retention limitation accurately.
- [ ] Remove stale test-build copy and preserve existing calm safety/legal wording.
- [ ] Run `npm run build` from `password-reset-web/` and inspect the generated pages for the updated contact/privacy copy.

### Task 5: Provision the admin and operational email configuration

**Files:**
- Modify: `.env.example` or deployment guidance only if needed; never write secrets into repository files.

- [ ] Confirm `hello@attribut.me` receives email and select a verified Resend sender identity.
- [ ] Confirm `RESEND_API_KEY` exists in Supabase secrets by inspecting secret names only; if missing, pause before production email deployment and request secure configuration through the user's normal secret-management channel.
- [ ] Obtain the intended initial Dallas admin account ID/email from the user, verify that account exists, then set `profiles.user_role = 'admin'` with a direct SQL update inside Supabase. Do not guess or promote an account based on local identity.
- [ ] Verify a newly created profile receives `user_role = 'user'` and the selected admin profile has `admin` after the direct database update.

### Task 6: Complete App Store Connect release path

**Files:**
- Modify mobile version/build metadata only if required for the new release.

- [ ] Confirm the configured production build includes the moderation changes and build it with EAS.
- [ ] Submit the build to App Store Connect and confirm processing completes.
- [ ] Complete or verify listing metadata, screenshots, privacy disclosures, age rating, support/privacy URLs, review contact, and moderation review notes.
- [ ] Submit the new version for Apple App Review; distinguish upload completion from App Review submission and report any App Store Connect login or required-metadata block explicitly.

## Self-review coverage

- The filter, both report sources, private storage, account-deletion redaction, role protection, admin UI/actions, email retry and idempotency, public policy updates, deployment, and release are each assigned to a task.
- The main interface names match across tasks: shared `moderateMessage`, report submission fields, and admin action names are defined once in Task 2 and consumed in Task 3.
- The five highest-risk conditions appear in Review Focus and are covered by the owning task's verification steps.
- No test suites will be added under the current instruction; validation uses schema queries, Supabase advisors/logs, TypeScript compilation, website build, and production build/upload checks.
