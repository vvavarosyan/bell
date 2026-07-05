// Tender ingestion (Signals v2 follow-up, Val-greenlit 2026-07-04).
//
// Upserts Qatar tender / award rows (from a scraper, a manual admin paste, or a
// future Firecrawl job) into the `tenders` table, idempotent by
// (source, source_ref), then fuzzy-links award recipients to Bell companies.
// The signals engine turns awarded, company-linked tenders into 'tender'
// signals — the strongest owned buyer-intent signal — which flow into the
// in-market score. See server/news/signals.js genTenderSignals.

import { query } from '../db.js';

const SOURCES = new Set(['monaqasat', 'ashghal', 'qatarenergy', 'kahramaa', 'qse', 'manual']);
const STATUSES = new Set(['open', 'awarded', 'cancelled']);

function clean(v, max = 500) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}
function num(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function ts(v) {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Upsert a batch of tender rows. Each row: { source, source_ref, title, buyer,
 * category, status, award_company_name, value_amount, currency, url,
 * published_at, deadline_at, awarded_at, raw }. Returns { inserted, updated, linked }.
 */
export async function ingestTenders(rows = []) {
  let inserted = 0, updated = 0;
  for (const r of Array.isArray(rows) ? rows : []) {
    const source = clean(r?.source, 40);
    const title = clean(r?.title, 400);
    if (!source || !SOURCES.has(source.toLowerCase()) || !title) continue;
    const status = STATUSES.has(String(r?.status || '').toLowerCase()) ? String(r.status).toLowerCase() : 'open';
    try {
      const res = await query(
        `INSERT INTO tenders (source, source_ref, title, buyer, category, status,
                              award_company_name, value_amount, currency, url,
                              published_at, deadline_at, awarded_at, raw)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,'QAR'),$10,$11,$12,$13,$14)
         ON CONFLICT (source, source_ref) DO UPDATE SET
           title = EXCLUDED.title, buyer = EXCLUDED.buyer, category = EXCLUDED.category,
           status = EXCLUDED.status,
           award_company_name = COALESCE(EXCLUDED.award_company_name, tenders.award_company_name),
           value_amount = COALESCE(EXCLUDED.value_amount, tenders.value_amount),
           url = EXCLUDED.url,
           deadline_at = COALESCE(EXCLUDED.deadline_at, tenders.deadline_at),
           awarded_at = COALESCE(EXCLUDED.awarded_at, tenders.awarded_at),
           -- MERGE raw (existing keys preserved) so a later card-only re-ingest
           -- never wipes detail the enricher already captured (activities,
           -- contact_email, contract_months). Idempotent + resumable-safe.
           raw = COALESCE(tenders.raw, '{}'::jsonb) || COALESCE(EXCLUDED.raw, '{}'::jsonb),
           updated_at = now()
         RETURNING (xmax = 0) AS is_insert`,
        [source.toLowerCase(), clean(r?.source_ref, 120), title, clean(r?.buyer, 200),
         clean(r?.category, 80), status, clean(r?.award_company_name, 200), num(r?.value_amount),
         clean(r?.currency, 8), clean(r?.url, 600), ts(r?.published_at), ts(r?.deadline_at),
         ts(r?.awarded_at), r?.raw ? JSON.stringify(r.raw).slice(0, 20000) : null]
      );
      if (res.rows[0] && res.rows[0].is_insert) inserted++; else updated++;
    } catch (err) {
      console.error('[tenders] upsert failed:', err.message);
    }
  }
  const linked = await linkTenderCompanies();
  return { inserted, updated, linked };
}

/**
 * Resolve awarded-vendor names to Bell company ids — conservative, normalized
 * exact match only (strip non-alphanumerics, case-insensitive). Only fills rows
 * that don't already have a company id. Returns the count newly linked.
 */
export async function linkTenderCompanies() {
  const r = await query(`
    UPDATE tenders t SET award_company_id = c.id, updated_at = now()
      FROM companies c
     WHERE t.award_company_id IS NULL
       AND t.award_company_name IS NOT NULL
       AND length(regexp_replace(lower(t.award_company_name), '[^a-z0-9]', '', 'g')) >= 4
       AND regexp_replace(lower(t.award_company_name), '[^a-z0-9]', '', 'g')
         = regexp_replace(lower(c.name), '[^a-z0-9]', '', 'g')`);
  return r.rowCount || 0;
}
