import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const expoPushEndpoint = 'https://exp.host/--/api/v2/push/send';
const retryDelayMinutes = 5;

type DueReminder = {
  attempt_count: number;
  id: string;
  message: string;
  title: string;
  user_id: string;
};

type ExpoTicket = {
  details?: { error?: string };
  message?: string;
  status?: 'ok' | 'error';
};

Deno.serve(async (request) => {
  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Unsupported method.' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Reminder delivery is not configured.' }, 500);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await adminClient.rpc('claim_due_recovery_reminders', { batch_size: 100 });

  if (error) {
    console.error('Could not claim due reminders', error.message);
    return jsonResponse({ error: 'Could not claim due reminders.' }, 500);
  }

  const reminders = (data ?? []) as DueReminder[];
  const results = await Promise.all(reminders.map((reminder) => deliverReminder(adminClient, reminder)));

  return jsonResponse({ claimed: reminders.length, delivered: results.filter(Boolean).length });
});

async function deliverReminder(adminClient: ReturnType<typeof createClient>, reminder: DueReminder) {
  const { data: tokenRows, error: tokensError } = await adminClient
    .from('push_tokens')
    .select('token')
    .eq('user_id', reminder.user_id)
    .limit(100);

  if (tokensError) {
    await markForRetry(adminClient, reminder.id, tokensError.message);
    return false;
  }

  const tokens = (tokenRows ?? [])
    .map((row) => row.token)
    .filter(isExpoPushToken);

  if (!tokens.length) {
    await markForRetry(adminClient, reminder.id, 'No active Expo push token is available.');
    return false;
  }

  try {
    const response = await fetch(expoPushEndpoint, {
      body: JSON.stringify(tokens.map((to) => ({
        body: reminder.message || 'Take a moment to reconnect with your plan.',
        channelId: 'recovery-reminders',
        data: { reminderId: reminder.id, route: '/reminders', type: 'recovery_reminder' },
        sound: 'default',
        title: reminder.title,
        to,
      }))),
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      method: 'POST',
    });

    if (!response.ok) {
      await markForRetry(adminClient, reminder.id, `Expo push request failed with ${response.status}.`);
      return false;
    }

    const payload = await response.json() as { data?: ExpoTicket[] };
    const tickets = payload.data ?? [];
    const accepted = tickets.some((ticket) => ticket.status === 'ok');
    const invalidTokens = tickets
      .map((ticket, index) => ticket.details?.error === 'DeviceNotRegistered' ? tokens[index] : null)
      .filter((token): token is string => Boolean(token));

    if (invalidTokens.length) {
      await adminClient.from('push_tokens').delete().in('token', invalidTokens);
    }

    if (!accepted) {
      const ticketError = tickets.map((ticket) => ticket.message ?? ticket.details?.error).filter(Boolean).join('; ');
      await markForRetry(adminClient, reminder.id, ticketError || 'Expo did not accept the push notification.');
      return false;
    }

    const { error: deliveredError } = await adminClient
      .from('recovery_reminders')
      .update({
        delivered_at: new Date().toISOString(),
        enabled: false,
        last_error: null,
        processing_started_at: null,
        status: 'delivered',
        updated_at: new Date().toISOString(),
      })
      .eq('id', reminder.id)
      .eq('status', 'processing');

    if (deliveredError) {
      console.error('Could not mark reminder delivered', deliveredError.message);
      return false;
    }

    return true;
  } catch (error) {
    await markForRetry(adminClient, reminder.id, error instanceof Error ? error.message : 'Expo push delivery failed.');
    return false;
  }
}

async function markForRetry(adminClient: ReturnType<typeof createClient>, reminderId: string, lastError: string) {
  const nextAttemptAt = new Date(Date.now() + retryDelayMinutes * 60_000).toISOString();
  const { error } = await adminClient
    .from('recovery_reminders')
    .update({
      last_error: lastError.slice(0, 1000),
      next_attempt_at: nextAttemptAt,
      processing_started_at: null,
      status: 'scheduled',
      updated_at: new Date().toISOString(),
    })
    .eq('id', reminderId)
    .eq('status', 'processing');

  if (error) {
    console.error('Could not schedule reminder retry', error.message);
  }
}

function isExpoPushToken(value: unknown): value is string {
  return typeof value === 'string' && (value.startsWith('ExponentPushToken[') || value.startsWith('ExpoPushToken['));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
}
