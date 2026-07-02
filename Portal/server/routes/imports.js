// /api/imports — user-imported lists (req #2). Mounted under the `feature` gate
// (auth + active subscription). Every row is scoped to req.tenant.id and is
// TENANT-PRIVATE. If the upload opts in to "contribute to Bell", its rows are
// flagged pending_review for the Phase-2 admin enrichment queue (which feeds the
// canonical DB + syncs local<->prod; the publish step stays lawyer-gated).

import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { parseCsv, mapImportRecord } from '../lib/csvparse.js';
import { addNewEntity, addDatapoint } from '../lib/contributions.js';
import { ensureCrmRecord } from '../lib/crm.js';
import { matchCompany, matchPerson } from '../lib/matching.js';

const router = Router();

const tenantId = (req) => req.tenant?.id;
const actorEmail = (req) => req.user?.email || null;

const MAX_IMPORT_ROWS = 50000;   // per upload
const FIELDS = ['name', 'email', 'phone', 'company_name', 'title', 'website', 'city', 'country', 'notes'];

// Shared CSV/JSON → mapped-rows parse (same logic as POST /). Used by the
// preview + commit routes that back the conservative "confirm matches" flow.
function parseRowsFromBody(body) {
  const kind = body?.kind === 'company' ? 'company' : 'contact';
  const csv = String(body?.csv || '');
  if (!csv.trim()) return { kind, headers: [], mapped: [], error: 'empty_csv' };
  let headers, records;
  const trimmed = csv.trim();
  if (trimmed[0] === '[' || trimmed[0] === '{') {
    try {
      let arr = JSON.parse(trimmed);
      if (!Array.isArray(arr)) arr = arr.rows || arr.data || arr.records || [arr];
      records = (arr || []).filter((o) => o && typeof o === 'object').slice(0, MAX_IMPORT_ROWS).map((o) => {
        const low = {}; for (const [kk, vv] of Object.entries(o)) low[String(kk).trim().toLowerCase()] = (vv == null ? '' : String(vv).trim());
        return low;
      });
      headers = records.length ? Object.keys(records[0]) : [];
    } catch { return { kind, headers: [], mapped: [], error: 'bad_json' }; }
  } else {
    ({ headers, records } = parseCsv(csv, { maxRows: MAX_IMPORT_ROWS }));
  }
  const mapped = records.map((rec) => {
    const m = mapImportRecord(rec);
    const name = m.name || m.company_name || '';
    return { ...m, name: kind === 'company' ? (m.company_name || m.name || '') : name, raw: rec };
  }).filter((m) => (m.name && m.name.trim()) || (m.email && m.email.trim()));
  return { kind, headers, mapped };
}

// Pull only the canonical fields (not the raw blob) for the client preview.
const pickFields = (m) => ({
  name: m.name || '', email: m.email || '', phone: m.phone || '', company_name: m.company_name || '',
  title: m.title || '', website: m.website || '', city: m.city || '', country: m.country || '', notes: m.notes || '',
});

// Create a brand-new entity for an unmatched row (the existing "+ New" path).
async function createNewFromRow(tid, entityType, m, actor) {
  await addNewEntity({
    tenantId: tid, kind: entityType === 'company' ? 'company' : 'person', name: m.name,
    company: m.company_name || null, email: m.email || null, phone: m.phone || null,
    website: m.website || null, city: m.city || null, title: m.title || null, notes: m.notes || null, createdBy: actor,
  });
}

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

    const actor = actorEmail(req);
    const entityKind = kind === 'company' ? 'company' : 'person';

    // History row for the user's "Your imports" list.
    const batch = (await query(
      `INSERT INTO import_batches (tenant_id, kind, filename, row_count, contribute, created_by)
       VALUES ($1,$2,$3,$4,true,$5) RETURNING id, created_at`,
      [tid, kind, filename, mapped.length, actor],
    )).rows[0];

    // Each row flows through the SAME path as "+ New": added to the user's CRM
    // immediately (hidden company / private person) + captured for the admin's
    // grouped review. Capped per request (large imports → future background job).
    const CAP = 2000;
    let inserted = 0;
    for (const m of mapped.slice(0, CAP)) {
      try {
        await addNewEntity({
          tenantId: tid, kind: entityKind, name: m.name, company: m.company_name || null,
          email: m.email || null, phone: m.phone || null, website: m.website || null,
          city: m.city || null, title: m.title || null, notes: m.notes || null, createdBy: actor,
        });
        inserted++;
      } catch { /* skip a bad row, keep going */ }
    }
    const result = { batch_id: batch.id, inserted };

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

// POST /api/imports/preview — parse + MATCH each row against Bell's canonical DB
// WITHOUT writing anything. Returns per-row outcome (matched/review/new) +
// candidate, so the UI can show the conservative "confirm matches" step. The
// engine never auto-matches on a fuzzy name alone (see server/lib/matching.js).
const PREVIEW_CAP = 500;   // interactive preview — cap rows we score per call
router.post('/preview', async (req, res, next) => {
  try {
    const tid = tenantId(req);
    if (!tid) return res.status(401).json({ error: 'no_tenant' });
    const { kind, headers, mapped, error } = parseRowsFromBody(req.body);
    if (error) return res.status(400).json({ error });
    if (!mapped.length) return res.status(400).json({ error: 'no_usable_rows', headers });

    const rows = [];
    const summary = { matched: 0, review: 0, new: 0 };
    for (let i = 0; i < Math.min(mapped.length, PREVIEW_CAP); i++) {
      const m = mapped[i];
      const out = kind === 'company' ? await matchCompany(m) : await matchPerson(m);
      summary[out.status] = (summary[out.status] || 0) + 1;
      rows.push({ i, mapped: pickFields(m), status: out.status, confidence: out.confidence, candidate: out.candidate });
    }
    res.json({ kind, headers, summary, rows, total_rows: mapped.length, truncated: mapped.length > PREVIEW_CAP });
  } catch (err) { next(err); }
});

// POST /api/imports/commit — apply the user's decisions.
//   body: { kind, filename, rows: [{ mapped, action:'link'|'new',
//                                    entity_type, entity_id, match_status, match_confidence }] }
// 'link' → add the canonical entity to the tenant's CRM + record the import row
//          (matched) + queue the row's contact fields as contributed datapoints
//          (admin-gated enrichment). 'new' → create a brand-new entity (+ New path).
const COMMIT_CAP = 2000;
router.post('/commit', async (req, res, next) => {
  try {
    const tid = tenantId(req);
    if (!tid) return res.status(401).json({ error: 'no_tenant' });
    const kind = req.body?.kind === 'company' ? 'company' : 'contact';
    const entityType = kind === 'company' ? 'company' : 'person';
    const filename = String(req.body?.filename || '').slice(0, 200) || null;
    const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ error: 'no_rows' });
    const actor = actorEmail(req);

    const batch = (await query(
      `INSERT INTO import_batches (tenant_id, kind, filename, row_count, contribute, created_by)
       VALUES ($1,$2,$3,$4,true,$5) RETURNING id`,
      [tid, kind, filename, Math.min(rows.length, COMMIT_CAP), actor],
    )).rows[0];

    let linked = 0, created = 0, skipped = 0;
    for (const r of rows.slice(0, COMMIT_CAP)) {
      const m = r.mapped || {};
      try {
        const eType = r.entity_type === 'person' ? 'person' : (r.entity_type === 'company' ? 'company' : entityType);
        // Verify the link target actually exists before trusting a client-supplied id.
        const linkable = r.action === 'link' && r.entity_id
          && (await query(`SELECT 1 FROM ${eType === 'company' ? 'companies' : 'people'} WHERE id=$1`, [Number(r.entity_id)])).rows.length;

        if (linkable) {
          await ensureCrmRecord(null, tid, eType, Number(r.entity_id), 'import', actor).catch(() => {});
          await query(
            `INSERT INTO imported_records
               (tenant_id, batch_id, kind, name, email, phone, company_name, title, website, city, country, notes,
                raw, matched_entity_type, matched_entity_id, match_status, match_confidence, enrich_status, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,'approved',$18)`,
            [tid, batch.id, kind, m.name, m.email, m.phone, m.company_name, m.title, m.website, m.city, m.country, m.notes,
             JSON.stringify(m.raw || {}), eType, Number(r.entity_id), r.match_status || 'matched',
             (r.match_confidence == null ? null : Number(r.match_confidence)), actor],
          );
          // The import row's contact fields enrich the matched entity (admin pool).
          for (const [field, val] of [['email', m.email], ['phone', m.phone], ['website', m.website]]) {
            if (val && String(val).trim()) {
              await addDatapoint({ tenantId: tid, entityType: eType, entityId: Number(r.entity_id), field, value: val,
                source: 'import', importBatchId: batch.id, createdBy: actor }).catch(() => {});
            }
          }
          linked++;
        } else {
          await createNewFromRow(tid, entityType, m, actor);
          created++;
        }
      } catch { skipped++; /* keep going — the count is reported so failures aren't silent */ }
    }
    res.json({ ok: true, batch_id: batch.id, linked, created, skipped, total: linked + created });
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
