// ⚠ PARKED 2026-07-13 (NOT wired into scan_knowledge.js; NOT run). Hukoomi's full
// service list is behind a SESSION-authenticated API (POST api-ra.qdf.gov.qa/
// searchapi/search/categories → 403 on replay; static apikey doesn't authorize).
// A crawler on a rotating token is fragile (silent stale data) → parked, see
// `Bell — Hukoomi Source (Phase 6 KB) — Recon + Plan.md`. This file is the WIP
// starting point; discovery must be re-wired to the (auth) services API, and the
// renderer must POST /crawl directly with wait_selector:"css:.service-card" +
// settle_ms (crawl4aiRender only forwards wait_for=page_timeout).
//
// Hukoomi (hukoomi.gov.qa) — Qatar's one-stop government-services portal: the fees,
// steps, required documents and responsible entity for hundreds of services. It's
// behind Cloudflare + a Next.js/Sitecore SPA whose service lists load client-side,
// so plain fetch is dead here — we render every page through Bell's own Crawl4AI
// engine (a real browser that passes the Cloudflare challenge; confirmed live
// 2026-07-13). Everything stored is verbatim from the page (Rule 2.1).
//
// Structure (mapped live):
//   /en/categories                        → 15 category URLs
//   /en/categories/<cat>                  → service cards (wait for .service-card)
//   /en/categories/<cat>/<service-slug>   → Description · Steps · Fees · Additional
// The service slug is the service title slugified (validated per page).

import { query } from '../db.js';
import { crawl4aiRender, crawl4aiAvailable } from '../enrichment/local/crawl4ai.js';
import { extractContent, upsertPage } from './crawl.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE = 'https://hukoomi.gov.qa';

const decode = (s) => String(s || '')
  .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;|&lsquo;/g, "'")
  .replace(/&quot;/g, '"').replace(/&[a-z]+;|&#x?[0-9a-f]+;/gi, ' ');

export function slugifyService(title) {
  return decode(title).toLowerCase().replace(/['']/g, '').replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// Category URLs from the rendered /en/categories page.
export function categoryUrls(html) {
  const out = new Set();
  for (const m of html.matchAll(/\/en\/categories\/[a-z0-9-]+/gi)) out.add(m[0]);
  return [...out];
}

// Service card titles from a rendered category page (cards carry no href — the
// title slugified is the service URL). Grab the title <p> inside each service-card.
export function serviceTitles(html) {
  const out = new Set();
  for (const m of html.matchAll(/service-card--description-container[^>]*>\s*<p[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = decode(m[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim();
    if (t.length > 4 && t.length < 160) out.add(t);
  }
  return [...out];
}

// Is a rendered page a real service page (vs a redirect / not-found / shell)?
function isServicePage(html, expectedTitle) {
  if (!/>\s*Fees\s*</i.test(html) && !/>\s*Steps\s*</i.test(html)) return false;
  const { title } = extractContent(html);
  // the page title should relate to the service we asked for
  const a = slugifyService(title), b = slugifyService(expectedTitle);
  return a.includes(b.slice(0, 20)) || b.includes(a.slice(0, 20)) || a === b;
}

async function saveCursor(source, patch) {
  await query(`UPDATE knowledge_sources SET config = coalesce(config,'{}'::jsonb) || $2::jsonb, updated_at = now() WHERE id = $1`,
    [source.id, JSON.stringify(patch)]);
}

// Crawl Hukoomi. Resumable per-category via config.done_categories; bounded by
// max_pages services PER RUN (polite — Cloudflare throttles rapid clients).
export async function crawlHukoomi(source, { onProgress = () => {} } = {}) {
  const stats = { fetched: 0, new: 0, changed: 0, same: 0, errors: 0, skipped: 0 };
  if (!(await crawl4aiAvailable())) {
    onProgress('Crawl4AI engine is not running — start it (Install Always-On Engine / the Crawl4AI service on :11235), then re-run.');
    stats.errors++; stats.unavailable = true; return stats;
  }
  const cfg = source.config || {};
  const perRun = Math.min(Number(source.max_pages) || 120, 600);
  const done = new Set(cfg.done_categories || []);

  // 1) categories
  const catPage = await crawl4aiRender(`${BASE}/en/categories`, { waitFor: 'category', timeoutMs: 60000 });
  if (!catPage) { onProgress('Could not render the categories page.'); stats.errors++; return stats; }
  const cats = categoryUrls(catPage.html).filter((c) => !/\/categories$/.test(c));
  onProgress(`${cats.length} categories`);

  for (const cat of cats) {
    if (done.has(cat)) continue;
    if (stats.fetched >= perRun) break;
    const catPg = await crawl4aiRender(BASE + cat, { waitFor: 'service-card', timeoutMs: 70000 });
    if (!catPg) { stats.errors++; continue; }
    const titles = serviceTitles(catPg.html);
    onProgress(`${cat.split('/').pop()}: ${titles.length} services`);
    await sleep(1200);

    for (const title of titles) {
      if (stats.fetched >= perRun) break;
      const url = `${BASE}${cat}/${slugifyService(title)}`;
      const svc = await crawl4aiRender(url, { waitFor: 'Fees', timeoutMs: 70000 });
      if (!svc || !svc.html) { stats.errors++; await sleep(1000); continue; }
      if (!isServicePage(svc.html, title)) { stats.skipped++; await sleep(900); continue; }
      const { title: t, text } = extractContent(svc.html);
      if (text && text.length > 150) {
        try { const k = await upsertPage(source, url, t || title, text); stats[k]++; stats.fetched++; }
        catch { stats.errors++; }
      } else stats.skipped++;
      await sleep(1100);   // polite — Cloudflare/WAF paces rapid clients
    }
    done.add(cat);
    await saveCursor(source, { done_categories: [...done] });
  }

  // A full pass over every category → reset the resume set so the next scan re-checks for changes.
  if (cats.every((c) => done.has(c))) { await saveCursor(source, { done_categories: [] }); stats.done = true; }
  await query(`UPDATE knowledge_sources SET last_crawled_at = now(), updated_at = now() WHERE id = $1`, [source.id]);
  return stats;
}
