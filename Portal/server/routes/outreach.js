// /api/outreach — per-tenant outbound sending identity (Phase 1).
// Mounted under the `feature` gate (auth + active subscription); every route is
// scoped to req.tenant.id. The Bell-subdomain default works instantly; custom
// domains go through Resend verification.

import { Router } from 'express';
import {
  ensureBellIdentity, listIdentities, connectCustomDomain,
  verifyCustomDomain, removeCustomDomain, updateIdentity,
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

export default router;
