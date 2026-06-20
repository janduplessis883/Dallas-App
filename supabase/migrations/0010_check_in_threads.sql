create table if not exists public.accountability_check_in_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references public.accountability_partners(id) on delete cascade,
  planned_check_in_id uuid references public.accountability_planned_check_ins(id) on delete set null,
  partner_token uuid not null default gen_random_uuid() unique,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accountability_check_in_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references public.accountability_partners(id) on delete cascade,
  thread_id uuid not null references public.accountability_check_in_threads(id) on delete cascade,
  sender_type text not null check (sender_type in ('user', 'partner')),
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists accountability_check_in_threads_user_id_updated_at_idx
  on public.accountability_check_in_threads (user_id, updated_at desc);

create index if not exists accountability_check_in_threads_partner_token_idx
  on public.accountability_check_in_threads (partner_token);

create index if not exists accountability_check_in_messages_thread_id_created_at_idx
  on public.accountability_check_in_messages (thread_id, created_at asc);

create index if not exists accountability_check_in_messages_user_id_created_at_idx
  on public.accountability_check_in_messages (user_id, created_at desc);

alter table public.accountability_check_in_threads enable row level security;
alter table public.accountability_check_in_messages enable row level security;

drop policy if exists "Users can manage their own check-in threads" on public.accountability_check_in_threads;
create policy "Users can manage their own check-in threads"
  on public.accountability_check_in_threads
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own check-in messages" on public.accountability_check_in_messages;
create policy "Users can manage their own check-in messages"
  on public.accountability_check_in_messages
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop trigger if exists set_accountability_check_in_threads_updated_at on public.accountability_check_in_threads;
create trigger set_accountability_check_in_threads_updated_at
  before update on public.accountability_check_in_threads
  for each row execute function public.set_updated_at();
