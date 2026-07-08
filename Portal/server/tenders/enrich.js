// Resumable tender detail enrichment (Val chose the one-pass full archive,
// 2026-07-05). Reads tenders that have a detail id but no activities yet, opens
// each detail page (through the concurrency pool), and writes the parsed detail
// back to the row. Because it selects "pending" straight from the DB every run,
// it is fully resumable — stop it any time and re-run; it skips what's done.
//
// Used by "Backfill Full Tender Archive.command" (all pending, one pass) and,
// with a small `limit`, by the recurring scan to top up fresh rows.

import { query } from '../db.js';
import { render, BASE, mapPool, parseDetailInto } from './scrape_monaqasat.js';

/** How many tenders still need detail (have a detail_id, no activities yet). */
export async function pendingDetailCount(source = 'monaqasat') {
  const r = await query(
    `SELECT count(*)::int AS n FROM tenders
      WHERE source = $1 AND jsonb_exists(raw, 'detail_id')
        AND (NOT jsonb_exists(raw, 'activities') OR COALESCE(NULLIF(raw->>'detail_v', '')::int, 1) < 2)`,
    [source],
  );
  return r.rows[0].n;
}

/**
 * Enrich pending tenders. Options:
 *   source       — which source's tenders (default monaqasat)
 *   concurrency  — parallel detail fetches (default from scraper env, ~6)
 *   limit        — cap this run (null = all pending; the recurring scan passes a
 *                  small number so it never accidentally runs the 23k backfill)
 *   onProgress   — ({ done, total, enriched, failed }) callback every 25 rows
 * Returns { candidates, enriched, failed, remaining }.
 */
export async function enrichPendingTenders({ source = 'monaqasat', concurrency, limit = null, onProgress = null } = {}) {
  const params = [source];
  let limSql = '';
  if (limit != null && Number.isFinite(Number(limit))) { params.push(Number(limit)); limSql = `LIMIT $${params.length}`; }
  const r = await query(
    `SELECT id, status, raw, deadline_at
       FROM tenders
      WHERE source = $1 AND jsonb_exists(raw, 'detail_id')
        AND (NOT jsonb_exists(raw, 'activities') OR COALESCE(NULLIF(raw->>'detail_v', '')::int, 1) < 2)
      ORDER BY COALESCE(awarded_at, published_at, created_at) DESC NULLS LAST
      ${limSql}`,
    params,
  );
  const rows = r.rows;
  let enriched = 0, failed = 0, done = 0;

  // Retry a write a couple of times — the 16h backfill on 2026-07-05 hit a few
  // "connection terminated" timeouts under sustained load; a short backoff
  // recovers them instead of losing the row's detail.
  const q = async (sql, ps) => {
    for (let i = 0; ; i++) {
      try { return await query(sql, ps); }
      catch (e) { if (i >= 2) throw e; await new Promise((res) => setTimeout(res, 800)); }
    }
  };

  await mapPool(rows, async (row) => {
    const detailId = row.raw && row.raw.detail_id;
    try {
      if (!detailId) { failed++; return; }
      const page = await render(`${BASE}/TendersOnlineServices/TenderDetails/${detailId}`, 15_000);
      if (!page || !page.text) { failed++; return; }   // render failed → stays pending, retried next run
      const work = { raw: { ...(row.raw || {}) }, deadline_at: row.deadline_at };
      parseDetailInto(work, page.text);
      if (work.raw.activities) {
        await q(
          `UPDATE tenders SET raw = $2::jsonb, deadline_at = COALESCE($3, deadline_at), updated_at = now() WHERE id = $1`,
          [row.id, JSON.stringify(work.raw).slice(0, 20000), work.deadline_at],
        );
        enriched++;
      } else if (page.text.length > 1500 && /Tender number/i.test(page.text)) {
        // The page TRULY rendered (has the tender header + real length) but this
        // tender genuinely lists no activity codes — older tenders use a leaner
        // detail format. Stamp [] so we don't keep re-fetching it.
        await q(`UPDATE tenders SET raw = jsonb_set(jsonb_set(raw, '{activities}', '[]'::jsonb), '{detail_v}', '2'::jsonb), updated_at = now() WHERE id = $1`, [row.id]);
        failed++;
      } else {
        // Suspiciously thin page → likely a partial render. Leave it PENDING so a
        // re-run retries it, rather than marking it permanently empty.
        failed++;
      }
    } catch {
      failed++;
    } finally {
      done++;
      if (onProgress && done % 25 === 0) onProgress({ done, total: rows.length, enriched, failed });
    }
  }, concurrency);

  const remaining = await pendingDetailCount(source);
  return { candidates: rows.length, enriched, failed, remaining };
}
