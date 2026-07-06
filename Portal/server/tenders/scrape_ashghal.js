// Ashghal (Public Works Authority) tender scraper — ashghal.gov.qa.
// A SEPARATE portal from Monaqasat (though PWA tenders also flow through
// Monaqasat, so some overlap). Ashghal's own value: its e-Tenders + General
// tender lists (Open / Closed), and — on the Awarded page — the WINNING
// contractor + all bidders + prices (which Monaqasat hides). Sections are added
// one at a time (Val 2026-07-06): LIST pages first (this file), then the
// awarded-winner + prospected + pre-qualification pages.
//
// The list pages are clean 6-column HTML tables:
//   Tender No. | Type | Tender Title | Issuing Date | Closing Date | Category
// served at ?Status= URLs. We parse each row cell-by-cell straight from the
// table HTML (no index/text-split pairing — the Monaqasat bug's lesson).
// Verified live 2026-07-06: 35/35 open e-Tenders parsed correctly.
//
// STAGE-2 TODO (fresh session): per-tender detail (behind token URLs), the
// Awarded winner/bidder tables (DisplayofAwarding.aspx), Prospected (upcoming,
// by quarter) and Pre-Qualifications / EOIs.

import { render } from './scrape_monaqasat.js';

const BASE = 'https://www.ashghal.gov.qa';
const BUYER = 'Public Works Authority (Ashghal)';

function htmlToText(h) {
  return String(h || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
}

// Ashghal dates read "06 July 2026".
const MONTHS = { january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12 };
function parseDate(s) {
  const m = String(s || '').match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (!m) return null;
  const mo = MONTHS[m[2].toLowerCase()];
  if (!mo) return null;
  const d = new Date(Date.UTC(Number(m[3]), mo - 1, Number(m[1])));
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Parse an Ashghal list page's HTML into tender rows. Each data row is a <tr>
 * with 6 <td> cells in fixed order; we read the cells directly, so a row's
 * fields can never drift onto another tender.
 */
export function parseAshghalList(html, status) {
  const rows = [];
  const seen = new Set();
  const trBlocks = String(html || '').split(/<tr[\s>]/i).slice(1);
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
      url: `${BASE}/en/Tenders/pages/erptenders.aspx`,
      raw: { type, category, issuing_date: cells[3], closing_date: cells[4], section: 'list' },
    });
  }
  return rows;
}

// Confirmed section/status list URLs (from the live tab links). Each renders the
// same 6-column table. Archived variants are attempted and simply skipped if the
// page yields nothing.
const PAGES = [
  ['open',   '/en/Tenders/pages/ERPTenderDetailes.aspx?Status=Open'],
  ['closed', '/en/Tenders/pages/ERPTenderDetailes.aspx?Status=Closed'],
  ['closed', '/en/Tenders/pages/ERPTenderDetailes.aspx?Status=Archived'],
  ['open',   '/en/Tenders/pages/DetailedTenderListPage.aspx?Status=Opened'],
  ['closed', '/en/Tenders/pages/DetailedTenderListPage.aspx?Status=Closed'],
  ['closed', '/en/Tenders/pages/DetailedTenderListPage.aspx?Status=Archived'],
];

/** Scrape Ashghal's e-Tenders + General list pages. Dedup by tender number. */
export async function scrapeAshghal(_opts = {}) {
  const all = [];
  const seen = new Set();
  for (const [status, path] of PAGES) {
    const page = await render(`${BASE}${path}`).catch(() => null);
    if (!page || !page.html) continue;
    for (const r of parseAshghalList(page.html, status)) {
      if (seen.has(r.source_ref)) continue;   // first occurrence wins (open before closed)
      seen.add(r.source_ref);
      all.push(r);
    }
  }
  return all;
}
