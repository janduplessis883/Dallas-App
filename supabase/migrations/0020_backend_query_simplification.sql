-- Keep buddy lifecycle mutations behind the accountability-app Edge Function.
drop policy if exists "Users can create their Dallas accountability connections"
  on public.accountability_app_connections;
drop policy if exists "Users can update their Dallas accountability connections"
  on public.accountability_app_connections;

-- partner_token already has a unique constraint, which owns an equivalent index.
drop index if exists public.accountability_check_in_threads_partner_token_idx;

create or replace function public.get_check_in_badge()
returns table (
  pending_invitation_count bigint,
  unread_app_message_count bigint,
  unread_external_reply_count bigint
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (
      select count(*)
      from public.accountability_app_invitations invitation
      where invitation.recipient_user_id = (select auth.uid())
        and invitation.status = 'pending'
    ),
    (
      select count(*)
      from public.accountability_app_messages message
      join public.accountability_app_connections connection
        on connection.id = message.connection_id
      where message.sender_user_id <> (select auth.uid())
        and message.read_at is null
        and connection.status = 'active'
        and (select auth.uid()) in (connection.requester_user_id, connection.recipient_user_id)
    ),
    (
      select count(*)
      from public.accountability_check_in_messages message
      where message.user_id = (select auth.uid())
        and message.sender_type = 'partner'
        and message.read_at is null
    );
$$;

create or replace function public.get_buddy_summaries()
returns table (
  partner_id uuid,
  connection_id uuid,
  last_message text,
  last_message_at timestamptz,
  latest_received_message text,
  latest_received_at timestamptz,
  latest_received_sender_user_id uuid,
  unread_count bigint,
  next_check_in timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    partner.id,
    partner.app_connection_id,
    last_message.body,
    last_message.created_at,
    latest_received.body,
    latest_received.created_at,
    latest_received.sender_user_id,
    coalesce(unread.unread_count, 0),
    next_check_in.scheduled_at
  from public.accountability_partners partner
  left join lateral (
    select message.body, message.created_at
    from public.accountability_app_messages message
    where message.connection_id = partner.app_connection_id
    order by message.created_at desc
    limit 1
  ) last_message on true
  left join lateral (
    select message.body, message.created_at, message.sender_user_id
    from public.accountability_app_messages message
    where message.connection_id = partner.app_connection_id
      and message.sender_user_id <> (select auth.uid())
    order by message.created_at desc
    limit 1
  ) latest_received on true
  left join lateral (
    select count(*) as unread_count
    from public.accountability_app_messages message
    where message.connection_id = partner.app_connection_id
      and message.sender_user_id <> (select auth.uid())
      and message.read_at is null
  ) unread on true
  left join lateral (
    select planned.scheduled_at
    from public.accountability_planned_check_ins planned
    where planned.partner_id = partner.id
      and planned.user_id = (select auth.uid())
      and planned.scheduled_at >= now()
    order by planned.scheduled_at asc
    limit 1
  ) next_check_in on true
  where partner.user_id = (select auth.uid())
  order by partner.created_at desc;
$$;

revoke all on function public.get_check_in_badge() from public;
revoke all on function public.get_buddy_summaries() from public;
grant execute on function public.get_check_in_badge() to authenticated;
grant execute on function public.get_buddy_summaries() to authenticated;
