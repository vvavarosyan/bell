// /api/crm-inbound — receives inbound email replies (a machine-to-machine
// webhook, NOT under the Clerk auth gate). Configure your inbound provider
// (Cloudflare Email Routing → Worker, Resend inbound, Postmark inbound, …) to
// POST normalized JSON here, authenticated with BDI_CRM_INBOUND_TOKEN.
//
// Outbound CRM mail uses a plus-addressed reply-to: reply+<crm_emails.id>@<domain>
// (see lib/email.js inboundReplyTo). We parse that id from the recipient, thread
// the reply into the record's timeline, auto-stop any active sequence for that
// record, and forward the reply to the human who originally sent it.

import { Router } from 'express';
import { query } from '../db.js';
import { logActivity } from '../lib/crm.js';
import { sendEmail, getFromAddress } from '../lib/email.js';

const router = Router();
const TOKEN = process.env.BDI_CRM_INBOUND_TOKEN || null;

// Pull "reply+<id>@…" out of any recipient-ish field in the payload.
function parseEmailId(body) {
  const candidates = [];
  const push = (v) => { if (typeof v === 'string') candidates.push(v); else if (Array.isArray(v)) v.forEach(push); else if (v && typeof v === 'object') { if (v.address) candidates.push(v.address); if (v.email) candidates.push(v.email); } };
  push(body.to); push(body.recipient); push(body.recipients); push(body.envelope && body.envelope.to); push(body.toAddress);
  for (const c of candidates) {
    const m = String(c).match(/reply\+(\d+)@/i);
    if (m) return Number(m[1]);
  }
  return null;
}
function firstAddr(v) {
  if (!v) return null;
  if (typeof v === 'string') { const m = v.match(/<([^>]+)>/); return (m ? m[1] : v).trim(); }
  if (Array.isArray(v)) return firstAddr(v[0]);
  if (typeof v === 'object') return v.address || v.email || null;
  return null;
}

router.post('/', async (req, res, next) => {
  try {
    // Auth: shared token via header or query. If no token is configured, reject.
    if (!TOKEN) return res.status(503).json({ error: 'inbound_disabled' });
    const provided = req.get('x-bdi-inbound-token') || req.query.token;
    if (provided !== TOKEN) return res.status(401).json({ error: 'unauthorized' });

    const body = req.body || {};
    const emailId = parseEmailId(body);
    // Always 200 so the provider doesn't retry forever on an unmatched message.
    if (!emailId) return res.json({ ok: true, matched: false, reason: 'no_reply_token' });

    const orig = await query(
      `SELECT id, tenant_id, record_id, to_email, sent_by FROM crm_emails WHERE id = $1`, [emailId]);
    if (!orig.rows.length) return res.json({ ok: true, matched: false, reason: 'unknown_email' });
    const o = orig.rows[0];

    const fromAddr = firstAddr(body.from) || firstAddr(body.sender) || 'unknown';
    const subject  = body.subject || 'Re: (reply)';
    const text     = body.text || body['body-plain'] || body.plain || body.stripped_text || '';

    // Thread the reply into the record's history + timeline.
    await query(
      `INSERT INTO crm_emails (tenant_id, record_id, direction, from_email, to_email, subject, body_text, status)
       VALUES ($1,$2,'in',$3,$4,$5,$6,'delivered')`,
      [o.tenant_id, o.record_id, fromAddr, o.to_email, subject, String(text).slice(0, 20000)]);
    if (o.record_id) {
      await logActivity(null, o.tenant_id, o.record_id, 'email_in', {
        actorEmail: fromAddr, summary: 'Reply received: ' + String(subject).slice(0, 120),
      });
      // Auto-stop active sequences for this record — they replied.
      await query(
        `UPDATE crm_sequence_enrollments SET status='stopped', error='replied'
          WHERE tenant_id=$1 AND record_id=$2 AND status='active'`,
        [o.tenant_id, o.record_id]);
    }

    // Forward the reply to the human who originally sent the outreach.
    if (o.sent_by) {
      try {
        const from = await getFromAddress();
        await sendEmail({
          from, to: o.sent_by, replyTo: fromAddr,
          subject: 'Reply from ' + fromAddr + ': ' + subject,
          text: `${fromAddr} replied to your Bell outreach:\n\n${text}`,
        });
      } catch (e) { console.warn('[crm-inbound] forward failed:', e.message); }
    }

    res.json({ ok: true, matched: true, record_id: o.record_id });
  } catch (err) { next(err); }
});

export default router;
