// QatarEnergy career-portal job reader — proved against real captured pages.
// ============================================================================
// Run:  node --test server/tests/jobs_qatarenergy.test.mjs
//
// FIXTURES — all captured live from careerportal.qatarenergy.qa on 2026-08-07,
// honouring the 5-second crawl-delay the site's robots.txt states:
//
//   qe_job_5731.html      FULL, UNTOUCHED page (465,972 bytes). "HEAD, QHSE".
//                         The zero-salary trap AND a real stated expiry.
//   qe_job_3877.html      stated expiry, 92 days out
//   qe_job_5510.html      stated expiry, 30 days out
//   qe_job_3087.html      NO stated expiry; ld+json validThrough already past
//   qe_job_3488.html      NO stated expiry; ld+json validThrough already past
//   qe_job_5673.html      NO stated expiry; ld+json validThrough in the future
//   qe_job_5790.html      NO stated expiry; ld+json validThrough in the future
//   qe_job_404.html       a delisted posting (HTTP 404 body)
//   qe_sitemap_index.xml  the real <sitemapindex>
//   qe_sitemap_jobs.xml   the real 250-URL <urlset>
//
// Every fixture except 5731 and the two sitemaps is a two-piece VERBATIM slice
// of the live capture — the head/ld+json region and the region containing
// window.jobDescriptionConfig and window.jobDescriptionTemplates, joined by an
// HTML comment that names the removed byte range. Only vendor/i18n JavaScript
// was removed; every byte the parser reads is byte-identical to what the server
// sent. qe_job_5731.html is the complete, unmodified page, so the parser is
// proved once end-to-end on a real 466 KB document too.
//
// GROUND TRUTH below was read off the live pages, not off the parser.
// ============================================================================

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  parseQatarEnergyJob,
  parseQatarEnergySitemapIndex,
  parseQatarEnergyJobSitemap,
  fetchQatarEnergyJob,
  fetchQatarEnergySitemap,
  qeExtractJobPosting,
  qeExtractJobConfig,
  qeStatedExpiry,
  qeStatedSalary,
  qeParseInstant,
  qeIdFromUrl,
  qeJobUrl,
  QE_SOURCE,
  QE_CRAWL_DELAY_MS,
} from '../jobs/sources/qatarenergy.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => readFileSync(join(here, 'fixtures', name), 'utf8');
const page = (id) => fx(`qe_job_${id}.html`);

// The instant every "is it open?" assertion is evaluated at, unless stated.
const NOW = '2026-08-07T07:00:00Z';

// ---------------------------------------------------------------------------
// GROUND TRUTH — what each live page states, transcribed from the page itself.
// ---------------------------------------------------------------------------
const GROUND_TRUTH = [
  {
    id: '5731',
    title: 'HEAD, QHSE',
    location_text: 'DOHA, Qatar',
    posted_at: '2026-08-06T06:53:00.000Z',
    // iCIMS job.posting_expiry_date = "2026-08-09T21:00:00+0000"
    expires_at: '2026-08-09T21:00:00.000Z',
    expiry_provenance: 'icims.posting_expiry_date',
    ld_json_valid_through: '2026-08-09T21:00:00+0000',
    create_date: '2026-08-06T06:53:45.000Z',
    category: ['Project Engineering'],
    job_grade: ['Job Grade - 17'],
    recruitment_track: ['Experienced / Professional Recruitment'],
    city: 'DOHA',
    street_address: 'PO BOX-70',
    latitude: 25.27932,
    longitude: 51.52245,
    apply_url: 'https://experienced-professionals-recruitment-qatarenergy.icims.com/jobs/5731/login',
  },
  {
    id: '3877',
    title: 'GENERAL TECHNICIAN (INSPECTION)',
    location_text: 'MESAIEED, Qatar',
    posted_at: '2026-08-05T09:01:00.000Z',
    expires_at: '2026-11-05T21:00:00.000Z',
    expiry_provenance: 'icims.posting_expiry_date',
    ld_json_valid_through: '2026-11-05T21:00:00+0000',
    create_date: '2026-08-05T09:02:45.000Z',
    category: ['Operations'],
    job_grade: ['Job Grade - 8'],
    recruitment_track: ['Experienced / Professional Recruitment'],
    city: 'MESAIEED',
    street_address: 'PO BOX-50070',
    apply_url: 'https://experienced-professionals-recruitment-qatarenergy.icims.com/jobs/3877/login',
  },
  {
    id: '5510',
    title: 'ASST. MANAGER, RIG OPNS (BH,MM,NFA,ALR)',
    location_text: 'DOHA, Qatar',
    posted_at: '2026-08-05T08:01:00.000Z',
    expires_at: '2026-09-04T21:00:00.000Z',
    expiry_provenance: 'icims.posting_expiry_date',
    ld_json_valid_through: '2026-09-04T21:00:00+0000',
    create_date: '2026-08-05T08:02:45.000Z',
    category: ['Drilling'],
    job_grade: ['Job Grade - 18'],
    recruitment_track: ['Experienced / Professional Recruitment'],
    city: 'DOHA',
    street_address: 'PO BOX-70',
    apply_url: 'https://experienced-professionals-recruitment-qatarenergy.icims.com/jobs/5510/login',
  },
  {
    // iCIMS states NO expiry. ld+json says 2026-04-14 — ALREADY PAST at NOW.
    id: '3087',
    title: 'RELIABILITY ENGINEER (MAJOR R/E)',
    location_text: 'DUKHAN, Qatar',
    posted_at: '2025-03-09T07:24:00.000Z',
    expires_at: null,
    expiry_provenance: 'none',
    ld_json_valid_through: '2026-04-14T14:53:58.000Z',
    create_date: '2025-04-14T14:53:58.000Z',
    category: ['Maintenance, Reliability and Turnarounds'],
    job_grade: ['Job Grade - 15'],
    recruitment_track: ['Experienced / Professional Recruitment'],
    city: 'DUKHAN',
    street_address: 'PO BOX-100001',
    apply_url: 'https://experienced-professionals-recruitment-qatarenergy.icims.com/jobs/3087/login',
  },
  {
    id: '3488',
    title: 'FRESH QATARI GRADUATES',
    location_text: 'DOHA, Qatar',
    posted_at: '2025-02-02T09:32:00.000Z',
    expires_at: null,
    expiry_provenance: 'none',
    ld_json_valid_through: '2026-04-14T14:53:51.000Z',
    create_date: '2025-04-14T14:53:51.000Z',
    category: ['Human Capital'],
    job_grade: ['Job Grade - SZ'],
    recruitment_track: ['National Fresh Graduate Recruitment'],
    city: 'DOHA',
    street_address: 'PO BOX-70',
    apply_url: 'https://national-recruitment-qatarenergy.icims.com/jobs/3488/login',
  },
  {
    id: '5673',
    title: 'SR. CAMP SERVICES SUPERVISOR',
    location_text: 'RAS LAFFAN, Qatar',
    posted_at: '2026-08-05T10:31:00.000Z',
    expires_at: null,
    expiry_provenance: 'none',
    ld_json_valid_through: '2027-08-05T10:31:45.000Z',
    create_date: '2026-08-05T10:31:45.000Z',
    category: ['Health Safety Environment & Security'],
    job_grade: ['Job Grade - 14'],
    recruitment_track: ['Experienced / Professional Recruitment'],
    city: 'RAS LAFFAN',
    street_address: 'PO BOX-22247',
    apply_url: 'https://experienced-professionals-recruitment-qatarenergy.icims.com/jobs/5673/login',
  },
  {
    id: '5790',
    title: 'ADVISOR, MARINE & LOGISTICS',
    location_text: 'DOHA, Qatar',
    posted_at: '2026-08-03T06:03:00.000Z',
    expires_at: null,
    expiry_provenance: 'none',
    ld_json_valid_through: '2027-08-03T06:03:45.000Z',
    create_date: '2026-08-03T06:03:45.000Z',
    category: ['Marine & Logistics'],
    job_grade: ['Job Grade - 17'],
    recruitment_track: ['Experienced / Professional Recruitment'],
    city: 'DOHA',
    street_address: 'PO BOX-70',
    apply_url: 'https://experienced-professionals-recruitment-qatarenergy.icims.com/jobs/5790/login',
  },
];

// ===========================================================================
test('7/7 live job pages parse field-for-field to what the page states', async (t) => {
  for (const g of GROUND_TRUTH) {
    await t.test(`job ${g.id} — ${g.title}`, () => {
      const r = parseQatarEnergyJob(page(g.id), { now: NOW });
      assert.ok(r, 'a record was produced');

      assert.equal(r.title, g.title);
      assert.equal(r.location_text, g.location_text);
      assert.equal(r.posted_at, g.posted_at);
      assert.equal(r.expires_at, g.expires_at);

      assert.equal(r.source, QE_SOURCE);
      assert.equal(r.external_id, g.id);
      assert.equal(r.source_url, `https://careerportal.qatarenergy.qa/jobs/${g.id}?lang=en-us`);

      // The page names its own employer — no dependence on Bell's website link.
      assert.equal(r.extra_fields.employer_name, 'QatarEnergy');
      assert.equal(r._employer_name, 'QatarEnergy');

      assert.equal(r.extra_fields.expiry_provenance, g.expiry_provenance);
      assert.equal(r.extra_fields.ld_json_valid_through, g.ld_json_valid_through);
      assert.equal(r.extra_fields.source_create_date, g.create_date);
      assert.deepEqual(r.extra_fields.category, g.category);
      assert.deepEqual(r.extra_fields.job_grade, g.job_grade);
      assert.deepEqual(r.extra_fields.recruitment_track, g.recruitment_track);
      assert.equal(r.extra_fields.city, g.city);
      assert.equal(r.extra_fields.street_address, g.street_address);
      assert.equal(r.extra_fields.country, 'Qatar');
      assert.equal(r.extra_fields.country_code, 'QA');
      assert.equal(r.extra_fields.apply_url, g.apply_url);
      assert.equal(r.extra_fields.ats_code, 'icims');
      assert.equal(r.extra_fields.applyable, true);
      assert.equal(r.extra_fields.searchable, true);

      // description is the posting body, verbatim HTML as published
      assert.ok(r.description.startsWith('<strong>Primary Purpose of the Job</strong>'));

      // Rule 2.4 — raw_payload is a packRaw string, never a slice
      assert.equal(typeof r.raw_payload, 'string');
      assert.equal(r._raw_too_large, false);
      assert.doesNotThrow(() => JSON.parse(r.raw_payload));
      assert.ok(r.raw_payload.length <= 20_000);
    });
  }
});

if (GROUND_TRUTH[0].latitude !== undefined) {
  test('stated coordinates are kept as numbers, not strings', () => {
    const r = parseQatarEnergyJob(page('5731'), { now: NOW });
    assert.equal(r.extra_fields.latitude, 25.27932);
    assert.equal(r.extra_fields.longitude, 51.52245);
  });
}

// ===========================================================================
// THE SALARY TRAP — mandatory. Job 5731, live.
// ===========================================================================
test('THE SALARY TRAP: job 5731 states USD 0/0/0 and yields NO salary', () => {
  const html = page('5731');

  // First, prove the page really does state the trap (ground truth, not our parse).
  const posting = qeExtractJobPosting(html);
  assert.equal(posting.salaryCurrency, 'USD');
  assert.deepEqual(posting.baseSalary, {
    '@type': 'MonetaryAmount',
    currency: 'USD',
    value: { '@type': 'QuantitativeValue', value: 0, minValue: 0, maxValue: 0, unitText: 'YEAR' },
  });

  // Now the refusal.
  const r = parseQatarEnergyJob(html, { now: NOW });
  assert.equal(r.salary_min, null);
  assert.equal(r.salary_max, null);
  assert.equal(r.salary_currency, null);
  assert.equal(r.salary_period, null);
  // A zero placeholder is a normal absence, not something to escalate.
  assert.equal(r._salary_review, null);
});

test('all 7 pages state the same USD 0/0/0 placeholder — 7/7 yield no salary', () => {
  for (const g of GROUND_TRUTH) {
    const r = parseQatarEnergyJob(page(g.id), { now: NOW });
    assert.equal(r.salary_min, null, `job ${g.id} salary_min`);
    assert.equal(r.salary_max, null, `job ${g.id} salary_max`);
    assert.equal(r.salary_currency, null, `job ${g.id} salary_currency`);
    assert.equal(r.salary_period, null, `job ${g.id} salary_period`);
  }
});

test('a NON-zero figure is still refused, but loudly — it is queued for review', () => {
  // Same shape the live page uses, with a real number substituted.
  const review = qeStatedSalary({
    salaryCurrency: 'USD',
    baseSalary: {
      '@type': 'MonetaryAmount',
      currency: 'USD',
      value: { '@type': 'QuantitativeValue', value: 0, minValue: 240000, maxValue: 300000, unitText: 'YEAR' },
    },
  });
  assert.equal(review.salary, null, 'still never published');
  assert.ok(review.review, 'but a human is told');
  assert.equal(review.review.currency_as_published, 'USD');
  assert.deepEqual(review.review.figures, [240000, 300000]);
});

test('negative and non-finite figures are not salaries', () => {
  for (const v of [-1, NaN, Infinity, '120000', null]) {
    const out = qeStatedSalary({ baseSalary: { currency: 'QAR', value: { value: v } } });
    assert.equal(out.salary, null);
    assert.equal(out.review, null, `${String(v)} must not even reach review`);
  }
});

// ===========================================================================
// THE EXPIRY TRAP — the reason this parser exists.
// ===========================================================================
test('THE EXPIRY TRAP: ld+json validThrough is create_date + exactly 365 days when nothing is stated', () => {
  // Proved here on the 4 fixtures that state no expiry; measured on 35/35 live.
  for (const id of ['3087', '3488', '5673', '5790']) {
    const html = page(id);
    const job = qeExtractJobConfig(html);
    const posting = qeExtractJobPosting(html);

    assert.equal(job.posting_expiry_date, undefined, `job ${id}: iCIMS states no expiry`);
    // The posted-site object EXISTS on all 43 live pages, but it only carries a
    // validThrough on the 8 that state an expiry. Its presence is not an expiry.
    assert.ok(job.meta_data.icims.primary_posted_site_object, `job ${id}: posted-site object present`);
    assert.equal(job.meta_data.icims.primary_posted_site_object.validThrough, undefined,
      `job ${id}: the posted-site object states no validThrough either`);

    const vt = Date.parse(posting.validThrough);
    const created = Date.parse(qeParseInstant(job.create_date));
    assert.equal(vt - created, 365 * 24 * 3600 * 1000,
      `job ${id}: validThrough is exactly create_date + 365d — it is generated, not stated`);
  }
});

test('THE EXPIRY TRAP: jobs 3087 and 3488 look expired to a schema.org reader and are NOT marked expired', () => {
  for (const id of ['3087', '3488']) {
    const posting = qeExtractJobPosting(page(id));
    // Ground truth: the page's own validThrough is in the past at NOW.
    assert.ok(Date.parse(posting.validThrough) < Date.parse(NOW),
      `job ${id}: ld+json validThrough ${posting.validThrough} is already past`);

    const r = parseQatarEnergyJob(page(id), { now: NOW });
    assert.equal(r.expires_at, null, `job ${id}: no expiry is claimed`);
    assert.equal(r.is_active, true, `job ${id}: a live QatarEnergy vacancy is NOT deleted`);
    assert.equal(r._closure.state, 'open');
    assert.match(r.extra_fields.expiry_note, /generated from create_date \+ 365 days/);
  }
});

test('a STATED expiry is used exactly, and closes the job once it passes', () => {
  // Job 5731 states 2026-08-09T21:00:00+0000. Same real page, two instants.
  const before = parseQatarEnergyJob(page('5731'), { now: '2026-08-09T20:59:59Z' });
  assert.equal(before.expires_at, '2026-08-09T21:00:00.000Z');
  assert.equal(before.is_active, true);
  assert.equal(before._closure.state, 'open');

  const atTheSecond = parseQatarEnergyJob(page('5731'), { now: '2026-08-09T21:00:00Z' });
  assert.equal(atTheSecond.is_active, false, 'expiry is inclusive — at the stated instant it is closed');

  const after = parseQatarEnergyJob(page('5731'), { now: '2026-08-10T00:00:00Z' });
  assert.equal(after.is_active, false, 'THE EXPIRED CASE: it must stop showing');
  assert.equal(after._closure.state, 'expired');
  assert.equal(after._closure.reason, 'the source states an expiry date that has passed');
});

test('the same past instant does NOT close a job whose expiry was never stated', () => {
  // 3087's generated validThrough (2026-04-14) is long past by 2026-08-10.
  const r = parseQatarEnergyJob(page('3087'), { now: '2026-08-10T00:00:00Z' });
  assert.equal(r.is_active, true);
  assert.equal(r.expires_at, null);
});

test('qeStatedExpiry prefers nothing over a guess', () => {
  assert.deepEqual(qeStatedExpiry(null, { validThrough: '2026-01-01T00:00:00Z' }).expiresAt, null);
  assert.equal(qeStatedExpiry(null, null).source, 'none');

  // both iCIMS fields present and agreeing -> used
  const agree = qeStatedExpiry({
    posting_expiry_date: '2026-09-04T21:00:00+0000',
    meta_data: { icims: { primary_posted_site_object: { validThrough: '2026-09-04T21:00:00+0000' } } },
  }, { validThrough: '2026-09-04T21:00:00+0000' });
  assert.equal(agree.expiresAt, '2026-09-04T21:00:00.000Z');

  // disagreeing -> refused, not arbitrated
  const clash = qeStatedExpiry({
    posting_expiry_date: '2026-09-04T21:00:00+0000',
    meta_data: { icims: { primary_posted_site_object: { validThrough: '2027-01-01T00:00:00Z' } } },
  }, null);
  assert.equal(clash.expiresAt, null);
  assert.equal(clash.source, 'conflict');
});

// ===========================================================================
// FIELDS NOBODY STATES
// ===========================================================================
test('7/7 pages: the fields no source states stay NULL', () => {
  for (const g of GROUND_TRUTH) {
    const html = page(g.id);
    const posting = qeExtractJobPosting(html);

    // ground truth: the page really does say "UNAVAILABLE"
    assert.equal(posting.employmentType, 'UNAVAILABLE', `job ${g.id}`);
    assert.equal(posting.industry, 'UNAVAILABLE', `job ${g.id}`);

    const r = parseQatarEnergyJob(html, { now: NOW });
    assert.equal(r.employment_type, null, `job ${g.id} employment_type`);
    assert.equal(r.industries, null, `job ${g.id} industries`);
    assert.equal(r.seniority_level, null, `job ${g.id} seniority_level`);
    assert.equal(r.job_function, null, `job ${g.id} job_function`);
    assert.equal(r.is_remote, null, `job ${g.id} is_remote`);
    assert.equal(r.workplace_type, null, `job ${g.id} workplace_type`);
    assert.equal(r.applicant_count, null, `job ${g.id} applicant_count`);
    assert.equal(r.company_id, null, `job ${g.id} company_id`);
  }
});

test('"SR. CAMP SERVICES SUPERVISOR" does not become seniority_level "Senior"', () => {
  const r = parseQatarEnergyJob(page('5673'), { now: NOW });
  assert.equal(r.title, 'SR. CAMP SERVICES SUPERVISOR');
  assert.equal(r.seniority_level, null);
});

test('the stated category is kept verbatim and is NOT poured into job_function', () => {
  const r = parseQatarEnergyJob(page('5731'), { now: NOW });
  assert.deepEqual(r.extra_fields.category, ['Project Engineering']);
  assert.equal(r.job_function, null);
  assert.equal(r.industries, null, 'nor into industries');
});

test('"UNAVAILABLE" and empty strings never become values', () => {
  const html = page('5731');
  const job = qeExtractJobConfig(html);
  assert.equal(job.department, '', 'ground truth: department is an empty string');
  assert.deepEqual(job.benefits, [], 'ground truth: benefits is an empty array');

  const r = parseQatarEnergyJob(html, { now: NOW });
  assert.equal(r.extra_fields.department, undefined);
  assert.equal(r.extra_fields.benefits, undefined);
  // addressRegion / postalCode are the literal "UNAVAILABLE" on this page
  const addr = qeExtractJobPosting(html).jobLocation.address;
  assert.equal(addr.addressRegion, 'UNAVAILABLE');
  assert.equal(addr.postalCode, 'UNAVAILABLE');
  assert.equal(r.extra_fields.postal_code, undefined);
});

// ===========================================================================
// EXTRACTION HAZARDS
// ===========================================================================
test('the full 466 KB untouched page parses — and the SECOND copy of the job data is not read', () => {
  const html = page('5731');
  assert.ok(html.length > 400_000, 'this fixture is the whole page');
  // The page assigns window.jobDescriptionTemplates as well, carrying another
  // copy of posted_date/posting_expiry_date. A key-search parser reads that one.
  assert.ok(html.includes('window.jobDescriptionTemplates'));
  assert.ok(html.split('"posted_date"').length - 1 >= 2, 'posted_date appears more than once');

  const job = qeExtractJobConfig(html);
  assert.equal(job.slug, '5731');
  assert.equal(job.posted_date, '2026-08-06T06:53:00+0000');
  assert.equal(job.posting_expiry_date, '2026-08-09T21:00:00+0000');
});

test('braces and quotes inside a job description do not truncate the payload', () => {
  // 3488's description is long HTML; if brace matching were naive the JSON would
  // fail to parse and the config would come back null.
  const job = qeExtractJobConfig(page('3488'));
  assert.ok(job.description.length > 500);
  assert.equal(job.title, 'FRESH QATARI GRADUATES');
});

test('a page with no job payload yields null, never a half-record', () => {
  assert.equal(parseQatarEnergyJob(page('404')), null);
  assert.equal(parseQatarEnergyJob(''), null);
  assert.equal(parseQatarEnergyJob(null), null);
  assert.equal(parseQatarEnergyJob('<html><body>maintenance</body></html>'), null);
});

test('"no longer available" appears on EVERY page, open ones included — so it is not a signal', () => {
  // Those strings live in the i18n JavaScript bundle that ships with every page.
  // Live counts: 23 occurrences on the 404 body, 21 on the open job 5731.
  // A text search for them would close the whole portal.
  assert.ok(page('404').includes('no longer'));
  assert.ok(page('5731').includes('no longer'), 'an OPEN job page contains it too');
  const open = parseQatarEnergyJob(page('5731'), { now: NOW });
  assert.equal(open.is_active, true);
});

test('the JobPosting block is selected by @type, not by position', () => {
  const wrapped =
    '<script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[]}</script>' +
    '<script type="application/ld+json">{"@type":"JobPosting","title":"REAL ONE"}</script>';
  assert.equal(qeExtractJobPosting(wrapped).title, 'REAL ONE');

  const graph = '<script type="application/ld+json">' +
    '{"@graph":[{"@type":"Organization"},{"@type":["JobPosting"],"title":"IN A GRAPH"}]}</script>';
  assert.equal(qeExtractJobPosting(graph).title, 'IN A GRAPH');

  assert.equal(qeExtractJobPosting('<script type="application/ld+json">not json</script>'), null);
});

// ===========================================================================
// DATES
// ===========================================================================
test('qeParseInstant accepts what the source publishes and refuses the rest', () => {
  assert.equal(qeParseInstant('2026-08-06T06:53:00+0000'), '2026-08-06T06:53:00.000Z');
  assert.equal(qeParseInstant('2027-08-05T10:31:45.000Z'), '2027-08-05T10:31:45.000Z');
  assert.equal(qeParseInstant('2026-08-06T23:37:32.792+00:00'), '2026-08-06T23:37:32.792Z');
  assert.equal(qeParseInstant('2026-08-06T09:53:00+0300'), '2026-08-06T06:53:00.000Z');

  // No zone means the zone would be a guess.
  assert.equal(qeParseInstant('2026-08-06T06:53:00'), null);
  assert.equal(qeParseInstant('2026-08-06'), null);
  assert.equal(qeParseInstant('Immediately'), null);
  assert.equal(qeParseInstant(''), null);
  assert.equal(qeParseInstant(null), null);
  assert.equal(qeParseInstant(1_700_000_000), null);
});

// ===========================================================================
// SITEMAP
// ===========================================================================
test('the real sitemap index resolves to its one child', () => {
  const idx = parseQatarEnergySitemapIndex(fx('qe_sitemap_index.xml'));
  assert.deepEqual(idx, [{
    loc: 'https://careerportal.qatarenergy.qa/sitemap1.xml',
    lastmod: '2026-08-06T23:37:32.792+00:00',
  }]);
});

test('the real job sitemap yields 250 unique job URLs with their lastmod', () => {
  const jobs = parseQatarEnergyJobSitemap(fx('qe_sitemap_jobs.xml'));
  assert.equal(jobs.length, 250);
  assert.deepEqual(jobs[0], {
    url: 'https://careerportal.qatarenergy.qa/jobs/5731?lang=en-us',
    id: '5731',
    lastmod: '2026-08-06T09:08:48.919+00:00',
  });
  assert.equal(new Set(jobs.map((j) => j.id)).size, 250, 'ids are unique');
  assert.ok(jobs.every((j) => /^\d+$/.test(j.id)));
});

test('the two sitemap parsers do not read each other\'s document', () => {
  assert.deepEqual(parseQatarEnergyJobSitemap(fx('qe_sitemap_index.xml')), []);
  assert.deepEqual(parseQatarEnergySitemapIndex(fx('qe_sitemap_jobs.xml')), []);
  assert.deepEqual(parseQatarEnergyJobSitemap(''), []);
  assert.deepEqual(parseQatarEnergySitemapIndex(null), []);
});

test('BEING IN THE SITEMAP IS NOT BEING OPEN', () => {
  // 3087 and 3488 are both in the real sitemap; 5731 is too but closes on 08-09.
  const ids = new Set(parseQatarEnergyJobSitemap(fx('qe_sitemap_jobs.xml')).map((j) => j.id));
  assert.ok(ids.has('3087') && ids.has('3488') && ids.has('5731'));

  const after = parseQatarEnergyJob(page('5731'), { now: '2026-08-10T00:00:00Z' });
  assert.equal(after.is_active, false, 'listed, and still closed');
});

test('qeIdFromUrl / qeJobUrl', () => {
  assert.equal(qeIdFromUrl('https://careerportal.qatarenergy.qa/jobs/5731?lang=en-us'), '5731');
  assert.equal(qeIdFromUrl('https://careerportal.qatarenergy.qa/jobs/5731'), '5731');
  assert.equal(qeIdFromUrl('https://careerportal.qatarenergy.qa/search?x=/jobs/abc'), null);
  assert.equal(qeIdFromUrl(null), null);
  assert.equal(qeJobUrl(5731), 'https://careerportal.qatarenergy.qa/jobs/5731?lang=en-us');
});

// ===========================================================================
// FETCHERS — offline, with an injected transport. No network in this suite.
// ===========================================================================
function stubFetch(routes) {
  const calls = [];
  const impl = async (url) => {
    calls.push({ url, at: Date.now() });
    const r = routes[url];
    if (!r) return { ok: false, status: 404, finalUrl: url, html: '', error: 'http_404' };
    return { ok: true, status: 200, finalUrl: url, html: r };
  };
  impl.calls = calls;
  return impl;
}

test('fetchQatarEnergyJob: a delisted posting answers 404 and is reported CLOSED', async () => {
  const fetchImpl = async (url) => ({ ok: false, status: 404, finalUrl: url, html: '', error: 'http_404' });
  const out = await fetchQatarEnergyJob(5730, { fetchImpl, delayMs: 0 });
  assert.equal(out.ok, false);
  assert.equal(out.status, 404);
  assert.equal(out.closed, true, 'a removed vacancy must stop showing');
  assert.match(out.reason, /gone from the career portal/);
  assert.equal(out.record, null);
});

test('fetchQatarEnergyJob: a transient failure is NOT treated as a closure', async () => {
  for (const status of [500, 502, 429, 0]) {
    const fetchImpl = async (url) => ({ ok: false, status, finalUrl: url, html: '', error: 'http_' + status });
    const out = await fetchQatarEnergyJob(5731, { fetchImpl, delayMs: 0 });
    assert.equal(out.closed, false, `HTTP ${status} must never delete a job`);
    assert.equal(out.reason, null);
  }
});

test('fetchQatarEnergyJob: 200 with no job payload is an error, not a closure', async () => {
  const fetchImpl = async (url) => ({ ok: true, status: 200, finalUrl: url, html: page('404') });
  const out = await fetchQatarEnergyJob(5731, { fetchImpl, delayMs: 0 });
  assert.equal(out.ok, false);
  assert.equal(out.closed, false);
  assert.equal(out.error, 'no_job_payload');
});

test('fetchQatarEnergyJob: a real page comes back as a record', async () => {
  const url = qeJobUrl(5731);
  const fetchImpl = stubFetch({ [url]: page('5731') });
  const out = await fetchQatarEnergyJob(5731, { fetchImpl, delayMs: 0, now: NOW });
  assert.equal(out.ok, true);
  assert.equal(out.closed, false);
  assert.equal(out.record.title, 'HEAD, QHSE');
  assert.equal(fetchImpl.calls[0].url, url);

  const late = await fetchQatarEnergyJob(5731, { fetchImpl, delayMs: 0, now: '2026-08-10T00:00:00Z' });
  assert.equal(late.closed, true);
  assert.match(late.reason, /expiry date that has passed/);
});

test('fetchQatarEnergySitemap follows the index and returns every listed job', async () => {
  const fetchImpl = stubFetch({
    'https://careerportal.qatarenergy.qa/sitemap.xml': fx('qe_sitemap_index.xml'),
    'https://careerportal.qatarenergy.qa/sitemap1.xml': fx('qe_sitemap_jobs.xml'),
  });
  const jobs = await fetchQatarEnergySitemap({ fetchImpl, delayMs: 0 });
  assert.equal(jobs.length, 250);
  assert.deepEqual(fetchImpl.calls.map((c) => c.url), [
    'https://careerportal.qatarenergy.qa/sitemap.xml',
    'https://careerportal.qatarenergy.qa/sitemap1.xml',
  ]);
});

test('the crawl-delay stated in robots.txt is honoured between requests', async () => {
  assert.equal(QE_CRAWL_DELAY_MS, 5000, 'robots.txt says crawl-delay: 5');

  // Exercised at 120 ms so the suite stays fast; the mechanism is the same one
  // the 5000 ms default drives.
  const url = qeJobUrl(5731);
  const fetchImpl = stubFetch({ [url]: page('5731') });
  const t0 = Date.now();
  await Promise.all([
    fetchQatarEnergyJob(5731, { fetchImpl, delayMs: 120, now: NOW }),
    fetchQatarEnergyJob(5731, { fetchImpl, delayMs: 120, now: NOW }),
    fetchQatarEnergyJob(5731, { fetchImpl, delayMs: 120, now: NOW }),
  ]);
  assert.equal(fetchImpl.calls.length, 3);
  const gaps = [
    fetchImpl.calls[1].at - fetchImpl.calls[0].at,
    fetchImpl.calls[2].at - fetchImpl.calls[1].at,
  ];
  for (const g of gaps) assert.ok(g >= 115, `requests were ${g} ms apart, expected >= 120`);
  assert.ok(Date.now() - t0 >= 230);
});
