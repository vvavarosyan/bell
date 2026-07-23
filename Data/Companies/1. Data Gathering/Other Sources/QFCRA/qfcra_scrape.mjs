#!/usr/bin/env node
/**
 * QFCRA Public Register scraper — Qatar Financial Centre Regulatory Authority.
 * ===========================================================================
 *
 * Source of truth (WordPress site, custom register app served from
 * /PublicRegisters/, fronted by a Sucuri WAF):
 *
 *   Authorised Firms .... https://www.qfcra.com/public_registers/search-authorised-firms/
 *   DNFBP Firms ......... https://www.qfcra.com/public_registers/search-dnfbp-firms/
 *   Active Individuals .. https://www.qfcra.com/public_registers/search-active-individuals/
 *   Firm detail ......... https://www.qfcra.com/public_registers/firm-detail?id={internalId}
 *   Individual detail ... https://www.qfcra.com/public_registers/individual-detail?id={AI}
 *
 * Why the Firecrawl REST API, not plain fetch:
 *   The register is behind a Sucuri WAF + JS challenge — a datacenter `fetch`
 *   gets a 403 / challenge page. So we fetch every URL through the Firecrawl
 *   REST API (POST /v1/scrape) with `proxy:"stealth"`, which renders the page
 *   in a real browser, clears the WAF, and returns rendered HTML.
 *
 * -----------------------------------------------------------------------------
 * ROW-COVERAGE PROBLEM + FIX (client-side pagination — the hard part)
 * -----------------------------------------------------------------------------
 *   The register tables are <table id="tableData" class="tablesorter-blue">.
 *   The FULL dataset is embedded server-side in ONE document — every data row is
 *   a <tr> child of #tableData right after </thead> (there is no <tbody> tag).
 *   Confirmed totals (real WAF-passed captures, 2026-06-26):
 *       authorised firms .... 70  firm-detail?id= rows  (20/page, 4 pages)
 *       DNFBP firms ......... 30  rows
 *       active individuals .. 470 individual-detail?id= rows
 *   There is NO ajax endpoint, NO __doPostBack/GridView, NO JSON blob, NO URL
 *   length/page param. Instead the page's own client JS (jQuery tablesorter +
 *   its *pager* widget) runs AFTER load and HIDES / DETACHES every row beyond the
 *   current page. A single render therefore captures only page 1.
 *
 *   FIX (no server param exists, so we drive the pager IN THE BROWSER via
 *   Firecrawl `actions`):
 *     A) Set the pager page-size to its max option (50) and WALK every page,
 *        capturing each page with a {type:"scrape"} action. We over-provision
 *        the walk (firms ceil(70/50)=2, individuals ceil(470/50)=10, plus a few
 *        extra steps — harmless once the table is exhausted).
 *     B) Also attempt a single "show all rows" executeJavascript + one scrape
 *        (tablesorter.showAllRows / huge pageSize / brute un-hide of every <tr>).
 *     The scraper then UNIONS + DEDUPES every captured render
 *     (data.actions.scrapes[]) — by QFC No for firms, by AI Number for people —
 *     and keeps whichever set of captures yields the MOST unique rows. Because
 *     tablesorter *detaches* off-page rows, the page-walk (A) is the reliable
 *     path; show-all (B) is a belt-and-suspenders bonus.
 *
 * Key structural facts (from real captured HTML, 2026-06-26):
 *
 *  FIRMS LIST  <table id="tableData">  (one <tr> header in <thead>, then data <tr>s)
 *    td0 = <a href="firm-detail?id=N">Firm Name</a>   (N = internal id, NOT the QFC No)
 *    td1 = QFC No.            (zero-padded, e.g. 00045)
 *    td2 = Current Firm Status
 *    td3 = Date Authorised        (DD/MM/YYYY)
 *    td4 = Date of Current Status (DD/MM/YYYY)
 *    td5 = hidden sector-type code (ignored)
 *    td6 = hidden <ul class="ULValue"> of previous names (captured as previous_names)
 *
 *  DNFBP LIST  <table id="tableData">  — only two columns, names are plain text:
 *    td0 = Firm Name     td1 = QFC No.    (no status, no dates, no detail link)
 *
 *  INDIVIDUALS LIST  <table id="tableData">
 *    td0 = <a href="individual-detail?id=AI">Last, First</a>
 *    td1 = AI Number  (== the id in the detail link, zero-padded 5 digits)
 *    td2 = HIDDEN cell that already encodes every controlled function as a
 *          comma-joined list of `FirmName##QFCNo##Function##Status##YYYYMMDD##`
 *          segments => the firm linkage + controlled functions for ALL people
 *          come from this ONE page. The per-person detail crawl is therefore
 *          optional (enabled by default; skip via --no-detail).
 *
 *  INDIVIDUAL DETAIL  — a <form> of readonly inputs + a Controlled-Functions table:
 *    input#aiNumber, input#firmName (=person name), input#prevName
 *    <table id="tableData">: per firm a header row
 *        <td colspan="3"><a href="firm-detail?id=N"> 05064 - QINVEST Capital LLC</a></td>
 *      followed by function rows <td>Function</td><td>Status</td><td>Date</td>.
 *
 *  FIRM DETAIL — readonly inputs: #qfcNo, #firmName, #prevName, #currentStatus,
 *    #currStatusDate (ISO yyyy-mm-dd). No "date authorised" here (list-only).
 *
 * Node 22+, global fetch, ZERO npm dependencies (regex/string parsing).
 *   Env: BELL_FIRECRAWL_KEY (or BDI_KEY_FIRECRAWL) must hold a Firecrawl API key.
 *
 * CLI:
 *   node qfcra_scrape.mjs                       # full scrape -> qfcra.json
 *   node qfcra_scrape.mjs --out file.json       # custom output path
 *   node qfcra_scrape.mjs --firms-only          # firms (+DNFBP) only, skip people
 *   node qfcra_scrape.mjs --no-detail           # skip per-person detail crawl (list hidden-cell is enough)
 *   node qfcra_scrape.mjs --limit 20            # cap number of people (testing)
 *   node qfcra_scrape.mjs --parse-firms x.html  # offline: parse a saved firms-list HTML, print JSON
 *   node qfcra_scrape.mjs --parse-people x.html # offline: parse a saved individuals-list HTML
 *   node qfcra_scrape.mjs --parse-detail x.html # offline: parse a saved individual-detail HTML
 */

import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { readFile, writeFile } from 'node:fs/promises';

// ----------------------------------------------------------------------------
// Config
// ----------------------------------------------------------------------------

const ORIGIN = 'https://www.qfcra.com';
const BASE_REG = ORIGIN + '/public_registers';

const URLS = {
  firms:   BASE_REG + '/search-authorised-firms/',
  dnfbp:   BASE_REG + '/search-dnfbp-firms/',
  people:  BASE_REG + '/search-active-individuals/',
  firmDetailBase:   BASE_REG + '/firm-detail?id=',
  personDetailBase: BASE_REG + '/individual-detail?id=',
};

// ---- Firecrawl REST transport -------------------------------------------------
const FIRECRAWL_ENDPOINT = 'https://api.firecrawl.dev/v1/scrape';
const FIRECRAWL_KEY = process.env.BELL_FIRECRAWL_KEY || process.env.BDI_KEY_FIRECRAWL || '';
const PROXY = process.env.BELL_FIRECRAWL_PROXY || 'stealth';   // CONFIRMED to clear the Sucuri WAF

// The tablesorter pager's max page-size option is 50 (options [10,20,30,50]).
const PAGE_SIZE = 50;

// ----------------------------------------------------------------------------
// Pager-driving JavaScript (runs IN THE PAGE via Firecrawl executeJavascript)
// ----------------------------------------------------------------------------

/**
 * SET_PAGE_SIZE_JS — force the tablesorter pager to PAGE_SIZE (50) rows/page and
 * jump to page 1. Also drives any <select> page-length control. Safe no-op if no
 * pager exists. Driven once at the top of the page walk.
 */
const SET_PAGE_SIZE_JS = `
(function () {
  try {
    var $ = window.jQuery || window.$;
    var SIZE = ${PAGE_SIZE};
    if ($ && $.fn) {
      $('table').each(function () {
        var $t = $(this);
        try { if ($.tablesorter && typeof $.tablesorter.setPageSize === 'function') $.tablesorter.setPageSize(this, SIZE); } catch (e) {}
        try {
          var c = this.config, p = c && c.pager;
          if (p) { p.size = SIZE; }
        } catch (e) {}
        try { $t.trigger('pageSize', SIZE); } catch (e) {}
        try { $t.trigger('pageAndSize', [1, SIZE]); } catch (e) {}
        try { $t.trigger('pageSet', 0); } catch (e) {}
      });
    }
    // Any page-length <select>: pick the option whose value === SIZE (or the max).
    try {
      var sels = document.querySelectorAll('select[name$="_length"], select.dataTables_length, select#pageLength, select.pagesize, select.pager-size, select.pagenum');
      for (var s = 0; s < sels.length; s++) {
        var sel = sels[s], chosen = -1, best = -1;
        for (var i = 0; i < sel.options.length; i++) {
          var v = parseInt(sel.options[i].value, 10);
          if (v === SIZE) { chosen = i; break; }
          if (!isNaN(v) && v > best) { best = v; chosen = i; }
        }
        if (chosen >= 0) { sel.selectedIndex = chosen; sel.dispatchEvent(new Event('change', { bubbles: true })); }
      }
    } catch (e) {}
    try { document.documentElement.setAttribute('data-bell-pagesize', String(SIZE)); } catch (e) {}
  } catch (e) {}
})();
`.trim();

/**
 * gotoPageJS(n) — move the tablesorter pager to ZERO-BASED page n. tablesorter's
 * 'pageSet' event takes a zero-based page index. Safe no-op if no pager.
 */
function gotoPageJS(zeroBasedPage) {
  return `
(function () {
  try {
    var $ = window.jQuery || window.$;
    var N = ${zeroBasedPage};
    if ($ && $.fn) {
      $('table').each(function () {
        var $t = $(this);
        try { $t.trigger('pageSet', N); } catch (e) {}
        try {
          var c = this.config, p = c && c.pager;
          if (p && typeof p.page === 'number') { p.page = N; }
        } catch (e) {}
      });
    }
    try { document.documentElement.setAttribute('data-bell-page', String(N)); } catch (e) {}
  } catch (e) {}
})();
`.trim();
}

/**
 * SHOW_ALL_JS — belt-and-suspenders: ask the pager to show ALL rows and
 * brute-force un-hide every <tr> in #tableData (ROWS ONLY — never <td>, so the
 * legit hidden cells such as the controlled-functions blob and previous-names
 * <ul> stay present-but-hidden and keep parsing). Captured as one extra render.
 */
const SHOW_ALL_JS = `
(function () {
  try {
    var $ = window.jQuery || window.$;
    if ($ && $.fn) {
      try {
        $('table').each(function () {
          var $t = $(this);
          try { if ($.tablesorter && typeof $.tablesorter.showAllRows === 'function') $.tablesorter.showAllRows(this); } catch (e) {}
          try { if ($.tablesorter && typeof $.tablesorter.setPageSize === 'function') $.tablesorter.setPageSize(this, 1000000); } catch (e) {}
          try {
            var c = this.config, p = c && c.pager;
            if (p) { p.size = 1000000; if (typeof p.showAllRows === 'function') { try { p.showAllRows(this, p); } catch (e) {} } }
          } catch (e) {}
          try { $t.trigger('pageSize', 1000000); } catch (e) {}
          try { $t.trigger('pageAndSize', [1, 1000000]); } catch (e) {}
          try { $t.trigger('pageSet', 0); } catch (e) {}
          try { $t.trigger('disablePager'); } catch (e) {}
          try { $t.trigger('destroyPager'); } catch (e) {}
        });
      } catch (e) {}
      try {
        if ($.fn.DataTable) {
          $('table').each(function () {
            try { if ($.fn.DataTable.isDataTable(this)) $(this).DataTable().page.len(-1).draw(false); } catch (e) {}
          });
        }
      } catch (e) {}
    }
    // Brute-force un-hide every data ROW of #tableData (ROWS ONLY).
    try {
      var tables = document.querySelectorAll('table#tableData, table.tablesorter-blue, table.tablesorter');
      for (var ti = 0; ti < tables.length; ti++) {
        var trs = tables[ti].getElementsByTagName('tr');
        for (var ri = 0; ri < trs.length; ri++) {
          var tr = trs[ri];
          try {
            tr.style.display = '';
            tr.style.visibility = '';
            tr.removeAttribute('hidden');
            tr.classList.remove('filtered');
            tr.classList.remove('pager-hidden');
          } catch (e) {}
        }
      }
    } catch (e) {}
    try { document.documentElement.setAttribute('data-bell-expanded', '1'); } catch (e) {}
  } catch (e) {}
})();
`.trim();

/**
 * Build the Firecrawl `actions` array that drives the pager and captures EVERY
 * page. `pages` is how many pages to walk (over-provisioned by the caller).
 *   - wait for the WAF + table render
 *   - set page-size to 50, scrape page 1
 *   - for each remaining page: pageSet(n), wait, scrape
 *   - finally: show-all, scrape once more (bonus union source)
 */
function buildPagerActions(pages) {
  const a = [];
  a.push({ type: 'wait', milliseconds: 4000 });                       // clear Sucuri + initial render
  a.push({ type: 'executeJavascript', script: SET_PAGE_SIZE_JS });
  a.push({ type: 'wait', milliseconds: 1400 });
  a.push({ type: 'scrape' });                                         // page 1 (zero-based 0)
  for (let p = 1; p < pages; p++) {
    a.push({ type: 'executeJavascript', script: gotoPageJS(p) });
    a.push({ type: 'wait', milliseconds: 1100 });
    a.push({ type: 'scrape' });
  }
  // bonus: one show-all capture (helps if the pager kept rows attached)
  a.push({ type: 'executeJavascript', script: SHOW_ALL_JS });
  a.push({ type: 'wait', milliseconds: 1600 });
  a.push({ type: 'scrape' });
  return a;
}

// ----------------------------------------------------------------------------
// Tiny dependency-free HTML helpers
// ----------------------------------------------------------------------------

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  '#39': "'", '#x27': "'", '#x2F': '/', '#47': '/', '#xa0': ' ', '#160': ' ',
};

function decodeEntities(s) {
  if (!s) return '';
  return String(s).replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, code) => {
    const key = code.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, code)) return NAMED_ENTITIES[code];
    if (Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, key)) return NAMED_ENTITIES[key];
    if (code[0] === '#') {
      const num = (code[1] === 'x' || code[1] === 'X')
        ? parseInt(code.slice(2), 16)
        : parseInt(code.slice(1), 10);
      if (Number.isFinite(num)) { try { return String.fromCodePoint(num); } catch { return m; } }
    }
    return m;
  });
}

const stripTags = (s) => String(s || '').replace(/<[^>]*>/g, '');

const clean = (s) =>
  decodeEntities(stripTags(s))
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const nz = (v) => { const c = clean(v); return c === '' ? null : c; };

/** Pull the FIRST <table id="tableData">…</table>; fall back to first <table>. */
function isolateRegisterTable(html) {
  const byId = html.match(/<table\b[^>]*id=["']tableData["'][^>]*>[\s\S]*?<\/table>/i);
  if (byId) return byId[0];
  const any = html.match(/<table\b[\s\S]*?<\/table>/i);
  return any ? any[0] : html;
}

/** All <tr>…</tr> blocks inside a chunk. */
const rowsOf = (chunk) => [...chunk.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => m[1]);

/** All <td|th> cells of a row, returned as RAW inner-HTML (caller cleans). */
const cellsOf = (row) => [...row.matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((m) => m[1]);

/** Does this row sit inside a <thead> / is it a header row of <th>s? */
const isHeaderRow = (row) => /<th\b/i.test(row);

/** value="..." of an <input id="X"> (readonly form fields on detail pages). */
function inputValueById(html, id) {
  const re = new RegExp(`<input\\b[^>]*\\bid=["']${id}["'][^>]*>`, 'i');
  const tag = html.match(re);
  if (!tag) return null;
  const v = tag[0].match(/\bvalue=["']([^"']*)["']/i);
  return v ? nz(v[1]) : null;
}

/** Convert DD/MM/YYYY or YYYY-MM-DD or YYYYMMDD -> ISO YYYY-MM-DD (else null). */
function toISODate(s) {
  const v = clean(s);
  if (!v) return null;
  let m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);      // DD/MM/YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);            // already ISO-ish
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = v.match(/^(\d{4})(\d{2})(\d{2})$/);                  // YYYYMMDD
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return v; // unknown format: keep raw rather than lose it
}

/** "Last, First Middle" -> "First Middle Last". Returns null if no comma. */
function normalizeName(raw) {
  const v = clean(raw);
  if (!v || !v.includes(',')) return null;
  const i = v.indexOf(',');
  const last = v.slice(0, i).trim();
  const rest = v.slice(i + 1).trim();
  if (!last || !rest) return null;
  return `${rest} ${last}`.replace(/\s+/g, ' ').trim();
}

// ----------------------------------------------------------------------------
// PARSERS (pure functions over HTML — validated offline against real captures)
// ----------------------------------------------------------------------------

/** Parse the Authorised-Firms list. */
export function parseFirmsList(html, { firmType = 'Authorised Firm', sourceUrl = URLS.firms } = {}) {
  const table = isolateRegisterTable(html);
  const out = [];
  for (const row of rowsOf(table)) {
    if (isHeaderRow(row)) continue;
    const cells = cellsOf(row);
    if (cells.length < 2) continue;

    const nameCell = cells[0];
    const name = nz(nameCell);
    const qfc = nz(cells[1]);
    if (!name || !qfc || !/\d/.test(qfc)) continue;

    const detailId = (nameCell.match(/firm-detail\?id=(\d+)/i) || [])[1] || null;

    const prevCellRaw = cells[cells.length - 1] || '';
    let previous_names = [...prevCellRaw.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)]
      .map((m) => clean(m[1]))
      .filter((x) => x && x.toLowerCase() !== 'none');
    if (!previous_names.length) previous_names = null;

    out.push({
      name,
      qfc_number: qfc,
      firm_type: firmType,
      status: nz(cells[2]),
      date_authorised: cells[3] ? toISODate(cells[3]) : null,
      date_of_current_status: cells[4] ? toISODate(cells[4]) : null,
      previous_names,
      detail_id: detailId,
      source_url: detailId ? `${URLS.firmDetailBase}${detailId}` : sourceUrl,
    });
  }
  return out;
}

/** Parse the DNFBP-Firms list (Firm Name | QFC No. only). */
export function parseDnfbpList(html, { sourceUrl = URLS.dnfbp } = {}) {
  const table = isolateRegisterTable(html);
  const out = [];
  for (const row of rowsOf(table)) {
    if (isHeaderRow(row)) continue;
    const cells = cellsOf(row);
    if (cells.length < 2) continue;
    const name = nz(cells[0]);
    const qfc = nz(cells[1]);
    if (!name || !qfc || !/\d/.test(qfc)) continue;
    out.push({
      name,
      qfc_number: qfc,
      firm_type: 'DNFBP',
      status: null,
      date_authorised: null,
      date_of_current_status: null,
      previous_names: null,
      detail_id: null,
      source_url: sourceUrl,
    });
  }
  return out;
}

/**
 * Decode the hidden controlled-functions cell on the individuals list.
 * Format: repeated `FirmName##QFCNo##Function##Status##YYYYMMDD##` joined by ",".
 */
export function parseHiddenControlledFunctions(rawCell) {
  const txt = decodeEntities(stripTags(rawCell || '')).trim();
  if (!txt) return [];
  const out = [];
  const segments = txt.split(/##\s*,/).map((s) => s.replace(/##\s*$/, '').replace(/,\s*$/, '')).filter(Boolean);
  for (const seg of segments) {
    const parts = seg.split('##').map((p) => p.trim());
    const [firm_name, qfc_number, func, status, date] = parts;
    if (!firm_name && !func) continue;
    out.push({
      firm_name: firm_name ? clean(firm_name) : null,
      qfc_number: qfc_number && /\d/.test(qfc_number) ? clean(qfc_number) : null,
      function: func ? clean(func) : null,
      status: status ? clean(status) : null,
      date: date ? toISODate(date) : null,
    });
  }
  return out;
}

/** Parse the Active-Individuals list (full linkage embedded in hidden cell). */
export function parsePeopleList(html, { sourceUrl = URLS.people } = {}) {
  const table = isolateRegisterTable(html);
  const out = [];
  for (const row of rowsOf(table)) {
    if (isHeaderRow(row)) continue;
    const cells = cellsOf(row);
    if (cells.length < 2) continue;

    const nameCell = cells[0];
    const nameRaw = nz(nameCell);
    const ai = nz(cells[1]);
    if (!nameRaw || !ai || !/\d/.test(ai)) continue;

    const detailId = (nameCell.match(/individual-detail\?id=([0-9A-Za-z]+)/i) || [])[1] || ai;
    const cf = cells.length >= 3 ? parseHiddenControlledFunctions(cells[2]) : [];
    const primary = cf[0] || {};

    out.push({
      name: normalizeName(nameRaw) || nameRaw,
      name_raw: nameRaw,
      ai_number: ai,
      firm_name: primary.firm_name || null,
      qfc_number: primary.qfc_number || null,
      controlled_functions: cf,
      status: primary.status || null,
      date_of_current_status: primary.date || null,
      source_url: `${URLS.personDetailBase}${detailId}`,
    });
  }
  return out;
}

/** Parse an individual-detail page. */
export function parseIndividualDetail(html, { sourceUrl = null } = {}) {
  const ai_number = inputValueById(html, 'aiNumber');
  const nameRaw = inputValueById(html, 'firmName'); // detail page reuses #firmName for the person
  const prev = inputValueById(html, 'prevName');

  const table = isolateRegisterTable(html);
  const controlled_functions = [];
  let curFirmName = null;
  let curQfc = null;
  for (const row of rowsOf(table)) {
    if (isHeaderRow(row)) continue;
    const cells = cellsOf(row);
    if (cells.length === 0) continue;

    if (cells.length === 1) {
      const t = clean(cells[0]);
      const m = t.match(/^(\d{3,6})\s*-\s*(.+)$/);
      if (m) { curQfc = m[1]; curFirmName = m[2].trim(); }
      else { curFirmName = t || curFirmName; }
      continue;
    }
    const func = nz(cells[0]);
    if (!func) continue;
    controlled_functions.push({
      firm_name: curFirmName,
      qfc_number: curQfc,
      function: func,
      status: nz(cells[1]),
      date: cells[2] ? toISODate(cells[2]) : null,
    });
  }

  return {
    ai_number,
    name: normalizeName(nameRaw) || nameRaw,
    name_raw: nameRaw,
    previous_names: prev ? [prev] : null,
    controlled_functions,
    source_url: sourceUrl || (ai_number ? `${URLS.personDetailBase}${ai_number}` : null),
  };
}

/** Parse a firm-detail page (readonly form). */
export function parseFirmDetail(html, { sourceUrl = null } = {}) {
  const qfc_number = inputValueById(html, 'qfcNo');
  const name = inputValueById(html, 'firmName');
  const prev = inputValueById(html, 'prevName');
  const status = inputValueById(html, 'currentStatus');
  const statusDate = inputValueById(html, 'currStatusDate');
  return {
    name,
    qfc_number,
    status,
    date_of_current_status: statusDate ? toISODate(statusDate) : null,
    previous_names: prev ? [prev] : null,
    source_url: sourceUrl,
  };
}

/** Count data rows of #tableData in a captured HTML (header rows excluded). */
function countDataRows(html) {
  const table = isolateRegisterTable(html);
  let n = 0;
  for (const row of rowsOf(table)) {
    if (isHeaderRow(row)) continue;
    if (cellsOf(row).length >= 2) n++;
  }
  return n;
}

// ----------------------------------------------------------------------------
// Firecrawl transport
// ----------------------------------------------------------------------------

function log(...a) { process.stderr.write(a.join(' ') + '\n'); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * firecrawlScrape — POST one URL to the Firecrawl REST API (/v1/scrape) and
 * return the parsed response `data` object ({ rawHtml, html, links, actions:{
 * scrapes:[...] }, ... }), or throw on persistent failure.
 * 3 retries w/ backoff on non-200 / success:false; ~400ms pacing after success.
 *
 * @param {string} url
 * @param {object} o  { formats, proxy, waitFor, actions, retries, timeoutMs, pace }
 */
async function firecrawlScrape(url, o = {}) {
  const {
    formats = ['rawHtml'],
    proxy = PROXY,
    waitFor = 0,
    actions = null,
    retries = 3,
    timeoutMs = 180_000,
    pace = 400,
  } = o;

  const payload = { url, formats, proxy };
  if (waitFor) payload.waitFor = waitFor;
  if (actions && actions.length) payload.actions = actions;

  let lastErr;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const ctl = new AbortController();
      const to = setTimeout(() => ctl.abort(), timeoutMs);
      const res = await fetch(FIRECRAWL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${FIRECRAWL_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: ctl.signal,
      }).finally(() => clearTimeout(to));

      if (!res.ok) {
        let txt = '';
        try { txt = (await res.text()).slice(0, 200); } catch { /* ignore */ }
        if (res.status === 402) throw new Error(`Firecrawl HTTP 402 (out of credits) ${txt}`);
        throw new Error(`Firecrawl HTTP ${res.status} ${txt}`);
      }
      const body = await res.json().catch(() => null);
      if (!body || !body.success || !body.data) {
        const m = body && (body.error || body.message) ? (body.error || body.message) : 'success:false';
        throw new Error(`Firecrawl ${m}`);
      }
      if (pace) await sleep(pace);
      return body.data;
    } catch (e) {
      lastErr = e;
      if (/402/.test(String(e && e.message))) break; // out of credits — stop
      if (attempt < retries) {
        const backoff = Math.min(15000, 1000 * attempt) + Math.floor(Math.random() * 400);
        log(`  retry ${attempt}/${retries - 1} for ${url} after ${backoff}ms (${e.message})`);
        await sleep(backoff);
      }
    }
  }
  throw lastErr || new Error(`Failed to scrape ${url}`);
}

/** Pull every HTML capture out of a Firecrawl data object: per-action scrapes + the top-level body. */
function htmlsFromData(data) {
  const htmls = [];
  if (!data) return htmls;
  const scrapes = data.actions && Array.isArray(data.actions.scrapes) ? data.actions.scrapes : [];
  for (const s of scrapes) {
    const h = s && (s.rawHtml || s.html);
    if (h) htmls.push(h);
  }
  const top = data.rawHtml || data.html;
  if (top) htmls.push(top);
  return htmls;
}

/**
 * Render a register LIST page via Firecrawl `actions`, driving the client-side
 * pager to capture EVERY page, then UNION + DEDUPE rows across all captures.
 * The full dataset is server-embedded but the pager hides/detaches rows past the
 * current page; the actions walk page-size=50 across `pages` pages (+ a show-all
 * capture). We parse every capture with `parseFn`, dedupe by `keyOf`, and keep
 * the union. Returns the deduped array of records.
 *
 * @param {string} url
 * @param {object} o { label, totalGuess, parseFn, keyOf, pages }
 */
async function fetchListAllRows(url, { label = 'list', totalGuess = 70, parseFn, keyOf, pages } = {}) {
  // Over-provision the page walk: ceil(total/50) + 2 spare steps.
  const walk = pages || (Math.ceil(totalGuess / PAGE_SIZE) + 2);
  const actions = buildPagerActions(walk);

  log(`  ${label}: fetching via Firecrawl actions (page-size ${PAGE_SIZE}, walking ${walk} pages + show-all)…`);
  const data = await firecrawlScrape(url, {
    formats: ['rawHtml'],
    proxy: PROXY,
    waitFor: 4000,
    actions,
    timeoutMs: 180_000,
  });

  const captures = htmlsFromData(data);
  log(`  ${label}: ${captures.length} captures returned; max ${Math.max(0, ...captures.map(countDataRows))} rows in a single capture`);

  // UNION + DEDUPE across every capture.
  const merged = new Map();
  let parsedTotal = 0;
  for (const html of captures) {
    let recs;
    try { recs = parseFn(html); } catch { recs = []; }
    parsedTotal += recs.length;
    for (const r of recs) {
      const k = keyOf(r);
      if (!k) continue;
      if (!merged.has(k)) merged.set(k, r);
    }
  }
  const out = [...merged.values()];
  log(`  ${label}: parsed ${parsedTotal} rows across captures -> ${out.length} unique`);
  return out;
}

// ----------------------------------------------------------------------------
// Orchestration
// ----------------------------------------------------------------------------

function dedupeFirms(list) {
  const seen = new Map();
  for (const f of list) {
    const key = (f.qfc_number || f.name || '').toLowerCase() + '|' + f.firm_type;
    if (!seen.has(key)) seen.set(key, f);
  }
  return [...seen.values()];
}

const firmKey = (f) => (f.qfc_number || f.name || '').toString().trim().toLowerCase() || null;
const personKey = (p) => (p.ai_number || p.name_raw || p.name || '').toString().trim().toLowerCase() || null;

async function scrape(opts) {
  const scraped_at = new Date().toISOString();
  const companies = [];
  let people = [];

  // ---- Firms (Authorised) ----  (real total ~ 70; ceil(70/50)=2 pages)
  log('• Fetching Authorised Firms list …');
  const firms = await fetchListAllRows(URLS.firms, {
    label: 'firms', totalGuess: 70,
    parseFn: (h) => parseFirmsList(h),
    keyOf: firmKey,
  });
  log(`  parsed ${firms.length} authorised firms`);
  companies.push(...firms);

  // ---- DNFBP firms ----  (real total ~ 30; 1 page)
  log('• Fetching DNFBP Firms list …');
  try {
    const dnfbp = await fetchListAllRows(URLS.dnfbp, {
      label: 'DNFBP', totalGuess: 30,
      parseFn: (h) => parseDnfbpList(h),
      keyOf: firmKey,
    });
    log(`  parsed ${dnfbp.length} DNFBP firms`);
    companies.push(...dnfbp);
  } catch (e) {
    log(`  ! DNFBP fetch failed (continuing): ${e.message}`);
  }

  if (!opts.firmsOnly) {
    // ---- Active Individuals ----  (real total ~ 470; ceil(470/50)=10 pages)
    log('• Fetching Active Individuals list …');
    people = await fetchListAllRows(URLS.people, {
      label: 'individuals', totalGuess: 470,
      parseFn: (h) => parsePeopleList(h),
      keyOf: personKey,
    });
    log(`  parsed ${people.length} individuals (controlled functions already embedded)`);

    if (opts.limit && people.length > opts.limit) {
      people = people.slice(0, opts.limit);
      log(`  capped to ${people.length} (--limit)`);
    }

    // ---- Optional per-person detail enrichment ----
    if (!opts.noDetail) {
      log(`• Enriching ${people.length} people via individual-detail pages (~400ms pacing) …`);
      let done = 0;
      for (const p of people) {
        const id = (p.source_url.match(/id=([0-9A-Za-z]+)/) || [])[1] || p.ai_number;
        try {
          const dData = await firecrawlScrape(`${URLS.personDetailBase}${id}`, {
            formats: ['rawHtml'], proxy: PROXY, waitFor: 3000, timeoutMs: 90_000,
          });
          const dHtml = dData.rawHtml || dData.html || '';
          const detail = parseIndividualDetail(dHtml, { sourceUrl: `${URLS.personDetailBase}${id}` });
          if (detail.controlled_functions && detail.controlled_functions.length) {
            p.controlled_functions = detail.controlled_functions;
            const primary = detail.controlled_functions[0];
            p.firm_name = primary.firm_name || p.firm_name;
            p.qfc_number = primary.qfc_number || p.qfc_number;
            p.status = primary.status || p.status;
            p.date_of_current_status = primary.date || p.date_of_current_status;
          }
          if (detail.previous_names) p.previous_names = detail.previous_names;
        } catch (e) {
          log(`  ! detail failed for AI ${id} (keeping list data): ${e.message}`);
        }
        done++;
        if (done % 25 === 0) log(`    … ${done}/${people.length}`);
        await sleep(400); // polite pacing
      }
    } else {
      log('• Skipping per-person detail crawl (--no-detail); list hidden-cell linkage retained.');
    }
  } else {
    log('• --firms-only: skipping individuals.');
  }

  const result = {
    source: 'qfcra',
    scraped_at,
    companies: dedupeFirms(companies).map(stripFirmInternal),
    people: people.map(stripPersonInternal),
  };
  return result;
}

// ---- shape the EXACT output records (drop internal-only helper fields) -------
function stripFirmInternal(f) {
  return {
    name: f.name ?? null,
    qfc_number: f.qfc_number ?? null,
    firm_type: f.firm_type ?? null,
    status: f.status ?? null,
    date_authorised: f.date_authorised ?? null,
    date_of_current_status: f.date_of_current_status ?? null,
    source_url: f.source_url ?? null,
  };
}
function stripPersonInternal(p) {
  return {
    name: p.name ?? null,
    ai_number: p.ai_number ?? null,
    firm_name: p.firm_name ?? null,
    qfc_number: p.qfc_number ?? null,
    controlled_functions: p.controlled_functions ?? [],
    status: p.status ?? null,
    date_of_current_status: p.date_of_current_status ?? null,
    source_url: p.source_url ?? null,
  };
}

// ----------------------------------------------------------------------------
// CLI
// ----------------------------------------------------------------------------

function parseArgs(argv) {
  const o = { out: 'qfcra.json', limit: null, firmsOnly: false, noDetail: false,
              parseFirms: null, parsePeople: null, parseDetail: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i];
    else if (a === '--limit') o.limit = parseInt(argv[++i], 10) || null;
    else if (a === '--firms-only') o.firmsOnly = true;
    else if (a === '--no-detail') o.noDetail = true;
    else if (a === '--parse-firms') o.parseFirms = argv[++i];
    else if (a === '--parse-people') o.parsePeople = argv[++i];
    else if (a === '--parse-detail') o.parseDetail = argv[++i];
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));

  // Offline parse modes (no network / no Firecrawl) — for validation.
  if (o.parseFirms || o.parsePeople || o.parseDetail) {
    if (o.parseFirms) {
      const html = await readFile(o.parseFirms, 'utf8');
      process.stdout.write(JSON.stringify(parseFirmsList(html), null, 2) + '\n');
    }
    if (o.parsePeople) {
      const html = await readFile(o.parsePeople, 'utf8');
      process.stdout.write(JSON.stringify(parsePeopleList(html), null, 2) + '\n');
    }
    if (o.parseDetail) {
      const html = await readFile(o.parseDetail, 'utf8');
      process.stdout.write(JSON.stringify(parseIndividualDetail(html), null, 2) + '\n');
    }
    return;
  }

  // Live scrape: require a Firecrawl API key.
  if (!FIRECRAWL_KEY) {
    log('');
    log('✗ No Firecrawl API key found.');
    log('  The QFCRA register is behind a Sucuri WAF; a plain fetch is 403-blocked, so this');
    log('  scraper fetches via the Firecrawl REST API (proxy:"stealth"). Set the key and re-run:');
    log('    export BELL_FIRECRAWL_KEY="fc-..."     (or BDI_KEY_FIRECRAWL)');
    process.exit(2);
  }

  log(`QFCRA scraper — fetching via Firecrawl REST API (proxy:${PROXY})`);
  const result = await scrape(o);
  await writeFile(o.out, JSON.stringify(result, null, 2));
  log('');
  log(`✓ Wrote ${o.out}`);
  log(`  companies: ${result.companies.length}  (authorised: ${result.companies.filter(c=>c.firm_type==='Authorised Firm').length}, DNFBP: ${result.companies.filter(c=>c.firm_type==='DNFBP').length})`);
  log(`  people:    ${result.people.length}`);
}

// Robust main-guard (handles spaces in the path).
const isMain = process.argv[1] && resolve(fileURLToPath(import.meta.url)) === resolve(process.argv[1]);
if (isMain) {
  main().catch((e) => { log('FATAL: ' + (e && e.stack || e)); process.exit(1); });
}
