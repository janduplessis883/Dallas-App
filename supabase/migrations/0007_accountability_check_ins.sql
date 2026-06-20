create table if not exists public.accountability_check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references public.accountability_partners(id) on delete cascade,
  completed_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

create index if not exists accountability_check_ins_user_id_completed_at_idx
  on public.accountability_check_ins (user_id, completed_at desc);

create index if not exists accountability_check_ins_partner_id_completed_at_idx
  on public.accountability_check_ins (partner_id, completed_at desc);

alter table public.accountability_check_ins enable row level security;

drop policy if exists "Users can manage their own accountability check-ins" on public.accountability_check_ins;
create policy "Users can manage their own accountability check-ins"
  on public.accountability_check_ins
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
