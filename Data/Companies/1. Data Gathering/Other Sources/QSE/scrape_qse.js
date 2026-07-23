#!/usr/bin/env node
/**
 * Qatar Stock Exchange (QSE) — Listed Companies scraper.
 * --------------------------------------------------------------------------
 * QSE renders its market data with JavaScript: the page boots a Liferay SPA
 * which then calls a "Market Watch" JSON endpoint:
 *
 *     https://www.qe.com.qa/wp/mw_app/mw.php
 *     → { total, page, perPage, totalPages, rows: [ {Symbol, CompanyEN,
 *         SectorEN, ISIN, Market, CompType, CompMarketCap, ...}, ... ] }
 *
 * That endpoint only answers inside a real browser session (it relies on the
 * page's cookies / origin), so we drive a headless browser (Playwright),
 * let the page make the call, capture the JSON response, and extract the
 * listed companies into our standard scan file.
 *
 * Output:  scans/qse_companies_latest.json   (metadata header + companies[])
 * Run:     click "Run Scan Now.command"  (after one-time "Install Scraper.command")
 */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SOURCE_NAME = 'QSE - Qatar Stock Exchange';
const SOURCE_URL  = 'https://www.qe.com.qa/listed-companies';
const OUT  = path.join(__dirname, 'scans');
const DBG  = path.join(OUT, '_debug');
const DATA_ENDPOINT = 'mw_app/mw.php';
// Pages that trigger the Market Watch data call. We try them in order until
// we get a populated rows[] payload.
const TARGETS = [
  'https://www.qe.com.qa/market-watch',
  'https://www.qe.com.qa/listed-companies',
  'https://www.qe.com.qa/listed-securities',
];
// CompType values that represent actual listed *companies* (not bonds/ETFs).
//   COMP = listed company (Main market) · V = Venture Market company
// BOND (debt instruments) and ETF (funds) are intentionally excluded.
const COMPANY_TYPES = new Set(['COMP', 'V']);
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function ensure(d) { fs.mkdirSync(d, { recursive: true }); }
const nz  = (v) => { const s = (v === null || v === undefined) ? '' : String(v).trim(); return s === '' ? null : s; };
const num = (v) => { const n = parseFloat(String(v).replace(/,/g, '')); return Number.isFinite(n) ? n : null; };

/** Turn one raw Market-Watch row into a clean company record. */
function mapRow(r) {
  const name = nz(r.CompanyLongEN) || nz(r.CompanyEN);
  if (!name) return null;
  return {
    symbol:       nz(r.Symbol),
    name,
    name_short:   nz(r.CompanyEN),
    name_ar:      nz(r.CompanyLongAR) || nz(r.CompanyAR),
    isin:         nz(r.ISIN),
    sector:       nz(r.SectorEN),
    sector_code:  nz(r.SectorCode),
    market:       nz(r.Market),            // Main | Venture
    comp_type:    nz(r.CompType),          // COMP | V
    listing_state: nz(r.StateEN),
    shariah:      nz(r.ShariahEN),
    market_cap:   num(r.CompMarketCap),
    free_float:   num(r.FreeFloat),
    eps:          num(r.EPS),
    pe_ratio:     num(r.PERatio),
    price_book:   num(r.PriceBook),
    last_price:   num(r.LastPrice),
    shares_outstanding: num(r.SubscribedShares),
    listed_securities_url: 'https://www.qe.com.qa/listed-securities',
  };
}

(async () => {
  ensure(OUT);
  console.log('Launching headless browser…');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ userAgent: UA, locale: 'en-US' });
  const page = await ctx.newPage();

  let rawRows = null;          // the rows[] from the data endpoint
  let rawPayloadMeta = null;   // {total,page,perPage,totalPages}

  page.on('response', async (resp) => {
    try {
      if (!resp.url().includes(DATA_ENDPOINT)) return;
      const body = await resp.text();
      const j = JSON.parse(body);
      if (j && Array.isArray(j.rows) && j.rows.length) {
        rawRows = j.rows;
        rawPayloadMeta = { total: j.total, page: j.page, perPage: j.perPage, totalPages: j.totalPages };
        console.log('  captured data feed:', j.rows.length, 'rows');
      }
    } catch { /* ignore non-JSON / partial */ }
  });

  for (const t of TARGETS) {
    if (rawRows) break;
    try {
      console.log('Loading', t, '…');
      await page.goto(t, { waitUntil: 'networkidle', timeout: 60000 });
      // give the SPA a moment to fire the data call
      for (let i = 0; i < 6 && !rawRows; i++) await page.waitForTimeout(2000);
    } catch (e) { console.warn('  load issue:', e.message); }
  }

  await browser.close();

  if (!rawRows) {
    // Could not reach the data feed — write a debug capture so we can diagnose.
    ensure(DBG);
    fs.writeFileSync(path.join(DBG, 'last_failure.txt'),
      'No mw.php rows captured at ' + new Date().toISOString() + '\nTargets:\n' + TARGETS.join('\n'));
    console.error('\nERROR: could not capture the QSE data feed. Wrote scans/_debug/last_failure.txt');
    process.exit(2);
  }

  // Extract listed companies (COMP + Venture), de-duplicated by symbol.
  const seen = new Set();
  const companies = [];
  for (const r of rawRows) {
    if (!COMPANY_TYPES.has(String(r.CompType))) continue;
    const rec = mapRow(r);
    if (!rec) continue;
    const key = rec.symbol || rec.isin || rec.name;
    if (seen.has(key)) continue;
    seen.add(key);
    companies.push(rec);
  }

  const payload = {
    source: SOURCE_NAME,
    source_url: SOURCE_URL,
    scraper: 'scrape_qse.js',
    scraper_version: '1.0.0',
    scan_date: new Date().toISOString(),
    feed_meta: rawPayloadMeta,
    total_count: companies.length,
    schema: {
      symbol: 'Trading ticker (e.g. QNBK)',
      name: 'Full company name (English)',
      name_short: 'Short/brand name (English)',
      name_ar: 'Company name (Arabic)',
      isin: 'ISIN code',
      sector: 'QSE sector (English)',
      market: 'Main | Venture',
      comp_type: 'COMP (listed company) | V (venture market)',
      market_cap: 'Company market capitalisation (QAR)',
      eps: 'Earnings per share',
      pe_ratio: 'Price/Earnings ratio',
      shares_outstanding: 'Subscribed shares',
    },
    companies,
  };

  ensure(OUT);
  fs.writeFileSync(path.join(OUT, 'qse_companies_latest.json'), JSON.stringify(payload, null, 2));

  console.log('\nExtracted', companies.length, 'listed companies.');
  console.log('Wrote: scans/qse_companies_latest.json');
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
