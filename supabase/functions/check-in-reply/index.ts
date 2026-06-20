import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Origin': '*',
};

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

      if (!message) {
        return jsonResponse({ error: 'Enter a reply before sending.' }, 400);
      }

      if (message.length > 1000) {
        return jsonResponse({ error: 'Keep replies under 1000 characters.' }, 400);
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
    return jsonResponse({ error: 'This check-in link is not valid.' }, 404);
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

  return jsonResponse({
    messages: messages ?? [],
    partnerName: getPartnerName(thread.partner),
    status: thread.status,
  });
}

async function postReply(
  adminClient: ReturnType<typeof createClient>,
  token: string,
  message: string,
) {
  const thread = await loadThread(adminClient, token);

  if (!thread) {
    return jsonResponse({ error: 'This check-in link is not valid.' }, 404);
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

  return jsonResponse({ ok: true });
}

async function loadThread(adminClient: ReturnType<typeof createClient>, token: string) {
  const { data, error } = await adminClient
    .from('accountability_check_in_threads')
    .select('id, partner_id, status, user_id, partner:accountability_partners(name)')
    .eq('partner_token', token)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data as {
    id: string;
    partner: { name: string } | Array<{ name: string }>;
    partner_id: string;
    status: string;
    user_id: string;
  };
}

function getPartnerName(value: { name: string } | Array<{ name: string }>) {
  if (Array.isArray(value)) {
    return value[0]?.name ?? 'your accountability partner';
  }

  return value.name;
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
