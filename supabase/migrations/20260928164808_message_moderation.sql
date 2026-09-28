-- User roles, private reports, audit records, and protected message writes.

alter table public.profiles
  add column if not exists user_role text not null default 'user';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'profiles_user_role_check'
      and conrelid = 'public.profiles'::regclass
  ) then
    alter table public.profiles
      add constraint profiles_user_role_check check (user_role in ('user', 'admin'));
  end if;
end;
$$;

-- Clients may edit ordinary profile fields only. Direct SQL in Supabase can
-- still assign the admin role; clients and the app cannot.
revoke insert, update, delete on table public.profiles from public, anon, authenticated;
grant select on table public.profiles to authenticated;
grant insert (id, display_name, phone_number, avatar_path, home_cover_image_path, updated_at)
  on public.profiles to authenticated;
grant update (display_name, phone_number, avatar_path, home_cover_image_path, updated_at)
  on public.profiles to authenticated;

alter table public.accountability_app_messages
  add column if not exists moderation_removed_at timestamptz;

alter table public.accountability_check_in_messages
  add column if not exists moderation_removed_at timestamptz;

-- Buddy messages must go through accountability-app so server filtering cannot
-- be bypassed with a direct Data API insert. Clients may only update read_at.
drop policy if exists "Users can create Dallas accountability messages" on public.accountability_app_messages;
revoke insert, update, delete on table public.accountability_app_messages from public, anon, authenticated;
grant update (read_at) on public.accountability_app_messages to authenticated;

-- External partner replies are inserted by check-in-reply with service-role
-- credentials. Signed-in users may insert their own outbound ('user') notes and
-- mark reply rows read, but cannot impersonate a partner or change message text.
drop policy if exists "Users can manage their own check-in messages" on public.accountability_check_in_messages;
drop policy if exists "Users can read their own check-in messages" on public.accountability_check_in_messages;
drop policy if exists "Users can add outbound check-in messages" on public.accountability_check_in_messages;
drop policy if exists "Users can mark their own check-in messages read" on public.accountability_check_in_messages;
create policy "Users can read their own check-in messages"
  on public.accountability_check_in_messages
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
create policy "Users can add outbound check-in messages"
  on public.accountability_check_in_messages
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id and sender_type = 'user');
create policy "Users can mark their own check-in messages read"
  on public.accountability_check_in_messages
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
revoke insert, update, delete on table public.accountability_check_in_messages from public, anon, authenticated;
grant select on table public.accountability_check_in_messages to authenticated;
grant insert (user_id, partner_id, thread_id, sender_type, body)
  on public.accountability_check_in_messages to authenticated;
grant update (read_at) on public.accountability_check_in_messages to authenticated;

create table if not exists public.moderation_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_user_id uuid references auth.users(id) on delete set null,
  subject_user_id uuid references auth.users(id) on delete set null,
  source text not null check (source in ('buddy_message', 'external_check_in_reply')),
  source_message_id uuid not null,
  request_key uuid not null unique,
  reason text not null check (char_length(trim(reason)) between 1 and 500),
  message_snapshot text not null check (char_length(message_snapshot) between 1 and 1000),
  status text not null default 'new' check (status in ('new', 'in_review', 'resolved', 'dismissed')),
  review_note text check (review_note is null or char_length(review_note) <= 2000),
  email_status text not null default 'queued' check (email_status in ('queued', 'sent')),
  email_attempt_count integer not null default 0 check (email_attempt_count >= 0),
  email_next_attempt_at timestamptz not null default now(),
  email_sent_at timestamptz,
  email_last_error text check (email_last_error is null or char_length(email_last_error) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 months')
);

create index if not exists moderation_reports_status_created_at_idx
  on public.moderation_reports (status, created_at desc);
create index if not exists moderation_reports_email_retry_idx
  on public.moderation_reports (email_next_attempt_at)
  where email_status = 'queued';
create index if not exists moderation_reports_expires_at_idx
  on public.moderation_reports (expires_at);

create table if not exists public.moderation_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  report_id uuid references public.moderation_reports(id) on delete set null,
  action text not null check (action in (
    'report_submitted', 'report_reviewed', 'report_resolved', 'report_dismissed',
    'email_retry', 'message_removed', 'message_restored', 'account_suspended',
    'account_reinstated'
  )),
  reason text check (reason is null or char_length(reason) <= 2000),
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '12 months')
);

create index if not exists moderation_audit_log_expires_at_idx
  on public.moderation_audit_log (expires_at);
create index if not exists moderation_audit_log_report_id_created_at_idx
  on public.moderation_audit_log (report_id, created_at desc);

alter table public.moderation_reports enable row level security;
alter table public.moderation_audit_log enable row level security;
revoke all on table public.moderation_reports, public.moderation_audit_log from public, anon, authenticated;
grant all on table public.moderation_reports, public.moderation_audit_log to service_role;

drop trigger if exists set_moderation_reports_updated_at on public.moderation_reports;
create trigger set_moderation_reports_updated_at
  before update on public.moderation_reports
  for each row execute function public.set_updated_at();
