// Tender ingestion (Signals v2 follow-up, Val-greenlit 2026-07-04).
//
// Upserts Qatar tender / award rows (from a scraper, a manual admin paste, or a
// future Firecrawl job) into the `tenders` table, idempotent by
// (source, source_ref), then fuzzy-links award recipients to Bell companies.
// The signals engine turns awarded, company-linked tenders into 'tender'
// signals — the strongest owned buyer-intent signal — which flow into the
// in-market score. See server/news/signals.js genTenderSignals.

import { query } from '../db.js';
import { tenderIndustries } from './match.js';
import { packRaw } from './raw.js';
import { mergeCrossPostedTenders } from './merge_crossposted.js';

const SOURCES = new Set(['monaqasat', 'ashghal', 'qatarenergy', 'kahramaa', 'qse', 'manual']);
const STATUSES = new Set(['open', 'awarded', 'cancelled', 'closed', 'archived', 'prospected']);

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
    // Seed the industry match from whatever the card carries (activities are
    // usually absent at this point). ON CONFLICT keeps any RICHER set already
    // stored — the enricher recomputes once activity codes land, and
    // "Backfill Tender Industries.command" is the authoritative recompute.
    const m = tenderIndustries({ title, category: clean(r?.category, 80), raw: r?.raw || {} });
    try {
      const res = await query(
        `INSERT INTO tenders (source, source_ref, title, buyer, category, status,
                              award_company_name, value_amount, currency, url,
                              published_at, deadline_at, awarded_at, raw,
                              industries, primary_industry)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,COALESCE($9,'QAR'),$10,$11,$12,$13,$14,$15::text[],$16)
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
           -- Same preserve-the-richer rule for the industry match: a card-only
           -- re-ingest (title/category only) must never clobber an activity-code
           -- derived match.
           industries = COALESCE(tenders.industries, EXCLUDED.industries),
           primary_industry = COALESCE(tenders.primary_industry, EXCLUDED.primary_industry),
           updated_at = now()
         RETURNING (xmax = 0) AS is_insert`,
        [source.toLowerCase(), clean(r?.source_ref, 120), title, clean(r?.buyer, 200),
         clean(r?.category, 80), status, clean(r?.award_company_name, 200), num(r?.value_amount),
         clean(r?.currency, 8), clean(r?.url, 600), ts(r?.published_at), ts(r?.deadline_at),
         ts(r?.awarded_at), r?.raw ? packRaw(r.raw) : null,   // never slice serialized JSON
         m.tags.length ? m.tags : null, m.primary]
      );
      if (res.rows[0] && res.rows[0].is_insert) inserted++; else updated++;
    } catch (err) {
      console.error('[tenders] upsert failed:', err.message);
    }
  }
  // CR first (the registry's own number), then the name pass fills what CRs cannot.
  const linkedByCr = await linkAwardWinnersByCr().catch((err) => { console.error('[tenders] cr-link:', err.message); return 0; });
  const linked = (await linkTenderCompanies()) + linkedByCr;
  // Cross-posted Kahramaa↔Monaqasat tenders collapse into ONE row naming both
  // sources (Val 2026-07-12) — runs after every batch so re-scans re-merge.
  await mergeCrossPostedTenders().catch((err) => console.error('[tenders] merge:', err.message));
  return { inserted, updated, linked };
}

/**
 * Link award winners by their STATED CR number — the registry's own identifier, printed on the
 * buyer's own award page. Strictly stronger evidence than the name match below, so it runs
 * FIRST and the name pass only fills what CRs cannot. Found 2026-08-17: 3,807 awarded tenders
 * carried winner CRs and no link at all, and the name pass had linked tender 34778 to a
 * registration-less near-namesake while the stated CR named the real registry company.
 *
 * Guards: base form ≥4 chars (matchBidCrs rule); live, canonical companies only; registry
 * bodies outrank harvest rows; a winner whose CRs resolve to MORE THAN ONE distinct company is
 * REFUSED, not guessed (the employer-matcher rule — ambiguity refuses rather than picks).
 * Only fills NULLs — re-pointing an existing link is a different, reviewed operation.
 */
export async function linkAwardWinnersByCr() {
  const r = await query(`
    WITH winners AS (
      SELECT t.id AS tender_id, ltrim(split_part(reg.val, '/', 1), '0') AS base
        FROM tenders t,
             LATERAL jsonb_array_elements_text(t.raw->'award_report'->'winner'->'registrations') reg(val)
       WHERE t.award_company_id IS NULL
         AND length(ltrim(split_part(reg.val, '/', 1), '0')) >= 4),
    resolved AS (
      SELECT w.tender_id,
             (SELECT c.id FROM company_registrations r
                JOIN companies c ON c.id = r.company_id
               WHERE COALESCE(c.archived, false) = false AND c.canonical_id IS NULL
                 AND ltrim(split_part(r.number, '/', 1), '0') = w.base
               ORDER BY (r.body IN ('MOCI','QCCI','company_record','CRA')) DESC, c.id
               LIMIT 1) AS company_id
        FROM (SELECT DISTINCT tender_id, base FROM winners) w),
    unambiguous AS (
      SELECT tender_id, min(company_id) AS company_id
        FROM resolved
       WHERE company_id IS NOT NULL
       GROUP BY tender_id
      HAVING count(DISTINCT company_id) = 1)
    UPDATE tenders t
       SET award_company_id = u.company_id, updated_at = now()
      FROM unambiguous u
     WHERE t.id = u.tender_id`);
  return r.rowCount || 0;
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
