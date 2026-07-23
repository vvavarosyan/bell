#!/usr/bin/env node
/**
 * Standalone scraper for the Qatar CRA "ICT Companies Directory".
 *
 * Source of truth (one request, all companies):
 *   https://www.cra.gov.qa/api/sitecore/ICTBusiness/ExportToExcel
 *
 *   This endpoint returns a REAL binary .xlsx file (Office Open XML /
 *   "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"). We read
 *   it as a Buffer and parse it with a tiny, dependency-free XLSX reader (ZIP via
 *   Node's zlib + a little XML). If the endpoint ever returns a plain HTML table
 *   instead (older format), we fall back to an HTML-table parser automatically.
 *
 * Columns in the sheet:
 *   Name | Registration Number (CR) | Website | Phone number | Email |
 *   Main Category | Category 1 | Category 2 | Category 3
 *
 * The "Commercial Permit" number is NOT in the export — it lives only on the
 * per-company cards of the paginated directory page:
 *   https://www.cra.gov.qa/en/Services/ICT-Business/ICT-Business-List/ICT-Business-Directory?page=N
 * With --with-permits we crawl those pages and merge permit_number (keyed by CR).
 *
 * Output JSON shape:
 *   { "source":"cra-ict", "scraped_at":"<ISO8601>", "companies":[ {
 *       name, cr_number, permit_number, email, phone, website,
 *       category, subcategory, main_category[], category_1[], category_2[], category_3[] } ] }
 *
 * Node 18+ (global fetch + node:zlib). Zero external dependencies.
 *
 * Usage:
 *   node scrape_cra_ict.mjs                       # export only -> cra-ict.json
 *   node scrape_cra_ict.mjs --with-permits        # also crawl directory pages for permit_number
 *   node scrape_cra_ict.mjs --out file.json       # custom output path
 *   node scrape_cra_ict.mjs --parse-file x.xlsx   # parse a local saved export (xlsx OR html), offline
 */

import zlib from 'node:zlib';

const EXPORT_URL =
  'https://www.cra.gov.qa/api/sitecore/ICTBusiness/ExportToExcel';
const DIRECTORY_URL =
  'https://www.cra.gov.qa/en/Services/ICT-Business/ICT-Business-List/ICT-Business-Directory';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ---------- tiny XML / text helpers (no deps) ----------

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  '#39': "'", '#x27': "'", '#x2F': '/', '#47': '/',
};

function decodeEntities(s) {
  if (!s) return '';
  return s.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, code) => {
    if (Object.prototype.hasOwnProperty.call(ENTITIES, code)) return ENTITIES[code];
    if (code[0] === '#') {
      const num = code[1] === 'x' || code[1] === 'X'
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10);
      if (Number.isFinite(num)) return String.fromCodePoint(num);
    }
    return m;
  });
}

function stripTags(s) { return s.replace(/<[^>]*>/g, ''); }

function clean(s) {
  return decodeEntities(stripTags(s || ''))
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Split a (possibly comma-separated) category cell into a clean array.
function splitList(cell) {
  const v = clean(cell);
  if (!v) return [];
  return v.split(',').map(x => x.trim()).filter(Boolean);
}

function normalizeWebsite(w) {
  if (!w) return null;
  let v = String(w).trim();
  if (!v) return null;
  if (!/^https?:\/\//i.test(v)) v = 'http://' + v.replace(/^\/+/, '');
  return v;
}

// ---------- minimal, dependency-free XLSX reader ----------
// An .xlsx is a ZIP archive of XML parts. We read the ZIP central directory,
// inflate the two parts we need (sharedStrings + the first worksheet), and pull
// the cell values out by column letter. Handles shared strings (t="s"), inline
// strings (t="inlineStr") and plain values.

function findZipEntries(buf) {
  // Locate the End Of Central Directory (EOCD) record: sig 0x06054b50.
  const EOCD = 0x06054b50;
  let eocd = -1;
  const minStart = Math.max(0, buf.length - 22 - 65536);
  for (let i = buf.length - 22; i >= minStart; i--) {
    if (buf.readUInt32LE(i) === EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('not-a-zip');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);     // central directory offset
  const CDH = 0x02014b50;
  const entries = new Map();
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CDH) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOff = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    entries.set(name, { method, compSize, localOff });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readZipMember(buf, entry) {
  const LFH = 0x04034b50;
  const off = entry.localOff;
  if (buf.readUInt32LE(off) !== LFH) throw new Error('bad-local-header');
  const nameLen = buf.readUInt16LE(off + 26);
  const extraLen = buf.readUInt16LE(off + 28);
  const start = off + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + entry.compSize);
  if (entry.method === 0) return data;                 // stored
  if (entry.method === 8) return zlib.inflateRawSync(data); // deflate
  throw new Error('zip-method-' + entry.method);
}

function looksLikeXlsx(buf) {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04;
}

/** Parse an .xlsx Buffer into an array of rows; each row is { COLLETTER: value }. */
function parseXlsxRows(buf) {
  const entries = findZipEntries(buf);
  const getXml = (name) => {
    const e = entries.get(name);
    return e ? readZipMember(buf, e).toString('utf8') : null;
  };

  // shared strings
  const shared = [];
  const ssXml = getXml('xl/sharedStrings.xml');
  if (ssXml) {
    for (const si of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      let s = '';
      for (const t of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) s += decodeEntities(t[1]);
      shared.push(s);
    }
  }

  // first worksheet (sheet1.xml by convention; else the lowest-numbered sheet)
  let sheetXml = getXml('xl/worksheets/sheet1.xml');
  if (!sheetXml) {
    const names = [...entries.keys()].filter(n => /^xl\/worksheets\/sheet\d+\.xml$/.test(n)).sort();
    if (names.length) sheetXml = getXml(names[0]);
  }
  if (!sheetXml) throw new Error('no-worksheet');

  const colOf = (ref) => (ref.match(/^([A-Z]+)/) || [, ''])[1];
  const rows = [];
  for (const rm of sheetXml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells = {};
    for (const cm of rm[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = cm[1], inner = cm[2];
      const ref = (attrs.match(/\br="([A-Z]+\d+)"/) || [])[1];
      if (!ref) continue;
      const type = (attrs.match(/\bt="([^"]+)"/) || [])[1];
      let val = '';
      if (type === 's') {
        const idx = parseInt((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1], 10);
        val = Number.isFinite(idx) ? (shared[idx] ?? '') : '';
      } else if (type === 'inlineStr') {
        let s = '';
        for (const t of inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) s += decodeEntities(t[1]);
        val = s;
      } else {
        val = decodeEntities((inner.match(/<v>([\s\S]*?)<\/v>/) || [])[1] || '');
      }
      cells[colOf(ref)] = val;
    }
    rows.push(cells);
  }
  return rows;
}

// Column-letter order helper (A, B, ... Z, AA, AB ...) for positional fallback.
const COL_SEQUENCE = (() => {
  const out = [];
  for (let i = 0; i < 26; i++) out.push(String.fromCharCode(65 + i));
  for (let i = 0; i < 26; i++) for (let j = 0; j < 26; j++) out.push(String.fromCharCode(65 + i) + String.fromCharCode(65 + j));
  return out;
})();

/** Map xlsx rows -> company records, matching columns by header name (positional fallback). */
function companiesFromXlsxRows(rows) {
  // first row that has >=2 non-empty cells is the header
  let headerIdx = rows.findIndex(r => Object.values(r).filter(v => String(v).trim()).length >= 2);
  if (headerIdx < 0) return [];
  const header = rows[headerIdx];
  const colName = {};
  for (const [letter, val] of Object.entries(header)) colName[letter] = String(val).trim().toLowerCase();

  const findCol = (...cands) => {
    for (const [letter, nm] of Object.entries(colName)) {
      if (cands.some(c => nm === c)) return letter;
    }
    for (const [letter, nm] of Object.entries(colName)) {
      if (cands.some(c => nm.includes(c))) return letter;
    }
    return null;
  };
  const L = {
    name:    findCol('name', 'company name'),
    cr:      findCol('registration number', 'cr number', 'registration', 'cr'),
    website: findCol('website', 'url'),
    phone:   findCol('phone number', 'phone', 'telephone'),
    email:   findCol('email', 'e-mail'),
    main:    findCol('main category'),
    c1:      findCol('category 1', 'category1'),
    c2:      findCol('category 2', 'category2'),
    c3:      findCol('category 3', 'category3'),
  };
  // Positional fallback to the documented order if a header wasn't matched.
  const present = COL_SEQUENCE.filter(c => c in header);
  const pos = (i) => present[i] || null;
  if (!L.name) L.name = pos(0);
  if (!L.cr) L.cr = pos(1);
  if (!L.website) L.website = pos(2);
  if (!L.phone) L.phone = pos(3);
  if (!L.email) L.email = pos(4);
  if (!L.main) L.main = pos(5);
  if (!L.c1) L.c1 = pos(6);
  if (!L.c2) L.c2 = pos(7);
  if (!L.c3) L.c3 = pos(8);

  const companies = [];
  for (let i = headerIdx + 1; i < rows.length; i++) {
    const r = rows[i];
    const g = (letter) => (letter && r[letter] != null ? String(r[letter]).trim() : '');
    const name = clean(g(L.name));
    if (!name) continue;

    const category_1 = splitList(g(L.c1));
    const category_2 = splitList(g(L.c2));
    const category_3 = splitList(g(L.c3));
    companies.push({
      name,
      cr_number: clean(g(L.cr)) || null,
      permit_number: null,
      email: clean(g(L.email)) || null,
      phone: clean(g(L.phone)) || null,
      website: normalizeWebsite(clean(g(L.website))),
      category: category_1.join(', ') || null,
      subcategory: [...category_2, ...category_3].join(', ') || null,
      main_category: splitList(g(L.main)),
      category_1,
      category_2,
      category_3,
    });
  }
  return companies;
}

// ---------- HTML-table fallback parser (older format) ----------

function parseExportHtml(html) {
  const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
  const table = tableMatch ? tableMatch[0] : html;
  const rows = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map(m => m[1]);
  if (rows.length === 0) throw new Error('No <tr> rows in HTML export');

  const header = [...rows[0].matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)].map(m => clean(m[1]).toLowerCase());
  const col = (name) => header.indexOf(name);
  const idx = {
    name: col('name') >= 0 ? col('name') : 0,
    cr: col('registration number') >= 0 ? col('registration number') : 1,
    website: col('website') >= 0 ? col('website') : 2,
    phone: col('phone number') >= 0 ? col('phone number') : 3,
    email: col('email') >= 0 ? col('email') : 4,
    main: col('main category') >= 0 ? col('main category') : 5,
    c1: col('category 1') >= 0 ? col('category 1') : 6,
    c2: col('category 2') >= 0 ? col('category 2') : 7,
    c3: col('category 3') >= 0 ? col('category 3') : 8,
  };
  const companies = [];
  for (let i = 1; i < rows.length; i++) {
    const cells = [...rows[i].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(m => m[1]);
    if (cells.length === 0) continue;
    const name = clean(cells[idx.name]);
    if (!name) continue;
    const category_1 = splitList(cells[idx.c1]);
    const category_2 = splitList(cells[idx.c2]);
    const category_3 = splitList(cells[idx.c3]);
    companies.push({
      name,
      cr_number: clean(cells[idx.cr]) || null,
      permit_number: null,
      email: clean(cells[idx.email]) || null,
      phone: clean(cells[idx.phone]) || null,
      website: normalizeWebsite(clean(cells[idx.website])),
      category: category_1.join(', ') || null,
      subcategory: [...category_2, ...category_3].join(', ') || null,
      main_category: splitList(cells[idx.main]),
      category_1, category_2, category_3,
    });
  }
  return companies;
}

/** Auto-detect format from raw bytes and parse into company records. */
function parseExportBuffer(buf) {
  if (looksLikeXlsx(buf)) {
    const rows = parseXlsxRows(buf);
    const companies = companiesFromXlsxRows(rows);
    if (companies.length === 0) throw new Error('xlsx parsed but produced 0 companies — column layout may have changed');
    return { companies, format: 'xlsx' };
  }
  // Not a zip → assume HTML/text export.
  const html = buf.toString('utf8');
  return { companies: parseExportHtml(html), format: 'html' };
}

// ---------- directory-card parser (for permit_number) ----------

function parseDirectoryCards(html) {
  const out = [];
  const cardRe = /<div class="card">([\s\S]*?)(?=<div class="card">|<\/main>|Related Pages|$)/gi;
  let m;
  while ((m = cardRe.exec(html)) !== null) {
    const card = m[1];
    const name = clean((card.match(/<h5>[\s\S]*?<a[^>]*>([\s\S]*?)<\/a>/i) || [])[1] || '');
    if (!name) continue;
    let cr = null, permit = null;
    const subRe = /<div class="Subitem">\s*<p>([\s\S]*?)<\/p>\s*<h6>([\s\S]*?)<\/h6>/gi;
    let s;
    while ((s = subRe.exec(card)) !== null) {
      const label = clean(s[1]).toLowerCase();
      const value = clean(s[2]);
      if (label.includes('registration')) cr = value;
      else if (label.includes('permit')) permit = value;
    }
    if (!cr && !permit) continue;
    out.push({ name, cr_number: cr, permit_number: permit });
  }
  return out;
}

function detectTotalPages(html) {
  let max = 1;
  for (const mm of html.matchAll(/[?&]page=(\d+)/g)) {
    const n = parseInt(mm[1], 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
}

// ---------- network ----------

async function fetchBuffer(url, { retries = 4, timeoutMs = 60000 } = {}) {
  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: ctrl.signal, redirect: 'follow',
        headers: { 'User-Agent': UA, 'Accept': '*/*', 'Accept-Language': 'en-US,en;q=0.9' },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const backoff = 1500 * attempt;
        console.error(`  retry ${attempt}/${retries} (${err.message}) in ${backoff}ms`);
        await new Promise(r => setTimeout(r, backoff));
      }
    } finally { clearTimeout(t); }
  }
  throw lastErr;
}

async function fetchText(url, opts) { return (await fetchBuffer(url, opts)).toString('utf8'); }

async function enrichWithPermits(companies) {
  console.error('Fetching directory page 1 to detect pagination…');
  const first = await fetchText(DIRECTORY_URL);
  const totalPages = detectTotalPages(first);
  console.error(`Directory reports ${totalPages} pages. Crawling for permit numbers…`);

  const byCr = new Map();
  const addCards = (cards) => { for (const c of cards) if (c.cr_number) byCr.set(c.cr_number.trim(), c.permit_number); };
  addCards(parseDirectoryCards(first));

  for (let p = 2; p <= totalPages; p++) {
    try {
      const html = await fetchText(`${DIRECTORY_URL}?page=${p}`);
      addCards(parseDirectoryCards(html));
      console.error(`  page ${p}/${totalPages} ok`);
    } catch (e) {
      console.error(`  page ${p}/${totalPages} FAILED: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 400));
  }

  let matched = 0;
  for (const co of companies) {
    if (co.cr_number && byCr.has(co.cr_number.trim())) {
      co.permit_number = byCr.get(co.cr_number.trim()) || null;
      if (co.permit_number) matched++;
    }
  }
  console.error(`Permit numbers merged for ${matched}/${companies.length} companies.`);
}

// ---------- main ----------

function arg(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? (process.argv[i + 1] ?? true) : undefined;
}

async function main() {
  const out = arg('--out') || 'cra-ict.json';
  const parseFile = arg('--parse-file');
  const withPermits = process.argv.includes('--with-permits');

  let buf;
  if (parseFile && typeof parseFile === 'string') {
    const fs = await import('node:fs/promises');
    buf = await fs.readFile(parseFile);
    console.error(`Parsing local file ${parseFile} (${buf.length} bytes)…`);
  } else {
    console.error(`Fetching export: ${EXPORT_URL}`);
    buf = await fetchBuffer(EXPORT_URL);
    console.error(`Got ${buf.length} bytes.`);
  }

  const { companies, format } = parseExportBuffer(buf);
  console.error(`Parsed ${companies.length} companies from export (${format}).`);

  if (withPermits && !parseFile) {
    await enrichWithPermits(companies);
  }

  const result = { source: 'cra-ict', scraped_at: new Date().toISOString(), companies };
  const fs = await import('node:fs/promises');
  await fs.writeFile(out, JSON.stringify(result, null, 2));
  console.error(`Wrote ${companies.length} companies -> ${out}`);
}

main().catch(err => { console.error('FATAL:', err); process.exit(1); });
