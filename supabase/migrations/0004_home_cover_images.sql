alter table public.profiles
  add column if not exists home_cover_image_path text;

insert into storage.buckets (id, name, public)
values ('home-covers', 'home-covers', true)
on conflict (id) do update set
  name = excluded.name,
  public = excluded.public;

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
