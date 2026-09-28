import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = { 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type', 'Access-Control-Allow-Origin': '*' };
const supportEmail = 'hello@attribut.me';

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (request.method !== 'POST') return json({ error: 'Unsupported method.' }, 405);
  try {
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const token = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!url || !key) return json({ error: 'Moderation is not configured.' }, 500);
    if (!token) return json({ error: 'Sign in to continue.' }, 401);
    const db = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
    const { data: auth, error: authError } = await db.auth.getUser(token);
    if (authError || !auth.user) return json({ error: 'Please sign in again.' }, 401);
    const { data: profile } = await db.from('profiles').select('user_role').eq('id', auth.user.id).maybeSingle();
    if (profile?.user_role !== 'admin') return json({ error: 'Admin access is required.' }, 403);
    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? '');
    if (action === 'list_reports') {
      const status = typeof body.status === 'string' && ['new', 'in_review', 'resolved', 'dismissed'].includes(body.status) ? body.status : null;
      let query = db.from('moderation_reports').select('*').order('created_at', { ascending: false }).limit(100);
      if (status) query = query.eq('status', status);
      const { data, error } = await query;
      if (error) throw error;
      return json({ reports: data ?? [] });
    }
    const reportId = typeof body.reportId === 'string' ? body.reportId : '';
    if (['get_report', 'set_report_status', 'retry_email', 'remove_message', 'restore_message', 'suspend_account', 'reinstate_account'].includes(action) && !isUuid(reportId)) return json({ error: 'Choose a valid report.' }, 400);
    if (action === 'get_report') {
      const { data, error } = await db.from('moderation_reports').select('*').eq('id', reportId).maybeSingle();
      if (error) throw error;
      return data ? json({ report: data }) : json({ error: 'Report not found.' }, 404);
    }
    const { data: report, error: reportError } = await db.from('moderation_reports').select('*').eq('id', reportId).maybeSingle();
    if (reportError) throw reportError;
    if (!report) return json({ error: 'Report not found.' }, 404);
    if (action === 'set_report_status') {
      const status = body.status;
      const note = typeof body.note === 'string' ? body.note.trim() : '';
      if (!['in_review', 'resolved', 'dismissed'].includes(status) || note.length > 2000) return json({ error: 'Choose a valid status and note.' }, 400);
      const { error } = await db.from('moderation_reports').update({ status, review_note: note || null }).eq('id', reportId);
      if (error) throw error;
      await audit(db, auth.user.id, report, status === 'resolved' ? 'report_resolved' : status === 'dismissed' ? 'report_dismissed' : 'report_reviewed', note || null);
      return json({ ok: true });
    }
    if (action === 'retry_email') {
      if (report.email_status === 'sent') return json({ ok: true, emailStatus: 'sent' });
      const result = await deliver(db, report);
      await audit(db, auth.user.id, report, 'email_retry', null);
      return json({ ok: true, emailStatus: result });
    }
    if (action === 'remove_message' || action === 'restore_message') {
      const reason = requireReason(body.reason);
      if (!reason) return json({ error: 'Enter a reason.' }, 400);
      const now = new Date().toISOString();
      if (action === 'remove_message') {
        const table = report.source === 'buddy_message' ? 'accountability_app_messages' : 'accountability_check_in_messages';
        const { error } = await db.from(table).update({ body: '[removed by moderation]', moderation_removed_at: now }).eq('id', report.source_message_id);
        if (error) throw error;
        await audit(db, auth.user.id, report, 'message_removed', reason);
      } else {
        const table = report.source === 'buddy_message' ? 'accountability_app_messages' : 'accountability_check_in_messages';
        const { error } = await db.from(table).update({ body: report.message_snapshot, moderation_removed_at: null }).eq('id', report.source_message_id);
        if (error) throw error;
        await audit(db, auth.user.id, report, 'message_restored', reason);
      }
      return json({ ok: true });
    }
    if (action === 'suspend_account' || action === 'reinstate_account') {
      const reason = requireReason(body.reason);
      const targetId = typeof body.targetUserId === 'string' ? body.targetUserId : report.subject_user_id;
      if (!reason || !targetId || !isUuid(targetId)) return json({ error: 'Choose an account and enter a reason.' }, 400);
      if (report.source === 'external_check_in_reply' || targetId !== report.subject_user_id) return json({ error: 'Only the reported Dallas account can be changed from this report.' }, 400);
      const duration = action === 'suspend_account' ? validBanDuration(body.duration) : 'none';
      if (action === 'suspend_account' && !duration) return json({ error: 'Choose a suspension duration.' }, 400);
      const { error } = await db.auth.admin.updateUserById(targetId, { ban_duration: duration });
      if (error) throw error;
      await audit(db, auth.user.id, report, action === 'suspend_account' ? 'account_suspended' : 'account_reinstated', reason, targetId);
      return json({ ok: true });
    }
    return json({ error: 'Unsupported moderation action.' }, 400);
  } catch (error) {
    console.error('Admin moderation request failed', error);
    return json({ error: 'The moderation action could not be completed.' }, 500);
  }
});

async function audit(db: ReturnType<typeof createClient>, actor: string, report: any, action: string, reason: string | null, target = report.subject_user_id) {
  const { error } = await db.from('moderation_audit_log').insert({ actor_user_id: actor, target_user_id: target, report_id: report.id, action, reason, details: { source: report.source, source_message_id: report.source_message_id } });
  if (error) throw error;
}

async function deliver(db: ReturnType<typeof createClient>, report: any) {
  const apiKey = Deno.env.get('RESEND_API_KEY');
  const attempt = Number(report.email_attempt_count ?? 0) + 1;
  if (!apiKey) return 'queued';
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': report.id },
    body: JSON.stringify({ from: 'Dallas Reports <reports@attribut.me>', to: [supportEmail], reply_to: supportEmail, subject: `Dallas message report ${report.id}`, text: [`Report ID: ${report.id}`, `Source: ${report.source}`, `Reported at: ${report.created_at}`, `Reporter account ID: ${report.reporter_user_id ?? 'Deleted account'}`, `Reported account ID: ${report.subject_user_id ?? 'External partner or deleted account'}`, `Reason: ${report.reason}`, `Message: ${report.message_snapshot}`].join('\n\n') }),
  });
  const result = await response.json().catch(() => ({}));
  const patch = response.ok
    ? { email_status: 'sent', email_sent_at: new Date().toISOString(), email_attempt_count: attempt, email_last_error: null }
    : { email_attempt_count: attempt, email_last_error: String(result.message ?? 'Email delivery failed').slice(0, 500), email_next_attempt_at: new Date(Date.now() + Math.min(24, 2 ** Math.min(attempt, 5)) * 60 * 60_000).toISOString() };
  const { error } = await db.from('moderation_reports').update(patch).eq('id', report.id);
  if (error) throw error;
  return response.ok ? 'sent' : 'queued';
}

function validBanDuration(value: unknown) {
  if (value === 'indefinite') return '876000h';
  if (value === '1d' || value === '7d' || value === '30d') return value;
  return null;
}
function requireReason(value: unknown) { const reason = typeof value === 'string' ? value.trim() : ''; return reason.length >= 1 && reason.length <= 2000 ? reason : null; }
function isUuid(value: string) { return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value); }
function json(payload: unknown, status = 200) { return new Response(JSON.stringify(payload), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }); }
