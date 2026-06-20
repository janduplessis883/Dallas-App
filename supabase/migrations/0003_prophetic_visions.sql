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

alter table public.prophetic_visions enable row level security;

create policy "Users can manage their own prophetic vision"
  on public.prophetic_visions
  for all
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public)
values ('prophetic-vision-audio', 'prophetic-vision-audio', false)
on conflict (id) do update set public = excluded.public;

create policy "Users can read their own prophetic vision audio"
  on storage.objects
  for select
  using (
    bucket_id = 'prophetic-vision-audio'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

create policy "Users can upload their own prophetic vision audio"
  on storage.objects
  for insert
  with check (
    bucket_id = 'prophetic-vision-audio'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

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

create policy "Users can delete their own prophetic vision audio"
  on storage.objects
  for delete
  using (
    bucket_id = 'prophetic-vision-audio'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

insert into storage.buckets (id, name, public)
values ('prophetic-vision-covers', 'prophetic-vision-covers', true)
on conflict (id) do update set public = excluded.public;

create policy "Prophetic Vision covers are publicly readable"
  on storage.objects
  for select
  using (bucket_id = 'prophetic-vision-covers');

create policy "Users can upload their own Prophetic Vision cover"
  on storage.objects
  for insert
  with check (
    bucket_id = 'prophetic-vision-covers'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

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

create policy "Users can delete their own Prophetic Vision cover"
  on storage.objects
  for delete
  using (
    bucket_id = 'prophetic-vision-covers'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );
