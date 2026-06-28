// /api/imports — user-imported lists (req #2). Mounted under the `feature` gate
// (auth + active subscription). Every row is scoped to req.tenant.id and is
// TENANT-PRIVATE. If the upload opts in to "contribute to Bell", its rows are
// flagged pending_review for the Phase-2 admin enrichment queue (which feeds the
// canonical DB + syncs local<->prod; the publish step stays lawyer-gated).

import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { parseCsv, mapImportRecord } from '../lib/csvparse.js';

const router = Router();

const tenantId = (req) => req.tenant?.id;
const actorEmail = (req) => req.user?.email || null;

const MAX_IMPORT_ROWS = 50000;   // per upload
const FIELDS = ['name', 'email', 'phone', 'company_name', 'title', 'website', 'city', 'country', 'notes'];

// POST /api/imports  { kind:'company'|'contact', filename?, contribute?, csv:"<text>" }
router.post('/', async (req, res, next) => {
  try {
    const tid = tenantId(req);
    if (!tid) return res.status(401).json({ error: 'no_tenant' });

    const kind = req.body?.kind === 'company' ? 'company' : 'contact';
    const contribute = true;   // everything imported is captured for admin review (Val's model)
    const filename = String(req.body?.filename || '').slice(0, 200) || null;
    const csv = String(req.body?.csv || '');
    if (!csv.trim()) return res.status(400).json({ error: 'empty_csv' });

    // Accept CSV OR JSON (array of row objects).
    let headers, records;
    const trimmed = csv.trim();
    if (trimmed[0] === '[' || trimmed[0] === '{') {
      try {
        let arr = JSON.parse(trimmed);
        if (!Array.isArray(arr)) arr = arr.rows || arr.data || arr.records || [arr];
        records = (arr || []).filter(o => o && typeof o === 'object').slice(0, MAX_IMPORT_ROWS).map(o => {
          const low = {}; for (const [kk, vv] of Object.entries(o)) low[String(kk).trim().toLowerCase()] = (vv == null ? '' : String(vv).trim());
          return low;
        });
        headers = records.length ? Object.keys(records[0]) : [];
      } catch { return res.status(400).json({ error: 'bad_json' }); }
    } else {
      ({ headers, records } = parseCsv(csv, { maxRows: MAX_IMPORT_ROWS }));
    }
    if (!records.length) return res.status(400).json({ error: 'no_rows', headers });

    // Map each raw record to our canonical fields; keep the original row in `raw`.
    const mapped = records.map((rec) => {
      const m = mapImportRecord(rec);
      // A row needs at least a name or an email to be useful.
      const name = m.name || m.company_name || '';
      return { ...m, name: kind === 'company' ? (m.company_name || m.name || '') : name, raw: rec };
    }).filter((m) => (m.name && m.name.trim()) || (m.email && m.email.trim()));

    if (!mapped.length) return res.status(400).json({ error: 'no_usable_rows', headers });

    const enrichStatus = contribute ? 'pending_review' : 'private';
    const actor = actorEmail(req);

    const result = await withTransaction(async (client) => {
      const batch = (await client.query(
        `INSERT INTO import_batches (tenant_id, kind, filename, row_count, contribute, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id, created_at`,
        [tid, kind, filename, mapped.length, contribute, actor],
      )).rows[0];

      // Bulk insert rows in chunks (parameterized).
      let inserted = 0;
      const CHUNK = 500;
      for (let i = 0; i < mapped.length; i += CHUNK) {
        const slice = mapped.slice(i, i + CHUNK);
        const vals = [];
        const ph = [];
        slice.forEach((m, k) => {
          const b = k * 14;
          ph.push(`($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14})`);
          vals.push(
            tid, batch.id, kind,
            m.name || null, m.email || null, m.phone || null, m.company_name || null,
            m.title || null, m.website || null, m.city || null, m.country || null,
            m.notes || null, JSON.stringify(m.raw || {}), enrichStatus,
          );
        });
        const r = await client.query(
          `INSERT INTO imported_records
             (tenant_id, batch_id, kind, name, email, phone, company_name, title, website, city, country, notes, raw, enrich_status)
           VALUES ${ph.join(',')}`,
          vals,
        );
        inserted += r.rowCount;
      }
      return { batch_id: batch.id, inserted };
    });

    res.json({
      ok: true,
      batch_id: result.batch_id,
      kind,
      imported: result.inserted,
      skipped: records.length - mapped.length,
      contribute,
      queued_for_review: contribute ? result.inserted : 0,
      headers,
    });
  } catch (err) { next(err); }
});

// GET /api/imports — this tenant's import batches (newest first).
router.get('/', async (req, res, next) => {
  try {
    const tid = tenantId(req);
    if (!tid) return res.status(401).json({ error: 'no_tenant' });
    const rows = (await query(
      `SELECT b.id, b.kind, b.filename, b.row_count, b.contribute, b.created_by, b.created_at,
              count(r.id) FILTER (WHERE r.enrich_status='approved')::int AS approved,
              count(r.id) FILTER (WHERE r.enrich_status='pending_review')::int AS pending
         FROM import_batches b
         LEFT JOIN imported_records r ON r.batch_id = b.id
        WHERE b.tenant_id = $1
        GROUP BY b.id
        ORDER BY b.created_at DESC
        LIMIT 200`,
      [tid],
    )).rows;
    res.json({ rows });
  } catch (err) { next(err); }
});

// GET /api/imports/:id/rows — rows of one batch (tenant-scoped), paginated.
router.get('/:id/rows', async (req, res, next) => {
  try {
    const tid = tenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const limit = Math.min(Number(req.query.limit ?? 200), 500);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const rows = (await query(
      `SELECT id, kind, name, email, phone, company_name, title, website, city, country, notes,
              matched_entity_type, matched_entity_id, enrich_status, created_at
         FROM imported_records
        WHERE tenant_id = $1 AND batch_id = $2
        ORDER BY id
        LIMIT $3 OFFSET $4`,
      [tid, id, limit, offset],
    )).rows;
    const total = (await query(
      `SELECT count(*)::int AS n FROM imported_records WHERE tenant_id=$1 AND batch_id=$2`,
      [tid, id],
    )).rows[0].n;
    res.json({ rows, total, limit, offset });
  } catch (err) { next(err); }
});

// DELETE /api/imports/:id — remove a batch + its rows (tenant-scoped).
router.delete('/:id', async (req, res, next) => {
  try {
    const tid = tenantId(req);
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const r = await query(`DELETE FROM import_batches WHERE id=$1 AND tenant_id=$2 RETURNING id`, [id, tid]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true, deleted: id });
  } catch (err) { next(err); }
});

export default router;
