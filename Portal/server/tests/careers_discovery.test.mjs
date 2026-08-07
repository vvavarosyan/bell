// Careers-endpoint discovery — the input to Bell's job coverage.
//
// Val, 2026-08-07: gather job postings across the ENTIRE active company database. Every company's
// vacancies start with finding WHERE that company publishes them, and until now nothing looked:
// harvester.js PAGE_HINTS covered contact/location/about/team/partner and had no careers category,
// while pickPages() drops every cross-host link — which is where essentially all real careers
// portals live.
//
// The cases below are the shapes measured on live Qatar employers, not invented ones.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickCareersLinks, registrableHost } from '../enrichment/local/harvester.js';

test('registrable domain handles Qatar two-label ccTLDs', () => {
  assert.equal(registrableHost('careers.qnb.com'), 'qnb.com');
  assert.equal(registrableHost('www.qnb.com'), 'qnb.com');
  // .com.qa must not collapse to "com.qa" — that would make every Qatari company one domain.
  assert.equal(registrableHost('jobs.mallofqatar.com.qa'), 'mallofqatar.com.qa');
  assert.equal(registrableHost('careerportal.qatarenergy.qa'), 'qatarenergy.qa');
  assert.equal(registrableHost(''), '');
  assert.equal(registrableHost(null), '');
});

test('a careers subdomain of the company is attributable to it', () => {
  const out = pickCareersLinks('https://www.qnb.com', [
    'https://www.qnb.com/personal',
    'https://careers.qnb.com/',
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'own');
  assert.equal(out[0].host, 'careers.qnb.com');
});

test('a careers HOST with no path still counts', () => {
  // "careers.qnb.com/" has no path for a hint to match. Requiring one would miss the commonest
  // real shape entirely, which is how this whole capability came to be missing.
  const out = pickCareersLinks('https://vodafone.qa', ['https://jobs.vodafone.qa']);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'own');
});

test('a third-party applicant-tracking platform is kept but never attributed', () => {
  const out = pickCareersLinks('https://milaha.com', [
    'https://ejqa.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1',
  ]);
  assert.equal(out.length, 1);
  // High value — Oracle publishes dated, structured vacancies — but the host is Oracle's, not
  // Milaha's, so it must not be treated as the company's own site.
  assert.equal(out[0].kind, 'ats');
});

test('an unrelated careers host is recorded as external, not as the company', () => {
  // The exact shape that attached Honeywell International's Chennai vacancies to a Qatar trading
  // firm: Bell's stored website points at a global brand, whose careers link is a stranger.
  const out = pickCareersLinks('https://honeywelltrading.qa', [
    'https://www.honeywell.com/us/en/careers',
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'external');
});

test('own beats ats beats external, so the safest evidence is used first', () => {
  const out = pickCareersLinks('https://example.qa', [
    'https://jobs.brand-x.com/openings',
    'https://ejqa.fa.em2.oraclecloud.com/hcmUI/CandidateExperience',
    'https://example.qa/careers',
  ]);
  assert.deepEqual(out.map((x) => x.kind), ['own', 'ats', 'external']);
});

test('non-careers links, duplicates and junk protocols are all rejected', () => {
  const out = pickCareersLinks('https://example.qa', [
    'https://example.qa/about-us',
    'https://example.qa/contact',
    'mailto:jobs@example.qa',          // not a page
    'javascript:void(0)',              // not a page
    'not a url at all',
    'https://example.qa/careers',
    'https://example.qa/careers/',     // same page, trailing slash
    'https://example.qa/careers#top',  // same page, fragment
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].url, 'https://example.qa/careers');
});

test('Arabic careers paths are found', () => {
  const out = pickCareersLinks('https://example.qa', ['https://example.qa/ar/وظائف']);
  assert.equal(out.length, 1);
  assert.equal(out[0].kind, 'own');
});

test('a bloated nav cannot flood the record', () => {
  const many = Array.from({ length: 30 }, (_, i) => `https://example.qa/careers/${i}`);
  assert.equal(pickCareersLinks('https://example.qa', many).length, 4);
  assert.equal(pickCareersLinks('https://example.qa', many, 2).length, 2);
});

test('empty and missing input never throws', () => {
  assert.deepEqual(pickCareersLinks('https://example.qa', []), []);
  assert.deepEqual(pickCareersLinks('https://example.qa', null), []);
  assert.deepEqual(pickCareersLinks('', ['https://x.qa/careers']).length, 1);
});
