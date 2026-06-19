create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  phone_number text,
  avatar_path text,
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
  consent_confirmed_at timestamptz,
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

alter table public.profiles enable row level security;
alter table public.recovery_plans enable row level security;
alter table public.accountability_partners enable row level security;
alter table public.push_tokens enable row level security;
alter table public.prophetic_visions enable row level security;

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

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
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

drop policy if exists "Profetic Vision covers are publicly readable" on storage.objects;
create policy "Profetic Vision covers are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'prophetic-vision-covers');

drop policy if exists "Users can upload their own Profetic Vision cover" on storage.objects;
create policy "Users can upload their own Profetic Vision cover"
  on storage.objects
  for insert
  with check (
    bucket_id = 'prophetic-vision-covers'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own Profetic Vision cover" on storage.objects;
create policy "Users can update their own Profetic Vision cover"
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

drop policy if exists "Users can delete their own Profetic Vision cover" on storage.objects;
create policy "Users can delete their own Profetic Vision cover"
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
