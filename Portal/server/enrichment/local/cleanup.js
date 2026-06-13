// Finder cleanup — audit + purge wrong / empty website finds.
// ----------------------------------------------------------------------------
// The Website Finder (Engine 1) historically saved some wrong sites: guessed
// domains that 301'd to registrars/parking (afternic, accenture…) or generic
// common-word domains that aren't the company. Engine 2 then harvested those,
// attaching wrong contacts/people. This module finds and reverses that.
//
// Two buckets, computed WITHOUT any network (pure re-validation of the stored
// domain against the current strict rules + whether the harvest produced
// anything):
//   • wrong  — the saved domain fails today's verifier (redirect-trap host, or
//              a non-distinctive guess). Almost certainly not the company.
//   • empty  — domain passes, but the harvest found nothing usable (no
//              stage7-website contacts, no harvested people). A real-but-useless
//              find; optional to purge.
//
// Purge is transactional per company: delete stage7-website contacts, remove
// website-harvested people (only those orphaned + sourced from the harvester),
// clear the website + harvested extra_fields, reset the stage flags so a future
// sweep redoes them, and recompute the Bell Score.

import { query, withTransaction } from '../../db.js';
import { hostOf } from './http.js';
import { significantTokens, distinctiveGuess, REDIRECT_TRAP_HOSTS } from './finder.js';
import { recomputeBellScoreForCompany } from '../../assembly/bell_score.js';

// Decide a company's bucket from stored fields only (no fetch).
function classify(co, hasContacts, hasPeople) {
  const host = hostOf(co.website) || '';
  if (!host) return 'wrong';
  if (REDIRECT_TRAP_HOSTS.test(host)) return 'wrong';

  const tokens = significantTokens(co.name);
  const domainSlug = host.split('.')[0] || '';
  // Search-method finds were verified by page content we can't re-check
  // statically; only flag them if the host is a trap (handled above).
  if (co.method === 'guess' && !distinctiveGuess(tokens, domainSlug)) return 'wrong';

  if (!hasContacts && !hasPeople) return 'empty';
  return 'ok';
}

/**
 * Audit every Finder-set website. Returns:
 *   { wrong:[{id,name,website,method,contacts,people}], empty:[…],
 *     totals:{ found, wrong, empty, ok, wrong_contacts, wrong_people, … } }
 * No network, no mutations.
 */
export async function auditFinderFinds() {
  const found = (await query(`
    SELECT id, name, website,
           extra_fields->'website_found'->>'method' AS method
    FROM companies
    WHERE extra_fields ? 'website_found'
      AND website IS NOT NULL AND btrim(website) <> ''
    ORDER BY id
  `)).rows;
  if (!found.length) return { wrong: [], empty: [], totals: { found: 0, wrong: 0, empty: 0, ok: 0 } };

  const ids = found.map(c => c.id);

  // Per-company harvested-artifact counts (one query each, aggregated).
  const contactCounts = new Map();
  for (const r of (await query(
    `SELECT company_id, count(*)::int AS n FROM company_contacts
      WHERE company_id = ANY($1) AND source = 'stage7-website' GROUP BY company_id`, [ids])).rows) {
    contactCounts.set(r.company_id, r.n);
  }
  const peopleCounts = new Map();
  for (const r of (await query(
    `SELECT pc.company_id, count(DISTINCT pc.person_id)::int AS n
       FROM person_companies pc
      WHERE pc.company_id = ANY($1) AND pc.source_stage = 7 GROUP BY pc.company_id`, [ids])).rows) {
    peopleCounts.set(r.company_id, r.n);
  }

  const wrong = [], empty = [];
  for (const co of found) {
    const c = contactCounts.get(co.id) || 0;
    const p = peopleCounts.get(co.id) || 0;
    const bucket = classify(co, c > 0, p > 0);
    if (bucket === 'wrong') wrong.push({ ...co, contacts: c, people: p });
    else if (bucket === 'empty') empty.push({ ...co, contacts: c, people: p });
  }

  const sum = (arr, k) => arr.reduce((a, x) => a + x[k], 0);
  return {
    wrong, empty,
    totals: {
      found: found.length,
      wrong: wrong.length,
      empty: empty.length,
      ok: found.length - wrong.length - empty.length,
      wrong_contacts: sum(wrong, 'contacts'), wrong_people: sum(wrong, 'people'),
      empty_contacts: sum(empty, 'contacts'), empty_people: sum(empty, 'people'),
    },
  };
}

const STRIP_KEYS = [
  'website_found', 'website_logo_url', 'website_description', 'harvested_partners',
  'stage7_scraped_at', 'stage7_pages', 'stage7_found', 'stage7_rendered',
  'stage7_error', 'stage7_skip_reason',
  'stage8_found', 'stage8_method', 'stage8_checked_at', 'stage8_skip_reason',
];

/** Purge one company's bad find + everything the harvester attached from it. */
async function purgeOne(companyId) {
  let removedContacts = 0, removedPeople = 0;
  await withTransaction(async (client) => {
    // Capture the wrong host so the Finder never re-saves it (rejection memory).
    const cur = await client.query(`SELECT website FROM companies WHERE id = $1`, [companyId]);
    const badHost = (hostOf(cur.rows[0]?.website) || '').toLowerCase();

    const dc = await client.query(
      `DELETE FROM company_contacts WHERE company_id = $1 AND source = 'stage7-website'`, [companyId]);
    removedContacts = dc.rowCount;

    // Remove the harvester's employment links, then delete people who were
    // created by the harvester AND are now orphaned (no other company links).
    const links = await client.query(
      `DELETE FROM person_companies WHERE company_id = $1 AND source_stage = 7 RETURNING person_id`, [companyId]);
    const personIds = [...new Set(links.rows.map(r => r.person_id))];
    if (personIds.length) {
      const dp = await client.query(
        `DELETE FROM people
          WHERE id = ANY($1)
            AND extra_fields->>'source' = 'website-harvest'
            AND NOT EXISTS (SELECT 1 FROM person_companies pc WHERE pc.person_id = people.id)`, [personIds]);
      removedPeople = dp.rowCount;
    }

    const stripExpr = STRIP_KEYS.map(k => `- ${quoteLit(k)}`).join(' ');
    await client.query(
      `UPDATE companies
          SET website = NULL,
              stage7_status = NULL, stage7_at = NULL,
              stage8_status = NULL, stage8_at = NULL,
              extra_fields = jsonb_set(
                extra_fields ${stripExpr},
                '{website_rejected}',
                CASE WHEN $2::text = '' THEN coalesce(extra_fields->'website_rejected','[]'::jsonb)
                     ELSE coalesce(extra_fields->'website_rejected','[]'::jsonb) || to_jsonb($2::text) END,
                true)
        WHERE id = $1`, [companyId, badHost]);
  });
  await recomputeBellScoreForCompany(companyId);
  return { removedContacts, removedPeople };
}

// jsonb `-` needs a string literal key; keys here are hard-coded + safe.
function quoteLit(k) { return `'${k.replace(/'/g, "''")}'`; }

/**
 * Purge the chosen buckets. `buckets` is a subset of ['wrong','empty'].
 * Recomputes membership server-side (never trusts a client id list).
 */
export async function cleanupFinderFinds(buckets = ['wrong'], jobLog = null) {
  const want = new Set(buckets);
  const audit = await auditFinderFinds();
  const targets = [
    ...(want.has('wrong') ? audit.wrong : []),
    ...(want.has('empty') ? audit.empty : []),
  ];
  jobLog?.(`▸ Finder cleanup — purging ${targets.length} site(s) [${[...want].join(', ')}]`);

  let companies = 0, contacts = 0, people = 0, failed = 0;
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i];
    try {
      const r = await purgeOne(t.id);
      companies++; contacts += r.removedContacts; people += r.removedPeople;
      jobLog?.(`  ✓ [${i + 1}/${targets.length}] ${t.name} — cleared ${t.website} (−${r.removedContacts}c/−${r.removedPeople}ppl)`);
    } catch (err) {
      failed++;
      jobLog?.(`  ✗ [${i + 1}/${targets.length}] ${t.name} — ${err.message}`);
    }
  }
  jobLog?.(`▸ Cleanup complete — ${companies} companies reset, ${contacts} contacts + ${people} people removed.`);
  return { companies, contacts, people, failed };
}
