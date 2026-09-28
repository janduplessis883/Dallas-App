revoke all on function public.get_accountability_partner_profile_avatars() from anon;
revoke all on function public.get_accountability_partner_profile_avatars() from public;
grant execute on function public.get_accountability_partner_profile_avatars() to authenticated;
