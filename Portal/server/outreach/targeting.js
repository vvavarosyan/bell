// Outreach targeting — WHO Bell may contact, and the honest exclusions.
//
// Source of company emails: company_contacts (type='email') — the ONLY source. Each address
// is classified (address_rules.js) and then filtered HARD against:
//   - the global suppression list (bounced / complained / previously unsubscribed),
//   - the outreach_consent ledger (anyone whose latest event is 'withdrawn'),
//   - bounced email_status on the contact row,
//   - inactive / archived companies.
// Rule 2.1: an address we cannot classify is NOT promoted to "safe". The default tier
// (role_mailbox) is the only one enabled without an explicit override.

import { query } from '../db.js';
import { classifyAddress } from './address_rules.js';

const norm = (e) => String(e || '').trim().toLowerCase();
const VALID_EMAIL_RX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Pull candidate (company, email) pairs. One row per (company, address).
// hasLinkedPerson: does a person_contacts row carry this exact address? (→ named_person tier).
//
// company_contacts is the SINGLE source. The legacy companies.email column used to be
// UNIONed in here, stamped `true` into the is_verified slot — asserting verification with
// zero evidence (Rule 2.1) and leaving email_status NULL so the bounced/complained
// exclusion below could never fire on it. Worse: 593 of those 732 legacy addresses are
// ones Bell had ALREADY REJECTED — 297 role mailboxes harvested from a website later
// judged to belong to a different company (Anya Aviation QFZ carried the London handbag
// brand's wholesale@ address). Deleting the contact row never cleared the legacy column,
// so the machine could cold-email a stranger under a Qatar company's name.
// Anything genuinely reachable is backfilled INTO company_contacts by
// `Preview/Apply Legacy Contact Repair.command`, where it faces the same quality gate as
// every other address. Do not re-add a second source here.
async function candidateRows({ limit = 100000 } = {}) {
  const r = await query(
    `WITH emails AS (
        SELECT c.id AS company_id, c.name AS company_name, c.industry, c.industries,
               c.city, c.website, lower(cc.value) AS email,
               cc.is_verified, cc.email_status
          FROM company_contacts cc
          JOIN companies c ON c.id = cc.company_id
         WHERE cc.type = 'email'
           AND c.is_active = true AND COALESCE(c.archived,false) = false
     )
     SELECT e.*,
            EXISTS (SELECT 1 FROM person_contacts pc
                     WHERE pc.type='email' AND lower(pc.value)=e.email) AS has_linked_person
       FROM emails e
      WHERE e.email ~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'
      LIMIT $1`,
    [limit]);
  return r.rows;
}

// Latest consent action per email (for the withdrawn exclusion). One round-trip.
async function withdrawnSet(emails) {
  if (!emails.length) return new Set();
  const r = await query(
    `SELECT lower(email) AS email FROM (
        SELECT DISTINCT ON (lower(email)) lower(email) AS email, action
          FROM outreach_consent
         WHERE lower(email) = ANY($1)
         ORDER BY lower(email), created_at DESC, id DESC
     ) t WHERE action = 'withdrawn'`,
    [emails]);
  return new Set(r.rows.map((x) => x.email));
}

async function suppressedSet(emails) {
  if (!emails.length) return new Set();
  const r = await query(`SELECT email FROM email_suppressions WHERE email = ANY($1)`, [emails]);
  return new Set(r.rows.map((x) => x.email));
}

// Already queued in THIS campaign? (so re-planning is idempotent and never double-queues).
async function alreadyQueued(campaignId, emails) {
  if (!campaignId || !emails.length) return new Set();
  const r = await query(
    `SELECT lower(email) AS email FROM outreach_targets WHERE campaign_id=$1 AND lower(email)=ANY($2)`,
    [campaignId, emails]);
  return new Set(r.rows.map((x) => x.email));
}

/**
 * Build the addressable set for a tier, with honest exclusion accounting.
 * Returns { targets:[{company_id,company_name,industry,industries,city,website,email,address_class,lang}],
 *           counts:{candidates,role_mailbox,named_person,unclassified,excluded_suppressed,
 *                   excluded_withdrawn,excluded_bounced,excluded_dupe,selected} }.
 * Nothing is sent here — this only decides WHO. lang defaults to campaign lang_mode.
 */
export async function buildTargets({ tier = 'role_mailbox', lang = 'en', campaignId = null, max = 100000 } = {}) {
  const rows = await candidateRows({ limit: max });
  const emails = [...new Set(rows.map((r) => norm(r.email)).filter((e) => VALID_EMAIL_RX.test(e)))];
  const [supp, withdrawn, queued] = await Promise.all([
    suppressedSet(emails), withdrawnSet(emails), alreadyQueued(campaignId, emails),
  ]);

  const counts = {
    candidates: rows.length, role_mailbox: 0, named_person: 0, unclassified: 0,
    excluded_suppressed: 0, excluded_withdrawn: 0, excluded_bounced: 0, excluded_dupe: 0, selected: 0,
  };
  const seen = new Set();     // de-dupe addresses within this build
  const targets = [];

  for (const row of rows) {
    const email = norm(row.email);
    if (!VALID_EMAIL_RX.test(email)) continue;
    const cls = classifyAddress({ email, hasLinkedPerson: row.has_linked_person });
    counts[cls.outcome] += 1;

    // Tier filter (unless 'all').
    if (tier !== 'all' && cls.outcome !== tier) continue;

    // Honest exclusions — order matters only for the counter attribution.
    if (supp.has(email)) { counts.excluded_suppressed += 1; continue; }
    if (withdrawn.has(email)) { counts.excluded_withdrawn += 1; continue; }
    if (String(row.email_status || '').toLowerCase() === 'bounced' ||
        String(row.email_status || '').toLowerCase() === 'complained') { counts.excluded_bounced += 1; continue; }
    if (queued.has(email) || seen.has(email)) { counts.excluded_dupe += 1; continue; }
    seen.add(email);

    targets.push({
      company_id: row.company_id, company_name: row.company_name,
      industry: row.industry, industries: row.industries, city: row.city, website: row.website,
      email, address_class: cls.outcome, lang,
    });
    counts.selected += 1;
  }
  return { targets, counts };
}

/** Cheap summary for the admin console: how much of the DB is each tier, and how much is sendable. */
export async function targetingSummary() {
  const { counts } = await buildTargets({ tier: 'all' });
  return counts;
}
