#!/usr/bin/env node
/**
 * scrape_made_in_qatar.mjs
 *
 * Scraper for the "Made in Qatar" exhibitor directory.
 *   Site:    https://www.madeinqatar.com.qa  (WordPress + GravityView, view id 11682)
 *   Listing: https://www.madeinqatar.com.qa/exhibitor-directory-2023/?pagenum=N   (12 / page, ~30 pages)
 *   Detail:  https://www.madeinqatar.com.qa/exhibitor-directory-2023/entry/{ID}/
 *
 * ---------------------------------------------------------------------------
 * WHY THIS SCRIPT ROUTES THROUGH THE FIRECRAWL REST API
 * ---------------------------------------------------------------------------
 * The site serves an anti-bot / empty page to a plain Node `fetch` (HTTP 200
 * but ZERO entry links). A real headless browser bypasses it. This scraper
 * fetches every page through the Firecrawl REST API (POST /v1/scrape) with
 * `proxy:"stealth"`, which renders the page in a real browser and clears the
 * anti-bot. CONFIRMED 2026-06-26: stealth returns the real listing on page 1
 * (entries 369-381, 12 cards) and resolves the obfuscated detail-page email.
 *
 * No bulk endpoint exists. The GravityView REST route
 *   /wp-json/gravityview/v1/views/11682/entries
 * is NOT public on this install (it 200s but returns the WP homepage), and the
 * listing pages do NOT carry the contact fields — only name / logo / category /
 * entry_id. Owner, phone, mobile, email, website and description live ONLY on the
 * per-entry detail pages. So the most efficient COMPLETE strategy is:
 *   - fetch ~30 listing pages    -> collect entry ids (+ name/logo/category)
 *   - fetch the ~355 detail pages -> owner/phone/mobile/email/website/description
 * Each page is fetched exactly once. A listing entry whose detail fetch fails
 * still survives with the listing fields.
 *
 * The detail-page email is JS-obfuscated ("enkoder": a
 *   <span id="enkoder_..">Email hidden; Javascript is required.</span>
 * placeholder that an inline eval() rewrites into a real mailto on a real
 * browser). Firecrawl runs that JS, so a short waitFor recovers the address
 * inside the rawHtml for FREE. As a belt-and-suspenders fallback we also decode
 * the enkoder payload ourselves from the raw HTML when the rendered mailto is
 * missing.
 *
 * Requirements: Node 22+ (global fetch). ZERO npm dependencies.
 *   Env: BELL_FIRECRAWL_KEY (or BDI_KEY_FIRECRAWL) must hold a Firecrawl API key.
 *
 * CLI:
 *   node scrape_made_in_qatar.mjs                       # full scrape -> made-in-qatar.json
 *   node scrape_made_in_qatar.mjs --out data.json       # custom output path
 *   node scrape_made_in_qatar.mjs --limit 15            # cap number of exhibitors (testing)
 *   node scrape_made_in_qatar.mjs --max-pages 30        # cap listing pages crawled (default 35)
 *   node scrape_made_in_qatar.mjs --parse-file page.html [--source-url URL]  # parse a saved detail page offline
 *
 * Output JSON (shape is EXACT — null for any missing field):
 *   { "source":"made-in-qatar", "scraped_at":"<ISO8601>",
 *     "companies":[ { name, owner, phone, mobile, email, website,
 *                     description, category, logo_url, source_url, entry_id } ] }
 */

import { writeFile, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';

// ------------------------------------------------------------------ config ---

const BASE = 'https://www.madeinqatar.com.qa';
const LISTING_BASE = `${BASE}/exhibitor-directory-2023/?pagenum=`;
const ENTRY_BASE = `${BASE}/exhibitor-directory-2023/entry/`;

// ---- Firecrawl REST transport -------------------------------------------------
const FIRECRAWL_ENDPOINT = 'https://api.firecrawl.dev/v1/scrape';
const FIRECRAWL_KEY = process.env.BELL_FIRECRAWL_KEY || process.env.BDI_KEY_FIRECRAWL || '';

const DEFAULTS = {
  out: 'made-in-qatar.json',
  limit: Infinity,
  maxPages: 35,        // safety bound; ~30 real pages for ~355 exhibitors
  delayMs: 400,        // ~400ms pacing between Firecrawl calls, polite
  // Firecrawl render budgets (ms). Listing pages are light; detail pages run the
  // enkoder email JS, so give them a short settle (waitFor).
  listWaitMs: 5000,    // CONFIRMED: 5s lets the GravityView listing render
  detailWaitMs: 1500,  // let enkoder rewrite the email span before HTML capture
  retries: 3,
  proxy: 'stealth',    // CONFIRMED: clears the site's anti-bot
};

// --------------------------------------------------------------- arg parse ---

function parseArgs(argv) {
  const opts = { ...DEFAULTS };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    switch (a) {
      case '--out': opts.out = next(); break;
      case '--limit': opts.limit = Math.max(0, parseInt(next(), 10) || 0); break;
      case '--max-pages': opts.maxPages = Math.max(1, parseInt(next(), 10) || DEFAULTS.maxPages); break;
      case '--delay': opts.delayMs = Math.max(0, parseInt(next(), 10) || 0); break;
      case '--settle': opts.detailWaitMs = Math.max(0, parseInt(next(), 10) || 0); break;
      case '--list-wait': opts.listWaitMs = Math.max(0, parseInt(next(), 10) || 0); break;
      case '--retries': opts.retries = Math.max(0, parseInt(next(), 10) || 0); break;
      case '--proxy': opts.proxy = next(); break;
      case '--parse-file': opts.parseFile = next(); break;
      case '--source-url': opts.sourceUrl = next(); break;
      case '--help': case '-h': opts.help = true; break;
      default:
        if (a.startsWith('--')) log(`! unknown flag ignored: ${a}`);
    }
  }
  return opts;
}

const HELP = `Made in Qatar exhibitor-directory scraper (Node 22+, fetches via Firecrawl REST API)

Usage:
  node scrape_made_in_qatar.mjs [options]

Options:
  --out <path>          Output JSON path           (default: made-in-qatar.json)
  --limit <n>           Cap number of exhibitors    (default: all)
  --max-pages <n>       Cap listing pages crawled   (default: 35)
  --delay <ms>          Delay between Firecrawl calls (default: 400)
  --settle <ms>         waitFor on detail pages (email JS) (default: 1500)
  --list-wait <ms>      waitFor on listing pages    (default: 5000)
  --retries <n>         Retries per page            (default: 3)
  --proxy <mode>        Firecrawl proxy mode        (default: stealth)
  --parse-file <html>   Parse one saved detail page offline and print the record
  --source-url <url>    Override source_url when using --parse-file
  -h, --help            Show this help

Requires env BELL_FIRECRAWL_KEY (or BDI_KEY_FIRECRAWL) with a Firecrawl API key.
`;

// ----------------------------------------------------------------- helpers ---

function log(...args) { process.stderr.write(args.join(' ') + '\n'); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Decode the HTML entities that appear in WordPress / GravityView output. */
function decodeEntities(str) {
  if (str == null) return str;
  let s = String(str);
  s = s.replace(/&#(\d+);/g, (_, n) => safeCodePoint(parseInt(n, 10)));
  s = s.replace(/&#x([0-9a-fA-F]+);/g, (_, n) => safeCodePoint(parseInt(n, 16)));
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'",
    nbsp: ' ', laquo: '«', raquo: '»', hellip: '…',
    mdash: '—', ndash: '–', rsquo: '’', lsquo: '‘',
    ldquo: '“', rdquo: '”', deg: '°', trade: '™',
    copy: '©', reg: '®', eacute: 'é', uuml: 'ü',
    middot: '·', bull: '•', euro: '€', pound: '£',
  };
  s = s.replace(/&([a-zA-Z][a-zA-Z0-9]*);/g, (m, name) =>
    Object.prototype.hasOwnProperty.call(named, name) ? named[name] : m);
  return s;
}
function safeCodePoint(n) {
  try { return String.fromCodePoint(n); } catch { return ''; }
}

/** Strip tags but keep readable line breaks, then decode + collapse whitespace. */
function htmlToText(html) {
  if (html == null) return null;
  let s = String(html);
  s = s.replace(/<\s*br\s*\/?\s*>/gi, '\n');
  s = s.replace(/<\/(p|div|li|ul|ol|h[1-6]|tr)\s*>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = decodeEntities(s);
  s = s.replace(/\r\n?/g, '\n');
  s = s.replace(/[ \t\f\v]+/g, ' ');
  s = s.replace(/ *\n */g, '\n');
  s = s.replace(/\n{3,}/g, '\n\n');
  return s.trim();
}

/** Plain inline text: collapse ALL whitespace (incl. newlines) to single spaces. */
function inlineText(html) {
  const t = htmlToText(html);
  return t == null ? null : t.replace(/\s+/g, ' ').trim();
}

const clean = (v) => {
  if (v == null) return null;
  const t = String(v).trim();
  return t.length ? t : null;
};

// ------------------------------------------------------------- fetch layer ---
//
// firecrawlScrape() POSTs a URL to the Firecrawl REST API (/v1/scrape) and
// returns the parsed response data object. It is the SINGLE transport: stealth
// proxy clears the anti-bot AND runs the enkoder email JS. 3 retries w/ backoff
// on non-200 / success:false, plus ~400ms pacing between calls.

/**
 * Scrape one URL through Firecrawl. Returns the response `data` object
 * ({ rawHtml, html, links, ... }) or null on persistent failure.
 *
 * @param {string} url
 * @param {object} o  { formats, proxy, waitFor, actions, retries, delayMs, kind }
 */
async function firecrawlScrape(url, o = {}) {
  const {
    formats = ['rawHtml'],
    proxy = 'stealth',
    waitFor = 0,
    actions = null,
    retries = DEFAULTS.retries,
    delayMs = DEFAULTS.delayMs,
    kind = 'page',
  } = o;

  const payload = { url, formats, proxy };
  if (waitFor) payload.waitFor = waitFor;
  if (actions && actions.length) payload.actions = actions;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), 180_000);
      const res = await fetch(FIRECRAWL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${FIRECRAWL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: ctl.signal,
      }).finally(() => clearTimeout(to));

      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (body && body.success && body.data) {
          // light pacing AFTER a success so callers can fire back-to-back
          if (delayMs) await sleep(delayMs);
          return body.data;
        }
        const errMsg = body && (body.error || body.message) ? (body.error || body.message) : 'success:false';
        log(`  ${kind}: firecrawl ${errMsg} (attempt ${attempt + 1}/${retries + 1})`);
      } else {
        let txt = '';
        try { txt = (await res.text()).slice(0, 200); } catch { /* ignore */ }
        log(`  ${kind}: firecrawl HTTP ${res.status} (attempt ${attempt + 1}/${retries + 1}) ${txt}`);
        // 402 = out of credits; no point retrying.
        if (res.status === 402) break;
      }
    } catch (e) {
      log(`  ${kind}: firecrawl error ${e && e.message ? e.message : e} (attempt ${attempt + 1}/${retries + 1})`);
    }
    if (attempt < retries) {
      const backoff = Math.min(15000, 800 * Math.pow(2, attempt)) + Math.floor(Math.random() * 400);
      await sleep(backoff);
    }
  }
  log(`  FAILED ${kind}: ${url}`);
  return null;
}

/** Pull rawHtml (preferred) or html from a Firecrawl data object. */
function htmlFromData(data) {
  if (!data) return null;
  return data.rawHtml || data.html || null;
}

/**
 * Fetch one page's HTML through Firecrawl, retrying until it satisfies `expect`
 * (a predicate that rejects anti-bot / empty responses). Returns HTML or null.
 */
async function fetchHtml(url, opts, { kind = 'page', waitFor, expect } = {}) {
  const ok = expect || (() => true);
  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    const data = await firecrawlScrape(url, {
      formats: ['rawHtml'],
      proxy: opts.proxy,
      waitFor,
      retries: 0,           // outer loop owns the retry/backoff for the expect check
      delayMs: 0,
      kind,
    });
    const html = htmlFromData(data);
    if (html && ok(html)) return html;
    if (html) log(`  ${kind}: returned unusable HTML (anti-bot?) — retrying`);
    if (attempt < opts.retries) {
      const backoff = Math.min(12000, 700 * Math.pow(2, attempt)) + Math.floor(Math.random() * 300);
      await sleep(backoff);
    }
  }
  log(`  FAILED ${kind}: ${url}`);
  return null;
}

// ------------------------------------------------------------ listing scan ---

/** Pull entry IDs from one listing page, in first-seen order. */
function extractIdsFromListing(html) {
  const ids = [];
  const seen = new Set();
  const re = /exhibitor-directory-2023\/entry\/(\d+)/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    const id = m[1];
    if (!seen.has(id)) { seen.add(id); ids.push(id); }
  }
  return ids;
}

/**
 * Parse the lightweight per-card fields the LISTING page already carries:
 * name (gv-field-6-1 anchor), category (gv-field-6-4), logo (gv-field-6-28).
 * Returns Map: entry_id -> { name, category, logo_url }.
 * Lets us (a) keep listing-only entries alive and (b) backfill those three
 * fields without an extra detail render.
 */
function parseListingCards(html) {
  const out = new Map();
  // Each card: <div id="gv_list_369" class="gv-list-view"> ... </div> up to next card.
  const cardRe = /<div[^>]*id="gv_list_(\d+)"[^>]*class="[^"]*gv-list-view\b[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*id="gv_list_\d+"|<div class="gv-grid gv-widgets-footer"|$)/gi;
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    const id = m[1];
    const card = m[2];
    const nameM = /<h3[^>]*class="[^"]*gv-field-6-1\b[^"]*"[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i.exec(card);
    const name = nameM ? inlineText(nameM[1]) : null;
    const catChunk = grabFieldHtml(card, 'gv-field-6-4');
    const category = catChunk ? clean(inlineText(catChunk)) : null;
    let logo = null;
    const logoChunk = grabFieldHtml(card, 'gv-field-6-28');
    if (logoChunk) logo = firstHref(logoChunk);
    if (!logo) {
      const lm = /(https?:\/\/[^"'\s]*(?:gk-download|gf-download)[^"'\s]*)/i.exec(card);
      if (lm) logo = decodeEntities(lm[1]);
    }
    out.set(id, { name: clean(name), category, logo_url: clean(logo) });
  }
  return out;
}

/** A listing page is "real" (not anti-bot) if it contains at least one entry link. */
const listingLooksReal = (html) => /exhibitor-directory-2023\/entry\/\d+/.test(html || '');

/**
 * Walk listing pages, collecting entry IDs + their light card fields.
 * Stops after `maxPages`, or after 2 consecutive pages yield no NEW ids.
 * Returns { ids:[...], cards: Map(id -> {name,category,logo_url}) }.
 */
async function collectAllIds(opts) {
  const ids = [];
  const globalSeen = new Set();
  const cards = new Map();
  let emptyStreak = 0;

  for (let page = 1; page <= opts.maxPages; page++) {
    const url = `${LISTING_BASE}${page}`;
    const html = await fetchHtml(url, opts, {
      kind: `listing p${page}`,
      waitFor: opts.listWaitMs,
      expect: listingLooksReal,
    });
    if (!html) {
      emptyStreak++;
      if (emptyStreak >= 2) { log(`  stopping: listing fetch failed twice (last p${page})`); break; }
      await sleep(opts.delayMs);
      continue;
    }
    const pageIds = extractIdsFromListing(html);
    const pageCards = parseListingCards(html);
    for (const [id, c] of pageCards) if (!cards.has(id)) cards.set(id, c);

    const fresh = pageIds.filter((id) => !globalSeen.has(id));
    fresh.forEach((id) => { globalSeen.add(id); ids.push(id); });

    log(`  listing p${page}: ${pageIds.length} ids (${fresh.length} new, total ${ids.length})`);

    if (fresh.length === 0) {
      emptyStreak++;
      if (emptyStreak >= 2) { log(`  stopping: 2 consecutive pages with no new ids (p${page})`); break; }
    } else {
      emptyStreak = 0;
    }

    if (ids.length >= opts.limit) { log(`  reached --limit (${opts.limit}); stopping listing crawl`); break; }
    await sleep(opts.delayMs);
  }
  return { ids, cards };
}

// --------------------------------------------------------------- detail parse ---
//
// Field map (verified against live entries 369 / 372):
//   gv-field-6-28  -> Company logo  (anchor/img to a gk-download or gf-download URL)
//   gv-field-6-4   -> Category / company type ("SMEs", "Food", ...)
//   gv-field-6-13  -> "Company Owner" label (owner NAME is the maroon span right after)
//   gv-field-6-5   -> "Phone:"   (tel: link)
//   gv-field-6-6   -> "Mobile:"  (tel: link)
//   gv-field-6-8   -> "Email:"   (mailto: link AFTER enkoder JS runs; placeholder before)
//   gv-field-6-9   -> "Website:" (external anchor; href is the real URL)
//   Company NAME   -> a maroon (color:#800000) <span> inside the title block <h3>
//   Description    -> first gv-field-6-custom inside .gv-list-view-content-description
//
// Anchor on the field-id classes first, then fall back to visible labels.

/** Grab the inner HTML of the FIRST element carrying a given class, up to the next field boundary. */
function grabFieldHtml(html, cls) {
  const open = new RegExp(`<([a-zA-Z0-9]+)[^>]*class="[^"]*\\b${cls}\\b[^"]*"[^>]*>`, 'i');
  const mo = open.exec(html);
  if (!mo) return null;
  const start = mo.index + mo[0].length;
  const rest = html.slice(start);
  const boundary = /<(?:div|h3|ul)[^>]*class="[^"]*\b(?:gv-field-6-\d+|gv-field-6-custom|gv-list-view|gv-grid|gv-list-view-footer)\b/i;
  const mb = boundary.exec(rest);
  const chunk = mb ? rest.slice(0, mb.index) : rest;
  return chunk;
}

/** First href found inside a chunk of HTML. */
function firstHref(chunk) {
  if (!chunk) return null;
  const m = /href="([^"]+)"/i.exec(chunk);
  return m ? decodeEntities(m[1]) : null;
}

/** All maroon (#800000) span texts inside a chunk, decoded & trimmed, non-empty only. */
function maroonTexts(chunk) {
  if (!chunk) return [];
  const out = [];
  const re = /<span[^>]*color:\s*#800000[^>]*>([\s\S]*?)<\/span>/gi;
  let m;
  while ((m = re.exec(chunk)) !== null) {
    const t = inlineText(m[1]);
    if (t) out.push(t);
  }
  return out;
}

/** Extract a labelled link value: returns the anchor TEXT and HREF for a gv-field block. */
function labelledField(html, cls) {
  const chunk = grabFieldHtml(html, cls);
  if (!chunk) return { text: null, href: null, chunk: null };
  const hrefM = /href="([^"]+)"/i.exec(chunk);
  const href = hrefM ? decodeEntities(hrefM[1]) : null;
  let text = null;
  const aM = /<a[^>]*>([\s\S]*?)<\/a>/i.exec(chunk);
  if (aM) {
    text = inlineText(aM[1]);
  } else {
    const noLabel = chunk.replace(/<span[^>]*class="[^"]*gv-field-label[^"]*"[^>]*>[\s\S]*?<\/span>/i, '');
    text = inlineText(noLabel);
  }
  return { text: clean(text), href, chunk };
}

function normalizeWebsite(href, text) {
  let url = clean(href) || clean(text);
  if (!url) return null;
  url = url.trim();
  if (/^mailto:/i.test(url) || /^tel:/i.test(url)) return null;
  if (/^\/\//.test(url)) url = 'http:' + url;
  if (!/^https?:\/\//i.test(url)) {
    url = 'http://' + url.replace(/^\/+/, '');
  }
  return url;
}

/** Tidy a phone string: decode %XX, collapse whitespace, trim stray trailing punctuation. */
function cleanPhone(v) {
  if (v == null) return null;
  let s = String(v);
  if (/%[0-9a-fA-F]{2}/.test(s)) { try { s = decodeURIComponent(s); } catch { /* keep */ } }
  s = s.replace(/\s+/g, ' ').trim();
  s = s.replace(/[.,;]+$/, '').trim();
  return s.length ? s : null;
}

function phoneFromField(html, cls) {
  const { text, href } = labelledField(html, cls);
  let val = clean(text);
  if (!val && href && /^tel:/i.test(href)) val = href.replace(/^tel:/i, '');
  return cleanPhone(val);
}

function emailFromField(html, cls) {
  const { text, href } = labelledField(html, cls);
  let val = null;
  if (href && /^mailto:/i.test(href)) {
    val = href.replace(/^mailto:/i, '').split('?')[0];
    try { val = decodeURIComponent(val); } catch { /* keep as-is */ }
  }
  if (!val) val = clean(text);
  if (val && !/@/.test(val)) return null;          // ignore the "Email hidden;..." placeholder
  return val ? val.toLowerCase() : null;
}

// ---- enkoder fallback ------------------------------------------------------
// The email field is protected by the "Hide My Mail / enkoder" technique: an
// inline <script> does eval(unescape("...%xx...")) (sometimes nested) whose
// final output is document.write("<a href='mailto:foo@bar'>foo@bar</a>"). A real
// browser (Firecrawl) runs it and the rendered HTML already contains the mailto,
// so emailFromField() above gets it for free. This fallback recovers the address
// from the RAW script when, for any reason, the render captured the page before
// the JS settled. It only unescapes/de-rots what the script itself contains —
// no network, no eval.
function enkoderEmailFallback(html, entryId) {
  if (!html) return null;
  // 1) Cheap win: a mailto anywhere near an enkoder span / field-6-8.
  const direct = /href="mailto:([^"?]+)/i.exec(html);
  if (direct) {
    try { return decodeURIComponent(direct[1]).toLowerCase(); }
    catch { return direct[1].toLowerCase(); }
  }
  // 2) Find the enkoder <script> blocks and try to evaluate their layered
  //    unescape() + ROT/char-arithmetic without running arbitrary code.
  const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)].map((x) => x[1]);
  for (const src of scripts) {
    if (!/enkoder|unescape|mailto/i.test(src)) continue;
    const decoded = tryDecodeEnkoder(src);
    if (decoded) {
      const em = /mailto:([^"'?\s>]+)/i.exec(decoded) ||
                 /[\w.+-]+@[\w.-]+\.[a-z]{2,}/i.exec(decoded);
      if (em) {
        const addr = (em[1] || em[0]);
        try { return decodeURIComponent(addr).toLowerCase(); }
        catch { return addr.toLowerCase(); }
      }
    }
  }
  return null;
}

/**
 * Best-effort, eval-free unpack of an enkoder script. Enkoder typically wraps the
 * payload as `unescape("%XX%XX...")` possibly repeated, plus a per-char subtraction.
 * We (a) unescape any "%XX"-encoded string literals, and (b) try the common
 * "subtract N from each charCode" transform for small N. Returns a candidate
 * decoded string that contains "mailto"/an email, or null.
 */
function tryDecodeEnkoder(src) {
  // pull the longest %-encoded literal in the script
  const litRe = /"((?:%[0-9a-fA-F]{2}|[^"\\])+)"/g;
  let best = '';
  let m;
  while ((m = litRe.exec(src)) !== null) {
    if (m[1].length > best.length) best = m[1];
  }
  if (!best) return null;
  let s;
  try { s = decodeURIComponent(best.replace(/%(?![0-9a-fA-F]{2})/g, '%25')); }
  catch { try { s = unescape(best); } catch { return null; } }
  if (/mailto|@/.test(s)) return s;
  // enkoder per-char arithmetic: try subtracting a small constant offset.
  for (let off = 1; off <= 6; off++) {
    let t = '';
    for (let i = 0; i < s.length; i++) t += String.fromCharCode(s.charCodeAt(i) - off);
    if (/mailto:[\w.+-]+@[\w.-]+/i.test(t)) return t;
  }
  return null;
}

/**
 * Parse a single detail page's HTML into a company record.
 */
function parseDetail(html, { entryId = null, sourceUrl = null } = {}) {
  let scope = html;
  const cont = /<div[^>]*class="[^"]*gv-list-single-container[^"]*"[^>]*>/i.exec(html);
  if (cont) scope = html.slice(cont.index);

  if (!entryId) {
    const idM = /gv_list_(\d+)/.exec(scope) || /entry\/(\d+)/.exec(sourceUrl || '');
    if (idM) entryId = idM[1];
  }
  if (!sourceUrl && entryId) sourceUrl = `${ENTRY_BASE}${entryId}/`;

  // ---- title block: logo + name + category -------------------------------
  const titleM = /<div[^>]*class="[^"]*gv-list-view-title[^"]*"[^>]*>([\s\S]*?)<div[^>]*class="[^"]*gv-list-view-content\b/i.exec(scope);
  const titleBlock = titleM ? titleM[1] : scope;

  let logoUrl = null;
  const logoChunk = grabFieldHtml(titleBlock, 'gv-field-6-28');
  if (logoChunk) logoUrl = firstHref(logoChunk);
  if (!logoUrl) {
    const m = /(https?:\/\/[^"'\s]*(?:gk-download|gf-download)[^"'\s]*)/i.exec(titleBlock);
    if (m) logoUrl = decodeEntities(m[1]);
  }

  let name = null;
  const titleMaroons = maroonTexts(titleBlock);
  if (titleMaroons.length) name = titleMaroons[0];
  if (!name) {
    const h3 = /<div[^>]*gv-field-6-custom[^>]*>\s*<h3[^>]*>([\s\S]*?)<\/h3>/i.exec(titleBlock);
    if (h3) name = inlineText(h3[1]);
  }

  let category = null;
  const catChunk = grabFieldHtml(titleBlock, 'gv-field-6-4');
  if (catChunk) category = inlineText(catChunk);
  category = clean(category);

  // ---- owner (field 6-13 label, value in the following maroon span) ------
  let owner = null;
  const ownerAnchor = /<div[^>]*\bgv-field-6-13\b[^>]*>[\s\S]*?<\/a>\s*<\/div>/i.exec(scope)
                   || /<div[^>]*\bgv-field-6-13\b[^>]*>[\s\S]*?<\/div>/i.exec(scope);
  if (ownerAnchor) {
    const after = scope.slice(ownerAnchor.index + ownerAnchor[0].length);
    const stop = /<div[^>]*class="[^"]*gv-list-view-content-description[^"]*"/i.exec(after);
    const ownerScope = stop ? after.slice(0, stop.index) : after;
    const maroons = maroonTexts(ownerScope);
    if (maroons.length) owner = maroons[0];
  }
  owner = clean(owner);

  // ---- description --------------------------------------------------------
  let description = null;
  const descBlockM = /<div[^>]*class="[^"]*gv-list-view-content-description[^"]*"[^>]*>([\s\S]*?)(?:<div[^>]*class="[^"]*gv-list-view-footer|<\/div>\s*<\/div>\s*<\/div>\s*<\/div>\s*$)/i.exec(scope);
  let descBlock = descBlockM ? descBlockM[1] : null;
  if (descBlock) {
    const custom = /<div[^>]*gv-field-6-custom[^>]*>([\s\S]*?)<\/div>\s*(?:<div[^>]*gv-field-6-29|<\/div>|$)/i.exec(descBlock);
    description = htmlToText(custom ? custom[1] : descBlock);
  }
  if (!description) {
    const m = /gv-list-view-content-description[\s\S]*?gv-field-6-custom[^>]*>([\s\S]*?)<\/div>/i.exec(scope);
    if (m) description = htmlToText(m[1]);
  }
  description = clean(description);

  // ---- contact footer -----------------------------------------------------
  let phone = phoneFromField(scope, 'gv-field-6-5');
  let mobile = phoneFromField(scope, 'gv-field-6-6');
  let email = emailFromField(scope, 'gv-field-6-8');
  const webField = labelledField(scope, 'gv-field-6-9');
  let website = normalizeWebsite(webField.href, webField.text);

  // ---- label-based fallbacks (resilience if field ids ever shift) ---------
  if (!phone)  phone  = labelFallbackTel(scope, 'Phone');
  if (!mobile) mobile = labelFallbackTel(scope, 'Mobile');
  if (!email)  email  = labelFallbackMail(scope);
  if (!email)  email  = enkoderEmailFallback(html, entryId); // JS-free enkoder decode
  if (!website) {
    const wf = labelFallbackWebsite(scope);
    if (wf) website = normalizeWebsite(wf, wf);
  }

  return {
    name: clean(name),
    owner: owner,
    phone: clean(phone),
    mobile: clean(mobile),
    email: email,
    website: website,
    description: description,
    category: category,
    logo_url: clean(logoUrl),
    source_url: sourceUrl,
    entry_id: entryId ? String(entryId) : null,
  };
}

// label-anchored fallbacks --------------------------------------------------
function labelFallbackTel(html, label) {
  const re = new RegExp(`${label}\\s*:?\\s*<\\/span>\\s*<a[^>]*href="tel:([^"]+)`, 'i');
  const m = re.exec(html);
  if (m) return cleanPhone(decodeEntities(m[1]));
  const re2 = new RegExp(`${label}\\s*:?[\\s\\S]{0,40}?href="tel:([^"]+)`, 'i');
  const m2 = re2.exec(html);
  return m2 ? cleanPhone(decodeEntities(m2[1])) : null;
}
function labelFallbackMail(html) {
  const m = /Email\s*:?[\s\S]{0,60}?href="mailto:([^"?]+)/i.exec(html);
  if (!m) return null;
  let v = m[1];
  try { v = decodeURIComponent(v); } catch { /* keep */ }
  return /@/.test(v) ? v.toLowerCase() : null;
}
function labelFallbackWebsite(html) {
  const m = /Website\s*:?[\s\S]{0,60}?href="([^"]+)"/i.exec(html);
  if (!m) return null;
  const href = decodeEntities(m[1]);
  if (/^(?:tel:|mailto:)/i.test(href)) return null;
  return href;
}

// ------------------------------------------------------------------ runner ---

async function fetchAndParseDetail(id, opts, card) {
  const url = `${ENTRY_BASE}${id}/`;
  // A real detail page has the single-entry container for this id.
  const expect = (h) => h && (h.includes(`gv_list_${id}`) || /gv-list-single-container/.test(h));
  const html = await fetchHtml(url, opts, {
    kind: `entry ${id}`,
    waitFor: opts.detailWaitMs,    // settle for the enkoder email JS
    expect,
  });
  if (!html) {
    // Detail fetch failed entirely — fall back to whatever the listing carried.
    if (card) {
      return {
        name: card.name || null, owner: null, phone: null, mobile: null,
        email: null, website: null, description: null,
        category: card.category || null, logo_url: card.logo_url || null,
        source_url: url, entry_id: String(id),
      };
    }
    return null;
  }
  try {
    const rec = parseDetail(html, { entryId: id, sourceUrl: url });
    // Backfill light fields from the listing card if the detail somehow lacked them.
    if (card) {
      if (!rec.name) rec.name = card.name || null;
      if (!rec.category) rec.category = card.category || null;
      if (!rec.logo_url) rec.logo_url = card.logo_url || null;
    }
    if (!rec.name && !rec.email && !rec.phone) {
      log(`  ! entry ${id}: parsed but empty`);
    }
    return rec;
  } catch (err) {
    log(`  ! parse error entry ${id}: ${err.message}`);
    return null;
  }
}

function coverageReport(companies) {
  const n = companies.length || 1;
  const cnt = (k) => companies.filter((c) => c[k] != null && c[k] !== '').length;
  return { pct: (k) => `${cnt(k)}/${companies.length} (${Math.round((cnt(k) / n) * 100)}%)` };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) { process.stdout.write(HELP); return; }

  // ---- offline single-page parse mode (no network) -----------------------
  if (opts.parseFile) {
    log(`Parsing saved file: ${opts.parseFile}`);
    const html = await readFile(opts.parseFile, 'utf8');
    const rec = parseDetail(html, { sourceUrl: opts.sourceUrl || null });
    process.stdout.write(JSON.stringify(rec, null, 2) + '\n');
    return;
  }

  // ---- transport check: a Firecrawl API key is required ------------------
  if (!FIRECRAWL_KEY) {
    log('');
    log('ERROR: no Firecrawl API key found.');
    log('The Made in Qatar site blocks plain requests, so this scraper fetches via the');
    log('Firecrawl REST API (proxy:"stealth"). Set the key and re-run:');
    log('  export BELL_FIRECRAWL_KEY="fc-..."     (or BDI_KEY_FIRECRAWL)');
    process.exit(2);
  }

  // ---- live scrape --------------------------------------------------------
  log(`Made in Qatar scraper starting ${new Date().toISOString()}`);
  log(`Fetching via Firecrawl REST API (proxy:${opts.proxy}).`);
  log(`Collecting entry IDs from listing pages ...`);
  let { ids, cards } = await collectAllIds(opts);
  log(`Collected ${ids.length} unique entry IDs (${cards.size} cards with light fields).`);

  if (Number.isFinite(opts.limit) && ids.length > opts.limit) {
    ids = ids.slice(0, opts.limit);
    log(`Limited to first ${ids.length} (per --limit).`);
  }

  if (ids.length === 0) {
    log('No IDs collected — the listing fetches returned no entries.');
    log('Check the Firecrawl key / credits, or the site layout may have changed.');
  }

  log(`Fetching ${ids.length} detail pages (1 call each, ~${opts.delayMs}ms pacing, ${opts.detailWaitMs}ms email settle) ...`);
  const recs = [];
  let done = 0;
  for (const id of ids) {
    const rec = await fetchAndParseDetail(id, opts, cards.get(String(id)));
    if (rec) recs.push(rec);
    done++;
    if (done % 10 === 0 || done === ids.length) log(`  progress: ${done}/${ids.length}`);
    await sleep(opts.delayMs);
  }

  const companies = recs.filter(Boolean);
  const out = { source: 'made-in-qatar', scraped_at: new Date().toISOString(), companies };
  await writeFile(opts.out, JSON.stringify(out, null, 2), 'utf8');

  const cov = coverageReport(companies);
  log('');
  log(`Done. Wrote ${companies.length} companies -> ${opts.out}`);
  log(`Coverage:`);
  for (const k of ['name', 'owner', 'email', 'phone', 'mobile', 'website', 'category', 'logo_url', 'description']) {
    log(`  ${(k + ':').padEnd(13)} ${cov.pct(k)}`);
  }
}

// Run only when invoked directly (so the module can be imported for reuse/testing).
const isMain = (() => {
  try {
    if (!process.argv[1]) return false;
    return resolvePath(fileURLToPath(import.meta.url)) === resolvePath(process.argv[1]);
  } catch { return false; }
})();

if (isMain) {
  main().catch((err) => {
    log(`FATAL: ${err && err.stack ? err.stack : err}`);
    process.exit(1);
  });
}

export {
  parseDetail, parseListingCards, extractIdsFromListing,
  decodeEntities, htmlToText, normalizeWebsite,
  enkoderEmailFallback, firecrawlScrape, htmlFromData,
};
