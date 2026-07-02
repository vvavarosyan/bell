// /api/whatsapp — CRM WhatsApp (Phase F1). Feature-gated (auth + subscription);
// everything tenant-scoped. Connect a number, send messages threaded onto a CRM
// record, and read the per-record thread. The inbound webhook is separate +
// public (routes/whatsapp_webhook.js).

import { Router } from 'express';
import { query } from '../db.js';
import { getStatus, saveConfig, disconnect, sendText } from '../lib/whatsapp.js';
import { logActivity } from '../lib/crm.js';

const router = Router();
const tid = (req) => req.tenant?.id;
const actor = (req) => req.user?.email || null;

// ── Connection ─────────────────────────────────────────────────────────────
router.get('/config', async (req, res, next) => {
  try { res.json(await getStatus(tid(req))); } catch (err) { next(err); }
});

router.put('/config', async (req, res, next) => {
  try {
    // Admin/owner only — connecting a number is a workspace-level integration.
    if (!['platform_admin', 'owner', 'admin'].includes(req.user?.role)) {
      return res.status(403).json({ error: 'admin_only' });
    }
    const b = req.body || {};
    res.json(await saveConfig(tid(req), {
      phone_number_id: b.phone_number_id, business_account_id: b.business_account_id,
      access_token: b.access_token, verify_token: b.verify_token,
      display_number: b.display_number, active: b.active,
    }, actor(req)));
  } catch (err) { next(err); }
});

router.post('/disconnect', async (req, res, next) => {
  try {
    if (!['platform_admin', 'owner', 'admin'].includes(req.user?.role)) return res.status(403).json({ error: 'admin_only' });
    res.json(await disconnect(tid(req)));
  } catch (err) { next(err); }
});

// ── Per-record thread ──────────────────────────────────────────────────────
router.get('/thread', async (req, res, next) => {
  try {
    const recordId = Number(req.query.record_id);
    if (!Number.isFinite(recordId)) return res.status(400).json({ error: 'bad_record' });
    // Ownership check: the record must belong to this tenant.
    const own = await query(`SELECT 1 FROM crm_records WHERE id = $1 AND tenant_id = $2`, [recordId, tid(req)]);
    if (!own.rows.length) return res.status(404).json({ error: 'not_found' });
    const rows = (await query(
      `SELECT id, direction, wa_from, wa_to, body, status, error, sent_by, created_at
         FROM whatsapp_messages
        WHERE tenant_id = $1 AND record_id = $2
        ORDER BY created_at ASC
        LIMIT 500`,
      [tid(req), recordId],
    )).rows;
    res.json({ rows });
  } catch (err) { next(err); }
});

// ── Send ───────────────────────────────────────────────────────────────────
router.post('/send', async (req, res, next) => {
  try {
    const recordId = Number(req.body?.record_id);
    const to = String(req.body?.to || '').trim();
    const body = String(req.body?.body || '').trim();
    if (!Number.isFinite(recordId)) return res.status(400).json({ error: 'bad_record' });
    if (!to)   return res.status(400).json({ error: 'no_recipient' });
    if (!body) return res.status(400).json({ error: 'empty' });
    const own = await query(`SELECT id FROM crm_records WHERE id = $1 AND tenant_id = $2`, [recordId, tid(req)]);
    if (!own.rows.length) return res.status(404).json({ error: 'not_found' });

    // Insert queued, attempt send, update status — same shape as CRM email.
    const ins = await query(
      `INSERT INTO whatsapp_messages (tenant_id, record_id, direction, wa_to, body, status, sent_by)
       VALUES ($1,$2,'out',$3,$4,'queued',$5) RETURNING id`,
      [tid(req), recordId, to, body, actor(req)],
    );
    const id = Number(ins.rows[0].id);
    try {
      const r = await sendText(tid(req), to, body);
      await query(`UPDATE whatsapp_messages SET status='sent', wa_message_id=$2 WHERE id=$1`, [id, r.id]);
      await logActivity(null, tid(req), recordId, 'whatsapp_out', {
        actorEmail: actor(req), summary: 'WhatsApp sent', payload: { to, message_id: id },
      }).catch(() => {});
      res.json({ ok: true, id, status: 'sent' });
    } catch (err) {
      await query(`UPDATE whatsapp_messages SET status='failed', error=$2 WHERE id=$1`, [id, String(err.message).slice(0, 400)]);
      const reason = err.code === 'not_connected' ? 'WhatsApp isn’t connected — connect a number in Settings.'
        : err.code === 'templates_not_enabled' || /template|24|window|re-?engagement/i.test(err.message)
          ? 'Outside the 24-hour window: WhatsApp only allows free-form replies within 24h of the customer’s last message. Message templates (for cold outreach) come next.'
          : err.message;
      res.status(400).json({ error: 'send_failed', reason, id });
    }
  } catch (err) { next(err); }
});

export default router;
