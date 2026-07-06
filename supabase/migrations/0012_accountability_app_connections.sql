alter table public.profiles
  add column if not exists email text,
  add column if not exists accountability_pin text;

create unique index if not exists profiles_accountability_pin_key
  on public.profiles (accountability_pin)
  where accountability_pin is not null;

create index if not exists profiles_email_idx
  on public.profiles (lower(email))
  where email is not null;

alter table public.accountability_partners
  add column if not exists partner_kind text not null default 'external',
  add column if not exists connected_user_id uuid references auth.users(id) on delete set null,
  add column if not exists app_connection_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'accountability_partners_partner_kind_check'
  ) then
    alter table public.accountability_partners
      add constraint accountability_partners_partner_kind_check
      check (partner_kind in ('external', 'dallas_user'));
  end if;
end $$;

create table if not exists public.accountability_app_connections (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint accountability_app_connections_not_self_check
    check (requester_user_id <> recipient_user_id),
  constraint accountability_app_connections_status_check
    check (status in ('active', 'blocked'))
);

create unique index if not exists accountability_app_connections_pair_key
  on public.accountability_app_connections (
    least(requester_user_id, recipient_user_id),
    greatest(requester_user_id, recipient_user_id)
  );

alter table public.accountability_partners
  drop constraint if exists accountability_partners_app_connection_id_fkey;

alter table public.accountability_partners
  add constraint accountability_partners_app_connection_id_fkey
  foreign key (app_connection_id)
  references public.accountability_app_connections(id)
  on delete set null;

create index if not exists accountability_partners_app_connection_id_idx
  on public.accountability_partners (app_connection_id);

create index if not exists accountability_partners_connected_user_id_idx
  on public.accountability_partners (connected_user_id);

create table if not exists public.accountability_app_messages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.accountability_app_connections(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists accountability_app_messages_connection_id_created_at_idx
  on public.accountability_app_messages (connection_id, created_at asc);

create index if not exists accountability_app_messages_sender_user_id_idx
  on public.accountability_app_messages (sender_user_id);

alter table public.accountability_app_connections enable row level security;
alter table public.accountability_app_messages enable row level security;

drop policy if exists "Users can view their Dallas accountability connections" on public.accountability_app_connections;
create policy "Users can view their Dallas accountability connections"
  on public.accountability_app_connections
  for select
  using ((select auth.uid()) in (requester_user_id, recipient_user_id));

drop policy if exists "Users can create their Dallas accountability connections" on public.accountability_app_connections;
create policy "Users can create their Dallas accountability connections"
  on public.accountability_app_connections
  for insert
  with check ((select auth.uid()) in (requester_user_id, recipient_user_id));

drop policy if exists "Users can update their Dallas accountability connections" on public.accountability_app_connections;
create policy "Users can update their Dallas accountability connections"
  on public.accountability_app_connections
  for update
  using ((select auth.uid()) in (requester_user_id, recipient_user_id))
  with check ((select auth.uid()) in (requester_user_id, recipient_user_id));

drop policy if exists "Users can view Dallas accountability messages" on public.accountability_app_messages;
create policy "Users can view Dallas accountability messages"
  on public.accountability_app_messages
  for select
  using (
    exists (
      select 1
      from public.accountability_app_connections connection
      where connection.id = connection_id
        and (select auth.uid()) in (connection.requester_user_id, connection.recipient_user_id)
    )
  );

drop policy if exists "Users can create Dallas accountability messages" on public.accountability_app_messages;
create policy "Users can create Dallas accountability messages"
  on public.accountability_app_messages
  for insert
  with check (
    sender_user_id = (select auth.uid())
    and exists (
      select 1
      from public.accountability_app_connections connection
      where connection.id = connection_id
        and (select auth.uid()) in (connection.requester_user_id, connection.recipient_user_id)
    )
  );

drop policy if exists "Users can mark Dallas accountability messages read" on public.accountability_app_messages;
create policy "Users can mark Dallas accountability messages read"
  on public.accountability_app_messages
  for update
  using (
    exists (
      select 1
      from public.accountability_app_connections connection
      where connection.id = connection_id
        and (select auth.uid()) in (connection.requester_user_id, connection.recipient_user_id)
    )
  )
  with check (
    exists (
      select 1
      from public.accountability_app_connections connection
      where connection.id = connection_id
        and (select auth.uid()) in (connection.requester_user_id, connection.recipient_user_id)
    )
  );

drop policy if exists "Connected Dallas buddies can view profile basics" on public.profiles;
create policy "Connected Dallas buddies can view profile basics"
  on public.profiles
  for select
  using (
    (select auth.uid()) = id
    or exists (
      select 1
      from public.accountability_app_connections connection
      where connection.status = 'active'
        and (
          (connection.requester_user_id = (select auth.uid()) and connection.recipient_user_id = id)
          or (connection.recipient_user_id = (select auth.uid()) and connection.requester_user_id = id)
        )
    )
  );

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, phone_number, email)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'preferred_name', ''),
    nullif(new.raw_user_meta_data->>'phone_number', ''),
    lower(new.email)
  )
  on conflict (id) do update
    set display_name = coalesce(public.profiles.display_name, excluded.display_name),
        phone_number = coalesce(public.profiles.phone_number, excluded.phone_number),
        email = coalesce(public.profiles.email, excluded.email),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists set_accountability_app_connections_updated_at on public.accountability_app_connections;
create trigger set_accountability_app_connections_updated_at
  before update on public.accountability_app_connections
  for each row execute function public.set_updated_at();
