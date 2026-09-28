create or replace function public.get_accountability_partner_profile_avatars()
returns table (
  partner_id uuid,
  connected_user_id uuid,
  profile_avatar_path text,
  profile_display_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    partner.id as partner_id,
    partner.connected_user_id,
    profile.avatar_path as profile_avatar_path,
    profile.display_name as profile_display_name
  from public.accountability_partners partner
  join public.profiles profile
    on profile.id = partner.connected_user_id
  where partner.user_id = (select auth.uid())
    and partner.partner_kind = 'dallas_user'
    and partner.connected_user_id is not null
    and exists (
      select 1
      from public.accountability_app_connections connection
      where connection.id = partner.app_connection_id
        and connection.status = 'active'
        and (
          (
            connection.requester_user_id = (select auth.uid())
            and connection.recipient_user_id = partner.connected_user_id
          )
          or (
            connection.recipient_user_id = (select auth.uid())
            and connection.requester_user_id = partner.connected_user_id
          )
        )
    );
$$;

revoke all on function public.get_accountability_partner_profile_avatars() from public;
revoke all on function public.get_accountability_partner_profile_avatars() from anon;
grant execute on function public.get_accountability_partner_profile_avatars() to authenticated;
