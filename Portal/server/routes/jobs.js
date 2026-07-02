// /api/jobs — listing + inline edit.

import { Router } from 'express';
import { query } from '../db.js';
import { denyUnlessLocalEngine } from '../lib/auth.js';

const router = Router();

// Jobs are canonical data — mutated ONLY on the local engine: allow GET, block
// writes off-local (no reveal on jobs).
router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  return denyUnlessLocalEngine(req, res, next);
});

const EDITABLE_FIELDS = new Set([
  'title', 'description',
  'location_text', 'is_remote', 'workplace_type',
  'employment_type', 'seniority_level',
  'salary_min', 'salary_max', 'salary_currency', 'salary_period',
  'posted_at', 'expires_at', 'is_active',
]);

// A job is EFFECTIVELY active when its flag is set AND it hasn't passed its
// expiry — keeps the UI honest even before the engine re-scan marks it stale.
const EFFECTIVE_ACTIVE = `(j.is_active AND (j.expires_at IS NULL OR j.expires_at > now()))`;

// Distinct values for the JobsTab filter dropdowns (small table — live query).
// Declared BEFORE /:id so the literal path wins the route match.
router.get('/filters', async (req, res, next) => {
  try {
    const [types, workplaces, seniorities] = await Promise.all([
      query(`SELECT DISTINCT employment_type AS v FROM jobs WHERE employment_type IS NOT NULL AND employment_type <> '' ORDER BY 1`),
      query(`SELECT DISTINCT workplace_type AS v FROM jobs WHERE workplace_type IS NOT NULL AND workplace_type <> '' ORDER BY 1`),
      query(`SELECT DISTINCT seniority_level AS v FROM jobs WHERE seniority_level IS NOT NULL AND seniority_level <> '' ORDER BY 1`),
    ]);
    res.json({
      types:       types.rows.map((r) => r.v),
      workplaces:  workplaces.rows.map((r) => r.v),
      seniorities: seniorities.rows.map((r) => r.v),
    });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit ?? 100), 1000);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const q      = (req.query.q || '').trim();
    const companyId = req.query.company_id ? Number(req.query.company_id) : null;

    const where = [];
    const params = [];

    if (q) {
      // Search across title, company name, location AND description — the user
      // shouldn't need to know which field a keyword lives in.
      params.push('%' + q.toLowerCase() + '%');
      where.push(`(lower(j.title) LIKE $${params.length}
                   OR coalesce(c.name,'') ILIKE $${params.length}
                   OR coalesce(j.location_text,'') ILIKE $${params.length}
                   OR coalesce(j.description,'') ILIKE $${params.length})`);
    }
    if (companyId) {
      params.push(companyId);
      where.push(`j.company_id = $${params.length}`);
    }
    // Advanced filters (A2): employment type / workplace / seniority /
    // posted-within-N-days. Status filter uses EFFECTIVE activity.
    if (req.query.type) {
      params.push(String(req.query.type));
      where.push(`j.employment_type = $${params.length}`);
    }
    if (req.query.workplace) {
      params.push(String(req.query.workplace));
      where.push(`j.workplace_type = $${params.length}`);
    }
    if (req.query.seniority) {
      params.push(String(req.query.seniority));
      where.push(`j.seniority_level = $${params.length}`);
    }
    const within = Number(req.query.posted_within_days);
    if (Number.isFinite(within) && within > 0) {
      params.push(Math.floor(within));
      where.push(`j.posted_at >= now() - ($${params.length} || ' days')::interval`);
    }
    if (req.query.is_active === 'true')  where.push(EFFECTIVE_ACTIVE);
    if (req.query.is_active === 'false') where.push(`NOT ${EFFECTIVE_ACTIVE}`);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit, offset);

    const sql = `
      SELECT j.id, j.jin, j.company_id, c.name AS company_name, c.bin AS company_bin,
             j.title, j.location_text, j.workplace_type, j.employment_type, j.seniority_level,
             j.salary_min, j.salary_max, j.salary_currency, j.salary_period,
             j.posted_at, j.expires_at, j.is_active, ${EFFECTIVE_ACTIVE} AS effective_active,
             j.applicant_count, j.created_at, j.updated_at, j.archived
      FROM jobs j
      LEFT JOIN companies c ON c.id = j.company_id
      ${whereSql}
      ORDER BY j.posted_at DESC NULLS LAST, j.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const countSql = `SELECT count(*)::int AS total FROM jobs j LEFT JOIN companies c ON c.id = j.company_id ${whereSql}`;

    const [rowsResult, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, params.slice(0, params.length - 2)),
    ]);

    res.json({
      total: countResult.rows[0].total,
      limit, offset,
      rows: rowsResult.rows,
    });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const result = await query(`
      SELECT j.*, ${EFFECTIVE_ACTIVE} AS effective_active,
             c.bin AS company_bin, c.name AS company_name,
             c.city AS company_city, c.website AS company_website
      FROM jobs j LEFT JOIN companies c ON c.id = j.company_id
      WHERE j.id = $1
    `, [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ job: result.rows[0] });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const updates = req.body || {};
    const setParts = [];
    const params = [];
    for (const [field, value] of Object.entries(updates)) {
      if (!EDITABLE_FIELDS.has(field)) {
        return res.status(400).json({ error: 'field_not_editable', field });
      }
      params.push(value === '' ? null : value);
      setParts.push(`${field} = $${params.length}`);
    }
    if (setParts.length === 0) return res.status(400).json({ error: 'no_fields_to_update' });
    params.push(id);
    const sql = `UPDATE jobs SET ${setParts.join(', ')} WHERE id = $${params.length} RETURNING *`;
    const result = await query(sql, params);
    if (!result.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ job: result.rows[0] });
  } catch (err) { next(err); }
});

export default router;
