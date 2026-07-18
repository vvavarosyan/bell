// Outreach consent + one-click unsubscribe. The compliance spine: every outreach send
// carries a unique unsubscribe token; hitting it withdraws consent AND suppresses the
// address everywhere (reusing the existing email_suppression via addSuppression). Consent
// is an APPEND-ONLY ledger — state is the latest row for an email.

import { randomBytes } from 'crypto';
import { query } from '../db.js';
import { addSuppression } from '../lib/suppression.js';
import { packRaw } from '../tenders/raw.js';

// The unsubscribe link + List-Unsubscribe header point at the Railway APP (app.bell.qa) —
// NOT the go.bell.qa sending subdomain, whose DNS points at cPanel, not the app.
const APP_URL = (process.env.BELL_APP_URL || 'https://app.bell.qa').replace(/\/$/, '');
const norm = (e) => String(e || '').trim().toLowerCase();

// Append a consent event. NEVER updates/deletes — the ledger is the proof.
export async function recordConsent(email, {
  action, basis, companyId = null, formVersion = null, wordingShown = null,
  noticeVersion = null, ip = null, userAgent = null, evidence = {},
} = {}) {
  const r = await query(
    `INSERT INTO outreach_consent
       (email, company_id, action, basis, form_version, wording_shown, notice_version, ip, user_agent, evidence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb) RETURNING id, created_at`,
    [norm(email), companyId, action, basis, formVersion, wordingShown, noticeVersion, ip, userAgent, packRaw(evidence || {})]);
  return r.rows[0];
}

// Current consent state: true iff the latest event for this email is 'granted'.
export async function hasConsent(email) {
  const r = await query(
    `SELECT action FROM outreach_consent WHERE lower(email)=lower($1) ORDER BY created_at DESC, id DESC LIMIT 1`,
    [norm(email)]);
  return r.rows[0]?.action === 'granted';
}

// The SEND-TIME opt-out gate: true iff this address's LATEST consent event is a withdrawal.
// Absence of any consent row returns false — cold outreach runs on the founder-instruction
// basis, not on prior consent, so "no row" is NOT "opted out" (using hasConsent here would
// wrongly block every target). This is the predicate the engine checks before each send.
export async function isOptedOut(email) {
  const r = await query(
    `SELECT action FROM outreach_consent WHERE lower(email)=lower($1) ORDER BY created_at DESC, id DESC LIMIT 1`,
    [norm(email)]);
  return r.rows[0]?.action === 'withdrawn';
}

// Mint an opaque one-click unsubscribe token for a specific send.
export async function generateOptoutToken(email, { companyId = null, campaignId = null, crmEmailId = null } = {}) {
  const token = randomBytes(32).toString('base64url');
  await query(
    `INSERT INTO outreach_optout_tokens (token, email, company_id, campaign_id, crm_email_id)
     VALUES ($1,$2,$3,$4,$5)`,
    [token, norm(email), companyId, campaignId, crmEmailId]);
  return token;
}

// The RFC 8058 headers every outreach email must carry (one-click unsubscribe that
// Gmail/Yahoo honour and Qatar law wants as a working opt-out).
// HTTPS one-click ONLY. An https List-Unsubscribe + the One-Click Post header fully satisfies
// RFC 8058 and the Gmail/Yahoo bulk-sender rules on its own. We deliberately do NOT advertise a
// mailto: because no mailbox is wired to receive and process unsubscribe emails — advertising an
// unread opt-out address is itself a compliance/complaint risk (a recipient could email it and
// never be removed). Add a mailto back only if a real unsubscribe@ mailbox is built and wired to
// addSuppression.
export function listUnsubscribeHeaders(token) {
  const url = `${APP_URL}/u/${token}`;
  return {
    'List-Unsubscribe': `<${url}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

// Honour an unsubscribe: mark the token used, append a 'withdrawn' consent event, and
// suppress the address so nothing (outreach OR CRM) ever sends to it again. Idempotent.
export async function unsubscribeByToken(token, { ip = null, userAgent = null } = {}) {
  const t = (await query(`SELECT token, email, company_id, campaign_id, crm_email_id, used_at FROM outreach_optout_tokens WHERE token=$1`, [String(token || '')])).rows[0];
  if (!t) return { ok: false, reason: 'unknown_token' };
  if (!t.used_at) await query(`UPDATE outreach_optout_tokens SET used_at=now() WHERE token=$1`, [token]);
  await recordConsent(t.email, {
    action: 'withdrawn', basis: 'web_form', companyId: t.company_id, ip, userAgent,
    evidence: { via: 'one_click_unsubscribe', token, campaign_id: t.campaign_id, crm_email_id: t.crm_email_id },
  });
  await addSuppression(t.email, 'unsubscribe', 'one-click unsubscribe', 'outreach').catch(() => {});
  return { ok: true, email: t.email, already: !!t.used_at };
}
