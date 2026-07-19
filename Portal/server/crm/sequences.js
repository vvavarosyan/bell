// CRM sequence engine — sends automated multi-step email follow-ups.
//
// A background scheduler (started in server.js, gated by BDI_CRM_SCHEDULER=1 so
// it runs on exactly ONE prod service — the app.bell.qa user portal, where the
// CRM data + Resend key live) processes enrollments whose next step is due.
//
// Per due enrollment: send the current step, log it to crm_emails + the activity
// timeline, advance to the next step (scheduling next_run_at = now + delay), or
// complete. Stops if the record is won/lost, has no email, or a send fails.

import { query } from '../db.js';
import { isQatarWorkingHour, nextQatarWorkingTime } from '../lib/qatar_time.js';
import { sendEmail, getFromAddress, inboundReplyTo } from '../lib/email.js';
import { getEmailBrandingByEmail, renderBrandedEmail } from '../lib/email_branding.js';
import { resolveSendIdentity, formatFrom } from '../lib/email_domains.js';
import { checkDailyLimit } from '../lib/sendlimits.js';
import { logActivity, markContacted, buildMergeVars, applyMerge } from '../lib/crm.js';

const TICK_MS = 60_000;
let timer = null;
let running = false;

export function startCrmScheduler() {
  if (process.env.BDI_CRM_SCHEDULER !== '1') {
    console.log('[crm] sequence scheduler disabled (set BDI_CRM_SCHEDULER=1 on ONE service to enable)');
    return;
  }
  // First sweep shortly after boot, then every minute. Single-flight guarded.
  setTimeout(() => safeRun(), 8_000);
  timer = setInterval(safeRun, TICK_MS);
  console.log('[crm] sequence scheduler online (every ' + TICK_MS / 1000 + 's)');
}

async function safeRun() {
  if (running) return;
  running = true;
  try { await runDue(); }
  catch (e) { console.error('[crm] sequence tick error:', e.message); }
  finally { running = false; }
}

/** Process all enrollments whose next step is due. Returns a small summary. */
export async function runDue(limit = 25) {
  // PAUSE THAT ACTUALLY PAUSES (was broken): the old query filtered only the ENROLLMENT's
  // status, never the parent sequence's — so pausing a sequence left every in-flight
  // enrollment sending. Now we JOIN crm_sequences and require s.status='active', so a
  // paused/draft sequence stops its enrollments immediately.
  const due = await query(
    `SELECT e.* FROM crm_sequence_enrollments e
       JOIN crm_sequences s ON s.id = e.sequence_id
      WHERE e.status = 'active' AND s.status = 'active'
        AND e.next_run_at IS NOT NULL AND e.next_run_at <= now()
      ORDER BY e.next_run_at LIMIT $1`,
    [limit]
  );
  // QATAR WORKING-HOURS WINDOW (was absent — the runner could fire Friday 03:00). Bell is a
  // Qatar B2B product, so sends are held to Sat–Thu, 07:00–17:00 Qatar time. Outside the
  // window we DEFER (never drop) each due step to the next working slot. The outreach engine
  // relies on this; it is also the right default for any business email.
  const inWindow = isQatarWorkingHour();
  let sent = 0, completed = 0, stopped = 0, errored = 0, deferred = 0;
  for (const enr of due.rows) {
    if (!inWindow) {
      const next = nextQatarWorkingTime();
      await query(`UPDATE crm_sequence_enrollments SET next_run_at = $2 WHERE id = $1`, [enr.id, next.toISOString()]).catch(() => {});
      deferred++;
      continue;
    }
    try {
      const r = await processEnrollment(enr);
      if (r === 'sent') sent++;
      else if (r === 'completed') completed++;
      else if (r === 'stopped') stopped++;
      else if (r === 'errored') errored++;
    } catch (e) {
      console.error('[crm] enrollment', enr.id, 'failed:', e.message);
      await query(`UPDATE crm_sequence_enrollments SET status='errored', error=$2 WHERE id=$1`,
        [enr.id, String(e.message).slice(0, 400)]).catch(() => {});
      errored++;
    }
  }
  return { due: due.rows.length, sent, completed, stopped, errored, deferred };
}

async function processEnrollment(enr) {
  // ATOMIC CLAIM (adversarial review 2026-07-18): push next_run_at 15 minutes out BEFORE any
  // work, compare-and-set on the due condition. A concurrent runner (or a crash/redeploy
  // mid-send) can no longer re-run this enrollment and send the SAME step twice — losing the
  // race means someone else owns it; a crash means one 15-minute delay, not a duplicate email.
  const claim = await query(
    `UPDATE crm_sequence_enrollments SET next_run_at = now() + interval '15 minutes'
      WHERE id=$1 AND status='active' AND next_run_at <= now() RETURNING id`, [enr.id]);
  if (!claim.rows.length) return 'stopped';

  // The step to send now.
  const stepR = await query(
    `SELECT step_no, delay_days, subject, body FROM crm_sequence_steps
      WHERE sequence_id=$1 AND step_no=$2`,
    [enr.sequence_id, enr.current_step]
  );
  if (!stepR.rows.length) {
    await query(`UPDATE crm_sequence_enrollments SET status='completed', completed_at=now() WHERE id=$1`, [enr.id]);
    return 'completed';
  }
  const step = stepR.rows[0];

  // Resolve the record, recipient email, and stop conditions.
  const recR = await query(
    `SELECT r.status, r.entity_type, r.entity_id,
            c.email AS company_email, p.email AS person_email,
            c.name AS company_name, c.industry AS company_industry, c.city AS company_city, c.website AS company_website,
            p.full_name AS person_name, p.headline AS person_headline
       FROM crm_records r
       LEFT JOIN companies c ON r.entity_type='company' AND c.id=r.entity_id
       LEFT JOIN people    p ON r.entity_type='person'  AND p.id=r.entity_id
      WHERE r.id=$1`, [enr.record_id]);
  if (!recR.rows.length) {
    await query(`UPDATE crm_sequence_enrollments SET status='stopped', error='record removed' WHERE id=$1`, [enr.id]);
    return 'stopped';
  }
  const rec = recR.rows[0];
  if (rec.status === 'won' || rec.status === 'lost') {
    await query(`UPDATE crm_sequence_enrollments SET status='stopped', error='record ${rec.status}' WHERE id=$1`, [enr.id]);
    return 'stopped';
  }
  const to = (rec.entity_type === 'company' ? rec.company_email : rec.person_email) || null;
  if (!to) {
    await query(`UPDATE crm_sequence_enrollments SET status='errored', error='no recipient email' WHERE id=$1`, [enr.id]);
    return 'errored';
  }

  // Respect the tenant's daily send cap — if reached, defer this step to tomorrow.
  const lim = await checkDailyLimit(enr.tenant_id);
  if (!lim.allowed) {
    await query(`UPDATE crm_sequence_enrollments SET next_run_at = date_trunc('day', now()) + interval '1 day' WHERE id = $1`, [enr.id]);
    return 'deferred';
  }

  // Personalize {tokens} for this recipient, then send the step — wrapped in
  // the enroller's email branding (header/footer/signature), same as a direct
  // send (Val 2026-07-12).
  const vars = buildMergeVars(rec);
  const subject = applyMerge(step.subject, vars);
  const replyTo = enr.enrolled_by || null;
  const branding = await getEmailBrandingByEmail(enr.enrolled_by);
  branding.header = applyMerge(branding.header, vars);
  branding.footer = applyMerge(branding.footer, vars);
  branding.signature = applyMerge(branding.signature, vars);
  const { html: bodyHtml, text: bodyText } = renderBrandedEmail({ bodyText: applyMerge(step.body, vars), branding });
  const ins = await query(
    `INSERT INTO crm_emails (tenant_id, record_id, direction, to_email, reply_to, subject, body_text, status, sent_by)
     VALUES ($1,$2,'out',$3,$4,$5,$6,'queued',$7) RETURNING id`,
    [enr.tenant_id, enr.record_id, to, replyTo, subject, bodyText, replyTo]
  );
  const emailId = Number(ins.rows[0].id);
  const effReplyTo = inboundReplyTo(emailId) || replyTo;
  let from;
  try {
    try { from = formatFrom(await resolveSendIdentity(enr.tenant_id)); } catch { from = null; }
    from = from || await getFromAddress();
    const res = await sendEmail({ from, to, replyTo: effReplyTo, subject, html: bodyHtml || undefined, text: bodyText, system: 'sequence', tenantId: enr.tenant_id });
    await query(`UPDATE crm_emails SET status='sent', provider_message_id=$2, from_email=$3, reply_to=$4, sent_at=now() WHERE id=$1`,
      [emailId, res.id, from, effReplyTo]);
  } catch (e) {
    await query(`UPDATE crm_emails SET status='failed', error=$2 WHERE id=$1`, [emailId, String(e.message).slice(0, 400)]);
    await query(`UPDATE crm_sequence_enrollments SET status='errored', error=$2 WHERE id=$1`, [enr.id, String(e.message).slice(0, 400)]);
    return 'errored';
  }

  await logActivity(null, enr.tenant_id, enr.record_id, 'email_out', {
    actorEmail: replyTo,
    summary: `Sequence email (step ${step.step_no}): ${step.subject || '(no subject)'}`,
    payload: { sequence_id: enr.sequence_id, step_no: step.step_no, email_id: emailId, to },
  });
  await markContacted(null, enr.tenant_id, enr.record_id, replyTo);

  // Advance to the next step, or complete.
  const nextR = await query(
    `SELECT step_no, delay_days FROM crm_sequence_steps WHERE sequence_id=$1 AND step_no=$2`,
    [enr.sequence_id, enr.current_step + 1]
  );
  if (!nextR.rows.length) {
    await query(`UPDATE crm_sequence_enrollments SET status='completed', completed_at=now(), last_sent_at=now() WHERE id=$1`, [enr.id]);
  } else {
    const delay = Math.max(0, Number(nextR.rows[0].delay_days) || 0);
    await query(
      `UPDATE crm_sequence_enrollments
          SET current_step = current_step + 1, last_sent_at = now(),
              next_run_at = now() + ($2 || ' days')::interval
        WHERE id = $1`,
      [enr.id, String(delay)]
    );
  }
  return 'sent';
}
