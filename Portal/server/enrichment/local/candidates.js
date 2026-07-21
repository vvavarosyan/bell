// Website candidate review queue — list / decide / count.
// ----------------------------------------------------------------------------
// Search-found websites land here as 'pending'. The admin approves (sets the
// company's website so the harvester picks it up) or rejects (records the host
// in rejection memory so the Finder never re-proposes it).

import { query, withTransaction } from '../../db.js';
import { hostOf, fetchPage } from './http.js';
import { recomputeBellScoreForCompany } from '../../assembly/bell_score.js';
import { corroborates } from './finder.js';
import { resyncContactColumns } from '../../lib/contacts.js';

/** Pending candidates with their company, newest first. */
export async function listCandidates(status = 'pending', limit = 200) {
  const r = await query(`
    SELECT wc.id, wc.company_id, wc.candidate_url, wc.reason, wc.status,
           wc.created_at, wc.decided_at, wc.decided_by,
           c.name AS company_name, c.bin AS company_bin
    FROM website_candidates wc
    JOIN companies c ON c.id = wc.company_id
    WHERE ($1 = 'all' OR wc.status = $1)
    ORDER BY wc.created_at DESC, wc.id DESC
    LIMIT $2
  `, [status, limit]);
  return r.rows;
}

export async function countPending() {
  const r = await query(`SELECT count(*)::int AS n FROM website_candidates WHERE status = 'pending'`);
  return r.rows[0]?.n || 0;
}

/**
 * FREE bulk auto-approval of pending candidates — no Apify, no paid search.
 * The Finder already FOUND these URLs; here we re-fetch each (plain HTTP, $0) and
 * approve ONLY when the candidate host equals the company's own KNOWN email
 * domain — the single unimpeachable signal that the site IS theirs.
 *
 * History (2026-06-27): earlier versions also accepted a shared NAME word, then a
 * phone match; both produced thousands of WRONG sites (Vision Shipping→
 * visiondevelopments, Nexus→nexus.io, every "MOCI CR-… (name missing)"→
 * moci.gov.qa — the phone check matched the number inside digit-heavy pages).
 * Now it's email-domain ONLY here; phone matching was fixed in finder.js
 * (corroborates → bounded-number match + source-host denylist) for the Finder's
 * per-company use, but the bulk button deliberately won't gamble on it. Anything
 * not an email-domain match — name words, phone-only, dead, parked — stays
 * pending for HUMAN review.
 *
 * Designed to run as a BACKGROUND JOB: pass `jobLog` to stream live progress.
 * Approvals happen INLINE (as each strong match is confirmed) so progress is
 * real and an interrupted run still keeps everything it already approved.
 */
export async function autoApproveCandidates({ limit = 50000, dryRun = false, concurrency = 16, jobLog = null } = {}) {
  const rows = (await query(`
    SELECT wc.id, wc.company_id, wc.candidate_url,
           c.name, c.phone, c.email
      FROM website_candidates wc
      JOIN companies c ON c.id = wc.company_id
     WHERE wc.status = 'pending'
       AND (c.website IS NULL OR btrim(c.website) = '')
     ORDER BY wc.id
     LIMIT $1
  `, [limit])).rows;

  const stats = { total: rows.length, checked: 0, approved: 0, weak: 0, dead: 0 };
  jobLog?.(`Re-checking ${stats.total.toLocaleString()} pending candidate(s) over plain HTTP — free, no Apify. Concurrency ${concurrency}.`);
  if (!rows.length) { jobLog?.('Nothing pending to check.'); return { ...stats, dryRun: !!dryRun }; }

  let i = 0;
  const worker = async () => {
    while (i < rows.length) {
      const r = rows[i++];
      const company = { id: r.company_id, name: r.name, phone: r.phone, email: r.email };
      let verdict = 'dead';
      try {
        const page = await fetchPage(r.candidate_url, { respectRobots: false, timeoutMs: 7000, retries: 0 }).catch(() => null);
        if (page && page.ok) {
          // BULK AUTO-APPROVE IS MAXIMALLY CONSERVATIVE: approve ONLY when the
          // candidate host equals the company's own KNOWN email domain — the one
          // unimpeachable signal (the site literally IS their email domain). We do
          // NOT trust phone here on this fuzzy queue (phone matching, even fixed,
          // can coincide on digit-heavy pages). Everything else — name words,
          // phone-only, dead, parked — stays 'weak' for HUMAN review.
          verdict = corroborates(page, company) === 'email-domain' ? 'approve' : 'weak';
        }
      } catch { verdict = 'dead'; }

      stats.checked++;
      if (verdict === 'approve') {
        stats.approved++;
        // Reuse the audited single-approve path (sets website only if still
        // empty, resets stage7 so the harvester re-runs, recomputes Bell score).
        if (!dryRun) { try { await decideCandidate(r.id, 'approve', 'auto-approve'); } catch { /* race */ } }
        jobLog?.(`  ✓ ${r.name} → ${r.candidate_url}`);
      } else if (verdict === 'weak') stats.weak++;
      else stats.dead++;

      if (stats.checked % 50 === 0 || stats.checked === stats.total) {
        jobLog?.(`  …${stats.checked}/${stats.total} checked · ${stats.approved} approved · ${stats.weak} need review · ${stats.dead} dead`);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
  jobLog?.(`Done. Approved ${stats.approved} website(s) · ${stats.weak} left for review · ${stats.dead} dead/parked link(s).`);
  return { ...stats, dryRun: !!dryRun };
}

/**
 * REVERSE every website auto-approved by `decideCandidate(..., 'auto-approve')`.
 * The first auto-approve pass used too loose a rule (a single shared name word)
 * and set many WRONG websites. This undoes them: where a company's website is
 * still exactly the url we set, clear it + its provenance, reset stage7/stage8 so
 * it can be cleanly re-found, recompute its score, and return the candidate to
 * the pending review queue. Companies whose website was since changed/curated are
 * left untouched. Safe to run repeatedly. Pass jobLog for live progress.
 */
export async function undoAutoApprovals({ jobLog = null } = {}) {
  const rows = (await query(`
    SELECT id, company_id, candidate_url
      FROM website_candidates
     WHERE status = 'approved' AND decided_by = 'auto-approve'
     ORDER BY id
  `)).rows;

  jobLog?.(`Reversing ${rows.length.toLocaleString()} auto-approved website(s)…`);
  const stats = { total: rows.length, cleared: 0, kept: 0, contacts_removed: 0 };
  if (!rows.length) { jobLog?.('Nothing to reverse.'); return stats; }

  for (const r of rows) {
    // Only clear if the company's website is STILL the url we auto-set (don't
    // clobber a website the user/source has since corrected). Also wipe the
    // downstream stage markers so a correctly-found site re-enriches cleanly.
    const up = await query(`
      UPDATE companies
         SET website = NULL,
             stage7_status = NULL, stage7_at = NULL,
             stage8_status = NULL, stage8_at = NULL,
             stage9_at = NULL, stage10_at = NULL, stage11_at = NULL,
             extra_fields = (extra_fields - 'website_found' - 'stage7_found'
                             - 'stage7_pages' - 'stage7_scraped_at' - 'stage7_rendered'
                             - 'stage7_page_renders' - 'stage7_shell_unrendered')
       WHERE id = $1 AND website = $2
    `, [r.company_id, r.candidate_url]);
    if (up.rowCount) {
      stats.cleared++;
      // Delete the contacts harvested FROM the wrong site. These companies had no
      // website before the bad approve, so every 'stage7-website' contact came
      // from the wrong page — safe to remove.
      const dc = await query(
        `DELETE FROM company_contacts WHERE company_id = $1 AND source = 'stage7-website'`,
        [r.company_id],
      ).catch(() => ({ rowCount: 0 }));
      stats.contacts_removed += dc.rowCount || 0;
      // The legacy companies.email/phone columns are what outreach, CSV export, CRM
      // reveal and Bella's send read. A bulk DELETE bypasses deleteContact(), so
      // without this the column KEEPS the wrong-company address we just removed —
      // and the machine can cold-email a stranger under this company's name.
      if (dc.rowCount) await resyncContactColumns('company', r.company_id).catch(() => {});
      await recomputeBellScoreForCompany(r.company_id).catch(() => {});
    } else stats.kept++;
    // Return the candidate to the human review queue.
    await query(
      `UPDATE website_candidates SET status='pending', decided_at=NULL, decided_by=NULL WHERE id=$1`,
      [r.id],
    );
    const done = stats.cleared + stats.kept;
    if (done % 100 === 0 || done === rows.length) {
      jobLog?.(`  …${done}/${rows.length} processed · ${stats.cleared} websites cleared · ${stats.contacts_removed} bad contacts removed`);
    }
  }
  jobLog?.(`Done. Cleared ${stats.cleared.toLocaleString()} wrong website(s) + ${stats.contacts_removed.toLocaleString()} contacts harvested from them; ${stats.kept} already changed (left as-is); ${rows.length} candidates returned to review.`);
  return stats;
}

/**
 * Clean the residual PEOPLE harvested from the wrong sites. The website reversal
 * cleared the wrong company emails/phones, but people the harvester scraped from
 * those pages (decision-makers + guessed emails) survive. The harvester only ever
 * runs on companies that HAD a website, so a stage7-harvested role
 * (`person_companies.source_stage=7`) at a company that NOW has no website (+ that
 * went through the candidate flow) is residue from a reversed site.
 *
 * We delete those wrong role links; then any person left with NO roles that was
 * created by the harvester (`people.extra_fields.source='website-harvest'`) is an
 * orphan → delete it + its contacts (incl. guessed stage10 emails). People with
 * another role, or from a registry/LinkedIn origin, are KEPT (they only lose the
 * wrong link). Safe to run repeatedly. Pass jobLog for live progress.
 */
export async function cleanReversedHarvestPeople({ jobLog = null } = {}) {
  const WHERE = `
    pc.source_stage = 7
    AND (c.website IS NULL OR btrim(c.website) = '')
    AND EXISTS (SELECT 1 FROM website_candidates wc WHERE wc.company_id = c.id)
  `;

  const affected = (await query(
    `SELECT DISTINCT pc.person_id
       FROM person_companies pc JOIN companies c ON c.id = pc.company_id
      WHERE ${WHERE}`,
  )).rows.map(r => Number(r.person_id));

  jobLog?.(`Found ${affected.length.toLocaleString()} person(s) linked to reversed (website-less) companies by harvest.`);
  const stats = { affected_people: affected.length, roles_removed: 0, people_removed: 0, contacts_removed: 0 };
  if (!affected.length) { jobLog?.('Nothing to clean.'); return stats; }

  // 1) Drop the wrong harvested role links.
  const delRoles = await query(
    `DELETE FROM person_companies pc USING companies c
      WHERE pc.company_id = c.id AND ${WHERE}`,
  );
  stats.roles_removed = delRoles.rowCount || 0;
  jobLog?.(`Removed ${stats.roles_removed.toLocaleString()} harvested role link(s). Checking for orphaned people…`);

  // 2) Delete people now fully orphaned AND created by the harvester (+ contacts).
  let n = 0;
  for (const pid of affected) {
    const stillLinked = (await query(`SELECT 1 FROM person_companies WHERE person_id=$1 LIMIT 1`, [pid])).rows.length;
    if (stillLinked) continue;
    const harvested = (await query(
      `SELECT 1 FROM people WHERE id=$1 AND extra_fields->>'source'='website-harvest' LIMIT 1`, [pid],
    )).rows.length;
    if (!harvested) continue;
    const dc = await query(`DELETE FROM person_contacts WHERE person_id=$1`, [pid]).catch(() => ({ rowCount: 0 }));
    stats.contacts_removed += dc.rowCount || 0;
    await query(`DELETE FROM people WHERE id=$1`, [pid]).catch(() => {});
    stats.people_removed++;
    if (++n % 100 === 0) jobLog?.(`  …${n}/${affected.length} checked · ${stats.people_removed} orphaned people removed`);
  }

  jobLog?.(`Done. Removed ${stats.roles_removed.toLocaleString()} role link(s) · ${stats.people_removed.toLocaleString()} orphaned harvested people · ${stats.contacts_removed.toLocaleString()} person contact(s). People with other roles were kept.`);
  return stats;
}

/**
 * Decide a candidate.
 *   approve → set companies.website (only if still empty), reset stage7 so the
 *             harvester re-runs, mark approved.
 *   reject  → mark rejected + add the host to extra_fields.website_rejected so
 *             the Finder won't re-propose it.
 */
export async function decideCandidate(id, action, decidedBy = 'admin') {
  if (action !== 'approve' && action !== 'reject') throw new Error('action must be approve or reject');

  const row = (await query(`SELECT * FROM website_candidates WHERE id = $1`, [id])).rows[0];
  if (!row) throw new Error('candidate not found');
  if (row.status !== 'pending') return { id, status: row.status, noop: true };

  if (action === 'approve') {
    await withTransaction(async (client) => {
      await client.query(
        `UPDATE companies
            SET website = $2, stage7_status = NULL, stage7_at = NULL
          WHERE id = $1 AND (website IS NULL OR btrim(website) = '')`,
        [row.company_id, row.candidate_url]);
      await client.query(
        `UPDATE website_candidates SET status = 'approved', decided_at = now(), decided_by = $2 WHERE id = $1`,
        [id, decidedBy]);
    });
    await recomputeBellScoreForCompany(row.company_id);
    return { id, status: 'approved', company_id: row.company_id, website: row.candidate_url };
  }

  // reject
  const host = (hostOf(row.candidate_url) || '').toLowerCase();
  await withTransaction(async (client) => {
    await client.query(
      `UPDATE website_candidates SET status = 'rejected', decided_at = now(), decided_by = $2 WHERE id = $1`,
      [id, decidedBy]);
    if (host) {
      await client.query(
        `UPDATE companies
            SET extra_fields = jsonb_set(
              extra_fields, '{website_rejected}',
              coalesce(extra_fields->'website_rejected','[]'::jsonb) || to_jsonb($2::text), true)
          WHERE id = $1`,
        [row.company_id, host]);
    }
  });
  return { id, status: 'rejected', company_id: row.company_id };
}
