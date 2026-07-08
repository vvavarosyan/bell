// QatarEnergy tender scraper — qatarenergy.qa.
// ----------------------------------------------------------------------------
// QatarEnergy (source #3) publishes tenders through an ASMX JSON web service
// (QPTendersService.asmx), rendered client-side on the Tenders page. That means
// we DON'T scrape HTML or drive postbacks — we POST each service method and read
// a clean JSON array. Verified live 2026-07-08: the endpoints are anonymously
// accessible (no cookie/session), so this needs NO browser (no Crawl4AI /
// Playwright) — just a plain fetch. Light on memory, unlike the other sources.
//
// Even better: the AWARDED methods include TD_AWARDED_TO — the winning
// contractor — plus the award price, straight from JSON. That's the tender→
// company linkage (award_company_name → linkTenderCompanies), no HTML needed.
//
// Methods (verified counts 2026-07-08): GetLatestQPTenders (open, ~6),
// GetFutureQPTenders (upcoming, ~31), GetAwardedContractQPTenders (~1,029, with
// winner), GetAwardedPOS (~30), GetAwardedAgreements (~140). Latest already spans
// the Direct/Limited/General categories, so GetQPTenderByCategory isn't needed.

const BASE = 'https://www.qatarenergy.qa/_layouts/15/QPSupplyManagement/QPTendersService.asmx';
const VIEW = 'https://www.qatarenergy.qa/en/SupplyManagement/Tenders/Pages/ViewTenders.aspx';
const BUYER = 'QatarEnergy';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// Each ASMX method → the section + the status we file its rows under. Awarded
// sections are listed LAST so that if a just-awarded tender also appears under
// Latest, the awarded row upserts second and wins (status='awarded' + winner).
const METHODS = [
  { method: 'GetLatestQPTenders',          section: 'latest',            status: 'open',       awdType: 'latesttenders' },
  { method: 'GetFutureQPTenders',          section: 'future',            status: 'prospected', awdType: 'futuretenders' },
  { method: 'GetAwardedContractQPTenders', section: 'awarded_contract',  status: 'awarded',    awdType: 'awardedcontracts' },
  { method: 'GetAwardedPOS',               section: 'awarded_po',        status: 'awarded',    awdType: 'awardedpos' },
  { method: 'GetAwardedAgreements',        section: 'awarded_agreement', status: 'awarded',    awdType: 'awardedagreements' },
];

// ASP.NET JSON dates come as "/Date(1785110400000)/".
function parseAspNetDate(s) {
  const m = String(s || '').match(/\/Date\((-?\d+)\)\//);
  if (!m) return null;
  const d = new Date(Number(m[1]));
  return isNaN(d.getTime()) ? null : d.toISOString();
}
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}
function clean(v, max = 400) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

/** POST one ASMX method (empty body) → its JSON array. Retries once on failure. */
async function callMethod(method, timeoutMs = 20_000) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(`${BASE}/${method}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'User-Agent': UA,
          'Referer': `${VIEW}`,
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: '{}',
        signal: ctl.signal,
      });
      if (!res.ok) { if (attempt) return []; continue; }
      const j = await res.json().catch(() => null);
      const d = j && (j.d !== undefined ? j.d : j);
      return Array.isArray(d) ? d : [];
    } catch {
      if (attempt) return [];
      await new Promise((r) => setTimeout(r, 800));
    } finally {
      clearTimeout(to);
    }
  }
  return [];
}

/** Map one ASMX record → a Bell tender row. */
export function qeRecordToRow(r, meta) {
  const title = clean(r.TENDER_TITLE, 400);
  // Future (upcoming) tenders have no TENDER_NUMBER yet — synthesize a stable ref
  // from the contract sequence (or the record id) so they can still be tracked.
  const source_ref = clean(r.TENDER_NUMBER, 120)
    || (title ? `QE-${meta.section.toUpperCase()}-${clean(r.CONTRACT_SEQ, 40) || clean(r.ID, 40)}` : null);
  if (!source_ref || !title) return null;
  const awardedTo = clean(r.TD_AWARDED_TO, 200);
  const isAward = String(r.TD_STATUS || '').toLowerCase() === 'award' || meta.status === 'awarded';
  const status = isAward ? 'awarded' : meta.status;
  return {
    source: 'qatarenergy',
    source_ref,
    title,
    buyer: BUYER,
    category: clean(r.TENDER_CATEGORY, 80),
    status,
    award_company_name: status === 'awarded' ? (awardedTo || null) : null,
    value_amount: num(r.TD_PRICE),
    currency: clean(r.TD_CURRENCY, 8) || 'QAR',
    published_at: parseAspNetDate(r.TD_PLANNED_ISSUE) || parseAspNetDate(r.DATECREATED),
    deadline_at: parseAspNetDate(r.TENDER_CLOSING_DATE),
    awarded_at: status === 'awarded' ? (parseAspNetDate(r.TD_PLANNED_AWRD) || parseAspNetDate(r.DATECREATED)) : null,
    url: `${VIEW}?TenderId=${encodeURIComponent(r.ID)}&awdType=${meta.awdType}`,
    raw: {
      section: meta.section,
      department: clean(r.TD_DEPARTMENT, 120) || clean(r.DEPT, 120),
      bond: clean(r.TENDER_BOND, 40),
      fee: clean(r.TENDER_FEE, 40),
      po_number: clean(r.PO_NUMBER, 60),
      agreement_ref: clean(r.AGREEMENT_REF, 60),
      location: clean(r.TENDER_LOCATION, 120),
      closing_time: clean(r.TENDER_CLOSING_TIME, 40),
      price: clean(r.TD_PRICE, 40),
      awarded_to: awardedTo,
    },
  };
}

/**
 * Scrape all QatarEnergy tender surfaces (latest + future + the three awarded
 * types). Returns rows ready for ingestTenders (award_company_name feeds
 * linkTenderCompanies). Plain fetch — no browser, no Crawl4AI required.
 */
export async function scrapeQatarEnergy(_opts = {}) {
  const all = [];
  for (const meta of METHODS) {
    let records = [];
    try { records = await callMethod(meta.method); }
    catch { records = []; }
    for (const r of records) {
      const row = qeRecordToRow(r, meta);
      if (row) all.push(row);   // no cross-section dedup — ingest upserts by (source, source_ref); awarded is last so it wins
    }
  }
  return all;
}
