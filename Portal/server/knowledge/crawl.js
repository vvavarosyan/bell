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

// Clean readable text + title from a page's HTML.
export function extractContent(html) {
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = decode((h1M ? h1M[1] : (titleM ? titleM[1] : '')).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
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

const detectLang = (text) => (/[؀-ۿ]/.test(text) && !/[a-z]{4}/i.test(text.slice(0, 400)) ? 'ar' : 'en');

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
  const tsExpr = `setweight(to_tsvector('simple', coalesce($3,'')),'A') || setweight(to_tsvector('simple', coalesce($4,'')),'B')`;
  if (!existing) {
    const r = await query(
      `INSERT INTO knowledge_pages (source_id, url, title, content, content_hash, lang, word_count, entities, ts, changed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb, ${tsExpr}, now()) RETURNING id`,
      [source.id, url, title, text, hash, lang, wc, entJson]);
    await query(`INSERT INTO knowledge_changes (page_id, url, title, source_name, kind) VALUES ($1,$2,$3,$4,'new')`,
      [r.rows[0].id, url, title, source.name]);
    return 'new';
  }
  if (existing.content_hash === hash) {
    await query(`UPDATE knowledge_pages SET fetched_at = now() WHERE id = $1`, [existing.id]);
    return 'same';
  }
  await query(
    `UPDATE knowledge_pages SET title=$3, content=$4, content_hash=$5, lang=$6, word_count=$7, entities=$8::jsonb,
       ts = ${tsExpr}, fetched_at = now(), changed_at = now(), updated_at = now() WHERE id=$1`,
    [existing.id, url, title, text, hash, lang, wc, entJson]);
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
    const { title, text } = extractContent(html);
    if (text && text.length > 200) {
      try { const r = await upsertPage(source, url, title, text); stats[r]++; } catch { stats.errors++; }
    }
    stats.fetched++;
    for (const link of extractLinks(html, url, prefix, linkOpts)) if (!seen.has(link) && queue.length + stats.fetched < maxPages * 3) queue.push(link);
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
