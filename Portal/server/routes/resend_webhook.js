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
        await query(`UPDATE crm_emails SET status='failed', error=$2 WHERE provider_message_id = $1 AND status NOT IN ('opened','delivered')`, [msgId, type]);
      }
    }
  } catch (e) { console.error('[resend-webhook]', e.message); }
  res.json({ ok: true });
});

export default router;
