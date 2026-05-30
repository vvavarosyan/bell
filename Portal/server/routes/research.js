// /api/research — research jobs, reports, sources, citations, derived entities.
//
// Phase R1 surface only:
//   GET    /jobs                  list (with optional ?status= filter)
//   POST   /jobs                  create (writes a queued job — does NOT call Firecrawl yet)
//   GET    /jobs/:id              full detail (job + report-if-ready + sources + derived)
//   POST   /jobs/:id/cancel       mark cancelled (no-op on Firecrawl yet)
//   GET    /stats                 totals for the Console header
//   GET    /types                 the 6 type definitions for the UI
//
// R2 will add: orchestrator run trigger, status polling, report endpoint, etc.
// R5 will add: POST /jobs/:id/publish (sets is_published + public_slug).

import { Router } from 'express';
import { query } from '../db.js';
import { RESEARCH_TYPES, typeInfo } from '../research/types.js';
import { runJob, advanceJob } from '../research/orchestrator.js';

const router = Router();

// ---- ownership scoping -----------------------------------------------------
// Each tenant sees only its OWN research. platform_admin (Bell staff, on
// admin.bell.qa / local) sees everything.
const isAdmin = (req) => req.user?.role === 'platform_admin';

// True if the request may touch this job. Admin → always. Otherwise the job
// must belong to the caller's tenant.
async function ownsJob(req, id) {
  if (isAdmin(req)) return true;
  const r = await query(`SELECT 1 FROM research_jobs WHERE id = $1 AND tenant_id = $2`, [id, req.tenant?.id]);
  return r.rows.length > 0;
}

// GET /api/research/types — surface the type catalog to the UI
router.get('/types', (req, res) => {
  // Strip the brief_template function (not serializable) before returning.
  const out = {};
  for (const [k, v] of Object.entries(RESEARCH_TYPES)) {
    const { brief_template, ...rest } = v;
    out[k] = rest;
  }
  res.json({ types: out });
});

// GET /api/research/stats — Console header numbers
router.get('/stats', async (req, res, next) => {
  try {
    const scope = isAdmin(req) ? '' : 'WHERE tenant_id = $1';
    const sp = isAdmin(req) ? [] : [req.tenant?.id];
    const [counts, totals] = await Promise.all([
      query(`SELECT status, count(*)::int AS n FROM research_jobs ${scope} GROUP BY status`, sp),
      query(`
        SELECT
          coalesce(sum(source_count),  0)::int AS sources_total,
          coalesce(sum(citation_count),0)::int AS citations_total,
          coalesce(sum(usd_spent),     0)::numeric AS usd_total,
          count(*)::int                          AS jobs_total
        FROM research_jobs ${scope}
      `, sp),
    ]);
    const byStatus = {};
    for (const r of counts.rows) byStatus[r.status] = r.n;
    res.json({
      by_status: byStatus,
      sources_total:   totals.rows[0].sources_total,
      citations_total: totals.rows[0].citations_total,
      usd_total:       Number(totals.rows[0].usd_total),
      jobs_total:      totals.rows[0].jobs_total,
    });
  } catch (err) { next(err); }
});

// GET /api/research/jobs?status=&type=&limit=&offset=
// Default returns most-recent first. Joins on companies/people for target labels.
router.get('/jobs', async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit  ?? 50), 200);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const where = [];
    const params = [];
    // Tenant isolation: non-admins only see their own tenant's research.
    if (!isAdmin(req)) { params.push(req.tenant?.id); where.push(`j.tenant_id = $${params.length}`); }
    if (req.query.status) { params.push(req.query.status); where.push(`j.status = $${params.length}`); }
    if (req.query.type)   { params.push(req.query.type);   where.push(`j.type   = $${params.length}`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit, offset);
    const sql = `
      SELECT
        j.id, j.type, j.brief, j.status,
        j.target_company_id, j.target_person_id, j.target_label,
        j.agent_count, j.source_count, j.section_count, j.citation_count,
        j.usd_spent, j.eta_seconds, j.error_message,
        j.created_at, j.started_at, j.ready_at,
        c.name AS target_company_name, c.bin AS target_company_bin,
        p.full_name AS target_person_name, p.pin AS target_person_pin
      FROM research_jobs j
      LEFT JOIN companies c ON c.id = j.target_company_id
      LEFT JOIN people    p ON p.id = j.target_person_id
      ${whereSql}
      ORDER BY j.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const countSql = `SELECT count(*)::int AS total FROM research_jobs j ${whereSql}`;
    const [rows, count] = await Promise.all([
      query(sql, params),
      query(countSql, params.slice(0, params.length - 2)),
    ]);
    res.json({ total: count.rows[0].total, limit, offset, rows: rows.rows });
  } catch (err) { next(err); }
});

// POST /api/research/jobs
// Body: { type, brief, target_company_id?, target_person_id?, target_label?, created_by? }
// R1: writes a queued row. Does NOT call Firecrawl Agent (that's R2).
router.post('/jobs', async (req, res, next) => {
  try {
    const body = req.body || {};
    const info = typeInfo(body.type);
    if (!info) return res.status(400).json({ error: 'invalid_type', got: body.type });
    if (!info.implemented) {
      return res.status(400).json({ error: 'type_not_implemented_yet', type: body.type });
    }
    const brief = String(body.brief || '').trim();
    if (!brief) return res.status(400).json({ error: 'empty_brief' });

    // Per-type target validation
    if (info.requires_target === 'company' && !body.target_company_id) {
      return res.status(400).json({ error: 'target_company_required' });
    }
    if (info.requires_target === 'person'  && !body.target_person_id) {
      return res.status(400).json({ error: 'target_person_required' });
    }

    // Compute a target_label if not supplied (so the Console card has something)
    let targetLabel = body.target_label || null;
    if (!targetLabel && body.target_company_id) {
      const r = await query(`SELECT name FROM companies WHERE id = $1`, [body.target_company_id]);
      targetLabel = r.rows[0]?.name || null;
    }
    if (!targetLabel && body.target_person_id) {
      const r = await query(`SELECT full_name FROM people WHERE id = $1`, [body.target_person_id]);
      targetLabel = r.rows[0]?.full_name || null;
    }

    // Agent count per type — matches the marketing framing of how many
    // Bella deploys per job. Company deep-dive = 5 (heavy, multi-source).
    const AGENT_COUNT = { company: 5, person: 2, sector: 5, theme: 4, region: 4, regulation: 1 };
    const agentCount = AGENT_COUNT[body.type] || 1;

    const r = await query(`
      INSERT INTO research_jobs (
        type, brief, target_company_id, target_person_id, target_label,
        status, agent_count, created_by, tenant_id
      ) VALUES ($1,$2,$3,$4,$5,'queued',$6,$7,$8)
      RETURNING id
    `, [
      body.type, brief,
      body.target_company_id || null,
      body.target_person_id  || null,
      targetLabel,
      agentCount,
      req.user?.email || null,   // owner from the session, never the client body
      req.tenant?.id || null,
    ]);
    const jobId = r.rows[0].id;

    // Fire the orchestrator IMMEDIATELY (don't wait for the 15s poller tick)
    // so the user sees the card flip to 'gathering' within seconds. Done
    // async — we still return 'queued' to the client; the poller picks it up
    // if the immediate kick fails for any reason.
    runJob(jobId).catch(err => {
      console.error('[research] immediate run failed for job', jobId, '—', err.message);
    });

    res.json({ id: jobId, status: 'queued' });
  } catch (err) { next(err); }
});

// POST /api/research/jobs/:id/run — manually kick a queued job (or retry one)
router.post('/jobs/:id/run', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    if (!(await ownsJob(req, id))) return res.status(404).json({ error: 'not_found' });
    const out = await runJob(id);
    res.json(out);
  } catch (err) { next(err); }
});

// POST /api/research/jobs/:id/poll — force a poll of one job (debug / manual)
router.post('/jobs/:id/poll', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    if (!(await ownsJob(req, id))) return res.status(404).json({ error: 'not_found' });
    const out = await advanceJob(id);
    res.json(out);
  } catch (err) { next(err); }
});

// DELETE /api/research/jobs/:id — remove a research job (own, or admin).
router.delete('/jobs/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    if (!(await ownsJob(req, id))) return res.status(404).json({ error: 'not_found' });
    await query(`DELETE FROM research_jobs WHERE id = $1`, [id]);  // children cascade
    res.json({ deleted: id });
  } catch (err) { next(err); }
});

// GET /api/research/jobs/:id — full detail
router.get('/jobs/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    if (!(await ownsJob(req, id))) return res.status(404).json({ error: 'not_found' });

    const [jobR, sourcesR, reportR, derivedR] = await Promise.all([
      query(`
        SELECT
          j.*,
          c.name AS target_company_name, c.bin AS target_company_bin,
          p.full_name AS target_person_name, p.pin AS target_person_pin
        FROM research_jobs j
        LEFT JOIN companies c ON c.id = j.target_company_id
        LEFT JOIN people    p ON p.id = j.target_person_id
        WHERE j.id = $1
      `, [id]),
      query(`SELECT id, class, label, url, excerpt, retrieved_at
             FROM research_sources WHERE job_id = $1 ORDER BY id`, [id]),
      query(`SELECT id, title, summary, sections, metadata,
                    is_published, public_slug, published_at, view_count,
                    assembled_at, updated_at
             FROM research_reports WHERE job_id = $1`, [id]),
      query(`SELECT id, entity_type, entity_id, action, fields_changed, notes, derived_at
             FROM research_derived_entities WHERE job_id = $1 ORDER BY derived_at DESC`, [id]),
    ]);
    if (!jobR.rows.length) return res.status(404).json({ error: 'not_found' });

    res.json({
      job:     jobR.rows[0],
      sources: sourcesR.rows,
      report:  reportR.rows[0] || null,
      // Snowball "Bell database changes" are an internal/admin view only.
      derived: isAdmin(req) ? derivedR.rows : [],
    });
  } catch (err) { next(err); }
});

// POST /api/research/jobs/:id/cancel
router.post('/jobs/:id/cancel', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!(await ownsJob(req, id))) return res.status(404).json({ error: 'not_found' });
    const r = await query(`
      UPDATE research_jobs
      SET status = 'cancelled'
      WHERE id = $1 AND status IN ('queued','gathering','synthesizing')
      RETURNING id, status
    `, [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found_or_already_terminal' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

export default router;
