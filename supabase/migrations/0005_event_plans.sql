create table if not exists public.event_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_name text not null default '',
  event_date text not null default '',
  event_location text not null default '',
  event_who text not null default '',
  last_time text not null default '',
  body_warning text not null default '',
  ideal_outcome text not null default '',
  mantra text not null default '',
  phone_background text not null default '',
  reminder_1 text not null default '',
  reminder_2 text not null default '',
  reminder_3 text not null default '',
  anchor_1_name text not null default '',
  anchor_1_when text not null default '',
  anchor_2_name text not null default '',
  anchor_2_when text not null default '',
  questions_for_me text not null default '',
  what_to_say text not null default '',
  pre_arrival text not null default '',
  arrival_anchor text not null default '',
  mid_body text not null default '',
  mid_need text not null default '',
  the_line text not null default '',
  departure_decision text not null default '',
  call_who text not null default '',
  call_when text not null default '',
  call_what text not null default '',
  decompression text not null default '',
  what_worked text not null default '',
  what_surprised text not null default '',
  what_change text not null default '',
  revealed text not null default '',
  debrief_date text not null default '',
  debrief_who text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists event_plans_user_id_updated_at_idx
  on public.event_plans (user_id, updated_at desc);

alter table public.event_plans enable row level security;

drop policy if exists "Users can manage their own event plans" on public.event_plans;
create policy "Users can manage their own event plans"
  on public.event_plans
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists set_event_plans_updated_at on public.event_plans;
create trigger set_event_plans_updated_at
  before update on public.event_plans
  for each row execute function public.set_updated_at();
