// Regression tests for the Monaqasat PHANTOM-TENDER bug (found live 2026-07-10).
//
// Bug: card titles embed internal committee refs mid-title
//   "General Supply of Gifts for KAHRAMAA Department's Events - LTC-2417/2025 - Materials Department"
// The old splitter `split(/(?=(?<![\d\/])\d{2,6}\/20\d{2}\b)/)` split at those
// embedded refs, so each one minted a PHANTOM tender ("2417/2025" titled
// "- Materials Department", unlinked) and TRUNCATED the real card's title +
// dropped every field after the split point (buyer, bond, dates, sector).
//
// Fixtures below are VERBATIM from the live site (captured 2026-07-10 via
// Chrome): open list page 3 and awarded page 1, exactly as `htmlToText` renders
// them (only horizontal whitespace collapsed — the ref stays alone on its line).
//
// Run:  node server/tests/tender_phantom_split.test.mjs

import assert from 'node:assert/strict';
import { parseListing, parseClosingDate, parseDetailInto, tableCell, nameValue,
         parseHtmlTables, detailFields, detailFieldList, DETAIL_V } from '../tenders/scrape_monaqasat.js';
import { packRaw } from '../tenders/raw.js';
import { findPhantoms, lite } from '../scripts/repair_tender_phantoms.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log(`  ✓ ${name}`); };

// ── Real fixtures ────────────────────────────────────────────────────────────

// The card that mints the phantom "2417/2025". Real ref = 3445/2026.
const CARD_GIFTS = ` 3445/2026\n\n General Supply of Gifts for KAHRAMAA Department’s Events -\r\nLTC-2417/2025 -\r\nMaterials Department\n\n Publish date \n\n 05/07/2026 \n\n Requested Sector Type \n Suppliers / Service Providers \n\n Tender Bond (QAR) \n 90,000.00 \n\n Documents value (QR) \n 900.00 \n\n Ministry \n Qatar General Electicity & Water Corporation \n\n Type \n Public Tender \n\n Close date \n\n 02/08/2026 \n\n Purchase\n\n`;

// A clean card with no embedded ref (control).
const CARD_INFOSEC = ` 3001/2026\n\n Information Security Project for Vulnerability Detection and Cyber Penetration testing for 3 years\n\n Publish date \n\n 06/07/2026 \n\n Requested Sector Type \n Suppliers / Service Providers \n\n Tender Bond (QAR) \n 70,000.00 \n\n Documents value (QR) \n 700.00 \n\n Ministry \n General Authority Customs \n\n Type \n Public Tender \n\n Close date \n\n 04/08/2026 \n\n Purchase\n\n`;

// Second embedded-ref card on the same page (mints phantom "2458/2026").
const CARD_VOUCHERS = ` 3446/2026\n\n Price Agreement for Supply of Appreciation Gift Vouchers -\r\nLTC-2458/2026 - \r\nMaterials Department\n\n Publish date \n\n 05/07/2026 \n\n Requested Sector Type \n Suppliers / Service Providers \n\n Tender Bond (QAR) \n 50,000.00 \n\n Documents value (QR) \n 500.00 \n\n Ministry \n Qatar General Electicity & Water Corporation \n\n Type \n Public Tender \n\n Close date \n\n 02/08/2026 \n\n Purchase\n\n`;

// Awarded card: STATUS PREFIX + an embedded ref with NO slash-year separator
// pattern ("MW1287/2026") — mints phantom "1287/2026".
const CARD_AWARDED = ` 3663/2026 \n\n Tender is violation due to delay \n\n Supply of Phase Shift Transformer Spares \r\nMW1287/2026\r\nMaterial Department \n\n Award date \n\n 09/07/2026 \n\n Requested Sector Type \n Suppliers / Service Providers \n\n Tender Bond (QAR) \n 0.00 \n\n Documents value (QR) \n 0.00 \n\n Ministry \n Qatar General Electicity & Water Corporation \n\n Type \n Bidding Less Than 500,000 \n\n Report\n\n`;

// Real detail anchors from the same pages (anchor text IS the card title).
const A = (id, inner) => `<a href="/TendersOnlineServices/TenderDetails/${id}" class="card-title">\n${inner}\n</a>`;
const HTML_OPEN = [
  A(659255, 'Information Security Project for Vulnerability Detection and Cyber Penetration testing for 3 years'),
  A(659699, 'General Supply of Gifts for KAHRAMAA Department’s Events -\r\nLTC-2417/2025 -\r\nMaterials Department'),
  A(659700, 'Price Agreement for Supply of Appreciation Gift Vouchers -\r\nLTC-2458/2026 - \r\nMaterials Department'),
].join('\n');
const HTML_AWARDED = A(659917, 'Supply of Phase Shift Transformer Spares \r\nMW1287/2026\r\nMaterial Department ');

// ── 1. Splitter: embedded refs must NOT mint cards ───────────────────────────

console.log('\nSplitter (real live fixtures):');

t('open page: 3 real cards, ZERO phantoms (was 5 cards: +2417/2025, +2458/2026)', () => {
  const rows = parseListing({ text: CARD_INFOSEC + CARD_GIFTS + CARD_VOUCHERS, html: HTML_OPEN }, 'open');
  assert.equal(rows.length, 3);
  assert.deepEqual(rows.map((r) => r.source_ref).sort(), ['3001/2026', '3445/2026', '3446/2026']);
  for (const bad of ['2417/2025', '2458/2026']) {
    assert.ok(!rows.some((r) => r.source_ref === bad), `phantom ${bad} must not be a card`);
  }
});

t('host card keeps its FULL title (the embedded ref no longer truncates it)', () => {
  const [row] = parseListing({ text: CARD_GIFTS, html: HTML_OPEN }, 'open');
  assert.equal(row.source_ref, '3445/2026');
  assert.ok(row.title.includes('General Supply of Gifts'), 'title head');
  assert.ok(row.title.includes('LTC-2417/2025'), 'title keeps the embedded ref');
  assert.ok(row.title.includes('Materials Department'), 'title keeps the tail (was severed)');
});

t('host card keeps every field AFTER the old split point', () => {
  const [row] = parseListing({ text: CARD_GIFTS, html: HTML_OPEN }, 'open');
  assert.equal(row.buyer, 'Qatar General Electicity & Water Corporation');
  assert.equal(row.value_amount, 90000);          // tender bond, not contract value
  assert.equal(row.raw.documents_value, 900);
  assert.equal(row.raw.type, 'Public Tender');
  assert.equal(row.category, 'Suppliers / Service Providers');
  assert.equal(row.deadline_at.slice(0, 10), '2026-08-02');
  assert.equal(row.published_at.slice(0, 10), '2026-07-05');
});

t('host card pairs to its OWN detail id (title-matched, not index)', () => {
  const rows = parseListing({ text: CARD_INFOSEC + CARD_GIFTS + CARD_VOUCHERS, html: HTML_OPEN }, 'open');
  const by = Object.fromEntries(rows.map((r) => [r.source_ref, r.raw.detail_id]));
  assert.equal(by['3001/2026'], '659255');
  assert.equal(by['3445/2026'], '659699');
  assert.equal(by['3446/2026'], '659700');
});

t('awarded card: status prefix + "MW1287/2026" embed → 1 row, 0 phantoms', () => {
  const rows = parseListing({ text: CARD_AWARDED, html: HTML_AWARDED }, 'awarded');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source_ref, '3663/2026');
  assert.equal(rows[0].status, 'awarded');
  assert.equal(rows[0].raw.detail_id, '659917', 'status-prefix card still pairs (3rd matcher)');
  assert.ok(!rows.some((r) => r.source_ref === '1287/2026'));
});

t('control: clean card unaffected', () => {
  const [row] = parseListing({ text: CARD_INFOSEC, html: HTML_OPEN }, 'open');
  assert.equal(row.source_ref, '3001/2026');
  assert.equal(row.buyer, 'General Authority Customs');
  assert.equal(row.raw.detail_id, '659255');
});

t('a date inside a card body never starts a card', () => {
  const rows = parseListing({ text: CARD_INFOSEC, html: HTML_OPEN }, 'open');
  assert.equal(rows.length, 1, '06/07/2026 and 04/08/2026 must not split');
});

t('empty / junk pages yield nothing', () => {
  assert.deepEqual(parseListing({ text: '', html: '' }, 'open'), []);
  assert.deepEqual(parseListing(null, 'open'), []);
  assert.deepEqual(parseListing({ text: 'No tenders found', html: '' }, 'open'), []);
});

// ── 2. Phantom detector (pure) ───────────────────────────────────────────────

console.log('\nPhantom detector:');

const R = (id, ref, title, extra = {}) =>
  ({ id, source_ref: ref, status: 'open', title, linked: false, has_acts: false, ...extra });

const HOST_GIFTS = R(38, '3445/2026', 'General Supply of Gifts for KAHRAMAA Department’s Events -\r\nLTC-2417/2025 -\r\nMaterials Department', { linked: true });
const PHANTOM_2417 = R(39, '2417/2025', '-\r\nMaterials Department');

t('proves the real 2417/2025 phantom against its host 3445/2026', () => {
  const { phantoms } = findPhantoms([HOST_GIFTS, PHANTOM_2417]);
  assert.equal(phantoms.length, 1);
  assert.equal(phantoms[0].row.id, 39);
  assert.equal(phantoms[0].host.source_ref, '3445/2026');
});

t('never deletes a LINKED row (has a detail page = real tender)', () => {
  const linked = { ...PHANTOM_2417, linked: true };
  assert.equal(findPhantoms([HOST_GIFTS, linked]).phantoms.length, 0);
});

t('never deletes a row WITH activity codes (enriched = real)', () => {
  const acts = { ...PHANTOM_2417, has_acts: true };
  assert.equal(findPhantoms([HOST_GIFTS, acts]).phantoms.length, 0);
});

t('never deletes a real tender that merely SHARES the ref (awarded 2247/2024)', () => {
  // The real awarded 2247/2024 has a full, unrelated title → no host tail match.
  const realAwarded = R(7788, '2247/2024', 'SUPPLY OF MEDICAL CONSUMABLES (MEDIPLAST)-HMC/MTCS/401/2024', { status: 'awarded', linked: true });
  const host = R(50, '3500/2026', 'Some works - LTC-2247/2024 - Water Projects Department', { linked: true });
  const { phantoms } = findPhantoms([host, realAwarded]);
  assert.equal(phantoms.length, 0, 'a real tender sharing the ref must survive');
});

t('host must EMBED the ref — a row whose own ref matches is never its own host', () => {
  const self = R(60, '3445/2026', '- Materials Department');
  assert.equal(findPhantoms([self]).phantoms.length, 0);
});

t('no false positive: unrelated row titled with a common word', () => {
  const host = R(70, '1000/2026', 'Contract 123/2024 Maintenance Works for Buildings');
  const other = R(71, '123/2024', 'Maintenance');   // real short title, not the full tail
  assert.equal(findPhantoms([host, other]).phantoms.length, 0);
});

t('startsWith only accepted when the title hit the 400-char cap', () => {
  const tail = 'Materials Department ' + 'x'.repeat(420);
  const host = R(80, '3500/2026', 'Works - LTC-2417/2025 - ' + tail);
  const cut = R(81, '2417/2025', tail.slice(0, 400));   // capped copy of the tail
  assert.equal(findPhantoms([host, cut]).phantoms.length, 1, 'capped tail proves the phantom');
});

t('fragment with no host yet → "awaiting", never deleted', () => {
  const { phantoms, awaiting } = findPhantoms([PHANTOM_2417]);
  assert.equal(phantoms.length, 0);
  assert.equal(awaiting.length, 1);
  assert.equal(awaiting[0].id, 39);
});

t('idempotent: a healed host (re-scanned) still proves its phantom exactly once', () => {
  const rows = [HOST_GIFTS, PHANTOM_2417, R(40, '3446/2026', 'Price Agreement for Supply of Appreciation Gift Vouchers -\r\nLTC-2458/2026 - \r\nMaterials Department', { linked: true }), R(41, '2458/2026', '-\r\nMaterials Department')];
  const { phantoms } = findPhantoms(rows);
  assert.equal(phantoms.length, 2);
  assert.deepEqual(phantoms.map((p) => p.row.source_ref).sort(), ['2417/2025', '2458/2026']);
});

t('lite() keeps digits so refs are findable inside titles', () => {
  assert.equal(lite('LTC-2417/2025 -'), 'ltc 2417 2025');
  assert.equal(lite('2417/2025'), '2417 2025');
});

// ── 3. Closing date (cards + detail pages) ───────────────────────────────────
//
// Live truth 2026-07-10: open CARDS say "Close date" (20/20 on page 3, zero say
// "Closing date") — the old /Closing date/ regex never matched, so all 324 open
// Monaqasat tenders had deadline_at = NULL. DETAIL pages say "Closing Date" as a
// TABLE HEADER, with the value ~10 cells later.

console.log('\nClosing date:');

t('card: "Close date" is captured as the deadline', () => {
  const [row] = parseListing({ text: CARD_GIFTS, html: HTML_OPEN }, 'open');
  assert.equal(row.deadline_at.slice(0, 10), '2026-08-02');
  assert.equal(row.raw.close_date, '02/08/2026');
});

t('card: awarded cards have no close date → deadline stays null (never guessed)', () => {
  const [row] = parseListing({ text: CARD_AWARDED, html: HTML_AWARDED }, 'awarded');
  assert.equal(row.deadline_at, null);
  assert.equal(row.awarded_at.slice(0, 10), '2026-07-09');
});

// VERBATIM detail-page text (htmlToText of TenderDetails/659699), header block
// + value block. Note the cell separator is " \r\n ".
const DETAIL_TEXT = ` Tender number \r\n Type \r\n Subject \r\n Ministry \r\n Entity's tender number \r\n Request Types \r\n Envelopes system \r\n Tender Bond \r\n Documents value (QR) \r\n Closing Date \r\n\n 3445/2026 \r\n Public Tender \r\n General Supply of Gifts for KAHRAMAA Department's Events - LTC-2417/2025 - Materials Department \r\n Qatar General Electicity & Water Corporation \r\n LTC-2417/2025 \r\n Suppliers / Service Providers \r\n Two Envelopes \r\n 90,000.00 \r\n 900.00 \r\n 02/08/2026 \r\n\n Brief Description \r\n`;

// The 1-in-6 real failure: an EMPTY "Entity's tender number" cell renders as a
// blank line. Dropping blank cells shifted every column after it.
const DETAIL_EMPTY_CELL = ` Tender number \r\n Type \r\n Subject \r\n Ministry \r\n Entity's tender number \r\n Request Types \r\n Envelopes system \r\n Tender Bond \r\n Documents value (QR) \r\n Closing Date \r\n\n 3001/2026 \r\n Public Tender \r\n Information Security Project for Vulnerability Detection and Cyber Penetration testing for 3 years \r\n General Authority Customs \r\n \r\n Suppliers / Service Providers \r\n Two Envelopes \r\n 70,000.00 \r\n 700.00 \r\n 04/08/2026 \r\n\n Brief Description \r\n`;

t('detail: reads the value cell paired to the "Closing Date" header (659699)', () => {
  assert.equal(parseClosingDate(DETAIL_TEXT), '02/08/2026');
});

t('detail: EMPTY cell keeps columns aligned (659255 — was the 1/6 failure)', () => {
  assert.equal(parseClosingDate(DETAIL_EMPTY_CELL), '04/08/2026');
});

t('detail: never grabs the tender number or a Subject digit', () => {
  const d = parseClosingDate(DETAIL_TEXT);
  assert.notEqual(d, '3445/2026');
  assert.equal(d, '02/08/2026');
});

t('detail: unknown shape → null, never a guessed date', () => {
  assert.equal(parseClosingDate(''), null);
  assert.equal(parseClosingDate('Closing Date'), null);                       // header, no values
  assert.equal(parseClosingDate('Closing Date \r\n\n not-a-date \r\n'), null); // value isn't a date
  assert.equal(parseClosingDate('some page with a date 02/08/2026'), null);   // no header at all
});

t('detail: truncated value row (fewer cells than headers) → null', () => {
  const cut = ` A \r\n B \r\n Closing Date \r\n\n 1 \r\n`;
  assert.equal(parseClosingDate(cut), null);
});

t('parseDetailInto sets deadline_at from the detail page + stamps DETAIL_V', () => {
  const row = { raw: {} };
  parseDetailInto(row, DETAIL_TEXT);
  assert.equal(row.deadline_at.slice(0, 10), '2026-08-02');
  assert.equal(row.raw.detail_v, DETAIL_V);
  assert.equal(row.raw.entity_ref, 'LTC-2417/2025');
});

// ── 4. entity_ref / description / contract duration ──────────────────────────
//
// All three were silently wrong in production (verified on live tender 3445/2026,
// local row id 38, 2026-07-10): entity_ref = "Request", description truncated to
// "Supply of General Gifts to", contract_days = 3 (asserting a unit the source
// never prints).

console.log('\nentity_ref · description · contract duration:');

// Verbatim second table (Brief Description … Evaluation Basis) with its two
// EMPTY cells (Auction Type, Evaluation Basis), plus the Name|Value table.
const DETAIL_FULL = DETAIL_TEXT +
  ` Targeted Tenderer Type \r\n Service Delivery Method \r\n Auction Type \r\n Local Value System \r\n Tender Validity Period \r\n Evaluation Basis \r\n\n Supply of General Gifts to all KM Departments, intended for gifting on various occasions. The supplier is expected to deliver all specified gifts, ensuring customization where required, and provide comprehensive packaging. \r\n Companies \r\n Fully Compliant \r\n \r\n Local Value Certificate \r\n 90 \r\n \r\n\n Name \r\n Value \r\n\n Contract Preparation Period \r\n 90 Days from contract date \r\n\n Contract Duration \r\n 3 \r\n\n Warranty Period \r\n 12 \r\n`;

t('entity_ref reads the VALUE cell, not the next header ("Request")', () => {
  assert.equal(tableCell(DETAIL_TEXT, "Entity's tender number"), 'LTC-2417/2025');
  const row = { raw: {} };
  parseDetailInto(row, DETAIL_TEXT);
  assert.notEqual(row.raw.entity_ref, 'Request');
  assert.equal(row.raw.entity_ref, 'LTC-2417/2025');
});

t('entity_ref works whether the apostrophe is decoded or an HTML entity', () => {
  const hex = DETAIL_TEXT.replace("Entity's", 'Entity&#x27;s');
  assert.equal(tableCell(hex, "Entity's tender number"), 'LTC-2417/2025');
});

t('empty entity_ref cell → null, never the neighbouring column', () => {
  assert.equal(tableCell(DETAIL_EMPTY_CELL, "Entity's tender number"), null);
  const row = { raw: {} };
  parseDetailInto(row, DETAIL_EMPTY_CELL);
  assert.equal(row.raw.entity_ref, undefined);
});

t('description captures the FULL brief, not a truncated fragment', () => {
  const row = { raw: {} };
  parseDetailInto(row, DETAIL_FULL);
  assert.ok(row.raw.description.startsWith('Supply of General Gifts to all KM Departments'));
  assert.ok(row.raw.description.includes('comprehensive packaging'), 'tail survives');
  assert.ok(row.raw.description.length > 100);
});

t('contract duration is kept VERBATIM — no invented unit', () => {
  const row = { raw: {} };
  parseDetailInto(row, DETAIL_FULL);
  assert.equal(row.raw.contract_duration, '3');
  assert.equal(row.raw.contract_days, undefined, 'never asserts days again');
  assert.equal(row.raw.contract_duration_unit, undefined, 'source states no unit');
});

t('a duration that DOES state its unit is parsed into value + unit', () => {
  const txt = ` Name \r\n Value \r\n\n Contract Duration \r\n 90 Days from contract date \r\n`;
  assert.equal(nameValue(txt, 'Contract Duration'), '90 Days from contract date');
  const row = { raw: {} };
  parseDetailInto(row, txt);
  assert.equal(row.raw.contract_duration, '90 Days from contract date');
  assert.equal(row.raw.contract_duration_value, 90);
  assert.equal(row.raw.contract_duration_unit, 'days');
});

t('nameValue does not confuse Contract Duration with Contract Preparation Period', () => {
  assert.equal(nameValue(DETAIL_FULL, 'Contract Duration'), '3');
  assert.equal(nameValue(DETAIL_FULL, 'Contract Preparation Period'), '90 Days from contract date');
});

t('tableCell refuses an unknown label rather than guessing', () => {
  assert.equal(tableCell(DETAIL_FULL, 'Nonexistent Label'), null);
});

// ── 5. HTML table parsing — the production path ──────────────────────────────
//
// Crawl4AI/Playwright hand us a SERIALIZED DOM, in which the Subject cell's
// `&#xD;&#xA;` have become real CR/LF. A line-position parser then sees one
// value cell as three lines and shifts every later column: verified live, such
// a parser scored 12/12 on plain-fetch HTML but only 6/12 on the browser HTML
// production actually uses. Reading real <td> cells scored 12/12 on both.
//
// Cell values below are the live values of tender 3445/2026 (detail 659699);
// the markup reproduces the page's structure (thead/tbody, CR/LF in Subject,
// an empty cell).

console.log('\nHTML table parsing (production render path):');

const T1 = (subject, entity) => `<table><thead><tr>` +
  ['Tender number','Type','Subject','Ministry',"Entity&#x27;s tender number",'Request Types','Envelopes system','Tender Bond','Documents value (QR)','Closing Date']
    .map((h) => `<th>${h}</th>`).join('') +
  `</tr></thead><tbody><tr>` +
  ['3445/2026','Public Tender', subject,'Qatar General Electicity &amp; Water Corporation', entity,'Suppliers / Service Providers','Two Envelopes','90,000.00','900.00','02/08/2026']
    .map((c) => `<td>${c}</td>`).join('') +
  `</tr></tbody></table>`;

// The real Subject as the browser serializes it — with literal CR/LF inside.
const SUBJECT_CRLF = "General Supply of Gifts for KAHRAMAA Department’s Events -\r\nLTC-2417/2025 -\r\nMaterials Department";
const HTML_T1 = T1(SUBJECT_CRLF, 'LTC-2417/2025');
const HTML_T1_EMPTY = T1('Information Security Project', '');   // empty entity cell

const HTML_T2 = `<table><thead><tr>` +
  ['Brief Description','Targeted Tenderer Type','Service Delivery Method','Auction Type','Local Value System','Tender Validity Period','Evaluation Basis']
    .map((h) => `<th>${h}</th>`).join('') + `</tr></thead><tbody><tr>` +
  ['Supply of General Gifts to all KM Departments, intended for gifting on various occasions. The supplier is expected to deliver all specified gifts, ensuring customization where required, and provide comprehensive packaging.',
   'Companies','Fully Compliant','','Local Value Certificate','90',''].map((c) => `<td>${c}</td>`).join('') +
  `</tr></tbody></table>`;

const HTML_NV = `<table><thead><tr><th>Name</th><th>Value</th></tr></thead><tbody>` +
  [['Technical Evaluation Criteria','The Ordinary Method'], ['Final Insurance','10'],
   ['Contract Preparation Period','90 Days from contract date'], ['Contract Duration','3'],
   ['Warranty Period','12'], ['Maintenance Period','Not applicable']]
    .map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('') + `</tbody></table>`;

const PAGE_HTML = HTML_T1 + HTML_T2 + HTML_NV;

t('parseHtmlTables reads thead/tbody rows as cells', () => {
  const tables = parseHtmlTables(PAGE_HTML);
  assert.equal(tables.length, 3);
  assert.equal(tables[0][0].length, 10);   // header cells
  assert.equal(tables[0][1].length, 10);   // value cells
});

t('⭐ CR/LF inside the Subject cell does NOT shift the columns', () => {
  const f = detailFields(HTML_T1);
  assert.equal(f.get('closing date'), '02/08/2026');
  assert.equal(f.get("entity s tender number"), 'LTC-2417/2025');
  assert.notEqual(f.get("entity s tender number"), 'Materials Department');  // the 6/12 failure
});

t('empty cell keeps the columns aligned', () => {
  const f = detailFields(HTML_T1_EMPTY);
  assert.equal(f.get('closing date'), '02/08/2026');
  assert.equal(f.get("entity s tender number"), '');
});

t('&amp; and &#x27; decode inside cells', () => {
  const f = detailFields(HTML_T1);
  assert.equal(f.get('ministry'), 'Qatar General Electicity & Water Corporation');
  assert.ok(f.has("entity s tender number"), 'the &#x27; header is matched');
});

t('Name|Value table yields Contract Duration without confusing Preparation Period', () => {
  const f = detailFields(HTML_NV);
  assert.equal(f.get('contract duration'), '3');
  assert.equal(f.get('contract preparation period'), '90 Days from contract date');
});

t('parseDetailInto(html) fills all four fields correctly from the real structure', () => {
  const row = { raw: {} };
  parseDetailInto(row, '', PAGE_HTML);
  assert.equal(row.deadline_at.slice(0, 10), '2026-08-02');
  assert.equal(row.raw.entity_ref, 'LTC-2417/2025');
  assert.equal(row.raw.contract_duration, '3');
  assert.equal(row.raw.contract_days, undefined);
  assert.ok(row.raw.description.startsWith('Supply of General Gifts to all KM Departments'));
  assert.ok(row.raw.description.endsWith('comprehensive packaging.'));
});

t('html path never yields the old junk values', () => {
  const row = { raw: {} };
  parseDetailInto(row, '', PAGE_HTML);
  assert.notEqual(row.raw.entity_ref, 'Request');
  assert.notEqual(row.raw.description, 'Supply of General Gifts to');
});

t('no tables → no fields, and nothing invented', () => {
  const row = { raw: {} };
  parseDetailInto(row, '', '<div>no tables here</div>');
  assert.equal(row.raw.entity_ref, undefined);
  assert.equal(row.raw.description, undefined);
  assert.equal(row.deadline_at, undefined);
});

t('commented-out cell cannot shift columns (the Ashghal bug class)', () => {
  const withComment = HTML_T1.replace('<td>Two Envelopes</td>', '<!-- <td>x</td> --><td>Two Envelopes</td>');
  const f = detailFields(withComment);
  assert.equal(f.get('closing date'), '02/08/2026');
  assert.equal(f.get("entity s tender number"), 'LTC-2417/2025');
});

// ── 6. Capture EVERY published field, verbatim (Val 2026-07-10) ──────────────

console.log('\nVerbatim capture of every published field:');

t('detailFieldList keeps page order and the original label text', () => {
  const l = detailFieldList(HTML_NV);
  assert.deepEqual(l.map((f) => f.label).slice(0, 3),
    ['Technical Evaluation Criteria', 'Final Insurance', 'Contract Preparation Period']);
  assert.equal(l.find((f) => f.label === 'Warranty Period').value, '12');
});

t('unit-less numbers are stored exactly as printed — 3, 12, 10', () => {
  const row = { raw: {} };
  parseDetailInto(row, '', PAGE_HTML);
  const by = Object.fromEntries(row.raw.fields.map((f) => [f.label, f.value]));
  assert.equal(by['Contract Duration'], '3');
  assert.equal(by['Warranty Period'], '12');
  assert.equal(by['Final Insurance'], '10');
  assert.equal(by['Contract Preparation Period'], '90 Days from contract date');
  assert.equal(by['Maintenance Period'], 'Not applicable');
});

t('fields Bell has no column for are captured too', () => {
  const row = { raw: {} };
  parseDetailInto(row, '', PAGE_HTML);
  const labels = row.raw.fields.map((f) => f.label);
  for (const l of ['Request Types', 'Envelopes system', 'Targeted Tenderer Type',
                   'Service Delivery Method', 'Local Value System', 'Tender Validity Period',
                   'Technical Evaluation Criteria']) {
    assert.ok(labels.includes(l), `missing ${l}`);
  }
});

t('empty cells are dropped — the source stated nothing, so Bell states nothing', () => {
  const row = { raw: {} };
  parseDetailInto(row, '', PAGE_HTML);
  const labels = row.raw.fields.map((f) => f.label);
  assert.ok(!labels.includes('Auction Type'), 'blank cell not stored');
  assert.ok(!labels.includes('Evaluation Basis'), 'blank cell not stored');
});

t('no html → no fields (text-only callers unaffected)', () => {
  const row = { raw: {} };
  parseDetailInto(row, DETAIL_TEXT);
  assert.equal(row.raw.fields, undefined);
});

// ── 7. packRaw — never truncate serialized JSON ──────────────────────────────

console.log('\npackRaw (jsonb write safety):');

t('small raw passes through unchanged and parses', () => {
  const raw = { detail_id: '1', activities: [{ code: '620900', name: 'IT' }] };
  const out = packRaw(raw);
  assert.deepEqual(JSON.parse(out), raw);
});

t('oversized raw stays VALID JSON (the old slice() produced garbage)', () => {
  const raw = {
    detail_id: '1',
    activities: Array.from({ length: 40 }, (_, i) => ({ code: String(300000 + i), name: 'x'.repeat(160) })),
    description: 'd'.repeat(2000),
    fields: Array.from({ length: 40 }, (_, i) => ({ label: 'L' + i, value: 'v'.repeat(300) })),
  };
  assert.ok(JSON.stringify(raw).length > 20000, 'fixture must exceed the cap');
  const out = packRaw(raw);
  assert.ok(out && out.length <= 20000);
  const parsed = JSON.parse(out);                       // would throw on a sliced string
  assert.equal(parsed.detail_id, '1');
  assert.ok(Array.isArray(parsed.activities) && parsed.activities.length, 'activity codes survive');
  assert.equal(parsed.activities[0].code, '300000');
});

t('drops the optional field list before touching activity codes', () => {
  const raw = {
    activities: [{ code: '620900', name: 'IT' }],
    fields: Array.from({ length: 80 }, (_, i) => ({ label: 'L' + i, value: 'v'.repeat(300) })),
  };
  assert.ok(JSON.stringify(raw).length > 20000, 'fixture must exceed the cap');
  const parsed = JSON.parse(packRaw(raw));
  assert.equal(parsed.fields, undefined, 'the nice-to-have goes first');
  assert.equal(parsed.activities[0].name, 'IT', 'activity names kept when not needed');
});

t('returns null rather than write junk when nothing can shrink it', () => {
  assert.equal(packRaw({ detail_id: 'x'.repeat(25000) }), null);
});

t('Ashghal bidder tables shrink to the winner before codes are touched', () => {
  const raw = {
    tender_id: 5,
    bidders: Array.from({ length: 140 }, (_, i) => ({ name: 'Bidder '.repeat(20) + i, rank: i + 1, winner: i === 0 })),
  };
  assert.ok(JSON.stringify(raw).length > 20000, 'fixture must exceed the cap');
  const parsed = JSON.parse(packRaw(raw));
  assert.equal(parsed.bidders.length, 1);
  assert.equal(parsed.bidders[0].winner, true, 'the winner survives');
  assert.equal(parsed.tender_id, 5);
});

t('parseDetailInto leaves deadline untouched when the page has no closing date', () => {
  const row = { raw: {}, deadline_at: '2026-01-01T00:00:00.000Z' };
  parseDetailInto(row, 'Tender number 1/2026 no table here');
  assert.equal(row.deadline_at, '2026-01-01T00:00:00.000Z');
});

t('DETAIL_V is 4 — bumping it re-enriches the archive once', () => {
  assert.equal(DETAIL_V, 4);
});

console.log(`\n${pass}/${pass} PASS\n`);
