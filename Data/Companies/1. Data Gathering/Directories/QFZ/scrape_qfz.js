#!/usr/bin/env node
/**
 * QFZ (Qatar Free Zones) Company Directory Scraper
 * ------------------------------------------------
 * Source: https://qfz.gov.qa/investors/featured-investors/
 *
 * The page renders its company list with the WordPress "Ninja Tables" plugin,
 * which exposes ALL rows in a single admin-ajax.php call once you have a
 * valid `ninja_table_public_nonce` token. This script:
 *
 *   1. GETs the public page and scrapes the nonce out of inline JS.
 *   2. Waits 1 second (be polite).
 *   3. GETs the Ninja Tables data endpoint with that nonce.
 *   4. Normalizes each row to { name, sectors, description }.
 *   5. Writes the result to scans/qfz/qfz_companies_<DATE>_<TIME>.json
 *
 * Output JSON includes a small metadata header so it's self-describing when
 * uploaded to Bell.qa. The clean company array lives under `.companies`.
 *
 * Usage:   node scrape_qfz.js
 * Node:    >= 14 (uses only built-in modules: https, fs, path)
 */

'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------
const SOURCE_NAME = 'QFZ - Qatar Free Zones';
const SOURCE_URL = 'https://qfz.gov.qa/investors/featured-investors/';
const AJAX_BASE = 'https://qfz.gov.qa/wp-admin/admin-ajax.php';
const TABLE_ID = 10092;
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const OUTPUT_DIR = path.join(__dirname, 'scans');
const POLITE_DELAY_MS = 1000;
const SCRAPER_VERSION = '1.0.0';

// -----------------------------------------------------------------------------
// Tiny HTTPS helper (no third-party deps)
// -----------------------------------------------------------------------------
function httpsGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Accept:
            'text/html,application/xhtml+xml,application/xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          ...headers,
        },
      },
      (res) => {
        // Follow simple redirects
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          res.resume();
          return resolve(httpsGet(res.headers.location, headers));
        }
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        res.on('error', reject);
      }
    );
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy(new Error(`Request timed out after 30s: ${url}`));
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// -----------------------------------------------------------------------------
// Step 1 - Extract the public Ninja Tables nonce from the page HTML
// -----------------------------------------------------------------------------
function extractNonce(html) {
  // Primary pattern, e.g. "ninja_table_public_nonce":"abcdef1234"
  const re1 = /"ninja_table_public_nonce"\s*:\s*"([a-f0-9]+)"/i;
  const m1 = html.match(re1);
  if (m1) return m1[1];

  // Backup patterns that some Ninja Tables versions emit
  const re2 = /ninja_table_public_nonce\s*=\s*['"]([a-f0-9]+)['"]/i;
  const m2 = html.match(re2);
  if (m2) return m2[1];

  throw new Error(
    'Could not find ninja_table_public_nonce in page HTML. The site layout may have changed.'
  );
}

// -----------------------------------------------------------------------------
// Step 3 helpers - clean HTML entities + whitespace from a text field
// -----------------------------------------------------------------------------
const HTML_ENTITIES = {
  '&amp;': '&',
  '&quot;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&apos;': "'",
  '&lt;': '<',
  '&gt;': '>',
  '&nbsp;': ' ',
  '&ndash;': '–',
  '&mdash;': '—',
  '&hellip;': '…',
  '&rsquo;': '’',
  '&lsquo;': '‘',
  '&rdquo;': '”',
  '&ldquo;': '“',
};

function decodeEntities(str) {
  if (!str) return '';
  let out = String(str);

  out = out.replace(/&[a-zA-Z#0-9]+;/g, (e) => {
    if (HTML_ENTITIES[e]) return HTML_ENTITIES[e];
    // Numeric: &#1234; or &#x1A2B;
    const numMatch = e.match(/^&#(x?)([0-9a-fA-F]+);$/);
    if (numMatch) {
      const code = parseInt(numMatch[2], numMatch[1] ? 16 : 10);
      if (Number.isFinite(code)) {
        try {
          return String.fromCodePoint(code);
        } catch {
          return e;
        }
      }
    }
    return e;
  });

  return out;
}

function stripHtmlTags(str) {
  if (!str) return '';
  return String(str).replace(/<[^>]+>/g, ' ');
}

function cleanText(value) {
  if (value === null || value === undefined) return '';
  return decodeEntities(stripHtmlTags(String(value)))
    .replace(/\s+/g, ' ')
    .trim();
}

// -----------------------------------------------------------------------------
// Step 2 + 3 - Fetch the data and normalize each row
// -----------------------------------------------------------------------------
function buildDataUrl(nonce) {
  const params = new URLSearchParams({
    action: 'wp_ajax_ninja_tables_public_action',
    table_id: String(TABLE_ID),
    target_action: 'get-all-data',
    default_sorting: 'old_first',
    limit_rows: '0',
    skip_rows: '0',
    ninja_table_public_nonce: nonce,
  });
  return `${AJAX_BASE}?${params.toString()}`;
}

function normalizeRow(row) {
  // Rows look like: { value: { qatarfreezoneentityname, sectors, companybrief, ... }, ___id___, options }
  const v = (row && row.value) || row || {};
  return {
    name: cleanText(v.qatarfreezoneentityname),
    sectors: cleanText(v.sectors),
    description: cleanText(v.companybrief),
  };
}

// -----------------------------------------------------------------------------
// Step 4 - Save organized output
// -----------------------------------------------------------------------------
function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function timestampParts(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
    iso: d.toISOString(),
  };
}

function saveOutput(companies) {
  ensureDir(OUTPUT_DIR);
  const ts = timestampParts();
  const filename = `qfz_companies_${ts.date}_${ts.time}.json`;
  const fullPath = path.join(OUTPUT_DIR, filename);

  const payload = {
    source: SOURCE_NAME,
    source_url: SOURCE_URL,
    scraper: 'scrape_qfz.js',
    scraper_version: SCRAPER_VERSION,
    scan_date: ts.iso,
    total_count: companies.length,
    schema: {
      name: 'Company legal/trading name',
      sectors: 'Comma-separated sectors',
      description: 'Company brief / description',
    },
    companies,
  };

  fs.writeFileSync(fullPath, JSON.stringify(payload, null, 2), 'utf8');

  // Also drop a "latest" pointer for convenience
  const latestPath = path.join(OUTPUT_DIR, 'qfz_companies_latest.json');
  fs.writeFileSync(latestPath, JSON.stringify(payload, null, 2), 'utf8');

  return { fullPath, latestPath };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  console.log(`\n[QFZ Scraper v${SCRAPER_VERSION}] starting...`);
  console.log(`Source: ${SOURCE_URL}\n`);

  console.log('Step 1/4  Fetching page to extract Ninja Tables nonce...');
  const html = await httpsGet(SOURCE_URL);
  const nonce = extractNonce(html);
  console.log(`           nonce = ${nonce}`);

  console.log(`Step 2/4  Polite delay (${POLITE_DELAY_MS}ms)...`);
  await sleep(POLITE_DELAY_MS);

  console.log('Step 3/4  Fetching company data from admin-ajax.php...');
  const dataUrl = buildDataUrl(nonce);
  const body = await httpsGet(dataUrl, {
    Accept: 'application/json, text/javascript, */*; q=0.01',
    'X-Requested-With': 'XMLHttpRequest',
    Referer: SOURCE_URL,
  });

  let raw;
  try {
    raw = JSON.parse(body);
  } catch (err) {
    throw new Error(
      'Data endpoint did not return valid JSON. The nonce may be invalid or the API may have changed.\n' +
        `First 200 chars of response: ${body.slice(0, 200)}`
    );
  }

  if (!Array.isArray(raw)) {
    throw new Error('Expected a JSON array from Ninja Tables. Got: ' + typeof raw);
  }

  console.log(`           received ${raw.length} raw rows`);

  console.log('Step 4/4  Cleaning rows and writing JSON...');
  const companies = raw
    .map(normalizeRow)
    // drop empty/garbage rows (no name at all)
    .filter((c) => c.name && c.name.length > 0);

  const { fullPath, latestPath } = saveOutput(companies);

  console.log(`\nDone. Saved ${companies.length} companies.`);
  console.log(`  - ${fullPath}`);
  console.log(`  - ${latestPath}`);
  console.log(
    '\nUpload the dated file to Bell.qa, or use the *_latest.json for the most recent scan.\n'
  );
}

main().catch((err) => {
  console.error('\n[QFZ Scraper] FAILED:');
  console.error('  ' + (err && err.message ? err.message : err));
  if (err && err.stack) {
    console.error('\nStack:\n' + err.stack);
  }
  process.exit(1);
});
