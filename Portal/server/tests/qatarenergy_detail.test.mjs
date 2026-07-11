// QatarEnergy detail-page parser tests.
//
// Fixtures in ./fixtures/ are VERBATIM live captures, 2026-07-11 (plain fetch —
// the exact HTML the enricher itself consumes at runtime; the detail pages are
// server-rendered ASPX, not JS-built):
//   qe_detail_open.html     LT26102700 (open) — 8 label/value rows incl. the full scope
//   qe_detail_awarded.html  PO 4300126663 (awarded) — 5 rows incl. winner + price
//
// Run:  node server/tests/qatarenergy_detail.test.mjs

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { qeDetailFields, qeScopeOf, QE_DETAIL_V } from '../tenders/enrich_qatarenergy.js';

const FIX = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const read = (f) => readFileSync(join(FIX, f), 'utf8');

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log(`  ✓ ${name}`); };

console.log('\nopen tender (LT26102700, verbatim):');
const open_ = qeDetailFields(read('qe_detail_open.html'));
t('captures all 8 published rows, in page order', () => {
  assert.deepEqual(open_.map((f) => f.label), [
    'Limited', 'Bond', 'Tender Issue Period', 'Bid Closing Date', 'Fee',
    'Bond Validity', 'OfferValidity', 'Scope of Work/Description',
  ]);
});
t('values are verbatim', () => {
  assert.equal(open_.find((f) => f.label === 'Bond').value, '150000');
  assert.equal(open_.find((f) => f.label === 'Fee').value, '200');
  assert.equal(open_.find((f) => f.label === 'Tender Issue Period').value, '09/07/26 - 15/07/26');
  assert.equal(open_.find((f) => f.label === 'Bid Closing Date').value, '27/07/26');
  assert.equal(open_.find((f) => f.label === 'Bond Validity').value, '24/12/26- (150) days from the Bid Closing Date');
});
t('the full scope of work is captured as readable text', () => {
  const scope = qeScopeOf(open_);
  assert.ok(scope.startsWith('The scope of this tender is to provide experienced vendor services'));
  assert.ok(scope.includes('Escape capsules'));
  assert.ok(scope.includes('SCHAT HARDING'));
  assert.ok(!scope.includes('<'), 'no markup may leak into the text');
});

console.log('\nawarded tender (PO 4300126663, verbatim):');
const awarded = qeDetailFields(read('qe_detail_awarded.html'));
t('captures the 5 published rows incl. winner and price', () => {
  assert.deepEqual(awarded.map((f) => f.label), ['Tender ID', 'PO Number', 'Tender Description', 'Awarded to', 'Price']);
  assert.equal(awarded.find((f) => f.label === 'Awarded to').value, 'DUNES INTERNATIONAL TRADING CO W.L.');
  assert.equal(awarded.find((f) => f.label === 'Price').value, 'QAR 3370500');
});

console.log('\ndiscipline:');
t('blank values are dropped — the source stated nothing, so Bell states nothing', () => {
  const fields = qeDetailFields('<td><strong>Empty:</strong></td><td>   </td><td><strong>Real:</strong></td><td>x</td>');
  assert.deepEqual(fields, [{ label: 'Real', value: 'x' }]);
});
t('junk input degrades to [] (page stays pending, retried next run)', () => {
  assert.deepEqual(qeDetailFields('<html>maintenance page</html>'), []);
  assert.deepEqual(qeDetailFields(null), []);
});
t('QE_DETAIL_V is 1 — bumping it re-checks the archive once', () => {
  assert.equal(QE_DETAIL_V, 1);
});

console.log(`\n${pass}/${pass} PASS\n`);
