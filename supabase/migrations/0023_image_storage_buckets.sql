-- The image features depend on these buckets. Keep this migration idempotent so
-- it repairs projects where the profile/vision tables were deployed first.

insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('accountability-avatars', 'accountability-avatars', true),
  ('home-covers', 'home-covers', true),
  ('prophetic-vision-covers', 'prophetic-vision-covers', true)
on conflict (id) do update set
  name = excluded.name,
  public = true;

drop policy if exists "Avatar images are publicly readable" on storage.objects;
create policy "Avatar images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'avatars');

drop policy if exists "Accountability avatars are publicly readable" on storage.objects;
create policy "Accountability avatars are publicly readable"
  on storage.objects for select
  using (bucket_id = 'accountability-avatars');

drop policy if exists "Home cover images are publicly readable" on storage.objects;
create policy "Home cover images are publicly readable"
  on storage.objects for select
  using (bucket_id = 'home-covers');

drop policy if exists "Prophetic Vision covers are publicly readable" on storage.objects;
create policy "Prophetic Vision covers are publicly readable"
  on storage.objects for select
  using (bucket_id = 'prophetic-vision-covers');

drop policy if exists "Users can upload their own avatar" on storage.objects;
create policy "Users can upload their own avatar"
  on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own avatar" on storage.objects;
create policy "Users can update their own avatar"
  on storage.objects for update
  using (bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1])
  with check (bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "Users can delete their own avatar" on storage.objects;
create policy "Users can delete their own avatar"
  on storage.objects for delete
  using (bucket_id = 'avatars' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "Users can upload their own accountability avatars" on storage.objects;
create policy "Users can upload their own accountability avatars"
  on storage.objects for insert
  with check (
    bucket_id = 'accountability-avatars'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own accountability avatars" on storage.objects;
create policy "Users can update their own accountability avatars"
  on storage.objects for update
  using (bucket_id = 'accountability-avatars' and (select auth.uid())::text = (storage.foldername(name))[1])
  with check (bucket_id = 'accountability-avatars' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "Users can delete their own accountability avatars" on storage.objects;
create policy "Users can delete their own accountability avatars"
  on storage.objects for delete
  using (bucket_id = 'accountability-avatars' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "Users can upload their own home cover" on storage.objects;
create policy "Users can upload their own home cover"
  on storage.objects for insert
  with check (
    bucket_id = 'home-covers'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own home cover" on storage.objects;
create policy "Users can update their own home cover"
  on storage.objects for update
  using (bucket_id = 'home-covers' and (select auth.uid())::text = (storage.foldername(name))[1])
  with check (bucket_id = 'home-covers' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "Users can delete their own home cover" on storage.objects;
create policy "Users can delete their own home cover"
  on storage.objects for delete
  using (bucket_id = 'home-covers' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "Users can upload their own Prophetic Vision cover" on storage.objects;
create policy "Users can upload their own Prophetic Vision cover"
  on storage.objects for insert
  with check (
    bucket_id = 'prophetic-vision-covers'
    and (select auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "Users can update their own Prophetic Vision cover" on storage.objects;
create policy "Users can update their own Prophetic Vision cover"
  on storage.objects for update
  using (bucket_id = 'prophetic-vision-covers' and (select auth.uid())::text = (storage.foldername(name))[1])
  with check (bucket_id = 'prophetic-vision-covers' and (select auth.uid())::text = (storage.foldername(name))[1]);

drop policy if exists "Users can delete their own Prophetic Vision cover" on storage.objects;
create policy "Users can delete their own Prophetic Vision cover"
  on storage.objects for delete
  using (bucket_id = 'prophetic-vision-covers' and (select auth.uid())::text = (storage.foldername(name))[1]);
