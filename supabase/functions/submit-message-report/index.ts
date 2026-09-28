import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Origin': '*',
};
const supportEmail = 'hello@attribut.me';
const fromEmail = 'Dallas Reports <reports@attribut.me>';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Unsupported method.' }, 405);

  try {
    const url = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!url || !serviceKey) return json({ error: 'Reporting is not configured.' }, 500);
    if (!token) return json({ error: 'Sign in before reporting a message.' }, 401);
    const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: auth, error: authError } = await admin.auth.getUser(token);
    if (authError || !auth.user) return json({ error: 'Please sign in again.' }, 401);

    const body = await request.json().catch(() => ({}));
    const source = body.source === 'buddy_message' || body.source === 'external_check_in_reply' ? body.source : null;
    const messageId = typeof body.messageId === 'string' ? body.messageId : '';
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const requestKey = typeof body.requestKey === 'string' ? body.requestKey : '';
    if (!source || !isUuid(messageId) || !isUuid(requestKey) || reason.length < 1 || reason.length > 500) {
      return json({ error: 'Choose a valid report reason and try again.' }, 400);
    }

    const { data: existing } = await admin.from('moderation_reports').select('id, source, source_message_id, reporter_user_id, email_status').eq('request_key', requestKey).maybeSingle();
    if (existing) {
      if (existing.source !== source || existing.source_message_id !== messageId || existing.reporter_user_id !== auth.user.id) return json({ error: 'This report request could not be verified.' }, 409);
      return json({ reportId: existing.id, emailStatus: existing.email_status, saved: true });
    }

    const message = await loadReportableMessage(admin, source, messageId, auth.user.id);
    if (!message) return json({ error: 'That message is no longer available to report.' }, 404);
    const { data: report, error: insertError } = await admin.from('moderation_reports').insert({
      reporter_user_id: auth.user.id,
      subject_user_id: message.subjectUserId,
      source,
      source_message_id: messageId,
      request_key: requestKey,
      reason,
      message_snapshot: message.text,
    }).select('id, created_at').single();
    if (insertError || !report) return json({ error: 'The report could not be saved. Please try again.' }, 500);

    await admin.from('moderation_audit_log').insert({
      actor_user_id: auth.user.id,
      target_user_id: message.subjectUserId,
      report_id: report.id,
      action: 'report_submitted',
      details: { source },
    });
    const emailStatus = await deliverReport(admin, report.id, {
      id: report.id,
      createdAt: report.created_at,
      reporterId: auth.user.id,
      subjectId: message.subjectUserId,
      source,
      reason,
      text: message.text,
    });
    return json({ reportId: report.id, emailStatus, saved: true });
  } catch (error) {
    console.error('Message report submission failed', error);
    return json({ error: 'The report could not be submitted. Please try again.' }, 500);
  }
});

async function loadReportableMessage(admin: ReturnType<typeof createClient>, source: string, id: string, reporterId: string) {
  if (source === 'buddy_message') {
    const { data: message } = await admin.from('accountability_app_messages').select('id, body, sender_user_id, connection_id, moderation_removed_at').eq('id', id).maybeSingle();
    if (!message || message.moderation_removed_at || message.sender_user_id === reporterId) return null;
    const { data: connection } = await admin.from('accountability_app_connections').select('requester_user_id, recipient_user_id, status').eq('id', message.connection_id).maybeSingle();
    if (!connection || connection.status !== 'active' || ![connection.requester_user_id, connection.recipient_user_id].includes(reporterId) || ![connection.requester_user_id, connection.recipient_user_id].includes(message.sender_user_id)) return null;
    return { text: message.body, subjectUserId: message.sender_user_id };
  }
  const { data: message } = await admin.from('accountability_check_in_messages').select('id, body, sender_type, user_id, thread_id, moderation_removed_at').eq('id', id).maybeSingle();
  if (!message || message.moderation_removed_at || message.sender_type !== 'partner' || message.user_id !== reporterId) return null;
  const { data: thread } = await admin.from('accountability_check_in_threads').select('id, user_id').eq('id', message.thread_id).maybeSingle();
  if (!thread || thread.user_id !== reporterId) return null;
  return { text: message.body, subjectUserId: null };
}

async function deliverReport(admin: ReturnType<typeof createClient>, reportId: string, details: Record<string, unknown>) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) return 'queued';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': reportId },
    body: JSON.stringify({
      from: fromEmail,
      to: [supportEmail],
      reply_to: supportEmail,
      subject: `Dallas message report ${reportId}`,
      text: [
        `Report ID: ${reportId}`,
        `Source: ${details.source}`,
        `Reported at: ${details.createdAt}`,
        `Reporter account ID: ${details.reporterId}`,
        `Reported account ID: ${details.subjectId ?? 'External partner (not a Dallas account)'}`,
        `Reason: ${details.reason}`,
        `Message: ${details.text}`,
      ].join('\n\n'),
    }),
  });
  const result = await response.json().catch(() => ({}));
  if (response.ok) {
    await admin.from('moderation_reports').update({ email_status: 'sent', email_sent_at: new Date().toISOString(), email_attempt_count: 1, email_last_error: null }).eq('id', reportId);
    return 'sent';
  }
  await admin.from('moderation_reports').update({ email_attempt_count: 1, email_last_error: String(result.message ?? 'Email delivery failed').slice(0, 500), email_next_attempt_at: new Date(Date.now() + 5 * 60_000).toISOString() }).eq('id', reportId);
  return 'queued';
}

function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function json(payload: unknown, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
