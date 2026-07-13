// Wrong-company website detection (Val 2026-07-13). Pure; no DB/network.
// Run: node server/tests/website_conflict.test.mjs
import assert from 'node:assert/strict';
import { hostSlug, ownsDomain, ownSlugs, diceSim, shareDistinctive, findWebsiteConflicts } from '../enrichment/local/website_conflict.js';

let pass = 0; const t = (n, fn) => { fn(); pass++; console.log('  ✓ ' + n); };

console.log('\nhostSlug (registrable main label):');
t('handles www, subdomains, ccTLDs', () => {
  assert.equal(hostSlug('https://www.arabian-mep.com'), 'arabianmep');
  assert.equal(hostSlug('https://buildings.honeywell.com/x'), 'honeywell');   // subdomain ignored
  assert.equal(hostSlug('https://www.finemattress.com.qa'), 'finemattress');  // ccTLD
});

console.log('\nownership:');
t('a company owns its own-name domain', () => {
  assert.equal(ownsDomain(ownSlugs('De La Rue Doha LLC'), 'delarue'), true);
  assert.equal(ownsDomain(ownSlugs('Integrated Technical Services'), 'arabianmep'), false);
});

console.log('\nvariant guards:');
t('diceSim high for spelling variants, low for unrelated', () => {
  assert.ok(diceSim('Al Hareb Model Techno', 'Al Harib Modern Technology') > 0.5);
  assert.ok(diceSim('Integrated Technical Services', 'Arabian MEP Contracting') < 0.5);
});
t('shareDistinctive true for same-root parent/subsidiary', () => {
  assert.equal(shareDistinctive('Sendian Group Security Division', 'Sendian Group'), true);
  assert.equal(shareDistinctive('Integrated Technical Services', 'Arabian MEP Contracting'), false);
});

console.log('\nfindWebsiteConflicts:');
const companies = [
  { id: 1, name: 'Integrated Technical Services', website: 'https://www.arabian-mep.com' },
  { id: 2, name: 'Arabian MEP Contracting', website: null },
  { id: 3, name: 'De La Rue Doha LLC', website: 'http://delarue.net' },
  { id: 4, name: 'Nasser Bin Khaled Automobiles Co', website: 'https://www.mercedes-benz.com.qa' },
  { id: 5, name: 'Al Hareb Model Techno', website: 'https://www.alharib.com' },
  { id: 6, name: 'Al Harib Modern Technology', website: null },
  { id: 7, name: 'Sendian Group Security Division', website: 'https://www.sendiangroup.com' },
  { id: 8, name: 'Sendian Group', website: null },
];
const conflicts = findWebsiteConflicts(companies);
t('flags the true cross-company mismatch ONLY', () => {
  const ids = conflicts.map((c) => c.id);
  assert.deepEqual(ids, [1], `expected only [1], got ${JSON.stringify(ids)}`);
  assert.equal(conflicts[0].belongs_to, 'Arabian MEP Contracting');
});
t('does NOT flag: own domain, brand nobody owns, spelling variant, parent/subsidiary', () => {
  for (const id of [3, 4, 5, 7]) assert.ok(!conflicts.some((c) => c.id === id), `id ${id} should not be flagged`);
});

console.log(`\n${pass} passed\n`);
