// Proof-of-search ledger (Phase 2 A3) — outcome-semantics tests.
//
// The rule under test: "no data" is only PROOF (verified_empty) when the
// engine's full method actually ran. Disabled tiers, robots blocks, dead sites
// and unverifiable SMTP make absence UNPROVEN (degraded_empty); a missing
// precondition (no website / no people) means nothing was searched (skipped).
//
// Run:  node server/tests/search_ledger.test.mjs

import assert from 'node:assert/strict';
import { ENGINE_OF_STAGE, outcomeFor } from '../enrichment/local/ledger_rules.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log(`  ✓ ${name}`); };

console.log('\nuniversal statuses:');
t('done → found, failed → error, candidate/skipped pass through, running → nothing', () => {
  for (const stage of [7, 8, 9, 10, 11, 12]) {
    assert.equal(outcomeFor(stage, 'done'), 'found');
    assert.equal(outcomeFor(stage, 'failed'), 'error');
    assert.equal(outcomeFor(stage, 'running'), null);
  }
  assert.equal(outcomeFor(8, 'candidate'), 'candidate');
  assert.equal(outcomeFor(8, 'skipped'), 'skipped');
});
t('unknown stage or status records nothing — never guesses', () => {
  assert.equal(outcomeFor(99, 'no_data'), null);
  assert.equal(outcomeFor(8, 'weird_status'), null);
});
t('every hooked stage has an engine name', () => {
  assert.deepEqual(Object.keys(ENGINE_OF_STAGE).map(Number).sort((a, b) => a - b), [7, 8, 9, 10, 11, 12]);
});

console.log('\nfinder (stage 8) — proof requires the FULL fallback chain:');
t('no_data with the chain complete = verified_empty', () => {
  assert.equal(outcomeFor(8, 'no_data', { stage8_search_complete: true, stage8_tiers: { guess: true, apify: true, firecrawl: false, headless: true } }), 'verified_empty');
});
t('no_data with a truncated chain = degraded_empty (a fallback tier was dead)', () => {
  assert.equal(outcomeFor(8, 'no_data', { stage8_search_complete: false, stage8_tiers: { guess: true, apify: true, firecrawl: false, headless: false } }), 'degraded_empty');
});
t('no_data with no completeness record = degraded_empty (cannot claim what was not recorded)', () => {
  assert.equal(outcomeFor(8, 'no_data', { stage8_checked_at: '2026-07-10' }), 'degraded_empty');
  assert.equal(outcomeFor(8, 'no_data', null), 'degraded_empty');
});
t('rejected_host = degraded_empty (reachable from the guess phase, before any search runs)', () => {
  assert.equal(outcomeFor(8, 'no_data', { stage8_skip_reason: 'rejected_host' }), 'degraded_empty');
});

console.log('\nharvester (stage 7):');
t('no website = skipped; robots = degraded; crawled-and-empty = verified', () => {
  assert.equal(outcomeFor(7, 'no_data', { stage7_skip_reason: 'no_website' }), 'skipped');
  assert.equal(outcomeFor(7, 'no_data', { stage7_skip_reason: 'robots' }), 'degraded_empty');
  assert.equal(outcomeFor(7, 'no_data', { stage7_pages: [{ url: 'https://x.qa', kind: 'home' }], stage7_shell_unrendered: false }), 'verified_empty');
});
t('JS shell crawled without a render = degraded_empty (page was never actually read)', () => {
  assert.equal(outcomeFor(7, 'no_data', { stage7_pages: [{ url: 'https://spa.qa', kind: 'home' }], stage7_shell_unrendered: true }), 'degraded_empty');
});

console.log('\nnetwork mapper (stage 9):');
t('no website = skipped; mapped-and-empty = verified', () => {
  assert.equal(outcomeFor(9, 'no_data', { stage9_skip_reason: 'no_website' }), 'skipped');
  assert.equal(outcomeFor(9, 'no_data', { stage9_found: { partners: 0 } }), 'verified_empty');
});

console.log('\nemail finder (stage 10) — SMTP verification is unreliable in Qatar:');
t('missing inputs = skipped; generated-but-unverified = degraded (never "proven absent")', () => {
  assert.equal(outcomeFor(10, 'no_data', { stage10_skip: 'no-domain' }), 'skipped');
  assert.equal(outcomeFor(10, 'no_data', { stage10_skip: 'no-people' }), 'skipped');
  assert.equal(outcomeFor(10, 'no_data', { stage10_people: 4, stage10_observed: 0, stage10_pattern: 0 }), 'degraded_empty');
});

console.log('\ncompany facts (stage 11):');
t('no site / disabled = skipped; unreachable or unrendered shell = degraded; readable page = verified', () => {
  assert.equal(outcomeFor(11, 'no_data', { stage11_skip: 'no-website' }), 'skipped');
  assert.equal(outcomeFor(11, 'no_data', { stage11_skip: 'extract-disabled' }), 'skipped');
  assert.equal(outcomeFor(11, 'no_data', { stage11_skip: 'unreachable' }), 'degraded_empty');
  assert.equal(outcomeFor(11, 'no_data', { stage11_skip: 'js-shell-unrendered' }), 'degraded_empty');
  assert.equal(outcomeFor(11, 'no_data', { stage11_skip: 'no-facts-keywords' }), 'verified_empty');
  assert.equal(outcomeFor(11, 'no_data', { stage11_financials: 0, stage11_shareholders: 0 }), 'verified_empty');
});

console.log('\ntech stack (stage 12):');
t('no site = skipped; unreachable or empty-from-shell = degraded; fingerprinted readable page = verified', () => {
  assert.equal(outcomeFor(12, 'no_data', { stage12_skip: 'no-website' }), 'skipped');
  assert.equal(outcomeFor(12, 'no_data', { stage12_skip: 'unreachable' }), 'degraded_empty');
  assert.equal(outcomeFor(12, 'no_data', { stage12_tech: 0, stage12_source: 'https://spa.qa', stage12_shell_unrendered: true }), 'degraded_empty');
  assert.equal(outcomeFor(12, 'no_data', { stage12_tech: 0, stage12_source: 'https://x.qa' }), 'verified_empty');
});

console.log(`\n${pass}/${pass} PASS\n`);
