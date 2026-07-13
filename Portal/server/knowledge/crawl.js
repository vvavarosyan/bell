// Qatar Knowledge crawler — learns official Qatar pages LOCALLY (plain fetch for
// server-rendered sites). Extracts clean readable text, stores it, extracts
// conservative entities, and on re-crawl uses a content hash to detect what
// CHANGED — the periodic tracking Val asked for. Bounded, polite, resumable by
// nature (idempotent upsert on URL).
//
// Per-source `config` (jsonb on knowledge_sources) tunes the crawl without code
// changes — this is how one generic crawler handles very different gov sites:
//   • follow_query    (bool)  keep query strings when following links (ASP.NET
//                             sites like cm.gov.qa navigate via ?params).
//   • insecure_tls    (bool)  relax the cert check for THIS host only (e.g. a
//                             site that serves an incomplete certificate chain).
//   • include_pattern (regex) only follow links whose URL matches this.
//   • exclude_pattern (regex) never follow links whose URL matches this (e.g.
//                             an Arabic "/ar/" mirror when we want English).
// www/non-www hosts are always treated as the same site.

import { createHash } from 'node:crypto';
import https from 'node:https';
import http from 'node:http';
import { query } from '../db.js';
import { extractEntities } from './entities.js';

const UA = 'Mozilla/5.0 (compatible; BellDataIntelligence/1.0; +https://bell.qa)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => createHash('md5').update(s || '').digest('hex');

// Drop non-content elements. NOTE: we do NOT drop <form> — ASP.NET WebForms wrap
// the ENTIRE page body in one <form runat="server">, so dropping it would nuke
// all content. Instead we drop the individual form CONTROLS below.
const DROP_TAGS = /<(script|style|nav|header|footer|svg|noscript|iframe)[\s\S]*?<\/\1>/gi;
const DROP_CONTROLS = /<(select|button|textarea|option)[\s\S]*?<\/\1>|<input\b[^>]*>/gi;
const decode = (s) => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#0*39;|&#x0*27;|&rsquo;|&lsquo;|&#x0*201[89];/gi, "'")   // apostrophes (incl. hex &#x2019;)
  .replace(/&ldquo;|&rdquo;|&#x0*201[cd];/gi, '"')                    // curly quotes
  .replace(/&ndash;|&mdash;|&#x0*201[34];/gi, '-')                    // en/em dash
  .replace(/&#x0*d;|&#x0*a;|&#0*13;|&#0*10;/gi, ' ')                  // CR/LF entities → space
  .replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, ' ');                         // any remaining named/numeric → space

const stripHostWww = (host) => String(host || '').replace(/^www\./i, '').toLowerCase();

// No legitimate Qatar gov page approaches this (largest observed ~1.7MB). The cap
// bounds memory on the 8GB Mac AND bounds every downstream regex (extractContent,
// lawBody, extractLinks) against an adversarial/oversized body — we fail loud and
// skip rather than parse a truncated page (Rule 2.1).
const MAX_HTML_BYTES = 8 * 1024 * 1024;

// Manual GET (unified path) — follows redirects; only returns HTML content types.
// TLS relaxation (insecure) is scoped to the ORIGINATING host ONLY: a cross-host
// redirect is always validated normally, so the almeezan cert exception can never
// silently extend to another host reached via a 3xx. Response body is byte-capped.
export function httpGet(url, { insecure = false, maxRedirects = 6, timeout = 25000, maxBytes = MAX_HTML_BYTES } = {}) {
  return new Promise((resolve) => {
    let originHost;
    try { originHost = stripHostWww(new URL(url).host); } catch { return resolve({ error: 'bad url' }); }
    let redirects = 0;
    const go = (u) => {
      let parsed;
      try { parsed = new URL(u); } catch (e) { return resolve({ error: 'bad url' }); }
      const mod = parsed.protocol === 'http:' ? http : https;
      const relax = insecure && stripHostWww(parsed.host) === originHost;   // this-host-only
      const req = mod.request(u, {
        method: 'GET',
        headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml' },
        rejectUnauthorized: !relax,
        timeout,
      }, (res) => {
        if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location && redirects < maxRedirects) {
          redirects++; res.resume();
          try { return go(new URL(res.headers.location, u).toString()); } catch { return resolve({ error: 'bad redirect' }); }
        }
        const ct = res.headers['content-type'] || '';
        if (res.statusCode !== 200) { res.resume(); return resolve({ status: res.statusCode, ct, html: null }); }
        if (!/text\/html|application\/xhtml/.test(ct)) { res.resume(); return resolve({ status: 200, ct, html: null }); }
        const declared = Number(res.headers['content-length']);
        if (Number.isFinite(declared) && declared > maxBytes) { res.resume(); req.destroy(); return resolve({ error: 'too large' }); }
        const chunks = [];
        let total = 0;
        res.on('data', (c) => {
          total += c.length;
          if (total > maxBytes) { req.destroy(); resolve({ error: 'too large' }); return; }
          chunks.push(c);
        });
        res.on('end', () => resolve({ status: 200, ct, html: Buffer.concat(chunks).toString('utf8'), finalUrl: u }));
      });
      req.on('timeout', () => { req.destroy(); resolve({ error: 'timeout' }); });
      req.on('error', (e) => resolve({ error: e.message }));
      req.end();
    };
    go(url);
  });
}

async function fetchHtml(url, { insecure = false, tries = 3 } = {}) {
  let last;
  for (let i = 0; i < tries; i++) {
    const r = await httpGet(url, { insecure });
    if (r.html != null) return r.html;
    if (r.status && r.status !== 200) return null;   // real HTTP error / non-HTML → don't retry forever
    last = r.error || ('HTTP ' + r.status);
    await sleep(500 * (i + 1));
  }
  throw new Error(last || 'fetch failed');
}

// Words that, together with the source's own name, mark a candidate as the SITE
// name rather than a page title (so "The Shura Council State of Qatar" is rejected).
const GENERIC_TITLE_WORDS = new Set(['the', 'of', 'state', 'qatar', 'portal', 'official', 'home', 'welcome', 'to', 'and', 'a', 'an', 'for', 'en', 'ar', 'website', 'gov']);
const titleCase = (s) => String(s || '').replace(/\s+/g, ' ').trim().replace(/\b\w/g, (m) => m.toUpperCase());
const humanizeSlug = (url) => {
  try {
    const seg = new URL(url).pathname.split('/').filter(Boolean).pop() || '';
    return titleCase(seg.replace(/\.(aspx|html?|php)$/i, '').replace(/[-_]+/g, ' '));
  } catch { return ''; }
};
// A candidate is the site name if ALL its words come from the source name + generic set.
function isSiteName(cand, sourceName) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z؀-ۿ\s]/g, ' ').split(/\s+/).filter(Boolean);
  const c = norm(cand);
  if (!c.length) return true;
  const site = new Set([...norm(sourceName), ...GENERIC_TITLE_WORDS]);
  return c.every((w) => site.has(w));
}
// Pick the best real page title. Many Qatar portals put the site name in <h1> and the
// page-specific title in the FIRST <title> segment (GTA "taxes-info | GTA"), an
// og:title (QFC), or only in the URL slug (Shura). We reject site-name and error-shell
// candidates (using the source's own name) and fall through to the humanised slug.
export function pickTitle(html, url = '', sourceName = '') {
  const clean = (s) => decode(String(s || '').replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  const errish = (s) => !s || /\berror\b|خطأ/i.test(s);
  const og = clean((html.match(/<meta[^>]+property=["']og:title["'][^>]*content=["']([^"']+)/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:title/i) || [])[1]);
  const raw = clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1]);
  const h1 = clean((html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]);
  const h2 = clean((html.match(/<h2[^>]*>([\s\S]*?)<\/h2>/i) || [])[1]);
  const segs = raw.split(/\s+[|»·–—]\s+|\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  // The page-specific part of <title>: its first segment when there's a "Page | Site"
  // separator, else the WHOLE <title> (SharePoint leaf pages are often just "Who We Are").
  const firstSeg = segs.length > 1 ? segs[0] : raw;
  const slug = humanizeSlug(url);
  // Title-case a candidate that is a lowercase slug/word ("laws", "taxes-info") but
  // leave a real phrase that already has capitals ("What is Qatar…") or Arabic alone.
  const maybeHumanize = (s) => (/^[a-z0-9][a-z0-9 _-]*$/.test(s) ? titleCase(s.replace(/[-_]+/g, ' ')) : s);
  // SharePoint often renders the title twice ("Who We Are Who We Are") — collapse it.
  const dedupePhrase = (s) => s.replace(/^(.{2,}?)\s+\1$/i, '$1').trim();
  for (const c of [og, firstSeg, h1, h2]) {
    if (c && !errish(c) && !isSiteName(c, sourceName)) return dedupePhrase(maybeHumanize(c));
  }
  if (slug && !errish(slug)) return slug;
  return (raw && !errish(raw)) ? raw : slug;
}

// Clean readable text + title from a page's HTML. Pass {url, sourceName} for the best
// title (see pickTitle); the bare call still works for callers that don't have them.
export function extractContent(html, { url = '', sourceName = '' } = {}) {
  const title = pickTitle(html, url, sourceName);
  // Prefer <main> / <article> if present, else <body>.
  let body = html;
  const mainM = html.match(/<(main|article)[^>]*>([\s\S]*?)<\/\1>/i);
  if (mainM && mainM[2].replace(/<[^>]+>/g, '').trim().length > 120) body = mainM[2];
  else { const b = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i); if (b) body = b[1]; }
  const text = decode(body.replace(DROP_TAGS, ' ').replace(DROP_CONTROLS, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').replace(/\s{3,}/g, '  ').trim();
  return { title, text };
}

// In-prefix same-site links (for BFS crawling), honouring per-source options.
export function extractLinks(html, baseUrl, prefix, opts = {}) {
  const { followQuery = false, includeRe = null, excludeRe = null } = opts;
  const out = new Set();
  const prefixHost = stripHostWww(new URL(prefix).host);
  const prefixPath = new URL(prefix).pathname;
  const re = /href\s*=\s*["']([^"'#]+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = decode(m[1].trim());
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
    if (/\.(pdf|jpe?g|png|gif|svg|zip|docx?|xlsx?|pptx?|mp4|mp3|css|js|ico|woff2?)($|\?)/i.test(href)) continue;
    try {
      const u = new URL(href, baseUrl);
      u.hash = '';
      if (!followQuery) u.search = '';
      const sameHost = stripHostWww(u.host) === prefixHost;
      if (!sameHost) continue;
      if (!u.pathname.startsWith(prefixPath)) continue;
      const s = u.toString();
      if (excludeRe && excludeRe.test(s)) continue;
      if (includeRe && !includeRe.test(s)) continue;
      out.add(followQuery ? s : s.replace(/\/$/, ''));
    } catch { /* skip */ }
  }
  return [...out];
}

// Language by DOMINANCE, not presence: the old rule flipped any page with a 4-letter
// Latin run in the first 400 chars to 'en', which mislabeled ~1,750 Arabic Al Meezan
// laws (their pages carry a little Latin site-chrome) as English. Compare the Arabic
// vs Latin letter COUNT over a generous sample instead.
export const detectLang = (text) => {
  const sample = String(text || '').slice(0, 3000);
  const ar = (sample.match(/[؀-ۿ]/g) || []).length;
  const la = (sample.match(/[A-Za-z]/g) || []).length;
  return ar > la ? 'ar' : 'en';
};

// A soft-404 / error shell: the server answered 200 but the page is a not-found or
// access-denied placeholder (Sitecore/SharePoint sites do this). We must never store
// one as knowledge (Rule 2.1 — a "404 Page" leaked in from Amiri Diwan). Just as
// important: we must NEVER drop a REAL page whose title merely CONTAINS an error word
// or a number like 404 — a Qatar law "Decision No. 404 of 2015" or a list "404 results
// found" is real content. So the title rules are anchored to the WHOLE title (the
// title IS the error page), never a leading substring; there is no bare-"404" rule.
// The body rule only fires on a short page dominated by a not-found message.
export function isErrorShell(title, text) {
  const t = String(title || '').trim();
  // The entire title is an HTTP status line: "404", "404 Page", "403 Forbidden",
  // "500 Internal Server Error". A trailing word is allowed ONLY from the status set,
  // so "404 results found" / "406 of the Civil Code" do NOT match.
  if (/^(40\d|41\d|50\d)(\s*[-–—:|]?\s*(page|error|not\s*found|forbidden|unauthori[sz]ed|bad\s*request|internal\s*server\s*error|service\s*unavailable))?\.?\s*$/i.test(t)) return true;
  if (/^error\s*[-–—:|]?\s*(40\d|41\d|50\d)\b/i.test(t)) return true;                 // "Error 404"
  // The entire title IS a standalone not-found / denied phrase (anchored to $, so
  // "Forbidden Weapons Import Law" and "Not Found Property Records Act" are kept).
  if (/^(page not found|not found|the (web\s?)?page (cannot|can['’]?t|could not|couldn['’]?t) be found|access denied|not authori[sz]ed|unauthori[sz]ed|forbidden|bad request|service unavailable|error)\s*$/i.test(t)) return true;
  // Short page whose BODY is a not-found message. The SUBJECT must be the PAGE/URL
  // itself ("the page", "the requested url", "page you requested") — never a bare
  // "document"/"content"/"right", so a real legal clause like "the right does not
  // exist prior to registration" is kept (Rule 2.1 — never drop a real page).
  const body = String(text || '');
  if (body.length < 700 &&
      /\b(this (web\s?)?page|the (web\s?)?page|the requested (url|page|content)|page (you (requested|were looking for|are looking for)|that you requested))\b[\s\S]{0,40}\b(cannot be found|could not be found|couldn['’]?t be found|can['’]?t be found|was not found|does not exist|is no longer available|is not available)\b/i.test(body)) return true;
  // Lorem-ipsum placeholder text is not real knowledge (a MoPH page shipped with it).
  if (/\blorem ipsum dolor\b/i.test(body)) return true;
  return false;
}

// Upsert one page (+ entities); returns 'new' | 'changed' | 'same'.
export async function upsertPage(source, url, title, text) {
  const hash = md5(text);
  const wc = text ? text.split(/\s+/).length : 0;
  const lang = detectLang(text);
  // Extract from title + body: a law's OWN citation (and officials' names) live
  // in the title, while referenced laws live in the body.
  const ent = extractEntities(`${title || ''}\n${text}`);
  const entJson = JSON.stringify(ent || {});   // {} (not NULL) so the backfill never re-scans it
  const existing = (await query(`SELECT id, content_hash FROM knowledge_pages WHERE url = $1`, [url])).rows[0];
  // INSERT: title=$3, content=$4 → tsIns references $3/$4.
  const tsIns = `setweight(to_tsvector('simple', coalesce($3,'')),'A') || setweight(to_tsvector('simple', coalesce($4,'')),'B')`;
  if (!existing) {
    const r = await query(
      `INSERT INTO knowledge_pages (source_id, url, title, content, content_hash, lang, word_count, entities, ts, changed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb, ${tsIns}, now()) RETURNING id`,
      [source.id, url, title, text, hash, lang, wc, entJson]);
    await query(`INSERT INTO knowledge_changes (page_id, url, title, source_name, kind) VALUES ($1,$2,$3,$4,'new')`,
      [r.rows[0].id, url, title, source.name]);
    return 'new';
  }
  if (existing.content_hash === hash) {
    // Content unchanged — but REFRESH derived fields (title/lang/entities) in case the
    // extractor improved since the last crawl. This is not a content change: no
    // changed_at bump, no change-feed row. updated_at advances only when a derived
    // field actually changed, so the prod mirror re-syncs the correction and nothing
    // else. (We already wrote fetched_at every 'same' page, so this adds no writes.)
    const tsSame = `setweight(to_tsvector('simple', coalesce($2,'')),'A') || setweight(to_tsvector('simple', coalesce(content,'')),'B')`;
    await query(
      `UPDATE knowledge_pages
          SET title=$2, lang=$3, entities=$4::jsonb, word_count=$5, ts=${tsSame}, fetched_at=now(),
              updated_at = CASE WHEN title IS DISTINCT FROM $2 OR lang IS DISTINCT FROM $3
                                OR entities IS DISTINCT FROM $4::jsonb THEN now() ELSE updated_at END
        WHERE id=$1`,
      [existing.id, title, lang, entJson, wc]);
    return 'same';
  }
  // UPDATE: its OWN param list (no url) — title=$2, content=$3 → tsUpd references
  // $2/$3. Postgres rejects an unused parameter ("could not determine data type
  // of parameter $N"), so every placeholder here is referenced.
  const tsUpd = `setweight(to_tsvector('simple', coalesce($2,'')),'A') || setweight(to_tsvector('simple', coalesce($3,'')),'B')`;
  await query(
    `UPDATE knowledge_pages SET title=$2, content=$3, content_hash=$4, lang=$5, word_count=$6, entities=$7::jsonb,
       ts = ${tsUpd}, fetched_at = now(), changed_at = now(), updated_at = now() WHERE id=$1`,
    [existing.id, title, text, hash, lang, wc, entJson]);
  await query(`INSERT INTO knowledge_changes (page_id, url, title, source_name, kind) VALUES ($1,$2,$3,$4,'changed')`,
    [existing.id, url, title, source.name]);
  return 'changed';
}

function compileRe(pat) { if (!pat) return null; try { return new RegExp(pat, 'i'); } catch { return null; } }

// Crawl one source (BFS within its url_prefix, up to max_pages).
export async function crawlSource(source, { onProgress = () => {} } = {}) {
  const cfg = source.config || {};
  const prefix = (source.url_prefix || source.base_url).replace(/\/$/, '') + '/';
  const maxPages = Math.min(Number(source.max_pages) || 300, 2000);
  const linkOpts = {
    followQuery: !!cfg.follow_query,
    includeRe: compileRe(cfg.include_pattern),
    excludeRe: compileRe(cfg.exclude_pattern),
  };
  const insecure = !!cfg.insecure_tls;
  const seen = new Set();
  const queue = [source.base_url.replace(/\/$/, '')];
  const stats = { fetched: 0, new: 0, changed: 0, same: 0, errors: 0 };
  while (queue.length && stats.fetched < maxPages) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    let html;
    try { html = await fetchHtml(url, { insecure }); } catch { stats.errors++; continue; }
    if (!html) continue;
    const { title, text } = extractContent(html, { url, sourceName: source.name });
    const shell = isErrorShell(title, text);
    if (text && text.length > 200 && !shell) {
      try { const r = await upsertPage(source, url, title, text); stats[r]++; } catch { stats.errors++; }
    } else if (shell) { stats.skipped = (stats.skipped || 0) + 1; }
    stats.fetched++;
    // Don't harvest links from a not-found shell — its links are only nav chrome,
    // already reachable from real pages; following them just wastes the page budget.
    if (!shell) for (const link of extractLinks(html, url, prefix, linkOpts)) if (!seen.has(link) && queue.length + stats.fetched < maxPages * 3) queue.push(link);
    if (stats.fetched % 10 === 0) onProgress(`${source.name}: ${stats.fetched} pages (${stats.new} new, ${stats.changed} changed)`);
    await sleep(400);   // polite
  }
  await query(`UPDATE knowledge_sources SET last_crawled_at = now(), updated_at = now() WHERE id = $1`, [source.id]);
  return stats;
}

export async function knowledgeTablesReady() {
  try { return !!(await query(`SELECT to_regclass('public.knowledge_pages') AS t`)).rows[0].t; }
  catch { return false; }
}

// Re-detect language for ALL stored pages using the same Arabic-vs-Latin dominance
// rule as detectLang(), in ONE SQL pass (no content pulled into JS on the 8 GB Mac).
// This corrects pages labelled before the ratio fix — notably ~1,750 Arabic Al Meezan
// laws stored as 'en' whose id-walk would otherwise only relabel them slowly. Only
// rows whose label actually changes are written (so the prod mirror re-syncs just
// those). Idempotent. Returns #relabelled.
export async function relabelLanguages() {
  const r = await query(`
    UPDATE knowledge_pages p
       SET lang = d.newlang, updated_at = now()
      FROM (
        SELECT id,
               CASE WHEN char_length(regexp_replace(left(content, 3000), '[^؀-ۿ]', '', 'g'))
                       > char_length(regexp_replace(left(content, 3000), '[^A-Za-z]', '', 'g'))
                    THEN 'ar' ELSE 'en' END AS newlang
          FROM knowledge_pages
         WHERE content IS NOT NULL
      ) d
     WHERE p.id = d.id AND p.lang IS DISTINCT FROM d.newlang`);
  return r.rowCount || 0;
}

// Compute entities for pages that don't have them yet (e.g. crawled before entity
// extraction existed). Idempotent; safe to run every scan. Returns #updated.
export async function backfillEntities({ onProgress = () => {} } = {}) {
  const rows = (await query(`SELECT id, title, content FROM knowledge_pages WHERE entities IS NULL AND content IS NOT NULL`)).rows;
  let n = 0;
  for (const row of rows) {
    // Mirror the live upsertPage path (title + body) — a law's own citation lives
    // in the title, so extracting from content alone would drop it.
    const ent = extractEntities(`${row.title || ''}\n${row.content}`);
    // Store the result (even when null) so we never re-scan the same page: use a
    // JSON 'null' sentinel via COALESCE so the WHERE entities IS NULL stops matching.
    await query(`UPDATE knowledge_pages SET entities = $2::jsonb, updated_at = now() WHERE id = $1`,
      [row.id, ent ? JSON.stringify(ent) : JSON.stringify({})]);
    n++;
    if (n % 50 === 0) onProgress(`entities backfilled: ${n}/${rows.length}`);
  }
  return n;
}
