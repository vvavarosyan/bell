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
// exact closing date, contract duration, the buyer's tender ref, contact email,
// and — on awarded tenders — a best-effort winning company name.

import { crawl4aiRender } from '../enrichment/local/crawl4ai.js';
import { renderPage, rendererAvailable } from '../enrichment/local/render.js';

const BASE = 'https://monaqasat.mof.gov.qa';
const LABELS = 'Publish date|Award date|Closing date|Requested Sector Type|Tender Bond|Documents value|Ministry|Type|Report|Attached';
const MAX_PAGES = Math.min(Math.max(Number(process.env.BELL_TENDER_MAX_PAGES) || 25, 1), 60);
const WITH_DETAILS = process.env.BELL_TENDER_DETAILS !== '0';   // default ON

// ── rendering ───────────────────────────────────────────────────────────────
async function render(url, timeoutMs = 40_000) {
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

// ── listing parse ────────────────────────────────────────────────────────────
/** Parse one listing page's {html,text} into tender rows (card-level fields). */
export function parseListing(page, status) {
  const rows = [];
  if (!page || !page.text) return rows;
  // detail ids in order of first appearance (each card links to its detail
  // several times — dedup preserving order gives one id per card, in order).
  const ids = [];
  for (const m of String(page.html || '').matchAll(/TenderDetails\/(\d+)/g)) {
    if (!ids.includes(m[1])) ids.push(m[1]);
  }
  // cards start with a tender number NNNN/YYYY; lookbehind avoids splitting
  // inside a number ("2580"→"80/2026") or a date ("02/07/2026"→"07/2026").
  const cards = page.text.split(/(?=(?<![\d\/])\d{2,6}\/20\d{2}\b)/);
  let ci = 0;
  for (const card of cards) {
    const numM = card.match(/^\s*(\d{2,6}\/20\d{2})\b/);
    if (!numM) continue;
    const source_ref = numM[1];
    const rest = card.slice(numM[0].length);
    const title = (rest.split(new RegExp(LABELS))[0] || '').trim();
    if (!title || title.length < 6) continue;
    const detailId = ids[ci] || null; ci++;

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
/** Open a tender's detail page and enrich the row in place. */
export async function enrichDetail(row) {
  if (!row || !row.raw || !row.raw.detail_id) return;
  const page = await render(`${BASE}/TendersOnlineServices/TenderDetails/${row.raw.detail_id}`, 15_000);
  if (!page || !page.text) return;
  const t = page.text;

  // activities list: "<5-6 digit code> <Name>" pairs, before the conditions.
  const activities = [...t.matchAll(/\b(\d{5,6})\b\s+([A-Za-z][^0-9]{4,80}?)(?=\s+\d{5,6}\s|\s+Special Conditions|\s+General Conditions|\s+Name\s+Value)/g)]
    .map((m) => ({ code: m[1], name: m[2].trim() })).slice(0, 25);
  if (activities.length) row.raw.activities = activities;

  const closing = pick(t, /Closing Date[\s\S]{0,60}?(\d{1,2}\/\d{1,2}\/20\d{2})/i);
  if (closing) { const d = parseDate(closing); if (d) row.deadline_at = d; }

  const contract = pick(t, /Contract Duration\s*(\d+)/i);
  if (contract) row.raw.contract_months = Number(contract) || null;

  const entityRef = pick(t, /Entity'?s tender number\s+([A-Za-z0-9\/\-]+)/i);
  if (entityRef) row.raw.entity_ref = entityRef;

  const email = (t.match(/Email\s*([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i) || [])[1];
  if (email) row.raw.contact_email = email;

  // Awarded tenders: attempt the winning supplier (best-effort — verify against
  // real output; label varies). Never overwrite an already-known company.
  if (row.status === 'awarded' && !row.award_company_name) {
    const win = pick(t, /(?:Awarded (?:to|Company|Supplier)|Winning (?:Company|Bidder)|Successful Bidder|Contractor)\s*[:\-]?\s*([A-Z][A-Za-z0-9 .,&()'\-]{3,90}?)(?=\s{2}|\s+(?:Ministry|Tender|Award|Value|Activities|Special)|$)/i);
    if (win) row.award_company_name = win.trim().slice(0, 200);
  }
}

// ── orchestration ────────────────────────────────────────────────────────────
/** Walk every page of awarded + published tenders. Returns rows for ingest. */
export async function scrapeMonaqasat({ pages = MAX_PAGES, details = WITH_DETAILS } = {}) {
  const all = [];
  const seen = new Set();
  const sets = [
    ['awarded', '/TendersOnlineServices/AwardedTenders/'],
    ['open', '/TendersOnlineServices/AvailableMinistriesTenders/'],
  ];
  for (const [status, path] of sets) {
    for (let p = 1; p <= pages; p++) {
      const page = await render(`${BASE}${path}${p}`);
      const rows = parseListing(page, status).filter((r) => {
        const k = `${status}:${r.source_ref}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      if (!rows.length) break;   // past the last page (or render failed)
      all.push(...rows);
    }
  }
  if (details) {
    for (const row of all) { try { await enrichDetail(row); } catch { /* skip one bad detail */ } }
  }
  return all;
}
