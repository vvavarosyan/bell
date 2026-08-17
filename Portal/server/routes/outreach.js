// /api/outreach — per-tenant outbound sending identity (Phase 1).
// Mounted under the `feature` gate (auth + active subscription); every route is
// scoped to req.tenant.id. The Bell-subdomain default works instantly; custom
// domains go through Resend verification.

import { Router } from 'express';
import {
  ensureBellIdentity, listIdentities, connectCustomDomain,
  verifyCustomDomain, removeCustomDomain, updateIdentity,
  saveSmtpSettings, verifySmtpSettings,
} from '../lib/email_domains.js';

const router = Router();

// GET /api/outreach/identities — list sending identities (ensures the Bell default exists)
router.get('/identities', async (req, res, next) => {
  try {
    await ensureBellIdentity(req.tenant);
    res.json({ identities: await listIdentities(req.tenant.id) });
  } catch (e) { next(e); }
});

// POST /api/outreach/domains  { domain, from_email?, from_name? } — connect a custom domain
router.post('/domains', async (req, res, next) => {
  try {
    const row = await connectCustomDomain(req.tenant.id, req.body?.domain, req.body?.from_email, req.body?.from_name);
    res.json({ domain: row });
  } catch (e) {
    if (e.message === 'invalid_domain') return res.status(400).json({ error: 'invalid_domain' });
    if (e.message === 'email_provider_key_missing') return res.status(503).json({ error: 'email_not_configured' });
    next(e);
  }
});

// POST /api/outreach/domains/:id/verify — re-check verification status
router.post('/domains/:id/verify', async (req, res, next) => {
  try { res.json({ domain: await verifyCustomDomain(req.tenant.id, req.params.id) }); }
  catch (e) {
    if (e.message === 'not_found') return res.status(404).json({ error: 'not_found' });
    if (e.message === 'email_provider_key_missing') return res.status(503).json({ error: 'email_not_configured' });
    next(e);
  }
});

// DELETE /api/outreach/domains/:id — remove a custom domain
router.delete('/domains/:id', async (req, res, next) => {
  try { await removeCustomDomain(req.tenant.id, req.params.id); res.json({ ok: true }); }
  catch (e) { if (e.message === 'not_found') return res.status(404).json({ error: 'not_found' }); next(e); }
});

// PATCH /api/outreach/identities/:id  { from_name?, signature_html?, make_default? }
router.patch('/identities/:id', async (req, res, next) => {
  try {
    const row = await updateIdentity(req.tenant.id, req.params.id, {
      fromName: req.body?.from_name,
      signatureHtml: req.body?.signature_html,
      makeDefault: !!req.body?.make_default,
    });
    res.json({ identity: row });
  } catch (e) { next(e); }
});

// ── Per-tenant SMTP ───────────────────────────────────────────────────────────────────────────
// PUT  /api/outreach/identities/:id/smtp        save the mail-server settings
// POST /api/outreach/identities/:id/smtp/test   prove them (connect + authenticate, send nothing)
//
// The password is write-only: it goes in here and never comes back out of any endpoint. Sending
// it empty on a later save keeps the stored one, which is the only way an edit can work when the
// UI cannot read it back.

router.put('/identities/:id/smtp', async (req, res, next) => {
  try {
    const b = req.body || {};
    const row = await saveSmtpSettings(req.tenant.id, req.params.id, {
      transport: b.transport, host: b.host, port: b.port, secure: b.secure,
      username: b.username, password: b.password,
      imap_host: b.imap_host, imap_port: b.imap_port, imap_secure: b.imap_secure,
      imap_username: b.imap_username, imap_password: b.imap_password,
    });
    res.json({ identity: row });
  } catch (e) {
    if (e.message === 'not_found') return res.status(404).json({ error: 'not_found' });
    // Say WHICH thing is missing. "Encryption is not configured on this deployment" is a fact an
    // operator can act on; a generic failure is not.
    if (e.message === 'secrets_not_configured') {
      return res.status(503).json({ error: 'secrets_not_configured',
        reason: 'This deployment has no encryption key, so Bell will not store a mail password. Set BDI_KEY_PII and try again.' });
    }
    next(e);
  }
});

router.post('/identities/:id/smtp/test', async (req, res, next) => {
  try {
    const out = await verifySmtpSettings(req.tenant.id, req.params.id);
    // Not an HTTP error: the request worked, the mail server said no. The server's own words are
    // the answer, unedited.
    res.json({ ok: out.ok, error: out.error, identity: out.identity });
  } catch (e) {
    if (e.message === 'not_found') return res.status(404).json({ error: 'not_found' });
    if (e.message === 'smtp_not_configured') {
      return res.status(400).json({ error: 'smtp_not_configured',
        reason: 'Enter the server address, username and password first.' });
    }
    if (e.message === 'smtp_module_missing') {
      return res.status(503).json({ error: 'smtp_module_missing',
        reason: 'The SMTP client is not installed on this deployment.' });
    }
    next(e);
  }
});

export default router;
