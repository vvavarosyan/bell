// /api/crm-inbound — inbound email webhook (machine-to-machine, NOT Clerk-gated).
// Optional alternative to the IMAP poller: point a provider (Mailgun, Postmark,
// a cPanel pipe, …) here with normalized JSON, authenticated by
// BDI_CRM_INBOUND_TOKEN. The IMAP poller (crm/inbound_poller.js) is the primary
// path for cPanel-hosted mail; both share crm/inbound.js processInboundReply.

import { Router } from 'express';
import { processInboundReply, parseReplyId } from '../crm/inbound.js';

const router = Router();
const TOKEN = process.env.BDI_CRM_INBOUND_TOKEN || null;

function recipientOf(body) {
  const out = [];
  const push = (v) => { if (typeof v === 'string') out.push(v); else if (Array.isArray(v)) v.forEach(push); else if (v && typeof v === 'object') { if (v.address) out.push(v.address); if (v.email) out.push(v.email); } };
  push(body.to); push(body.recipient); push(body.recipients); push(body.envelope && body.envelope.to); push(body.toAddress);
  return out;
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
    if (!TOKEN) return res.status(503).json({ error: 'inbound_disabled' });
    const provided = req.get('x-bdi-inbound-token') || req.query.token;
    if (provided !== TOKEN) return res.status(401).json({ error: 'unauthorized' });

    const body = req.body || {};
    let emailId = null;
    for (const r of recipientOf(body)) { emailId = parseReplyId(r); if (emailId) break; }

    const out = await processInboundReply({
      emailId,
      fromAddr: firstAddr(body.from) || firstAddr(body.sender),
      subject: body.subject,
      text: body.text || body['body-plain'] || body.plain || body.stripped_text || '',
    });
    res.json({ ok: true, ...out });   // 200 so the provider doesn't retry on unmatched
  } catch (err) { next(err); }
});

export default router;
