// Shared inbound-reply processing, used by BOTH the webhook (routes/crm_inbound.js)
// and the IMAP poller (crm/inbound_poller.js).
//
// Given the crm_emails id parsed from the reply+<id>@… recipient, thread the
// reply into the record's timeline, auto-stop active sequences for that record,
// and forward the reply to the human who originally sent the outreach.

import { query } from '../db.js';
import { logActivity } from '../lib/crm.js';
import { sendEmail, getFromAddress } from '../lib/email.js';
import { createNotification } from '../lib/notifications.js';

// Pull the crm_emails id out of a "reply+<id>@…" recipient string.
export function parseReplyId(recipient) {
  if (!recipient) return null;
  const m = String(recipient).match(/reply\+(\d+)@/i);
  return m ? Number(m[1]) : null;
}

/**
 * @param {object} p { emailId, fromAddr, subject, text }
 * @returns {object} { matched, record_id?, reason? }
 */
export async function processInboundReply({ emailId, fromAddr, subject, text }) {
  if (!emailId) return { matched: false, reason: 'no_reply_token' };

  const orig = await query(
    `SELECT id, tenant_id, record_id, to_email, sent_by FROM crm_emails WHERE id = $1`, [emailId]);
  if (!orig.rows.length) return { matched: false, reason: 'unknown_email' };
  const o = orig.rows[0];

  const from = fromAddr || 'unknown';
  const subj = subject || 'Re: (reply)';
  const body = String(text || '').slice(0, 20000);

  // Idempotency guard — don't double-record the same reply (IMAP re-read + webhook double
  // delivery). Window is MINUTES, not days: email threads keep the same "Re: …" subject, so a
  // 2-day window silently dropped a prospect's SECOND real reply in a thread (adversarial
  // review 2026-07-18). 10 minutes still catches every duplicate-delivery case.
  const dup = await query(
    `SELECT 1 FROM crm_emails WHERE record_id=$1 AND direction='in' AND from_email=$2 AND subject=$3
       AND created_at > now() - interval '10 minutes' LIMIT 1`,
    [o.record_id, from, subj]);
  if (dup.rows.length) return { matched: true, record_id: o.record_id, duplicate: true };

  await query(
    `INSERT INTO crm_emails (tenant_id, record_id, direction, from_email, to_email, subject, body_text, status)
     VALUES ($1,$2,'in',$3,$4,$5,$6,'delivered')`,
    [o.tenant_id, o.record_id, from, o.to_email, subj, body]);

  if (o.record_id) {
    await logActivity(null, o.tenant_id, o.record_id, 'email_in', {
      actorEmail: from, summary: 'Reply received: ' + String(subj).slice(0, 120),
    });
    await query(
      `UPDATE crm_sequence_enrollments SET status='stopped', error='replied'
        WHERE tenant_id=$1 AND record_id=$2 AND status='active'`,
      [o.tenant_id, o.record_id]);
  }

  // Forward the reply to whoever originally sent the outreach.
  if (o.sent_by) {
    try {
      const fromAddrOut = await getFromAddress();
      await sendEmail({
        from: fromAddrOut, to: o.sent_by, replyTo: from,
        subject: 'Reply from ' + from + ': ' + subj,
        text: `${from} replied to your Bell outreach:\n\n${body}`,
        system: 'crm-forward', tenantId: o.tenant_id,
      });
    } catch (e) { console.warn('[crm-inbound] forward failed:', e.message); }
  }

  // In-app notification to the rep who sent the outreach.
  if (o.sent_by) {
    try {
      const u = await query(
        `SELECT id FROM users WHERE lower(email) = lower($1) AND tenant_id = $2 AND is_active = true LIMIT 1`,
        [o.sent_by, o.tenant_id]);
      if (u.rows.length) {
        await createNotification({
          tenantId: o.tenant_id, userId: u.rows[0].id, category: 'engagement', type: 'crm_reply',
          title: `New reply from ${from}`, body: String(subj).slice(0, 140),
          link: '/crm', icon: 'crm',
        });
      }
    } catch (e) { console.warn('[crm-inbound] notify failed:', e.message); }
  }

  return { matched: true, record_id: o.record_id };
}
