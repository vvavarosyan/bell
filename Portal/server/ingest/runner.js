// Ingest runner — reads a source's latest JSON, normalizes via the source
// mapper, and upserts records into companies + company_sources in batches.
//
// Idempotent: re-running on the same JSON updates last_seen_at without
// creating duplicate companies. Multi-source dedup happens later (Phase 5
// Assembly) — at ingest we keep one company row per (source, source_record_id).

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query, withTransaction } from '../db.js';
import { MAPPERS } from './mappers.js';
import { recomputeCompanyStatus } from './recompute_status.js';
import { normalizeEmail, normalizePhone, isJunkEmail } from '../lib/contacts.js';

const __filename = fileURLToPath(import.meta.url);
const SERVER_DIR = path.dirname(path.dirname(__filename));
const WORKSPACE  = path.resolve(SERVER_DIR, '..', '..');
const DIR_ROOT   = path.join(WORKSPACE, 'Data', 'Companies', '1. Data Gathering', 'Directories');

const LATEST_FILE = {
  QFZ:  'QFZ/scans/qfz_companies_latest.json',
  QFC:  'QFC/scans/qfc_companies_latest.json',
  MOCI: 'MOCI/scans/moci_companies_latest.json',
  QSTP: 'QSTP/scans/qstp_companies_latest.json',
  QSE:  '../Other Sources/QSE/scans/qse_companies_latest.json',
  QCCI: '../Other Sources/Qatar Chamber/scans/qatarcid_companies_latest.json',
};

const BATCH_SIZE = 200;

/** Public entry: ingest the latest scrape for a single source. */
export async function ingestSource(source, jobProgress) {
  if (!MAPPERS[source]) throw new Error('Unknown source: ' + source);
  const file = path.join(DIR_ROOT, LATEST_FILE[source]);

  // Capture a DB-clock run-start BEFORE any upsert. Present rows get
  // last_seen_at = now() (after this), so afterwards we can tell which links
  // were NOT refreshed by this upload (last_seen_at < runStart → disappeared).
  const { rows: [{ now: runStart }] } = await query('SELECT now() AS now');

  jobProgress?.(`Reading ${LATEST_FILE[source]} ...`);
  const buf = await fs.readFile(file, 'utf-8');
  const json = JSON.parse(buf);

  // Each scraper bundles records under a 'companies' key (and QFC also has 'trusts')
  const rawRows = collectRows(source, json);
  jobProgress?.(`Parsed ${rawRows.length.toLocaleString()} raw rows`);

  // Map → normalized payload
  const mapper = MAPPERS[source];
  const normalized = [];
  for (const r of rawRows) {
    const mapped = mapper(r);
    if (mapped) normalized.push(mapped);
  }
  const dropped = rawRows.length - normalized.length;
  jobProgress?.(`Normalized: ${normalized.length.toLocaleString()} kept · ${dropped.toLocaleString()} dropped (missing key fields)`);

  // Batched upsert
  let inserted = 0, updated = 0;
  for (let i = 0; i < normalized.length; i += BATCH_SIZE) {
    const slice = normalized.slice(i, i + BATCH_SIZE);
    const result = await upsertBatch(source, slice);
    inserted += result.inserted;
    updated  += result.updated;
    if ((i / BATCH_SIZE) % 10 === 0 || i + BATCH_SIZE >= normalized.length) {
      jobProgress?.(`  ${(i + slice.length).toLocaleString()}/${normalized.length.toLocaleString()} — +${inserted} new, +${updated} updated`);
    }
  }

  // Reconcile companies that DISAPPEARED from this upload (present last time,
  // absent now). QFZ → auto-archive (if not active elsewhere); other sources →
  // flag for admin review, never auto-delete.
  jobProgress?.('Reconciling disappearances …');
  const recon = await reconcileDisappearances(source, runStart);
  jobProgress?.(`  Disappeared: ${recon.missing.toLocaleString()} · archived ${recon.archived} · flagged for review ${recon.flagged}`);

  // Remember when this source was last ingested (UI/debug).
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [`ingest_last_run_${source}`, JSON.stringify(runStart)],
  );

  return {
    source,
    raw_rows:   rawRows.length,
    dropped,
    normalized: normalized.length,
    inserted,
    updated,
    disappeared: recon.missing,
    archived:    recon.archived,
    flagged_for_review: recon.flagged,
  };
}

// After a source's upload is applied, find links of that source NOT refreshed by
// this run and act per policy:
//   • QFZ: the listing is gone → recompute (archives the company if no other
//     current source still lists it active). reason 'qfz_disappeared'.
//   • everything else: do NOT auto-archive/delete — set needs_review so the admin
//     decides per company (keep / archive / remove). Status quo is preserved.
async function reconcileDisappearances(source, runStart) {
  // 1. Mark which links are CURRENT for this source (present in this upload).
  await query(
    `UPDATE company_sources SET is_current = (last_seen_at >= $2) WHERE source = $1`,
    [source, runStart],
  );

  // 1b. A company that REAPPEARED in this source clears its prior review flag.
  await query(
    `UPDATE companies c
        SET needs_review = false, review_reason = NULL
      WHERE c.review_reason = $2
        AND EXISTS (
          SELECT 1 FROM company_sources cs
           WHERE cs.company_id = c.id AND cs.source = $1 AND cs.is_current = true
        )`,
    [source, 'disappeared_from_' + source],
  );

  // 2. Companies whose link to THIS source just went missing.
  const missing = await query(
    `SELECT DISTINCT company_id FROM company_sources WHERE source = $1 AND is_current = false`,
    [source],
  );

  let archived = 0, flagged = 0;
  for (const row of missing.rows) {
    const cid = row.company_id;
    if (source === 'QFZ') {
      const res = await recomputeCompanyStatus(cid);
      if (res && res.archived) archived++;
    } else {
      // Don't touch is_active/archived — just surface it to the admin. Skip rows
      // the admin has already taken ownership of (manual_status_override).
      const r = await query(
        `UPDATE companies
            SET needs_review = true, review_reason = $2
          WHERE id = $1 AND manual_status_override = false AND needs_review = false
          RETURNING id`,
        [cid, 'disappeared_from_' + source],
      );
      if (r.rows.length) flagged++;
    }
  }
  return { source, missing: missing.rows.length, archived, flagged };
}

function collectRows(source, json) {
  if (Array.isArray(json)) return json;
  // Concatenate without using `push(...arr)` — that blows the call stack on
  // very large arrays (e.g. MOCI ships 133k+ rows in one file).
  let rows = [];
  for (const key of ['companies', 'trusts', 'rows', 'data']) {
    if (Array.isArray(json[key])) rows = rows.concat(json[key]);
  }
  return rows;
}

async function upsertBatch(source, slice) {
  let inserted = 0, updated = 0;
  await withTransaction(async (client) => {
    for (const rec of slice) {
      const { source_record_id, source_url, companyFields, extraFields, rawPayload } = rec;

      // 1. Look up existing source link
      const existing = await client.query(
        `SELECT company_id FROM company_sources WHERE source = $1 AND source_record_id = $2`,
        [source, source_record_id]
      );

      let companyId;
      if (existing.rows.length === 0) {
        // Insert new company row
        const colNames = Object.keys(companyFields);
        const placeholders = colNames.map((_, i) => `$${i + 1}`);
        const sql = `
          INSERT INTO companies (${colNames.join(', ')}, extra_fields)
          VALUES (${placeholders.join(', ')}, $${colNames.length + 1}::jsonb)
          RETURNING id
        `;
        const params = colNames.map(k => companyFields[k]).concat([JSON.stringify(extraFields || {})]);
        const r = await client.query(sql, params);
        companyId = r.rows[0].id;
        inserted++;
      } else {
        // Update existing company row (only refresh non-null incoming fields,
        // so a later source doesn't blank out a richer earlier value).
        companyId = existing.rows[0].company_id;
        const nonNullFields = Object.entries(companyFields).filter(([, v]) => v !== null && v !== undefined);
        if (nonNullFields.length > 0) {
          const setParts = nonNullFields.map(([k], i) => `${k} = COALESCE($${i + 1}, ${k})`);
          const params   = nonNullFields.map(([, v]) => v);
          params.push(JSON.stringify(extraFields || {}));
          params.push(companyId);
          const sql = `
            UPDATE companies
            SET ${setParts.join(', ')},
                extra_fields = extra_fields || $${params.length - 1}::jsonb
            WHERE id = $${params.length}
          `;
          await client.query(sql, params);
        }
        updated++;
      }

      // 2. Upsert the company_sources link
      await client.query(
        `INSERT INTO company_sources (company_id, source, source_record_id, source_url, raw_payload, first_seen_at, last_seen_at)
         VALUES ($1, $2, $3, $4, $5::jsonb, now(), now())
         ON CONFLICT (source, source_record_id) DO UPDATE
           SET last_seen_at = now(),
               raw_payload  = EXCLUDED.raw_payload`,
        [companyId, source, source_record_id, source_url, JSON.stringify(rawPayload || {})]
      );

      // 2b. Mirror the directly-provided email + phone(s) into company_contacts.
      //     The companies.phone/email columns are NOT what the detail drawer's
      //     Contacts panel reads, nor what merges re-parent — company_contacts
      //     is. Writing here makes ingested numbers visible in the drawer and
      //     ensures every number survives a dedup merge (no data loss).
      const ccSource = source.toLowerCase() + '-ingest';
      const em = normalizeEmail(companyFields.email);
      if (em && !isJunkEmail(em)) {
        await client.query(
          `INSERT INTO company_contacts (company_id, type, value, value_display, source)
           VALUES ($1, 'email', $2, $3, $4) ON CONFLICT (company_id, type, value) DO NOTHING`,
          [companyId, em, String(companyFields.email), ccSource],
        );
      }
      // Collect phone + any source-specific mobile/fax numbers (e.g. qcci_mobile).
      const phoneRaws = [companyFields.phone];
      if (extraFields) for (const [k, v] of Object.entries(extraFields)) {
        if (/(mobile|fax|phone|telephone)$/i.test(k) && v) phoneRaws.push(v);
      }
      const seenPh = new Set();
      for (const raw of phoneRaws) {
        const ph = normalizePhone(raw);
        // Skip junk numbers with no real digit (e.g. "0", "00000000") so we
        // don't show a phone icon for a number that isn't really there.
        if (!ph || !/[1-9]/.test(ph) || seenPh.has(ph)) continue;
        seenPh.add(ph);
        await client.query(
          `INSERT INTO company_contacts (company_id, type, value, value_display, source)
           VALUES ($1, 'phone', $2, $3, $4) ON CONFLICT (company_id, type, value) DO NOTHING`,
          [companyId, ph, String(raw), ccSource],
        );
      }

      // 3. Recompute is_active across ALL sources (ANY active → active).
      // Means: a company expired in MOCI but still Licensed in QFC stays active.
      await recomputeCompanyStatus(companyId, client);
    }
  });
  return { inserted, updated };
}

/** Stat helper used by the Sources view */
export async function describeSourceLatestFile(source) {
  if (!LATEST_FILE[source]) return null;
  const file = path.join(DIR_ROOT, LATEST_FILE[source]);
  try {
    const stat = await fs.stat(file);
    return {
      path: file,
      relative_path: LATEST_FILE[source],
      size_bytes: stat.size,
      mtime: stat.mtime.toISOString(),
    };
  } catch {
    return null;
  }
}
