// Email branding (Val 2026-07-12: "outgoing emails look too plain — users must
// have their email header, footer, signature… Bella must use the same header
// and footer that had been set up in settings").
// ----------------------------------------------------------------------------
// The sender's header + footer (+ signature) live in
// users.extra_fields.profile.{email_header_html,email_footer_html,email_signature}
// and the append-signature toggle in preferences.append_signature. Every
// outgoing CRM email is wrapped in a clean, email-safe HTML shell with the
// header on top and the footer at the bottom; a plain-text twin is always sent
// too, so no-HTML clients still read cleanly. Header/footer/signature are the
// tenant admin's OWN html — trusted, but active content (<script>, on*=…,
// javascript:) is stripped defensively.

import { query } from '../db.js';

/** The signed-in sender's branding + append-signature preference. */
export async function getEmailBranding(userId) {
  const empty = { header: '', footer: '', signature: '', appendSignature: true };
  if (!userId) return empty;
  try {
    const r = await query(`SELECT extra_fields FROM users WHERE id = $1`, [userId]);
    const extra = r.rows[0]?.extra_fields || {};
    const prof = extra.profile || {};
    const prefs = extra.preferences || {};
    return {
      header: String(prof.email_header_html || '').trim(),
      footer: String(prof.email_footer_html || '').trim(),
      signature: String(prof.email_signature || '').trim(),
      appendSignature: prefs.append_signature !== false,
    };
  } catch { return empty; }
}

/** Same, resolved by the sender's email (sequences store the enroller's email,
 *  not their user id). Falls back to no branding if the user can't be found. */
export async function getEmailBrandingByEmail(email) {
  const empty = { header: '', footer: '', signature: '', appendSignature: true };
  if (!email) return empty;
  try {
    const r = await query(`SELECT id FROM users WHERE lower(email) = lower($1) LIMIT 1`, [String(email).trim()]);
    return r.rows[0]?.id ? getEmailBranding(r.rows[0].id) : empty;
  } catch { return empty; }
}

/** True when the sender has a header or footer worth wrapping the email in. */
export function hasBranding(b) { return !!(b && (b.header || b.footer)); }

const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Trusted admin HTML, but never let active content through to a recipient.
function sanitize(html) {
  return String(html || '')
    .replace(/<\s*script[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*style[\s\S]*?<\s*\/\s*style\s*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, '')
    .replace(/\son[a-z]+\s*=\s*'[^']*'/gi, '')
    .replace(/javascript:/gi, '');
}

const stripTags = (s) => String(s || '').replace(/<[^>]+>/g, '').replace(/\n{3,}/g, '\n\n').trim();
const looksHtml = (s) => /<[a-z][\s\S]*>/i.test(String(s || ''));

// The message body is ALWAYS plain text (send_email's contract) — escape it and
// turn blank lines into paragraphs / single newlines into <br>. Never treat a
// body containing "<" as HTML: "price < 5" or "<budget>" must not vanish.
function bodyToHtml(text) {
  const paras = String(text || '').split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  return paras.map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, '<br>')}</p>`).join('') || '<p style="margin:0"></p>';
}

/**
 * Render an outgoing email as { html, text }.
 *   bodyText — the message body (plain text, tokens already merged)
 *   branding — from getEmailBranding()
 * `html` is null when there is nothing to brand AND no signature — the caller
 * then sends plain text only. `text` is always the plain-text twin (what we
 * store on the record + what a no-HTML client sees).
 */
export function renderBrandedEmail({ bodyText, branding }) {
  const b = branding || {};
  const sig = b.appendSignature !== false ? String(b.signature || '').trim() : '';
  const text = (String(bodyText || '').replace(/\s+$/, '') + (sig ? '\n\n' + stripTags(sig) : '')).trim();

  if (!hasBranding(b) && !sig) return { html: null, text };   // nothing to wrap → plain send

  const sigHtml = sig
    ? `<div style="margin:16px 0 0;white-space:pre-wrap;color:#333">${looksHtml(sig) ? sanitize(sig) : esc(sig).replace(/\n/g, '<br>')}</div>`
    : '';
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f4f5f7">`
    + `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7"><tr><td align="center" style="padding:20px 12px">`
    + `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">`
    + (b.header ? `<tr><td style="padding:18px 24px;border-bottom:1px solid #eee">${sanitize(b.header)}</td></tr>` : '')
    + `<tr><td style="padding:22px 24px;font-size:15px;line-height:1.6;color:#222">${bodyToHtml(bodyText)}${sigHtml}</td></tr>`
    + (b.footer ? `<tr><td style="padding:14px 24px;border-top:1px solid #eee;font-size:12px;color:#888">${sanitize(b.footer)}</td></tr>` : '')
    + `</table></td></tr></table></body></html>`;
  return { html, text };
}
