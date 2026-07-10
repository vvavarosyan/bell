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

import os from 'os';
import { crawl4aiRender } from '../enrichment/local/crawl4ai.js';
import { renderPage, rendererAvailable } from '../enrichment/local/render.js';

export const BASE = 'https://monaqasat.mof.gov.qa';

/**
 * Detail-parser version. Rows stamped with a LOWER version get re-fetched by
 * server/tenders/enrich.js, so bumping this re-checks the whole archive once
 * (newest first, resumable). Bump on any material detail-parser change and the
 * enricher + health scripts follow automatically — never hardcode the number.
 *   v2 (2026-07-08) activities regex fix — long activity names were dropped
 *   v3 (2026-07-10) closing-date fix — deadline_at was NULL on every tender
 *   v4 (2026-07-10) header/value table parsing — entity_ref was the literal
 *                   string "Request", description was truncated, contract
 *                   duration asserted an unstated unit; plus `raw.fields`,
 *                   the verbatim capture of every published field.
 */
export const DETAIL_V = 4;
// ⚠️ Cards say "Close date" (verified live 2026-07-10: 20/20 on open page 3,
// zero "Closing date"). The DETAIL page says "Closing Date". Match both.
const LABELS = 'Publish date|Award date|Clos(?:ing|e) date|Requested Sector Type|Tender Bond|Documents value|Ministry|Type|Report|Attached';
const MAX_PAGES = Math.min(Math.max(Number(process.env.BELL_TENDER_MAX_PAGES) || 25, 1), 1500);
const WITH_DETAILS = process.env.BELL_TENDER_DETAILS !== '0';   // default ON
// Peak memory during a scan/enrich is dominated by the headless browser, so an
// 8GB Mac gets overwhelmed at high concurrency (Chromium + Node + Postgres +
// the OS). Scale the default — and CAP any override — by installed RAM so a
// low-RAM machine stays responsive instead of swapping to death. (8GB → 2.)
function ramConcurrencyCap() {
  // Use binary GiB: an "8GB" Mac reports 8 GiB = 8.59 decimal GB, which would slip
  // past a decimal-8.5 threshold and wrongly get tier-4. totalmem/1024^3 = true GiB.
  const gib = os.totalmem() / (1024 ** 3);
  if (gib <= 8.5) return 2;
  if (gib <= 16.5) return 4;
  return 8;
}
export function ramSafeConcurrency(requested) {
  const cap = ramConcurrencyCap();
  const r = Number(requested);
  return Math.min(Math.max(Number.isFinite(r) && r > 0 ? r : cap, 1), cap);
}
const DEFAULT_CONCURRENCY = ramSafeConcurrency(process.env.BELL_TENDER_CONCURRENCY);
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
    // Some cards carry a STATUS PREFIX before the title (e.g. "Tender is
    // violation due to delay <title>"), so the card text CONTAINS the full
    // anchor title. Verified: lifts an awarded page from 12/14 → 14/14.
    if (!a) a = anchors.find((x) => !x.used && x.norm.length >= 12 && nt.includes(x.norm));
    if (a) { a.used = true; return a.id; }
    return null;
  };

  // Cards start with their tender number ALONE on its own line — split ONLY
  // there. ⚠️ Titles routinely EMBED internal committee refs mid-line (e.g.
  // "… - LTC-2417/2025 - Materials Department", "… GTC -1264/2025 - …"): the
  // old char-class lookbehind split at those too, minting a PHANTOM tender per
  // embedded ref (fake source_ref, fragment title, no detail link, wrong
  // title-fallback industry) while the REAL card lost its title tail + every
  // field after the split point — and a phantom could collide with and corrupt
  // a real tender sharing that ref (seen live: real awarded 2247/2024 stomped
  // by the "- Water Projects Department" phantom until a later re-scan healed
  // it). Line-anchored split PROVEN LIVE 2026-07-10 on open p1–21 + awarded
  // p1/p2/p3/p300/p600/p1000: fixed-count = old-count minus phantoms on every
  // page (zero real cards lost/gained), 0 unpaired open cards, truncated
  // titles restored. htmlToText collapses only HORIZONTAL whitespace, so the
  // ref-alone-on-its-line structure survives in page.text ([^\S\n] = any
  // whitespace except newline, i.e. spaces/tabs/\r/nbsp).
  const cards = page.text.split(/(?=^[^\S\n]*\d{2,6}\/20\d{2}[^\S\n]*$)/m);
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
    // Open cards label this "Close date" — the old /Closing date/ never matched,
    // so EVERY Monaqasat card carried deadline_at = NULL (found 2026-07-10:
    // 324/324 open tenders had no closing date). Awarded cards have no close
    // date at all (only "Award date") — correctly yields null there.
    const closeStr = pick(card, /Clos(?:ing|e) date\s*([\d/]+)/i);
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
 * Pull the Closing Date out of a detail page's TEXT — pure, no network.
 *
 * ⚠️ The detail page renders a TABLE whose first row is the header
 * (Tender number · Type · Subject · … · Documents value · **Closing Date**) and
 * whose second row holds the values. htmlToText turns each cell into its own
 * line, so "Closing Date" is a HEADER label — the date sits ~10 cells later.
 * The old regex looked for a date within 60 chars of the label and therefore
 * NEVER matched (found 2026-07-10: all 324 open Monaqasat tenders, including
 * the 303 with detail pages, had deadline_at = NULL). Worse, a laxer window
 * would have captured the tender NUMBER's year or the Subject's digits.
 *
 * So we pair positionally, exactly as the table does: count the header cells
 * (Closing Date is the LAST one), then take that many value cells and read the
 * last. Empty cells (e.g. a blank "Entity's tender number") render as blank
 * lines and are PRESERVED as cells — dropping them shifted the columns and was
 * a real 1-in-6 failure during verification. If the shape doesn't hold, or the
 * final cell isn't purely a date, we return null and Bell simply has no
 * deadline for that tender — never a guessed one.
 *
 * PROVEN LIVE 2026-07-10: 12/12 detail pages (open + awarded, incl. the
 * empty-cell page) matched the DOM's own header/value pairing exactly.
 */

/**
 * Decode the entities htmlToText leaves behind. Crawl4AI/Playwright return a
 * serialized DOM (entities already decoded), but a plain `fetch` of the same
 * page yields `Entity&#x27;s tender number`. Both must parse identically.
 */
const decodeEntities = (s) => String(s || '')
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ' '; } })
  .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)); } catch { return ' '; } })
  .replace(/&quot;/gi, '"').replace(/&apos;/gi, "'").replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
  .replace(/&amp;/gi, '&').replace(/&nbsp;/gi, ' ');

/** Compare labels regardless of entity encoding, case, or punctuation. */
const normLabel = (s) => decodeEntities(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const cellText = (h) => decodeEntities(String(h).replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

const splitCells = (text) =>
  String(text || '').split('\n').map((l) => l.replace(/\r/g, ' ').trim());

/**
 * Every `<table>` on the page as rows-of-cells. Verified live: the detail page
 * has 4 flat tables, no nesting, no comments inside cells. Comments are stripped
 * first anyway — a commented-out `<td>` silently shifted the Ashghal winner
 * columns once, and that class of bug is what this file exists to prevent.
 */
export function parseHtmlTables(html) {
  const clean = String(html || '').replace(/<!--[\s\S]*?-->/g, ' ');
  const out = [];
  for (const t of clean.matchAll(/<table\b[\s\S]*?<\/table>/gi)) {
    const rows = [...t[0].matchAll(/<tr\b[\s\S]*?<\/tr>/gi)]
      .map((r) => [...r[0].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((c) => cellText(c[1])))
      .filter((r) => r.length);
    if (rows.length) out.push(rows);
  }
  return out;
}

/**
 * label → value for every field in the detail page's tables — the ONE primitive
 * the whole detail parser is built on.
 *
 * ⚠️ Read this before touching it. Each field lives in a table whose FIRST row
 * is the header and whose SECOND row is the values ("Closing Date" is a HEADER;
 * its value sits ~10 cells later). Regexes that scan forward from a label
 * capture the NEXT HEADER. That is what shipped, and it silently corrupted
 * production (found 2026-07-10 on live tender 3445/2026):
 *   · `deadline_at` NULL on all 324 open tenders   ("Closing Date" is a header)
 *   · `entity_ref` = the literal string "Request"  (it grabbed "Request Types")
 *   · `description` truncated to "Supply of General Gifts to"
 *
 * A text/line-position parser is NOT enough either: the rendered Subject cell
 * contains real CR/LF (the source writes `&#xD;&#xA;` inside it), so on the
 * Crawl4AI/Playwright path — the one production uses — one value cell spans
 * several lines and every later column shifts. Proven: a line-pairing version
 * scored 12/12 on plain-fetch HTML and only 6/12 on browser-serialized HTML.
 * So we read the real `<td>` cells and never infer position from whitespace.
 *
 * PROVEN LIVE 2026-07-10: 12/12 detail pages (open + awarded, incl. an empty
 * `Entity's tender number` cell) on BOTH the plain-fetch and browser-serialized
 * HTML, checked against each page's own DOM header/value pairing.
 *
 * Unknown table shape → the field is simply absent. Bell reports no value
 * rather than a wrong one.
 */
export function detailFields(html) {
  const fields = new Map();
  for (const { label, value } of detailFieldList(html)) {
    const k = normLabel(label);
    if (!fields.has(k)) fields.set(k, value);
  }
  return fields;
}

/**
 * Same capture as `detailFields`, but ORDERED and keeping each label exactly as
 * the page prints it — so Bell can store and show every published field, not
 * just the handful it models as columns.
 *
 * Val's rule (2026-07-10): *"gather that data/numbers and present the same exact
 * way, just 3, 12, etc. we should not skip or avoid any data."* Several of these
 * values are bare numbers whose unit the source never states (`Contract
 * Duration 3`, `Warranty Period 12`, `Final Insurance 10`). We keep them
 * verbatim — the honest record — and never append a unit we inferred.
 */
export function detailFieldList(html) {
  const out = [];
  const seen = new Set();
  const add = (label, value) => {
    const l = String(label || '').trim();
    const v = String(value ?? '').trim();
    const k = normLabel(l);
    if (!k || seen.has(k) || out.length >= 40) return;
    seen.add(k);
    out.push({ label: l.slice(0, 60), value: v.slice(0, 300) });
  };
  for (const rows of parseHtmlTables(html)) {
    if (rows.length < 2) continue;
    const head = rows[0].map(normLabel);
    if (head[0] === 'name' && head[1] === 'value') {
      // two-column "Name | Value" table (Contract Duration, Warranty Period, …)
      for (const r of rows.slice(1)) if (r.length >= 2 && r[0]) add(r[0], r[1]);
    } else if (head.includes('closing date') || head.includes('brief description')) {
      rows[0].forEach((h, i) => add(h, rows[1][i] ?? ''));
    }
  }
  return out;
}

/**
 * Read the value paired to `label` in one of the detail page's HEADER/VALUE
 * tables — pure, no network.
 *
 * ⚠️ Every field on the detail page lives in a table whose FIRST row is the
 * header and whose SECOND row is the values. htmlToText renders each cell on
 * its own line, so a label like "Closing Date" or "Entity's tender number" is
 * a HEADER — its value sits N cells later, where N = the number of headers.
 * Regexes that scan forward from the label capture the NEXT HEADER instead.
 * That is exactly what happened in production (found 2026-07-10):
 *   · `deadline_at` was NULL on all 324 open tenders ("Closing Date" header)
 *   · `entity_ref` was the literal string **"Request"** (it grabbed the next
 *     header, "Request Types") on every enriched tender
 *   · `description` was truncated to a few words
 *
 * So we pair positionally, exactly as the table does: find the label's index
 * within its header block, then read the same index from the value block.
 * Empty cells (a blank "Entity's tender number", an empty "Auction Type")
 * render as blank lines and are PRESERVED as cells — dropping them shifts every
 * later column and was a real 1-in-6 failure during verification. If the shape
 * doesn't hold, we return null: Bell reports no value rather than a wrong one.
 *
 * PROVEN LIVE 2026-07-10 against each page's own DOM header/value pairing.
 */
export function tableCell(text, label) {
  const lines = splitCells(text);
  const want = normLabel(label);
  const i = lines.findIndex((l) => normLabel(l) === want);
  if (i < 0) return null;

  let s = i; while (s > 0 && lines[s - 1] !== '') s--;   // header block start
  let e = i; while (e + 1 < lines.length && lines[e + 1] !== '') e++;   // …and end
  const n = e - s + 1;              // header cell count
  const k = i - s;                  // our label's column
  if (n < 2 || n > 24) return null; // not a header row we recognise → refuse

  let j = e + 1;                    // skip the blank separator row
  while (j < lines.length && lines[j] === '') j++;
  const values = lines.slice(j, j + n);   // exactly n cells, blanks included
  if (values.length !== n) return null;   // truncated value row → refuse

  const v = decodeEntities(values[k]).trim();
  return v || null;
}

/**
 * Read a row from the page's two-column "Name | Value" table (Contract
 * Duration, Warranty Period, …), where the label is a VALUE in column 0 and
 * its value is the very next cell.
 */
export function nameValue(text, name) {
  const lines = splitCells(text);
  const want = normLabel(name);
  const i = lines.findIndex((l) => normLabel(l) === want);
  if (i < 0) return null;
  for (let j = i + 1; j < Math.min(lines.length, i + 3); j++) {
    if (lines[j]) return decodeEntities(lines[j]).trim();
  }
  return null;
}

/**
 * The tender's closing date as printed (dd/mm/yyyy), or null.
 * Prefers the real `<td>` cells; falls back to line pairing when only text is
 * available (e.g. a cached page.text with no html).
 */
export function parseClosingDate(text, html) {
  const v = (html ? detailFields(html).get('closing date') : null) ?? tableCell(text, 'Closing Date');
  return v && /^\d{1,2}\/\d{1,2}\/20\d{2}$/.test(v) ? v : null;
}

/**
 * Parse a rendered detail page's text into a row IN PLACE — pure, no network.
 * Shared by the inline scrape path and the resumable DB backfill
 * (server/tenders/enrich.js), so both extract identical fields.
 */
export function parseDetailInto(row, text, html) {
  const t = String(text || '');
  if (!row.raw) row.raw = {};
  // Field lookup from the page's real table cells (see detailFields). When no
  // html is supplied we fall back to line pairing, which is correct as long as
  // no value cell contains a newline.
  const F = html ? detailFields(html) : null;
  const field = (label) => (F ? (F.get(normLabel(label)) || null) : null);

  // activities list: "<5-6 digit code> <name>" pairs inside the activities block
  // (the "Activity name/code" header → the next section, e.g. Special Conditions).
  // ⚠️ The OLD regex capped the name at {4,80} chars and required each activity to
  // be followed by another code — so any activity whose name exceeded 80 chars was
  // silently dropped, and tenders whose names were ALL long captured ZERO codes and
  // got wrongly stamped "no activities" (the "0 detailed" symptom). Fixed 2026-07-08,
  // verified live: isolate the block, then take every code + its full name up to the
  // next code or the block end (no length cap, no trailing-code requirement).
  const actBlock = t.match(/Activit(?:y|ies)\s*(?:name|code)?\s*([\s\S]*?)(?=\s+(?:Special Conditions|General Conditions|Name\s+Value|Evaluation Basis|Targeted Tenderer|Contract Duration|Conditions)\b|$)/i);
  const activities = actBlock
    ? [...actBlock[1].matchAll(/\b(\d{5,6})\b\s+([^\d]{3,}?)(?=\s+\d{5,6}\b|$)/g)]
        .map((m) => ({ code: m[1], name: m[2].trim().replace(/\s+/g, ' ').slice(0, 160) }))
        .filter((a) => a.name.length >= 3).slice(0, 40)
    : [];
  if (activities.length) row.raw.activities = activities;
  // Parser version — lets the enricher re-do rows captured by an older parser.
  // Bump this whenever the detail parser changes materially.
  row.raw.detail_v = DETAIL_V;

  const closing = parseClosingDate(t, html);
  if (closing) { const d = parseDate(closing); if (d) row.deadline_at = d; }

  // Contract Duration — from the two-column "Name | Value" table.
  // ⚠️ The site prints a BARE NUMBER ("Contract Duration | 3") with NO unit,
  // while the neighbouring row spells its unit out ("Contract Preparation
  // Period | 90 Days from contract date"). The old parser asserted DAYS, so a
  // tender showing "3" was published as "3 days". The source does not state the
  // unit, so Bell does not claim one: keep the value VERBATIM and only record a
  // unit when the page itself writes one.
  const durationRaw = field('Contract Duration') ?? nameValue(t, 'Contract Duration');
  if (durationRaw) {
    row.raw.contract_duration = durationRaw.slice(0, 60);          // exactly as printed
    const withUnit = durationRaw.match(/^(\d+)\s*(day|week|month|year)s?\b/i);
    if (withUnit) {
      row.raw.contract_duration_value = Number(withUnit[1]);
      row.raw.contract_duration_unit = withUnit[2].toLowerCase() + 's';
    }
  }
  // Legacy `contract_days` is deliberately NOT written any more (it asserted an
  // unstated unit). enrich.js drops it from rows it re-parses; the UI reads
  // contract_duration and falls back to the old field for un-re-enriched rows.

  const entityRef = field("Entity's tender number") ?? tableCell(t, "Entity's tender number");
  if (entityRef && entityRef.length <= 60) row.raw.entity_ref = entityRef;

  const email = (t.match(/Email\s*([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i) || [])[1];
  if (email) row.raw.contact_email = email;

  // Brief Description — the free-text scope of work; the FIRST value cell of the
  // second header/value table. The old regex read "everything between the
  // Evaluation Basis header and the next Targeted-Tenderer keyword", which cut
  // the text at the first occurrence of a word like "Companies" — production
  // rows were truncated to a few words ("Supply of General Gifts to").
  const desc = field('Brief Description') ?? tableCell(t, 'Brief Description');
  if (desc && desc.trim().length > 15) row.raw.description = desc.trim().slice(0, 2000);

  // EVERY published field, verbatim, in page order — including the ones Bell has
  // no column for (Request Types, Envelopes system, Targeted Tenderer Type,
  // Service Delivery Method, Auction Type, Local Value System, Tender Validity
  // Period, Evaluation Basis, Technical Evaluation Criteria, Final Insurance,
  // Execution Delivery Location, Contract Preparation Period, Warranty Period,
  // Maintenance Period, Financial Disbursement Method…). Values stay exactly as
  // printed — bare numbers stay bare. Empty cells are dropped: the source left
  // them blank, so Bell states nothing. (Val 2026-07-10: don't skip any data.)
  if (html) {
    const fields = detailFieldList(html).filter((f) => f.value);
    if (fields.length) row.raw.fields = fields;
  }

  return row;
}

/** Open a tender's detail page (network) and enrich the row in place. */
export async function enrichDetail(row) {
  if (!row || !row.raw || !row.raw.detail_id) return;
  const page = await render(`${BASE}/TendersOnlineServices/TenderDetails/${row.raw.detail_id}`, 15_000);
  if (!page || !page.text) return;
  parseDetailInto(row, page.text, page.html);
}

// ── orchestration ────────────────────────────────────────────────────────────
/**
 * Walk awarded + open lists and return rows for ingest. `awardedPages` /
 * `openPages` cap each list independently: the recurring scan keeps awarded
 * small for freshness, while the archive backfill passes a large awardedPages
 * to sweep all ~1,169 pages. `pages` is a back-compat fallback for both. With
 * `details` on, detail pages are opened through the concurrency pool.
 */
export async function scrapeMonaqasat({ openPages, awardedPages, pages, details = WITH_DETAILS, concurrency = DEFAULT_CONCURRENCY, onProgress = null } = {}) {
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
      if (onProgress) onProgress({ status, page: p, cards: all.length });
    }
  }
  if (details && all.length) {
    await mapPool(all, (row) => enrichDetail(row), concurrency);
  }
  return all;
}
