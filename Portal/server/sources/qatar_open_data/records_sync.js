// Records sync — fetch full records for datasets that have changed since our
// last successful sync. Uses /exports/json which returns the entire dataset
// in one HTTP call (no pagination cap on Opendatasoft's side).
//
// Strategy:
//   1. List candidate datasets — where source_modified_at > our_last_record_sync_at
//      OR our_last_record_sync_at IS NULL (never synced).
//   2. For each: download /exports/json, wipe existing od_records for this
//      dataset, batch-insert the new records.
//   3. Update od_datasets counters + sync timestamps.
//   4. Audit each per-dataset run in od_sync_runs.

import { query, withTransaction } from '../../db.js';
import { exportDatasetAsJson } from './client.js';
import { openRun, closeRun } from './catalog_sync.js';

const BATCH_SIZE = 500;            // rows per INSERT
const POLITE_DELAY_MS = 250;       // between datasets

/**
 * Find datasets that need syncing and process them sequentially.
 * Pass datasetIds to force-sync a specific list (manual refresh).
 */
export async function syncChangedRecords({
  trigger = 'auto',
  triggeredBy = null,
  signal,
  datasetIds = null,                 // optional list of dataset_id (text)
  maxDatasets = null,                // safety cap
  jobLog = null,                     // optional (msg) callback
} = {}) {
  const candidates = await loadCandidates(datasetIds);
  jobLog?.(`Candidates: ${candidates.length}`);
  const limit = maxDatasets ? Math.min(maxDatasets, candidates.length) : candidates.length;
  const out = {
    attempted:    0,
    completed:    0,
    failed:       0,
    no_data:      0,
    total_new:    0,
    total_bytes:  0,
    per_dataset:  [],
  };

  for (let i = 0; i < limit; i++) {
    if (signal?.aborted) break;
    const ds = candidates[i];
    out.attempted++;
    jobLog?.(`[${i + 1}/${limit}] ${ds.dataset_id} — ${ds.title}`);
    try {
      const result = await syncOneDataset(ds, { trigger, triggeredBy, signal });
      if (result.status === 'completed') out.completed++;
      else if (result.status === 'no_data') out.no_data++;
      out.total_new   += result.new_records || 0;
      out.total_bytes += result.bytes_downloaded || 0;
      out.per_dataset.push({ dataset_id: ds.dataset_id, ...result });
    } catch (err) {
      out.failed++;
      out.per_dataset.push({ dataset_id: ds.dataset_id, status: 'failed', error: err.message });
      jobLog?.(`  ✗ ${err.message}`);
    }
    if (i < limit - 1) await sleep(POLITE_DELAY_MS);
  }
  return out;
}

// ---------------------------------------------------------------------------
// One dataset
// ---------------------------------------------------------------------------
async function syncOneDataset(ds, { trigger, triggeredBy, signal }) {
  const runId = await openRun({
    kind: 'records',
    trigger, triggeredBy,
    datasetIdFk: ds.id, datasetIdText: ds.dataset_id,
  });
  const t0 = Date.now();
  let bytes = 0;
  let inserted = 0;

  try {
    // Mark dataset as running so the UI can show it
    await query(`UPDATE od_datasets SET our_record_sync_status='running' WHERE id=$1`, [ds.id]);

    const { records, bytes: b } = await exportDatasetAsJson(ds.dataset_id, { signal });
    bytes = b;

    if (!records || records.length === 0) {
      // Empty dataset — preserve the row but mark as no_data
      await query(`
        UPDATE od_datasets
           SET our_record_sync_status='no_data',
               our_record_sync_error=NULL,
               our_last_record_sync_at=now(),
               our_last_record_count=0
         WHERE id=$1
      `, [ds.id]);
      await closeRun(runId, {
        status: 'no_data',
        bytes_downloaded: bytes,
        api_calls: 1,
        summary: { ms: Date.now() - t0 },
      });
      return { status: 'no_data', new_records: 0, bytes_downloaded: bytes };
    }

    // Wipe + insert atomically per dataset
    await withTransaction(async (client) => {
      await client.query(`DELETE FROM od_records WHERE dataset_id_fk = $1`, [ds.id]);
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        if (signal?.aborted) throw new Error('aborted');
        const slice = records.slice(i, i + BATCH_SIZE);
        await batchInsert(client, ds.id, slice);
        inserted += slice.length;
      }
      await client.query(`
        UPDATE od_datasets
           SET our_record_sync_status='done',
               our_record_sync_error=NULL,
               our_last_record_sync_at=now(),
               our_last_record_count=$2
         WHERE id=$1
      `, [ds.id, inserted]);
    });

    await closeRun(runId, {
      status: 'completed',
      new_records: inserted,
      bytes_downloaded: bytes,
      api_calls: 1,
      summary: { ms: Date.now() - t0 },
    });
    return { status: 'completed', new_records: inserted, bytes_downloaded: bytes };
  } catch (err) {
    const msg = String(err.message || err).slice(0, 2000);
    await query(`
      UPDATE od_datasets
         SET our_record_sync_status='failed',
             our_record_sync_error=$2
       WHERE id=$1
    `, [ds.id, msg]);
    await closeRun(runId, {
      status: 'failed',
      bytes_downloaded: bytes,
      api_calls: 1,
      error_message: msg,
      new_records: inserted,
      summary: { ms: Date.now() - t0 },
    }).catch(() => {});
    throw err;
  }
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------
async function loadCandidates(datasetIds) {
  if (Array.isArray(datasetIds) && datasetIds.length > 0) {
    const r = await query(`
      SELECT id, dataset_id, title, source_modified_at, our_last_record_sync_at
        FROM od_datasets
       WHERE dataset_id = ANY($1) AND NOT archived
       ORDER BY source_modified_at DESC NULLS LAST
    `, [datasetIds]);
    return r.rows;
  }
  // Auto: anything that's never been synced, OR whose source_modified_at is
  // newer than our_last_record_sync_at.
  const r = await query(`
    SELECT id, dataset_id, title, source_modified_at, our_last_record_sync_at
      FROM od_datasets
     WHERE NOT archived
       AND ( our_last_record_sync_at IS NULL
          OR source_modified_at IS NULL
          OR source_modified_at > our_last_record_sync_at )
     ORDER BY (our_last_record_sync_at IS NULL) DESC,
              source_modified_at DESC NULLS LAST
  `);
  return r.rows;
}

async function batchInsert(client, datasetIdFk, slice) {
  // Build a multi-row VALUES expression. record_id is best-effort: try
  // common id fields the agent may have surfaced.
  const cols = ['dataset_id_fk', 'record_id', 'data'];
  const placeholders = [];
  const params = [];
  let p = 1;
  for (const rec of slice) {
    placeholders.push(`($${p++}, $${p++}, $${p++}::jsonb)`);
    params.push(datasetIdFk);
    params.push(pickRecordId(rec));
    params.push(JSON.stringify(rec));
  }
  await client.query(
    `INSERT INTO od_records (${cols.join(',')}) VALUES ${placeholders.join(',')}`,
    params
  );
}

function pickRecordId(rec) {
  // Opendatasoft sometimes nests under .fields, sometimes returns flat. The
  // record id might be 'recordid', 'id', 'record_id', or a domain field
  // like 'ogc_fid'. Best-effort.
  if (!rec || typeof rec !== 'object') return null;
  const flat = rec.fields && typeof rec.fields === 'object' ? rec.fields : rec;
  for (const k of ['recordid','record_id','id','ogc_fid','uid','uuid']) {
    if (flat[k] !== undefined && flat[k] !== null) return String(flat[k]).slice(0, 200);
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
