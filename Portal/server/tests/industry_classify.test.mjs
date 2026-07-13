// Deterministic website/name → industry classifier (Val 2026-07-13, keyword rules).
// Run: node server/tests/industry_classify.test.mjs
import assert from 'node:assert/strict';
import { classifyIndustry, classifyCompany, industriesFromName } from '../enrichment/local/industry_classify.js';

let pass = 0; const t = (n, fn) => { fn(); pass++; console.log('  ✓ ' + n); };

console.log('\nclassifyIndustry (from description text):');
t('clear descriptions classify correctly', () => {
  assert.equal(classifyIndustry('a leading general contracting and civil works construction company, MEP contracting and infrastructure projects')?.industry, 'Construction & Contracting');
  assert.equal(classifyIndustry('software development, web development and mobile app; IT solutions, cloud solutions and cybersecurity')?.industry, 'Information Technology');
  assert.equal(classifyIndustry('our medical center offers a dental clinic, physiotherapy and diagnostic center for patients')?.industry, 'Healthcare');
});
t('vague text stays BLANK (never guess — Rule 2.1)', () => {
  assert.equal(classifyIndustry('Welcome. We deliver quality and value with excellence and passion for our customers.'), null);
  assert.equal(classifyIndustry(''), null);
});

console.log('\nindustriesFromName:');
t('distinctive name words map to their industry', () => {
  assert.equal(industriesFromName('Elite Cleaning Services')[0].industry, 'Facilities & Cleaning');
  assert.equal(industriesFromName('Al Waleed Tailors')[0].industry, 'Textiles & Garments');
  assert.equal(industriesFromName('Monster Salon')[0].industry, 'Beauty & Wellness');
});
t('generic names map to nothing', () => {
  assert.equal(industriesFromName('National Star Gulf Company').length, 0);
});

console.log('\nclassifyCompany (name + description):');
t('name is authoritative for a single-industry name', () => {
  assert.equal(classifyCompany({ name: 'AL RAQI PUBLIC KITCHEN' }).industry, 'Hospitality & F&B');
  assert.equal(classifyCompany({ name: 'AlMohanadi for Manpower Supply' }).industry, 'Manpower & Recruitment');
  const c = classifyCompany({ name: 'Tabibna Technologies' });
  assert.equal(c.industry, 'Information Technology'); assert.equal(c.source, 'name');
});
t('description overrides only with a very strong, different signal', () => {
  const c = classifyCompany({ name: 'Al Noor Trading', description: 'we run a medical center, dental clinic, physiotherapy and diagnostic center for patients across Qatar healthcare' });
  assert.equal(c.industry, 'Healthcare');   // strong healthcare description beats a bare "trading" name
});
t('returns null when nothing is confident', () => {
  assert.equal(classifyCompany({ name: 'Al Noor Group', description: '' }), null);
});

console.log(`\n${pass} passed\n`);
