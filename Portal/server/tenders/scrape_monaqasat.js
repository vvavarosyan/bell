// Monaqasat scraper (Val-greenlit 2026-07-04, deepened 2026-07-05) — Qatar's
// central government procurement portal (monaqasat.mof.gov.qa, Ministry of
// Finance). Public, no login.
//
// Lists (each paginated as /{n}, n=1..):
//   /TendersOnlineServices/AvailableMinistriesTenders/{n}  — open/published
//   /TendersOnlineServices/AwardedTenders/{n}              — awarded
// The site is server-rendered but cookie-gated, so we render it with the LOCAL
// Crawl4AI engine (falls back to the Playwright renderer). We walk EVERY page.
//
// Per card we capture: tender number, subject, buyer ministry, sector, type,
// publish/award date, closing date, tender bond, documents value, and the
// per-tender DETAIL URL. With details on (default), we then open each detail
// page and add: the ACTIVITIES list (industry codes → company matching), the
// exact closing date, contract duration, the buyer's tender ref, and contact
// email. NOTE: Monaqasat does NOT publish the winning supplier on awarded
// tenders (verified 2026-07-05) — there is no winner field to scrape here.

import { crawl4aiRender } from '../enrichment/local/crawl4ai.js';
import { renderPage, rendererAvailable } from '../enrichment/local/render.js';

export const BASE = 'https://monaqasat.mof.gov.qa';
const LABELS = 'Publish date|Award date|Closing date|Requested Sector Type|Tender Bond|Documents value|Ministry|Type|Report|Attached';
const MAX_PAGES = Math.min(Math.max(Number(process.env.BELL_TENDER_MAX_PAGES) || 25, 1), 1500);
const WITH_DETAILS = process.env.BELL_TENDER_DETAILS !== '0';   // default ON
const DEFAULT_CONCURRENCY = Math.min(Math.max(Number(process.env.BELL_TENDER_CONCURRENCY) || 6, 1), 12);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Small promise pool — run `worker` over `items`, at most `concurrency` at a
// time. Opening tender detail pages in parallel (politely) instead of one at a
// time is the whole speed lever for the ~23k-page archive backfill.
export async function mapPool(items, worker, concurrency = DEFAULT_CONCURRENCY) {
  let i = 0, active = 0;
  return new Promise((resolve) => {
    const pump = () => {
      if (i >= items.length && active === 0) return resolve();
      while (active < concurrency && i < items.length) {
        const item = items[i++]; active++;
        Promise.resolve(worker(item)).catch(() => {}).finally(() => { active--; pump(); });
      }
    };
    pump();
  });
}

// ── rendering ───────────────────────────────────────────────────────────────
export async function render(url, timeoutMs = 40_000) {
  const c = await crawl4aiRender(url, { timeoutMs, waitFor: 1400 }).catch(() => null);
  if (c && c.html && c.html.length > 600) return { html: c.html, text: c.text || htmlToText(c.html) };
  if (await rendererAvailable().catch(() => false)) {
    const r = await renderPage(url, { timeoutMs }).catch(() => null);
    if (r && (r.html || r.text)) return { html: r.html || '', text: r.text || htmlToText(r.html || '') };
  }
  return null;
}

function htmlToText(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&#\d+;/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseDate(s) {
  const m = String(s || '').match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/);
  if (!m) return null;
  const d = new Date(`${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}T00:00:00Z`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}
const pick = (s, rx) => { const m = String(s || '').match(rx); return m ? m[1].trim() : null; };
const num = (s) => { if (!s) return null; const n = Number(String(s).replace(/[^0-9.]/g, '')); return Number.isFinite(n) ? n : null; };
const normTitle = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 120);

// ── listing parse ────────────────────────────────────────────────────────────
/** Parse one listing page's {html,text} into tender rows (card-level fields). */
export function parseListing(page, status) {
  const rows = [];
  if (!page || !page.text) return rows;
  // Pair each card to its OWN detail page by TITLE — never by index. Each card
  // links to its detail as <a href=".../TenderDetails/{id}">{title}</a>, so the
  // anchor's text IS the card title. The old index-pairing silently drifted and
  // attached the WRONG detail page to a tender (found live 2026-07-06: card
  // #976/2026 opened #961/2026). We extract every {id,title} anchor and match a
  // card to the anchor with the same title, consuming matches so duplicate
  // titles still pair in order. No confident match → detail_id null (leave it
  // unlinked rather than attach the wrong tender's details).
  const anchors = [];
  for (const m of String(page.html || '').matchAll(/<a\b[^>]*?TenderDetails\/(\d+)[^>]*>([\s\S]*?)<\/a>/gi)) {
    const title = htmlToText(m[2]).trim();
    if (title.length >= 5 && !/^(report|purchase|view|details?|attach\w*|download)$/i.test(title)) {
      anchors.push({ id: m[1], norm: normTitle(title), used: false });
    }
  }
  const matchDetailId = (title) => {
    const nt = normTitle(title);
    if (nt.length < 5) return null;
    let a = anchors.find((x) => !x.used && x.norm === nt);
    if (!a) a = anchors.find((x) => !x.used && (x.norm.startsWith(nt) || nt.startsWith(x.norm)) && Math.min(x.norm.length, nt.length) >= 10);
    if (a) { a.used = true; return a.id; }
    return null;
  };

  // cards start with a tender number NNNN/YYYY; lookbehind avoids splitting
  // inside a number ("2580"→"80/2026") or a date ("02/07/2026"→"07/2026").
  const cards = page.text.split(/(?=(?<![\d\/])\d{2,6}\/20\d{2}\b)/);
  for (const card of cards) {
    const numM = card.match(/^\s*(\d{2,6}\/20\d{2})\b/);
    if (!numM) continue;
    const source_ref = numM[1];
    const rest = card.slice(numM[0].length);
    const title = (rest.split(new RegExp(LABELS))[0] || '').trim();
    if (!title || title.length < 6) continue;
    const detailId = matchDetailId(title);

    const pubStr   = pick(card, /Publish date\s*([\d/]+)/i);
    const awdStr   = pick(card, /Award date\s*([\d/]+)/i);
    const closeStr = pick(card, /Closing date\s*([\d/]+)/i);
    const sector   = pick(card, /Requested Sector Type\s+([\s\S]*?)\s+(?:Tender Bond|Documents value|Ministry)/i);
    const ministry = pick(card, /\bMinistry\s+([\s\S]*?)\s+(?:Type|Report|Attached)\b/i);
    const typ      = pick(card, /\bType\s+(Public Tender|Two Phase Tender|Limited Tender|Mumarasa|Practice|Auction|Tender)\b/i)
                   || pick(card, /\bType\s+(\S+(?:\s\S+)?)\s+(?:Report|Attached)/i);
    const bond     = pick(card, /Tender Bond[^\d]*([\d.,]+)/i);
    const docVal   = pick(card, /Documents value[^\d]*([\d.,]+)/i);

    rows.push({
      source: 'monaqasat',
      source_ref,
      title: title.slice(0, 400),
      buyer: ministry ? ministry.slice(0, 150) : null,
      category: (sector || typ || '').slice(0, 80) || null,
      status: status === 'awarded' ? 'awarded' : 'open',
      // tender bond is a rough size proxy (the true contract value isn't published)
      value_amount: num(bond),
      currency: 'QAR',
      url: detailId
        ? `${BASE}/TendersOnlineServices/TenderDetails/${detailId}`
        : `${BASE}${status === 'awarded' ? '/TendersOnlineServices/AwardedTenders/1' : '/TendersOnlineServices/AvailableMinistriesTenders/1'}`,
      published_at: status === 'awarded' ? parseDate(awdStr) : parseDate(pubStr),
      deadline_at: parseDate(closeStr),
      awarded_at: status === 'awarded' ? parseDate(awdStr) : null,
      raw: {
        detail_id: detailId, type: typ, sector,
        tender_bond: num(bond), documents_value: num(docVal),
        publish_date: pubStr, award_date: awdStr, close_date: closeStr,
      },
    });
  }
  return rows;
}

// ── detail-page enrichment ───────────────────────────────────────────────────
/**
 * Parse a rendered detail page's text into a row IN PLACE — pure, no network.
 * Shared by the inline scrape path and the resumable DB backfill
 * (server/tenders/enrich.js), so both extract identical fields.
 */
export function parseDetailInto(row, text) {
  const t = String(text || '');
  if (!row.raw) row.raw = {};

  // activities list: "<5-6 digit code> <Name>" pairs, before the conditions.
  const activities = [...t.matchAll(/\b(\d{5,6})\b\s+([A-Za-z][^0-9]{4,80}?)(?=\s+\d{5,6}\s|\s+Special Conditions|\s+General Conditions|\s+Name\s+Value)/g)]
    .map((m) => ({ code: m[1], name: m[2].trim() })).slice(0, 25);
  if (activities.length) row.raw.activities = activities;

  const closing = pick(t, /Closing Date[\s\S]{0,60}?(\d{1,2}\/\d{1,2}\/20\d{2})/i);
  if (closing) { const d = parseDate(closing); if (d) row.deadline_at = d; }

  const contract = pick(t, /Contract Duration\s*(\d+)/i);
  if (contract) row.raw.contract_days = Number(contract) || null;   // Monaqasat states duration in DAYS (e.g. 730 = ~2yr), not months

  const entityRef = pick(t, /Entity'?s tender number\s+([A-Za-z0-9\/\-]+)/i);
  if (entityRef) row.raw.entity_ref = entityRef;

  const email = (t.match(/Email\s*([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i) || [])[1];
  if (email) row.raw.contact_email = email;
  return row;
}

/** Open a tender's detail page (network) and enrich the row in place. */
export async function enrichDetail(row) {
  if (!row || !row.raw || !row.raw.detail_id) return;
  const page = await render(`${BASE}/TendersOnlineServices/TenderDetails/${row.raw.detail_id}`, 15_000);
  if (!page || !page.text) return;
  parseDetailInto(row, page.text);
}

// ── orchestration ────────────────────────────────────────────────────────────
/**
 * Walk awarded + open lists and return rows for ingest. `awardedPages` /
 * `openPages` cap each list independently: the recurring scan keeps awarded
 * small for freshness, while the archive backfill passes a large awardedPages
 * to sweep all ~1,169 pages. `pages` is a back-compat fallback for both. With
 * `details` on, detail pages are opened through the concurrency pool.
 */
export async function scrapeMonaqasat({ openPages, awardedPages, pages, details = WITH_DETAILS, concurrency = DEFAULT_CONCURRENCY } = {}) {
  const all = [];
  const seen = new Set();
  const sets = [
    ['awarded', '/TendersOnlineServices/AwardedTenders/', awardedPages ?? pages ?? MAX_PAGES],
    ['open', '/TendersOnlineServices/AvailableMinistriesTenders/', openPages ?? pages ?? MAX_PAGES],
  ];
  for (const [status, path, cap] of sets) {
    let miss = 0;   // consecutive pages that yielded nothing (a render blip OR the true end)
    for (let p = 1; p <= cap; p++) {
      let page = await render(`${BASE}${path}${p}`);
      if (!page || !page.text) { await sleep(1200); page = await render(`${BASE}${path}${p}`); }   // retry a blip once
      const parsed = page ? parseListing(page, status) : [];
      if (parsed.length === 0) {
        // A failed/partial render OR a genuinely empty page past the end. Do NOT
        // end the whole walk on a SINGLE blip — that truncated the awarded
        // archive at ~page 646 of 1,170 on 2026-07-05. Only stop after several
        // empties in a row (a real end, or the site clamping past the last page).
        if (++miss >= 4) break;
        continue;
      }
      miss = 0;
      for (const r of parsed) {
        const k = `${status}:${r.source_ref}`;
        if (seen.has(k)) continue;
        seen.add(k);
        all.push(r);
      }
    }
  }
  if (details && all.length) {
    await mapPool(all, (row) => enrichDetail(row), concurrency);
  }
  return all;
}
