-- Dallas App consolidated Supabase schema
-- Run this on a fresh Supabase project, or rerun it to align an existing project
-- with the current app schema. It is designed to be non-destructive.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  email text,
  accountability_pin text,
  phone_number text,
  avatar_path text,
  home_cover_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.recovery_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  high_risk_situation text,
  personal_vision text,
  coping_steps jsonb not null default '[]'::jsonb,
  accountability_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accountability_partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  phone text,
  email text,
  mobile_number text,
  location text,
  time_zone text,
  relationship text,
  notes text,
  avatar_path text,
  partner_kind text not null default 'external' check (partner_kind in ('external', 'dallas_user')),
  connected_user_id uuid references auth.users(id) on delete set null,
  app_connection_id uuid,
  check_in_at timestamptz,
  invited_at timestamptz,
  last_notified_at timestamptz,
  consent_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.accountability_check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references public.accountability_partners(id) on delete cascade,
  completed_at timestamptz not null default now(),
  note text,
  created_at timestamptz not null default now()
);

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

create table if not exists public.accountability_check_in_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  partner_id uuid not null references public.accountability_partners(id) on delete cascade,
  planned_check_in_id uuid references public.accountability_planned_check_ins(id) on delete set null,
  partner_token uuid not null default gen_random_uuid() unique,
  user_display_name text,
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

create table if not exists public.accountability_app_connections (
  id uuid primary key default gen_random_uuid(),
  requester_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester_user_id <> recipient_user_id)
);

create table if not exists public.accountability_app_messages (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.accountability_app_connections(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique,
  platform text not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.prophetic_visions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  short_version text not null default '',
  long_version text not null default '',
  audio_path text,
  audio_file_name text,
  cover_image_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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
  event_reminders jsonb not null default '[]'::jsonb,
  anchor_1_name text not null default '',
  anchor_1_when text not null default '',
  anchor_1_questions text not null default '',
  anchor_1_response text not null default '',
  anchor_2_name text not null default '',
  anchor_2_when text not null default '',
  anchor_2_questions text not null default '',
  anchor_2_response text not null default '',
  questions_for_me text not null default '',
  what_to_say text not null default '',
  pre_arrival text not null default '',
  arrival_anchor text not null default '',
  arrival_check_in_time text not null default '',
  mid_body text not null default '',
  mid_need text not null default '',
  mid_boundaries text not null default '',
  mid_event_check_in_time text not null default '',
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

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists email text,
  add column if not exists accountability_pin text,
  add column if not exists phone_number text,
  add column if not exists avatar_path text,
  add column if not exists home_cover_image_path text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.accountability_partners
  add column if not exists mobile_number text,
  add column if not exists location text,
  add column if not exists time_zone text,
  add column if not exists relationship text,
  add column if not exists notes text,
  add column if not exists avatar_path text,
  add column if not exists partner_kind text not null default 'external',
  add column if not exists connected_user_id uuid references auth.users(id) on delete set null,
  add column if not exists app_connection_id uuid references public.accountability_app_connections(id) on delete set null,
  add column if not exists check_in_at timestamptz,
  add column if not exists invited_at timestamptz,
  add column if not exists last_notified_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

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

alter table public.accountability_partners
  drop constraint if exists accountability_partners_app_connection_id_fkey;

alter table public.accountability_partners
  add constraint accountability_partners_app_connection_id_fkey
  foreign key (app_connection_id)
  references public.accountability_app_connections(id)
  on delete set null;

alter table public.accountability_planned_check_ins
  add column if not exists notification_id text;

alter table public.prophetic_visions
  add column if not exists short_version text not null default '',
  add column if not exists long_version text not null default '',
  add column if not exists audio_path text,
  add column if not exists audio_file_name text,
  add column if not exists cover_image_path text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.event_plans
  add column if not exists event_name text not null default '',
  add column if not exists event_date text not null default '',
  add column if not exists event_location text not null default '',
  add column if not exists event_who text not null default '',
  add column if not exists last_time text not null default '',
  add column if not exists body_warning text not null default '',
  add column if not exists ideal_outcome text not null default '',
  add column if not exists mantra text not null default '',
  add column if not exists phone_background text not null default '',
  add column if not exists reminder_1 text not null default '',
  add column if not exists reminder_2 text not null default '',
  add column if not exists reminder_3 text not null default '',
  add column if not exists event_reminders jsonb not null default '[]'::jsonb,
  add column if not exists anchor_1_name text not null default '',
  add column if not exists anchor_1_when text not null default '',
  add column if not exists anchor_1_questions text not null default '',
  add column if not exists anchor_1_response text not null default '',
  add column if not exists anchor_2_name text not null default '',
  add column if not exists anchor_2_when text not null default '',
  add column if not exists anchor_2_questions text not null default '',
  add column if not exists anchor_2_response text not null default '',
  add column if not exists questions_for_me text not null default '',
  add column if not exists what_to_say text not null default '',
  add column if not exists pre_arrival text not null default '',
  add column if not exists arrival_anchor text not null default '',
  add column if not exists arrival_check_in_time text not null default '',
  add column if not exists mid_body text not null default '',
  add column if not exists mid_need text not null default '',
  add column if not exists mid_boundaries text not null default '',
  add column if not exists mid_event_check_in_time text not null default '',
  add column if not exists the_line text not null default '',
  add column if not exists departure_decision text not null default '',
  add column if not exists call_who text not null default '',
  add column if not exists call_when text not null default '',
  add column if not exists call_what text not null default '',
  add column if not exists decompression text not null default '',
  add column if not exists what_worked text not null default '',
  add column if not exists what_surprised text not null default '',
  add column if not exists what_change text not null default '',
  add column if not exists revealed text not null default '',
  add column if not exists debrief_date text not null default '',
  add column if not exists debrief_who text not null default '',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

create index if not exists recovery_plans_user_id_idx
  on public.recovery_plans (user_id);

create unique index if not exists profiles_accountability_pin_key
  on public.profiles (accountability_pin)
  where accountability_pin is not null;

create index if not exists profiles_email_idx
  on public.profiles (lower(email))
  where email is not null;

create index if not exists accountability_partners_user_id_idx
  on public.accountability_partners (user_id);

create index if not exists accountability_partners_app_connection_id_idx
  on public.accountability_partners (app_connection_id);

create index if not exists accountability_partners_connected_user_id_idx
  on public.accountability_partners (connected_user_id);

create index if not exists accountability_check_ins_user_id_completed_at_idx
  on public.accountability_check_ins (user_id, completed_at desc);

create index if not exists accountability_check_ins_partner_id_completed_at_idx
  on public.accountability_check_ins (partner_id, completed_at desc);

create index if not exists accountability_planned_check_ins_user_id_scheduled_at_idx
  on public.accountability_planned_check_ins (user_id, scheduled_at asc);

create index if not exists accountability_planned_check_ins_partner_id_scheduled_at_idx
  on public.accountability_planned_check_ins (partner_id, scheduled_at asc);

create index if not exists accountability_check_in_threads_user_id_updated_at_idx
  on public.accountability_check_in_threads (user_id, updated_at desc);

create index if not exists accountability_check_in_threads_partner_token_idx
  on public.accountability_check_in_threads (partner_token);

create index if not exists accountability_check_in_messages_thread_id_created_at_idx
  on public.accountability_check_in_messages (thread_id, created_at asc);

create index if not exists accountability_check_in_messages_user_id_created_at_idx
  on public.accountability_check_in_messages (user_id, created_at desc);

create unique index if not exists accountability_app_connections_pair_key
  on public.accountability_app_connections (
    least(requester_user_id, recipient_user_id),
    greatest(requester_user_id, recipient_user_id)
  );

create index if not exists accountability_app_messages_connection_id_created_at_idx
  on public.accountability_app_messages (connection_id, created_at asc);

create index if not exists accountability_app_messages_sender_user_id_idx
  on public.accountability_app_messages (sender_user_id);

create index if not exists push_tokens_user_id_idx
  on public.push_tokens (user_id);

create index if not exists prophetic_visions_user_id_updated_at_idx
  on public.prophetic_visions (user_id, updated_at desc);

create index if not exists event_plans_user_id_updated_at_idx
  on public.event_plans (user_id, updated_at desc);

alter table public.profiles enable row level security;
alter table public.recovery_plans enable row level security;
alter table public.accountability_partners enable row level security;
alter table public.accountability_check_ins enable row level security;
alter table public.accountability_planned_check_ins enable row level security;
alter table public.accountability_check_in_threads enable row level security;
alter table public.accountability_check_in_messages enable row level security;
alter table public.accountability_app_connections enable row level security;
alter table public.accountability_app_messages enable row level security;
alter table public.push_tokens enable row level security;
alter table public.prophetic_visions enable row level security;
alter table public.event_plans enable row level security;

drop policy if exists "Users can manage their own profile" on public.profiles;
create policy "Users can manage their own profile"
  on public.profiles
  for all
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

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

drop policy if exists "Users can manage their own recovery plans" on public.recovery_plans;
create policy "Users can manage their own recovery plans"
  on public.recovery_plans
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own accountability partners" on public.accountability_partners;
create policy "Users can manage their own accountability partners"
  on public.accountability_partners
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own accountability check-ins" on public.accountability_check_ins;
create policy "Users can manage their own accountability check-ins"
  on public.accountability_check_ins
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own planned accountability check-ins" on public.accountability_planned_check_ins;
create policy "Users can manage their own planned accountability check-ins"
  on public.accountability_planned_check_ins
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

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

drop policy if exists "Users can manage their own push tokens" on public.push_tokens;
create policy "Users can manage their own push tokens"
  on public.push_tokens
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own prophetic vision" on public.prophetic_visions;
create policy "Users can manage their own prophetic vision"
  on public.prophetic_visions
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can manage their own event plans" on public.event_plans;
create policy "Users can manage their own event plans"
  on public.event_plans
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

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

drop trigger if exists on_auth_user_created_create_profile on auth.users;
create trigger on_auth_user_created_create_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists set_recovery_plans_updated_at on public.recovery_plans;
create trigger set_recovery_plans_updated_at
  before update on public.recovery_plans
  for each row execute function public.set_updated_at();

drop trigger if exists set_accountability_partners_updated_at on public.accountability_partners;
create trigger set_accountability_partners_updated_at
  before update on public.accountability_partners
  for each row execute function public.set_updated_at();

drop trigger if exists set_accountability_planned_check_ins_updated_at on public.accountability_planned_check_ins;
create trigger set_accountability_planned_check_ins_updated_at
  before update on public.accountability_planned_check_ins
  for each row execute function public.set_updated_at();

drop trigger if exists set_accountability_check_in_threads_updated_at on public.accountability_check_in_threads;
create trigger set_accountability_check_in_threads_updated_at
  before update on public.accountability_check_in_threads
  for each row execute function public.set_updated_at();

drop trigger if exists set_accountability_app_connections_updated_at on public.accountability_app_connections;
create trigger set_accountability_app_connections_updated_at
  before update on public.accountability_app_connections
  for each row execute function public.set_updated_at();

drop trigger if exists set_prophetic_visions_updated_at on public.prophetic_visions;
create trigger set_prophetic_visions_updated_at
  before update on public.prophetic_visions
  for each row execute function public.set_updated_at();

drop trigger if exists set_event_plans_updated_at on public.event_plans;
create trigger set_event_plans_updated_at
  before update on public.event_plans
  for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('accountability-avatars', 'accountability-avatars', true),
  ('home-covers', 'home-covers', true),
  ('prophetic-vision-covers', 'prophetic-vision-covers', true),
  ('prophetic-vision-audio', 'prophetic-vision-audio', false)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public;

drop policy if exists "Avatar images are publicly readable" on storage.objects;
create policy "Avatar images are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'avatars');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects
  for insert
  with check (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects
  for update
  using (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects
  for delete
  using (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Accountability avatars are publicly readable" on storage.objects;
create policy "Accountability avatars are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'accountability-avatars');

drop policy if exists "Users can upload their own accountability avatars" on storage.objects;
create policy "Users can upload their own accountability avatars"
  on storage.objects
  for insert
  with check (
    bucket_id = 'accountability-avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own accountability avatars" on storage.objects;
create policy "Users can update their own accountability avatars"
  on storage.objects
  for update
  using (
    bucket_id = 'accountability-avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'accountability-avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their own accountability avatars" on storage.objects;
create policy "Users can delete their own accountability avatars"
  on storage.objects
  for delete
  using (
    bucket_id = 'accountability-avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Home cover images are publicly readable" on storage.objects;
create policy "Home cover images are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'home-covers');

drop policy if exists "Users can upload their own home cover" on storage.objects;
create policy "Users can upload their own home cover"
  on storage.objects
  for insert
  with check (
    bucket_id = 'home-covers'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own home cover" on storage.objects;
create policy "Users can update their own home cover"
  on storage.objects
  for update
  using (
    bucket_id = 'home-covers'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'home-covers'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their own home cover" on storage.objects;
create policy "Users can delete their own home cover"
  on storage.objects
  for delete
  using (
    bucket_id = 'home-covers'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Prophetic Vision covers are publicly readable" on storage.objects;
create policy "Prophetic Vision covers are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'prophetic-vision-covers');

drop policy if exists "Users can upload their own Prophetic Vision cover" on storage.objects;
create policy "Users can upload their own Prophetic Vision cover"
  on storage.objects
  for insert
  with check (
    bucket_id = 'prophetic-vision-covers'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own Prophetic Vision cover" on storage.objects;
create policy "Users can update their own Prophetic Vision cover"
  on storage.objects
  for update
  using (
    bucket_id = 'prophetic-vision-covers'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'prophetic-vision-covers'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their own Prophetic Vision cover" on storage.objects;
create policy "Users can delete their own Prophetic Vision cover"
  on storage.objects
  for delete
  using (
    bucket_id = 'prophetic-vision-covers'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can read their own prophetic vision audio" on storage.objects;
create policy "Users can read their own prophetic vision audio"
  on storage.objects
  for select
  using (
    bucket_id = 'prophetic-vision-audio'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can upload their own prophetic vision audio" on storage.objects;
create policy "Users can upload their own prophetic vision audio"
  on storage.objects
  for insert
  with check (
    bucket_id = 'prophetic-vision-audio'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own prophetic vision audio" on storage.objects;
create policy "Users can update their own prophetic vision audio"
  on storage.objects
  for update
  using (
    bucket_id = 'prophetic-vision-audio'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'prophetic-vision-audio'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can delete their own prophetic vision audio" on storage.objects;
create policy "Users can delete their own prophetic vision audio"
  on storage.objects
  for delete
  using (
    bucket_id = 'prophetic-vision-audio'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
