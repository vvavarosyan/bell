// Ashghal AWARDED tenders scraper — the PRIZE that Monaqasat hides.
// ----------------------------------------------------------------------------
// DisplayofAwarding.aspx publishes, for each recently-awarded PWA tender, the
// WINNING contractor + every bidder + Accepted/Winner price + ICV score % +
// rank. That gives us real tender→company linkage and the strongest buyer-intent
// signal we own. (Verified live 2026-07-06.)
//
// Mechanism (verified live): the page shows the ~40 most-recent awarded tenders
// (last 6 months) as a left-hand list; selecting one is a FULL ASP.NET postback
// reload (NOT an async UpdatePanel update — proven: a window global set before a
// click is gone after it). There is no per-tender GET URL, so we must drive the
// postbacks with a real browser: local Playwright, one context, click each
// tender, wait for the reload, read the DOM. Crawl4AI's one-shot /crawl can't do
// a multi-step postback session, so this path uses Playwright directly (via the
// withPlaywrightPage primitive in render.js).
//
// Parsing is done in page.evaluate() against the live DOM (which correctly
// ignores the commented-out <td> that would otherwise shift the bidder columns
// in a raw-HTML regex parse — the same column-drift class of bug as the
// Monaqasat mispairing, caught during live verification):
//   • header fields: <td class="fontBold">Label:</td> + next <td> value
//   • bidder table:  the <table> containing a <tr class="winner">, each row's
//     cells = [Tenderer Name, Accepted Price, Winner Price, ICV %, Rank, Notes];
//     the winner row carries class="winner".
//
// Older-than-6-months awards (via the txtTenderNo search box) are a separate,
// lower-value phase — not scraped here.

import { withPlaywrightPage } from '../enrichment/local/render.js';

const BASE = 'https://www.ashghal.gov.qa';
const BUYER = 'Public Works Authority (Ashghal)';
const AWARDED_URL = `${BASE}/en/Tenders/pages/DisplayofAwarding.aspx`;

// Ashghal awarding dates are abbreviated ("16 Jun 2026") while list pages use
// full month names ("08 June 2026") — match on the first three letters so one
// parser handles both.
const MONTHS3 = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
function parseDate(s) {
  const m = String(s || '').match(/(\d{1,2})\s+([A-Za-z]{3})[A-Za-z]*\.?\s+(\d{4})/);
  if (!m) return null;
  const mo = MONTHS3[m[2].toLowerCase().slice(0, 3)];
  if (!mo) return null;
  const d = new Date(Date.UTC(Number(m[3]), mo - 1, Number(m[1])));
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function money(s) {
  if (!s) return null;
  const n = Number(String(s).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : null;
}

// Runs IN THE BROWSER (serialised by Playwright). Self-contained — no closures.
// Extracts the currently-selected awarded tender's header fields + bidder rows.
/* c8 ignore start */
function extractAward() {
  const txt = (el) => (el ? el.textContent : '').replace(/\s+/g, ' ').trim();
  const fld = (label) => {
    const c = [...document.querySelectorAll('td.fontBold')]
      .find((e) => txt(e).replace(/:\s*$/, '') === label);
    return c && c.nextElementSibling ? txt(c.nextElementSibling).replace(/^"+|"+$/g, '') : '';
  };
  // The bidder table is the one holding a <tr class="winner">; fall back to any
  // table whose rows carry comma-grouped prices (in case the winner class ever
  // goes missing).
  let dt = [...document.querySelectorAll('table')].find((t) => t.querySelector('tr.winner'));
  if (!dt) {
    dt = [...document.querySelectorAll('table')].find((t) =>
      /\d{1,3}(,\d{3})+\.\d/.test(t.textContent || '') &&
      [...t.querySelectorAll('tr')].some((r) => r.children.length >= 5));
  }
  let bidders = [];
  if (dt) {
    bidders = [...dt.querySelectorAll('tr')].map((r) => {
      const c = [...r.children].map((x) => txt(x));
      if (c.length < 5) return null;
      if (!/[A-Za-z]{3}/.test(c[0] || '')) return null;          // cell0 must be a name
      if (!c.some((v) => /\d{1,3}(,\d{3})+/.test(v))) return null; // some cell = a price
      return {
        name: (c[0] || '').slice(0, 200),
        accepted: c[1] || '',
        winnerPrice: c[2] || '',
        icv: (c[3] || '').replace(/%+\s*$/, '%'),
        rank: c[4] || '',
        notes: c[5] || '',
        isWinner: r.classList.contains('winner'),
      };
    }).filter(Boolean);
  }
  return {
    projectTitle: fld('Project Title'),
    projectId: fld('Project ID'),
    awardingDate: fld('Awarding Date'),
    comments: fld('Comments'),
    bidders,
  };
}
/* c8 ignore stop */

function toTenderRow(tenderNo, d) {
  if (!tenderNo || !d) return null;
  const bidders = Array.isArray(d.bidders) ? d.bidders : [];
  const winner = bidders.find((b) => b.isWinner) ||
                 bidders.find((b) => b.winnerPrice && /\d/.test(b.winnerPrice));
  return {
    source: 'ashghal',
    source_ref: tenderNo,
    title: (d.projectTitle || tenderNo).slice(0, 400),
    buyer: BUYER,
    category: null,
    status: 'awarded',
    currency: 'QAR',
    award_company_name: winner ? String(winner.name).slice(0, 200) : null,
    value_amount: winner ? money(winner.winnerPrice || winner.accepted) : null,
    awarded_at: parseDate(d.awardingDate),
    url: AWARDED_URL,
    raw: {
      section: 'awarded',
      project_id: d.projectId || null,
      awarding_date: d.awardingDate || null,
      comments: d.comments || null,
      bidder_count: bidders.length,
      bidders: bidders.map((b) => ({
        name: b.name,
        accepted_price: money(b.accepted),
        winner_price: money(b.winnerPrice),
        icv: b.icv || null,
        rank: b.rank || null,
        notes: b.notes || null,
        winner: !!b.isWinner,
      })),
    },
  };
}

/**
 * Scrape Ashghal's recently-awarded tenders (winner + all bidders). Drives the
 * postback list with Playwright; returns tender rows ready for ingestTenders
 * (award_company_name feeds linkTenderCompanies). Returns [] if Playwright is
 * unavailable (caller warns to run "Install Harvester Browser.command").
 * `max` caps how many list entries to open (default covers the full ~40).
 */
export async function scrapeAshghalAwarded({ max = 80, onProgress } = {}) {
  const result = await withPlaywrightPage(async (page) => {
    await page.goto(AWARDED_URL, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await page.waitForSelector('a[id$="lnkTenderNo"]', { timeout: 20_000 }).catch(() => {});
    // Stable, server-ordered list of awarded tender numbers.
    const tenderNos = await page.$$eval('a[id$="lnkTenderNo"]',
      (els) => els.map((a) => a.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean));
    const rows = [];
    const n = Math.min(tenderNos.length, max);
    for (let i = 0; i < n; i++) {
      const tenderNo = tenderNos[i];
      try {
        // Re-query fresh each iteration — every selection is a full page reload.
        const links = await page.$$('a[id$="lnkTenderNo"]');
        if (!links[i]) continue;
        await Promise.all([
          page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 25_000 }).catch(() => {}),
          links[i].click().catch(() => {}),
        ]);
        // Let the awarded panel render (every awarded tender has a winner row).
        await page.waitForSelector('tr.winner', { timeout: 6_000 }).catch(() => {});
        const d = await page.evaluate(extractAward);
        const row = toTenderRow(tenderNo, d);
        if (row && row.raw.bidder_count > 0) rows.push(row);
        if (onProgress) onProgress({ done: i + 1, total: n, captured: rows.length });
      } catch { /* skip this tender, keep going */ }
    }
    return rows;
  }, { timeoutMs: 45_000 });

  if (!result || result.__error || !Array.isArray(result)) return [];
  return result;
}
