// Kahramaa tender scraper — km.qa (Qatar's electricity & water utility).
// ----------------------------------------------------------------------------
// Source #4 (Phase 2 C4). Kahramaa's SharePoint site exposes an ASMX JSON
// script service — the QatarEnergy pattern again: plain fetch, no browser, no
// session (all verified live 2026-07-12):
//
//   BusinessWebService.asmx/GetTendersCountListing → "total_m1_m2_…" where m<i>
//     is the page-cursor marker for page i (SharePoint list positions).
//   BusinessWebService.asmx/GetTendersPaging → 20 rows per page. Fields incl.
//     Number ("LTC/2451/2026"), Title, Start/EndDate (ASP.NET /Date(ms)/ +
//     dd-mm-yyyy formatted twins), Status ("1;#1" open · "2;#2" closed),
//     Fees, BidBond, Department, Type, IsRefloat and — notably —
//     MonaqasatNumber, the tender's id on the central Monaqasat portal
//     (captured verbatim; some Kahramaa tenders are cross-posted there).
//   BusinessWebService.asmx/GetBusinessAwards (per category: A-GTC, A-LTC,
//     A-MTOC, GTC/LTC/MTOC/URRM award lists) → awarded contracts WITH the
//     winner company and amount ("Mannai Trading Co.", 59,850.00) — the same
//     prize Ashghal publishes and Monaqasat hides.
//
// Requests must send Language 'en-US' and the count-call's cursor markers;
// a wrong cursor yields an EMPTY list (not an error) — the scraper stops and
// reports zero rather than fabricating. Awards are scraped LAST so a tender
// that also appears as an award upserts second and wins (status='awarded' +
// winner), mirroring the QatarEnergy section ordering.

const BASE = 'https://www.km.qa/_layouts/15/Kahramaa.Internet.SharePoint/ScriptServices/BusinessWebService.asmx';
const REFERER = 'https://www.km.qa/Business/Pages/Tenders.aspx';
const BUYER = 'Kahramaa';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const PAGE_SIZE = 20;   // the page's own pageSize — cursor markers assume it

export const AWARD_CATEGORIES = [
  'A-GTC', 'A-LTC', 'A-MTOC', 'GTC Auction Awards', 'GTC Tender Awards',
  'LTC Tender Awards', 'MTOC Awards', 'URRM Awards',
];

// ── pure helpers (exported for tests) ───────────────────────────────────────

const MIN_DATE_MS = -62135596800000;   // DateTime.MinValue — SharePoint's "no value"

export function parseAspNetDate(s) {
  const m = String(s || '').match(/\/Date\((-?\d+)\)\//);
  if (!m) return null;
  const ms = Number(m[1]);
  if (!Number.isFinite(ms) || ms === MIN_DATE_MS || ms <= 0) return null;
  const d = new Date(ms);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/** 'dd-mm-yyyy' (Kahramaa's Formatted* twins) → ISO, else null. */
export function parseFormattedDate(s) {
  const m = String(s || '').trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const d = new Date(`${m[3]}-${m[2]}-${m[1]}T00:00:00+03:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function clean(v, max = 400) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** '1;#1' → open, '2;#2' → closed (SharePoint lookup encoding). */
export function kmStatus(s) {
  const v = String(s || '').split(';#')[0];
  if (v === '1') return 'open';
  if (v === '2') return 'closed';
  return null;   // unknown encoding → the row keeps ingest's default, never a guess
}

/** Map one GetTendersPaging record → a Bell tender row (null = unusable). */
export function kmTenderToRow(r) {
  const source_ref = clean(r.Number, 120);
  const title = clean(r.Title, 400);
  if (!source_ref || !title) return null;
  let status = kmStatus(r.Status);
  // Kahramaa's Status field lags reality — tenders closed years ago still say
  // "Open" (Val hit this live 2026-07-12). The source's OWN closing date is
  // the truth: a passed deadline cannot be open for bidding.
  const closes = parseAspNetDate(r.EndDate) || parseFormattedDate(r.FormattedEndDate);
  if (status === 'open' && closes && closes < new Date().toISOString()) status = 'closed';
  return {
    source: 'kahramaa',
    source_ref,
    title,
    buyer: BUYER,
    category: clean(r.Type, 80) || clean(r.TypeOfTender, 80),
    ...(status ? { status } : {}),
    value_amount: null,                       // the list shows no contract value
    currency: 'QAR',
    published_at: parseAspNetDate(r.StartDate) || parseFormattedDate(r.FormattedStartDate),
    deadline_at: closes,
    // Deep link to the tender's own Details page (the id the enricher uses
    // too) — a re-scan's url overwrite then never regresses to the list page.
    url: clean(r.Id, 20) ? `https://www.km.qa/Business/Pages/TenderDetails.aspx?ItemId=${clean(r.Id, 20)}` : REFERER,
    raw: {
      monaqasat_number: clean(r.MonaqasatNumber, 60),
      department: clean(r.Department, 120),
      fees: clean(r.Fees, 40),
      bid_bond: clean(r.BidBond, 60),
      bid_bond_validity: clean(r.BidBondValidityPeriod, 80),
      offer_validity: clean(r.OfferValidity, 80),
      type: clean(r.Type, 80),
      is_refloat: r.IsRefloat === true || r.IsRefloat === 'True' || undefined,
      document_url: clean(r.DocumentUrl, 300),
      notes: clean(r.Notes, 500),
      km_id: clean(r.Id, 20),
    },
  };
}

/** Map one GetBusinessAwards record → an AWARDED Bell tender row. */
export function kmAwardToRow(r, category) {
  const source_ref = clean(r.Number, 120);
  const title = clean(r.Title, 400);
  if (!source_ref || !title) return null;
  const winners = Array.isArray(r.Winners) ? r.Winners : [];
  const first = winners[0] || {};
  return {
    source: 'kahramaa',
    source_ref,
    title,
    buyer: BUYER,
    category: clean(r.Category, 80) || clean(category, 80),
    status: 'awarded',
    award_company_name: clean(first.Title, 200),
    value_amount: num(first.Amount),
    currency: 'QAR',
    awarded_at: parseAspNetDate(r.Date) || parseFormattedDate(r.FormattedDate),
    url: 'https://www.km.qa/Business/Pages/Awards.aspx',
    raw: {
      award_category: clean(category, 80),
      // every winner verbatim (multi-award tenders exist), like Ashghal's tables
      winners: winners.map((w) => ({ name: clean(w.Title, 200), amount: clean(w.Amount, 40) })).filter((w) => w.name),
    },
  };
}

// ── fetching ────────────────────────────────────────────────────────────────

async function callService(method, request, timeoutMs = 25_000) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(`${BASE}/${method}`, {
        method: 'POST',
        signal: ctl.signal,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'X-Requested-With': 'XMLHttpRequest',
          'User-Agent': UA,
          'Referer': REFERER,
        },
        body: JSON.stringify({ request }),
      });
      if (!res.ok) { if (attempt) return null; continue; }
      const j = await res.json().catch(() => null);
      return j?.d ?? null;
    } catch {
      if (attempt) return null;
      await new Promise((r) => setTimeout(r, 800));
    } finally {
      clearTimeout(to);
    }
  }
  return null;
}

const baseRequest = {
  Language: 'en-US', Type: '', Status: '', Department: '', TenderNumber: '', Access: false,
};

/**
 * Scrape all Kahramaa tenders (full cursor-paged archive) + all award
 * categories. Plain fetch. Returns rows for ingestTenders; awards come last
 * so they win the (source, source_ref) upsert.
 */
export async function scrapeKahramaa(_opts = {}) {
  const all = [];

  // 1. Cursor markers for every page, from the count call.
  const count = await callService('GetTendersCountListing', { ...baseRequest, PageSize: String(PAGE_SIZE) });
  const parts = String(count?.Number || '').split('_').filter(Boolean);
  const total = Number(parts[0]) || 0;
  const markers = parts.slice(1);
  const seenRefs = new Set();

  // 2. Page through. A wrong/expired cursor returns an empty page — stop there
  //    honestly; the next scan re-reads fresh markers.
  for (let i = 0; i < markers.length; i++) {
    const page = await callService('GetTendersPaging', {
      ...baseRequest,
      Position: Number(markers[i]) + 1,
      PageSize: String(PAGE_SIZE),
      PageFirstRow: i * PAGE_SIZE + 1,
    });
    const rows = Array.isArray(page?.Tenders) ? page.Tenders : [];
    if (!rows.length) break;
    let newOnPage = 0;
    for (const r of rows) {
      const row = kmTenderToRow(r);
      if (!row) continue;
      if (seenRefs.has(row.source_ref)) continue;   // cursor overlap safety
      seenRefs.add(row.source_ref);
      all.push(row);
      newOnPage++;
    }
    if (!newOnPage) break;                          // repeating page → cursor exhausted
    await new Promise((r) => setTimeout(r, 400));   // polite pacing
  }

  // 3. Awards, per category — winner + amount (the prize data).
  for (const cat of AWARD_CATEGORIES) {
    const res = await callService('GetBusinessAwards', { Language: 'en-US', AwardsCategory: cat });
    const awards = Array.isArray(res?.BusinessAwards) ? res.BusinessAwards : [];
    for (const a of awards) {
      const row = kmAwardToRow(a, cat);
      if (row) all.push(row);
    }
    await new Promise((r) => setTimeout(r, 400));
  }

  return all;
}
