import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Origin': '*',
};

const maxRepliesPerWindow = 5;
const replyRateLimitWindowSeconds = 10 * 60;

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse({ error: 'Check-in replies are not configured.' }, 500);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const url = new URL(request.url);
    const token = url.searchParams.get('token');

    if (!token) {
      return jsonResponse({ error: 'Missing check-in token.' }, 400);
    }

    if (request.method === 'GET') {
      return getThread(adminClient, token);
    }

    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const message = String(body.message ?? '').trim();
      const confirmed = body.confirmed === true;

      if (!message) {
        return jsonResponse({ error: 'Enter a reply before sending.' }, 400);
      }

      if (message.length > 1000) {
        return jsonResponse({ error: 'Keep replies under 1000 characters.' }, 400);
      }

      if (!confirmed) {
        return jsonResponse({ error: 'Confirm that you want to send this reply.' }, 400);
      }

      return postReply(adminClient, token, message);
    }

    return jsonResponse({ error: 'Unsupported method.' }, 405);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Check-in reply failed.' },
      500,
    );
  }
});

async function getThread(adminClient: ReturnType<typeof createClient>, token: string) {
  const thread = await loadThread(adminClient, token);

  if (!thread) {
    return jsonResponse({ error: 'This check-in link is invalid or has expired.' }, 404);
  }

  const { data: messages, error: messagesError } = await adminClient
    .from('accountability_check_in_messages')
    .select('body, created_at, id, sender_type')
    .eq('thread_id', thread.id)
    .order('created_at', { ascending: true })
    .limit(20);

  if (messagesError) {
    return jsonResponse({ error: messagesError.message }, 500);
  }

  const userDisplayName = await resolveUserDisplayName(
    adminClient,
    thread.user_id,
    thread.user_display_name,
  );

  return jsonResponse({
    messages: messages ?? [],
    status: thread.status,
    userDisplayName,
  });
}

async function postReply(
  adminClient: ReturnType<typeof createClient>,
  token: string,
  message: string,
) {
  const thread = await loadThread(adminClient, token);

  if (!thread) {
    return jsonResponse({ error: 'This check-in link is invalid or has expired.' }, 404);
  }

  const { data: withinRateLimit, error: rateLimitError } = await adminClient.rpc(
    'consume_check_in_reply_rate_limit',
    {
      p_limit: maxRepliesPerWindow,
      p_thread_id: thread.id,
      p_window_seconds: replyRateLimitWindowSeconds,
    },
  );

  if (rateLimitError) {
    return jsonResponse({ error: 'Could not validate the reply rate limit.' }, 500);
  }

  if (!withinRateLimit) {
    return jsonResponse({ error: 'Too many replies were sent from this link. Please wait 10 minutes and try again.' }, 429);
  }

  const { error: messageError } = await adminClient.from('accountability_check_in_messages').insert({
    body: message,
    partner_id: thread.partner_id,
    sender_type: 'partner',
    thread_id: thread.id,
    user_id: thread.user_id,
  });

  if (messageError) {
    return jsonResponse({ error: messageError.message }, 500);
  }

  const { error: updateError } = await adminClient
    .from('accountability_check_in_threads')
    .update({
      status: 'partner_replied',
      updated_at: new Date().toISOString(),
    })
    .eq('id', thread.id);

  if (updateError) {
    return jsonResponse({ error: updateError.message }, 500);
  }

  await sendReplyNotification(adminClient, thread.user_id, thread.partner_id);

  return jsonResponse({ ok: true });
}

async function loadThread(adminClient: ReturnType<typeof createClient>, token: string) {
  const { data, error } = await adminClient
    .from('accountability_check_in_threads')
    .select('id, partner_id, partner_token_expires_at, status, user_display_name, user_id')
    .eq('partner_token', token)
    .gt('partner_token_expires_at', new Date().toISOString())
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as {
    id: string;
    partner_id: string;
    partner_token_expires_at: string;
    status: string;
    user_display_name: string | null;
    user_id: string;
  };
}

async function resolveUserDisplayName(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  threadDisplayName: string | null,
) {
  if (isDisplayName(threadDisplayName)) {
    return threadDisplayName.trim();
  }

  const { data } = await adminClient
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle();

  const profileDisplayName = typeof data?.display_name === 'string' ? data.display_name.trim() : '';

  if (isDisplayName(profileDisplayName)) {
    return profileDisplayName;
  }

  const { data: userData } = await adminClient.auth.admin.getUserById(userId);
  const preferredName = userData.user?.user_metadata?.preferred_name;

  return isDisplayName(preferredName) ? preferredName.trim() : 'Dallas user';
}

function isDisplayName(value: unknown): value is string {
  return typeof value === 'string' && Boolean(value.trim()) && !value.includes('@');
}

async function sendReplyNotification(
  adminClient: ReturnType<typeof createClient>,
  userId: string,
  partnerId: string,
) {
  const [{ data: tokens, error: tokensError }, { data: partner }] = await Promise.all([
    adminClient
      .from('push_tokens')
      .select('token')
      .eq('user_id', userId),
    adminClient
      .from('accountability_partners')
      .select('name')
      .eq('id', partnerId)
      .maybeSingle(),
  ]);

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

  const partnerName = typeof partner?.name === 'string' && partner.name.trim()
    ? partner.name.trim()
    : 'Your accountability partner';

  const response = await fetch('https://exp.host/--/api/v2/push/send', {
    body: JSON.stringify(
      pushTokens.map((to) => ({
        body: `${partnerName} replied to your check-in.`,
        channelId: 'recovery-reminders',
        data: {
          route: '/accountability',
          type: 'check_in_reply',
        },
        sound: 'default',
        title: 'New check-in reply',
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
    console.error('Failed to send check-in reply push', await response.text());
  }
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
