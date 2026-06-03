// Email sending via Resend's HTTP API (no SDK dependency — same raw-fetch
// pattern as the Firecrawl client). Used by the CRM for outreach.
//
// Key: getKey('resend') → BDI_KEY_RESEND on Railway (or the Settings keychain).
// Sending domain must be verified in Resend (bell.qa). The default From address
// is the `crm_email_from` setting; reply_to is the human sender so replies go to
// their inbox.

import { getKey } from '../keychain.js';
import { query } from '../db.js';

const RESEND_URL = 'https://api.resend.com/emails';
const DEFAULT_FROM = 'Bell <outreach@bell.qa>';

export async function getFromAddress() {
  try {
    const r = await query(`SELECT value FROM settings WHERE key = 'crm_email_from'`);
    const v = r.rows.length ? String(r.rows[0].value).replace(/^"|"$/g, '') : '';
    return v || DEFAULT_FROM;
  } catch { return DEFAULT_FROM; }
}

export function emailProviderConfigured() {
  return getKey('resend').then((k) => !!k).catch(() => false);
}

// When an inbound domain is configured (BDI_CRM_INBOUND_DOMAIN, e.g.
// "inbound.bell.qa"), outbound CRM mail uses a plus-addressed reply-to that
// routes replies back to Bell's inbound webhook, keyed by the crm_emails id.
// Until then this returns null and callers keep replies going to the human sender.
export function inboundReplyTo(emailId) {
  const dom = (process.env.BDI_CRM_INBOUND_DOMAIN || '').trim();
  return dom ? `reply+${emailId}@${dom}` : null;
}

/**
 * Send one email through Resend.
 * @returns {Promise<{id:string, raw:object}>}  the provider message id
 * @throws on missing key / provider error (caller maps to a safe message)
 */
export async function sendEmail({ from, to, replyTo, subject, html, text, cc }) {
  const key = await getKey('resend');
  if (!key) throw new Error('email_provider_key_missing');           // internal — sanitize upstream
  if (!to) throw new Error('missing_recipient');

  const body = {
    from: from || (await getFromAddress()),
    to: Array.isArray(to) ? to : [to],
    subject: subject || '(no subject)',
  };
  if (html) body.html = html;
  if (text) body.text = text;
  if (!html && !text) body.text = '';
  if (replyTo) body.reply_to = replyTo;
  if (cc) body.cc = Array.isArray(cc) ? cc : [cc];

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text_ = await res.text();
  let data; try { data = JSON.parse(text_); } catch { data = { raw: text_ }; }
  if (!res.ok) {
    const msg = data?.message || data?.error || text_;
    throw new Error('resend ' + res.status + ': ' + String(msg).slice(0, 300));
  }
  return { id: data?.id || data?.data?.id || null, raw: data };
}
