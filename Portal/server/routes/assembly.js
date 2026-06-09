// /api/assembly — Phase 5 (dedup + identifier assignment) HTTP layer.
//
// Endpoints:
//   POST /api/assembly/run                 — run full assembly job
//   GET  /api/assembly/stats               — counts of canonical / merged /
//                                            standalone + pending review queue
//   GET  /api/assembly/dedup-queue?limit=  — pending pairs awaiting decision
//   POST /api/assembly/dedup/:id/decide    — admin merge/keep-separate

import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { jobs } from '../ingest/jobs.js';
import { runDedup, mergeCompanies } from '../assembly/dedup.js';
import { assignAllIdentifiers } from '../assembly/assign_ids.js';

const router = Router();

// ---------------------------------------------------------------------------
// POST /api/assembly/run — kicks off dedup + identifier assignment in the
// background. Returns a job id for live polling via /api/enrichment/jobs/:id
// (same job channel pattern as enrichment).
// ---------------------------------------------------------------------------
router.post('/run', async (req, res, next) => {
  try {
    const job = jobs.start({ kind: 'assembly', source: 'assembly-full-run' });
    res.json({ job_id: job.id, status: job.status });

    (async () => {
      try {
        jobs.log(job.id, `▸▸▸ Bell Assembly initiated`);
        const dedupResult  = await runDedup({ jobLog: (m) => jobs.log(job.id, m) });
        const idResult     = await assignAllIdentifiers((m) => jobs.log(job.id, m));
        jobs.log(job.id, `▸▸▸ Assembly complete.`);
        jobs.complete(job.id, { dedup: dedupResult, identifiers: idResult });
      } catch (err) {
        jobs.fail(job.id, err);
      }
    })();
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/assembly/stats
// ---------------------------------------------------------------------------
router.get('/stats', async (req, res, next) => {
  try {
    const r = await query(`
      SELECT
        (SELECT count(*)::int FROM companies WHERE merge_status = 'merged_into')     AS merged_companies,
        (SELECT count(*)::int FROM companies WHERE merge_status = 'canonical')        AS canonical_companies,
        (SELECT count(*)::int FROM companies WHERE merge_status = 'standalone')       AS standalone_companies,
        (SELECT count(*)::int FROM companies WHERE bin IS NOT NULL)                   AS companies_with_bin,
        (SELECT count(*)::int FROM people    WHERE pin IS NOT NULL)                   AS people_with_pin,
        (SELECT count(*)::int FROM jobs      WHERE jin IS NOT NULL)                   AS jobs_with_jin,
        (SELECT count(*)::int FROM dedup_candidates WHERE decision = 'pending')       AS pending_review,
        (SELECT count(*)::int FROM dedup_candidates WHERE decision = 'auto_merged')   AS auto_merged_count,
        (SELECT count(*)::int FROM dedup_candidates WHERE decision = 'kept_separate') AS kept_separate_count
    `);
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/assembly/dedup-queue?limit=&order=
// Returns pending candidate pairs with both companies' summary fields so the
// UI can render side-by-side comparisons without follow-up fetches.
// ---------------------------------------------------------------------------
router.get('/dedup-queue', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const r = await query(`
      SELECT
        dc.id, dc.similarity_score, dc.similarity_reasons, dc.created_at,
        json_build_object(
          'id', a.id, 'bin', a.bin, 'name', a.name, 'legal_name', a.legal_name,
          'website', a.website, 'linkedin_url', a.linkedin_url,
          'primary_registration_no', a.primary_registration_no,
          'industry', a.industry, 'city', a.city,
          'employee_count', a.employee_count,
          'sources', (SELECT array_agg(DISTINCT cs.source ORDER BY cs.source)
                      FROM company_sources cs WHERE cs.company_id = a.id)
        ) AS company_a,
        json_build_object(
          'id', b.id, 'bin', b.bin, 'name', b.name, 'legal_name', b.legal_name,
          'website', b.website, 'linkedin_url', b.linkedin_url,
          'primary_registration_no', b.primary_registration_no,
          'industry', b.industry, 'city', b.city,
          'employee_count', b.employee_count,
          'sources', (SELECT array_agg(DISTINCT cs.source ORDER BY cs.source)
                      FROM company_sources cs WHERE cs.company_id = b.id)
        ) AS company_b
      FROM dedup_candidates dc
      JOIN companies a ON a.id = dc.company_a_id
      JOIN companies b ON b.id = dc.company_b_id
      WHERE dc.decision = 'pending'
      ORDER BY dc.similarity_score DESC, dc.id
      LIMIT $1
    `, [limit]);
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/assembly/dedup/:id/decide
// body: { action: 'merge_a_to_b' | 'merge_b_to_a' | 'keep_separate',
//         admin_email?: string }
// ---------------------------------------------------------------------------
router.post('/dedup/:id/decide', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const { action, admin_email } = req.body || {};
    if (!['merge_a_to_b', 'merge_b_to_a', 'keep_separate'].includes(action)) {
      return res.status(400).json({ error: 'invalid_action' });
    }
    const r = await query(`SELECT * FROM dedup_candidates WHERE id = $1`, [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    const cand = r.rows[0];
    if (cand.decision !== 'pending') {
      return res.status(409).json({ error: 'already_decided', decision: cand.decision });
    }

    if (action === 'keep_separate') {
      await query(`
        UPDATE dedup_candidates
        SET decision = 'kept_separate', decided_at = now(), decided_by = $2
        WHERE id = $1
      `, [id, admin_email || 'unknown']);
      return res.json({ ok: true, decision: 'kept_separate' });
    }

    // Merge — A→B means B is canonical, A is duplicate
    const canonical = action === 'merge_a_to_b' ? cand.company_b_id : cand.company_a_id;
    const duplicate = action === 'merge_a_to_b' ? cand.company_a_id : cand.company_b_id;
    await mergeCompanies(canonical, duplicate);
    await query(`
      UPDATE dedup_candidates
      SET decision = $2, decided_at = now(), decided_by = $3
      WHERE id = $1
    `, [id, action, admin_email || 'unknown']);

    res.json({ ok: true, canonical, duplicate, decision: action });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// GET /api/assembly/audit — read-only integrity + quality audit of the merge.
// Answers "is the dedup 100% correct?" with hard checks (must be zero) plus
// review lists (under-/over-merge candidates) and coverage wins. Heavy-ish
// (full scans); intended for on-demand admin use, not hot paths.
// ---------------------------------------------------------------------------
router.get('/audit', async (req, res, next) => {
  try {
    const SAMPLE = Math.min(Number(req.query.sample ?? 25), 100);

    // --- 1. INTEGRITY — every one of these MUST be zero. -------------------
    // A "live" company = canonical or standalone and not archived. A merged
    // duplicate must: have a canonical, be archived, point at a FINAL canonical
    // (not another duplicate), and have ALL its sources + contacts re-parented
    // to the canonical (so no source tag or number is stranded on a dead row).
    const integrity = (await query(`
      SELECT
        (SELECT count(*)::int FROM companies
          WHERE merge_status='merged_into' AND canonical_id IS NULL)               AS merged_without_canonical,
        (SELECT count(*)::int FROM companies d
          WHERE d.merge_status='merged_into'
            AND EXISTS (SELECT 1 FROM companies p
                         WHERE p.id=d.canonical_id AND p.merge_status='merged_into')) AS unflattened_chains,
        (SELECT count(*)::int FROM companies
          WHERE merge_status IN ('canonical','standalone') AND canonical_id IS NOT NULL) AS nonmerged_with_canonical,
        (SELECT count(*)::int FROM companies
          WHERE merge_status='merged_into' AND archived=false)                     AS merged_not_archived,
        (SELECT count(*)::int FROM company_sources cs
           JOIN companies c ON c.id=cs.company_id
          WHERE c.merge_status='merged_into')                                      AS sources_stranded_on_merged,
        (SELECT count(*)::int FROM company_contacts cc
           JOIN companies c ON c.id=cc.company_id
          WHERE c.merge_status='merged_into')                                      AS contacts_stranded_on_merged
    `)).rows[0];

    // --- 2. COVERAGE — the merge win + totals. ----------------------------
    const coverage = (await query(`
      WITH live AS (
        SELECT id FROM companies
         WHERE merge_status IN ('canonical','standalone') AND archived=false
      ),
      src AS (
        SELECT cs.company_id, count(DISTINCT cs.source) AS nsrc
          FROM company_sources cs JOIN live l ON l.id=cs.company_id
         GROUP BY cs.company_id
      )
      SELECT
        (SELECT count(*)::int FROM live)                                       AS live_companies,
        (SELECT count(*)::int FROM companies WHERE merge_status='canonical')   AS canonical,
        (SELECT count(*)::int FROM companies WHERE merge_status='merged_into') AS merged_away,
        (SELECT count(*)::int FROM companies WHERE merge_status='standalone')  AS standalone,
        (SELECT count(*)::int FROM src WHERE nsrc>=2)                          AS multi_source_companies,
        (SELECT count(*)::int FROM src WHERE nsrc>=3)                          AS three_plus_source_companies
    `)).rows[0];

    const perSource = (await query(`
      SELECT cs.source, count(DISTINCT cs.company_id)::int AS companies
        FROM company_sources cs JOIN companies c ON c.id=cs.company_id
       WHERE c.merge_status IN ('canonical','standalone') AND c.archived=false
       GROUP BY cs.source ORDER BY companies DESC
    `)).rows;

    // --- 3. UNDER-MERGE — duplicates that probably should have merged. -----
    // Same normalized name across ≥2 distinct LIVE companies. Normalization
    // strips spaces + punctuation only (NOT letters) so it's script-agnostic —
    // keeping Arabic intact — and we exclude digit-only keys, so two unrelated
    // Arabic names that share only a number ("…2000…") don't false-group.
    const dupNames = (await query(`
      WITH live AS (
        SELECT id, name,
               lower(regexp_replace(coalesce(name,''),'[[:space:][:punct:]]+','','g')) AS nn
          FROM companies
         WHERE merge_status IN ('canonical','standalone') AND archived=false
      ),
      grp AS (
        SELECT nn, count(*)::int AS c,
               (array_agg(name ORDER BY name))[1:6] AS names,
               (array_agg(id   ORDER BY name))[1:6] AS ids
          FROM live WHERE length(nn) >= 4 AND nn ~ '[^0-9]'
         GROUP BY nn HAVING count(*) > 1
      )
      SELECT
        (SELECT count(*)::int FROM grp)                          AS group_count,
        (SELECT coalesce(sum(c-1),0)::int FROM grp)              AS redundant_rows,
        (SELECT json_agg(g) FROM (SELECT * FROM grp ORDER BY c DESC LIMIT ${SAMPLE}) g) AS samples
    `)).rows[0];

    // Same normalized registration number — but ONLY within the SAME source.
    // Different registries (MOCI CR "270/7" vs a QCCI id "2707") use overlapping
    // number spaces, so comparing reg across sources produces pure coincidences.
    // The engine deliberately doesn't merge those, so we don't flag them either:
    // a same-source reg collision is the only one that signals a true missed dup.
    // Normalization MUST match the engine's normalizeRegistration: lowercase +
    // whitespace-collapse, and strip leading zeros ONLY for purely-numeric IDs.
    // Critically it does NOT strip internal punctuation — MOCI's "10235/2" (CR
    // 10235, branch 2) must stay distinct from the unrelated "102352". (Earlier
    // the audit stripped the "/", manufacturing false collisions.)
    const dupRegs = (await query(`
      WITH reg0 AS (
        SELECT c.id, c.name, cs.source, c.primary_registration_no AS reg,
               regexp_replace(lower(trim(c.primary_registration_no)), '[[:space:]]+', ' ', 'g') AS v
          FROM companies c
          JOIN company_sources cs ON cs.company_id = c.id
         WHERE c.merge_status IN ('canonical','standalone') AND c.archived=false
           AND c.primary_registration_no IS NOT NULL
      ),
      reg AS (
        SELECT id, name, source, reg,
               CASE WHEN v ~ '^[0-9]+$' THEN regexp_replace(v, '^0+', '') ELSE v END AS rn
          FROM reg0
      ),
      grp AS (
        SELECT source, rn, count(DISTINCT id)::int AS c,
               (array_agg(DISTINCT name))[1:6] AS names,
               (array_agg(DISTINCT reg))[1:6]  AS regs
          FROM reg WHERE length(rn) >= 4
         GROUP BY source, rn HAVING count(DISTINCT id) > 1
      )
      SELECT
        (SELECT count(*)::int FROM grp) AS group_count,
        (SELECT json_agg(g) FROM (
           SELECT source, c, names, regs FROM grp ORDER BY c DESC LIMIT ${SAMPLE}) g) AS samples
    `)).rows[0];

    // --- 4. OVER-MERGE — canonicals that may have fused distinct companies. -
    // A canonical holding ≥2 source records from the SAME source (e.g. two MOCI
    // CRs) likely fused two real companies. Review-worthy (could be branches).
    const sameSourceMulti = (await query(`
      WITH multi AS (
        SELECT cs.company_id, cs.source, count(*)::int AS records
          FROM company_sources cs JOIN companies c ON c.id=cs.company_id
         WHERE c.merge_status='canonical'
         GROUP BY cs.company_id, cs.source HAVING count(*) > 1
      )
      SELECT
        (SELECT count(DISTINCT company_id)::int FROM multi) AS canonical_count,
        (SELECT json_agg(s) FROM (
           SELECT m.company_id AS id, c.name, m.source, m.records
             FROM multi m JOIN companies c ON c.id=m.company_id
            ORDER BY m.records DESC LIMIT ${SAMPLE}) s) AS samples
    `)).rows[0];

    // Largest merge clusters — eyeball for a generic name that swallowed too much.
    const biggestClusters = (await query(`
      SELECT d.canonical_id AS id, c.name,
             count(*)::int AS merged_members,
             (SELECT array_agg(DISTINCT s.source ORDER BY s.source)
                FROM company_sources s WHERE s.company_id=d.canonical_id) AS sources
        FROM companies d JOIN companies c ON c.id=d.canonical_id
       WHERE d.merge_status='merged_into' AND d.canonical_id IS NOT NULL
       GROUP BY d.canonical_id, c.name
       ORDER BY merged_members DESC LIMIT ${SAMPLE}
    `)).rows;

    // --- 5. SPOT CHECK — Ezdan (Val's worked example). --------------------
    const spotEzdan = (await query(`
      SELECT c.id, c.name, c.merge_status, c.canonical_id,
             (SELECT array_agg(DISTINCT s.source ORDER BY s.source)
                FROM company_sources s WHERE s.company_id=c.id) AS sources
        FROM companies c
       WHERE c.name ILIKE '%ezdan%'
       ORDER BY c.merge_status, c.name LIMIT 40
    `)).rows;

    res.json({
      generated_at: new Date().toISOString(),
      integrity, coverage, per_source: perSource,
      under_merge: { duplicate_names: dupNames, duplicate_registrations: dupRegs },
      over_merge:  { same_source_multiplicity: sameSourceMulti, biggest_clusters: biggestClusters },
      spot_check:  { ezdan: spotEzdan },
    });
  } catch (err) { next(err); }
});

// ---------------------------------------------------------------------------
// POST /api/assembly/assign-ids — manual: just run the identifier assignment
// without dedup. Useful after a manual data import.
// ---------------------------------------------------------------------------
router.post('/assign-ids', async (req, res, next) => {
  try {
    const result = await assignAllIdentifiers();
    res.json(result);
  } catch (err) { next(err); }
});

export default router;
