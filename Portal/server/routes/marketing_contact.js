// /api/marketing-contact — PUBLIC contact-form endpoint for the marketing site (bell.qa/contact).
// Validates, rate-limits per IP, then emails the message to Bell's inbox with Reply-To set to
// the visitor — Val answers straight from his mailbox. Every send is in the universal email
// ledger (system 'contact-form'). Not Clerk-gated (visitors aren't logged in); it only ever
// SENDS one internal email — it can't read or modify anything.

import { Router } from 'express';
import { sendEmail } from '../lib/email.js';

const router = Router();
const INBOX = process.env.BDI_CONTACT_INBOX || 'hello@bell.qa';

// Fixed-window limiter: max 5 messages per IP per hour (in-memory, resets on deploy).
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const w = hits.get(ip) || { start: now, n: 0 };
  if (now - w.start > 3600_000) { w.start = now; w.n = 0; }
  w.n += 1;
  hits.set(ip, w);
  if (hits.size > 5000) hits.clear();
  return w.n > 5;
}

router.post('/', async (req, res) => {
  try {
    const ip = String(req.headers['x-forwarded-for'] || req.ip || 'unknown');
    if (limited(ip)) return res.status(429).json({ error: 'too_many_requests' });

    const name = String(req.body?.name || '').trim().slice(0, 120);
    const email = String(req.body?.email || '').trim().toLowerCase();
    const company = String(req.body?.company || '').trim().slice(0, 200);
    const message = String(req.body?.message || '').trim().slice(0, 5000);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return res.status(400).json({ error: 'invalid_email' });
    if (!name || !message) return res.status(400).json({ error: 'missing_fields' });

    const text = [
      'New message from the bell.qa contact form.',
      '',
      'Name:    ' + name,
      'Email:   ' + email,
      'Company: ' + (company || '(not given)'),
      'IP:      ' + ip.slice(0, 100),
      '',
      'Message:',
      message,
      '',
      'Reply to this email to answer ' + name + ' directly.',
    ].join('\n');

    await sendEmail({
      to: INBOX, replyTo: email,
      subject: 'Contact form: ' + name + (company ? ' (' + company + ')' : ''),
      text, system: 'contact-form',
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('[contact-form]', e.message);
    res.status(500).json({ error: 'failed' });
  }
});

export default router;
