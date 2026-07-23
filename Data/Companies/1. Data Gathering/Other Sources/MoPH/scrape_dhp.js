#!/usr/bin/env node
/**
 * MoPH / DHP — Qatar healthcare facilities + licensed practitioners scraper.
 * ---------------------------------------------------------------------------
 * Source: Department of Healthcare Professions "Search Practitioners" page
 *   https://dhp.moph.gov.qa/en/Pages/SearchPractitionersPage.aspx
 *
 * The page is a heavy ASP.NET WebForms search (323KB VIEWSTATE) protected
 * against datacenter/Firecrawl IPs, so we drive a real browser (Playwright)
 * from this Mac's connection. Two assets come out of it:
 *
 *   1. FACILITIES — the "Place of work" dropdown lists every registered
 *      healthcare facility (~6,500). These are companies (pharmacies, clinics,
 *      hospitals, optics, labs, …). Captured in one page load.
 *
 *   2. PRACTITIONERS — searching by each facility returns its licensed people
 *      across two grids (permanent gv_results + provisional gv_Provisionalresults),
 *      paginated 12/page. Each row: Name · Place of work · Scope of Practice ·
 *      License Number · Licence expiry. Enumerating by facility gives a clean
 *      person → facility link.
 *
 * Robustness: N parallel browser contexts pull facilities off a shared queue,
 * each facility's people are checkpointed to scans/_debug/scraped.jsonl, so a
 * crash / sleep just resumes where it left off. Wrap the run in `caffeinate`
 * (the .command files do) so the Mac doesn't sleep mid-harvest.
 *
 * Output:
 *   scans/moph_facilities_latest.json     — companies[]
 *   scans/moph_practitioners_latest.json  — people[]
 *
 * Run:  click "Install Scraper.command" once, then "Run Scan Now.command".
 *       "Resume Harvest.command" continues an interrupted run.
 */
'use strict';

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const SEARCH_URL = 'https://dhp.moph.gov.qa/en/Pages/SearchPractitionersPage.aspx';
const OUT  = path.join(__dirname, 'scans');
const DBG  = path.join(OUT, '_debug');
const CKPT = path.join(DBG, 'scraped.jsonl');
const UA   = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

const WORKERS      = Number(process.env.DHP_WORKERS || 5);   // parallel browser contexts
const MAX_PAGES    = 500;   // safety cap on pagination per grid per facility
const NAV_TIMEOUT  = 90000;
const RETRY        = 3;
// The DHP site is anti-bot: a HEADLESS browser gets a stripped/challenge page
// (the facility dropdown comes back empty). Run HEADFUL by default so it behaves
// like a real browser. Set DHP_HEADLESS=1 only if you've confirmed it works.
const HEADLESS     = /^(1|true|yes|on)$/i.test(process.env.DHP_HEADLESS || '');

const ensure = (d) => fs.mkdirSync(d, { recursive: true });
const nz = (v) => { const s = (v == null) ? '' : String(v).trim(); return s === '' ? null : s; };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Stable selectors: the field container carries a random GUID, so match on the
// id SUFFIX rather than the full id (robust if the GUID ever changes).
const SEL = {
  facility: "[id$='drp_placeofwork']",
  fname:    "[id$='txt_fname']",
  mname:    "[id$='txt_mname']",
  lname:    "[id$='txt_lname']",
  licence:  "[id$='txt_licence']",
  search:   "[id$='btnSearch']",
  grid1:    "[id$='gv_results']",
  grid2:    "[id$='gv_Provisionalresults']",
};

// ---------------------------------------------------------------------------
// Checkpoint helpers
// ---------------------------------------------------------------------------
function loadDone() {
  const done = new Set();
  if (!fs.existsSync(CKPT)) return done;
  for (const line of fs.readFileSync(CKPT, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    // Only SUCCESSFUL facilities count as done — a record with an `error` means
    // it failed (timeout/challenge), so leave it OUT and let a resume retry it.
    try { const o = JSON.parse(line); if (o.facility_id && !o.error) done.add(String(o.facility_id)); } catch {}
  }
  return done;
}
function appendCkpt(rec) {
  fs.appendFileSync(CKPT, JSON.stringify(rec) + '\n');
}
// Every facility ever attempted (ok or error) is in the checkpoint with its id +
// name. Use it to backstop a partial dropdown read so the facility list/output
// is always complete. Returns Map<facility_id, name>.
function collectFacilitiesFromCheckpoint() {
  const m = new Map();
  if (!fs.existsSync(CKPT)) return m;
  for (const line of fs.readFileSync(CKPT, 'utf-8').split('\n')) {
    if (!line.trim()) continue;
    try { const o = JSON.parse(line); if (o.facility_id) m.set(String(o.facility_id), o.facility_name || null); } catch {}
  }
  return m;
}

// ---------------------------------------------------------------------------
// Per-page extraction (runs in the browser context)
// ---------------------------------------------------------------------------
// Parse the rows of a grid into objects. Returns [] if the grid is absent/empty.
async function readGrid(page, gridSel, provisional) {
  return page.evaluate(({ gridSel, provisional }) => {
    const g = document.querySelector(gridSel);
    if (!g) return { rows: [], pagerTarget: null };
    const trs = [...g.querySelectorAll('tr')];
    const rows = [];
    for (const tr of trs) {
      const tds = [...tr.querySelectorAll('td')].map(td => td.innerText.trim());
      // data rows have the 5 columns; skip header (th) + pager row
      if (tds.length >= 5 && tds[3] && /\w/.test(tds[3]) && !/license number/i.test(tds[3])) {
        rows.push({
          full_name:         tds[0] || null,
          place_of_work:     tds[1] || null,
          scope_of_practice: tds[2] || null,
          license_number:    tds[3] || null,
          license_expiry:    tds[4] || null,
          provisional: !!provisional,
        });
      }
    }
    // Extract the GridView pager postback target (for Page$N navigation), if any.
    let pagerTarget = null;
    const a = g.querySelector("a[href*=\"__doPostBack\"][href*='Page$']");
    if (a) { const m = a.getAttribute('href').match(/__doPostBack\('([^']+)','Page\$\d+'\)/); if (m) pagerTarget = m[1]; }
    return { rows, pagerTarget };
  }, { gridSel, provisional });
}

// Collect every row of one grid across all its pages (dedup by license number).
// Pagination CLICKS the real pager <a> (its javascript:__doPostBack href runs in
// the page's own non-strict context). Calling __doPostBack via page.evaluate
// instead throws "'arguments' may not be accessed on strict mode functions".
async function collectGrid(page, gridSel, provisional) {
  const seen = new Set();
  const all = [];
  const absorb = (rows) => {
    let added = 0;
    for (const r of rows) { const k = r.license_number; if (k && !seen.has(k)) { seen.add(k); all.push(r); added++; } }
    return added;
  };

  let first;
  try { first = await readGrid(page, gridSel, provisional); } catch { return all; }
  absorb(first.rows);
  if (!first.pagerTarget) return all;   // single page

  // Pagination is FAULT-TOLERANT: any hiccup (a postback navigation racing a
  // read on a huge facility) just STOPS paging and keeps the rows gathered so
  // far — we never throw away a facility's already-collected pages.
  let maxLoaded = 1, guard = 0;
  while (guard++ < MAX_PAGES) {
    try {
      // Smallest page number still ahead of us that has a clickable pager link.
      // Walks 2,3,…,10, then the "…" block link (Page$11), and so on.
      const nextN = await page.evaluate(({ gridSel, maxLoaded }) => {
        const g = document.querySelector(gridSel); if (!g) return null;
        const ns = [...g.querySelectorAll("a[href*='Page$']")]
          .map(a => { const m = a.getAttribute('href').match(/Page\$(\d+)/); return m ? Number(m[1]) : null; })
          .filter(n => n != null && n > maxLoaded);
        return ns.length ? Math.min(...ns) : null;
      }, { gridSel, maxLoaded });
      if (nextN == null) break;

      // Find the pager anchor whose href targets exactly Page$nextN (match the
      // href in JS to dodge CSS quoting of '$' and the apostrophe).
      const handles = await page.$$(`${gridSel} a`);
      let target = null;
      const want = new RegExp("Page\\$" + nextN + "'");
      for (const h of handles) {
        const href = await h.getAttribute('href').catch(() => null);
        if (href && want.test(href)) { target = h; break; }
      }
      if (!target) break;

      // Click the pager link and wait for the postback to fully settle BEFORE
      // reading, so the read never races the navigation.
      await Promise.all([
        page.waitForLoadState('domcontentloaded', { timeout: NAV_TIMEOUT }).catch(() => {}),
        target.click({ timeout: NAV_TIMEOUT }),
      ]);
      await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT }).catch(() => {});
      await page.waitForSelector(gridSel, { timeout: NAV_TIMEOUT }).catch(() => {});
      await sleep(200);

      const pg = await readGrid(page, gridSel, provisional);
      const added = absorb(pg.rows);
      maxLoaded = nextN;
      if (added === 0) break;   // no new rows → past the last page
    } catch (e) {
      break;   // keep what we have rather than losing the whole facility
    }
  }
  return all;
}

// Run one facility's search and return its practitioners (both grids, all pages).
async function scrapeFacility(page, facility) {
  // Reset the form to a facility-only search.
  await page.selectOption(SEL.facility, facility.value);
  for (const s of [SEL.fname, SEL.mname, SEL.lname, SEL.licence]) {
    await page.fill(s, '').catch(() => {});
  }
  await Promise.all([
    page.waitForLoadState('domcontentloaded', { timeout: NAV_TIMEOUT }).catch(() => {}),
    page.click(SEL.search),
  ]);
  await page.waitForLoadState('networkidle', { timeout: NAV_TIMEOUT }).catch(() => {});
  await sleep(300);

  const permanent   = await collectGrid(page, SEL.grid1, false);
  const provisional = await collectGrid(page, SEL.grid2, true);
  return [...permanent, ...provisional].map(p => ({
    ...p,
    facility_id:   facility.value,
    facility_name: facility.name,
  }));
}

// ---------------------------------------------------------------------------
// Facility list (the company directory) — read straight off the dropdown
// ---------------------------------------------------------------------------
async function readFacilities(page) {
  const opts = await page.$$eval(SEL.facility + ' option', els =>
    els.map(o => ({ value: o.value.trim(), name: o.textContent.trim() })));
  // drop the placeholder + blanks
  const seen = new Set();
  const out = [];
  for (const o of opts) {
    if (!o.value || !o.name || /^select facility/i.test(o.name)) continue;
    const key = o.value;            // facility id is the unique key
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(o);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function newPage(browser) {
  const ctx = await browser.newContext({
    userAgent: UA,
    viewport: { width: 1366, height: 900 },
    locale: 'en-US',
    timezoneId: 'Asia/Qatar',
  });
  await ctx.addInitScript(() => {
    // Light stealth: hide the webdriver flag some bot filters look for.
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    // ASP.NET's __doPostBack touches `arguments` internally, which throws
    // ("'arguments' may not be accessed on strict mode functions") when called
    // from a strict page.evaluate wrapper. A Function-constructor wrapper is
    // non-strict, so route page-turn postbacks through it.
    try { window.__pb = new Function('t', 'a', 'return __doPostBack(t, a);'); } catch (e) {}
  });
  const page = await ctx.newPage();
  page.setDefaultTimeout(NAV_TIMEOUT);
  await page.goto(SEARCH_URL, { waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT });
  // The facility dropdown is injected after the heavy page initializes — wait
  // until it's actually populated rather than reading an empty <select>.
  // The facility <select> has ~6,500 options and is parsed progressively — wait
  // until its option count STOPS GROWING (fully parsed) before reading it, so we
  // never grab a partial list or fail to select a facility that hasn't loaded yet.
  await page.waitForFunction(
    () => {
      const s = document.querySelector("[id$='drp_placeofwork']");
      if (!s) return false;
      const n = s.options.length;
      const prev = s.__prevCount || 0; s.__prevCount = n;
      return n > 100 && n === prev;   // stable across two polls → done loading
    },
    { timeout: NAV_TIMEOUT, polling: 500 },
  ).catch(() => {});
  return { ctx, page };
}

async function main() {
  ensure(OUT); ensure(DBG);
  const startedAt = new Date();
  console.log(`[dhp] launching browser (${HEADLESS ? 'headless' : 'headful'}) …`);
  const browser = await chromium.launch({ headless: HEADLESS, args: ['--disable-blink-features=AutomationControlled'] });

  // 1) Facility directory. Read the dropdown, then UNION it with facilities
  // already seen in the checkpoint — a partial dropdown load (the huge <select>
  // still parsing) must never drop facilities from the work list or the output.
  const { ctx: ctx0, page: page0 } = await newPage(browser);
  const dropdown = await readFacilities(page0);
  if (dropdown.length === 0) {
    try {
      await page0.screenshot({ path: path.join(DBG, 'facilities_empty.png'), fullPage: true });
      fs.writeFileSync(path.join(DBG, 'facilities_empty.html'), await page0.content());
      console.log('[dhp] WARNING: 0 facilities from dropdown — saved _debug/facilities_empty.{png,html}.');
    } catch {}
  }
  await ctx0.close();

  const facById = new Map();
  for (const [fid, name] of collectFacilitiesFromCheckpoint()) facById.set(fid, { value: fid, name: name || ('facility ' + fid) });
  for (const f of dropdown) facById.set(String(f.value), f);   // dropdown names win
  const facilities = [...facById.values()];
  console.log(`[dhp] facilities: ${dropdown.length.toLocaleString()} from dropdown · ${facilities.length.toLocaleString()} total (with checkpoint)`);
  if (facilities.length === 0) { await browser.close(); throw new Error('No facilities at all — the site likely blocked the browser. See scans/_debug/facilities_empty.png'); }
  writeFacilities(facilities, startedAt);

  // 2) Practitioners — by facility, parallel workers off a shared cursor.
  const done = loadDone();
  const todo = facilities.filter(f => !done.has(String(f.value)));
  console.log(`[dhp] practitioners: ${done.size.toLocaleString()} facilities already done, ${todo.length.toLocaleString()} to go`);

  let cursor = 0, completed = 0, failed = 0;
  async function worker(id) {
    let { ctx, page } = await newPage(browser);
    let onThisPage = 0;
    while (true) {
      const i = cursor++;
      if (i >= todo.length) break;
      const fac = todo[i];
      await sleep(150 + Math.floor(Math.random() * 350));  // stagger workers to ease the anti-bot load
      let ok = false;
      for (let attempt = 1; attempt <= RETRY && !ok; attempt++) {
        try {
          const people = await scrapeFacility(page, fac);
          appendCkpt({ facility_id: fac.value, facility_name: fac.name, count: people.length, practitioners: people });
          completed++; ok = true;
          if (++onThisPage % 40 === 0) {  // recycle the context periodically to keep memory/viewstate fresh
            await ctx.close(); ({ ctx, page } = await newPage(browser)); onThisPage = 0;
          }
        } catch (err) {
          if (attempt === RETRY) { failed++; appendCkpt({ facility_id: fac.value, facility_name: fac.name, count: 0, practitioners: [], error: String(err.message || err) }); }
          else { await sleep(1000 * attempt); try { await ctx.close(); } catch {} ({ ctx, page } = await newPage(browser)); onThisPage = 0; }
        }
      }
      const total = completed + failed;
      if (total % 25 === 0) console.log(`[dhp] ${total.toLocaleString()}/${todo.length.toLocaleString()} facilities · ${failed} failed`);
    }
    await ctx.close().catch(() => {});
  }
  await Promise.all(Array.from({ length: WORKERS }, (_, k) => worker(k)));

  await browser.close();
  buildPractitioners(facilities, startedAt);
  console.log(`[dhp] DONE — ${completed.toLocaleString()} facilities scraped, ${failed} failed.`);
}

// ---------------------------------------------------------------------------
// Output writers
// ---------------------------------------------------------------------------
function writeFacilities(facilities, startedAt) {
  const FILE_PATH = path.join(OUT, 'moph_facilities_latest.json');
  // Merge with any existing file so the list only ever GROWS — a partial read
  // can never shrink it.
  const byId = new Map();
  try {
    const prev = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8'));
    for (const c of (prev.companies || [])) if (c.dhp_facility_id) byId.set(String(c.dhp_facility_id), c);
  } catch {}
  for (const f of facilities) {
    byId.set(String(f.value), { name: f.name, dhp_facility_id: String(f.value), source: 'MoPH', listing_url: SEARCH_URL });
  }
  const companies = [...byId.values()];
  const payload = {
    _meta: { source: 'MoPH - Department of Healthcare Professions (facilities)', scraped_at: startedAt.toISOString(), count: companies.length, url: SEARCH_URL },
    companies,
  };
  fs.writeFileSync(FILE_PATH, JSON.stringify(payload, null, 2));
  console.log(`[dhp] wrote moph_facilities_latest.json (${companies.length})`);
}

function buildPractitioners(facilities, startedAt) {
  const people = [];
  const seen = new Set();   // dedup by license number across facilities
  if (fs.existsSync(CKPT)) {
    for (const line of fs.readFileSync(CKPT, 'utf-8').split('\n')) {
      if (!line.trim()) continue;
      let o; try { o = JSON.parse(line); } catch { continue; }
      for (const p of (o.practitioners || [])) {
        const key = p.license_number || (p.full_name + '|' + p.facility_id);
        if (seen.has(key)) continue;
        seen.add(key);
        people.push(p);
      }
    }
  }
  const payload = {
    _meta: { source: 'MoPH - Department of Healthcare Professions (practitioners)', scraped_at: startedAt.toISOString(), count: people.length, url: SEARCH_URL },
    people,
  };
  fs.writeFileSync(path.join(OUT, 'moph_practitioners_latest.json'), JSON.stringify(payload, null, 2));
  console.log(`[dhp] wrote moph_practitioners_latest.json (${people.length})`);
}

main().catch(err => { console.error('[dhp] FATAL', err); process.exit(1); });
