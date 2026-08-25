import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Origin': '*',
};

const pinAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const authorization = request.headers.get('Authorization');
    const token = authorization?.replace(/^Bearer\s+/i, '');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Dallas accountability messaging is not configured.' }, 500);
    }

    if (!token) {
      return jsonResponse({ error: 'Sign in before using Dallas accountability messaging.' }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: userData, error: userError } = await adminClient.auth.getUser(token);

    if (userError || !userData.user) {
      return jsonResponse({ error: userError?.message ?? 'Signed-in user was not found.' }, 401);
    }

    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? '').trim();

    if (action === 'get_code') {
      return getCode(adminClient, userData.user);
    }

    if (action === 'invite' || action === 'connect') {
      return inviteUser(adminClient, userData.user, body);
    }
    if (action === 'accept_invitation' || action === 'decline_invitation' || action === 'cancel_invitation' || (action === 'block' && body.invitationId)) {
      return respondToInvitation(adminClient, userData.user, action, body);
    }
    if (action === 'disconnect' || action === 'block' || action === 'unblock') {
      return changeConnection(adminClient, userData.user, action, body);
    }

    if (action === 'send_message') {
      return sendMessage(adminClient, userData.user, body);
    }

    return jsonResponse({ error: 'Unsupported Dallas accountability action.' }, 400);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Dallas accountability request failed.' },
      500,
    );
  }
});

async function getCode(adminClient: ReturnType<typeof createClient>, user: AuthUser) {
  const profile = await ensureProfile(adminClient, user);
  const pin = profile.accountability_pin ?? await assignPin(adminClient, user.id);

  return jsonResponse({
    code: formatPin(pin),
  });
}

async function inviteUser(
  adminClient: ReturnType<typeof createClient>,
  user: AuthUser,
  body: Record<string, unknown>,
) {
  const rawLookup = String(body.lookup ?? '').trim();

  if (!rawLookup) {
    return jsonResponse({ error: 'Enter a Dallas PIN or account email.' }, 400);
  }

  const targetUser = rawLookup.includes('@')
    ? await findUserByEmail(adminClient, rawLookup)
    : await findUserByPin(adminClient, rawLookup);

  if (!targetUser) {
    return jsonResponse({ error: 'No Dallas user found for that PIN or email.' }, 404);
  }

  if (targetUser.id === user.id) {
    return jsonResponse({ error: 'You cannot add yourself as an accountability partner.' }, 400);
  }

  await ensureProfile(adminClient, user);
  await ensureProfile(adminClient, targetUser);

  const { data: connection } = await adminClient.from('accountability_app_connections')
    .select('status').or(`and(requester_user_id.eq.${user.id},recipient_user_id.eq.${targetUser.id}),and(requester_user_id.eq.${targetUser.id},recipient_user_id.eq.${user.id})`).maybeSingle();
  if (connection?.status === 'active') return jsonResponse({ error: 'You are already Dallas buddies.' }, 400);
  if (connection?.status === 'blocked') return jsonResponse({ error: 'This Dallas buddy connection is blocked.' }, 400);
  const { data: declined } = await adminClient.from('accountability_app_invitations').select('created_at')
    .eq('requester_user_id', user.id).eq('recipient_user_id', targetUser.id).eq('status', 'declined').order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (declined) {
    const eligibleAt = new Date(new Date(declined.created_at).getTime() + 7 * 86400000);
    if (eligibleAt > new Date()) return jsonResponse({ error: `You can invite again on ${eligibleAt.toLocaleDateString()}.` }, 400);
  }
  const { data: invitation, error: invitationError } = await adminClient.from('accountability_app_invitations').insert({ requester_user_id: user.id, recipient_user_id: targetUser.id }).select('id').single();
  if (invitationError) return jsonResponse({ error: invitationError.message }, 400);

  await sendPushNotification(adminClient, targetUser.id, {
    body: `${getUserDisplayName(user)} invited you to be a Dallas accountability buddy.`,
    data: {
      route: '/dallas-app-buddies',
      type: 'accountability_invitation',
    },
    title: 'New buddy request',
  });

  return jsonResponse({
    invitationId: invitation.id,
  });
}

async function respondToInvitation(adminClient: ReturnType<typeof createClient>, user: AuthUser, action: string, body: Record<string, unknown>) {
  const invitationId = String(body.invitationId ?? '');
  const { data: invitation, error } = await adminClient.from('accountability_app_invitations').select('*').eq('id', invitationId).maybeSingle();
  if (error || !invitation || invitation.status !== 'pending') return jsonResponse({ error: 'This invitation is no longer pending.' }, 400);
  const isRecipient = invitation.recipient_user_id === user.id;
  if ((action === 'cancel_invitation' && invitation.requester_user_id !== user.id) || (action !== 'cancel_invitation' && !isRecipient)) return jsonResponse({ error: 'You cannot change this invitation.' }, 403);
  const status = action === 'accept_invitation' ? 'accepted' : action === 'decline_invitation' ? 'declined' : action === 'block' ? 'blocked' : 'cancelled';
  await adminClient.from('accountability_app_invitations').update({ status, responded_at: new Date().toISOString(), cancelled_at: status === 'cancelled' ? new Date().toISOString() : null, blocked_by_user_id: status === 'blocked' ? user.id : null }).eq('id', invitation.id);
  if (status === 'blocked') {
    const connection = await ensureConnection(adminClient, invitation.requester_user_id, invitation.recipient_user_id);
    await adminClient.from('accountability_app_connections').update({
      status: 'blocked',
      blocked_at: new Date().toISOString(),
      blocked_by_user_id: user.id,
    }).eq('id', connection.id);
    return jsonResponse({ connectionId: connection.id, status });
  }
  if (status !== 'accepted') return jsonResponse({ status });
  const requester = await getUserById(adminClient, invitation.requester_user_id);
  if (!requester) return jsonResponse({ error: 'Requester was not found.' }, 404);
  const connection = await ensureConnection(adminClient, invitation.requester_user_id, invitation.recipient_user_id);
  await Promise.all([ensurePartnerRecord(adminClient, invitation.requester_user_id, user, connection.id), ensurePartnerRecord(adminClient, invitation.recipient_user_id, requester, connection.id)]);
  return jsonResponse({ connectionId: connection.id, status });
}

async function changeConnection(adminClient: ReturnType<typeof createClient>, user: AuthUser, action: string, body: Record<string, unknown>) {
  const connectionId = String(body.connectionId ?? '');
  const { data: connection } = await adminClient.from('accountability_app_connections').select('*').eq('id', connectionId).maybeSingle();
  if (!connection || ![connection.requester_user_id, connection.recipient_user_id].includes(user.id)) return jsonResponse({ error: 'Connection not found.' }, 404);
  if (action === 'unblock') {
    if (connection.status !== 'blocked' || connection.blocked_by_user_id !== user.id) return jsonResponse({ error: 'Only the blocker can unblock this buddy.' }, 403);
    await adminClient.from('accountability_app_connections').delete().eq('id', connectionId);
    return jsonResponse({ status: 'unblocked' });
  }
  await adminClient.from('accountability_partners').delete().eq('app_connection_id', connectionId);
  if (action === 'block') {
    await adminClient.from('accountability_app_connections').update({ status: 'blocked', blocked_by_user_id: user.id, blocked_at: new Date().toISOString() }).eq('id', connectionId);
    return jsonResponse({ status: 'blocked' });
  }
  await adminClient.from('accountability_app_connections').delete().eq('id', connectionId);
  return jsonResponse({ status: 'disconnected' });
}

async function sendMessage(
  adminClient: ReturnType<typeof createClient>,
  user: AuthUser,
  body: Record<string, unknown>,
) {
  const connectionId = String(body.connectionId ?? '').trim();
  const message = String(body.message ?? '').trim();

  if (!connectionId) {
    return jsonResponse({ error: 'Choose a Dallas accountability partner first.' }, 400);
  }

  if (!message) {
    return jsonResponse({ error: 'Enter a message before sending.' }, 400);
  }

  if (message.length > 1000) {
    return jsonResponse({ error: 'Keep messages under 1000 characters.' }, 400);
  }

  const { data: connection, error: connectionError } = await adminClient
    .from('accountability_app_connections')
    .select('id, requester_user_id, recipient_user_id, status')
    .eq('id', connectionId)
    .maybeSingle();

  if (connectionError || !connection) {
    return jsonResponse({ error: 'Dallas accountability connection was not found.' }, 404);
  }

  if (![connection.requester_user_id, connection.recipient_user_id].includes(user.id)) {
    return jsonResponse({ error: 'You do not have access to this accountability connection.' }, 403);
  }

  if (connection.status !== 'active') {
    return jsonResponse({ error: 'This Dallas accountability connection is not active.' }, 400);
  }

  const recipientUserId =
    connection.requester_user_id === user.id
      ? connection.recipient_user_id
      : connection.requester_user_id;

  const { data: insertedMessage, error: messageError } = await adminClient
    .from('accountability_app_messages')
    .insert({
      body: message,
      connection_id: connection.id,
      sender_user_id: user.id,
    })
    .select('body, created_at, id, sender_user_id')
    .single();

  if (messageError) {
    return jsonResponse({ error: messageError.message }, 500);
  }

  await adminClient
    .from('accountability_app_connections')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', connection.id);

  await sendPushNotification(adminClient, recipientUserId, {
    body: message.length > 140 ? `${message.slice(0, 137)}...` : message,
    data: {
      connectionId: connection.id,
      route: '/dallas-app-buddies',
      type: 'accountability_app_message',
    },
    title: `${getUserDisplayName(user)} sent a Dallas check-in`,
  });

  return jsonResponse({ message: insertedMessage });
}

async function ensureProfile(adminClient: ReturnType<typeof createClient>, user: AuthUser) {
  const { data: existingProfile, error: existingError } = await adminClient
    .from('profiles')
    .select('accountability_pin, display_name, email, id')
    .eq('id', user.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existingProfile) {
    const nextEmail = user.email ? user.email.toLowerCase() : existingProfile.email;

    if (nextEmail && nextEmail !== existingProfile.email) {
      await adminClient.from('profiles').update({ email: nextEmail }).eq('id', user.id);
    }

    return {
      ...existingProfile,
      email: nextEmail,
    };
  }

  const { data: insertedProfile, error: insertError } = await adminClient
    .from('profiles')
    .insert({
      display_name: getUserDisplayName(user),
      email: user.email?.toLowerCase() ?? null,
      id: user.id,
      phone_number: getUserPhoneNumber(user),
    })
    .select('accountability_pin, display_name, email, id')
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return insertedProfile;
}

async function assignPin(adminClient: ReturnType<typeof createClient>, userId: string) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const pin = createPin();
    const { error } = await adminClient
      .from('profiles')
      .update({ accountability_pin: pin })
      .eq('id', userId);

    if (!error) {
      return pin;
    }

    if (!String(error.message).toLowerCase().includes('duplicate')) {
      throw new Error(error.message);
    }
  }

  throw new Error('Could not create a Dallas PIN. Try again.');
}

async function findUserByPin(adminClient: ReturnType<typeof createClient>, rawPin: string) {
  const pin = normalizePin(rawPin);

  if (!pin) {
    return null;
  }

  const { data: profile } = await adminClient
    .from('profiles')
    .select('id')
    .eq('accountability_pin', pin)
    .maybeSingle();

  return profile?.id ? getUserById(adminClient, profile.id) : null;
}

async function findUserByEmail(adminClient: ReturnType<typeof createClient>, rawEmail: string) {
  const email = rawEmail.trim().toLowerCase();

  if (!email) {
    return null;
  }

  const { data: profile } = await adminClient
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle();

  if (profile?.id) {
    return getUserById(adminClient, profile.id);
  }

  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await adminClient.auth.admin.listUsers({
      page,
      perPage: 100,
    });

    if (error) {
      throw new Error(error.message);
    }

    const foundUser = data.users.find((candidate) => candidate.email?.toLowerCase() === email);

    if (foundUser) {
      await ensureProfile(adminClient, foundUser);
      return foundUser;
    }

    if (data.users.length < 100) {
      return null;
    }
  }

  return null;
}

async function getUserById(adminClient: ReturnType<typeof createClient>, userId: string) {
  const { data, error } = await adminClient.auth.admin.getUserById(userId);

  if (error || !data.user) {
    return null;
  }

  return data.user;
}

async function ensureConnection(
  adminClient: ReturnType<typeof createClient>,
  firstUserId: string,
  secondUserId: string,
) {
  const { data: existingConnection, error: existingError } = await adminClient
    .from('accountability_app_connections')
    .select('id, requester_user_id, recipient_user_id')
    .or(
      `and(requester_user_id.eq.${firstUserId},recipient_user_id.eq.${secondUserId}),and(requester_user_id.eq.${secondUserId},recipient_user_id.eq.${firstUserId})`,
    )
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  if (existingConnection) {
    return existingConnection;
  }

  const { data: insertedConnection, error: insertError } = await adminClient
    .from('accountability_app_connections')
    .insert({
      recipient_user_id: secondUserId,
      requester_user_id: firstUserId,
    })
    .select('id, requester_user_id, recipient_user_id')
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return insertedConnection;
}

async function ensurePartnerRecord(
  adminClient: ReturnType<typeof createClient>,
  ownerUserId: string,
  connectedUser: AuthUser,
  connectionId: string,
) {
  const { data: existingPartner, error: existingError } = await adminClient
    .from('accountability_partners')
    .select('id')
    .eq('user_id', ownerUserId)
    .eq('connected_user_id', connectedUser.id)
    .maybeSingle();

  if (existingError) {
    throw new Error(existingError.message);
  }

  const partnerPayload = {
    app_connection_id: connectionId,
    connected_user_id: connectedUser.id,
    email: connectedUser.email?.toLowerCase() ?? null,
    name: getUserDisplayName(connectedUser),
    partner_kind: 'dallas_user',
    relationship: 'Dallas accountability partner',
    updated_at: new Date().toISOString(),
    user_id: ownerUserId,
  };

  if (existingPartner) {
    const { data: updatedPartner, error: updateError } = await adminClient
      .from('accountability_partners')
      .update(partnerPayload)
      .eq('id', existingPartner.id)
      .select('id')
      .single();

    if (updateError) {
      throw new Error(updateError.message);
    }

    return updatedPartner;
  }

  const { data: insertedPartner, error: insertError } = await adminClient
    .from('accountability_partners')
    .insert(partnerPayload)
    .select('id')
    .single();

  if (insertError) {
    throw new Error(insertError.message);
  }

  return insertedPartner;
}

async function sendPushNotification(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  payload: {
    body: string;
    data: Record<string, string>;
    title: string;
  },
) {
  const { data: tokens, error: tokensError } = await adminClient
    .from('push_tokens')
    .select('token')
    .eq('user_id', userId);

  if (tokensError) {
    console.error('Failed to load push tokens', tokensError.message);
    return;
  }

  const pushTokens = (tokens ?? [])
    .map((row) => row.token)
    .filter((token): token is string => {
      return (
        typeof token === 'string' &&
        (token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken['))
      );
    });

  if (!pushTokens.length) {
    return;
  }

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    body: JSON.stringify(
      pushTokens.map((to) => ({
        body: payload.body,
        channelId: 'recovery-reminders',
        data: payload.data,
        sound: 'default',
        title: payload.title,
        to,
      })),
    ),
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    method: 'POST',
  });

  if (!response.ok) {
    console.error('Failed to send Dallas accountability push', await response.text());
  }
}

function createPin() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((byte) => pinAlphabet[byte % pinAlphabet.length])
    .join('');
}

function normalizePin(value: string) {
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');

  return normalized.startsWith('DLS') ? normalized.slice(3) : normalized;
}

function formatPin(value: string) {
  const pin = normalizePin(value);

  return `DLS-${pin.slice(0, 4)}-${pin.slice(4)}`;
}

function getUserDisplayName(user: AuthUser) {
  const metadataName = user.user_metadata?.preferred_name ?? user.user_metadata?.display_name;
  const displayName = typeof metadataName === 'string' ? metadataName.trim() : '';

  return displayName || user.email?.split('@')[0] || 'Dallas user';
}

function getUserPhoneNumber(user: AuthUser) {
  const phoneNumber = user.user_metadata?.phone_number;

  return typeof phoneNumber === 'string' && phoneNumber.trim() ? phoneNumber.trim() : null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
    status,
  });
}

type AuthUser = {
  email?: string;
  id: string;
  user_metadata?: Record<string, unknown>;
};
