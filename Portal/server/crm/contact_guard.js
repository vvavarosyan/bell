// Has Bell already emailed this address — and should it email it again?
//
// Val, 2026-08-06, on Bella: "She finds and does everything perfectly. However she does not
// consider that those companies have been reached out to already… she needs to make sure the user
// is aware, and PREVENT sending too many emails without the user's knowledge."
//
// ⚠️ WHAT WAS ACTUALLY THERE BEFORE THIS FILE. Three paths can email a Qatar company's contact —
// the single send (routes/crm.js), the bulk send (same file), and a sequence step (crm/sequences.js)
// — and not one of them looked at what had already been sent. None of them consulted
// `email_suppressions` either, so an address that HARD BOUNCED and was globally suppressed for the
// outreach machine could still be mailed, repeatedly, from the CRM. lib/suppression.js says "the
// send path calls filterSuppressed() before every send"; that was true of the outreach machine and
// of nothing else.
//
// So this is one chokepoint, used by all three. The targeting.js lesson is the reason it is one
// module and not three copies: a guard that lives in one path is not a guard, it is a coincidence.
//
// ── WHAT COUNTS AS EVIDENCE ──────────────────────────────────────────────────────────────────
// Only a send that actually LEFT Bell counts as contact. A row still `queued`, or one that
// `failed` before the provider accepted it, is not an email the recipient received, and treating
// it as one would block real sends on Bell's own errors. Rule 2.1 cuts both ways: absence of
// proof that it arrived is not proof that it did — but a provider-accepted send IS stated.
//
// ── THE THREE RULES ──────────────────────────────────────────────────────────────────────────
//   1. `suppressed`  — the address is on the global do-not-send list (hard bounce, spam
//                      complaint, or an unsubscribe). NEVER overridable. This is not a judgement
//                      call: the mailbox rejected mail or its owner asked to stop.
//   2. `duplicate`   — the same subject already went to this address, from this tenant, inside
//                      24 hours, and was accepted. Not overridable, because it is not a decision
//                      to send again — it is the same email twice. This is the shape a retrying
//                      caller or a looping agent produces.
//   3. `recently_contacted` — the address has had RECENT_MAX or more accepted emails from this
//                      tenant inside RECENT_DAYS. OVERRIDABLE, and meant to be overridden: it
//                      exists so a human is told before the send, not to stop them.
//
// ⚠️ Rules 1 and 2 are facts. Rule 3 is a POLICY, and the two constants below are the whole of it.
// They are not derived from anything and Bell does not claim they are optimal — they are the line
// at which a person should be asked. Val can move them; nothing else needs to change.

import { query } from '../db.js';
import { normalizeEmail } from '../lib/contacts.js';

/** How many accepted emails inside RECENT_DAYS before a human has to be told. Policy, not fact. */
export const RECENT_MAX = 2;
/** The window rule 3 looks back over. Policy, not fact. */
export const RECENT_DAYS = 14;
/** How far back an identical subject counts as the same email sent twice. */
export const DUPLICATE_HOURS = 24;

// A send the provider accepted. 'queued' has not left Bell; 'failed' never did. 'bounced' and
// 'complained' DID arrive at the provider and came back — they count as contact AND they are why
// the address ends up suppressed.
const ACCEPTED = ['sent', 'delivered', 'opened', 'bounced', 'complained'];

/**
 * Everything Bell knows about mailing this address from this tenant.
 *
 * Addresses are compared case-folded and trimmed, which is all `normalizeEmail` promises. Bell
 * does NOT fold Gmail dots or +tags: those are provider-specific rules, and treating
 * `a.b@gmail.com` as `ab@gmail.com` would be an inference about a mailbox Bell has not been told
 * about. Two spellings, two addresses.
 *
 * @param {{tenantId:number, to:string, subject?:string}} args
 * @returns {Promise<{to:string|null, total:number, recent:number, last_sent_at:Date|null,
 *                    last_subject:string|null, duplicate_of:number|null,
 *                    suppressed:null|{reason:string, detail:string|null, since:Date}}>}
 */
export async function contactHistory({ tenantId, to, subject = null }) {
  const addr = normalizeEmail(to);
  const empty = {
    to: addr, total: 0, recent: 0, last_sent_at: null, last_subject: null,
    duplicate_of: null, suppressed: null,
  };
  if (!addr || !tenantId) return empty;

  // Suppression is GLOBAL on purpose (migration 061): a mailbox that does not exist does not
  // exist for tenant 2 either. It is read even when the tenant has never mailed the address.
  const supp = await query(
    `SELECT reason, detail, created_at FROM email_suppressions WHERE email = $1`, [addr]);

  const hist = await query(
    `SELECT count(*)::int                                                        AS total,
            count(*) FILTER (WHERE COALESCE(sent_at, created_at) > now() - ($3 || ' days')::interval)::int AS recent,
            max(COALESCE(sent_at, created_at))                                   AS last_sent_at,
            (array_agg(subject ORDER BY COALESCE(sent_at, created_at) DESC))[1]  AS last_subject
       FROM crm_emails
      WHERE tenant_id = $1
        AND direction = 'out'
        AND status = ANY($4)
        AND lower(btrim(to_email)) = $2`,
    [tenantId, addr, String(RECENT_DAYS), ACCEPTED]);
  const h = hist.rows[0] || {};

  // The identical-email check is deliberately exact on the subject, after trimming and folding
  // case. A near-identical body with a different subject line is a different email and a person
  // may well mean to send it; only the same subject to the same address inside a day is the
  // duplicate this rule is about.
  let duplicateOf = null;
  const subj = String(subject ?? '').trim();
  if (subj) {
    const dup = await query(
      `SELECT id FROM crm_emails
        WHERE tenant_id = $1 AND direction = 'out' AND status = ANY($5)
          AND lower(btrim(to_email)) = $2
          AND lower(btrim(COALESCE(subject,''))) = $3
          AND COALESCE(sent_at, created_at) > now() - ($4 || ' hours')::interval
        ORDER BY COALESCE(sent_at, created_at) DESC LIMIT 1`,
      [tenantId, addr, subj.toLowerCase(), String(DUPLICATE_HOURS), ACCEPTED]);
    duplicateOf = dup.rows[0] ? Number(dup.rows[0].id) : null;
  }

  return {
    to: addr,
    total: Number(h.total || 0),
    recent: Number(h.recent || 0),
    last_sent_at: h.last_sent_at || null,
    last_subject: h.last_subject || null,
    duplicate_of: duplicateOf,
    suppressed: supp.rows[0]
      ? { reason: supp.rows[0].reason, detail: supp.rows[0].detail || null, since: supp.rows[0].created_at }
      : null,
  };
}

/** Plain English for a person looking at a card or a toast. Never invents a number. */
export function describeHistory(h) {
  if (!h || !h.total) return null;
  const when = h.last_sent_at ? new Date(h.last_sent_at).toISOString().slice(0, 10) : null;
  const n = h.total === 1 ? '1 email' : `${h.total} emails`;
  return `${n} already sent to ${h.to}${when ? `, most recently ${when}` : ''}` +
         (h.last_subject ? ` ("${String(h.last_subject).slice(0, 60)}")` : '');
}

/**
 * Should this send go ahead?
 *
 * @param {object} a
 * @param {number} a.tenantId
 * @param {string} a.to                 the resolved recipient
 * @param {string} [a.subject]
 * @param {boolean} [a.acknowledged]    the sender has been TOLD about prior contact and said go.
 *                                      Only relaxes rule 3. Rules 1 and 2 ignore it entirely.
 * @returns {Promise<{ok:boolean, code?:string, reason?:string, history:object}>}
 */
export async function guardSend({ tenantId, to, subject = null, acknowledged = false }) {
  const history = await contactHistory({ tenantId, to, subject });

  if (history.suppressed) {
    const why = history.suppressed.reason === 'unsubscribe'
      ? 'asked to stop receiving email'
      : `bounced or reported mail as spam (${history.suppressed.reason})`;
    return {
      ok: false, code: 'address_suppressed', history,
      reason: `${history.to} ${why}, so Bell will not send to it. Nothing was sent. ` +
              'Remove it from the suppression list in admin → Marketing → Suppressions only if you know the address is good again.',
    };
  }

  if (history.duplicate_of) {
    return {
      ok: false, code: 'duplicate_email', history,
      reason: `This exact subject already went to ${history.to} within the last ${DUPLICATE_HOURS} hours ` +
              `(email #${history.duplicate_of}). Nothing was sent — it would have been the same message twice. ` +
              'Change the subject if this is genuinely a new message.',
    };
  }

  if (!acknowledged && history.recent >= RECENT_MAX) {
    return {
      ok: false, code: 'recently_contacted', history,
      reason: `${describeHistory(history)} — ${history.recent} of them in the last ${RECENT_DAYS} days. ` +
              'Nothing was sent. Say so to whoever asked for this, and send again only if they still want it.',
    };
  }

  return { ok: true, history };
}
