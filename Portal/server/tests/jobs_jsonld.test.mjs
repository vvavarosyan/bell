// Reading a company's own careers page — and refusing to invent anything it does not state.
//
// This reader exists because Bell holds 255 careers pages on companies' own domains and every one
// is a different hand-built layout. The tempting fix is to scrape what a human sees; that is how a
// "Life at X" testimonial becomes a vacancy and a "since 2019" becomes a posting date. So it reads
// schema.org/JobPosting only — a claim the site publishes itself, in a named field.
//
// Pure parsing; no network, no database.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractLdBlocks, collectJobPostings, ldInstant, ldLocation, ldExpiry, ldExternalId,
  parseJobPostings,
} from '../jobs/sources/jsonld.js';

const page = (...blocks) =>
  `<html><head>${blocks.map((b) => `<script type="application/ld+json">${typeof b === 'string' ? b : JSON.stringify(b)}</script>`).join('')}</head><body><h1>Careers</h1></body></html>`;

const POSTING = {
  '@context': 'https://schema.org', '@type': 'JobPosting',
  title: 'Site Engineer',
  identifier: { '@type': 'PropertyValue', value: 'REQ-1001' },
  datePosted: '2026-08-01',
  hiringOrganization: { '@type': 'Organization', name: 'Mekdam Holding Group' },
  jobLocation: { '@type': 'Place', address: { addressLocality: 'Doha', addressCountry: 'QA' } },
  employmentType: 'FULL_TIME',
};

test('a page with no structured data yields nothing, and says nothing went wrong', () => {
  const r = parseJobPostings('<html><body><h2>Join our team!</h2><p>Send your CV</p></body></html>', 'https://x.qa/careers');
  assert.deepEqual(r.jobs, []);
  assert.equal(r.postings, 0);
});

test('a headings-and-paragraphs careers page produces no vacancies', () => {
  // The whole point. This page looks full of jobs to a human and to a naive scraper.
  const html = `<html><body>
    <h2>Life at Acme</h2><p>We hire great people since 2019</p>
    <h3>Sales Manager</h3><p>Apply now</p>
    <h3>Driver</h3><p>Apply now</p></body></html>`;
  assert.deepEqual(parseJobPostings(html, 'https://x.qa/careers').jobs, []);
});

test('one JobPosting is read with what the page states', () => {
  const { jobs } = parseJobPostings(page(POSTING), 'https://x.qa/careers');
  assert.equal(jobs.length, 1);
  const j = jobs[0];
  assert.equal(j.title, 'Site Engineer');
  assert.equal(j.external_id, 'REQ-1001');
  assert.equal(j.employer_stated, 'Mekdam Holding Group');
  assert.equal(j.location_text, 'Doha, QA');
  assert.equal(j.employment_type, 'FULL_TIME');
  assert.equal(j.posted_at, '2026-08-01T00:00:00.000Z');
});

test('columns nobody states stay NULL', () => {
  const { jobs } = parseJobPostings(page(POSTING), 'https://x.qa/careers');
  const j = jobs[0];
  // Reading seniority off a title, or an industry off the employer, is the same error class as
  // deriving a tender's industry from the buyer's department.
  for (const k of ['seniority_level', 'job_function', 'industries',
                   'salary_min', 'salary_max', 'salary_currency', 'salary_period']) {
    assert.equal(j[k], null, `${k} must stay null`);
  }
});

test('postings nested in @graph and ItemList are found', () => {
  const html = page(
    { '@context': 'https://schema.org', '@graph': [{ '@type': 'Organization', name: 'Acme' }, POSTING] },
    { '@context': 'https://schema.org', '@type': 'ItemList',
      itemListElement: [{ '@type': 'ListItem', item: { ...POSTING, title: 'Accountant', identifier: 'REQ-2' } }] });
  const { jobs } = parseJobPostings(html, 'https://x.qa/careers');
  assert.deepEqual(jobs.map((j) => j.title).sort(), ['Accountant', 'Site Engineer']);
});

test('a malformed block does not lose the good one beside it', () => {
  const html = page('{ this is not json', POSTING);
  assert.equal(extractLdBlocks(html).length, 1);
  assert.equal(parseJobPostings(html, 'https://x.qa/careers').jobs.length, 1);
});

test('a posting with no title or no identity is skipped, never invented', () => {
  const noTitle = { ...POSTING, title: undefined, name: undefined };
  assert.equal(parseJobPostings(page(noTitle), 'https://x.qa/c').jobs.length, 0);
  // No identifier and no url: the page url + title is the last resort, and it IS stable.
  const noId = { ...POSTING, identifier: undefined, url: undefined };
  const r = parseJobPostings(page(noId), 'https://x.qa/c');
  assert.equal(r.jobs.length, 1);
  assert.equal(r.jobs[0].external_id, 'https://x.qa/c#Site Engineer');
});

test('the same posting twice on one page is stored once', () => {
  const { jobs } = parseJobPostings(page(POSTING, POSTING), 'https://x.qa/c');
  assert.equal(jobs.length, 1);
});

// ── the fabricated expiry ────────────────────────────────────────────────────────────────────
test('validThrough exactly one year after datePosted is NOT an expiry', () => {
  // QatarEnergy's pages carry create_date + exactly 365 days whenever the ATS states no real
  // expiry. Trusting it would have closed 9 of 43 LIVE vacancies. It is an ATS default, not a
  // statement, and the same default appears wherever that ATS is used.
  const r = ldExpiry({ datePosted: '2026-08-01T00:00:00Z', validThrough: '2027-08-01T00:00:00Z' });
  assert.equal(r.expires_at, null);
  assert.match(r.note, /ATS default/);
});

test('a genuine expiry is kept', () => {
  const r = ldExpiry({ datePosted: '2026-07-15', validThrough: '2026-09-30' });
  assert.equal(r.expires_at, '2026-09-30T00:00:00.000Z');
  assert.match(r.note, /stated by the page/);
});

test('an expiry with no posting date beside it is still kept', () => {
  // The one-year rule needs BOTH dates to fire. With no datePosted there is nothing to compare, so
  // the stated value stands — refusing it would throw away real expiries.
  assert.equal(ldExpiry({ validThrough: '2026-12-01' }).expires_at, '2026-12-01T00:00:00.000Z');
});

// ── small helpers ────────────────────────────────────────────────────────────────────────────
test('a nonsense date is not a date', () => {
  assert.equal(ldInstant('as soon as possible'), null);
  assert.equal(ldInstant('0001-01-01'), null);          // serialiser zero-value
  assert.equal(ldInstant('2099-01-01'), null);          // beyond any real posting
  assert.equal(ldInstant('2026-08-01'), '2026-08-01T00:00:00.000Z');
});

test('location reads the address the page states, in its own words', () => {
  assert.equal(ldLocation({ jobLocation: { address: { addressLocality: 'Al Wakrah', addressCountry: 'Qatar' } } }),
    'Al Wakrah, Qatar');
  assert.equal(ldLocation({ jobLocation: [{ address: 'Lusail Marina' }] }), 'Lusail Marina');
  assert.equal(ldLocation({}), null);
});

test('the identifier the page publishes is preferred over its URL', () => {
  assert.equal(ldExternalId({ identifier: { value: 'REQ-9' }, url: 'https://x.qa/j/1' }, 'https://x.qa/c'), 'REQ-9');
  assert.equal(ldExternalId({ url: 'https://x.qa/j/1' }, 'https://x.qa/c'), 'https://x.qa/j/1');
  assert.equal(ldExternalId({}, 'https://x.qa/c'), null);
});

test('a JobPosting typed with a full schema.org URL still counts', () => {
  const html = page({ ...POSTING, '@type': 'http://schema.org/JobPosting' });
  assert.equal(parseJobPostings(html, 'https://x.qa/c').jobs.length, 1);
});

test('an Organization or BreadcrumbList is not a vacancy', () => {
  const html = page(
    { '@context': 'https://schema.org', '@type': 'Organization', name: 'Acme', numberOfEmployees: 40 },
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', name: 'Careers' }] });
  assert.deepEqual(parseJobPostings(html, 'https://x.qa/c').jobs, []);
});

test('collectJobPostings survives a self-referencing graph', () => {
  const a = { '@type': 'ItemList' };
  a.itemListElement = [a, POSTING];
  assert.equal(collectJobPostings(a).length, 1);
});
