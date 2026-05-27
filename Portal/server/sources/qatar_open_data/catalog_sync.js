// Catalog sync — keep od_datasets in sync with data.gov.qa's catalog.
// Pages through /catalog/datasets, upserts each row. Detects new datasets,
// catches changed metadata (source_modified_at, record_count, fields).
//
// Cheap operation: ~13 API calls for 1,260 datasets at 100/page. Runs every
// few hours and on demand.

import { withTransaction } from '../../db.js';
import { listDatasets } from './client.js';

const PAGE_SIZE = 100;

/**
 * Refresh the entire od_datasets table against the live catalog.
 * Returns counters for the audit log.
 */
export async function syncCatalog({ trigger = 'auto', triggeredBy = null, signal } = {}) {
  const start = Date.now();
  let runId = null;
  let totalBytes = 0;
  let apiCalls   = 0;
  let newCount   = 0;
  let updCount   = 0;
  let scanned    = 0;

  try {
    // 1. Open an audit row
    runId = await openRun({ kind: 'catalog', trigger, triggeredBy });

    // 2. Page through the catalog
    let offset = 0;
    let total  = null;
    while (true) {
      if (signal?.aborted) throw new Error('aborted');
      const { total: t, results, bytes } = await listDatasets({ limit: PAGE_SIZE, offset, signal });
      total = t;
      totalBytes += bytes;
      apiCalls   += 1;
      if (!results.length) break;
      // 3. Upsert each result
      for (const row of results) {
        const r = await upsertCatalogRow(row);
        if (r === 'inserted') newCount++;
        else if (r === 'updated') updCount++;
        scanned++;
      }
      offset += results.length;
      if (offset >= total) break;
      // Small politeness pause between pages
      await sleep(120);
    }

    // 4. Close audit row
    await closeRun(runId, {
      status: 'completed',
      new_datasets: newCount,
      updated_datasets: updCount,
      bytes_downloaded: totalBytes,
      api_calls: apiCalls,
      summary: { scanned, total, ms: Date.now() - start },
    });

    return { runId, scanned, total, new_datasets: newCount, updated_datasets: updCount,
             bytes_downloaded: totalBytes, api_calls: apiCalls, ms: Date.now() - start };
  } catch (err) {
    if (runId) {
      await closeRun(runId, {
        status: 'failed',
        new_datasets: newCount,
        updated_datasets: updCount,
        bytes_downloaded: totalBytes,
        api_calls: apiCalls,
        error_message: String(err.message || err).slice(0, 2000),
      }).catch(() => {});
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Upsert one catalog row. Opendatasoft's nested shape:
//   { dataset_id, dataset_uid, has_records, fields, metas: { default: {...}, ... } }
// We flatten the metas.default block into our columns.
// ---------------------------------------------------------------------------
async function upsertCatalogRow(row) {
  const datasetId = row?.dataset_id || row?.datasetid || row?.id;
  if (!datasetId) return 'skipped';

  const meta = row?.metas?.default || row?.metas || row || {};
  const allMetas = row?.metas || {};

  // Fields/schema — array of { name, type, label, description, ... }
  const fields = Array.isArray(row?.fields) ? row.fields.map(f => ({
    name:        f?.name        || null,
    type:        f?.type        || null,
    label:       f?.label       || null,
    description: f?.description || null,
  })) : [];

  const themes   = pickArray(meta.theme);
  const keywords = pickArray(meta.keyword);
  const features = pickArray(row?.features);

  const valueMap = {
    dataset_id:                    datasetId,
    title:                         meta.title || datasetId,
    description:                   meta.description || null,
    publisher:                     meta.publisher || null,
    license:                       meta.license || null,
    language:                      meta.language || null,
    theme:                         Array.isArray(meta.theme) ? meta.theme[0] : (meta.theme || null),
    themes,
    keywords,
    features,
    fields_schema:                 JSON.stringify(fields),
    record_count:                  Number(meta.records_count ?? meta.recordCount ?? row?.has_records === false ? 0 : 0),
    source_created_at:             toTimestamp(meta.created),
    source_modified_at:            toTimestamp(meta.modified),
    source_data_processed_at:      toTimestamp(meta.data_processed),
    source_metadata_processed_at:  toTimestamp(meta.metadata_processed),
    extra_fields:                  JSON.stringify({
      dcat:       allMetas.dcat || null,
      ods:        allMetas.ods  || null,
      explore:    allMetas.explore || null,
    }),
  };

  // 1. Insert (no-op on conflict — we treat as update below)
  return await withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT id, source_modified_at, record_count, title FROM od_datasets WHERE dataset_id = $1`,
      [datasetId]
    );
    if (existing.rows.length === 0) {
      const cols = Object.keys(valueMap);
      const placeholders = cols.map((_, i) => `$${i + 1}`);
      await client.query(
        `INSERT INTO od_datasets (${cols.join(',')}) VALUES (${placeholders.join(',')})`,
        cols.map(c => valueMap[c])
      );
      return 'inserted';
    }
    // Update — but ALWAYS bump our_last_catalog_sync_at so the audit reflects
    // we touched this row, even if nothing else changed.
    const cols = Object.keys(valueMap);
    const setParts = cols.map((c, i) => `${c} = $${i + 1}`);
    setParts.push(`our_last_catalog_sync_at = now()`);
    await client.query(
      `UPDATE od_datasets SET ${setParts.join(', ')} WHERE dataset_id = $${cols.length + 1}`,
      [...cols.map(c => valueMap[c]), datasetId]
    );
    return 'updated';
  });
}

// ---------------------------------------------------------------------------
// Audit-row helpers
// ---------------------------------------------------------------------------
async function openRun({ kind, trigger, triggeredBy, datasetIdFk = null, datasetIdText = null }) {
  return await withTransaction(async (client) => {
    const r = await client.query(`
      INSERT INTO od_sync_runs (kind, dataset_id_fk, dataset_id_text, trigger, triggered_by, status, started_at)
      VALUES ($1,$2,$3,$4,$5,'running', now())
      RETURNING id
    `, [kind, datasetIdFk, datasetIdText, trigger, triggeredBy]);
    return Number(r.rows[0].id);
  });
}

async function closeRun(runId, patch) {
  const cols = [];
  const vals = [];
  for (const [k, v] of Object.entries(patch)) {
    cols.push(`${k} = $${vals.length + 1}`);
    vals.push(v === undefined ? null : (k === 'summary' ? JSON.stringify(v) : v));
  }
  cols.push(`completed_at = now()`);
  vals.push(runId);
  await withTransaction(async (client) => {
    await client.query(`UPDATE od_sync_runs SET ${cols.join(', ')} WHERE id = $${vals.length}`, vals);
  });
}
export { openRun, closeRun };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function pickArray(v) {
  if (Array.isArray(v)) return v.filter(x => x !== null && x !== undefined).map(String);
  if (v === null || v === undefined) return [];
  return [String(v)];
}
function toTimestamp(s) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toISOString() : null;
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
