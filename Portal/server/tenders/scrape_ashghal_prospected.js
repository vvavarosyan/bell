// Ashghal PROSPECTED projects scraper — "List of Projects to be launched".
// ----------------------------------------------------------------------------
// A UNIQUE, forward-looking surface (Monaqasat has nothing like it): the
// upcoming projects Ashghal intends to tender, organised by quarter. Each row is
// just #, Project Title, Department (Projects Affairs / External Entities /
// Assets Affairs) — no tender number or dates yet, since these aren't tendered.
// Served at ProspectedTenders.aspx?Quarter=1..4 (a plain GET; a quarter can be
// empty). Great early buyer-intent signal.
//
// There's no tender number, so we mint a STABLE synthetic source_ref from the
// year + quarter + a hash of the title — stable across re-scans (idempotent
// upsert) even if the list reorders. Verified live 2026-07-06: 67/67 on Q1.

import { render } from './scrape_monaqasat.js';

const BASE = 'https://www.ashghal.gov.qa';
const BUYER = 'Public Works Authority (Ashghal)';
const QUARTERS = [1, 2, 3, 4];

function htmlToText(h) {
  return String(h || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
}
function hash(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/**
 * Parse one Prospected page's HTML into project rows. Scoped to the table that
 * has both "Project Title" and "Department" headers so page chrome can't leak
 * in; only numbered data rows are kept.
 */
export function parseProspected(html, quarter) {
  const clean = String(html || '').replace(/<!--[\s\S]*?-->/g, ' ');
  const year = (clean.match(/Quarter[^<]*?-\s*(20\d{2})/i) ||
                clean.match(/launched in\s*(20\d{2})/i) || [])[1] ||
                String(new Date().getUTCFullYear());
  const tables = clean.split(/<table[\s>]/i).slice(1);
  const projTable = tables.find((t) => /Project Title/i.test(t) && /Department/i.test(t));
  if (!projTable) return [];
  const rows = [];
  const seen = new Set();
  for (const block of projTable.split(/<tr[\s>]/i).slice(1)) {
    const cells = [...block.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => htmlToText(m[1]));
    if (cells.length < 2) continue;
    const num = (cells[0] || '').trim();
    const title = (cells[1] || '').trim();
    const dept = (cells[2] || '').trim() || null;
    if (!title || title.length < 5 || /Project Title/i.test(title)) continue;
    if (!/^\d+$/.test(num)) continue;   // real rows are numbered (# column)
    const source_ref = `ASHGHAL-PROSPECT-${year}-Q${quarter}-${hash(title.toLowerCase())}`;
    if (seen.has(source_ref)) continue;
    seen.add(source_ref);
    rows.push({
      source: 'ashghal',
      source_ref,
      title: title.slice(0, 400),
      buyer: BUYER,
      category: dept,
      status: 'prospected',
      currency: 'QAR',
      url: `${BASE}/en/Tenders/pages/ProspectedTenders.aspx?Quarter=${quarter}`,
      raw: { section: 'prospected', quarter, year: Number(year) || null, department: dept },
    });
  }
  return rows;
}

/** Scrape all four quarters of Ashghal's prospected (upcoming) projects. */
export async function scrapeAshghalProspected({ onProgress } = {}) {
  const all = [];
  const seen = new Set();
  for (const q of QUARTERS) {
    const page = await render(`${BASE}/en/Tenders/pages/ProspectedTenders.aspx?Quarter=${q}`).catch(() => null);
    if (!page || !page.html) continue;
    for (const r of parseProspected(page.html, q)) {
      if (seen.has(r.source_ref)) continue;
      seen.add(r.source_ref);
      all.push(r);
    }
    if (onProgress) onProgress({ quarter: q, total: all.length });
  }
  return all;
}
