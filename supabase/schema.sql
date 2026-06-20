-- Dallas App consolidated Supabase schema
-- Run this on a fresh Supabase project, or rerun it to align an existing project
-- with the current app schema. It is designed to be non-destructive.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
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

alter table public.profiles
  add column if not exists display_name text,
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
  add column if not exists check_in_at timestamptz,
  add column if not exists invited_at timestamptz,
  add column if not exists last_notified_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

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
  add column if not exists anchor_1_name text not null default '',
  add column if not exists anchor_1_when text not null default '',
  add column if not exists anchor_2_name text not null default '',
  add column if not exists anchor_2_when text not null default '',
  add column if not exists questions_for_me text not null default '',
  add column if not exists what_to_say text not null default '',
  add column if not exists pre_arrival text not null default '',
  add column if not exists arrival_anchor text not null default '',
  add column if not exists mid_body text not null default '',
  add column if not exists mid_need text not null default '',
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

create index if not exists accountability_partners_user_id_idx
  on public.accountability_partners (user_id);

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
alter table public.push_tokens enable row level security;
alter table public.prophetic_visions enable row level security;
alter table public.event_plans enable row level security;

drop policy if exists "Users can manage their own profile" on public.profiles;
create policy "Users can manage their own profile"
  on public.profiles
  for all
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

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
  insert into public.profiles (id, display_name, phone_number)
  values (
    new.id,
    nullif(new.raw_user_meta_data->>'preferred_name', ''),
    nullif(new.raw_user_meta_data->>'phone_number', '')
  )
  on conflict (id) do update
    set display_name = coalesce(public.profiles.display_name, excluded.display_name),
        phone_number = coalesce(public.profiles.phone_number, excluded.phone_number),
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
