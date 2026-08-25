create table if not exists public.recovery_reminders (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  message text not null default '' check (char_length(message) <= 1000),
  scheduled_at timestamptz not null,
  time_zone text not null,
  enabled boolean not null default true,
  status text not null default 'scheduled' check (status in ('scheduled', 'processing', 'delivered', 'cancelled')),
  snoozed_until date,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  next_attempt_at timestamptz not null default now(),
  processing_started_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recovery_reminders_due_idx
  on public.recovery_reminders (next_attempt_at)
  where enabled and status in ('scheduled', 'processing');

alter table public.recovery_reminders enable row level security;

drop policy if exists "Users can manage their own recovery reminders" on public.recovery_reminders;
create policy "Users can manage their own recovery reminders"
  on public.recovery_reminders
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.claim_due_recovery_reminders(batch_size integer default 100)
returns table (
  id text,
  user_id uuid,
  title text,
  message text,
  attempt_count integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select reminder.id
    from public.recovery_reminders reminder
    where reminder.enabled
      and reminder.next_attempt_at <= now()
      and (
        reminder.status = 'scheduled'
        or (reminder.status = 'processing' and reminder.processing_started_at < now() - interval '10 minutes')
      )
      and reminder.scheduled_at <= now()
      and reminder.scheduled_at > now() - interval '24 hours'
    order by reminder.scheduled_at
    for update skip locked
    limit greatest(1, least(batch_size, 100))
  )
  update public.recovery_reminders reminder
  set
    attempt_count = reminder.attempt_count + 1,
    processing_started_at = now(),
    status = 'processing',
    updated_at = now()
  from due
  where reminder.id = due.id
  returning reminder.id, reminder.user_id, reminder.title, reminder.message, reminder.attempt_count;
end;
$$;

revoke all on function public.claim_due_recovery_reminders(integer) from public;
grant execute on function public.claim_due_recovery_reminders(integer) to service_role;

-- After deploying the `send-recovery-reminders` Edge Function, create the two Vault
-- secrets and cron job below in the Supabase SQL editor. The project URL and key are
-- deliberately not committed to source control.
--
-- select vault.create_secret('https://<project-ref>.supabase.co', 'dallas_recovery_reminders_project_url');
-- select vault.create_secret('<publishable-key>', 'dallas_recovery_reminders_publishable_key');
-- select cron.schedule(
--   'send-recovery-reminders-every-minute',
--   '* * * * *',
--   $$ select net.http_post(
--     url := (select decrypted_secret from vault.decrypted_secrets where name = 'dallas_recovery_reminders_project_url') || '/functions/v1/send-recovery-reminders',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'dallas_recovery_reminders_publishable_key'),
--       'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'dallas_recovery_reminders_publishable_key')
--     ),
--     body := '{}'::jsonb
--   ); $$
-- );
