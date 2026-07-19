// Local HTTP fetcher for the Website Harvester (Stage 7).
// ----------------------------------------------------------------------------
// Zero external dependencies — uses Node 22's global fetch + AbortController.
// This is the local, Firecrawl-free replacement for clients/firecrawl.js: it
// pulls a page's raw HTML directly, then derives the plain text, the outbound
// link list, the <title>, and the <meta>/<link> tags the harvester needs.
//
// Design goals:
//   • Be a polite, well-behaved crawler — real browser User-Agent, sane
//     timeout, redirect following, hard size cap, html-only.
//   • Never throw for "normal" failures (timeouts, 404s, non-html) — return
//     { ok:false, ... } so the harvester can soft-skip and keep going.
//   • Best-effort robots.txt respect per host (cached for the run).

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36 BellBot/1.0 (+https://bell.qa/bot)';

const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_BYTES          = 3_000_000;   // 3 MB hard cap per page

// ---------------------------------------------------------------------------
// Concurrency pool — run `worker` over `items` with at most `limit` in flight.
// Preserves each item's original index for stable logging.
// ---------------------------------------------------------------------------

export async function pool(items, limit, worker) {
  const n = items.length;
  const width = Math.max(1, Math.min(limit, n));
  let next = 0;
  const runners = Array.from({ length: width }, async () => {
    while (true) {
      const idx = next++;
      if (idx >= n) break;
      await worker(items[idx], idx);
    }
  });
  await Promise.all(runners);
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

/** Normalize a raw website value to an absolute https root URL, or null. */
export function toRootUrl(raw) {
  if (!raw) return null;
  let u = String(raw).trim();
  if (!u) return null;
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const parsed = new URL(u);
    if (!/^https?:$/.test(parsed.protocol)) return null;
    parsed.pathname = '/'; parsed.search = ''; parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch { return null; }
}

export function hostOf(url) {
  try { return new URL(url).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return null; }
}

export function sameHost(a, b) {
  const ha = hostOf(a), hb = hostOf(b);
  return !!ha && ha === hb;
}

/** Resolve a possibly-relative href against a base URL; null if unusable. */
export function absolutize(href, base) {
  if (!href) return null;
  const h = String(href).trim();
  if (!h || h.startsWith('#') || /^(javascript|data):/i.test(h)) return null;
  try {
    const u = new URL(h, base);
    if (!/^https?:$/.test(u.protocol)) return null;
    u.hash = '';
    return u.toString();
  } catch { return null; }
}

// ---------------------------------------------------------------------------
// HTML → text / links / meta (regex-based; no DOM dependency)
// ---------------------------------------------------------------------------

const TAG_BLOCK_RX = /<(script|style|noscript|template|svg)[\s\S]*?<\/\1>/gi;

/** Strip tags and collapse whitespace to readable plain text. */
export function htmlToText(html) {
  if (!html) return '';
  return html
    .replace(TAG_BLOCK_RX, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    // Numeric/hex character entities — AFTER tag-strip so a decoded '<' can't create a tag,
    // BEFORE whitespace collapse. Decoding these makes entity-obfuscated emails
    // (info&#64;company&#46;com) visible to the email regex; before this they were
    // silently invisible (Track A, 2026-07-19). Control chars are dropped.
    .replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => {
      const c = parseInt(h, 16);
      return c >= 32 && c <= 0x10ffff ? String.fromCodePoint(c) : ' ';
    })
    .replace(/&#(\d{1,7});/g, (_, n) => {
      const c = parseInt(n, 10);
      return c >= 32 && c <= 0x10ffff ? String.fromCodePoint(c) : ' ';
    })
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s*\n\s*\n+/g, '\n\n')
    .trim();
}

/** All href targets in the document, absolutized against baseUrl, de-duped. */
export function extractLinks(html, baseUrl) {
  if (!html) return [];
  const out = new Set();
  for (const m of html.matchAll(/<a\b[^>]*\bhref\s*=\s*["']([^"']+)["']/gi)) {
    const abs = absolutize(m[1], baseUrl);
    if (abs) out.add(abs);
  }
  return [...out];
}

/** mailto: / tel: links, decoded. */
export function extractMailtoTel(html) {
  const mailto = new Set(), tel = new Set();
  if (html) {
    for (const m of html.matchAll(/(?:href\s*=\s*["'])\s*mailto:([^"'?]+)/gi)) {
      try { mailto.add(decodeURIComponent(m[1]).trim().toLowerCase()); } catch { mailto.add(m[1].trim().toLowerCase()); }
    }
    for (const m of html.matchAll(/(?:href\s*=\s*["'])\s*tel:([^"']+)/gi)) {
      try { tel.add(decodeURIComponent(m[1]).trim()); } catch { tel.add(m[1].trim()); }
    }
  }
  return { mailto: [...mailto], tel: [...tel] };
}

/** Pull <title> + a small map of useful <meta>/<link rel> values. */
export function extractMeta(html, baseUrl) {
  const meta = { title: null, description: null, keywords: null, ogImage: null, ogSiteName: null, icon: null };
  if (!html) return meta;

  const t = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (t) meta.title = htmlToText(t[1]).slice(0, 300) || null;

  const grab = (rx) => { const m = html.match(rx); return m ? m[1].trim() : null; };
  meta.description = grab(/<meta[^>]+name\s*=\s*["']description["'][^>]+content\s*=\s*["']([^"']*)["']/i)
                  || grab(/<meta[^>]+property\s*=\s*["']og:description["'][^>]+content\s*=\s*["']([^"']*)["']/i);
  meta.ogSiteName  = grab(/<meta[^>]+property\s*=\s*["']og:site_name["'][^>]+content\s*=\s*["']([^"']*)["']/i);
  meta.keywords    = grab(/<meta[^>]+name\s*=\s*["']keywords["'][^>]+content\s*=\s*["']([^"']*)["']/i);

  const ogImg = grab(/<meta[^>]+property\s*=\s*["']og:image(?::url)?["'][^>]+content\s*=\s*["']([^"']*)["']/i)
             || grab(/<meta[^>]+name\s*=\s*["']twitter:image["'][^>]+content\s*=\s*["']([^"']*)["']/i);
  if (ogImg) meta.ogImage = absolutize(ogImg, baseUrl);

  // Favicon / apple-touch-icon as a logo fallback.
  const iconHref =
       grab(/<link[^>]+rel\s*=\s*["'][^"']*apple-touch-icon[^"']*["'][^>]+href\s*=\s*["']([^"']+)["']/i)
    || grab(/<link[^>]+rel\s*=\s*["'][^"']*\bicon\b[^"']*["'][^>]+href\s*=\s*["']([^"']+)["']/i);
  if (iconHref) meta.icon = absolutize(iconHref, baseUrl);

  return meta;
}

// ---------------------------------------------------------------------------
// robots.txt (best-effort, per-host, cached for the run)
// ---------------------------------------------------------------------------

const robotsCache = new Map();   // host -> { disallow: [prefixes] }

async function loadRobots(url) {
  const host = hostOf(url);
  if (!host) return { disallow: [] };
  if (robotsCache.has(host)) return robotsCache.get(host);

  let rules = { disallow: [] };
  try {
    const origin = new URL(url).origin;
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 6000);
    const res = await fetch(origin + '/robots.txt', {
      headers: { 'User-Agent': USER_AGENT }, redirect: 'follow', signal: ctl.signal,
    }).catch(() => null);
    clearTimeout(to);
    if (res && res.ok) {
      const txt = (await res.text()).slice(0, 100_000);
      rules = parseRobots(txt);
    }
  } catch { /* ignore — absence of robots = allow all */ }

  robotsCache.set(host, rules);
  return rules;
}

// Parse Disallow lines that apply to '*' (or our UA). Very small subset of the
// spec — enough to be a good citizen without over-blocking.
function parseRobots(txt) {
  const disallow = [];
  let applies = false;
  for (const lineRaw of txt.split(/\r?\n/)) {
    const line = lineRaw.replace(/#.*/, '').trim();
    if (!line) continue;
    const [k, ...rest] = line.split(':');
    const key = (k || '').trim().toLowerCase();
    const val = rest.join(':').trim();
    if (key === 'user-agent') {
      applies = val === '*' || /bellbot/i.test(val);
    } else if (key === 'disallow' && applies) {
      if (val) disallow.push(val);
    }
  }
  return { disallow };
}

export async function isAllowed(url) {
  const { disallow } = await loadRobots(url);
  if (!disallow.length) return true;
  let path = '/';
  try { path = new URL(url).pathname || '/'; } catch {}
  // A bare "Disallow: /" blocks everything; otherwise prefix-match.
  return !disallow.some(d => d === '/' ? true : path.startsWith(d));
}

// ---------------------------------------------------------------------------
// Fetch one page
// ---------------------------------------------------------------------------

/**
 * Fetch a single page. Returns:
 *   { ok, status, finalUrl, html, text, links, title, meta, mailto, tel, error }
 * ok=false means "soft skip this page" (timeout, non-html, http error, robots).
 */
// Errors worth a retry — transient network/timeout, not "the page said no".
const TRANSIENT_RX = /^(timeout|fetch_error|fetch failed|http_5\d\d)/i;

export async function fetchPage(url, opts = {}) {
  const { retries = 0, retryDelayMs = 800 } = opts;
  let res = await fetchPageOnce(url, opts);
  for (let attempt = 0; attempt < retries && !res.ok && TRANSIENT_RX.test(res.error || ''); attempt++) {
    await new Promise(r => setTimeout(r, retryDelayMs * (attempt + 1)));
    res = await fetchPageOnce(url, opts);
  }
  return res;
}

async function fetchPageOnce(url, { timeoutMs = DEFAULT_TIMEOUT_MS, respectRobots = true } = {}) {
  const blank = { ok: false, status: 0, finalUrl: url, html: '', text: '', links: [], title: null, meta: {}, mailto: [], tel: [] };

  if (respectRobots && !(await isAllowed(url))) {
    return { ...blank, error: 'robots_disallow' };
  }

  const ctl = new AbortController();
  const to = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en,ar;q=0.8',
      },
      redirect: 'follow',
      signal: ctl.signal,
    });

    const ctype = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok)               return { ...blank, status: res.status, finalUrl: res.url || url, error: 'http_' + res.status };
    if (ctype && !/text\/html|application\/xhtml|application\/xml/.test(ctype)) {
      return { ...blank, status: res.status, finalUrl: res.url || url, error: 'non_html' };
    }

    // Read with a size cap.
    const reader = res.body?.getReader?.();
    let html;
    if (reader) {
      const chunks = []; let total = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        chunks.push(value);
        if (total > MAX_BYTES) { try { await reader.cancel(); } catch {} break; }
      }
      html = Buffer.concat(chunks).toString('utf8');
    } else {
      html = (await res.text()).slice(0, MAX_BYTES);
    }

    const finalUrl = res.url || url;
    return {
      ok: true,
      status: res.status,
      finalUrl,
      html,
      text:   htmlToText(html),
      links:  extractLinks(html, finalUrl),
      meta:   extractMeta(html, finalUrl),
      title:  extractMeta(html, finalUrl).title,
      ...extractMailtoTel(html),
    };
  } catch (err) {
    const isAbort = err?.name === 'AbortError';
    return { ...blank, error: isAbort ? 'timeout' : (err?.message || 'fetch_error').slice(0, 120) };
  } finally {
    clearTimeout(to);
  }
}
