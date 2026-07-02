// Article-text extraction for the Market Feed summarizer (Phase B, Val
// 2026-07-02): fetch the article URL and pull out readable body text so the
// LLM can write a REAL summary instead of guessing from a headline.
// Dependency-free by design (no readability libs): a heuristic that prefers
// <article>, then aggregated <p> tags, then og:description — plenty for a
// 2-3 sentence summary, and it fails soft (returns '' → cautious title-only
// summary downstream). We never store the article text — only our summary.

const FETCH_TIMEOUT_MS = 10_000;
const MAX_EXCERPT = 3000;

// Strip a fragment of HTML down to readable text.
function textOf(fragment) {
  return decodeEntities(
    String(fragment || '')
      .replace(/<(script|style|noscript|svg|iframe|figure|form|nav|header|footer|aside)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  ).replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').trim();
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;/gi, "'").replace(/&rsquo;|&#8217;/gi, '’')
    .replace(/&ldquo;|&#8220;/gi, '“').replace(/&rdquo;|&#8221;/gi, '”').replace(/&mdash;|&#8212;/gi, '—')
    .replace(/&#(\d+);/g, (_, n) => { try { return String.fromCodePoint(Number(n)); } catch { return ' '; } });
}

/** Extract the main readable text from an article HTML page. Returns '' when
 *  nothing substantial is found. Pure — unit-testable without network. */
export function extractArticleText(html) {
  const h = String(html || '');
  if (!h) return '';

  // 1) An <article> element is the strongest signal.
  const art = h.match(/<article[\s\S]*?<\/article>/i);
  if (art) {
    const t = textOf(art[0]);
    if (t.length >= 300) return t.slice(0, MAX_EXCERPT);
  }

  // 2) Aggregate paragraph tags — take the longest run of real sentences.
  const paras = [...h.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => textOf(m[1]))
    .filter((t) => t.length >= 60 && /[a-z؀-ۿ]/i.test(t));   // skip nav crumbs; Arabic ok
  const joined = paras.join('\n');
  if (joined.length >= 300) return joined.slice(0, MAX_EXCERPT);

  // 3) Fall back to the page's own description meta. Attribute ORDER varies
  //    (content before/after property) and content often contains apostrophes,
  //    so find the tag first, then pull content with a quote-matched capture.
  const metas = [...h.matchAll(/<meta\b[^>]*>/gi)].map((m) => m[0]);
  const tag = metas.find((t) => /(?:property|name)=["'](?:og:description|twitter:description|description)["']/i.test(t));
  if (tag) {
    const c = tag.match(/content=("|')([\s\S]*?)\1/i);
    if (c) {
      const t = decodeEntities(c[2]).trim();
      if (t.length >= 60) return t.slice(0, MAX_EXCERPT);
    }
  }

  return joined.slice(0, MAX_EXCERPT); // whatever little we found (may be '')
}

/** Fetch a URL and extract article text. Fails soft: returns '' on any error.
 *  Follows redirects (Google News article URLs bounce to the publisher). */
export async function fetchArticleText(url) {
  if (!url || !/^https?:\/\//i.test(url)) return '';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BellMarketFeed/1.0; +https://bell.qa)',
        'Accept': 'text/html,application/xhtml+xml,*/*',
        'Accept-Language': 'en,ar;q=0.8',
      },
    });
    if (!res.ok) return '';
    const type = String(res.headers.get('content-type') || '');
    if (type && !/html|xml|text/i.test(type)) return '';
    const html = await res.text();
    return extractArticleText(html.slice(0, 600_000));   // cap parse work on huge pages
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

/** Fetch several article texts with a small concurrency cap. Returns a Map
 *  id → text (missing/failed fetches simply absent). */
export async function fetchArticleTexts(items, { concurrency = 5 } = {}) {
  const out = new Map();
  const queue = [...items];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length) {
      const it = queue.shift();
      if (!it) break;
      const text = await fetchArticleText(it.url);
      if (text) out.set(it.id, text);
    }
  });
  await Promise.all(workers);
  return out;
}
