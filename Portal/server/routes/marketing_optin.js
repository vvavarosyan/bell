// /api/marketing-optin — PUBLIC opt-in endpoint (the lawful growth path). The marketing site
// (bell.qa) posts { email, company? } when someone asks to hear from Bell; that consent is
// recorded VERBATIM in the append-only ledger (basis 'web_form'), which is exactly the prior
// consent PDPPL Art 22 wants. Consented addresses are the strongest tier the engine can email.
//
// Not Clerk-gated (visitors aren't logged in). Hardened: strict input validation, per-IP
// rate-limited, and it only ever ADDS a consent row — it can't read or modify anything.

import { Router } from 'express';
import { recordConsent, hasConsent } from '../outreach/optout.js';
import { sendWelcome } from '../outreach/digest.js';

const router = Router();

// Tiny fixed-window rate limiter: max 10 opt-ins per IP per hour (in-memory; resets on deploy —
// fine for abuse protection, not accounting).
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const w = hits.get(ip) || { start: now, n: 0 };
  if (now - w.start > 3600_000) { w.start = now; w.n = 0; }
  w.n += 1;
  hits.set(ip, w);
  if (hits.size > 5000) hits.clear();          // memory guard
  return w.n > 10;
}

const WORDING = 'I would like Bell (bell.qa) to email me about Qatar business intelligence, tenders and market signals. I can unsubscribe at any time.';

router.post('/', async (req, res) => {
  try {
    const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
    if (limited(String(ip))) return res.status(429).json({ error: 'too_many_requests' });
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'invalid_email' });
    const company = String(req.body?.company || '').trim().slice(0, 200) || null;
    const already = await hasConsent(email).catch(() => false);
    await recordConsent(email, {
      action: 'granted', basis: 'web_form', formVersion: 'optin-v1',
      wordingShown: WORDING, noticeVersion: 'v1',
      ip: String(ip).slice(0, 100), userAgent: (req.get('user-agent') || '').slice(0, 300),
      evidence: { company, source: 'marketing-optin' },
    });
    // Welcome email — only on a NEW subscription (re-submitting the form doesn't re-welcome).
    // Fire-and-forget: the form response never waits on the send.
    if (!already) sendWelcome(email).catch(() => {});
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'failed' }); }
});

export default router;
