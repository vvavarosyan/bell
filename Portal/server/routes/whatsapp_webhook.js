// /api/whatsapp-webhook — PUBLIC Meta WhatsApp webhook (Phase F1). No auth.
//
//   GET  — Meta's subscription handshake: echoes hub.challenge when
//          hub.verify_token matches a tenant's stored verify_token.
//   POST — inbound messages + delivery/read status callbacks. We route to the
//          owning tenant by the receiving phone_number_id, thread inbound texts
//          onto the CRM record whose phone matches the sender, and update
//          delivery status on outbound messages by Meta message id.
//
// Always 200 on POST so Meta doesn't retry-storm. Signature verification
// (X-Hub-Signature-256) is a later hardening step; routing by our own stored
// phone_number_id means a forged event can at most append a note, never reach
// another tenant's data.

import { Router } from 'express';
import { query } from '../db.js';
import { ensureCrmRecord, logActivity } from '../lib/crm.js';
import { normalizeMsisdn } from '../lib/whatsapp.js';

const router = Router();

// GET — subscription verification. Meta sends hub.mode/hub.verify_token/hub.challenge.
router.get('/', async (req, res) => {
  try {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token) {
      const r = await query(`SELECT 1 FROM whatsapp_config WHERE verify_token = $1 AND active = true LIMIT 1`, [String(token)]);
      if (r.rows.length) return res.status(200).send(String(challenge || ''));
    }
    return res.sendStatus(403);
  } catch { return res.sendStatus(403); }
});

// POST — events. Body shape: entry[].changes[].value.{ metadata, messages[], statuses[] }
router.post('/', async (req, res) => {
  res.sendStatus(200);  // ack immediately; process below
  try {
    const entries = req.body?.entry || [];
    for (const entry of entries) {
      for (const change of (entry.changes || [])) {
        const v = change.value || {};
        const phoneNumberId = v?.metadata?.phone_number_id;
        if (!phoneNumberId) continue;
        const cfg = (await query(`SELECT tenant_id FROM whatsapp_config WHERE phone_number_id = $1 AND active = true`, [phoneNumberId])).rows[0];
        if (!cfg) continue;
        const tenantId = Number(cfg.tenant_id);

        // Inbound messages
        for (const m of (v.messages || [])) {
          if (m.type !== 'text' && !m.text) continue;   // v1: text only
          const from = normalizeMsisdn(m.from);
          const body = m.text?.body || '';
          const waId = m.id || null;
          // Dedupe on Meta message id.
          if (waId) {
            const dup = await query(`SELECT 1 FROM whatsapp_messages WHERE wa_message_id = $1`, [waId]);
            if (dup.rows.length) continue;
          }
          const recordId = await matchRecord(tenantId, from);
          await query(
            `INSERT INTO whatsapp_messages (tenant_id, record_id, direction, wa_from, wa_to, wa_message_id, body, status)
             VALUES ($1,$2,'in',$3,$4,$5,$6,'received')`,
            [tenantId, recordId, from, phoneNumberId, waId, body],
          );
          if (recordId) {
            await logActivity(null, tenantId, recordId, 'whatsapp_in', {
              summary: 'WhatsApp received', payload: { from },
            }).catch(() => {});
          }
        }

        // Outbound status callbacks (sent → delivered → read, or failed)
        for (const st of (v.statuses || [])) {
          const waId = st.id;
          const s = st.status;   // sent | delivered | read | failed
          if (!waId || !s) continue;
          const allowed = ['sent', 'delivered', 'read', 'failed'];
          if (!allowed.includes(s)) continue;
          await query(
            `UPDATE whatsapp_messages SET status = $2 WHERE wa_message_id = $1 AND tenant_id = $3`,
            [waId, s, tenantId],
          );
        }
      }
    }
  } catch (err) {
    console.error('[whatsapp-webhook] process error:', err.message);
  }
});

// Find the CRM record whose company/person phone matches an inbound sender.
// Compares on the last 9 digits (drops country-code / formatting differences).
async function matchRecord(tenantId, fromDigits) {
  const tail = String(fromDigits || '').slice(-9);
  if (tail.length < 8) return null;
  const r = await query(
    `SELECT r.id
       FROM crm_records r
       LEFT JOIN companies c ON r.entity_type = 'company' AND c.id = r.entity_id
       LEFT JOIN people    p ON r.entity_type = 'person'  AND p.id = r.entity_id
      WHERE r.tenant_id = $1
        AND (
          right(regexp_replace(COALESCE(c.phone,''), '[^0-9]', '', 'g'), 9) = $2
          OR right(regexp_replace(COALESCE(p.phone,''), '[^0-9]', '', 'g'), 9) = $2
        )
      ORDER BY r.id ASC
      LIMIT 1`,
    [tenantId, tail],
  );
  if (r.rows.length) return Number(r.rows[0].id);
  return null;   // unmatched inbound is still stored (record_id NULL) for an inbox view later
}

export default router;
