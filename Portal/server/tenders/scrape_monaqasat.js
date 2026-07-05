// Monaqasat scraper (Val-greenlit 2026-07-04) — Qatar's central government
// procurement portal (monaqasat.mof.gov.qa, Ministry of Finance).
//
// Awarded + published tenders are PUBLIC (no login) at stable URLs:
//   /TendersOnlineServices/AwardedTenders/{page}            (awarded)
//   /TendersOnlineServices/AvailableMinistriesTenders/{page} (open/published)
// The listing is server-rendered but only served to a real browser session
// (cookies), so we render it with the LOCAL Crawl4AI engine (falls back to the
// Playwright renderer). Each card carries: tender number, title, award/closing
// date, requesting ministry (the BUYER), sector type, and document value.
//
// NOTE: the listing does NOT expose the winning supplier — award_company_name
// stays null here (so these don't yet generate company-linked signals; that
// needs a per-tender detail fetch, a documented v2). The tenders still populate
// Bell's tenders table + Bella's get_tenders + the tenders API.

import { crawl4aiRender } from '../enrichment/local/crawl4ai.js';
import { renderPage, rendererAvailable } from '../enrichment/local/render.js';

const BASE = 'https://monaqasat.mof.gov.qa';
const LABELS = 'Award date|Closing date|Requested Sector Type|Tender Bond|Documents value|Ministry|Type|Report';

async function renderText(url) {
  // Prefer Crawl4AI (headless Chromium, cookies + JS). Fall back to the local
  // Playwright renderer. Both run on the local engine only.
  const c = await crawl4aiRender(url, { timeoutMs: 45_000, waitFor: 1200 }).catch(() => null);
  if (c && c.text && c.text.length > 400) return c.text;
  if (await rendererAvailable().catch(() => false)) {
    const r = await renderPage(url, { timeoutMs: 45_000 }).catch(() => null);
    if (r && (r.text || r.html)) return r.text || htmlToText(r.html);
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

const pick = (card, rx) => { const m = card.match(rx); return m ? m[1].trim() : null; };

/** Parse a rendered listing page's text into tender rows. Uses targeted,
 *  anchored patterns (a generic "label→next-label" regex trips on values that
 *  themselves contain a label word, e.g. "Ministry of Justice"). */
export function parseMonaqasat(text, status) {
  const rows = [];
  if (!text) return rows;
  // Cards start with a tender number NNNN/YYYY. The negative lookbehind
  // (?<![\d\/]) stops us splitting inside a number ("2580" → "80/2026") or inside
  // a date ("02/07/2026" → "07/2026") — the tender number must not be preceded by
  // a digit or a slash.
  const cards = text.split(/(?=(?<![\d\/])\d{2,6}\/20\d{2}\b)/);
  for (const card of cards) {
    const numM = card.match(/^\s*(\d{2,6}\/20\d{2})\b/);
    if (!numM) continue;
    const source_ref = numM[1];
    const rest = card.slice(numM[0].length);
    const title = (rest.split(new RegExp(LABELS))[0] || '').trim();
    if (!title || title.length < 6) continue;

    const dateStr  = pick(card, /(?:Award|Closing) date\s*([\d/]+)/i);
    const sector   = pick(card, /Requested Sector Type\s+([\s\S]*?)\s+(?:Tender Bond|Documents value|Ministry)/i);
    const ministry = pick(card, /\bMinistry\s+([\s\S]*?)\s+(?:Type|Report)\b/i);
    const typ      = pick(card, /\bType\s+(\S+(?:\s\S+)?)\s+Report\b/i);
    const docVal   = pick(card, /Documents value[^\d]*([\d.,]+)/i);
    const when     = parseDate(dateStr);
    const value_amount = docVal ? (Number(String(docVal).replace(/[^0-9.]/g, '')) || null) : null;

    rows.push({
      source: 'monaqasat',
      source_ref,
      title: title.slice(0, 400),
      buyer: ministry ? ministry.slice(0, 150) : null,
      category: (sector || typ || '').slice(0, 80) || null,
      status: status === 'awarded' ? 'awarded' : 'open',
      value_amount,
      currency: 'QAR',
      url: BASE + (status === 'awarded' ? '/TendersOnlineServices/AwardedTenders/1' : '/TendersOnlineServices/AvailableMinistriesTenders/1'),
      published_at: status === 'awarded' ? null : when,
      awarded_at: status === 'awarded' ? when : null,
      raw: { source_ref, title, sector, type: typ, docVal },
    });
  }
  return rows;
}

/** Scrape N pages each of awarded + published tenders. Returns rows for ingest. */
export async function scrapeMonaqasat({ pages = 2 } = {}) {
  const all = [];
  const sets = [
    ['awarded', '/TendersOnlineServices/AwardedTenders/'],
    ['open', '/TendersOnlineServices/AvailableMinistriesTenders/'],
  ];
  for (const [status, path] of sets) {
    for (let p = 1; p <= pages; p++) {
      const text = await renderText(BASE + path + p);
      const rows = parseMonaqasat(text, status);
      all.push(...rows);
      if (!rows.length) break;   // no more pages / render failed
    }
  }
  return all;
}
