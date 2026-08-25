create table public.accountability_app_invitations (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled', 'blocked')),
  responded_at timestamptz,
  cancelled_at timestamptz,
  blocked_by_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_user_id <> recipient_user_id)
);

create unique index accountability_app_invitations_one_pending_pair_idx
  on public.accountability_app_invitations (least(requester_user_id, recipient_user_id), greatest(requester_user_id, recipient_user_id))
  where status = 'pending';
create index accountability_app_invitations_recipient_status_idx
  on public.accountability_app_invitations (recipient_user_id, status, created_at desc);

alter table public.accountability_app_invitations enable row level security;
create policy "Users can view their Dallas buddy invitations"
  on public.accountability_app_invitations for select
  using ((select auth.uid()) in (requester_user_id, recipient_user_id));

alter table public.accountability_app_connections
  add column if not exists blocked_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists blocked_at timestamptz;
