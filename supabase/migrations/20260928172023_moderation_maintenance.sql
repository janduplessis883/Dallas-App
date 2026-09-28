-- Delete report snapshots and audit events after the disclosed 12-month period.
create or replace function public.purge_expired_moderation_data()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed_count integer;
begin
  delete from public.moderation_reports where expires_at <= now();
  get diagnostics removed_count = row_count;
  delete from public.moderation_audit_log where expires_at <= now();
  return removed_count;
end;
$$;
revoke all on function public.purge_expired_moderation_data() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'dallas-moderation-retention') then
    perform cron.unschedule('dallas-moderation-retention');
  end if;
  if exists (select 1 from cron.job where jobname = 'dallas-moderation-email-retry') then
    perform cron.unschedule('dallas-moderation-email-retry');
  end if;
end;
$$;

select cron.schedule(
  'dallas-moderation-retention',
  '17 3 * * *',
  $$select public.purge_expired_moderation_data();$$
);

select cron.schedule(
  'dallas-moderation-email-retry',
  '*/10 * * * *',
  $$select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'dallas_moderation_project_url') || '/functions/v1/retry-message-reports',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-moderation-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'dallas_moderation_cron_secret')
    ),
    body := '{}'::jsonb
  );$$
);
