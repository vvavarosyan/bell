// Email sending via Resend's HTTP API (no SDK dependency — same raw-fetch
// pattern as the Firecrawl client). Used by the CRM for outreach.
//
// Key: getKey('resend') → BDI_KEY_RESEND on Railway (or the Settings keychain).
// Sending domain must be verified in Resend (bell.qa). The default From address
// is the `crm_email_from` setting; reply_to is the human sender so replies go to
// their inbox.

import { getKey } from '../keychain.js';
import { query } from '../db.js';
import { filterSuppressed } from './suppression.js';

const RESEND_URL = 'https://api.resend.com/emails';
// Transactional mail (team invites, notifications, template tests) must NOT come from an
// "outreach@" mailbox: it reads as marketing on a login invite, and it mixes Bell's
// transactional identity with its marketing identity — the one thing every deliverability
// guide says to keep apart, since a marketing reputation hit would then land on the mail
// people actually need. The `crm_email_from` setting overrides this when set (it never has
// been — verified 2026-07-17, hence every invite to date has gone out as outreach@).
// Val chose hello@bell.qa (2026-07-17); the mailbox lives on NameHero/cPanel so replies
// reach a human. Resend verifies the DOMAIN (resend._domainkey.bell.qa is live), so any
// @bell.qa local-part sends and signs correctly.
const DEFAULT_FROM = 'Bell <hello@bell.qa>';

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
// Outreach (Bell's self-marketing) sends through a SEPARATE, ISOLATED Resend account and
// its own subdomain (go.bell.qa), so an outreach reputation/AUP problem can NEVER take down
// the transactional account that carries team invites, receipts and every tenant's CRM mail
// (single chokepoint). channel:'outreach' selects the outreach key — and deliberately does
// NOT fall back to the transactional key if it is missing: a fallback would defeat the whole
// firewall. It stays inert until BDI_KEY_RESEND_OUTREACH exists (second Resend account).
export const OUTREACH_FROM = process.env.BDI_OUTREACH_FROM || 'Bell <hello@go.bell.qa>';

export async function sendEmail({ from, to, replyTo, subject, html, text, cc, headers, channel }) {
  const isOutreach = channel === 'outreach';
  const key = await getKey(isOutreach ? 'resend-outreach' : 'resend');
  if (!key) throw new Error(isOutreach ? 'outreach_channel_not_configured' : 'email_provider_key_missing');
  if (!to) throw new Error('missing_recipient');

  // Accuracy loop: never send to a suppressed address (hard bounce / complaint /
  // manual). Drop suppressed recipients; if every primary recipient is gone, stop.
  const { allowed: toAllowed } = await filterSuppressed(Array.isArray(to) ? to : [to]);
  if (!toAllowed.length) throw new Error('recipient_suppressed');
  const ccAllowed = cc ? (await filterSuppressed(Array.isArray(cc) ? cc : [cc])).allowed : [];

  const body = {
    from: from || (isOutreach ? OUTREACH_FROM : await getFromAddress()),
    to: toAllowed,
    subject: subject || '(no subject)',
  };
  if (html) body.html = html;
  if (text) body.text = text;
  if (!html && !text) body.text = '';
  if (replyTo) body.reply_to = replyTo;
  if (ccAllowed.length) body.cc = ccAllowed;
  // Custom headers — this is how outreach sets the one-click unsubscribe (List-Unsubscribe +
  // List-Unsubscribe-Post) that Gmail/Yahoo now require and Qatar law wants as a working
  // opt-out. Was impossible before: the body had no headers field, so no marketing email
  // could carry it. Harmless when unset (existing callers pass nothing).
  if (headers && typeof headers === 'object' && Object.keys(headers).length) body.headers = headers;

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
