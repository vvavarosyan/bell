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

router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit ?? 100), 1000);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const q      = (req.query.q || '').trim();
    const companyId = req.query.company_id ? Number(req.query.company_id) : null;

    const where = [];
    const params = [];

    if (q) {
      params.push('%' + q.toLowerCase() + '%');
      where.push(`(lower(title) LIKE $${params.length} OR coalesce(location_text,'') ILIKE $${params.length})`);
    }
    if (companyId) {
      params.push(companyId);
      where.push(`company_id = $${params.length}`);
    }
    if (req.query.is_active === 'true' || req.query.is_active === 'false') {
      params.push(req.query.is_active === 'true');
      where.push(`is_active = $${params.length}`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit, offset);

    const sql = `
      SELECT j.id, j.jin, j.company_id, c.name AS company_name, c.bin AS company_bin,
             j.title, j.location_text, j.workplace_type, j.employment_type, j.seniority_level,
             j.salary_min, j.salary_max, j.salary_currency, j.salary_period,
             j.posted_at, j.expires_at, j.is_active,
             j.created_at, j.updated_at, j.archived
      FROM jobs j
      LEFT JOIN companies c ON c.id = j.company_id
      ${whereSql}
      ORDER BY j.posted_at DESC NULLS LAST, j.id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const countSql = `SELECT count(*)::int AS total FROM jobs j ${whereSql}`;

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
    const result = await query(`
      SELECT j.*, c.bin AS company_bin, c.name AS company_name
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
