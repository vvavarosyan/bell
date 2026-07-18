// /api/marketing-inbound — inbound webhook for REPLIES to Bell's outreach. Machine-to-machine,
// NOT Clerk-gated. Point a mail provider (Resend inbound, a cPanel pipe, Mailgun routes, …) here
// with normalized JSON, authenticated by BDI_OUTREACH_INBOUND_TOKEN.
//
// Effect: logs the reply so the admin mail view shows it, and marks that address's most recent
// sent target as 'replied' (reply-stop — the automation must not keep emailing someone who has
// answered a human).

import { Router } from 'express';
import { recordOutreachReply } from '../outreach/engine.js';

const router = Router();
const TOKEN = process.env.BDI_OUTREACH_INBOUND_TOKEN || null;

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
    const out = await recordOutreachReply({
      fromEmail: firstAddr(body.from) || firstAddr(body.sender),
      toEmail: firstAddr(body.to) || firstAddr(body.recipient) || null,
      subject: body.subject || null,
      text: body.text || body['body-plain'] || body.plain || body.stripped_text || '',
    });
    res.json({ ok: true, ...out });   // 200 so the provider doesn't retry an unmatched reply
  } catch (err) { next(err); }
});

export default router;
