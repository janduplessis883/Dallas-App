alter table public.accountability_check_in_threads
  add column if not exists partner_token_expires_at timestamptz;

update public.accountability_check_in_threads
set partner_token_expires_at = created_at + interval '14 days'
where partner_token_expires_at is null;

alter table public.accountability_check_in_threads
  alter column partner_token_expires_at set default (now() + interval '14 days'),
  alter column partner_token_expires_at set not null;

create table if not exists public.accountability_check_in_reply_rate_limits (
  thread_id uuid not null references public.accountability_check_in_threads(id) on delete cascade,
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  primary key (thread_id, window_started_at)
);

alter table public.accountability_check_in_reply_rate_limits enable row level security;

create or replace function public.consume_check_in_reply_rate_limit(
  p_thread_id uuid,
  p_limit integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_window_started_at timestamptz;
  v_request_count integer;
begin
  if p_limit < 1 or p_window_seconds < 1 then
    raise exception 'Rate-limit values must be positive.';
  end if;

  v_window_started_at := to_timestamp(
    floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds
  );

  insert into public.accountability_check_in_reply_rate_limits as rate_limit (
    thread_id,
    window_started_at,
    request_count
  )
  values (p_thread_id, v_window_started_at, 1)
  on conflict (thread_id, window_started_at) do update
    set request_count = rate_limit.request_count + 1
    where rate_limit.request_count < p_limit
  returning request_count into v_request_count;

  return found;
end;
$$;

revoke all on function public.consume_check_in_reply_rate_limit(uuid, integer, integer) from public;
grant execute on function public.consume_check_in_reply_rate_limit(uuid, integer, integer) to service_role;
