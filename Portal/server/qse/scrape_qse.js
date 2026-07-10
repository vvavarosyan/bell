// QSE disclosures scraper — qe.com.qa (Qatar Stock Exchange). Phase 2 C1.
// ----------------------------------------------------------------------------
// QSE runs a Liferay portal, but every data surface Bell needs turned out to be
// reachable with a PLAIN FETCH — no browser, no Crawl4AI, no session (all
// verified live 2026-07-10):
//
//   1. Listed companies  GET /pps/qse_files/MarketWatch.txt
//      JSON: { total, page, records, rows:[{ Symbol, CompanyEN, CompanyAR,
//      SectorEN, CompType, … live prices }] }. 107 rows: 53 COMP (main market)
//      + 1 V (venture market) + ETFs/BONDs we skip. `records` === rows.length,
//      i.e. everything arrives in one page.
//
//   2. Per-company disclosures  GET /web/guest/company-profile?...&CompanyCode=<SYM>
//      The page EMBEDS the newest ~12 announcements server-side, as a JS var of
//      URL-ENCODED XML: request_NewsEventsOnQuoteDetailPage_responseXML = '…'.
//      Each <News> carries InformationTypeDetailID (the source's own stable id —
//      our dedup key), Headline, Summary, Description (HTML-escaped, often with
//      a qdisclosure attachment link) and PublishDate (ISO, +03:00). A
//      TotalRecords field shows the full archive size (QNB: 431) but only the
//      newest slice is embedded — enough for a recurring scan; deeper history
//      stays un-captured rather than guessed.
//
//   3. Financial statements  POST /financial-statements (Liferay serveResource,
//      params year + actionFlag=BOTH) → XML <Record><key>Company</key>
//      <value>Q1 pdf</value>…<value>TICKER</value></Record>. The last <value>
//      is the ticker; the four before it are Q1..Q4 document URLs (may be empty).
//
//   4. Market notices  POST /market-notices (serveResource, param year) → XML
//      of FLAT key/value <Record> pairs, 8 per notice (arabiclink, Year, Number,
//      isenglish, link, Date, Subject, arabicSubject). Dates are DD-MM-YYYY
//      (proven: '26-01-2026' appears — day 26).
//
// This module is PURE fetch/parse: no DB imports (db.js opens a pool on import),
// every parser exported for the unit tests, rows returned as plain objects for
// ingest_qse.js. Network failure degrades to [] — never throws.

const BASE = 'https://www.qe.com.qa';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

// Liferay portlet instance ids — part of the public page URLs, stable since the
// pages were built, but if QSE rebuilds its portal these change and the scan
// reports zero rows (it fails loudly in the scan summary, never silently).
const FS_RESOURCE_URL = `${BASE}/financial-statements?p_p_id=financialstatementvm_INSTANCE_VytBwqEFosPE&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_resource_id=%2FFinancialStatementVmPortlet%2FserveResource&p_p_cacheability=cacheLevelPage`;
const FS_PARAM = '_financialstatementvm_INSTANCE_VytBwqEFosPE_';
const MN_RESOURCE_URL = `${BASE}/market-notices?p_p_id=viewmarketnotice_INSTANCE_EtoMmjvxXSjr&p_p_lifecycle=2&p_p_state=normal&p_p_mode=view&p_p_cacheability=cacheLevelPage`;
const MN_PARAM = '_viewmarketnotice_INSTANCE_EtoMmjvxXSjr_';

const MARKETWATCH_URL = `${BASE}/pps/qse_files/MarketWatch.txt`;
const profileUrl = (symbol) =>
  `${BASE}/web/guest/company-profile?InformationCategory=Company&InformationType=News&FromLocalSite=N&MoreNewsTitle=1&CompanyCode=${encodeURIComponent(symbol)}`;

// ── tiny pure helpers ────────────────────────────────────────────────────────

function clean(v, max = 400) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s.slice(0, max) : null;
}

/** application/x-www-form-urlencoded decode: '+' is a space, then %XX.
 *  For the news var + financial statements — those encode spaces as '+'
 *  ('QNB+will+hold', 'Al+Rayan+Qatar+ETF'). */
export function decodeFormEncoded(s) {
  try { return decodeURIComponent(String(s || '').replace(/\+/g, ' ')); }
  catch { return null; }   // malformed % sequence → caller treats as no data
}

/** Percent-only decode — market-notice fields encode spaces as '%20'
 *  ('Listing%20and%20Trading'), so a literal '+' there must SURVIVE. */
export function decodePercent(s) {
  try { return decodeURIComponent(String(s || '')); }
  catch { return null; }
}

/** Unescape the XML/HTML entities QSE uses (&lt; &gt; &amp; &quot; &#39; &#xD;). */
export function xmlUnescape(s) {
  return String(s || '')
    .replace(/&#x?([0-9a-fA-F]+);/g, (_, h) =>
      String.fromCharCode(parseInt(h, _.includes('x') || _.includes('X') ? 16 : 10)))
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** First <tag>…</tag> content inside an XML fragment (QSE XML is flat/regular). */
function xmlField(block, tag) {
  const m = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  return m ? m[1] : null;
}

/** HTML → readable text (QSE descriptions are simple p/br/a markup). The
 *  description is HTML escaped inside XML, so entities are two layers deep:
 *  unescape once to get the HTML, strip tags, then unescape once more so text
 *  like '&amp;amp;' ends as '&' instead of leaking '&amp;' to the reader. */
export function htmlToPlainText(htmlStr) {
  return xmlUnescape(xmlUnescape(String(htmlStr || ''))
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, ''))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/** First href inside an (already XML-escaped) description — the attachment. */
export function attachmentUrl(descriptionXml) {
  const un = xmlUnescape(String(descriptionXml || ''));
  const m = un.match(/href=['"]([^'"]+)['"]/i);
  return m ? m[1] : null;
}

// ── parsers (all exported, all pure) ─────────────────────────────────────────

/**
 * MarketWatch.txt JSON → the listed-company universe.
 * Keeps CompType COMP (main market) + V (venture market); ETFs/BONDs are funds
 * and debt instruments, not companies — skipped.
 */
export function parseMarketWatch(jsonText) {
  let obj;
  try { obj = JSON.parse(jsonText); } catch { return []; }
  const rows = Array.isArray(obj?.rows) ? obj.rows : [];
  return rows
    .filter((r) => r && (r.CompType === 'COMP' || r.CompType === 'V'))
    .map((r) => ({
      symbol: clean(r.Symbol, 20),
      name_en: clean(r.CompanyEN, 200),
      name_ar: clean(r.CompanyAR, 200),
      sector: clean(r.SectorEN, 120),
      comp_type: clean(r.CompType, 10),
    }))
    .filter((r) => r.symbol && r.name_en);
}

/** Pull the embedded URL-encoded news XML out of a company-profile page. */
export function extractEmbeddedNewsVar(pageHtml) {
  const m = String(pageHtml || '').match(
    /request_NewsEventsOnQuoteDetailPage_responseXML\s*=\s*'([^']*)'/);
  return m ? m[1] : null;
}

/**
 * Decoded profile XML → announcement objects. Only fields the source states;
 * a missing PublishDate stays null (the row is then unusable for signals and
 * ingest drops it — a dated announcement without a date is not worth a guess).
 */
export function parseNewsXml(decodedXml) {
  const out = [];
  const blocks = String(decodedXml || '').match(/<News>[\s\S]*?<\/News>/g) || [];
  for (const b of blocks) {
    const detailId = clean(xmlField(b, 'InformationTypeDetailID'), 30);
    const headline = clean(xmlUnescape(xmlField(b, 'Headline') || ''), 400);
    if (!detailId || !headline) continue;   // no stable id or no text → skip, never invent
    const desc = xmlField(b, 'Description') || '';
    // STRICT ISO 8601 only (the proven live format: 2026-07-08T13:50:10+03:00).
    // A lenient new Date() would silently GUESS ambiguous formats like
    // '05-01-2026' as US month-first — an unknown format must stay null.
    const publishRaw = clean(xmlField(b, 'PublishDate'), 40);
    const isIso = publishRaw && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(publishRaw);
    const publish = isIso && !isNaN(new Date(publishRaw).getTime())
      ? new Date(publishRaw).toISOString() : null;
    out.push({
      detail_id: detailId,
      headline,
      summary: clean(xmlUnescape(xmlField(b, 'Summary') || ''), 600),
      body: clean(htmlToPlainText(desc), 4000),
      url: attachmentUrl(desc),
      published_at: publish,
      type_id: clean(xmlField(b, 'InformationTypeID'), 10),
      category_id: clean(xmlField(b, 'InformationCategoryID'), 10),
    });
  }
  return out;
}

/**
 * Financial-statements XML → one object per company/quarter document.
 * <Record><key>Name</key><value>Q1 url</value>…<value>TICKER</value></Record>;
 * key and values are form-encoded. Empty quarter slots are skipped.
 */
export function parseFsXml(xml, year) {
  const out = [];
  const recs = String(xml || '').match(/<Record>[\s\S]*?<\/Record>/g) || [];
  for (const rec of recs) {
    const key = xmlField(rec, 'key');
    const name = clean(decodeFormEncoded(key), 200);
    const values = (rec.match(/<value>([\s\S]*?)<\/value>/g) || [])
      .map((v) => v.replace(/<\/?value>/g, ''));
    // Proven live shape: exactly 4 quarter slots + the ticker. Quarter numbers
    // are POSITIONAL, so a drifted shape would silently mislabel quarters —
    // skip the record instead (the scan's document count drops visibly).
    if (!name || values.length !== 5) continue;
    const ticker = clean(decodeFormEncoded(values[values.length - 1]), 20);
    const quarters = values.slice(0, -1);
    quarters.forEach((q, i) => {
      const url = clean(decodeFormEncoded(q), 500);
      if (!url) return;                       // that quarter isn't published yet
      out.push({ company_name: name, symbol: ticker, year: Number(year), quarter: i + 1, url });
    });
  }
  return out;
}

/** '26-01-2026' (DD-MM-YYYY, proven by day>12 samples) → '2026-01-26'. */
export function parseNoticeDate(s) {
  const m = String(s || '').trim().match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = new Date(`${yyyy}-${mm}-${dd}T00:00:00+03:00`);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Market-notices XML → notice objects. The XML is FLAT: one <Record> per FIELD
 * (8 fields per notice). Group by "key already seen" so a schema change (extra
 * or missing field) degrades gracefully instead of mis-pairing rows.
 */
export function parseNoticesXml(xml) {
  const recs = String(xml || '').match(/<Record>[\s\S]*?<\/Record>/g) || [];
  const groups = [];
  let cur = {};
  for (const rec of recs) {
    const key = xmlField(rec, 'key');
    const value = xmlField(rec, 'value') ?? '';
    if (!key) continue;
    if (Object.prototype.hasOwnProperty.call(cur, key)) { groups.push(cur); cur = {}; }
    cur[key] = value;
  }
  if (Object.keys(cur).length) groups.push(cur);
  return groups
    .map((g) => ({
      year: clean(g.Year, 8),
      number: clean(g.Number, 12),
      // Notice fields are PERCENT-encoded (spaces = %20), unlike the news var
      // and FS records (spaces = '+') — a form decode here would eat literal '+'.
      subject: clean(xmlUnescape(decodePercent(g.Subject) || ''), 400),
      url: clean(decodePercent(g.link), 500),
      published_at: parseNoticeDate(g.Date),
    }))
    .filter((n) => n.year && n.number && n.subject);
}

// ── classification (a TAG, like tenders/match.js — honest 'general' fallback) ─
// First match wins, most specific first. Derived from real QSE headline
// phrasing; anything unrecognized stays 'general' — never a guess.
const CATEGORY_RULES = [
  ['financial_results', /financial (results|statements?)|net profit|semi-?annual|quarterly (results|statement)|annual (results|report)|results for the (period|year|quarter|three|six|nine)/i],
  ['dividend',          /dividends?|profit distribution|cash distribution/i],
  ['capital_action',    /buy-?back|treasury shares|capital (increase|reduction)|rights issue|share capital|bonds?|sukuk|ipo|listing of/i],
  ['board',             /board of directors|board meeting|resignation|appointment|nomination|board member/i],
  ['agm',               /\bagm\b|\begm\b|general assembly|general meeting/i],
  ['investor_call',     /conference call|investors? relation|earnings call|ir meeting/i],
];
export function classifyDisclosure(headline) {
  const h = String(headline || '');
  for (const [cat, re] of CATEGORY_RULES) if (re.test(h)) return cat;
  return 'general';
}

// ── row builders (ingest_qse.js consumes these shapes) ──────────────────────

export function newsToRow(item, company) {
  return {
    source_uid: `news:${item.detail_id}`,
    dtype: 'news',
    symbol: company.symbol,
    company_name: company.name_en,
    category: classifyDisclosure(item.headline),
    headline: item.headline,
    summary: item.summary,
    body: item.body,
    url: item.url,
    published_at: item.published_at,
    raw: { detail_id: item.detail_id, type_id: item.type_id, category_id: item.category_id, sector: company.sector || null },
  };
}

export function fsToRow(doc) {
  return {
    source_uid: `fs:${doc.symbol}:${doc.year}:Q${doc.quarter}`,
    dtype: 'financial_statement',
    symbol: doc.symbol,
    company_name: doc.company_name,
    category: 'financial_results',
    headline: `${doc.company_name} — Q${doc.quarter} ${doc.year} financial statement`,
    summary: null,
    body: null,
    url: doc.url,
    published_at: null,   // the page states only year+quarter, never a date
    raw: { year: doc.year, quarter: doc.quarter },
  };
}

export function noticeToRow(n) {
  return {
    source_uid: `notice:${n.year}:${n.number}`,
    dtype: 'market_notice',
    symbol: null,          // exchange-wide; naming a company from free text would be a guess
    company_name: null,
    category: 'market_notice',
    headline: n.subject,
    summary: null,
    body: null,
    url: n.url && n.url.startsWith('/') ? BASE + n.url : n.url,
    published_at: n.published_at,
    raw: { year: n.year, number: n.number },
  };
}

// ── fetching (retry once, 20s timeout, degrade to null — like QatarEnergy) ──

async function fetchText(url, { method = 'GET', body = null, timeoutMs = 20_000 } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method,
        headers: {
          'User-Agent': UA,
          'Accept': '*/*',
          ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' } : {}),
        },
        body,
        signal: ctl.signal,
      });
      if (!res.ok) { if (attempt) return null; continue; }
      return await res.text();
    } catch {
      if (attempt) return null;
      await new Promise((r) => setTimeout(r, 800));
    } finally {
      clearTimeout(to);
    }
  }
  return null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Scrape all QSE surfaces. Plain fetch, sequential + throttled (the profile
 * pages are one request per company — ~54 requests ≈ 1 minute; be polite).
 * Returns { companies, rows, errors } — rows ready for ingestQseDisclosures.
 * @param {object} opts
 * @param {number[]} opts.years        years for statements + notices (default: current)
 * @param {function} opts.onProgress   optional (msg) => void for the scan script
 */
export async function scrapeQse({ years = [new Date().getFullYear()], onProgress = null } = {}) {
  const progress = (m) => { try { onProgress?.(m); } catch { /* progress must never break a scan */ } };
  const errors = [];
  const rows = [];

  // 1. Company universe.
  const mwText = await fetchText(MARKETWATCH_URL);
  const companies = mwText ? parseMarketWatch(mwText) : [];
  if (!companies.length) errors.push('MarketWatch.txt returned no companies');
  progress(`Listed companies: ${companies.length}`);

  // 2. Per-company embedded announcements.
  let done = 0;
  for (const c of companies) {
    const page = await fetchText(profileUrl(c.symbol));
    const encoded = page && extractEmbeddedNewsVar(page);
    const decoded = encoded && decodeFormEncoded(encoded);
    const items = decoded ? parseNewsXml(decoded) : [];
    if (page && !items.length) { errors.push(`no announcements parsed for ${c.symbol}`); progress(`  ⚠ ${c.symbol}: page loaded but no announcements parsed`); }
    if (!page) { errors.push(`profile fetch failed for ${c.symbol}`); progress(`  ⚠ ${c.symbol}: fetch failed (will be picked up on a re-run)`); }
    for (const it of items) rows.push(newsToRow(it, c));
    done++;
    if (done % 5 === 0) progress(`Announcements: ${done}/${companies.length} companies…`);
    // Polite pacing: qe.com.qa sits behind a WAF that stalls rapid clients
    // (observed live 2026-07-10). One page ~ every 0.8s keeps the whole pass
    // under 2 minutes and under the radar; a re-run picks up any misses.
    await sleep(800);
  }

  // 3. Financial statements + 4. market notices, per requested year.
  for (const year of years) {
    const fsXml = await fetchText(FS_RESOURCE_URL, {
      method: 'POST',
      body: `${FS_PARAM}year=${encodeURIComponent(year)}&${FS_PARAM}actionFlag=BOTH`,
    });
    const fsDocs = fsXml ? parseFsXml(fsXml, year) : [];
    if (!fsXml) errors.push(`financial-statements fetch failed for ${year}`);
    for (const d of fsDocs) rows.push(fsToRow(d));
    progress(`Financial statements ${year}: ${fsDocs.length} documents`);
    await sleep(300);

    const mnXml = await fetchText(MN_RESOURCE_URL, {
      method: 'POST',
      body: `${MN_PARAM}year=${encodeURIComponent(year)}`,
    });
    const notices = mnXml ? parseNoticesXml(mnXml) : [];
    if (!mnXml) errors.push(`market-notices fetch failed for ${year}`);
    for (const n of notices) rows.push(noticeToRow(n));
    progress(`Market notices ${year}: ${notices.length}`);
    await sleep(300);
  }

  return { companies, rows, errors };
}
