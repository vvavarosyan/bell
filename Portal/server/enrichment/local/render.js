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
let _launchFailed = false;

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
  try {
    _browser = await pw.chromium.launch({
      headless: true,
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--disable-dev-shm-usage'],
    });
    return _browser;
  } catch (err) {
    _launchFailed = true;   // e.g. chromium binary not downloaded
    throw err;
  }
}

/**
 * Render one page with a headless browser. Returns the fetchPage shape:
 *   { ok, status, finalUrl, html, text, links, meta, mailto, tel, rendered, error }
 */
export async function renderPage(url, { timeoutMs = 22_000, settleMs = 1500 } = {}) {
  const blank = { ok: false, status: 0, finalUrl: url, html: '', text: '', links: [], meta: {}, mailto: [], tel: [], rendered: true };
  let context, page;
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
  }
}

/** Close the shared browser at the end of a harvest run. */
export async function closeRenderer() {
  try { await _browser?.close(); } catch {}
  _browser = null;
}
