create table if not exists public.accountability_planned_check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references public.accountability_partners(id) on delete cascade,
  scheduled_at timestamptz not null,
  notification_id text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.accountability_planned_check_ins
  add column if not exists notification_id text;

create index if not exists accountability_planned_check_ins_user_id_scheduled_at_idx
  on public.accountability_planned_check_ins (user_id, scheduled_at asc);

create index if not exists accountability_planned_check_ins_partner_id_scheduled_at_idx
  on public.accountability_planned_check_ins (partner_id, scheduled_at asc);

alter table public.accountability_planned_check_ins enable row level security;

drop policy if exists "Users can manage their own planned accountability check-ins" on public.accountability_planned_check_ins;
create policy "Users can manage their own planned accountability check-ins"
  on public.accountability_planned_check_ins
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists set_accountability_planned_check_ins_updated_at on public.accountability_planned_check_ins;
create trigger set_accountability_planned_check_ins_updated_at
  before update on public.accountability_planned_check_ins
  for each row execute function public.set_updated_at();
