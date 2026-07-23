#!/usr/bin/env node
/**
 * Qatar Chamber — Commercial & Industrial Directory (qatarcid.com) scraper.
 * --------------------------------------------------------------------------
 * qatarcid.com is behind a Cloudflare anti-bot challenge, so a plain local
 * browser can't reach it. Two execution modes:
 *
 *   • MODE=firecrawl (default) — uses your Firecrawl account (clears Cloudflare
 *     via proxies). FULL harvest in two phases:
 *       1. ENUMERATE every company URL by paging each category at 200/page
 *          (?pfg_number=200&page=N) and reading the pagination to find the last
 *          page.  (~1 credit per category page → a few hundred credits total)
 *       2. BATCH-SCRAPE every listing page as markdown (~1 credit/page) and
 *          parse it with parse_listing.js.
 *
 *   • MODE=proxy (future) — once you add rotating residential proxies, re-fetch
 *     scans/_debug/listing_urls.json locally for FREE. The parser is shared.
 *
 * Output:  scans/qatarcid_companies_latest.json   (metadata header + companies[])
 *          scans/_debug/listing_urls.json          (every discovered listing URL)
 *
 * Setup (one time):  run "Set Firecrawl API Key.command"
 * Run:               run "Run Scan Now.command"
 * Resume scrape with already-enumerated URLs:  QATARCID_REUSE_URLS=1
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { parseListing, slugFromUrl } = require('./parse_listing.js');

const SOURCE_NAME = 'Qatar Chamber - Commercial & Industrial Directory';
const SITE = 'https://www.qatarcid.com';
const API = 'https://api.firecrawl.dev/v2';
const OUT = path.join(__dirname, 'scans');
const DBG = path.join(OUT, '_debug');
const CKPT = path.join(DBG, 'scraped.jsonl');   // crash-safe checkpoint (one page/line)
const MODE = (process.env.SCRAPE_MODE || 'firecrawl').toLowerCase();
const REUSE_URLS = process.env.QATARCID_REUSE_URLS === '1';
const PER_PAGE = 200;                                   // ?pfg_number=
const BATCH_SIZE = Number(process.env.QATARCID_BATCH || 1500);
const LIMIT = Number(process.env.QATARCID_LIMIT || 0);  // 0 = no cap (full site)

// Top-level categories (every listing lives under one of these).
const CATEGORIES = [
  'agriculture', 'banks-and-exchange', 'contracting', 'industry', 'investment',
  'services', 'tourism', 'trade', 'transport',
];

function ensure(d) { fs.mkdirSync(d, { recursive: true }); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function loadApiKey() {
  if (process.env.FIRECRAWL_API_KEY) return process.env.FIRECRAWL_API_KEY.trim();
  for (const p of [path.join(__dirname, 'firecrawl.key'), path.join(process.env.HOME || '', '.bell_firecrawl.key')]) {
    try { const k = fs.readFileSync(p, 'utf8').trim(); if (k) return k; } catch { /* next */ }
  }
  return null;
}

// fetch wrapper that retries on network drops ("terminated"), body-read errors,
// 429 and 5xx — so a transient blip never kills a long run. Backoff capped at 30s.
async function api(method, url, key, body, tries = 10) {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: { 'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429 || res.status >= 500) {
        if (attempt >= tries) throw new Error(`HTTP ${res.status} after ${tries} tries`);
        const ra = Number(res.headers.get('retry-after')) || Math.min(30, 3 * attempt);
        await sleep(ra * 1000); continue;
      }
      const text = await res.text();            // can throw "terminated" — caught below
      let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
      return json;
    } catch (e) {
      if (attempt >= tries) throw e;
      await sleep(Math.min(30000, 2000 * attempt));   // network/body error → retry
    }
  }
}

const catUrl = (cat, page) =>
  `${SITE}/listings/${cat}/?pfg_number=${PER_PAGE}&page=${page}&grid=grid2&from=halfmap`;

const isListing = (u) => /^https?:\/\/www\.qatarcid\.com\/listing\/[^/?#]+\/?$/.test(u);

async function scrapeLinks(url, key) {
  const r = await api('POST', `${API}/scrape`, key, {
    url, formats: ['links'], onlyMainContent: false, proxy: 'auto', waitFor: 3000,
  });
  return (r.data && r.data.links) || [];
}

function maxPageFrom(links, cat) {
  let max = 1;
  const re = new RegExp(`/listings/${cat}/\\?[^"' )]*\\bpage=(\\d+)`);
  for (const l of links) {
    const m = String(l).match(re);
    if (m) { const n = Number(m[1]); if (n > max) max = n; }
  }
  return max;
}

async function enumerateAll(key) {
  const urls = new Set();
  for (const cat of CATEGORIES) {
    process.stdout.write(`\n[enumerate] ${cat}: page 1…`);
    let links;
    try { links = await scrapeLinks(catUrl(cat, 1), key); }
    catch (e) { console.warn(`  (page 1 failed: ${e.message})`); continue; }
    links.filter(isListing).forEach((u) => urls.add(u.replace(/\/$/, '') + '/'));
    const last = maxPageFrom(links, cat);
    process.stdout.write(` ${last} pages`);
    for (let p = 2; p <= last; p++) {
      try {
        const lk = await scrapeLinks(catUrl(cat, p), key);
        lk.filter(isListing).forEach((u) => urls.add(u.replace(/\/$/, '') + '/'));
      } catch (e) { console.warn(`\n  ${cat} p${p} failed: ${e.message}`); }
      if (p % 10 === 0) process.stdout.write(`\r[enumerate] ${cat}: ${p}/${last}  (total urls: ${urls.size})   `);
    }
  }
  console.log(`\n[enumerate] done — ${urls.size} unique listing URLs.`);
  return [...urls];
}

// Run ONE batch-scrape job: submit, poll to completion, return parsed pages.
async function runBatchJob(chunk, key, prog) {
  const start = await api('POST', `${API}/batch/scrape`, key, {
    urls: chunk, formats: ['markdown'], onlyMainContent: true, proxy: 'auto',
  });
  const id = start.id || start.jobId;
  if (!id) { console.warn('\n  no batch id:', JSON.stringify(start).slice(0, 160)); return []; }
  let status = 'scraping';
  while (status !== 'completed' && status !== 'failed') {
    await sleep(4000);
    const s = await api('GET', `${API}/batch/scrape/${id}`, key);
    status = s.status;
    prog.live[id] = s.completed || 0;
    printProgress(prog, chunk.length, id);
    if (status === 'failed') { console.warn(`\n  batch ${id} failed`); break; }
  }
  const recs = [];
  let url = `${API}/batch/scrape/${id}`;
  while (url) {
    const page = await api('GET', url, key);
    for (const d of (page.data || [])) {
      const u = d.metadata?.sourceURL || d.metadata?.url || '';
      if (d.markdown) recs.push({ url: u, markdown: d.markdown });
    }
    url = page.next || null;
  }
  // Append to the crash-safe checkpoint immediately (so a crash never loses it).
  if (recs.length) fs.appendFileSync(CKPT, recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
  prog.done += chunk.length; delete prog.live[id];
  return recs;
}

function printProgress(prog, total, _id) {
  const live = Object.values(prog.live).reduce((a, b) => a + b, 0);
  const scraped = prog.done + live;
  process.stdout.write(`\r[scrape] ${scraped}/${prog.total} pages  (${prog.active} jobs running)        `);
}

// Run several batch jobs IN PARALLEL so Firecrawl's concurrency stays saturated.
async function batchScrape(urls, key) {
  const PARALLEL = Number(process.env.QATARCID_PARALLEL || 8);
  const chunks = [];
  for (let i = 0; i < urls.length; i += BATCH_SIZE) chunks.push(urls.slice(i, i + BATCH_SIZE));
  console.log(`[scrape] ${urls.length} pages in ${chunks.length} batches of ${BATCH_SIZE}, ${PARALLEL} in parallel`);

  const records = [];
  const prog = { done: 0, total: urls.length, live: {}, active: 0 };
  let next = 0;
  async function worker() {
    while (next < chunks.length) {
      const chunk = chunks[next++];
      prog.active++;
      // Isolate failures: a batch that errors out is left un-checkpointed and
      // simply re-scraped on the next resume — it never aborts the whole run.
      try {
        const recs = await runBatchJob(chunk, key, prog);
        for (const r of recs) records.push(r);
      } catch (e) {
        console.warn(`\n  batch failed (will retry on resume): ${e.message}`);
      }
      prog.active--;
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, chunks.length) }, worker));
  console.log('');
  return records;
}

function buildAndWrite(pages) {
  const seen = new Set();
  const companies = [];
  let failed = 0;
  for (const p of pages) {
    const rec = parseListing(p.markdown, p.url);
    if (!rec || !rec.name) { failed++; continue; }
    const k = rec.cr_number || rec.slug || slugFromUrl(p.url) || rec.name;
    if (seen.has(k)) continue;
    seen.add(k);
    companies.push(rec);
  }
  const payload = {
    source: SOURCE_NAME, source_url: SITE, scraper: 'scrape_qatarcid.js',
    scraper_version: '2.0.0', scrape_mode: MODE, scan_date: new Date().toISOString(),
    total_count: companies.length, parse_failures: failed,
    companies,
  };
  fs.writeFileSync(path.join(OUT, 'qatarcid_companies_latest.json'), JSON.stringify(payload, null, 2));
  console.log(`\nDone. Extracted ${companies.length} companies (${failed} unparseable).`);
  console.log('Wrote: scans/qatarcid_companies_latest.json');
}

(async () => {
  ensure(OUT); ensure(DBG);
  if (MODE === 'proxy') {
    console.error('SCRAPE_MODE=proxy not wired yet. Add proxies and ask Bell to build the local fetch layer.');
    process.exit(3);
  }
  const key = loadApiKey();
  if (!key) {
    console.error('No Firecrawl API key. Run "Set Firecrawl API Key.command" first.');
    process.exit(2);
  }

  // Phase 1 — enumerate (or reuse).
  const urlsFile = path.join(DBG, 'listing_urls.json');
  let urls;
  if (REUSE_URLS && fs.existsSync(urlsFile)) {
    urls = JSON.parse(fs.readFileSync(urlsFile, 'utf8')).urls || [];
    console.log(`[enumerate] reusing ${urls.length} URLs from listing_urls.json`);
  } else {
    urls = await enumerateAll(key);
    fs.writeFileSync(urlsFile, JSON.stringify({ captured_at: new Date().toISOString(), count: urls.length, urls }, null, 2));
  }
  if (LIMIT > 0) urls = urls.slice(0, LIMIT);

  // Resume-safe: skip pages already saved in the checkpoint from a prior run.
  const loadCkpt = () => {
    const out = [];
    if (!fs.existsSync(CKPT)) return out;
    for (const line of fs.readFileSync(CKPT, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try { out.push(JSON.parse(line)); } catch { /* skip bad line */ }
    }
    return out;
  };
  const doneSet = new Set(loadCkpt().map((r) => String(r.url || '').replace(/\/$/, '')));
  if (doneSet.size) console.log(`[scrape] checkpoint has ${doneSet.size} pages already done — skipping them.`);
  const remaining = urls.filter((u) => !doneSet.has(u.replace(/\/$/, '')));
  console.log(`Will scrape ${remaining.length} of ${urls.length} listing pages (~${remaining.length} credits).`);

  // Phase 2 — batch scrape (parallel, checkpointed).
  if (remaining.length) await batchScrape(remaining, key);

  // Build final output from the FULL checkpoint (everything scraped so far).
  buildAndWrite(loadCkpt());
})().catch((e) => { console.error('\nFATAL:', e.message); process.exit(1); });
