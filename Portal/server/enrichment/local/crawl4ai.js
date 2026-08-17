// Crawl4AI client — Bell's free, local, JS-capable scraping engine.
// ----------------------------------------------------------------------------
// Crawl4AI (github.com/unclecode/crawl4ai) is an open-source, Playwright-based
// crawler that cracks JS-heavy / anti-bot company sites far better than a plain
// fetch. It runs as a small LOCAL server (Install Crawl4AI Engine.command →
// LaunchAgent on 127.0.0.1:11235), so this Node engine just POSTs a URL and gets
// back rendered HTML. We then derive text/links/meta with the SAME http.js
// parsers the rest of the pipeline uses → the output shape is identical to
// fetchPage()/renderPage() and every downstream extractor works unchanged.
//
// Fully optional + health-gated: if the server isn't running, crawl4aiAvailable()
// returns false and the renderer falls back to local Playwright — nothing breaks.
// Disable entirely with BELL_CRAWL4AI=0.

import { htmlToText, extractLinks, extractMeta, extractMailtoTel } from './http.js';

const BASE = (process.env.BELL_CRAWL4AI_URL || 'http://127.0.0.1:11235').replace(/\/$/, '');
const ENABLED = process.env.BELL_CRAWL4AI !== '0';

let _healthy = null;        // null = unknown; true/false = last check
let _features = [];         // what the RUNNING server says it can do (see crawl4aiSupports)
let _checkedAt = 0;
const HEALTH_TTL = 60_000;

/** Is the local Crawl4AI server reachable + ready? Cached for 60s. */
export async function crawl4aiAvailable() {
  if (!ENABLED) return false;
  if (_healthy !== null && Date.now() - _checkedAt < HEALTH_TTL) return _healthy;
  _checkedAt = Date.now();
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch(BASE + '/health', { signal: ctl.signal }).finally(() => clearTimeout(to));
    const d = r.ok ? await r.json().catch(() => null) : null;
    _healthy = !!(d && d.ok);
    _features = Array.isArray(d?.features) ? d.features : [];
  } catch { _healthy = false; _features = []; }
  return _healthy;
}

/**
 * Does the RUNNING server support a named option? This service is a long-lived task on the
 * engine box: the nightly git pull rewrites crawl4ai_server.py on disk while the process keeps
 * executing the code it started with. A new option would then be posted, accepted and ignored —
 * the caller sees "ran fine, found nothing", which is the failure shape this codebase keeps
 * being bitten by. Ask instead of assuming; a server too old to answer reports no features.
 */
export async function crawl4aiSupports(feature) {
  if (!(await crawl4aiAvailable())) return false;
  return _features.includes(feature);
}

/**
 * Render one URL through Crawl4AI. Returns the fetchPage()/renderPage() shape
 * ({ ok, status, finalUrl, html, text, links, meta, mailto, tel, rendered }) or
 * null on any failure (the caller then falls back to the local headless renderer).
 */
export async function crawl4aiRender(url, { timeoutMs = 45_000, waitFor = 0, settleMs = 0, waitSelector = null, jsCode = null, stealth = false } = {}) {
  if (!(await crawl4aiAvailable())) return null;
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(BASE + '/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url, wait_for: waitFor,
        // These three were silently dropped until 2026-08-17 — a caller's
        // settleMs only reached the Playwright FALLBACK, so on a machine where
        // Crawl4AI serves (the ROG), a challenge page was captured before its
        // JS could resolve. Forward everything the server understands.
        ...(settleMs ? { settle_ms: settleMs } : {}),
        ...(waitSelector ? { wait_selector: waitSelector } : {}),
        ...(jsCode ? { js_code: jsCode } : {}),
        ...(stealth ? { stealth: true } : {}),
      }),
      signal: ctl.signal,
    }).finally(() => clearTimeout(to));
    if (!res.ok) return null;
    const d = await res.json().catch(() => null);
    if (!d || !d.ok || !d.html) return null;
    const finalUrl = d.url || url;
    const html = d.html;
    return {
      ok: true,
      status: d.status || 200,
      finalUrl,
      html,
      text:   htmlToText(html),
      links:  extractLinks(html, finalUrl),
      meta:   extractMeta(html, finalUrl),
      ...extractMailtoTel(html),
      rendered: true,
      engine: 'crawl4ai',
    };
  } catch { return null; }
}
