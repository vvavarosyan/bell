// /api/enrichment — start enrichment jobs, list/poll, list stages.

import { Router } from 'express';
import { query } from '../db.js';
import { jobs } from '../ingest/jobs.js';
import {
  runStageForCompanies,
  runFullEnrichment,
  runHarvestSweep,
  stageList,
} from '../enrichment/orchestrator.js';
import { auditFinderFinds, cleanupFinderFinds } from '../enrichment/local/cleanup.js';
import { listCandidates, countPending, decideCandidate } from '../enrichment/local/candidates.js';

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

    if (mode === 'stage') {
      const n = Number(stage);
      // Stages 1-6 are wired and runnable independently. The Full Enrichment
      // path layers dependency gates between them, but a SINGLE-stage run has
      // no inter-stage prereqs — each stage handles its own input checks
      // (Stage 6 silently skips companies without a website, etc.).
      if (![1, 2, 3, 4, 5, 6, 7, 8].includes(n)) return res.status(400).json({ error: 'stage must be 1-8' });
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

    return res.status(400).json({ error: 'mode must be "stage" or "full"' });
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
