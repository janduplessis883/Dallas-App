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

drop trigger if exists set_accountability_partners_updated_at on public.accountability_partners;
create trigger set_accountability_partners_updated_at
  before update on public.accountability_partners
  for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public)
values ('accountability-avatars', 'accountability-avatars', true)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public;

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
