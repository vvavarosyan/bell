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
  } catch { _healthy = false; }
  return _healthy;
}

/**
 * Render one URL through Crawl4AI. Returns the fetchPage()/renderPage() shape
 * ({ ok, status, finalUrl, html, text, links, meta, mailto, tel, rendered }) or
 * null on any failure (the caller then falls back to the local headless renderer).
 */
export async function crawl4aiRender(url, { timeoutMs = 45_000, waitFor = 0 } = {}) {
  if (!(await crawl4aiAvailable())) return null;
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch(BASE + '/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, wait_for: waitFor }),
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
