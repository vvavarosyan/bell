// Tier-2 headless renderer for the Website Harvester (Stage 7).
// ----------------------------------------------------------------------------
// Many modern company sites (Wix, Squarespace, React/Vue SPAs, the QFZ portal
// builder, etc.) ship an almost-empty HTML shell and build the real page in the
// browser with JavaScript. A plain fetch (http.js) sees nothing. This module
// renders such pages with a real headless Chromium (Playwright) and returns the
// SAME shape as http.js's fetchPage, so the harvester's extractors work
// unchanged.
//
// Playwright is OPTIONAL and lazily loaded:
//   • It is NOT in the Portal's package.json, so Railway never installs it and
//     the local Portal's `npm install` never prunes it.
//   • It lives in an isolated folder (./browser/node_modules), installed once
//     via "Install Harvester Browser.command" — mirroring the MoPH scraper.
//   • If it isn't installed, rendererAvailable() returns false and the harvester
//     simply stays on the fetch-only fast path (and says so in the log).
//
// One Chromium instance is shared across a whole harvest run and closed at the
// end (closeRenderer) — launching a browser per page would be ruinously slow.

import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import { htmlToText, extractLinks, extractMeta, extractMailtoTel } from './http.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

let _pw = undefined;       // undefined=untried, null=unavailable, object=loaded
let _browser = null;
let _browserPromise = null;
let _launchFailed = false;

// Cap simultaneous browser pages so a parallel sweep can't spawn 20 Chromium
// tabs and exhaust memory. Renders/searches queue for a slot.
const MAX_BROWSER_PAGES = Number(process.env.BELL_MAX_RENDERS || 3);
let _activePages = 0;
const _pageWaiters = [];
async function acquirePage() {
  if (_activePages < MAX_BROWSER_PAGES) { _activePages++; return; }
  await new Promise(res => _pageWaiters.push(res));
  _activePages++;
}
function releasePage() {
  _activePages = Math.max(0, _activePages - 1);
  const w = _pageWaiters.shift();
  if (w) w();
}

/** Load Playwright from the isolated folder, then any hoisted install. */
function loadPlaywright() {
  if (_pw !== undefined) return _pw;
  const tryPaths = [
    path.join(__dirname, 'browser', 'node_modules', 'playwright'),
    'playwright',
  ];
  for (const p of tryPaths) {
    try { _pw = require(p); return _pw; } catch { /* keep trying */ }
  }
  _pw = null;
  return _pw;
}

/** True if a headless browser can be used (Playwright is installed). */
export async function rendererAvailable() {
  return !!loadPlaywright() && !_launchFailed;
}

async function getBrowser() {
  const pw = loadPlaywright();
  if (!pw) throw new Error('playwright_not_installed');
  if (_browser && _browser.isConnected()) return _browser;
  // Single launch even under concurrency.
  if (!_browserPromise) {
    _browserPromise = pw.chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage'],
    }).then((b) => { _browser = b; return b; })
      .catch((err) => { _launchFailed = true; _browserPromise = null; throw err; });
  }
  return _browserPromise;
}

/**
 * Render one page with a headless browser. Returns the fetchPage shape:
 *   { ok, status, finalUrl, html, text, links, meta, mailto, tel, rendered, error }
 */
export async function renderPage(url, { timeoutMs = 22_000, settleMs = 1500 } = {}) {
  const blank = { ok: false, status: 0, finalUrl: url, html: '', text: '', links: [], meta: {}, mailto: [], tel: [], rendered: true };
  let context, page;
  await acquirePage();
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      userAgent: UA,
      viewport: { width: 1280, height: 900 },
      ignoreHTTPSErrors: true,
      locale: 'en-US',
    });
    page = await context.newPage();

    // Skip heavy assets — we only need the rendered DOM/text, not pixels.
    await page.route('**/*', (route) => {
      const t = route.request().resourceType();
      if (t === 'image' || t === 'media' || t === 'font') return route.abort();
      return route.continue();
    });

    const resp = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
    // Let SPA frameworks hydrate, then settle.
    try { await page.waitForLoadState('networkidle', { timeout: 6000 }); } catch { /* fine */ }
    await page.waitForTimeout(settleMs);

    const html = await page.content();
    const finalUrl = page.url() || url;
    return {
      ok: true,
      status: (resp && resp.status()) || 200,
      finalUrl,
      html,
      text:   htmlToText(html),
      links:  extractLinks(html, finalUrl),
      meta:   extractMeta(html, finalUrl),
      ...extractMailtoTel(html),
      rendered: true,
    };
  } catch (err) {
    return { ...blank, error: (err?.message || 'render_error').slice(0, 140) };
  } finally {
    try { await page?.close(); } catch {}
    try { await context?.close(); } catch {}
    releasePage();
  }
}

// ---------------------------------------------------------------------------
// Web search (for the Website Finder, Stage 8)
// ---------------------------------------------------------------------------

// Hosts that are never a company's *own* website — directories, social,
// marketplaces, encyclopedias, government portals. Skipped in search results.
const SEARCH_SKIP_HOSTS = /(^|\.)(linkedin\.com|facebook\.com|instagram\.com|twitter\.com|x\.com|youtube\.com|tiktok\.com|wikipedia\.org|yelp\.com|yellowpages|bing\.com|google\.|duckduckgo\.com|microsoft\.com|amazon\.|glassdoor\.|indeed\.|crunchbase\.com|zoominfo\.com|dnb\.com|bloomberg\.com|traduora|qataryellowpages|qatarbusinessdirectory|gov\.qa|moci\.gov|qfc\.qa|qfz\.gov|baladiya)/i;

// Signs a search engine is challenging us rather than returning results.
const BLOCK_RX = /(captcha|unusual traffic|verify you are (a )?human|are you a robot|automated queries|anomaly|too many requests|access denied)/i;

// Rate-limit guard state for one harvest run (reset by beginSearchSession()).
const SEARCH_CAP = Number(process.env.BELL_SEARCH_CAP || 120);
let _searchCount = 0;
let _searchBlockStreak = 0;
let _searchDisabled = false;
let _searchDisabledReason = null;

/** Reset the search rate-limit guard at the start of a run. */
export function beginSearchSession() {
  _searchCount = 0; _searchBlockStreak = 0; _searchDisabled = false; _searchDisabledReason = null;
}
/** Snapshot for end-of-run logging. */
export function searchState() {
  return { count: _searchCount, disabled: _searchDisabled, reason: _searchDisabledReason };
}

/**
 * Search the web for `query` via the shared headless browser and return up to
 * `limit` organic result URLs (company-site candidates). Tries Bing first, then
 * DuckDuckGo HTML. Returns [] on any failure — the Finder then falls back to
 * domain-guessing only.
 */
export async function searchWeb(query, { limit = 6, timeoutMs = 20_000 } = {}) {
  const pw = loadPlaywright();
  if (!pw || _launchFailed) return [];
  if (_searchDisabled) return [];                       // rate-limited for this run
  if (_searchCount >= SEARCH_CAP) {                     // per-run budget exhausted
    _searchDisabled = true; _searchDisabledReason = 'cap_reached';
    return [];
  }
  _searchCount++;

  const engines = [
    { url: 'https://www.bing.com/search?q=' + encodeURIComponent(query), sel: '#b_results .b_algo a[href^="http"]' },
    { url: 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent(query), sel: 'a.result__a[href^="http"]' },
  ];

  await acquirePage();
  try {
  for (const eng of engines) {
    let context, page;
    try {
      const browser = await getBrowser();
      context = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: true, locale: 'en-US' });
      page = await context.newPage();
      await page.route('**/*', (route) => {
        const t = route.request().resourceType();
        if (t === 'image' || t === 'media' || t === 'font') return route.abort();
        return route.continue();
      });
      await page.goto(eng.url, { waitUntil: 'domcontentloaded', timeout: timeoutMs });
      await page.waitForTimeout(1200);

      // Detect a block/captcha page before trusting the results.
      const bodyText = (await page.evaluate(() => document.body?.innerText || '').catch(() => '')).slice(0, 2000);
      if (BLOCK_RX.test(bodyText)) {
        _searchBlockStreak++;
        // Exponential backoff, then disable search for the rest of the run if
        // the engines keep challenging us (protects the Mac's IP overnight).
        await new Promise(r => setTimeout(r, Math.min(15_000, 2000 * _searchBlockStreak)));
        if (_searchBlockStreak >= 3) { _searchDisabled = true; _searchDisabledReason = 'blocked'; }
        continue;   // try the next engine
      }

      const hrefs = await page.$$eval(eng.sel, (els) => els.map(a => a.href)).catch(() => []);
      const out = [];
      const seenHost = new Set();
      for (const raw of hrefs) {
        let host, clean;
        try {
          const u = new URL(raw);
          host = u.hostname.replace(/^www\./, '').toLowerCase();
          u.hash = ''; u.search = '';
          clean = u.toString();
        } catch { continue; }
        if (SEARCH_SKIP_HOSTS.test(host)) continue;
        if (seenHost.has(host)) continue;     // one result per host
        seenHost.add(host);
        out.push(clean);
        if (out.length >= limit) break;
      }
      if (out.length) { _searchBlockStreak = 0; return out; }   // healthy result resets streak
    } catch { /* try next engine */ }
    finally {
      try { await page?.close(); } catch {}
      try { await context?.close(); } catch {}
    }
  }
  return [];
  } finally { releasePage(); }
}

/** Close the shared browser at the end of a harvest run. */
export async function closeRenderer() {
  try { await _browser?.close(); } catch {}
  _browser = null;
}
