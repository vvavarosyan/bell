// Cross-posted tender merge tests (Val 2026-07-12: "merge and mention both
// sources"). The contract: the Monaqasat row stays canonical, Kahramaa's award
// facts fill GAPS only, the Kahramaa payload survives verbatim under
// raw.kahramaa, and raw.sources names both portals.
// Run:  node server/tests/merge_crossposted.test.mjs

import assert from 'node:assert/strict';
import { mergedFields } from '../tenders/merge_crossposted.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log(`  ✓ ${name}`); };

const M = {
  id: 1, source: 'monaqasat', source_ref: '3599/2026', status: 'open',
  award_company_name: null, award_company_id: null, value_amount: null,
  awarded_at: null, deadline_at: '2026-08-16T00:00:00Z',
  raw: { detail_v: 4, activities: [{ code: '271050' }], fields: [{ label: 'Subject', value: 'Smart Grid' }] },
};
const K = {
  id: 2, source: 'kahramaa', source_ref: 'LTC/2451/2026', status: 'awarded', url: 'https://www.km.qa/Business/Pages/Awards.aspx',
  award_company_name: 'Galfar Al-Misnad', award_company_id: 77, value_amount: 29574350,
  awarded_at: '2026-05-01T00:00:00Z', deadline_at: '2026-08-10T00:00:00Z',
  raw: { monaqasat_number: '2026/3599', department: 'Grid Dept', fees: '500', bid_bond: '150000' },
};

console.log('\nmerge semantics:');
t('Kahramaa award facts fill the gaps Monaqasat hides', () => {
  const f = mergedFields(M, K);
  assert.equal(f.status, 'awarded');                       // awarded is a fact — upgrades open
  assert.equal(f.award_company_name, 'Galfar Al-Misnad');
  assert.equal(f.award_company_id, 77);
  assert.equal(f.value_amount, 29574350);
  assert.equal(f.awarded_at, '2026-05-01T00:00:00Z');
});
t('a value Monaqasat already states is NEVER overwritten', () => {
  const f = mergedFields(M, K);
  assert.equal(f.deadline_at, '2026-08-16T00:00:00Z');     // Monaqasat's own date wins
  const f2 = mergedFields({ ...M, status: 'awarded', award_company_name: 'Someone Else' }, K);
  assert.equal(f2.award_company_name, 'Someone Else');
});
t('both sources are named; the Kahramaa payload survives verbatim', () => {
  const f = mergedFields(M, K);
  assert.deepEqual(f.raw.sources, ['monaqasat', 'kahramaa']);
  assert.equal(f.raw.kahramaa.source_ref, 'LTC/2451/2026');
  assert.equal(f.raw.kahramaa.department, 'Grid Dept');
  assert.equal(f.raw.kahramaa.bid_bond, '150000');
  assert.equal(f.raw.kahramaa.monaqasat_number, undefined);  // the link itself is not duplicated
});
t("Monaqasat's enrichment (activities, As-published fields) is untouched", () => {
  const f = mergedFields(M, K);
  assert.equal(f.raw.detail_v, 4);
  assert.equal(f.raw.fields[0].value, 'Smart Grid');
  assert.equal(f.raw.activities.length, 1);
});
t('merge is idempotent — re-merging the merged row changes nothing material', () => {
  const once = mergedFields(M, K);
  const again = mergedFields({ ...M, ...once, raw: once.raw, status: once.status }, K);
  assert.deepEqual(again.raw.kahramaa, once.raw.kahramaa);
  assert.equal(again.status, 'awarded');
});

console.log(`\n${pass}/${pass} PASS\n`);
