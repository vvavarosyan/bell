// /api/enrichment — start enrichment jobs, list/poll, list stages.

import { Router } from 'express';
import { query } from '../db.js';
import { jobs } from '../ingest/jobs.js';
import {
  runStageForCompanies,
  runFullEnrichment,
  runHarvestSweep,
  runLocalEnginesForCompanies,
  stageList,
} from '../enrichment/orchestrator.js';
import { auditFinderFinds, cleanupFinderFinds } from '../enrichment/local/cleanup.js';
import { listCandidates, countPending, decideCandidate, autoApproveCandidates, undoAutoApprovals, cleanReversedHarvestPeople } from '../enrichment/local/candidates.js';
import { createLookup, runLookup, listLookups, approveLookup, enrichMatchLookup, rejectLookup } from '../enrichment/local/manual_lookup.js';
import { crawl4aiAvailable } from '../enrichment/local/crawl4ai.js';

const router = Router();

// GET /api/enrichment/stages — for the UI
router.get('/stages', (req, res) => {
  res.json({ stages: stageList() });
});

// GET /api/enrichment/runs — recent audit rows
router.get('/runs', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 25), 200);
    const r = await query(`
      SELECT id, stage, tool, target_kind, array_length(target_ids, 1) AS target_count,
             status, progress_done, progress_total,
             started_at, completed_at,
             usd_used, output_summary, error_message
      FROM enrichment_runs
      ORDER BY started_at DESC NULLS LAST, id DESC
      LIMIT $1
    `, [limit]);
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});

// GET /api/enrichment/engine-status — full status of the always-on Continuous
// Engine: heartbeat, pause/pacing control, and the LIVE frontier (computed fresh
// so the dashboard is accurate even when the engine is paused or idle).
router.get('/engine-status', async (req, res) => {
  try {
    const [hb, ctl, fr] = await Promise.all([
      query(`SELECT * FROM engine_heartbeat WHERE id = 1`),
      query(`SELECT paused, night_chunk, day_chunk FROM engine_control WHERE id = 1`).catch(() => ({ rows: [] })),
      query(`SELECT
          (SELECT count(*) FROM companies WHERE COALESCE(archived,false)=false AND is_active IS NOT false AND (website IS NULL OR btrim(website)='') AND stage8_at IS NULL)::int AS find_left,
          (SELECT count(*) FROM companies WHERE COALESCE(archived,false)=false AND is_active IS NOT false AND website IS NOT NULL AND btrim(website)<>'' AND stage7_at IS NULL)::int AS harvest_left,
          (SELECT count(*) FROM companies WHERE COALESCE(archived,false)=false AND is_active IS NOT false AND website IS NOT NULL AND btrim(website)<>'' AND stage9_at IS NULL)::int AS map_left,
          (SELECT count(*) FROM companies WHERE COALESCE(archived,false)=false AND is_active IS NOT false AND website IS NOT NULL AND btrim(website)<>'' AND stage7_at IS NOT NULL AND stage10_at IS NULL)::int AS email_left,
          (SELECT count(*) FROM companies WHERE COALESCE(archived,false)=false AND is_active IS NOT false AND website IS NOT NULL AND btrim(website)<>'' AND stage7_at IS NOT NULL AND stage11_at IS NULL)::int AS facts_left,
          (SELECT count(*) FROM companies WHERE COALESCE(archived,false)=false AND is_active IS NOT false)::int AS total,
          (SELECT count(*) FROM companies WHERE COALESCE(archived,false)=false AND is_active IS NOT false AND website IS NOT NULL AND btrim(website)<>'')::int AS with_website
        `).catch(() => ({ rows: [{}] })),
    ]);
    const h = hb.rows[0] || null;
    const c = ctl.rows[0] || {};
    const beatAgeMs = h?.updated_at ? Date.now() - new Date(h.updated_at).getTime() : null;
    const alive = beatAgeMs != null && beatAgeMs < 3 * 60 * 1000;
    const state = c.paused ? 'paused' : (alive ? (h?.state || 'sweeping') : (h ? 'stopped' : 'off'));
    let c4up = false; try { c4up = await crawl4aiAvailable(); } catch { /* optional engine */ }
    res.json({
      installed: !!h, alive, paused: !!c.paused, state,
      heartbeat: h, beat_age_ms: beatAgeMs,
      control: { paused: !!c.paused, night_chunk: c.night_chunk ?? null, day_chunk: c.day_chunk ?? null },
      frontier: fr.rows[0] || {},
      crawl4ai: { up: c4up },
    });
  } catch {
    res.json({ installed: false, alive: false, paused: false, state: 'off', heartbeat: null, frontier: {}, control: {}, crawl4ai: { up: false } });
  }
});

// POST /api/enrichment/engine/control — pause/resume + pacing. Body: { paused?, night_chunk?, day_chunk? }.
router.post('/engine/control', async (req, res, next) => {
  try {
    const b = req.body || {};
    const sets = [], vals = [];
    if (typeof b.paused === 'boolean') { vals.push(b.paused); sets.push(`paused = $${vals.length}`); }
    if (b.night_chunk != null && b.night_chunk !== '') { vals.push(Math.max(1, Math.min(2000, Math.floor(Number(b.night_chunk)) || 1))); sets.push(`night_chunk = $${vals.length}`); }
    if (b.day_chunk != null && b.day_chunk !== '') { vals.push(Math.max(1, Math.min(2000, Math.floor(Number(b.day_chunk)) || 1))); sets.push(`day_chunk = $${vals.length}`); }
    await query(`INSERT INTO engine_control (id) VALUES (1) ON CONFLICT (id) DO NOTHING`);
    if (sets.length) {
      vals.push(req.user?.email || 'admin');
      await query(`UPDATE engine_control SET ${sets.join(', ')}, updated_at = now(), updated_by = $${vals.length} WHERE id = 1`, vals);
    }
    const r = await query(`SELECT paused, night_chunk, day_chunk FROM engine_control WHERE id = 1`);
    res.json({ ok: true, control: r.rows[0] });
  } catch (err) { next(err); }
});

// POST /api/enrichment/engine/rescan — re-queue companies for the engines by
// clearing their stage flags. Body: { scope: 'all'|'find'|'harvest'|'map' }.
// Idempotent; never deletes data — the engines simply process them again.
router.post('/engine/rescan', async (req, res, next) => {
  try {
    const scope = String(req.body?.scope || 'all');
    const active = `COALESCE(archived,false)=false AND is_active IS NOT false`;
    const hasSite = `website IS NOT NULL AND btrim(website)<>''`;
    let sql, label;
    if (scope === 'find')         { sql = `UPDATE companies SET stage8_at=NULL WHERE ${active}`; label = 'website finding'; }
    else if (scope === 'harvest') { sql = `UPDATE companies SET stage7_at=NULL WHERE ${active} AND ${hasSite}`; label = 'harvesting'; }
    else if (scope === 'map')     { sql = `UPDATE companies SET stage9_at=NULL WHERE ${active} AND ${hasSite}`; label = 'network mapping'; }
    else if (scope === 'email')   { sql = `UPDATE companies SET stage10_at=NULL WHERE ${active} AND ${hasSite}`; label = 'email finding'; }
    else if (scope === 'facts')   { sql = `UPDATE companies SET stage11_at=NULL WHERE ${active} AND ${hasSite}`; label = 'company facts'; }
    else                          { sql = `UPDATE companies SET stage7_at=NULL, stage8_at=NULL, stage9_at=NULL, stage10_at=NULL, stage11_at=NULL WHERE ${active}`; label = 'all engines'; }
    const r = await query(sql);
    res.json({ ok: true, scope, reset: r.rowCount || 0, label });
  } catch (err) { next(err); }
});

// GET /api/enrichment/results — engine output + data-quality summary, for tuning.
// The decisive number is person_emails.pattern_verified: if it's 0 while emails
// exist, the network is blocking SMTP and Engine 4 is only matching published
// addresses (→ add a verification API).
router.get('/results', async (req, res) => {
  const active = `COALESCE(archived,false)=false AND is_active IS NOT false`;
  const site = `website IS NOT NULL AND btrim(website)<>''`;
  try {
    const [web, harv, pem, cem, fin, sh, rejN, rejBy] = await Promise.all([
      query(`SELECT
        count(*) FILTER (WHERE ${active})::int AS active_total,
        count(*) FILTER (WHERE ${active} AND ${site})::int AS with_website,
        count(*) FILTER (WHERE ${active} AND stage8_at IS NOT NULL AND extra_fields->'website_found'->>'method'='guess')::int AS found_guess,
        count(*) FILTER (WHERE ${active} AND stage8_at IS NOT NULL AND (extra_fields->'website_found'->>'method' LIKE 'search%' OR extra_fields->'website_found'->>'method' LIKE 'maps%'))::int AS found_search
        FROM companies`),
      query(`SELECT count(*) FILTER (WHERE ${active} AND stage7_at IS NOT NULL)::int AS harvested FROM companies`),
      query(`SELECT
        count(*) FILTER (WHERE source='stage10-observed')::int AS observed,
        count(*) FILTER (WHERE source='stage10-pattern')::int AS pattern_verified,
        count(*)::int AS total
        FROM person_contacts WHERE type='email'`),
      query(`SELECT count(DISTINCT company_id)::int AS companies, count(*)::int AS total FROM company_contacts WHERE type='email'`),
      query(`SELECT count(*)::int AS cnt, count(DISTINCT company_id)::int AS companies FROM company_financials WHERE source LIKE 'website%'`).catch(() => ({ rows: [{}] })),
      query(`SELECT count(*)::int AS cnt FROM company_shareholders WHERE source LIKE 'website%'`).catch(() => ({ rows: [{}] })),
      query(`SELECT count(*)::int AS total FROM enrichment_rejects`).catch(() => ({ rows: [{ total: 0 }] })),
      query(`SELECT reason, count(*)::int AS n FROM enrichment_rejects GROUP BY reason ORDER BY n DESC LIMIT 8`).catch(() => ({ rows: [] })),
    ]);
    res.json({
      websites: web.rows[0] || {},
      harvest: harv.rows[0] || {},
      person_emails: pem.rows[0] || {},
      company_emails: cem.rows[0] || {},
      facts: { financials: fin.rows[0]?.cnt || 0, companies: fin.rows[0]?.companies || 0, shareholders: sh.rows[0]?.cnt || 0 },
      rejects: { total: rejN.rows[0]?.total || 0, by_reason: rejBy.rows || [] },
    });
  } catch (err) {
    res.json({ error: String((err && err.message) || 'results_failed') });
  }
});

/**
 * POST /api/enrichment/run
 * Body: { mode: 'stage'|'full', stage?, company_ids: [...] }
 * Starts the job in the background and returns a job_id you can poll.
 */
router.post('/run', async (req, res, next) => {
  try {
    const { mode, stage, company_ids } = req.body || {};
    if (!Array.isArray(company_ids) || company_ids.length === 0) {
      return res.status(400).json({ error: 'company_ids required' });
    }
    const ids = company_ids.map(Number).filter(Number.isFinite);
    if (ids.length === 0) return res.status(400).json({ error: 'no valid company ids' });

    const admin = (await query(`SELECT value FROM settings WHERE key='admin_email'`)).rows[0]?.value || 'admin@local';

    if (mode === 'full') {
      const job = jobs.start({ kind: 'enrichment', source: 'full' });
      res.json({ job_id: job.id, status: job.status });
      (async () => {
        try {
          const result = await runFullEnrichment({
            companyIds: ids,
            triggeredBy: admin,
            jobLog: (m) => jobs.log(job.id, m),
          });
          jobs.complete(job.id, result);
        } catch (err) {
          jobs.fail(job.id, err);
        }
      })();
      return;
    }

    if (mode === 'local') {
      // Run all three local engines (Finder → Harvester → Mapper) on exactly
      // the selected companies, in order. Local-only; $0.
      const job = jobs.start({ kind: 'enrichment', source: 'local_engines' });
      res.json({ job_id: job.id, status: job.status });
      (async () => {
        try {
          const result = await runLocalEnginesForCompanies({
            companyIds: ids,
            triggeredBy: admin,
            jobLog: (m) => jobs.log(job.id, m),
          });
          jobs.complete(job.id, result);
        } catch (err) {
          jobs.fail(job.id, err);
        }
      })();
      return;
    }

    if (mode === 'stage') {
      const n = Number(stage);
      // Stages 1-6 are wired and runnable independently. The Full Enrichment
      // path layers dependency gates between them, but a SINGLE-stage run has
      // no inter-stage prereqs — each stage handles its own input checks
      // (Stage 6 silently skips companies without a website, etc.).
      if (![1, 2, 3, 4, 5, 6, 7, 8, 9].includes(n)) return res.status(400).json({ error: 'stage must be 1-9' });
      const job = jobs.start({ kind: 'enrichment', source: 'stage' + n });
      res.json({ job_id: job.id, status: job.status });
      (async () => {
        try {
          const result = await runStageForCompanies({
            stage: n,
            companyIds: ids,
            triggeredBy: admin,
            jobLog: (m) => jobs.log(job.id, m),
          });
          jobs.complete(job.id, result);
        } catch (err) {
          jobs.fail(job.id, err);
        }
      })();
      return;
    }

    return res.status(400).json({ error: 'mode must be "stage", "full", or "local"' });
  } catch (err) { next(err); }
});

/**
 * POST /api/enrichment/sweep
 * Body: { limit?: number }
 * Selects the most-incomplete active companies server-side and runs the local
 * Harvest Sweep (Stage 8 Website Finder → Stage 7 Website Harvester) in the
 * background. Returns a job_id to poll like any enrichment run.
 */
router.post('/sweep', async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(Number(req.body?.limit) || 100, 2000));
    const admin = (await query(`SELECT value FROM settings WHERE key='admin_email'`)).rows[0]?.value || 'admin@local';
    const job = jobs.start({ kind: 'enrichment', source: 'harvest_sweep' });
    res.json({ job_id: job.id, status: job.status });
    (async () => {
      try {
        const result = await runHarvestSweep({ limit, triggeredBy: admin, jobLog: (m) => jobs.log(job.id, m) });
        jobs.complete(job.id, result);
      } catch (err) {
        jobs.fail(job.id, err);
      }
    })();
  } catch (err) { next(err); }
});

// GET /api/enrichment/harvest-history?limit= — past local-engine runs, newest
// first, with the structured result so the UI can render summary cards. Covers
// the automatic Harvest Sweep, the manual "Engines 1–3 on selected" run, and
// individual engine stages. Reads persisted job_runs (survives restarts).
router.get('/harvest-history', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const r = await query(`
      SELECT id, source, status, started_at, completed_at, total_messages, result, error, triggered_by
        FROM job_runs
       WHERE kind = 'enrichment'
         AND source IN ('harvest_sweep','local_engines','stage7','stage8','stage9','manual_lookup')
       ORDER BY started_at DESC NULLS LAST
       LIMIT $1
    `, [limit]);
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});

// --- Manual Company Lookup (type a name → engines find everything → approve) --
// POST /api/enrichment/manual-lookup { name } — starts a background lookup.
router.post('/manual-lookup', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (name.length < 2) return res.status(400).json({ error: 'name required' });
    const admin = (await query(`SELECT value FROM settings WHERE key='admin_email'`)).rows[0]?.value || 'admin@local';
    const lookupId = await createLookup(name, admin);
    const job = jobs.start({ kind: 'enrichment', source: 'manual_lookup' });
    res.json({ job_id: job.id, lookup_id: lookupId, status: job.status });
    (async () => {
      try {
        const result = await runLookup(lookupId, name, { jobLog: (m) => jobs.log(job.id, m) });
        jobs.complete(job.id, { lookup_id: lookupId, ...result });
      } catch (err) { jobs.fail(job.id, err); }
    })();
  } catch (err) { next(err); }
});

// GET /api/enrichment/manual-lookups?status=
router.get('/manual-lookups', async (req, res, next) => {
  try {
    const allowed = ['running', 'pending', 'matched', 'approved', 'rejected', 'error', 'all'];
    const status = allowed.includes(req.query.status) ? req.query.status : 'all';
    res.json({ rows: await listLookups(status) });
  } catch (err) { next(err); }
});

// POST /api/enrichment/manual-lookups/:id/decide { action: 'approve' | 'reject' }
// Approve runs in the background (it creates + enriches a real company); reject
// is immediate.
router.post('/manual-lookups/:id/decide', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad id' });
    const admin = (await query(`SELECT value FROM settings WHERE key='admin_email'`)).rows[0]?.value || 'admin@local';
    const action = req.body?.action;
    if (action === 'approve') {
      const job = jobs.start({ kind: 'enrichment', source: 'manual_lookup' });
      res.json({ job_id: job.id });
      (async () => {
        try { jobs.complete(job.id, await approveLookup(id, admin, { jobLog: (m) => jobs.log(job.id, m) })); }
        catch (err) { jobs.fail(job.id, err); }
      })();
      return;
    }
    if (action === 'enrich_match') {
      const job = jobs.start({ kind: 'enrichment', source: 'manual_lookup' });
      res.json({ job_id: job.id });
      (async () => {
        try { jobs.complete(job.id, await enrichMatchLookup(id, admin, { jobLog: (m) => jobs.log(job.id, m) })); }
        catch (err) { jobs.fail(job.id, err); }
      })();
      return;
    }
    if (action === 'reject') return res.json(await rejectLookup(id, admin));
    return res.status(400).json({ error: 'action must be "approve", "enrich_match", or "reject"' });
  } catch (err) { next(err); }
});

// --- Website candidate review queue (search finds awaiting approval) ---------
router.get('/website-candidates', async (req, res, next) => {
  try {
    const status = ['pending', 'approved', 'rejected', 'all'].includes(req.query.status) ? req.query.status : 'pending';
    res.json({ rows: await listCandidates(status) });
  } catch (err) { next(err); }
});

router.get('/website-candidates/count', async (req, res, next) => {
  try { res.json({ count: await countPending() }); } catch (err) { next(err); }
});

router.post('/website-candidates/:id/decide', async (req, res, next) => {
  try {
    const admin = (await query(`SELECT value FROM settings WHERE key='admin_email'`)).rows[0]?.value || 'admin@local';
    const result = await decideCandidate(Number(req.params.id), req.body?.action, admin);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/enrichment/website-candidates/auto-approve — FREE bulk approval: for
// every pending candidate, re-fetch (no Apify/paid search) and auto-approve only
// the near-certain matches; weak/dead ones stay pending. Runs as a BACKGROUND JOB
// (re-fetching the whole queue takes minutes) — returns a job_id to poll for live
// progress, exactly like the engine runs.
router.post('/website-candidates/auto-approve', async (req, res, next) => {
  try {
    const job = jobs.start({ kind: 'enrichment', source: 'candidate_auto_approve' });
    res.json({ job_id: job.id, status: job.status });
    (async () => {
      try { jobs.complete(job.id, await autoApproveCandidates({ jobLog: (m) => jobs.log(job.id, m) })); }
      catch (err) { jobs.fail(job.id, err); }
    })();
  } catch (err) { next(err); }
});

// POST /api/enrichment/website-candidates/undo-auto-approve — REVERSE every
// website set by the auto-approve pass (clears wrong sites, returns candidates to
// the review queue). Background job with live progress.
router.post('/website-candidates/undo-auto-approve', async (req, res, next) => {
  try {
    const job = jobs.start({ kind: 'enrichment', source: 'candidate_undo_auto_approve' });
    res.json({ job_id: job.id, status: job.status });
    (async () => {
      try { jobs.complete(job.id, await undoAutoApprovals({ jobLog: (m) => jobs.log(job.id, m) })); }
      catch (err) { jobs.fail(job.id, err); }
    })();
  } catch (err) { next(err); }
});

// POST /api/enrichment/website-candidates/clean-harvested-people — remove the
// PEOPLE + guessed emails harvested from the reversed wrong sites. Background job.
router.post('/website-candidates/clean-harvested-people', async (req, res, next) => {
  try {
    const job = jobs.start({ kind: 'enrichment', source: 'clean_harvested_people' });
    res.json({ job_id: job.id, status: job.status });
    (async () => {
      try { jobs.complete(job.id, await cleanReversedHarvestPeople({ jobLog: (m) => jobs.log(job.id, m) })); }
      catch (err) { jobs.fail(job.id, err); }
    })();
  } catch (err) { next(err); }
});

// GET /api/enrichment/relationships/:companyId — Engine 3 network edges for a
// company, in BOTH directions (as source and as target), for the drawer.
router.get('/relationships/:companyId', async (req, res, next) => {
  try {
    const id = Number(req.params.companyId);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'bad company id' });
    const out = await query(`
      SELECT r.id, r.relation_type, r.discovered_via, r.confidence, r.country_status,
             r.target_name, r.target_domain, r.source_url, r.updated_at,
             r.target_company_id, r.target_candidate_id,
             tc.name AS target_company_name, tc.bin AS target_company_bin,
             rc.kind AS candidate_kind
        FROM company_relationships r
        LEFT JOIN companies tc ON tc.id = r.target_company_id
        LEFT JOIN research_candidates rc ON rc.id = r.target_candidate_id
       WHERE r.source_company_id = $1
       ORDER BY r.relation_type, r.confidence DESC NULLS LAST, r.target_name`, [id]);
    const incoming = await query(`
      SELECT r.id, r.relation_type, r.discovered_via, r.confidence,
             sc.id AS source_company_id, sc.name AS source_company_name, sc.bin AS source_company_bin,
             r.updated_at
        FROM company_relationships r
        JOIN companies sc ON sc.id = r.source_company_id
       WHERE r.target_company_id = $1
       ORDER BY r.relation_type, sc.name`, [id]);
    res.json({ outgoing: out.rows, incoming: incoming.rows });
  } catch (err) { next(err); }
});

// GET /api/enrichment/finder-audit — dry run, no mutations. Returns the
// wrong/empty buckets + counts so the admin can see what a cleanup would purge.
router.get('/finder-audit', async (req, res, next) => {
  try {
    const audit = await auditFinderFinds();
    // Trim the per-row payload to keep the response light.
    const slim = (arr) => arr.slice(0, 200).map(x => ({ id: x.id, name: x.name, website: x.website, method: x.method, contacts: x.contacts, people: x.people }));
    res.json({ totals: audit.totals, wrong: slim(audit.wrong), empty: slim(audit.empty) });
  } catch (err) { next(err); }
});

// POST /api/enrichment/finder-cleanup  Body: { buckets: ['wrong'|'empty'] }
// Purges the chosen buckets (membership recomputed server-side) in a job.
router.post('/finder-cleanup', async (req, res, next) => {
  try {
    const raw = Array.isArray(req.body?.buckets) ? req.body.buckets : ['wrong'];
    const buckets = raw.filter(b => b === 'wrong' || b === 'empty');
    if (!buckets.length) return res.status(400).json({ error: 'buckets must include "wrong" and/or "empty"' });
    const job = jobs.start({ kind: 'enrichment', source: 'finder_cleanup' });
    res.json({ job_id: job.id, status: job.status });
    (async () => {
      try {
        const result = await cleanupFinderFinds(buckets, (m) => jobs.log(job.id, m));
        jobs.complete(job.id, result);
      } catch (err) { jobs.fail(job.id, err); }
    })();
  } catch (err) { next(err); }
});

// GET /api/enrichment/jobs/:id — same shape as /api/sources/jobs
//
// `since` is a monotonic message index (from m.idx), NOT a slice offset into
// the messages array. Each log() call assigns a new idx; the UI tracks the
// highest idx it has seen and asks for everything strictly greater than that.
// This survives the array's `shift()` eviction at the MAX_JOB_MESSAGES cap.
router.get('/jobs/:id', (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j) return res.status(404).json({ error: 'not_found' });
  const sinceIdx = Math.max(0, Number(req.query.since || 0));
  const fresh    = j.messages.filter(m => (m.idx ?? 0) >= sinceIdx);
  res.json({
    ...j,
    messages:       fresh,
    total_messages: j.next_index ?? j.messages.length,
  });
});

export default router;
