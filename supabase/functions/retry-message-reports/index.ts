import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

Deno.serve(async (request) => {
  if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const cronSecret = Deno.env.get('MODERATION_CRON_SECRET');
  if (!cronSecret || request.headers.get('x-moderation-cron-secret') !== cronSecret) return new Response('Unauthorized', { status: 401 });
  const url = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const resendKey = Deno.env.get('RESEND_API_KEY');
  if (!url || !serviceKey || !resendKey) return new Response('Not configured', { status: 500 });
  const db = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { data: reports, error } = await db.from('moderation_reports').select('*').eq('email_status', 'queued').lte('email_next_attempt_at', new Date().toISOString()).order('email_next_attempt_at').limit(20);
  if (error) return new Response('Could not load queued reports', { status: 500 });
  let sent = 0;
  for (const report of reports ?? []) {
    const attempt = Number(report.email_attempt_count ?? 0) + 1;
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': report.id },
      body: JSON.stringify({
        from: 'Dallas Reports <reports@attribut.me>', to: ['hello@attribut.me'], reply_to: 'hello@attribut.me',
        subject: `Dallas message report ${report.id}`,
        text: [`Report ID: ${report.id}`, `Source: ${report.source}`, `Reported at: ${report.created_at}`, `Reporter account ID: ${report.reporter_user_id ?? 'Deleted account'}`, `Reported account ID: ${report.subject_user_id ?? 'External partner or deleted account'}`, `Reason: ${report.reason}`, `Message: ${report.message_snapshot}`].join('\n\n'),
      }),
    });
    const result = await response.json().catch(() => ({}));
    const backoffHours = Math.min(24, 2 ** Math.min(attempt, 5));
    const patch = response.ok
      ? { email_status: 'sent', email_sent_at: new Date().toISOString(), email_attempt_count: attempt, email_last_error: null }
      : { email_attempt_count: attempt, email_last_error: String(result.message ?? 'Email delivery failed').slice(0, 500), email_next_attempt_at: new Date(Date.now() + backoffHours * 60 * 60_000).toISOString() };
    const { error: updateError } = await db.from('moderation_reports').update(patch).eq('id', report.id);
    if (updateError) console.error('Could not update moderation report delivery state', report.id);
    if (response.ok && !updateError) sent += 1;
  }
  return Response.json({ processed: reports?.length ?? 0, sent });
});
