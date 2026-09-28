# Dallas user message moderation and reporting

## Purpose and agreed scope

Dallas must provide practical safeguards for user-generated messaging before App Review. The scope covers both Dallas App Buddy messages and partner replies sent through external check-in links. People must be able to report a received message, blocking remains available, reports must be retained if email delivery fails, and public support and privacy information must identify `hello@attribut.me`.

Reports are reviewed manually in an admin-only moderation section of the Dallas mobile app. Admins can review/resolve reports, remove reported content, and suspend a Dallas account. The service does not promise a response time or continuous monitoring.

## Current flows

- In-app Buddy chat is stored in `accountability_app_messages`; `accountability-app` accepts `send_message` and issues authenticated push notifications.
- External partner check-in replies are posted to `check-in-reply` using a one-time token and stored in `accountability_check_in_messages`. The signed-in user sees those replies in Buddy Check-in.
- The mobile screen is `mobile/app/dallas-app-buddies.tsx` and already has a block flow for Dallas App Buddies.
- The public website is built from `password-reset-web/`, including `/home/` and `/privacy/`.

## Design

### 1. Filter before delivery

Use one shared, deterministic prohibited-content policy on the server. The policy will be checked in `accountability-app` before a Dallas App Buddy message is inserted and in `check-in-reply` before an external reply is inserted. A rejected message is not stored and no notification is sent. Return a calm, actionable validation error so the sender can edit and try again. Mobile may run the same rule for immediate feedback, but the server check is authoritative and cannot be bypassed by a modified client.

Keep the initial filter narrow, explicit, and locally implemented. Do not send ordinary messages to a third-party moderation service or AI. Maintain the policy in one shared Edge Function module so both write paths stay consistent. Existing length limits and rate limits remain in force. Close direct Data API write paths that could bypass the server filter: Dallas buddy messages are sent through the authenticated Edge Function only, while direct authenticated check-in-message inserts may create only `sender_type = 'user'`; partner replies remain Edge Function-only. Restrict client message updates to read-state fields.

### 2. Report a received message

Add a Report action for each incoming Dallas App Buddy message and external check-in reply displayed in Buddy Check-in. Ask for a reason, show a disclosure naming the selected message and explaining that the report and message text will be sent confidentially to Dallas support, and require explicit confirmation before submission. Do not add a report action to the sender's own messages.

Submit reports through an authenticated Edge Function. For in-app chat, the function verifies that the reporter is a participant in the active connection and that the referenced message belongs to it and was sent by the other participant. For an external reply, the function verifies that the reporter owns the check-in thread, the referenced message belongs to that thread, and the message has `sender_type = 'partner'`. The external one-time link token is never stored in a report or included in email.

Store a private report record containing an opaque report ID, reporter ID, subject/other participant ID when applicable, source type and source record ID, reason, a snapshot of reported text, creation time, and email delivery state. Keep the report in Supabase for 12 months after submission, then purge it automatically. If the reporter deletes their account sooner, clear their reporter ID and retain only the de-identified report evidence until the 12-month expiry. If the reported person deletes their account, keep the report snapshot until expiry but clear the subject ID. Only the reporter can see their own submission receipt; no client can read report text or list reports. Service-role Edge Functions alone may create/update delivery metadata. State these rules in the privacy policy. The support mailbox is an external copy and its normal mailbox retention remains under the mailbox operator's control.

### 3. Deliver and retain reports

After storing a report, an Edge Function sends one transactional email to `hello@attribut.me` through Resend using a server-side `RESEND_API_KEY`. The email includes report ID, source, reason, reported text, relevant participant IDs, and timestamp; it excludes auth tokens and secrets. Include the report ID as an idempotency key to prevent duplicate mail on retries. Save delivery status, attempt count, last attempt, and a short failure detail without exposing it to clients. If email delivery fails, keep the report queued in Supabase for retry and return a receipt indicating that it was saved for delivery.

Provide a retry action in the admin moderation section and a scheduled retry mechanism for transient failures. The retry path is admin-authorized and idempotent. The configured sender must use a verified `attribut.me` sender identity, with replies directed to `hello@attribut.me`. A scheduled purge removes reports at the 12-month expiry even if they are unresolved; the operator must retain any case separately if further retention is needed.

### 4. Keep existing block behavior

Keep current blocking for Dallas App Buddy connections and expose it alongside reporting where appropriate. Blocking remains separate from reporting and takes effect through the existing connection state. Do not automatically block a reported sender or alter external-partner relationships as a side effect of reporting.

### 5. Admin-only moderation section

Add a Moderation screen in the signed-in mobile app. It is discoverable only to admins, and its route also checks authorization before rendering any report data. The screen provides a queue with status filters, a report detail view with the reported text, reason, source, timestamp, and relevant account/connection context, plus delivery status and retry. Admins can mark a report in review, resolve it, or dismiss it with an internal note; they can soft-remove the reported message and suspend a Dallas account with a required reason. Suspension applies only to Dallas accounts, not external check-in partners. Reporting alone never triggers either action.

There is no admin identity mechanism today. Add `profiles.user_role text not null default 'user' check (user_role in ('user', 'admin'))`; the existing new-user profile trigger relies on this default so every signup starts as `user`, regardless of client-supplied signup metadata. Admin status may be set only by directly updating the `profiles` row inside the Supabase database (for example, running SQL in the Supabase SQL Editor); do not provide an app, Edge Function, Auth API, or other provisioning path. Normal authenticated clients must be unable to insert or update `user_role`, including through the current own-profile upsert flow. Enforce this in the database, not only in the UI: use a database guard for role writes plus suitable profile insert/update policy constraints, and verify the Supabase execution role behavior against current docs before implementation. Do not accept an admin role from editable `user_metadata` or from app-provided values. A protected Edge Function obtains the authenticated user ID and reads `profiles.user_role` with a privileged server client before returning report data or performing any moderation action. Client navigation gating only controls discoverability; every backend read/write independently checks the database role. Admin actions are recorded in an append-only audit log with actor, action, report/message/account IDs, reason, and timestamp. The first admin must be provisioned by a direct database update.

Removing a message is a reversible soft removal: preserve the original snapshot privately for the same 12-month report retention, hide it from participant chat/reply views, and show a neutral “removed by moderation” marker. Suspending an account prevents further sign-in and messaging through Supabase Auth ban controls. Record the reason and expiry or indefinite status; allow an admin to lift a suspension, also audited. Do not delete an account or its unrelated recovery content as a moderation action.

### 6. Public support and privacy information

Update the public home/support contact presentation and privacy statement to show `hello@attribut.me`, explain that users can report either kind of message, describe what is included in a report and who receives it, and explain retention/deletion handling. Remove stale build-number/privacy-copy claims that imply the page documents a specific test build. Keep Dallas's existing language that it is not a crisis service and avoid claims about diagnosis, treatment, monitoring, emergency response, or guaranteed reply times.

## Data and security

- Add a migration for the private reports table, delivery fields, RLS, indexes, and grants; mirror it in `supabase/schema.sql`.
- Keep RLS enabled. Authenticated access must not allow reading reports, changing reporter/subject IDs, or modifying delivery state. Use narrowly scoped Edge Function service-role access after validating the caller and source record.
- Keep reports and the moderation audit log inaccessible to ordinary clients; admin reads and writes go through role-checked Edge Functions.
- `profiles.user_role` defaults to `user` and can be set to `admin` only by a direct database update in Supabase. RLS and a database guard prevent profile clients from promoting themselves or another user.
- Restrict profile column grants so signed-in clients can update normal profile fields but cannot insert or update `user_role`.
- Restrict authenticated message-table writes so a modified client cannot bypass server-side filtering or impersonate an external partner reply.
- Keep audit records for 12 months and apply account-deletion redaction to user ID links without allowing report evidence or audit rows to cascade away.
- Use enum/check constraints for the source and delivery status, bounded message snapshot/reason sizes, and indexes for pending email delivery.
- Update account deletion to null the reporter and/or subject IDs on applicable reports without removing their evidence before the 12-month expiry.
- Do not put the Resend key in Expo configuration or the web bundle.

## Failure behavior

- Filter rejection: nothing is persisted or notified; user can edit the message.
- Invalid report source or non-participant: reject without disclosing another user's data.
- Report persistence failure: show a failure state and do not claim that the report was submitted.
- Email failure after report persistence: acknowledge saved report and queue it for retry.
- Duplicate report request: idempotent handling returns the existing receipt and avoids duplicate email.
- Retry failures remain queued with bounded backoff and operator-visible delivery status.
- Reports and message snapshots are automatically purged 12 months after submission, including unresolved reports.

## User experience and acceptance criteria

1. Both message creation paths reject the same prohibited content on the server before insertion.
2. A Buddy Check-in user can report an incoming message from either source with a reason and confirmation disclosure.
3. A report is accepted only when its source record is actually incoming to and visible to that reporter.
4. Reports are stored privately; client reads cannot retrieve message snapshots or delivery details.
5. Successful delivery sends one message to `hello@attribut.me`; failure retains the report for retry without losing its receipt.
6. Existing Dallas buddy blocking remains available and independent of report submission.
7. Non-admin users cannot see the Moderation entry or retrieve reports or invoke any moderation action, even by calling Edge Functions directly.
8. Admins can review, resolve/dismiss, retry email, soft-remove a reported message, suspend a Dallas account, and lift a suspension; each action is audited.
9. Removed messages disappear from ordinary chat views and can be restored by an admin.
10. Public support and privacy pages accurately describe reporting, email routing, and retention.
11. Account deletion follows the disclosed report and audit retention policy.

## Release prerequisites and limitations

- Verify `hello@attribut.me` can receive email, and configure a verified sender and `RESEND_API_KEY` in Supabase secrets before enabling report email in production.
- App Store review notes should explain how reports are reviewed and provide a working reviewer contact. At least one trusted admin account must be provisioned before release and available to the operator.
- App Store Connect metadata, screenshots, age rating, privacy disclosures, review contact, and explicit App Review submission remain separate release tasks. The earlier queued build predates these changes and is not suitable for App Review.
- Exercise both report paths, non-admin rejection for every moderation endpoint, admin case actions and audit logging, report delivery failure/retry, account deletion behavior, and both message filters in a development Supabase project before deploying.
