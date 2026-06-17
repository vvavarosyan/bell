// /api/email-templates — admin-editable email templates (style + content).
// Overrides are stored in email_templates; the renderer falls back to the
// built-in default when there's no override. Admin-only (mounted behind the
// adminOnly gate). Edit on admin.bell.qa to affect production emails (that's
// where notification/announcement emails are sent from).

import { Router } from 'express';
import {
  listTemplatesForEditor, getTemplateForEditor, saveTemplate, resetTemplate, renderPreview,
} from '../lib/email/template.js';

const router = Router();

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
