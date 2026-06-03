// Shared inbound-reply processing, used by BOTH the webhook (routes/crm_inbound.js)
// and the IMAP poller (crm/inbound_poller.js).
//
// Given the crm_emails id parsed from the reply+<id>@… recipient, thread the
// reply into the record's timeline, auto-stop active sequences for that record,
// and forward the reply to the human who originally sent the outreach.

import { query } from '../db.js';
import { logActivity } from '../lib/crm.js';
import { sendEmail, getFromAddress } from '../lib/email.js';

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

  // Idempotency guard — don't double-record the same reply (IMAP re-reads etc.).
  const dup = await query(
    `SELECT 1 FROM crm_emails WHERE record_id=$1 AND direction='in' AND from_email=$2 AND subject=$3
       AND created_at > now() - interval '2 days' LIMIT 1`,
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
      });
    } catch (e) { console.warn('[crm-inbound] forward failed:', e.message); }
  }

  return { matched: true, record_id: o.record_id };
}
