// /api/job-runs — historical, Postgres-backed job runs.
//
// Lives separately from /api/enrichment/jobs/:id and /api/sources/jobs/:id
// which still serve LIVE in-memory jobs. The job tracker writes a row to
// `job_runs` (migration 007) on every job's terminal state — this route
// reads from there so the Recent Jobs view can show history that survives
// Portal restarts.

import { Router } from 'express';
import { query } from '../db.js';
import { jobs } from '../ingest/jobs.js';

const router = Router();

// GET /api/job-runs?kind=&limit=&offset=
// Returns a slim list (no messages payload) suitable for the Recent Jobs
// table. Newest first.
router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit  ?? 50), 200);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const kind   = req.query.kind ? String(req.query.kind) : null;
    const params = [limit, offset];
    let where = '';
    if (kind) { params.push(kind); where = `WHERE kind = $${params.length}`; }
    const r = await query(`
      SELECT id, kind, source, status, started_at, completed_at,
             total_messages, result, error, triggered_by
      FROM job_runs
      ${where}
      ORDER BY started_at DESC
      LIMIT $1 OFFSET $2
    `, params);
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});

// GET /api/job-runs/:id — full payload including all messages.
// Falls back to the in-memory live job if the persisted row doesn't exist yet
// (i.e. job is still running and hasn't been written to job_runs).
router.get('/:id', async (req, res, next) => {
  try {
    const id = req.params.id;
    const sinceIdx = Math.max(0, Number(req.query.since || 0));

    // Try in-memory first (covers running jobs and freshly-finished ones still
    // in the LRU cache). Falls through to DB only when not in memory.
    const liveJob = jobs.get(id);
    if (liveJob) {
      const fresh = (liveJob.messages || []).filter(m => (m.idx ?? 0) >= sinceIdx);
      return res.json({
        ...liveJob,
        messages:       fresh,
        total_messages: liveJob.next_index ?? liveJob.messages.length,
        live:           true,
      });
    }

    const r = await query(`
      SELECT id, kind, source, status, started_at, completed_at,
             messages, total_messages, result, error, triggered_by
      FROM job_runs WHERE id = $1
    `, [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    const j = r.rows[0];
    const messages = Array.isArray(j.messages) ? j.messages : [];
    const fresh = messages.filter(m => (m.idx ?? 0) >= sinceIdx);
    res.json({
      ...j,
      messages:       fresh,
      total_messages: j.total_messages ?? messages.length,
      live:           false,
    });
  } catch (err) { next(err); }
});

export default router;
