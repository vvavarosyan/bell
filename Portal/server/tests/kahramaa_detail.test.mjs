// Kahramaa detail-page parser tests (fix round 2026-07-12: "why dont we have
// all those details? we must capture all" + "All Kahramaa tenders show as open
// even tho they have been closed many years ago").
// Fixture: tests/fixtures/km_detail.html — VERBATIM live capture of
// TenderDetails.aspx?ItemId=1765 (LTC/2451/2026), saved 2026-07-12.
// Run:  node server/tests/kahramaa_detail.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { kmDetailFields, kmDetailSummary, parseKmDateTime, KM_DETAIL_V } from '../tenders/enrich_kahramaa.js';
import { kmTenderToRow } from '../tenders/scrape_kahramaa.js';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, 'fixtures', 'km_detail.html'), 'utf8');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log(`  ✓ ${name}`); };

console.log('\nkmDetailFields — verbatim capture:');
const fields = kmDetailFields(html);
t('all 17 published rows captured, page order', () => {
  assert.equal(fields.length, 17);
  assert.deepEqual(fields.map((f) => f.label), [
    'Tender Name', 'Type', 'KAHRAMAA Tender Number', 'Monaqasat Tender Number',
    'Status', 'Department', 'Purchased At', 'Start Purchase Date',
    'End Purchase Date', 'Fees (QR)', 'Bid Bond (QR)',
    'Bid Bond Validity Period (Days)', 'Submitted At', 'Submission Closing Date',
    'Offer Validity (Days)', 'Description', 'Notes',
  ]);
});
const val = (label) => fields.find((f) => f.label === label)?.value;
t('values are verbatim — numbers, refs, dates exactly as published', () => {
  assert.equal(val('KAHRAMAA Tender Number'), 'LTC/2451/2026');
  assert.equal(val('Monaqasat Tender Number'), '2026/3599');
  assert.equal(val('Type'), 'LTC');
  assert.equal(val('Status'), 'Open');
  assert.equal(val('Department'), 'Electricity Projects Dept.');
  assert.equal(val('Fees (QR)'), '500');
  assert.equal(val('Bid Bond (QR)'), '45000');
  assert.equal(val('Bid Bond Validity Period (Days)'), '120');
  assert.equal(val('Offer Validity (Days)'), '90');
  assert.equal(val('Submission Closing Date'), '16-08-2026 12:00 PM');
});
t('full description captured (the list API has none)', () => {
  const d = val('Description');
  assert.ok(d.startsWith('To perform a gap analysis on existing KM operation systems'));
  assert.ok(d.endsWith('develop a roadmap for Smart Grid implementation'));
});
t('multi-paragraph Notes keep real line breaks, single-spaced within lines', () => {
  const n = val('Notes');
  assert.ok(n.includes('\n'));
  assert.ok(n.split('\n')[0] === 'Fees are non-refundable');
  assert.ok(!/\n{2,}/.test(n));
  assert.ok(!/ {2}/.test(n));
});
t('a blank value publishes nothing — no empty rows invented', () => {
  const withBlank = html + '<tr><td class="x"><label>Empty Thing:</label></td><td class="y"><span>   </span></td></tr>';
  assert.equal(kmDetailFields(withBlank).length, 17);
});
t('garbage in, nothing out', () => {
  assert.deepEqual(kmDetailFields(''), []);
  assert.deepEqual(kmDetailFields('<html><body>maintenance page</body></html>'), []);
});

console.log('\nparseKmDateTime:');
t("'16-08-2026 12:00 PM' → noon +03 (Qatar)", () =>
  assert.equal(parseKmDateTime('16-08-2026 12:00 PM'), '2026-08-16T09:00:00.000Z'));
t("'16-08-2026 12:30:00' (24h twin) → 09:30Z", () =>
  assert.equal(parseKmDateTime('16-08-2026 12:30:00'), '2026-08-16T09:30:00.000Z'));
t("'08-07-2026 07:30:00' → 04:30Z", () =>
  assert.equal(parseKmDateTime('08-07-2026 07:30:00'), '2026-07-08T04:30:00.000Z'));
t("'01-01-2020 12:00 AM' → midnight, not noon", () =>
  assert.equal(parseKmDateTime('01-01-2020 12:00 AM'), '2019-12-31T21:00:00.000Z'));
t('bare date allowed; garbage and blanks are null, never a guess', () => {
  assert.equal(parseKmDateTime('16-08-2026'), '2026-08-15T21:00:00.000Z');
  assert.equal(parseKmDateTime('TBD'), null);
  assert.equal(parseKmDateTime(''), null);
  assert.equal(parseKmDateTime(null), null);
});

console.log('\nkmDetailSummary — the page corrects the stale Status label:');
t('source-Open + future closing date = genuinely open', () => {
  const s = kmDetailSummary(fields);
  assert.equal(s.status, 'open');
  assert.equal(s.closing, '2026-08-16T09:00:00.000Z');
  assert.ok(s.description.startsWith('To perform a gap analysis'));
});
t('source-Open + PASSED closing date = closed (the source\'s own date is the truth)', () => {
  const old = fields.map((f) => f.label === 'Submission Closing Date' ? { ...f, value: '10-01-2021 12:00 PM' } : f);
  const s = kmDetailSummary(old);
  assert.equal(s.status, 'closed');
  assert.equal(s.closing, '2021-01-10T09:00:00.000Z');
});
t('a non-Open source label maps to closed; a missing label stays null', () => {
  assert.equal(kmDetailSummary(fields.map((f) => f.label === 'Status' ? { ...f, value: 'Closed' } : f)).status, 'closed');
  assert.equal(kmDetailSummary(fields.filter((f) => f.label !== 'Status')).status, null);
});
t('no closing date on the page → status stays whatever the source says, closing null', () => {
  const noDate = fields.filter((f) => f.label !== 'Submission Closing Date');
  const s = kmDetailSummary(noDate);
  assert.equal(s.status, 'open');
  assert.equal(s.closing, null);
});

console.log('\nkmTenderToRow — same correction at list-scan time:');
const listRec = {
  Number: 'GTC/500/2019', Title: 'Old cable supply', Status: '1;#1',
  EndDate: '/Date(1560000000000)/', StartDate: '/Date(1550000000000)/', Id: 42,
};
t('source-"Open" with a 2019 deadline ingests as closed, not open', () => {
  const row = kmTenderToRow(listRec);
  assert.equal(row.status, 'closed');
  assert.equal(row.raw.km_id, '42');
});
t('source-"Open" with a future deadline stays open', () => {
  const future = { ...listRec, EndDate: '/Date(4102444800000)/' };   // 2100
  assert.equal(kmTenderToRow(future).status, 'open');
});
t('source-"Open" with NO deadline is left as the source states it', () => {
  const noDate = { ...listRec, EndDate: null, FormattedEndDate: null };
  assert.equal(kmTenderToRow(noDate).status, 'open');
});

console.log('\nversioning:');
t('KM_DETAIL_V is 1 — bump it to force a full re-enrich', () => assert.equal(KM_DETAIL_V, 1));

console.log(`\n${pass}/${pass} PASS\n`);
