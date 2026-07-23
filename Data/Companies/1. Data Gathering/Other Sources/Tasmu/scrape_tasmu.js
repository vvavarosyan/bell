#!/usr/bin/env node
/**
 * Tasmu Digital Valley — Qatar Digital Directory (MCIT) scraper.
 * ---------------------------------------------------------------------------
 * Source: https://tdv.motc.gov.qa/business-directory  (Drupal, server-rendered,
 * NO anti-bot). ~1,300 digital companies, 3 per page, each with name + website
 * + phone + email + sector + technology tags. Pagination is a plain URL param
 * (?…&page=0,N).
 *
 * Fully LOCAL — uses Node's built-in fetch + a small HTML parser. No Firecrawl,
 * no proxies, no API key, no npm dependencies.
 *
 * Output:  scans/tasmu_companies_latest.json
 * Run:     "Run Scan Now.command".
 */
'use strict';

const fs = require('fs');
const path = require('path');

const BASE = 'https://tdv.motc.gov.qa/business-directory?combine=&field_sector_reference_target_id=All&field__technology_service_target_id=All&sort_by=title&sort_order=ASC&page=0,';
const OUT  = path.join(__dirname, 'scans');
const UA   = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const MAX_PAGES = 1000;
const RETRY = 3;

const ensure = (d) => fs.mkdirSync(d, { recursive: true });
const nz = (v) => { const s = (v == null) ? '' : String(v).trim(); return s === '' ? null : s; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function stripTags(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, ' ').replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Parse one page's raw HTML into company records.
// Card shape: <h2><a href="WEBSITE" target="_blank">NAME</a></h2> … <h3>Label</h3> value …
function parseCompanies(html) {
  const out = [];
  const headRe = /<h2>\s*<a\s+href="([^"]+)"[^>]*>([^<]+)<\/a>\s*<\/h2>/gi;
  const heads = [...html.matchAll(headRe)];
  for (let i = 0; i < heads.length; i++) {
    const m = heads[i];
    const name = stripTags(m[2]);
    if (!name) continue;
    const headUrl = m[1].trim();
    const start = m.index + m[0].length;
    const end = (i + 1 < heads.length) ? heads[i + 1].index : html.length;
    const block = html.slice(start, end);

    const fieldRaw = (label) => {
      const re = new RegExp('<h3>\\s*' + label.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&') + '\\s*</h3>([\\s\\S]*?)(?=<h3>|$)', 'i');
      const fm = block.match(re);
      return fm ? fm[1] : null;
    };

    // phone: text of the tel: anchor; email: the mailto target
    const telM = block.match(/href="tel:([^"]*)"[^>]*>([^<]*)</i);
    const phone = telM ? stripTags(telM[2] || telM[1]) : null;
    const mailM = block.match(/href="mailto:([^"]*)"/i);
    const email = mailM ? nz(mailM[1]) : null;

    let website = null;
    const wRaw = fieldRaw('Website');
    if (wRaw) { const w = wRaw.match(/href="([^"]+)"/) || wRaw.match(/(https?:\/\/[^\s<]+)/); website = w ? w[1] : stripTags(wRaw) || null; }
    if (!website) website = headUrl;   // the heading link is the company's site

    const sector = nz(stripTags(fieldRaw('Sector') || ''));
    let tech = stripTags(fieldRaw('Technology / service') || '');
    tech = tech ? tech.replace(/\s*,\s*/g, ', ').replace(/^,\s*|\s*,$/g, '').trim() : '';

    let description = null;
    const dm = block.match(/^([\s\S]*?)<h3>/);
    if (dm) { const d = stripTags(dm[1]); if (d) description = d; }

    out.push({
      name, website: nz(website), phone: nz(phone), email: nz(email),
      sector, technology: nz(tech), description,
      profile_url: nz(headUrl), listing_url: 'https://tdv.motc.gov.qa/business-directory',
    });
  }
  return out;
}

async function fetchPage(n) {
  const url = BASE + n;
  for (let attempt = 1; attempt <= RETRY; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'text/html' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.text();
    } catch (err) {
      if (attempt === RETRY) throw err;
      await sleep(1200 * attempt);
    }
  }
  return '';
}

async function main() {
  ensure(OUT);
  console.log('[tasmu] scraping Qatar Digital Directory (local fetch) …');
  const byKey = new Map();   // dedup by name|website
  let emptyStreak = 0;
  for (let page = 0; page < MAX_PAGES; page++) {
    let html;
    try { html = await fetchPage(page); }
    catch (err) { console.log(`[tasmu] page ${page} failed: ${err.message}`); break; }
    let added = 0;
    for (const r of parseCompanies(html)) {
      const k = (r.name + '|' + (r.website || '')).toLowerCase();
      if (byKey.has(k)) continue;
      byKey.set(k, r); added++;
    }
    if (added === 0) { if (++emptyStreak >= 2) { console.log(`[tasmu] no new companies at page ${page} — done.`); break; } }
    else emptyStreak = 0;
    if (page % 20 === 0) console.log(`[tasmu] page ${page} · +${added} · total ${byKey.size}`);
    await sleep(120);
  }

  const companies = [...byKey.values()];
  const payload = {
    _meta: { source: 'Tasmu Digital Valley — Qatar Digital Directory (MCIT)', scraped_at: new Date().toISOString(), count: companies.length, url: 'https://tdv.motc.gov.qa/business-directory' },
    companies,
  };
  fs.writeFileSync(path.join(OUT, 'tasmu_companies_latest.json'), JSON.stringify(payload, null, 2));
  console.log(`[tasmu] DONE — wrote tasmu_companies_latest.json (${companies.length} companies)`);
}

main().catch(err => { console.error('[tasmu] FATAL', err); process.exit(1); });
