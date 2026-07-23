#!/usr/bin/env node
/**
 * QSTP (Qatar Science & Technology Park) Community Directory Scraper
 * ------------------------------------------------------------------
 * Source: https://qstp.qa/directory/
 *
 * The QSTP directory is a WordPress site rendered by Elementor. The cleanest
 * data source is the public WordPress REST API, which returns all companies
 * in one call. The DOM of the public listing pages is used to fill in two
 * fields that the REST API doesn't expose: Stage (Pre-Seed / Seed / etc.)
 * and the icon-based contact links that newer startup entries use.
 *
 * Approach:
 *   1. GET /wp-json/wp/v2/directory?per_page=100&_embed=wp:featuredmedia
 *      -> ~98 companies with name, slug, logo, description, contacts.
 *   2. GET each of the 5 paginated listing pages, parse `.e-loop-item`
 *      blocks, extract Stage + icon-link contact URLs, merge by post ID.
 *   3. Write a single dated JSON file under scans/.
 */
'use strict';

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

// -----------------------------------------------------------------------------
// Config
// -----------------------------------------------------------------------------
const SOURCE_NAME = 'QSTP - Qatar Science & Technology Park Community Directory';
const SOURCE_URL  = 'https://qstp.qa/directory/';
const API_URL     = 'https://qstp.qa/wp-json/wp/v2/directory?per_page=100&_embed=wp:featuredmedia&orderby=title&order=asc';
const LISTING_BASE = 'https://qstp.qa/directory/';
const TOTAL_PAGES = 5;
const POLITE_DELAY_MS = 1500;
const REQUEST_TIMEOUT_MS = 30000;
const SCRAPER_VERSION = '1.0.0';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// WordPress taxonomy ID -> human label
// (these are documented in the Chrome-Extension brief; if QSTP adds new
// categories/tags, the scraper will surface their IDs in `unknown_tag_ids`
// so we can extend the map later.)
const CATEGORY_MAP = {
  13: 'Company',
  98: 'Startup',
};
const TAG_MAP = {
  45: 'AI',
  19: 'Aviation',
  21: 'Climate',
  102: 'Cybersecurity',
  22: 'Defense',
  14: 'Energy',
  16: 'Health & Biomed',
  17: 'IT & Communication',
  40: 'Startups',
  31: 'Technology',
};

const OUTPUT_DIR = path.join(__dirname, 'scans');

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function timestampParts(d = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`,
    iso: d.toISOString(),
  };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

const HTML_ENTITIES = {
  '&amp;': '&', '&quot;': '"', '&#039;': "'", '&#39;': "'",
  '&apos;': "'", '&lt;': '<', '&gt;': '>', '&nbsp;': ' ',
  '&ndash;': '–', '&mdash;': '—', '&hellip;': '…',
  '&rsquo;': '’', '&lsquo;': '‘', '&rdquo;': '”', '&ldquo;': '“',
};

function decodeEntities(str) {
  if (!str) return '';
  return String(str).replace(/&[a-zA-Z#0-9]+;/g, (e) => {
    if (HTML_ENTITIES[e]) return HTML_ENTITIES[e];
    const m = e.match(/^&#(x?)([0-9a-fA-F]+);$/);
    if (m) {
      const code = parseInt(m[2], m[1] ? 16 : 10);
      if (Number.isFinite(code)) {
        try { return String.fromCodePoint(code); } catch { return e; }
      }
    }
    return e;
  });
}

function cleanText(v) {
  if (v === null || v === undefined) return null;
  const s = decodeEntities(String(v).replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
  return s || null;
}

// -----------------------------------------------------------------------------
// Parse one company's content.rendered field
// -----------------------------------------------------------------------------
function parseContentHTML(html) {
  const out = {
    description: null,
    impact: null,
    sector: null,
    contact: {},
  };
  if (!html) return out;

  const $ = cheerio.load(html);

  // 1. Walk paragraphs to extract description / impact / sector.
  // The structure is generally:
  //   <p>Description text...</p>
  //   <p>Description continues...</p>
  //   <p><strong>Impact:</strong> Value</p>
  //   <p><strong>Sector:</strong> Value</p>
  //   <p>Get in touch...</p>
  //   <p>contact links</p>
  const descParts = [];
  let structuredFound = false;

  $('p').each((_, p) => {
    const $p = $(p);
    const text = cleanText($p.text()) || '';
    const inner = $p.html() || '';

    // Impact:
    const imp = inner.match(/<strong>\s*Impact\s*:?\s*<\/strong>\s*([\s\S]+)/i);
    if (imp) {
      out.impact = cleanText(imp[1]);
      structuredFound = true;
      return;
    }
    // Sector:
    const sec = inner.match(/<strong>\s*Sector\s*:?\s*<\/strong>\s*([\s\S]+)/i);
    if (sec) {
      out.sector = cleanText(sec[1]);
      structuredFound = true;
      return;
    }
    // Get in touch — marks transition to contact section
    if (/get\s*in\s*touch/i.test(text)) {
      structuredFound = true;
      return;
    }
    // Description: everything before the first structured marker
    if (!structuredFound && text) {
      descParts.push(text);
    }
  });

  if (descParts.length > 0) {
    out.description = descParts.join('\n\n');
  }

  // 2. Walk all <a> tags for contact links
  $('a[href]').each((_, a) => {
    const href = $(a).attr('href');
    if (!href) return;
    const trimmed = href.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();

    if (lower.startsWith('mailto:')) {
      if (!out.contact.email) out.contact.email = trimmed.replace(/^mailto:/i, '');
    } else if (lower.startsWith('tel:')) {
      if (!out.contact.phone) out.contact.phone = trimmed.replace(/^tel:/i, '');
    } else if (lower.includes('linkedin.com')) {
      if (!out.contact.linkedin) out.contact.linkedin = trimmed;
    } else if (lower.includes('twitter.com') || lower.includes('x.com')) {
      if (!out.contact.twitter) out.contact.twitter = trimmed;
    } else if (lower.includes('facebook.com')) {
      if (!out.contact.facebook) out.contact.facebook = trimmed;
    } else if (lower.includes('instagram.com')) {
      if (!out.contact.instagram) out.contact.instagram = trimmed;
    } else if (lower.includes('youtube.com') || lower.includes('youtu.be')) {
      if (!out.contact.youtube) out.contact.youtube = trimmed;
    } else if (
      !lower.includes('qstp.qa/wp-') &&
      !lower.includes('wp-content') &&
      lower.startsWith('http')
    ) {
      // External, non-wordpress link = likely the company website
      if (!out.contact.website) out.contact.website = trimmed;
    }
  });

  return out;
}

// -----------------------------------------------------------------------------
// Parse one DOM listing page; returns map of postId -> { stage, contact }
// -----------------------------------------------------------------------------
const STAGE_REGEX = /^(Pre[\s-]?Seed|Seed|Series\s+[ABCDE]|Growth|Mature|Established)$/i;

function parseListingPage(html) {
  const $ = cheerio.load(html);
  const result = {};

  $('.e-loop-item').each((_, item) => {
    const cls = $(item).attr('class') || '';
    const m = cls.match(/post-(\d+)/);
    if (!m) return;
    const postId = parseInt(m[1], 10);

    const backCard = $(item).find('.dm-back-card');
    if (backCard.length === 0) return;

    // Stage: scan headings for the stage pattern
    let stage = null;
    backCard.find('[data-widget_type="heading.default"]').each((_, h) => {
      const t = cleanText($(h).text());
      if (t && STAGE_REGEX.test(t)) {
        stage = t;
        return false; // break
      }
    });

    // Icon-based contact links (title attr signals the platform)
    const contact = {};
    backCard.find('a[href]').each((_, a) => {
      const $a = $(a);
      const href = $a.attr('href');
      const title = ($a.attr('title') || '').trim().toLowerCase();
      const text = cleanText($a.text()) || '';
      if (!href || !href.trim()) return;
      if (text.toLowerCase() === 'close') return;

      const trimmed = href.trim();
      if (title === 'website') contact.website = trimmed;
      else if (title === 'email') contact.email = trimmed.replace(/^mailto:/i, '');
      else if (title === 'linkedin') contact.linkedin = trimmed;
      else if (title === 'twitter' || title === 'x') contact.twitter = trimmed;
      else if (title === 'facebook') contact.facebook = trimmed;
      else if (title === 'instagram') contact.instagram = trimmed;
      else if (title === 'youtube') contact.youtube = trimmed;
      else if (title === 'phone' || title === 'tel') contact.phone = trimmed.replace(/^tel:/i, '');
    });

    result[postId] = { stage, contact };
  });

  return result;
}

// -----------------------------------------------------------------------------
// Normalise one REST API record into our output shape
// -----------------------------------------------------------------------------
function buildBaseRecord(apiItem) {
  const parsed = parseContentHTML(apiItem.content && apiItem.content.rendered);

  // Resolve featured-media URL via _embedded if present
  let logoUrl = null;
  const embedded = apiItem._embedded || {};
  const fm = embedded['wp:featuredmedia'] || [];
  if (fm[0] && fm[0].source_url) logoUrl = fm[0].source_url;

  // Resolve category labels
  const catIds = Array.isArray(apiItem.categories) ? apiItem.categories : [];
  const categories = [];
  const unknownCatIds = [];
  for (const cid of catIds) {
    if (CATEGORY_MAP[cid]) categories.push(CATEGORY_MAP[cid]);
    else unknownCatIds.push(cid);
  }

  // Resolve tag labels
  const tagIds = Array.isArray(apiItem.tags) ? apiItem.tags : [];
  const sectorTags = [];
  const unknownTagIds = [];
  for (const tid of tagIds) {
    if (TAG_MAP[tid]) sectorTags.push(TAG_MAP[tid]);
    else unknownTagIds.push(tid);
  }

  return {
    id: apiItem.id,
    name: cleanText(apiItem.title && apiItem.title.rendered),
    slug: apiItem.slug || null,
    directory_url: apiItem.link || null,
    logo_url: logoUrl,
    category: categories.join(', ') || null,
    sector_tags: sectorTags,
    description: parsed.description,
    impact: parsed.impact,
    sector: parsed.sector,
    stage: null, // filled in by DOM pass
    contact: parsed.contact,
    _unknown_category_ids: unknownCatIds.length ? unknownCatIds : undefined,
    _unknown_tag_ids: unknownTagIds.length ? unknownTagIds : undefined,
  };
}

function pruneUndefined(obj) {
  for (const k of Object.keys(obj)) {
    if (obj[k] === undefined) delete obj[k];
  }
  return obj;
}

// -----------------------------------------------------------------------------
// Output
// -----------------------------------------------------------------------------
function saveOutput(companies) {
  ensureDir(OUTPUT_DIR);
  const ts = timestampParts();
  const fname = `qstp_companies_${ts.date}_${ts.time}.json`;
  const fpath = path.join(OUTPUT_DIR, fname);

  const payload = {
    source: SOURCE_NAME,
    source_url: SOURCE_URL,
    scraper: 'scrape_qstp.js',
    scraper_version: SCRAPER_VERSION,
    scan_date: ts.iso,
    total_count: companies.length,
    schema: {
      id: 'WordPress post ID',
      name: 'Company name',
      slug: 'URL slug',
      directory_url: 'QSTP directory page for this company',
      logo_url: 'CDN URL of logo image (may be null)',
      category: 'Company | Startup (comma-separated if multi)',
      sector_tags: 'List of sector labels (AI, Energy, Health, etc.)',
      description: 'Free-text company description',
      impact: 'Impact statement (where present)',
      sector: 'Sector statement (where present)',
      stage: 'Pre-Seed / Seed / Series A-E / Growth (where present)',
      contact: 'website, email, linkedin, twitter, facebook, instagram, youtube, phone',
    },
    companies,
  };

  fs.writeFileSync(fpath, JSON.stringify(payload, null, 2), 'utf8');
  const latest = path.join(OUTPUT_DIR, 'qstp_companies_latest.json');
  fs.writeFileSync(latest, JSON.stringify(payload, null, 2), 'utf8');
  return { fpath, latest };
}

// -----------------------------------------------------------------------------
// Main
// -----------------------------------------------------------------------------
async function main() {
  console.log(`\n[QSTP Scraper v${SCRAPER_VERSION}] starting...`);
  console.log(`Source: ${SOURCE_URL}\n`);

  const http = axios.create({
    timeout: REQUEST_TIMEOUT_MS,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });

  // ---- Step 1: WordPress REST API ----
  console.log('Step 1/3  Fetching WordPress REST API...');
  const apiResp = await http.get(API_URL, {
    headers: { Accept: 'application/json' },
  });
  const apiData = apiResp.data;
  if (!Array.isArray(apiData)) {
    throw new Error('REST API did not return an array');
  }
  console.log(`           ${apiData.length} companies returned by API`);

  const byId = new Map();
  for (const item of apiData) {
    byId.set(item.id, buildBaseRecord(item));
  }

  // ---- Step 2: DOM scraping for Stage + icon-link contacts ----
  console.log('\nStep 2/3  DOM scraping for Stage + icon contacts...');
  for (let page = 1; page <= TOTAL_PAGES; page++) {
    if (page > 1) await sleep(POLITE_DELAY_MS);
    const pageUrl = page === 1
      ? LISTING_BASE
      : `${LISTING_BASE}?e-page-efba71f=${page}`;
    console.log(`           page ${page}/${TOTAL_PAGES}: ${pageUrl}`);
    try {
      const r = await http.get(pageUrl);
      const merge = parseListingPage(r.data);
      let merged = 0;
      for (const [postId, extra] of Object.entries(merge)) {
        const idNum = parseInt(postId, 10);
        const rec = byId.get(idNum);
        if (!rec) continue;
        if (extra.stage && !rec.stage) {
          rec.stage = extra.stage;
        }
        // DOM contacts complement REST contacts; only overwrite when missing
        for (const k of Object.keys(extra.contact)) {
          if (!rec.contact[k]) rec.contact[k] = extra.contact[k];
        }
        merged++;
      }
      console.log(`             merged ${merged} card(s) from this page`);
    } catch (e) {
      console.warn(`           WARN: page ${page} failed: ${e.message}`);
    }
  }

  // ---- Step 3: Output ----
  console.log('\nStep 3/3  Writing output...');
  const companies = Array.from(byId.values())
    .map(pruneUndefined)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const { fpath, latest } = saveOutput(companies);
  console.log(`\nDone. Saved ${companies.length} companies.`);
  console.log(`  - ${fpath}`);
  console.log(`  - ${latest}\n`);
}

main().catch((err) => {
  console.error('\n[QSTP Scraper] FAILED:');
  console.error('  ' + (err && err.message ? err.message : err));
  if (err && err.stack) console.error('\nStack:\n' + err.stack);
  process.exit(1);
});
