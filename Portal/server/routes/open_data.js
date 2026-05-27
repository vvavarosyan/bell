// /api/open-data — Deep Data API surface for the Portal.
//
// Catalog discovery + record preview + manual sync triggers + audit feed.

import { Router } from 'express';
import { query } from '../db.js';
import { previewRecords } from '../sources/qatar_open_data/client.js';
import { manualSync, getSchedulerState } from '../sources/qatar_open_data/scheduler.js';
import { pickAndComputeChart } from '../sources/qatar_open_data/chart_picker.js';

const router = Router();

// ----- Stats for the header strip -----------------------------------------
router.get('/stats', async (req, res, next) => {
  try {
    const [datasets, records, runs, themes, publishers, scheduler] = await Promise.all([
      query(`
        SELECT
          count(*)::int AS total_datasets,
          count(*) FILTER (WHERE our_record_sync_status = 'done')::int    AS synced,
          count(*) FILTER (WHERE our_record_sync_status = 'failed')::int  AS failed,
          count(*) FILTER (WHERE our_record_sync_status = 'pending')::int AS pending,
          count(*) FILTER (WHERE our_record_sync_status = 'running')::int AS running,
          count(*) FILTER (WHERE source_modified_at >= now() - interval '7 days')::int AS updated_last_7d,
          count(*) FILTER (WHERE our_first_seen_at   >= now() - interval '7 days')::int AS new_last_7d
        FROM od_datasets WHERE NOT archived
      `),
      query(`SELECT count(*)::bigint AS total FROM od_records`),
      query(`
        SELECT id, kind, status, dataset_id_text, started_at, completed_at,
               new_datasets, updated_datasets, new_records, updated_records,
               error_message
          FROM od_sync_runs
         ORDER BY started_at DESC
         LIMIT 5
      `),
      query(`
        SELECT theme, count(*)::int AS n
          FROM od_datasets
         WHERE theme IS NOT NULL AND NOT archived
         GROUP BY theme ORDER BY n DESC LIMIT 40
      `),
      query(`
        SELECT publisher, count(*)::int AS n
          FROM od_datasets
         WHERE publisher IS NOT NULL AND NOT archived
         GROUP BY publisher ORDER BY n DESC LIMIT 40
      `),
    ]);
    res.json({
      ...datasets.rows[0],
      total_records: Number(records.rows[0].total) || 0,
      recent_runs:   runs.rows,
      themes:        themes.rows,
      publishers:    publishers.rows,
      scheduler:     getSchedulerState(),
    });
  } catch (err) { next(err); }
});

// ----- Datasets list (with filters) ----------------------------------------
router.get('/datasets', async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit  ?? 60), 500);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const where  = [];
    const params = [];
    if (req.query.q) {
      params.push('%' + String(req.query.q).toLowerCase().trim() + '%');
      where.push(`(lower(title) LIKE $${params.length} OR lower(coalesce(description,'')) LIKE $${params.length} OR lower(dataset_id) LIKE $${params.length})`);
    }
    if (req.query.theme) {
      params.push(req.query.theme);
      where.push(`(theme = $${params.length} OR $${params.length} = ANY(themes))`);
    }
    if (req.query.publisher) {
      params.push(req.query.publisher);
      where.push(`publisher = $${params.length}`);
    }
    if (req.query.sync_status) {
      params.push(req.query.sync_status);
      where.push(`our_record_sync_status = $${params.length}`);
    }
    if (req.query.archived === 'true') where.push(`archived = true`);
    else                                where.push(`archived = false`);

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit, offset);
    const sql = `
      SELECT id, dataset_id, title, description, publisher, theme, themes, features,
             record_count, source_modified_at,
             our_last_record_sync_at, our_last_record_count, our_record_sync_status, our_record_sync_error
        FROM od_datasets
        ${whereSql}
        ORDER BY source_modified_at DESC NULLS LAST, title
        LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const countSql = `SELECT count(*)::int AS total FROM od_datasets ${whereSql}`;
    const [rows, count] = await Promise.all([
      query(sql, params),
      query(countSql, params.slice(0, params.length - 2)),
    ]);
    res.json({ total: count.rows[0].total, limit, offset, rows: rows.rows });
  } catch (err) { next(err); }
});

// ----- Records inside one dataset, paginated + sortable --------------------
// GET /datasets/:datasetId/records?limit=&offset=&sort=&dir=&q=
//   sort: a column name from the dataset's schema (any field in data jsonb)
//   dir:  'asc' | 'desc' (default desc when sort given, asc when not)
//   q:    optional full-text contains (case-insensitive) across all jsonb values
// Casts numeric / date fields appropriately using the dataset's fields_schema
// so sorts come out in true numeric / chronological order, not lexicographic.
router.get('/datasets/:datasetId/records', async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit  ?? 50), 500);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const sort   = req.query.sort ? String(req.query.sort) : null;
    const dir    = String(req.query.dir || 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC';
    const q      = req.query.q ? String(req.query.q).trim() : '';

    // Look up dataset + schema so we can validate sort field + pick a cast
    const dsR = await query(
      `SELECT id, fields_schema FROM od_datasets WHERE dataset_id = $1`,
      [req.params.datasetId]
    );
    if (!dsR.rows.length) return res.status(404).json({ error: 'not_found' });
    const ds = dsR.rows[0];
    const schema = Array.isArray(ds.fields_schema) ? ds.fields_schema : [];

    // Validate sort field is in the schema (prevents SQL injection — we
    // build the ORDER BY by interpolating the name)
    let sortField = null;
    let sortType  = null;
    if (sort) {
      const f = schema.find(x => x?.name === sort);
      if (f) { sortField = f.name; sortType = f.type; }
    }

    // Cast for natural ordering
    const sortExpr = sortField
      ? sortCastExpr(sortField, sortType)
      : null;

    const where = ['r.dataset_id_fk = $1'];
    const params = [ds.id];
    if (q) {
      // Cheap whole-row text search via jsonb::text ILIKE
      params.push('%' + q.toLowerCase() + '%');
      where.push(`lower(r.data::text) LIKE $${params.length}`);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const orderSql = sortExpr ? `ORDER BY ${sortExpr} ${dir} NULLS LAST, r.id` : `ORDER BY r.id`;
    params.push(limit, offset);

    const [rowsR, countR] = await Promise.all([
      query(`
        SELECT r.id, r.record_id, r.data, r.our_synced_at
          FROM od_records r
          ${whereSql}
          ${orderSql}
          LIMIT $${params.length - 1} OFFSET $${params.length}
      `, params),
      query(`SELECT count(*)::int AS total FROM od_records r ${whereSql}`,
        params.slice(0, params.length - 2)),
    ]);
    res.json({
      total: countR.rows[0].total,
      limit, offset,
      sort: sortField, dir: dir.toLowerCase(),
      rows: rowsR.rows,
    });
  } catch (err) { next(err); }
});

// Sort-cast helper. Field name was validated against the schema above so it's
// safe to interpolate. Returns a SQL expression like `(r.data->>'foo')::numeric`.
function sortCastExpr(field, type) {
  const access = `r.data->>'${field.replace(/'/g, "''")}'`;
  if (type === 'int' || type === 'long' || type === 'integer' || type === 'double' || type === 'decimal') {
    // NULLIF guards against empty strings causing cast errors
    return `nullif(${access}, '')::numeric`;
  }
  if (type === 'date' || type === 'datetime') {
    return `nullif(${access}, '')::timestamptz`;
  }
  return `lower(${access})`;
}

// ----- One dataset (metadata + sample of stored records) -------------------
router.get('/datasets/:datasetId', async (req, res, next) => {
  try {
    const datasetId = String(req.params.datasetId);
    const [dsR, sampleR, runsR] = await Promise.all([
      query(`SELECT * FROM od_datasets WHERE dataset_id = $1`, [datasetId]),
      query(`
        SELECT r.id, r.record_id, r.data, r.our_synced_at
          FROM od_records r
          JOIN od_datasets d ON d.id = r.dataset_id_fk
         WHERE d.dataset_id = $1
         ORDER BY r.id
         LIMIT 25
      `, [datasetId]),
      query(`
        SELECT id, kind, status, started_at, completed_at, new_records,
               bytes_downloaded, error_message
          FROM od_sync_runs
         WHERE dataset_id_text = $1
         ORDER BY started_at DESC
         LIMIT 10
      `, [datasetId]),
    ]);
    if (!dsR.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ dataset: dsR.rows[0], sample_records: sampleR.rows, recent_runs: runsR.rows });
  } catch (err) { next(err); }
});

// ----- Auto-picked chart for a dataset ------------------------------------
// Inspects schema + local records and returns the single most useful chart.
// Response shape: { chart_type, ...chart_specific_fields }
//   time_series:   { chart_type, field, bucket, points: [{at, n}], range, record_count }
//   category_bar:  { chart_type, field, cardinality, bars: [{label, n}] }
//   stat_strip:    { chart_type, stats: [{field, label, min, max, mean, count}] }
//   none:          { chart_type: 'none', reason }
router.get('/datasets/:datasetId/chart', async (req, res, next) => {
  try {
    const r = await query(`SELECT * FROM od_datasets WHERE dataset_id = $1`, [req.params.datasetId]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    const plan = await pickAndComputeChart(r.rows[0]);
    res.json(plan);
  } catch (err) { next(err); }
});

// ----- Live preview from the upstream API (admin curiosity / debug) --------
router.get('/datasets/:datasetId/preview', async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit ?? 20), 100);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const { total, results } = await previewRecords(req.params.datasetId, { limit, offset });
    res.json({ total, results });
  } catch (err) { next(err); }
});

// ----- Recent sync activity (Overview tab + dataset detail) ----------------
router.get('/runs', async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 25), 200);
    const r = await query(`
      SELECT id, kind, status, dataset_id_text, started_at, completed_at,
             new_datasets, updated_datasets, new_records, updated_records,
             bytes_downloaded, api_calls, error_message, trigger
        FROM od_sync_runs
       ORDER BY started_at DESC
       LIMIT $1
    `, [limit]);
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});

// ----- Manual sync triggers ------------------------------------------------
// POST /sync/catalog          — refresh metadata only
// POST /sync/records          — sync all changed datasets
// POST /sync/records/:datasetId — sync one dataset (force)
router.post('/sync/catalog', async (req, res, next) => {
  try {
    const result = await manualSync('catalog', { triggeredBy: req.body?.triggered_by });
    res.json(result);
  } catch (err) {
    if (err.code === 'busy') return res.status(409).json({ error: 'busy', message: err.message });
    next(err);
  }
});
router.post('/sync/records', async (req, res, next) => {
  try {
    const result = await manualSync('records', { triggeredBy: req.body?.triggered_by });
    res.json(result);
  } catch (err) {
    if (err.code === 'busy') return res.status(409).json({ error: 'busy', message: err.message });
    next(err);
  }
});
router.post('/sync/records/:datasetId', async (req, res, next) => {
  try {
    const result = await manualSync('one', {
      datasetIds: [String(req.params.datasetId)],
      triggeredBy: req.body?.triggered_by,
    });
    res.json(result);
  } catch (err) {
    if (err.code === 'busy') return res.status(409).json({ error: 'busy', message: err.message });
    next(err);
  }
});

export default router;
