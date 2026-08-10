// Who does an email to this CRM record actually go to?
//
// ⚠️ THIS EXISTED THREE TIMES, DIFFERENTLY. The single-send route was fixed to read the contacts
// table first, because 44 companies had a perfectly good address in `company_contacts` while the
// legacy `companies.email` column was NULL and the send answered "no email on file". The BULK
// send and the SEQUENCE step were never fixed: both still read the legacy column and nothing else.
// So the same record could be mailable one way and "no recipient" another — and, worse, could be
// mailed at a DIFFERENT address depending on which button was pressed.
//
// The legacy column is the one from the [[legacy-contact-column]] incident: a bulk
// `DELETE FROM company_contacts` bypasses deleteContact(), so the column kept addresses Bell had
// deliberately removed as belonging to a different company. Outreach was rewritten to read
// company_contacts ONLY, and that rule stands for outreach.
//
// ── WHY THE CRM STILL FALLS BACK TO THE COLUMN, MEASURED 2026-08-10 ──────────────────────────
// 10,671 live companies carry a legacy email. 10,444 also have it in company_contacts (the column
// is just a mirror there, and the contacts row wins). 227 have ONLY the column — dropping the
// fallback would silently make those 227 unmailable from the CRM.
//
// Those 227 are not junk: 203 of them are stated VERBATIM in that company's own official source
// payload (QCCI 142, Tasmu 67, MOCI 51, QFZ 22). None matches the company's own website domain,
// which looks alarming until you notice what these companies are — QFZ/QFC subsidiaries of foreign
// groups, whose registered contact genuinely IS the parent's mailbox. `Forever Living Products QFZ
// LLC` → the brand's regional customer-service address is what the registry states. Bell is not
// inferring it; the registry says it.
//
// So: contacts first, always. The column only when there is no contact row at all. And the caller
// is TOLD which one it used, because "where did this address come from" is the question every
// wrong-recipient incident has started with.

import { query } from '../db.js';
import { isSendableAddress } from '../lib/email.js';

// ⚠️ AN ADDRESS ON FILE IS NOT NECESSARILY AN ADDRESS.
// Measured on the engine box 2026-08-10: of 19,449 company_contacts email rows, 220 are values a
// mail provider will reject outright, and 236 of the 12,343 legacy companies.email values are too.
// They are real stored data, not corruption — this is what Qatar company websites and registry
// forms actually contain:
//     "LILAC.FASHION @HOTMAIL ,COM"   "mmaa@ mmaa.gov.qa"      "amusaid@yahoo"
//     "albateel@qatar.net .qa"        "EMARAT BLOCK@HOTMAIL.COM"  "info@buildimgsga0com"
// Handed to Resend, every one is a 422, and routes/crm.js turned every failure into the same
// blank "Could not send the email." So the record LOOKED mailable, the send LOOKED like a
// mystery, and the actual cause — a broken value sitting in plain sight on the record — was never
// shown to the person who could fix it in five seconds.
//
// ⚠️ AND BELL MUST NOT REPAIR THEM. "LILAC.FASHION @HOTMAIL ,COM" obviously "means"
// lilac.fashion@hotmail.com. Writing that is a guess about a real person's mailbox, and Rule 2.1
// does not bend because the guess feels safe. Report the value verbatim; a human decides.
//
// isSendableAddress, NOT normalizeEmail: the latter lowercases and rewrites a value for STORAGE,
// which would silently change what Bell was handed. Here the only question is yes or no.

/** Split a resolved value into a usable address or a named bad one. Never rewrites it. */
function classify(value, source) {
  const v = String(value || '').trim();
  if (!v) return { to: null, source: null };
  if (isSendableAddress(v)) return { to: v, source };
  return { to: null, source, bad_address: v };
}

/**
 * Resolve the address for a CRM record.
 *
 * @param {object} rec  a crm_records row already joined to companies/people, carrying
 *                      entity_type, entity_id, and the legacy company_email / person_email.
 * @param {string} [override]  an address the caller supplied explicitly. Wins over everything —
 *                             a human typing an address is a statement, not a lookup.
 * @returns {Promise<{to:string|null, source:'override'|'contacts'|'legacy'|null}>}
 */
export async function resolveRecipient(rec, override = null) {
  const typed = String(override || '').trim();
  if (typed) return classify(typed, 'override');
  if (!rec) return { to: null, source: null };

  const isCompany = rec.entity_type === 'company';
  const table = isCompany ? 'company_contacts' : 'person_contacts';
  const column = isCompany ? 'company_id' : 'person_id';

  // Primary first, then verified, then oldest — the order the single-send route already used.
  // value_display preserves the address's own capitalisation for the header; `value` is the
  // normalized form. Both address the same mailbox.
  const best = await query(
    `SELECT COALESCE(value_display, value) AS v FROM ${table}
      WHERE ${column} = $1 AND type = 'email'
      ORDER BY is_primary DESC, is_verified DESC, created_at ASC LIMIT 1`,
    [rec.entity_id]).catch(() => ({ rows: [] }));
  // A broken contacts value does NOT fall through to the legacy column. The contacts table is the
  // record's stated address; silently reaching past it to a different one would mail somebody the
  // record does not name — the [[legacy-contact-column]] incident in a new costume.
  if (best.rows[0]?.v) return classify(best.rows[0].v, 'contacts');

  const legacy = String((isCompany ? rec.company_email : rec.person_email) || '').trim();
  if (legacy) return classify(legacy, 'legacy');

  return { to: null, source: null };
}

/**
 * The same thing for a batch of records, one round-trip per entity type instead of one per record.
 * A bulk send to 200 records was doing 200 sequential lookups; this does two.
 *
 * @param {Array<object>} recs
 * @returns {Promise<Map<number, {to:string|null, source:string|null}>>} keyed by record id
 */
export async function resolveRecipients(recs) {
  const out = new Map();
  const rows = Array.isArray(recs) ? recs : [];
  if (!rows.length) return out;

  const byType = { company: [], person: [] };
  for (const r of rows) if (byType[r.entity_type]) byType[r.entity_type].push(Number(r.entity_id));

  const best = { company: new Map(), person: new Map() };
  for (const [type, ids] of Object.entries(byType)) {
    if (!ids.length) continue;
    const table = type === 'company' ? 'company_contacts' : 'person_contacts';
    const column = type === 'company' ? 'company_id' : 'person_id';
    // DISTINCT ON gives the same winner per entity as the single-record ORDER BY above. Keeping
    // the two orderings identical is the point: one record must not be mailable at two addresses
    // depending on whether it was sent alone or in a batch.
    const r = await query(
      `SELECT DISTINCT ON (${column}) ${column} AS eid, COALESCE(value_display, value) AS v
         FROM ${table}
        WHERE ${column} = ANY($1::bigint[]) AND type = 'email'
        ORDER BY ${column}, is_primary DESC, is_verified DESC, created_at ASC`,
      [ids]).catch(() => ({ rows: [] }));
    for (const x of r.rows) best[type].set(Number(x.eid), String(x.v || '').trim());
  }

  for (const rec of rows) {
    const hit = best[rec.entity_type]?.get(Number(rec.entity_id));
    if (hit) { out.set(Number(rec.id), classify(hit, 'contacts')); continue; }
    const legacy = String((rec.entity_type === 'company' ? rec.company_email : rec.person_email) || '').trim();
    out.set(Number(rec.id), legacy ? classify(legacy, 'legacy') : { to: null, source: null });
  }
  return out;
}
