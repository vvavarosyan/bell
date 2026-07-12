// Qatar Knowledge crawler — learns official Qatar pages LOCALLY (plain fetch for
// server-rendered sites like MOFA; Crawl4AI/Firecrawl hooks come later for
// JS-heavy ones). Extracts clean readable text, stores it, and on re-crawl uses a
// content hash to detect what CHANGED — the periodic-tracking Val asked for.
// Bounded + polite + resumable-by-nature (idempotent upsert on URL).

import { createHash } from 'node:crypto';
import { query } from '../db.js';

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; BellDataIntelligence/1.0; +https://bell.qa)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const md5 = (s) => createHash('md5').update(s || '').digest('hex');

const DROP_TAGS = /<(script|style|nav|header|footer|svg|noscript|form|iframe)[\s\S]*?<\/\1>/gi;
const decode = (s) => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'").replace(/&ndash;|&mdash;/g, '-')
  .replace(/&[a-z]+;|&#\d+;/gi, ' ');

// Clean readable text + title from a page's HTML.
export function extractContent(html) {
  const titleM = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const h1M = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const title = decode((h1M ? h1M[1] : (titleM ? titleM[1] : '')).replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
  // Prefer <main> / <article> if present, else <body>.
  let body = html;
  const mainM = html.match(/<(main|article)[^>]*>([\s\S]*?)<\/\1>/i);
  if (mainM) body = mainM[2];
  else { const b = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i); if (b) body = b[1]; }
  const text = decode(body.replace(DROP_TAGS, ' ').replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').replace(/\s{3,}/g, '  ').trim();
  return { title, text };
}

// In-prefix same-site links (for BFS crawling).
export function extractLinks(html, baseUrl, prefix) {
  const out = new Set();
  const re = /href\s*=\s*["']([^"'#?]+)/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    let href = m[1].trim();
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) continue;
    if (/\.(pdf|jpg|jpeg|png|gif|svg|zip|doc|docx|xls|xlsx|mp4|css|js)$/i.test(href)) continue;
    try {
      const u = new URL(href, baseUrl);
      u.hash = ''; u.search = '';
      const s = u.toString();
      if (s.startsWith(prefix)) out.add(s.replace(/\/$/, ''));
    } catch { /* skip */ }
  }
  return [...out];
}

async function fetchHtml(url, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(url, { headers: HEADERS, redirect: 'follow' });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const ct = r.headers.get('content-type') || '';
      if (!/text\/html|application\/xhtml/.test(ct)) return null;
      return await r.text();
    } catch (e) { last = e; await sleep(500 * (i + 1)); }
  }
  throw last;
}

// Upsert one page; returns 'new' | 'changed' | 'same'.
async function upsertPage(source, url, title, text) {
  const hash = md5(text);
  const wc = text ? text.split(/\s+/).length : 0;
  const lang = /[؀-ۿ]/.test(text) && !/[a-z]{4}/i.test(text.slice(0, 400)) ? 'ar' : 'en';
  const existing = (await query(`SELECT id, content_hash FROM knowledge_pages WHERE url = $1`, [url])).rows[0];
  const tsExpr = `setweight(to_tsvector('simple', coalesce($3,'')),'A') || setweight(to_tsvector('simple', coalesce($4,'')),'B')`;
  if (!existing) {
    const r = await query(
      `INSERT INTO knowledge_pages (source_id, url, title, content, content_hash, lang, word_count, ts, changed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7, ${tsExpr}, now()) RETURNING id`,
      [source.id, url, title, text, hash, lang, wc]);
    await query(`INSERT INTO knowledge_changes (page_id, url, title, source_name, kind) VALUES ($1,$2,$3,$4,'new')`,
      [r.rows[0].id, url, title, source.name]);
    return 'new';
  }
  if (existing.content_hash === hash) {
    await query(`UPDATE knowledge_pages SET fetched_at = now() WHERE id = $1`, [existing.id]);
    return 'same';
  }
  await query(
    `UPDATE knowledge_pages SET title=$3, content=$4, content_hash=$5, lang=$6, word_count=$7,
       ts = ${tsExpr}, fetched_at = now(), changed_at = now(), updated_at = now() WHERE id=$1`,
    [existing.id, url, title, text, hash, lang, wc]);
  await query(`INSERT INTO knowledge_changes (page_id, url, title, source_name, kind) VALUES ($1,$2,$3,$4,'changed')`,
    [existing.id, url, title, source.name]);
  return 'changed';
}

// Crawl one source (BFS within its url_prefix, up to max_pages).
export async function crawlSource(source, { onProgress = () => {} } = {}) {
  const prefix = (source.url_prefix || source.base_url).replace(/\/$/, '') + '/';
  const maxPages = Math.min(Number(source.max_pages) || 300, 1000);
  const seen = new Set();
  const queue = [source.base_url.replace(/\/$/, '')];
  const stats = { fetched: 0, new: 0, changed: 0, same: 0, errors: 0 };
  while (queue.length && stats.fetched < maxPages) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    let html;
    try { html = await fetchHtml(url); } catch { stats.errors++; continue; }
    if (!html) continue;
    const { title, text } = extractContent(html);
    if (text && text.length > 200) {
      try { const r = await upsertPage(source, url, title, text); stats[r]++; } catch { stats.errors++; }
    }
    stats.fetched++;
    for (const link of extractLinks(html, url, prefix)) if (!seen.has(link) && queue.length + stats.fetched < maxPages * 3) queue.push(link);
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
