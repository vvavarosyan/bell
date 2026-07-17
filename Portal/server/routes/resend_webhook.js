// /api/resend-webhook — Resend email events (opens, clicks, delivery, bounces).
// Matches events to crm_emails by provider_message_id (Resend's email id) and
// updates status / opened_at / clicked_at, which powers the CRM open & reply
// metrics. Machine-to-machine: if BDI_RESEND_WEBHOOK_SECRET is set, the webhook
// URL must include ?secret=<it>. Always returns 200 so Resend doesn't retry-storm.
//
// (Svix signature verification is a later hardening step; the message-id match
// means a forged event can at most nudge a metric, never touch tenant data.)

import { Router } from 'express';
import { query } from '../db.js';
import { handleBounce } from '../lib/suppression.js';

const router = Router();
const SECRET = process.env.BDI_RESEND_WEBHOOK_SECRET || null;

router.post('/', async (req, res) => {
  if (SECRET && req.query.secret !== SECRET) return res.status(401).json({ error: 'unauthorized' });
  try {
    const evt = req.body || {};
    const type = evt.type || evt.event || '';
    const msgId = evt?.data?.email_id || evt?.data?.id || null;
    if (msgId && type) {
      if (type === 'email.opened') {
        await query(`UPDATE crm_emails SET status='opened', opened_at = COALESCE(opened_at, now()) WHERE provider_message_id = $1`, [msgId]);
      } else if (type === 'email.delivered') {
        await query(`UPDATE crm_emails SET status = CASE WHEN status='opened' THEN status ELSE 'delivered' END WHERE provider_message_id = $1`, [msgId]);
      } else if (type === 'email.clicked') {
        await query(`UPDATE crm_emails SET clicked_at = COALESCE(clicked_at, now()) WHERE provider_message_id = $1`, [msgId]);
      } else if (type === 'email.bounced' || type === 'email.complained') {
        // Bounce/complaint is now a FIRST-CLASS status (migration 093) so the rates that
        // decide domain survival are queryable, not buried in the error text.
        const kind = type === 'email.complained' ? 'complained' : 'bounced';
        await query(`UPDATE crm_emails SET status=$2, error=$3 WHERE provider_message_id = $1 AND status NOT IN ('opened','delivered')`, [msgId, kind, type]);

        // Accuracy loop: a hard bounce / complaint means the address is bad.
        // Suppress it (never send again) and downgrade the canonical contacts
        // so the bad address stops being treated as verified data.
        // Prefer the recipient(s) from the event; fall back to the stored row.
        let recips = [];
        const d = evt.data || {};
        if (Array.isArray(d.to)) recips = d.to;
        else if (typeof d.to === 'string') recips = [d.to];
        else if (d.email) recips = [d.email];
        if (!recips.length) {
          const r = await query(`SELECT to_email FROM crm_emails WHERE provider_message_id = $1 LIMIT 1`, [msgId]);
          if (r.rows[0]?.to_email) recips = [r.rows[0].to_email];
        }
        const detail = d?.bounce?.message || d?.bounce?.type || null;
        for (const addr of recips) {
          try { await handleBounce(addr, kind, { detail, source: 'resend-webhook' }); }
          catch (e) { console.error('[resend-webhook] suppress', e.message); }
        }
      }
    }
  } catch (e) { console.error('[resend-webhook]', e.message); }
  res.json({ ok: true });
});

export default router;
