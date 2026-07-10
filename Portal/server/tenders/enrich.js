// Resumable tender detail enrichment (Val chose the one-pass full archive,
// 2026-07-05). Reads tenders that have a detail id but no activities yet, opens
// each detail page (through the concurrency pool), and writes the parsed detail
// back to the row. Because it selects "pending" straight from the DB every run,
// it is fully resumable — stop it any time and re-run; it skips what's done.
//
// Used by "Backfill Full Tender Archive.command" (all pending, one pass) and,
// with a small `limit`, by the recurring scan to top up fresh rows.

import { query } from '../db.js';
import { render, BASE, mapPool, parseDetailInto, DETAIL_V } from './scrape_monaqasat.js';
import { packRaw } from './raw.js';
import { tenderIndustries } from './match.js';

// ⚠ A tender only has a USABLE detail page when raw.detail_id is a real string.
// The card parser deliberately writes `detail_id: null` when no anchor's title
// matches the card (it never guesses a link — that's what caused the 2026-07-06
// mispairing bug). But `jsonb_exists(raw,'detail_id')` is TRUE for a JSON null:
// the KEY exists, the VALUE is null. So those rows were selected as "pending",
// instantly skipped in JS (`if (!detailId) return`), and re-selected on every
// run — 1,774 tenders looping forever, reported as "0 detailed in 0m"
// (found 2026-07-09). Require a non-empty STRING everywhere instead.
const HAS_DETAIL_ID = `jsonb_typeof(raw -> 'detail_id') = 'string' AND btrim(raw ->> 'detail_id') <> ''`;
// Re-fetch anything captured by an older detail parser. DETAIL_V is the single
// source of truth (scrape_monaqasat.js) — bumping it there re-checks the archive
// once, newest-first + resumable. Never hardcode the version here.
export const NEEDS_DETAIL = `(NOT jsonb_exists(raw, 'activities') OR COALESCE(NULLIF(raw->>'detail_v', '')::int, 1) < ${DETAIL_V})`;

/** How many tenders still need detail (have a REAL detail_id, no activities yet). */
export async function pendingDetailCount(source = 'monaqasat') {
  const r = await query(
    `SELECT count(*)::int AS n FROM tenders
      WHERE source = $1 AND ${HAS_DETAIL_ID} AND ${NEEDS_DETAIL}`,
    [source],
  );
  return r.rows[0].n;
}

/** Tenders whose card never linked to a detail page (detail_id is null). */
export async function unlinkedDetailCount(source = 'monaqasat') {
  const r = await query(
    `SELECT count(*)::int AS n FROM tenders
      WHERE source = $1 AND NOT (${HAS_DETAIL_ID})`, [source]);
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
    `SELECT id, status, raw, deadline_at, title, category
       FROM tenders
      WHERE source = $1 AND ${HAS_DETAIL_ID} AND ${NEEDS_DETAIL}
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
      // `contract_days` asserted a unit the source never states (see
      // parseDetailInto). Drop the stale field so a re-parsed row carries only
      // the verbatim `contract_duration`; if this page doesn't state a duration
      // at all, the tender honestly has none.
      delete work.raw.contract_days;
      // The pre-v4 regex stamped entity_ref with the literal header "Request"
      // on every enriched tender. parseDetailInto only sets entity_ref when the
      // page states a real one, so on pages without one the junk would survive
      // this merge forever — drop it; a real value gets re-written below.
      if (work.raw.entity_ref === 'Request') delete work.raw.entity_ref;
      // Pass the HTML: the detail fields come from real <td> cells, because a
      // rendered Subject cell can contain newlines and break text pairing.
      parseDetailInto(work, page.text, page.html);
      if (work.raw.activities) {
        // Activity codes just landed → this is the AUTHORITATIVE moment to
        // (re)compute the tender's line(s) of business (migration 078).
        const m = tenderIndustries({ title: row.title, category: row.category, raw: work.raw });
        const packed = packRaw(work.raw);
        if (!packed) { failed++; return; }   // too big even trimmed → stays pending
        await q(
          `UPDATE tenders SET raw = $2::jsonb, deadline_at = COALESCE($3, deadline_at),
                  industries = $4::text[], primary_industry = $5, updated_at = now()
            WHERE id = $1`,
          [row.id, packed, work.deadline_at, m.tags.length ? m.tags : null, m.primary],
        );
        enriched++;
      } else if (page.text.length > 1500 && /Tender number/i.test(page.text)) {
        // The page TRULY rendered (has the tender header + real length) but this
        // tender genuinely lists no activity codes — older tenders use a leaner
        // detail format. Stamp [] so we don't keep re-fetching it.
        //
        // ⚠️ This branch used to write ONLY {activities:[], detail_v} and threw
        // away everything else the page did give us — closing date, contact
        // email, contract duration, description — for ~14k no-code tenders.
        // Persist the parsed row instead; parseDetailInto already stamped the
        // current detail_v on work.raw.
        work.raw.activities = [];
        const packed = packRaw(work.raw);
        if (!packed) { failed++; return; }
        await q(
          `UPDATE tenders SET raw = $2::jsonb, deadline_at = COALESCE($3, deadline_at), updated_at = now()
            WHERE id = $1`,
          [row.id, packed, work.deadline_at],
        );
        failed++;   // counter means "no activity codes", not "nothing captured"
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
