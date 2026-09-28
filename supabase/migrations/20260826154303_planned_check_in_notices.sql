create table if not exists public.accountability_planned_check_in_notices (
  id uuid primary key default gen_random_uuid(),
  planned_check_in_id uuid not null references public.accountability_planned_check_ins(id) on delete cascade,
  connection_id uuid not null references public.accountability_app_connections(id) on delete cascade,
  planner_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_at timestamptz not null,
  note text,
  planner_display_name text not null default 'A Dallas buddy',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (planned_check_in_id)
);

create index if not exists accountability_planned_check_in_notices_recipient_scheduled_idx
  on public.accountability_planned_check_in_notices (recipient_user_id, scheduled_at);

alter table public.accountability_planned_check_in_notices enable row level security;

revoke all on table public.accountability_planned_check_in_notices from anon, authenticated;
grant select on table public.accountability_planned_check_in_notices to authenticated;

drop policy if exists "Recipients can view planned check-in notices" on public.accountability_planned_check_in_notices;
create policy "Recipients can view planned check-in notices"
  on public.accountability_planned_check_in_notices
  for select
  to authenticated
  using ((select auth.uid()) = recipient_user_id);

drop trigger if exists set_accountability_planned_check_in_notices_updated_at on public.accountability_planned_check_in_notices;
create trigger set_accountability_planned_check_in_notices_updated_at
  before update on public.accountability_planned_check_in_notices
  for each row execute function public.set_updated_at();
