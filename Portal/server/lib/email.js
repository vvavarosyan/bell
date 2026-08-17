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

import { smtpConfigFromRow, sendViaSmtp } from './smtp.js';
import { newOpenToken, withOpenPixel } from './open_tracking.js';

const RESEND_URL = 'https://api.resend.com/emails';
const APP_URL = (process.env.BELL_APP_URL || 'https://app.bell.qa').replace(/\/$/, '');

/**
 * Does this tenant send through their OWN mail server? Returns the connection settings, or null
 * for every other case — and "null" must always mean "use Resend", never an error, or Bell's own
 * transactional mail would start failing for anyone who has not configured SMTP.
 *
 * The identity must be USABLE (status 'verified') before it can carry mail: an unverified server
 * is one whose password Bell has never proven, and discovering that at send time means a
 * customer's email silently did not go. The same rule already gates custom domains.
 */
async function resolveTenantSmtp(tenantId) {
  try {
    const { rows } = await query(
      `SELECT id, transport, status, smtp_host, smtp_port, smtp_secure,
              smtp_username, smtp_password_enc
         FROM tenant_email_domains
        WHERE tenant_id = $1 AND is_default = true AND transport = 'smtp'
        LIMIT 1`, [tenantId]);
    const row = rows[0];
    if (!row || row.status !== 'verified') return null;
    const config = await smtpConfigFromRow(row);
    return config ? { identityId: row.id, config } : null;
  } catch (err) {
    // A missing column (before migration 122 runs) or an unreadable secret must not take the
    // send path down — Bell falls back to its own provider and says so in the log.
    console.warn('[email] tenant SMTP lookup failed, using Bell\'s provider:', err.message);
    return null;
  }
}
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
    // ⚠️ settings.value is JSONB and the pg driver parses it, so `String(...)` on a non-string is
    // not a no-op: jsonb `null` becomes the string "null", an object becomes "[object Object]",
    // an array becomes "1,2". All three are truthy, so `|| DEFAULT_FROM` could never fire and one
    // of those would have been handed to Resend as the From header. Not live today — nothing in
    // the repo writes this key — but the jsonb-null shape does exist in this table already
    // (SettingsTab's `|| null` idiom wrote it for mapbox_style), so it is one bad PATCH away.
    // Take it only if it is genuinely a string AND genuinely an address.
    const raw = r.rows[0]?.value;
    const v = typeof raw === 'string' ? raw.trim().replace(/^"|"$/g, '') : '';
    return (v && isSendableAddress(v)) ? v : DEFAULT_FROM;
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

// The universal ledger (migration 097): EVERY send — success or failure — leaves an email_log
// row here at the chokepoint, so the admin can count every email Bell ever sends, from every
// system. Fire-and-forget: a ledger hiccup never blocks a send.
async function logSend({ system, channel, tenantId, from, to, subject, ok, providerMessageId, error }) {
  try {
    const { query } = await import('../db.js');
    await query(
      `INSERT INTO email_log (system, channel, tenant_id, from_email, to_email, subject, status, provider_message_id, error)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [system || 'transactional', channel === 'outreach' ? 'outreach' : 'transactional', tenantId || null,
       from || null, Array.isArray(to) ? to.join(', ') : String(to || ''), String(subject || '').slice(0, 300),
       ok ? 'sent' : 'failed', providerMessageId || null, error ? String(error).slice(0, 400) : null]);
  } catch { /* the ledger must never break sending */ }
}

export async function sendEmail({ from, to, replyTo, subject, html, text, cc, headers, channel, system, tenantId }) {
  const isOutreach = channel === 'outreach';

  // ── WHICH WIRE DOES THIS MESSAGE LEAVE ON? ────────────────────────────────────────────────
  // A tenant may send their CRM mail through their OWN server. Resolved here, at the single
  // chokepoint, and nowhere else: a transport branch per route is how a guard gets forgotten on
  // the third path (contact_guard.js exists because that happened three times).
  //
  // ⚠️ OUTREACH IS NEVER A TENANT'S SERVER. Bell's cold outreach rides its own isolated Resend
  // account on go.bell.qa so a reputation problem there can never touch transactional mail —
  // and by the same logic Bell's own bulk sending must never leave from a customer's domain.
  //   ⚠️ No tenant → Resend. Local-admin mode has no tenant at all (routes/crm.js passes
  //   req.tenant?.id, which is undefined there), and that must keep working, not error.
  const smtp = (!isOutreach && tenantId) ? await resolveTenantSmtp(tenantId) : null;

  // The Resend key is required only when Resend is the one carrying it. A tenant sending
  // through their own server must not be blocked because BELL's provider key is absent.
  const key = smtp ? null : await getKey(isOutreach ? 'resend-outreach' : 'resend');
  if (!smtp && !key) throw new Error(isOutreach ? 'outreach_channel_not_configured' : 'email_provider_key_missing');
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

  // ⚠️ A REPLY-TO THAT IS NOT AN ADDRESS MUST NOT COST THE WHOLE EMAIL.
  // Val, 2026-08-10, sending a CRM test from the local Portal:
  //     resend 422: Invalid `reply_to` field. The email address needs to follow the
  //     `email@example.com` or `Name <email@example.com>` format.
  // The value was 'admin@local' — the local-admin identity (lib/auth.js:42), which has no dot in
  // its domain. routes/crm.js sets reply_to from the acting user's email, and nothing between
  // there and Resend ever asked whether it was an address. This was the only validity check
  // anywhere on the send path, and it lived at Resend.
  //
  // DROPPING IT IS THE CORRECT ANSWER HERE, and only because of what reply_to actually does in
  // this codebase — not as a general principle:
  //   • When BDI_CRM_INBOUND_DOMAIN is set, reply_to is `reply+<id>@<domain>`, generated by Bell
  //     (inboundReplyTo). It is load-bearing — crm/inbound.js finds the conversation ONLY through
  //     that token — but it is machine-made and therefore always well-formed. It can never be
  //     the invalid one, so this guard can never discard threading.
  //   • Otherwise reply_to is just the human's own address, and its only job is routing the reply
  //     to their inbox. If it is not a real address, that routing was never going to happen. An
  //     omitted reply_to sends replies to `from`, which IS a verified, monitored sending identity.
  // So the choice is between a mail nobody can reply to, and no mail at all. Bell sends.
  //
  // What Bell must NOT do is stay quiet about it. The dropped value is returned to the caller so
  // the CRM can tell the user their replies are going somewhere else — Rule 2.1 applies to what
  // Bell implies as much as to what it stores.
  const wantedReplyTo = replyTo ? String(replyTo).trim() : '';
  const replyToUsable = !!wantedReplyTo && isSendableAddress(wantedReplyTo);
  if (replyToUsable) body.reply_to = wantedReplyTo;
  const replyToDropped = wantedReplyTo && !replyToUsable ? wantedReplyTo : null;
  if (replyToDropped) {
    console.warn(`[email] dropped an unusable reply-to (${replyToDropped}) — replies to this message will go to ${body.from}`);
  }
  if (ccAllowed.length) body.cc = ccAllowed;
  // Custom headers — this is how outreach sets the one-click unsubscribe (List-Unsubscribe +
  // List-Unsubscribe-Post) that Gmail/Yahoo now require and Qatar law wants as a working
  // opt-out. Was impossible before: the body had no headers field, so no marketing email
  // could carry it. Harmless when unset (existing callers pass nothing).
  if (headers && typeof headers === 'object' && Object.keys(headers).length) body.headers = headers;

  // ── DELIVERY ──────────────────────────────────────────────────────────────────────────────
  // Everything above this line — suppression, the from identity, the reply-to decision, the
  // headers — is transport-independent and stays that way. Only the wire changes here, and the
  // ledger below records the send either way.
  if (smtp) {
    // Opens: with no provider in the path, the only signal is Bell's own pixel. Minted here so
    // the token cannot disagree with the html that was actually sent, and returned so the
    // caller can store it against the row it wrote.
    const openToken = body.html ? newOpenToken() : null;
    const htmlOut = openToken ? withOpenPixel(body.html, openToken, APP_URL) : body.html;
    try {
      const info = await sendViaSmtp(smtp.config, {
        from: body.from, to: toAllowed, cc: ccAllowed, replyTo: body.reply_to,
        subject: body.subject, html: htmlOut, text: body.text, headers: body.headers,
      });
      // A server that accepted the envelope but rejected every recipient has not sent anything.
      if (Array.isArray(info.accepted) && info.accepted.length === 0) {
        const why = 'the mail server accepted no recipient' + (info.response ? ': ' + info.response : '');
        await logSend({ system, channel, tenantId, from: body.from, to: toAllowed, subject, ok: false, error: 'smtp: ' + why });
        throw Object.assign(new Error('smtp_rejected: ' + why), { code: 'smtp_rejected', smtp_response: info.response || null });
      }
      await logSend({ system, channel, tenantId, from: body.from, to: toAllowed, subject, ok: true, providerMessageId: info.messageId });
      return {
        id: info.messageId, raw: info, transport: 'smtp', open_token: openToken,
        reply_to_dropped: replyToDropped, reply_to_used: body.reply_to || null,
      };
    } catch (err) {
      if (err.code === 'smtp_rejected') throw err;      // already logged, already explained
      // The mail server's own words, unedited — never "Could not send the email."
      const said = err?.response || err?.message || String(err);
      await logSend({ system, channel, tenantId, from: body.from, to: toAllowed, subject, ok: false, error: 'smtp: ' + String(said).slice(0, 300) });
      throw Object.assign(new Error('smtp_failed: ' + String(said).slice(0, 300)),
        { code: 'smtp_failed', smtp_response: String(said).slice(0, 300) });
    }
  }

  const res = await fetch(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text_ = await res.text();
  let data; try { data = JSON.parse(text_); } catch { data = { raw: text_ }; }
  if (!res.ok) {
    const msg = data?.message || data?.error || text_;
    await logSend({ system, channel, tenantId, from: body.from, to: toAllowed, subject, ok: false, error: 'resend ' + res.status + ': ' + String(msg).slice(0, 300) });
    throw new Error('resend ' + res.status + ': ' + String(msg).slice(0, 300));
  }
  const msgId = data?.id || data?.data?.id || null;
  await logSend({ system, channel, tenantId, from: body.from, to: toAllowed, subject, ok: true, providerMessageId: msgId });
  return { id: msgId, raw: data, reply_to_dropped: replyToDropped, reply_to_used: body.reply_to || null };
}

/**
 * Is this something a mail provider will accept in an address header?
 *
 * Deliberately NOT normalizeEmail() from lib/contacts.js: that one lowercases and returns a
 * canonical value for STORAGE, and it would quietly rewrite a header Bell was handed. Here Bell
 * only needs a yes or no about the value as given, and it accepts both forms Resend documents —
 * a bare address, and "Display Name <address>".
 *
 * The rule that matters is the one that caught 'admin@local': the domain must contain a dot. Bell
 * does not try to be cleverer than that — a stricter regex would start rejecting real addresses,
 * and this function's only job is to keep a guaranteed 422 from costing a real email.
 */
export function isSendableAddress(raw) {
  const s = String(raw || '').trim();
  if (!s || s.length > 320) return false;
  const m = s.match(/^[^<>]*<([^<>]+)>$/);       // "Name <a@b.com>" → a@b.com
  const addr = (m ? m[1] : s).trim();
  // A stray bracket means the display form is half-written ("<a@b.com"), which the regex below
  // would otherwise wave through — `<` is not whitespace, an @ or a comma. Caught by its own test.
  if (addr.includes('<') || addr.includes('>')) return false;
  return /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/.test(addr);
}
