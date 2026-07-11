// Kahramaa scraper tests. Fixture ./fixtures/kahramaa_rows.json holds VERBATIM
// records captured live from km.qa's BusinessWebService (2026-07-12): 3
// GetTendersPaging rows + 2 GetBusinessAwards rows (A-GTC).
// Run:  node server/tests/kahramaa.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { kmTenderToRow, kmAwardToRow, kmStatus, parseAspNetDate, parseFormattedDate } from '../tenders/scrape_kahramaa.js';

const FIX = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'kahramaa_rows.json'), 'utf8'));

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log(`  ✓ ${name}`); };

console.log('\ndates and status decoding:');
t('ASP.NET dates parse; DateTime.MinValue means NO value', () => {
  assert.equal(parseAspNetDate('/Date(1783458000000)/'), new Date(1783458000000).toISOString());
  assert.equal(parseAspNetDate('/Date(-62135596800000)/'), null);
  assert.equal(parseAspNetDate(null), null);
});
t('dd-mm-yyyy formatted twins parse', () => {
  assert.equal(parseFormattedDate('16-08-2026'), new Date('2026-08-16T00:00:00+03:00').toISOString());
  assert.equal(parseFormattedDate('2026-08-16'), null);   // unknown format stays null
});
t("SharePoint status lookups decode; unknown encodings stay null (never guessed)", () => {
  assert.equal(kmStatus('1;#1'), 'open');
  assert.equal(kmStatus('2;#2'), 'closed');
  assert.equal(kmStatus('9;#9'), null);
});

console.log('\ntender rows (verbatim fixture):');
const rows = FIX.tenders.map(kmTenderToRow).filter(Boolean);
t('all fixture tenders map with ref/title/dates', () => {
  assert.equal(rows.length, 3);
  const r = rows[0];
  assert.equal(r.source, 'kahramaa');
  assert.equal(r.source_ref, 'LTC/2451/2026');
  assert.ok(r.title.startsWith('Smart Grid Studies'));
  assert.equal(r.status, 'open');
  assert.ok(r.deadline_at, 'EndDate must map to deadline_at');
});
t('the Monaqasat cross-reference is captured verbatim', () => {
  assert.equal(rows[0].raw.monaqasat_number, '2026/3599');
});
t('junk records are dropped, never guessed', () => {
  assert.equal(kmTenderToRow({ Number: 'X/1', Title: '' }), null);
  assert.equal(kmTenderToRow({}), null);
});

console.log('\naward rows (verbatim fixture):');
const awards = FIX.awards.map((a) => kmAwardToRow(a, 'A-GTC')).filter(Boolean);
t('awards map with winner + amount + awarded status', () => {
  assert.ok(awards.length >= 1);
  const a = awards[0];
  assert.equal(a.status, 'awarded');
  assert.equal(a.source_ref, 'MTOC-MW823/2023');
  assert.equal(a.award_company_name, 'Mannai Trading Co.');
  assert.equal(a.value_amount, 59850);
  assert.ok(a.awarded_at, 'FormattedDate must map (Date field is MinValue junk)');
  assert.deepEqual(a.raw.winners[0], { name: 'Mannai Trading Co.', amount: '59,850.00' });
});

console.log(`\n${pass}/${pass} PASS\n`);
