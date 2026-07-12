// Company financials tests (Val 2026-07-12: solid data only; conservative,
// clearly-labelled estimates by interpolation only). Run:
//   node server/tests/financials.test.mjs
import assert from 'node:assert/strict';
import { normalizeMetric, confidenceOf, periodYear, consolidateFinancials, interpolateAnnual } from '../lib/financials.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log(`  ✓ ${name}`); };

console.log('\nmetric normalization:');
t('messy casings collapse to one canonical metric', () => {
  assert.equal(normalizeMetric('Net Profit').key, 'net_profit');
  assert.equal(normalizeMetric('net profit').key, 'net_profit');
  assert.equal(normalizeMetric('Revenue').key, 'revenue');
  assert.equal(normalizeMetric('revenue').key, 'revenue');
  assert.equal(normalizeMetric('paid_up_capital').key, 'paid_up_capital');
  assert.equal(normalizeMetric('Total Assets').key, 'total_assets');
});
t('an unknown metric is kept, title-cased, never dropped', () => {
  const n = normalizeMetric('Meals Served');
  assert.equal(n.label, 'Meals Served');
  assert.ok(n.key.startsWith('s:'));
});

console.log('\nconfidence by source:');
t('audited exchange + registry = high; website = low; research = medium', () => {
  assert.equal(confidenceOf({ source: 'qse:audited' }), 'high');
  assert.equal(confidenceOf({ source: 'registry:moci' }), 'high');
  assert.equal(confidenceOf({ source: 'research:job-4' }), 'medium');
  assert.equal(confidenceOf({ source: 'website:firecrawl' }), 'low');
});
t("a row's explicit confidence overrides the source default", () => {
  assert.equal(confidenceOf({ source: 'website:firecrawl', confidence: 'high' }), 'high');
});

console.log('\nperiod parsing (annual only):');
t('annual periods parse to a year; quarterly/half do NOT', () => {
  assert.equal(periodYear('FY2023'), 2023);
  assert.equal(periodYear('2022'), 2022);
  assert.equal(periodYear('2024-Q1'), null);
  assert.equal(periodYear('2023 H1'), null);
  assert.equal(periodYear('unknown'), null);
});

console.log('\nconsolidation (best figure wins per metric+period):');
t('duplicate metric+period keeps the higher-confidence figure', () => {
  const rows = [
    { metric: 'Revenue', period: 'FY2023', value_num: 100, source: 'website:firecrawl' },
    { metric: 'revenue', period: 'FY2023', value_num: 120, source: 'qse:audited' },   // audited wins
  ];
  const out = consolidateFinancials(rows);
  assert.equal(out.length, 1);
  assert.equal(out[0].key, 'revenue');
  assert.equal(out[0].entries.length, 1);
  assert.equal(out[0].entries[0].value_num, 120);
  assert.equal(out[0].entries[0].confidence, 'high');
});
t('metrics come back in importance order, periods newest-first', () => {
  const rows = [
    { metric: 'employees', period: 'FY2023', value_num: 50, source: 'website' },
    { metric: 'Revenue', period: 'FY2022', value_num: 90, source: 'qse' },
    { metric: 'Revenue', period: 'FY2023', value_num: 100, source: 'qse' },
  ];
  const out = consolidateFinancials(rows);
  assert.equal(out[0].key, 'revenue');                 // revenue before employees
  assert.equal(out[0].entries[0].period, 'FY2023');    // newest first
  assert.equal(out[0].entries[1].period, 'FY2022');
});

console.log('\nconservative estimates (interpolation only, flagged):');
t('a gap year between two reported figures is interpolated + flagged', () => {
  const entries = [
    { period: 'FY2021', year: 2021, value_num: 100, estimated: false, currency: 'QAR' },
    { period: 'FY2023', year: 2023, value_num: 200, estimated: false, currency: 'QAR' },
  ];
  const est = interpolateAnnual(entries);
  assert.equal(est.length, 1);
  assert.equal(est[0].year, 2022);
  assert.equal(est[0].value_num, 150);        // linear midpoint
  assert.equal(est[0].estimated, true);
  assert.equal(est[0].source, 'estimate:interpolated');
});
t('NEVER extrapolates beyond the reported range', () => {
  const entries = [
    { period: 'FY2021', year: 2021, value_num: 100, estimated: false },
    { period: 'FY2022', year: 2022, value_num: 110, estimated: false },
  ];
  const est = interpolateAnnual(entries);   // no gap between them, nothing before/after
  assert.equal(est.length, 0);
});
t('does not interpolate across an implausibly large gap (>5y)', () => {
  const entries = [
    { period: 'FY2010', year: 2010, value_num: 100, estimated: false },
    { period: 'FY2020', year: 2020, value_num: 200, estimated: false },
  ];
  assert.equal(interpolateAnnual(entries).length, 0);
});
t('consolidate with estimate:true blends real + estimated, ordered', () => {
  const rows = [
    { metric: 'Revenue', period: 'FY2021', value_num: 100, source: 'qse' },
    { metric: 'Revenue', period: 'FY2023', value_num: 300, source: 'qse' },
  ];
  const out = consolidateFinancials(rows, { estimate: true });
  const ests = out[0].entries.filter((e) => e.estimated);
  assert.equal(ests.length, 1);
  assert.equal(ests[0].year, 2022);
  assert.equal(ests[0].value_num, 200);
  // real ones are untouched + not flagged
  assert.equal(out[0].entries.filter((e) => !e.estimated).length, 2);
});

console.log(`\n${pass}/${pass} PASS\n`);
