// Email suppression — the do-not-send list + bounce-driven data downgrade.
// ---------------------------------------------------------------------------
// A hard bounce or spam complaint means an address is bad. We:
//   1. add it to a GLOBAL suppression list so no future outreach goes to it, and
//   2. downgrade the matching canonical contacts (is_verified=false,
//      email_status='bounced'/'complained') so the bad address stops being
//      treated as good data and can be re-verified later.
// The send path calls filterSuppressed() before every send.

import { query } from '../db.js';
import { normalizeEmail } from './contacts.js';

/** Is this address on the suppression list? */
export async function isSuppressed(email) {
  const e = normalizeEmail(email);
  if (!e) return false;
  const r = await query(`SELECT 1 FROM email_suppressions WHERE email = $1 LIMIT 1`, [e]);
  return r.rows.length > 0;
}

/**
 * Split a list of addresses into { allowed, suppressed } (preserving the
 * caller's original spellings). One DB round-trip.
 */
export async function filterSuppressed(list) {
  const arr = (Array.isArray(list) ? list : [list]).filter(Boolean);
  if (!arr.length) return { allowed: [], suppressed: [] };
  const normMap = new Map(); // normalized -> original
  for (const x of arr) { const e = normalizeEmail(x); if (e && !normMap.has(e)) normMap.set(e, x); }
  if (!normMap.size) return { allowed: arr, suppressed: [] };
  const r = await query(`SELECT email FROM email_suppressions WHERE email = ANY($1)`, [[...normMap.keys()]]);
  const supp = new Set(r.rows.map((x) => x.email));
  const allowed = [], suppressed = [];
  for (const [e, orig] of normMap) (supp.has(e) ? suppressed : allowed).push(orig);
  return { allowed, suppressed };
}

/** Add (or refresh) an address on the suppression list. */
export async function addSuppression(email, reason, detail, source) {
  const e = normalizeEmail(email);
  if (!e) return false;
  await query(
    `INSERT INTO email_suppressions (email, reason, detail, source)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE
       SET reason = EXCLUDED.reason, detail = EXCLUDED.detail,
           source = EXCLUDED.source, updated_at = now()`,
    [e, reason || 'manual', detail || null, source || null]);
  return true;
}

/** Remove an address from suppression (manual un-suppress). */
export async function removeSuppression(email) {
  const e = normalizeEmail(email);
  if (!e) return false;
  await query(`DELETE FROM email_suppressions WHERE email = $1`, [e]);
  return true;
}

/**
 * Downgrade every canonical contact carrying this address after a bounce /
 * complaint: clear is_verified and stamp email_status + freshness.
 * @returns { person, company } rows touched.
 */
export async function applyBounceToContacts(email, status) {
  const e = normalizeEmail(email);
  if (!e) return { person: 0, company: 0 };
  const st = status || 'bounced';
  const p = await query(
    `UPDATE person_contacts
        SET is_verified = false, email_status = $2, last_verified_at = now(), updated_at = now()
      WHERE type = 'email' AND value = $1`, [e, st]);
  const c = await query(
    `UPDATE company_contacts
        SET is_verified = false, email_status = $2, last_verified_at = now(), updated_at = now()
      WHERE type = 'email' AND value = $1`, [e, st]);
  return { person: p.rowCount || 0, company: c.rowCount || 0 };
}

/**
 * Full bounce handler: suppress + downgrade in one call.
 * @param email   the bounced/complained recipient
 * @param kind    'bounced' | 'complained'
 */
export async function handleBounce(email, kind, { detail = null, source = 'resend-webhook' } = {}) {
  const e = normalizeEmail(email);
  if (!e) return null;
  await addSuppression(e, kind, detail, source);
  const touched = await applyBounceToContacts(e, kind);
  return { email: e, kind, touched };
}
