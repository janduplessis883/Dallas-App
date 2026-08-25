-- Allow a blocker to identify the person in their own blocked-buddies list.
drop policy if exists "Connected Dallas buddies can view profile basics" on public.profiles;
create policy "Connected Dallas buddies can view profile basics"
  on public.profiles
  for select
  using (
    (select auth.uid()) = id
    or exists (
      select 1
      from public.accountability_app_connections connection
      where (
        connection.status = 'active'
        or (connection.status = 'blocked' and connection.blocked_by_user_id = (select auth.uid()))
      )
        and (
          (connection.requester_user_id = (select auth.uid()) and connection.recipient_user_id = id)
          or (connection.recipient_user_id = (select auth.uid()) and connection.requester_user_id = id)
        )
    )
  );

drop trigger if exists set_accountability_app_invitations_updated_at on public.accountability_app_invitations;
create trigger set_accountability_app_invitations_updated_at
  before update on public.accountability_app_invitations
  for each row execute function public.set_updated_at();
