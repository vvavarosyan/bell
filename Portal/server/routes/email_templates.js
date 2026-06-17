// /api/email-templates — admin-editable email templates (style + content).
// Overrides are stored in email_templates; the renderer falls back to the
// built-in default when there's no override. Admin-only (mounted behind the
// adminOnly gate). Edit on admin.bell.qa to affect production emails (that's
// where notification/announcement emails are sent from).

import { Router } from 'express';
import {
  listTemplatesForEditor, getTemplateForEditor, saveTemplate, resetTemplate, renderPreview,
} from '../lib/email/template.js';
import { sendEmail, emailProviderConfigured } from '../lib/email.js';

const router = Router();

// POST /api/email-templates/:key/test { to, subject, html } — send a REAL test
// email of the current editor content. Returns a clear reason if it can't send,
// so the admin can diagnose (e.g. Resend key missing on this service).
router.post('/:key/test', async (req, res, next) => {
  try {
    const to = String(req.body?.to || req.user?.email || '').trim();
    if (!to) return res.json({ ok: false, error: 'No recipient address.' });
    if (!(await emailProviderConfigured())) {
      return res.json({ ok: false, error: 'Email provider (Resend) is not configured on this service.' });
    }
    const r = renderPreview({ subject: req.body?.subject, html: req.body?.html });
    await sendEmail({ to, subject: '[Bell test] ' + (r.subject || 'Email template'), html: r.html });
    res.json({ ok: true, to });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

router.get('/', async (req, res, next) => {
  try { res.json({ rows: await listTemplatesForEditor() }); }
  catch (err) { next(err); }
});

// Live preview from arbitrary subject/html (used while editing) — declared
// before /:key so it isn't captured as a template key.
router.post('/preview', (req, res) => {
  res.json(renderPreview({ subject: req.body?.subject, html: req.body?.html }));
});

router.get('/:key', async (req, res, next) => {
  try {
    const t = await getTemplateForEditor(req.params.key);
    if (!t) return res.status(404).json({ error: 'unknown_template' });
    res.json(t);
  } catch (err) { next(err); }
});

router.put('/:key', async (req, res, next) => {
  try {
    await saveTemplate(req.params.key, { subject: req.body?.subject, html: req.body?.html }, req.user?.email || 'admin');
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.post('/:key/reset', async (req, res, next) => {
  try { await resetTemplate(req.params.key); res.json({ ok: true }); }
  catch (err) { next(err); }
});

export default router;
