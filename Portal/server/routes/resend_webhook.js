// /api/resend-webhook — Resend email events (opens, clicks, delivery, bounces).
// Matches events to crm_emails by provider_message_id (Resend's email id) and
// updates status / opened_at / clicked_at, which powers the CRM open & reply
// metrics. Machine-to-machine: if BDI_RESEND_WEBHOOK_SECRET is set, the webhook
// URL must include ?secret=<it> (compared timing-safely). Always returns 200 so
// Resend doesn't retry-storm.
//
// HARDENED (2026-07-18 adversarial review):
//   1. Destructive actions (suppression + contact downgrade) run ONLY for the stored
//      to_email of a crm_emails row that MATCHED the event's message id — NEVER for
//      addresses supplied in the event body. Before this, a forged POST could suppress
//      arbitrary addresses platform-wide and corrupt verified contact data.
//   2. bounced/complained are TERMINAL statuses: a complaint arrives AFTER delivery, so
//      the old guard (skip if delivered/opened) meant complaints were ~never recorded —
//      blinding the complaint rate AND the outreach circuit breaker. Now bounce/complaint
//      override delivered/opened, complained overrides bounced, and late opened/delivered
//      events can no longer resurrect a terminal row.

import { timingSafeEqual } from 'crypto';
import { Router } from 'express';
import { Webhook } from 'svix';
import { query } from '../db.js';
import { handleBounce } from '../lib/suppression.js';

const router = Router();
const SECRET = process.env.BDI_RESEND_WEBHOOK_SECRET || null;
// Svix signing secrets (whsec_…) — Resend signs every webhook. TWO possible senders: the
// transactional account and the isolated outreach account, each with its own secret. When any
// signing secret is configured, verification is REQUIRED (fail closed); the query-string token
// is the legacy fallback only while no signing secret is set.
const SIGNING_SECRETS = [
  process.env.BDI_RESEND_WEBHOOK_SIGNING_SECRET,
  process.env.BDI_RESEND_WEBHOOK_SIGNING_SECRET_OUTREACH,
].filter(Boolean);

function secretOk(provided) {
  if (!SECRET) return true;                       // unset = open (set it in prod!)
  const a = Buffer.from(String(provided || ''));
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

// Verify the Svix signature against the RAW body (mounted with express.raw). Returns the
// parsed event on success, null on failure.
function verifySigned(req) {
  const headers = {
    'svix-id': req.header('svix-id'),
    'svix-timestamp': req.header('svix-timestamp'),
    'svix-signature': req.header('svix-signature'),
  };
  const raw = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : JSON.stringify(req.body || {});
  for (const s of SIGNING_SECRETS) {
    try { return new Webhook(s).verify(raw, headers); } catch { /* try next secret */ }
  }
  return null;
}

router.post('/', async (req, res) => {
  let evt;
  if (SIGNING_SECRETS.length) {
    evt = verifySigned(req);
    if (!evt) return res.status(401).json({ error: 'bad_signature' });
  } else {
    if (!secretOk(req.query.secret)) return res.status(401).json({ error: 'unauthorized' });
    evt = Buffer.isBuffer(req.body) ? (() => { try { return JSON.parse(req.body.toString('utf8')); } catch { return {}; } })() : (req.body || {});
  }
  try {
    const type = evt.type || evt.event || '';
    const msgId = evt?.data?.email_id || evt?.data?.id || null;
    if (msgId && type) {
      // Keep the universal ledger (email_log, migration 097) in step — same terminal-status
      // rules as crm_emails below. Best-effort.
      const ledgerStatus = { 'email.delivered': 'delivered', 'email.opened': 'opened', 'email.bounced': 'bounced', 'email.complained': 'complained' }[type];
      if (ledgerStatus) {
        const guard = ledgerStatus === 'complained' ? `('complained')`
          : ledgerStatus === 'bounced' ? `('bounced','complained')`
          : ledgerStatus === 'delivered' ? `('opened','bounced','complained')`
          : `('bounced','complained')`;
        await query(`UPDATE email_log SET status=$2 WHERE provider_message_id=$1 AND status NOT IN ${guard}`,
          [msgId, ledgerStatus]).catch(() => {});
      }
      if (type === 'email.opened') {
        // Terminal statuses win; the open timestamp is still recorded.
        await query(
          `UPDATE crm_emails SET status = CASE WHEN status IN ('bounced','complained') THEN status ELSE 'opened' END,
                  opened_at = COALESCE(opened_at, now())
            WHERE provider_message_id = $1`, [msgId]);
      } else if (type === 'email.delivered') {
        await query(
          `UPDATE crm_emails SET status = CASE WHEN status IN ('opened','bounced','complained') THEN status ELSE 'delivered' END
            WHERE provider_message_id = $1`, [msgId]);
      } else if (type === 'email.clicked') {
        await query(`UPDATE crm_emails SET clicked_at = COALESCE(clicked_at, now()) WHERE provider_message_id = $1`, [msgId]);
      } else if (type === 'email.bounced' || type === 'email.complained') {
        // Bounce/complaint is TERMINAL (migration 093): it overrides delivered/opened —
        // that's the ordering complaints actually arrive in — and 'complained' outranks
        // 'bounced'. The rates that decide domain survival read from this.
        const kind = type === 'email.complained' ? 'complained' : 'bounced';
        const guard = kind === 'complained' ? `('complained')` : `('bounced','complained')`;
        const upd = await query(
          `UPDATE crm_emails SET status=$2, error=$3
            WHERE provider_message_id = $1 AND status NOT IN ${guard}
            RETURNING to_email`, [msgId, kind, type]);

        // Suppress + downgrade ONLY the stored recipient of a row WE actually sent.
        // The event body's address list is untrusted input and is deliberately ignored.
        const stored = (await query(`SELECT to_email FROM crm_emails WHERE provider_message_id = $1 LIMIT 1`, [msgId])).rows[0];
        if (stored?.to_email) {
          const d = evt.data || {};
          const detail = d?.bounce?.message || d?.bounce?.type || null;
          try { await handleBounce(stored.to_email, kind, { detail, source: 'resend-webhook' }); }
          catch (e) { console.error('[resend-webhook] suppress', e.message); }

          // Outreach machine sync: a bounced/complained outreach send also closes its TARGET
          // (stops follow-ups) and feeds the circuit-breaker stats.
          await query(
            `UPDATE outreach_targets SET status='bounced', next_touch_at=NULL, updated_at=now()
              WHERE crm_email_id = (SELECT id FROM crm_emails WHERE provider_message_id=$1 LIMIT 1)
                AND status IN ('sent','pending','sending')`, [msgId]).catch(() => {});
        }
        void upd;
      }
    }
  } catch (e) { console.error('[resend-webhook]', e.message); }
  res.json({ ok: true });
});

export default router;
