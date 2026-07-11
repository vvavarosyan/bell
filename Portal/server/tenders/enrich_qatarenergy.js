// Resumable QatarEnergy per-tender detail enrichment.
// ----------------------------------------------------------------------------
// The ASMX list methods give tender number / title / dates / bond / fee — but
// NOT the detail page's richer content. Each tender's ViewTenders.aspx page
// (the url column, captured at scan time) is SERVER-RENDERED plain HTML with a
// simple label/value table (verified live 2026-07-11 on both page types):
//
//   open:    Limited|General → ref · Bond · Tender Issue Period · Bid Closing
//            Date · Fee · Bond Validity · OfferValidity · Scope of Work/
//            Description (the full scope text Val saw on the source page)
//   awarded: Tender ID · PO Number · Tender Description · Awarded to · Price
//
// Plain fetch — no browser, no Crawl4AI. Every published row is captured
// VERBATIM into raw.fields (page order, blanks dropped — the same "As
// published" doctrine as Monaqasat); the scope text additionally lands in
// raw.description so the drawer's description block shows it. Rows are stamped
// raw.qe_detail_v so re-runs skip them — fully resumable, safe to interrupt.

import { query } from '../db.js';
import { packRaw } from './raw.js';

export const QE_DETAIL_V = 1;

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const CONCURRENCY = 4;          // plain fetch — light; still polite to the host

// ── pure parsing (exported for the tests) ───────────────────────────────────

function unescapeHtml(s) {
  return String(s || '')
    .replace(/&#x?([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, _.includes('x') || _.includes('X') ? 16 : 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

function cellText(htmlCell) {
  // Browsers collapse raw whitespace (incl. the source's own line wrapping)
  // to single spaces; only <br>/<p>/<div> boundaries are real line breaks.
  // Mark those with an escape-sequence sentinel so the collapse can't eat them.
  const BR = '\u0000';
  return unescapeHtml(
    String(htmlCell || '')
      .replace(/<br\s*\/?>/gi, BR)
      .replace(/<\/(p|div|tr)>/gi, BR)
      .replace(/<[^>]+>/g, ' '),
  )
    .split(BR).map((part) => part.replace(/\s+/g, ' ').trim()).join('\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/**
 * Parse a ViewTenders.aspx page's label/value table into verbatim fields,
 * in page order. Reads REAL <td> cells (<td><strong>Label:</strong></td>
 * <td>value</td>) — never scans forward from a label (the Monaqasat lesson).
 * Blank values are dropped: the source stated nothing, so Bell states nothing.
 */
export function qeDetailFields(html) {
  const out = [];
  const re = /<td>\s*<strong>([^<]+?):?\s*<\/strong>\s*<\/td>\s*<td>([\s\S]*?)<\/td>/g;
  let m;
  while ((m = re.exec(String(html || ''))) !== null) {
    const label = unescapeHtml(m[1]).trim();
    const value = cellText(m[2]);
    if (!label || !value) continue;
    out.push({ label: label.slice(0, 120), value: value.slice(0, 8000) });
  }
  return out;
}

/** The scope/description field, when the page has one. */
export function qeScopeOf(fields) {
  const f = (fields || []).find((x) => /scope of work|tender description/i.test(x.label));
  return f ? f.value : null;
}

// ── fetching ────────────────────────────────────────────────────────────────

async function fetchPage(url, timeoutMs = 20_000) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: ctl.signal });
      if (!res.ok) { if (attempt) return null; continue; }
      return await res.text();
    } catch {
      if (attempt) return null;
      await new Promise((r) => setTimeout(r, 800));
    } finally {
      clearTimeout(to);
    }
  }
  return null;
}

// jsonb_exists is TRUE for JSON null (CLAUDE.md §7) — compare the extracted
// text instead. Rows without a url can never be fetched — excluded, reported.
const PENDING = `source = 'qatarenergy' AND url IS NOT NULL
  AND COALESCE(NULLIF(raw->>'qe_detail_v', '')::int, 0) < ${QE_DETAIL_V}`;

export async function pendingQatarEnergyDetailCount() {
  const r = await query(`SELECT count(*)::int AS n FROM tenders WHERE ${PENDING}`);
  return r.rows[0].n;
}

/**
 * Enrich pending QatarEnergy tenders with their detail-page content.
 * Resumable; newest first so open tenders gain their scope immediately.
 */
export async function enrichQatarEnergyDetails({ limit = null, onProgress = null } = {}) {
  const progress = (m) => { try { onProgress?.(m); } catch { /* never break the run */ } };
  const rows = (await query(
    `SELECT id, url, deadline_at, raw FROM tenders WHERE ${PENDING}
      ORDER BY published_at DESC NULLS LAST, id DESC ${limit ? `LIMIT ${Number(limit)}` : ''}`,
  )).rows;
  let enriched = 0, failed = 0, done = 0;

  const workers = Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const row = rows.shift();
      if (!row) return;
      try {
        const html = await fetchPage(row.url);
        if (!html) { failed++; continue; }                    // stays pending — retried next run
        const fields = qeDetailFields(html);
        if (!fields.length) { failed++; continue; }           // page didn't render its table → retry later
        const work = { ...(row.raw || {}) };
        work.fields = fields;                                 // verbatim, page order
        const scope = qeScopeOf(fields);
        if (scope) work.description = scope;
        work.qe_detail_v = QE_DETAIL_V;
        const packed = packRaw(work);
        if (!packed) { failed++; continue; }                  // never write junk jsonb
        // Bid Closing Date fills deadline_at ONLY when the list API gave none
        // (DD/MM/YY, the source's own format — same date the list carries).
        let deadline = null;
        if (!row.deadline_at) {
          const f = fields.find((x) => /^bid closing date$/i.test(x.label));
          const m = f && f.value.match(/^(\d{2})\/(\d{2})\/(\d{2})$/);
          if (m) deadline = `20${m[3]}-${m[2]}-${m[1]}T00:00:00+03:00`;
        }
        await query(
          `UPDATE tenders SET raw = $2::jsonb, deadline_at = COALESCE($3, deadline_at), updated_at = now() WHERE id = $1`,
          [row.id, packed, deadline],
        );
        enriched++;
      } catch (err) {
        failed++;
        console.error('[qe-detail] tender', row.id, err.message);
      } finally {
        done++;
        if (done % 50 === 0) progress(`  ${done} detail pages fetched · ${enriched} enriched`);
        await new Promise((r) => setTimeout(r, 250));   // polite pacing per worker
      }
    }
  });
  await Promise.all(workers);
  return { enriched, failed };
}
