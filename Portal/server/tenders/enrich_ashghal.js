// Resumable Ashghal per-tender detail enrichment.
// ----------------------------------------------------------------------------
// The Ashghal list pages already give tender no / type / title / dates /
// category. The per-tender detail page (ERPTenderDetailes.aspx?...&TenderID=int,
// a plain GET whose URL we captured into raw.detail_url during the list scrape)
// adds: Tender Bond, Document Fees, a fuller Category, the Project ID, and a real
// description ("TENDER DETAILS" text). We fetch each detail page, parse it, and
// merge those fields into raw — marking raw.detail_fetched=true so re-runs skip
// it. Fully resumable: it reads "pending" straight from the DB each run.
//
// Ashghal has NO Monaqasat-style numeric activity codes; it classifies by
// Category (ICT / Building / Roads / Drainage), which we already have.
//
// Scope defaults to OPEN tenders (the actionable set) so a routine scan stays
// cheap; pass scope:'all' to also fill closed/archived detail (thousands of
// pages — opt-in, resumable).

import { query } from '../db.js';
import { render, mapPool, ramSafeConcurrency } from './scrape_monaqasat.js';
import { packRaw } from './raw.js';

const CONCURRENCY_DEFAULT = ramSafeConcurrency(process.env.BELL_ASHGHAL_CONCURRENCY);

/**
 * Parse an Ashghal tender detail page's flattened text (render().text) into the
 * extra detail fields. Text-based on purpose — the page lays its label/value
 * pairs out linearly, which is more robust than scraping the div structure.
 * Verified live 2026-07-06.
 */
export function parseAshghalDetailText(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const grab = (startRx, endRx) => {
    const m = t.match(startRx);
    if (!m) return null;
    const s = t.slice(m.index + m[0].length);
    const e = s.match(endRx);
    const v = (e ? s.slice(0, e.index) : s).trim();
    return v || null;
  };
  const bond = grab(/Tender Bond\s+/i, /\s+Tender Category|\s+Issuing Date/i);
  const category = grab(/Tender Category\s+/i, /\s+Issuing Date/i);
  const fees = grab(/Document Fees\s+/i, /\s+Tender Details|\s+NOTES/i);
  const desc = grab(/TENDER DETAILS:\s*/i, /\s*DOCUMENT FEES|\s*NOTES:/i);
  const projId = (desc && desc.match(/PROJECT ID:\s*([A-Z0-9][A-Z0-9 \-\/]*?)(?:\s+Due\b|\s{2,}|$)/i) || [])[1] || null;
  return {
    tender_bond: bond && bond.length < 40 ? bond : null,
    category: category && category !== '-' ? category.slice(0, 60) : null,
    document_fees: fees && fees.length < 40 ? fees : null,
    project_id: projId ? projId.trim().slice(0, 60) : null,
    description: desc ? desc.slice(0, 1500) : null,
  };
}

// Rows that have a real (positive) TenderID and haven't been detail-fetched yet.
// scope 'open' (default) restricts to actionable open tenders; 'all' includes
// closed + archived.
function pendingWhere(scope) {
  const statusFilter = scope === 'all' ? '' : `AND status = 'open'`;
  return `source = 'ashghal'
      AND COALESCE(NULLIF(raw->>'tender_id','')::bigint, 0) > 0
      AND NOT COALESCE((raw->>'detail_fetched')::boolean, false)
      ${statusFilter}`;
}

/** How many Ashghal tenders still need detail. */
export async function pendingAshghalDetailCount({ scope = 'open' } = {}) {
  const r = await query(`SELECT count(*)::int AS n FROM tenders WHERE ${pendingWhere(scope)}`);
  return r.rows[0].n;
}

/**
 * Enrich pending Ashghal tenders with per-tender detail. Options: scope
 * ('open'|'all'), concurrency, limit (cap this run), onProgress callback.
 * Returns { candidates, enriched, failed, remaining }.
 */
export async function enrichAshghalDetails({ scope = 'open', concurrency = CONCURRENCY_DEFAULT, limit = null, onProgress = null } = {}) {
  const params = [];
  let limSql = '';
  if (limit != null && Number.isFinite(Number(limit))) { params.push(Number(limit)); limSql = `LIMIT $${params.length}`; }
  const r = await query(
    `SELECT id, category, raw
       FROM tenders
      WHERE ${pendingWhere(scope)}
      ORDER BY COALESCE(published_at, created_at) DESC NULLS LAST
      ${limSql}`,
    params,
  );
  const rows = r.rows;
  let enriched = 0, failed = 0, done = 0;

  const q = async (sql, ps) => {
    for (let i = 0; ; i++) {
      try { return await query(sql, ps); }
      catch (e) { if (i >= 2) throw e; await new Promise((res) => setTimeout(res, 800)); }
    }
  };

  await mapPool(rows, async (row) => {
    const url = row.raw && row.raw.detail_url;
    try {
      if (!url) { failed++; return; }
      const page = await render(url, 15_000);
      if (!page || !page.text) { failed++; return; }                 // render failed → stays pending
      if (!/Tender\s+(Number|Bond|Details)/i.test(page.text)) { failed++; return; } // partial render guard
      const d = parseAshghalDetailText(page.text);
      const newRaw = { ...(row.raw || {}), detail_fetched: true };
      if (d.tender_bond) newRaw.tender_bond = d.tender_bond;
      if (d.document_fees) newRaw.document_fees = d.document_fees;
      if (d.project_id) newRaw.project_id = d.project_id;
      if (d.description) newRaw.description = d.description;
      const cat = (!row.category && d.category) ? d.category : row.category;
      const packed = packRaw(newRaw);            // never slice serialized JSON
      if (!packed) { failed++; return; }         // leave the row for a later run
      await q(
        `UPDATE tenders SET raw = $2::jsonb, category = COALESCE($3, category), updated_at = now() WHERE id = $1`,
        [row.id, packed, cat],
      );
      enriched++;
    } catch {
      failed++;
    } finally {
      done++;
      if (onProgress && done % 25 === 0) onProgress({ done, total: rows.length, enriched, failed });
    }
  }, concurrency);

  const remaining = await pendingAshghalDetailCount({ scope });
  return { candidates: rows.length, enriched, failed, remaining };
}
