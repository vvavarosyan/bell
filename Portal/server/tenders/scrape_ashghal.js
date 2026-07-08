// Ashghal (Public Works Authority) tender LIST scraper — ashghal.gov.qa.
// A SEPARATE portal from Monaqasat (though PWA tenders also flow through
// Monaqasat, so some overlap). This file covers the e-Tenders (GTC/STC) and
// General tender LIST pages across Open / Closed / Archived. The winner/bidder
// tables (the prize) live in scrape_ashghal_awarded.js; upcoming projects in
// scrape_ashghal_prospected.js; per-tender detail in enrich_ashghal.js.
//
// Every list is a clean 6-column HTML table:
//   Tender No. | Type | Tender Title | Issuing Date | Closing Date | Category
// and — verified live 2026-07-06 — paginates by a PLAIN GET query param
// `PageIndex` (NOT __doPostBack; an earlier `?Page=2` test failed only because
// the param is named PageIndex). We read the "Page X of N" label to learn the
// page count, then walk PageIndex=1..N. We parse each row cell-by-cell straight
// from the table HTML (no index/text-split pairing — the Monaqasat bug's lesson)
// and also lift each row's integer TenderID from its detail anchor so the detail
// enricher can open ERPTenderDetailes.aspx?...&TenderID=<int> later.
//
// Verified live counts 2026-07-06: e-Tenders Open ~35 · Closed 188 (18 pg) ·
// Archived 433 (43 pg); General Closed ~1,880 (188 pg) · Archived ~370 (37 pg,
// back to 2014). All GET + PageIndex, all the same 6-col table.

import { render, mapPool, ramSafeConcurrency } from './scrape_monaqasat.js';
import { scrapeAshghalAwarded } from './scrape_ashghal_awarded.js';
import { scrapeAshghalProspected } from './scrape_ashghal_prospected.js';

const BASE = 'https://www.ashghal.gov.qa';
const BUYER = 'Public Works Authority (Ashghal)';

// Every list surface, with the status we file it under. All use PageIndex.
const LISTS = [
  { status: 'open',     path: '/en/Tenders/pages/ERPTenderDetailes.aspx?Status=Open' },
  { status: 'closed',   path: '/en/Tenders/pages/ERPTenderDetailes.aspx?Status=Closed' },
  { status: 'archived', path: '/en/Tenders/pages/ERPTenderDetailes.aspx?Status=Archived' },
  { status: 'open',     path: '/en/Tenders/pages/DetailedTenderListPage.aspx?Status=Opened' },
  { status: 'closed',   path: '/en/Tenders/pages/DetailedTenderListPage.aspx?Status=Closed' },
  { status: 'archived', path: '/en/Tenders/pages/DetailedTenderListPage.aspx?Status=Archived' },
];

const PAGE_CAP = Math.min(Math.max(Number(process.env.BELL_ASHGHAL_MAX_PAGES) || 500, 1), 1000);
const LIST_CONCURRENCY = ramSafeConcurrency(process.env.BELL_ASHGHAL_CONCURRENCY);

function htmlToText(h) {
  return String(h || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
}

// Dates read "06 July 2026" (list) or "16 Jun 2026" (awarded) — match on the
// first three letters so one parser handles full and abbreviated month names.
const MONTHS3 = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function parseDate(s) {
  const m = String(s || '').match(/(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})/);
  if (!m) return null;
  const mo = MONTHS3[m[2].toLowerCase().slice(0, 3)];
  if (!mo) return null;
  const d = new Date(Date.UTC(Number(m[3]), mo - 1, Number(m[1])));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** Read the "Page X of N" label to learn how many pages a list has. */
export function maxPagesFromHtml(html) {
  const m = String(html || '').match(/Page\s+\d+\s+of\s+(\d+)/i);
  return m ? Math.min(Math.max(Number(m[1]), 1), PAGE_CAP) : 1;
}

/**
 * Parse an Ashghal list page's HTML into tender rows. Each data row is a <tr>
 * with 6 <td> cells in fixed order; we read the cells directly, so a row's
 * fields can never drift onto another tender. HTML comments are stripped first
 * (a commented-out <td> would otherwise shift the columns — the same drift class
 * as the Monaqasat mispairing). Each row's integer TenderID + absolute detail
 * URL are lifted from the tender-no anchor for later per-tender enrichment.
 */
export function parseAshghalList(html, status) {
  const rows = [];
  const seen = new Set();
  const clean = String(html || '').replace(/<!--[\s\S]*?-->/g, ' ');
  const trBlocks = clean.split(/<tr[\s>]/i).slice(1);
  for (const block of trBlocks) {
    const cells = [...block.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => htmlToText(m[1]));
    if (cells.length < 5) continue;
    const numM = (cells[0] || '').match(/(PWA\/[A-Za-z0-9][A-Za-z0-9\/\-]+)/i);
    if (!numM) continue;
    const source_ref = numM[1];
    if (seen.has(source_ref)) continue;
    seen.add(source_ref);
    const title = (cells[2] || '').trim();
    if (!title || title.length < 3) continue;
    const type = (cells[1] || '').trim().slice(0, 20);
    const category = (cells[5] || '').trim() || null;
    // Detail anchor → integer TenderID + absolute detail URL (for enrich_ashghal).
    const hrefM = block.match(/<a[^>]+href=["']([^"']*TenderID=\d+[^"']*)["']/i);
    const rawHref = hrefM ? hrefM[1].replace(/&amp;/gi, '&') : null;
    const detailUrl = rawHref ? (rawHref.startsWith('http') ? rawHref : BASE + (rawHref.startsWith('/') ? '' : '/') + rawHref) : null;
    const idM = rawHref ? rawHref.match(/TenderID=(\d+)/i) : null;
    rows.push({
      source: 'ashghal',
      source_ref,
      title: title.slice(0, 400),
      buyer: BUYER,
      category: (category || type || null),
      status,
      currency: 'QAR',
      published_at: parseDate(cells[3]),
      deadline_at: parseDate(cells[4]),
      url: detailUrl || `${BASE}/en/Tenders/pages/erptenders.aspx`,
      raw: {
        type, category, issuing_date: cells[3], closing_date: cells[4], section: 'list',
        tender_id: idM ? Number(idM[1]) : null,
        detail_url: detailUrl,
      },
    });
  }
  return rows;
}

async function fetchListHtml(url) {
  const page = await render(url).catch(() => null);
  return page && page.html ? page.html : null;
}

/**
 * Scrape every Ashghal list surface (e-Tenders + General, Open/Closed/Archived),
 * walking all PageIndex pages. Dedups by tender number (first occurrence wins:
 * open before closed before archived). Concurrency-limited page fetches.
 */
export async function scrapeAshghalLists({ concurrency = LIST_CONCURRENCY, maxPagesPerList = PAGE_CAP, onProgress } = {}) {
  const all = [];
  const seen = new Set();
  const add = (list) => {
    for (const r of list) {
      if (seen.has(r.source_ref)) continue;
      seen.add(r.source_ref);
      all.push(r);
    }
  };
  for (const { status, path } of LISTS) {
    const url0 = `${BASE}${path}`;
    const html0 = await fetchListHtml(url0);
    if (!html0) continue;
    add(parseAshghalList(html0, status));
    const maxPages = Math.min(maxPagesFromHtml(html0), maxPagesPerList);
    if (onProgress) onProgress({ status, path, page: 1, maxPages, total: all.length });
    if (maxPages <= 1) continue;
    const pageNums = [];
    for (let p = 2; p <= maxPages; p++) pageNums.push(p);
    const byPage = {};
    await mapPool(pageNums, async (p) => {
      const html = await fetchListHtml(`${url0}&PageIndex=${p}`);
      byPage[p] = html ? parseAshghalList(html, status) : [];
      if (onProgress) onProgress({ status, path, page: p, maxPages, total: all.length });
    }, concurrency);
    for (const p of pageNums) add(byPage[p] || []);
  }
  return all;
}

/**
 * Full Ashghal source scrape: LIST pages (open/closed/archived) + the AWARDED
 * winner/bidder tables + PROSPECTED upcoming projects, concatenated for
 * ingestTenders. Per-tender detail is a separate post-ingest, DB-driven step
 * (enrich_ashghal.js), run by the scan after ingest. Each section is isolated in
 * try/catch so one failing surface can't sink the others. `opts.sections` (array
 * of 'lists'|'awarded'|'prospected') narrows the run; default = all three.
 *
 * Order matters: lists first, then awarded — an awarded tender that also appears
 * in a closed list is upserted second, so its status becomes 'awarded' and its
 * winner/bidders merge onto the row (ingest MERGEs raw, COALESCEs derived cols).
 */
export async function scrapeAshghal(opts = {}) {
  const sections = Array.isArray(opts.sections) && opts.sections.length
    ? opts.sections : ['lists', 'awarded', 'prospected'];
  const rows = [];
  if (sections.includes('lists')) {
    try { rows.push(...await scrapeAshghalLists(opts)); }
    catch (e) { console.error('[ashghal] lists failed:', e.message); }
  }
  if (sections.includes('awarded')) {
    try { rows.push(...await scrapeAshghalAwarded(opts)); }
    catch (e) { console.error('[ashghal] awarded failed:', e.message); }
  }
  if (sections.includes('prospected')) {
    try { rows.push(...await scrapeAshghalProspected(opts)); }
    catch (e) { console.error('[ashghal] prospected failed:', e.message); }
  }
  return rows;
}

export { BASE, BUYER };
