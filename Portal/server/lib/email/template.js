// Branded email template — now ADMIN-EDITABLE. The HTML/subject for each
// template `key` can be overridden in the email_templates table (edited from the
// admin "Email Templates" view); the built-in default below is used when there's
// no override. Rendering substitutes {{placeholders}} for the dynamic bits.
//
// Currently one key, 'base' — the shared shell used by every email (announcements,
// welcome, future). Editing it restyles all emails. Placeholders:
//   {{title}} {{body}} {{cta}} {{preheader}} {{unsubscribe}} {{year}}

import { query } from '../../db.js';

const BRAND = {
  name:   'Bell',
  accent: '#3B6CF6',
  muted:  '#64748B',
  appUrl: process.env.BELL_APP_URL  || 'https://app.bell.qa',
  site:   process.env.BELL_SITE_URL || 'https://bell.qa',
};

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
}

/** Plain text → safe paragraph HTML (preserves line breaks). */
export function textToHtml(text) {
  return String(text || '')
    .split(/\n{2,}/)
    .map(p => `<p style="margin:0 0 14px;color:#0F172A;font-size:15px;line-height:1.6;">${esc(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

function ctaButton(text, url) {
  if (!text || !url) return '';
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;">
      <tr><td style="border-radius:8px;background:${BRAND.accent};">
        <a href="${esc(url)}" target="_blank" style="display:inline-block;padding:12px 22px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${esc(text)}</a>
      </td></tr></table>`;
}

const substitute = (str, vars) => String(str || '').replace(/\{\{(\w+)\}\}/g, (_, k) => (vars[k] != null ? vars[k] : ''));

// ---------------------------------------------------------------------------
// Built-in DEFAULT templates (used until an admin saves an override)
// ---------------------------------------------------------------------------
const DEFAULT_BASE_SUBJECT = '{{title}}';
const DEFAULT_BASE_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/><meta name="color-scheme" content="light"/></head>
<body style="margin:0;padding:0;background:#F4F6FB;-webkit-font-smoothing:antialiased;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <span style="display:none!important;visibility:hidden;opacity:0;height:0;width:0;overflow:hidden;">{{preheader}}</span>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F6FB;"><tr><td align="center" style="padding:28px 14px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;">

      <tr><td style="padding:4px 6px 16px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
          <td style="font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#0F172A;"><span style="color:#3B6CF6;">&#9679;</span> Bell</td>
          <td align="right" style="font-size:12px;color:#64748B;">Bell &mdash; Qatar Business Intelligence</td>
        </tr></table>
      </td></tr>

      <tr><td style="background:#FFFFFF;border:1px solid #E5E9F2;border-radius:14px;overflow:hidden;">
        <div style="height:4px;background:#3B6CF6;"></div>
        <div style="padding:28px 30px 26px;">
          <h1 style="margin:0 0 14px;font-size:21px;line-height:1.3;color:#0F172A;font-weight:700;">{{title}}</h1>
          {{body}}
          {{cta}}
          <p style="margin:22px 0 0;color:#64748B;font-size:14px;line-height:1.6;">Best regards,<br/><strong style="color:#0F172A;">The Bell Team</strong></p>
        </div>
      </td></tr>

      <tr><td style="padding:18px 8px 6px;">
        <p style="margin:0 0 6px;color:#64748B;font-size:12px;line-height:1.6;">
          <a href="https://app.bell.qa" style="color:#3B6CF6;text-decoration:none;">Open Bell</a> &nbsp;&middot;&nbsp;
          <a href="https://bell.qa" style="color:#3B6CF6;text-decoration:none;">bell.qa</a> {{unsubscribe}}
        </p>
        <p style="margin:0;color:#64748B;font-size:11px;line-height:1.5;">Bell &middot; Doha, Qatar &middot; &copy; {{year}} Bell. All rights reserved.</p>
      </td></tr>

    </table>
  </td></tr></table>
</body></html>`;

const TEMPLATES = {
  base: {
    name: 'Base email (shared design for all emails)',
    variables: ['{{title}}', '{{body}}', '{{cta}}', '{{preheader}}', '{{unsubscribe}}', '{{year}}'],
    subject: DEFAULT_BASE_SUBJECT,
    html: DEFAULT_BASE_HTML,
  },
};

// ---------------------------------------------------------------------------
// DB-backed lookup + rendering
// ---------------------------------------------------------------------------
async function getOverride(key) {
  try {
    const r = await query(`SELECT subject, html FROM email_templates WHERE key = $1`, [key]);
    return r.rows[0] || null;
  } catch { return null; }      // table may not exist yet
}

/** Effective {subject, html} for a key (DB override → built-in default). */
async function getEffective(key) {
  const def = TEMPLATES[key] || TEMPLATES.base;
  const ov = await getOverride(key);
  return {
    subject: (ov && ov.subject) || def.subject,
    html:    (ov && ov.html)    || def.html,
  };
}

function contextFor({ title, body, ctaText = '', ctaUrl = '', unsubscribeUrl = '' }) {
  return {
    title:      esc(title || ''),
    preheader:  esc(String(body || title || '').replace(/\s+/g, ' ').slice(0, 110)),
    body:       textToHtml(body),
    cta:        ctaButton(ctaText, ctaUrl),
    unsubscribe: unsubscribeUrl ? `&nbsp;&middot;&nbsp;<a href="${esc(unsubscribeUrl)}" style="color:#64748B;text-decoration:underline;">Unsubscribe</a>` : '',
    year:       String(new Date().getFullYear()),
  };
}

/** Render an email through the (editable) 'base' template. Returns {subject, html}. */
export async function renderAnnouncementEmail(opts = {}) {
  const tpl = await getEffective('base');
  const vars = contextFor(opts);
  return { subject: substitute(tpl.subject, vars), html: substitute(tpl.html, vars) };
}

// ---------------------------------------------------------------------------
// Editor support (admin "Email Templates")
// ---------------------------------------------------------------------------
export async function listTemplatesForEditor() {
  let overrides = {};
  try {
    const r = await query(`SELECT key, updated_at, updated_by FROM email_templates`);
    for (const row of r.rows) overrides[row.key] = row;
  } catch { /* table absent */ }
  return Object.entries(TEMPLATES).map(([key, t]) => ({
    key, name: t.name,
    customized: !!overrides[key],
    updated_at: overrides[key]?.updated_at || null,
    updated_by: overrides[key]?.updated_by || null,
  }));
}

export async function getTemplateForEditor(key) {
  const def = TEMPLATES[key];
  if (!def) return null;
  const ov = await getOverride(key);
  return {
    key, name: def.name, variables: def.variables,
    subject: (ov && ov.subject) || def.subject,
    html:    (ov && ov.html)    || def.html,
    default_subject: def.subject,
    default_html: def.html,
    customized: !!ov,
  };
}

export async function saveTemplate(key, { subject, html }, updatedBy) {
  if (!TEMPLATES[key]) throw new Error('unknown template key');
  if (!html || !String(html).trim()) throw new Error('html required');
  await query(
    `INSERT INTO email_templates (key, name, subject, html, updated_by)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (key) DO UPDATE SET subject = EXCLUDED.subject, html = EXCLUDED.html, updated_by = EXCLUDED.updated_by, updated_at = now()`,
    [key, TEMPLATES[key].name, subject || '{{title}}', html, updatedBy || null],
  );
}

export async function resetTemplate(key) {
  await query(`DELETE FROM email_templates WHERE key = $1`, [key]);
}

/** Render a live preview from arbitrary subject/html with sample data. */
export function renderPreview({ subject, html }) {
  const vars = contextFor({
    title: 'This is a sample heading',
    body: 'This is what the email body looks like.\n\nYou can edit everything — colors, layout, header, footer, and signature.',
    ctaText: 'Open Bell', ctaUrl: BRAND.appUrl,
  });
  return { subject: substitute(subject || '{{title}}', vars), html: substitute(html || '', vars) };
}

export { BRAND };
