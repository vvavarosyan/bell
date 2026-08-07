// Oracle Recruiting Cloud job-board parser tests.
// ---------------------------------------------------------------------------
// Every fixture is a VERBATIM live capture taken 2026-08-07:
//   oracle_ejqa_list.json          ejqa.fa.em2  (Milaha)      12 requisitions
//   oracle_elus_list.json          elus.fa.em2  (QTerminals)   1 requisition,
//                                  posted 2022-06-05 — four years stale
//   oracle_ten_list_p0.json        hcxg.fa.em2  (Technip Energies) page 0 of
//                                  176, multi-country, non-empty flexFields
//   oracle_ejqa_detail_2501.json   detail for a LIVE requisition
//   oracle_ejqa_detail_2400_gone.json  detail for a WITHDRAWN requisition
//   oracle_ejqa_noexpand.json      the &expand=-dropped trap: HTTP 200,
//                                  TotalJobsCount 12, no requisitionList key
//
// Run:  node --test server/tests/jobs_oracle.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  parseOracleJobs,
  parseOracleJobDetail,
  normalizeTenantHost,
  buildJobUrl,
  ORACLE_API_VERSION,
  ORACLE_EXPAND,
} from '../jobs/sources/oracle_cloud.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (name) => JSON.parse(readFileSync(join(here, 'fixtures', name), 'utf8'));

const ejqa      = fx('oracle_ejqa_list.json');
const elus      = fx('oracle_elus_list.json');
const ten       = fx('oracle_ten_list_p0.json');
const detail    = fx('oracle_ejqa_detail_2501.json');
const detailGone= fx('oracle_ejqa_detail_2400_gone.json');
const noExpand  = fx('oracle_ejqa_noexpand.json');

// ===========================================================================
// Ground truth — read off the raw JSON by hand, then asserted field by field.
// ===========================================================================

test('ejqa: every requisition the payload states is parsed, none invented', () => {
  const out = parseOracleJobs(ejqa);
  assert.equal(out.total, 12);
  assert.equal(out.jobs.length, 12);
  assert.equal(out.rejected.length, 0);
  assert.equal(new Set(out.jobs.map((j) => j.external_id)).size, 12);
  // Exactly the ids in the raw payload, in published order.
  assert.deepEqual(out.jobs.map((j) => j.external_id), [
    '2501', '2472', '2415', '2485', '2431', '2412',
    '2474', '2475', '2480', '2257', '2459', '2239',
  ]);
});

test('ejqa: the top requisition matches the raw JSON verbatim', () => {
  const j = parseOracleJobs(ejqa).jobs[0];
  const raw = ejqa.items[0].requisitionList[0];

  assert.equal(j.external_id, '2501');
  assert.equal(j.title, 'Marine Superintendent');
  assert.equal(j.title, raw.Title);                 // verbatim, not reworded
  assert.equal(j.posted_at, '2026-08-04');
  assert.equal(j.posted_at, raw.PostedDate);
  assert.equal(j.posted_at_precision, 'date');      // a DATE, never a fake time
  assert.equal(j.location_text, 'Qatar');
  assert.equal(j.country_code, 'QA');
  assert.equal(j.workplace_type_stated, 'On-site');
  assert.equal(j.workplace_type_code, 'ORA_ON_SITE');
});

test('elus: a four-year-old posting is reported faithfully, not filtered or refreshed', () => {
  const out = parseOracleJobs(elus);
  assert.equal(out.total, 1);
  assert.equal(out.jobs.length, 1);
  const j = out.jobs[0];
  assert.equal(j.external_id, '7');
  assert.equal(j.title, 'Developee (Qatari Nationals Only)');
  assert.equal(j.posted_at, '2022-06-05');          // exactly as published
  assert.equal(j.posted_at_precision, 'date');
  // The reader states the date and stops. Nothing here claims the job is fresh.
  assert.equal(j.expires_at, null);
});

test('technip: a multi-country board keeps each stated country, page 0 of 176', () => {
  const out = parseOracleJobs(ten);
  assert.equal(out.total, 176);                     // whole board
  assert.equal(out.jobs.length, 25);                // this page
  assert.equal(out.limit, 25);
  assert.equal(out.offset, 0);

  const raw = ten.items[0].requisitionList;
  for (let i = 0; i < out.jobs.length; i++) {
    assert.equal(out.jobs[i].external_id, String(raw[i].Id));
    assert.equal(out.jobs[i].title, raw[i].Title);
    assert.equal(out.jobs[i].country_code, raw[i].PrimaryLocationCountry);
  }
  // Bell is a Qatar product; the country the source states is what makes
  // filtering possible. This board is genuinely not all-Qatar.
  const countries = new Set(out.jobs.map((j) => j.country_code));
  assert.ok(countries.size > 1, 'expected a multi-country board');
  assert.ok(countries.has('ES') || countries.has('FR') || countries.has('IN'));
});

// ===========================================================================
// RULE 2.1 — the fields nobody states must stay NULL, on every row.
// ===========================================================================

test('no salary is ever produced — the payload has no salary field at all', () => {
  for (const payload of [ejqa, elus, ten]) {
    for (const j of parseOracleJobs(payload).jobs) {
      assert.equal(j.salary_min, null);
      assert.equal(j.salary_max, null);
      assert.equal(j.salary_currency, null);
      assert.equal(j.salary_period, null);
    }
  }
});

test('seniority, job_function, industries and employment_type stay null on all 38 rows', () => {
  let n = 0;
  for (const payload of [ejqa, elus, ten]) {
    for (const j of parseOracleJobs(payload).jobs) {
      assert.equal(j.seniority_level, null, `${j.external_id} seniority`);
      assert.equal(j.job_function, null, `${j.external_id} job_function`);
      assert.equal(j.industries, null, `${j.external_id} industries`);
      assert.equal(j.employment_type, null, `${j.external_id} employment_type`);
      assert.equal(j.applicant_count, null);
      n++;
    }
  }
  assert.equal(n, 38);                              // 12 + 1 + 25
});

test('a title that reads "Senior ..." still yields no seniority — inferring it is a guess', () => {
  const senior = parseOracleJobs(ejqa).jobs.find((j) => /^Senior /.test(j.title));
  assert.ok(senior, 'fixture should contain a "Senior ..." title');
  assert.equal(senior.title, 'Senior Sales Executive');
  assert.equal(senior.seniority_level, null);
  assert.equal(senior.job_function, null);
});

test('employer is null on every row of every tenant — the host is the identity', () => {
  for (const payload of [ejqa, elus, ten]) {
    for (const j of parseOracleJobs(payload).jobs) {
      assert.equal(j.employer_stated, null, `${j.external_id} employer_stated`);
    }
  }
  // ...and it is null because the SOURCE says nothing, not because we dropped it.
  for (const r of ejqa.items[0].requisitionList) {
    assert.equal(r.LegalEmployer, null);
    assert.equal(r.Organization, null);
    assert.equal(r.BusinessUnit, null);
    assert.equal(r.Department, null);
  }
});

test('organizationsFacet is NOT used as an employer name', () => {
  // Milaha's facet reads "Ship Management", "Mechanical", "Legal" — internal
  // departments. On another tenant it happens to read a real company name,
  // which is exactly what would make the mistake look correct.
  const facetNames = ejqa.items[0].organizationsFacet.map((f) => f.Name);
  assert.ok(facetNames.includes('Ship Management'));
  for (const j of parseOracleJobs(ejqa).jobs) {
    assert.ok(!facetNames.includes(j.employer_stated));
    assert.equal(j.employer_stated, null);
  }
});

test('a blank WorkplaceType is absence, not a value', () => {
  const raw = ejqa.items[0].requisitionList.find((r) => r.WorkplaceType === '');
  assert.ok(raw, 'fixture should contain a blank WorkplaceType');
  const j = parseOracleJobs(ejqa).jobs.find((x) => x.external_id === String(raw.Id));
  assert.equal(j.workplace_type_stated, null);
  assert.equal(j.workplace_type_code, null);
});

test('placeholder literals like "UNAVAILABLE" and "N/A" are refused, not stored', () => {
  const payload = structuredClone(ejqa);
  const r = payload.items[0].requisitionList[0];
  r.WorkplaceType = 'UNAVAILABLE';
  r.PrimaryLocation = 'N/A';
  r.PrimaryLocationCountry = '  ';
  const j = parseOracleJobs(payload).jobs[0];
  assert.equal(j.workplace_type_stated, null);
  assert.equal(j.location_text, null);
  assert.equal(j.country_code, null);
});

test('a country code that is not two letters is refused rather than half-stored', () => {
  const payload = structuredClone(elus);
  payload.items[0].requisitionList[0].PrimaryLocationCountry = 'QAT';
  assert.equal(parseOracleJobs(payload).jobs[0].country_code, null);
});

test('a date without a real published shape is refused, never coerced', () => {
  const payload = structuredClone(elus);
  payload.items[0].requisitionList[0].PostedDate = 'Recently';
  const j = parseOracleJobs(payload).jobs[0];
  assert.equal(j.posted_at, null);
  assert.equal(j.posted_at_precision, null);
});

test('a requisition title is kept verbatim even when it carries the internal req number', () => {
  // Qatar Foundation publishes titles like "100000006738.Projects & Corporate
  // Excellence Specialist". Cleaning that up would be an edit of stated data;
  // it is a display decision, not a parser decision.
  const payload = structuredClone(elus);
  payload.items[0].requisitionList[0].Title = '100000006738.Projects Specialist';
  assert.equal(parseOracleJobs(payload).jobs[0].title, '100000006738.Projects Specialist');
});

// ===========================================================================
// THE &expand= TRAP — HTTP 200 that ingests nothing must be an ERROR.
// ===========================================================================

test('the real no-expand payload throws instead of reporting an empty board', () => {
  // Captured live: HTTP 200, TotalJobsCount 12, requisitionList key ABSENT.
  assert.equal(noExpand.items[0].TotalJobsCount, 12);
  assert.equal('requisitionList' in noExpand.items[0], false);
  assert.throws(() => parseOracleJobs(noExpand), /expand/i);
});

test('total > 0 with zero rows on the FIRST page is an error, not an empty board', () => {
  const payload = structuredClone(ejqa);
  payload.items[0].requisitionList = [];
  assert.throws(() => parseOracleJobs(payload), /never as an empty board/i);
});

test('an empty page PAST the end is normal termination, not an error', () => {
  // Proven live: offset 200 on a 176-job board returns rows 0, total 176.
  const payload = structuredClone(ejqa);
  payload.items[0].requisitionList = [];
  payload.items[0].Offset = 25;
  const out = parseOracleJobs(payload);
  assert.equal(out.jobs.length, 0);
  assert.equal(out.total, 12);
  assert.equal(out.offset, 25);
});

test('a genuinely empty board (total 0, list []) parses cleanly', () => {
  const payload = structuredClone(ejqa);
  payload.items[0].TotalJobsCount = 0;
  payload.items[0].requisitionList = [];
  const out = parseOracleJobs(payload);
  assert.equal(out.total, 0);
  assert.equal(out.jobs.length, 0);
});

test('a reshaped payload fails loudly rather than returning zero jobs', () => {
  assert.throws(() => parseOracleJobs(null), /not an object/);
  assert.throws(() => parseOracleJobs({}), /items/);
  assert.throws(() => parseOracleJobs({ items: [] }), /empty/);
  assert.throws(() => parseOracleJobs({ items: [{}] }), /TotalJobsCount/);
  assert.throws(
    () => parseOracleJobs({ items: [{ TotalJobsCount: 3, requisitionList: 'nope' }] }),
    /not an array/,
  );
});

test('rows missing an id or a title are skipped and counted, never invented', () => {
  const payload = structuredClone(ejqa);
  payload.items[0].requisitionList.push({ Id: null, Title: 'Ghost' });
  payload.items[0].requisitionList.push({ Id: '9999', Title: '   ' });
  const out = parseOracleJobs(payload);
  assert.equal(out.jobs.length, 12);
  assert.equal(out.rejected.length, 2);
  assert.deepEqual(out.rejected.map((r) => r.reason), ['no Id', 'no Title']);
});

// ===========================================================================
// CLOSURE — Val's hard requirement.
// ===========================================================================

test('a withdrawn requisition reports found:false — the closure signal', () => {
  // Live capture for Milaha req 2400: gone from the board, detail count 0.
  assert.equal(detailGone.count, 0);
  assert.deepEqual(detailGone.items, []);
  const out = parseOracleJobDetail(detailGone);
  assert.equal(out.found, false);
  assert.equal(out.job, null);
});

test('a live requisition reports found:true with its stated expiry', () => {
  const out = parseOracleJobDetail(detail);
  assert.equal(out.found, true);
  assert.equal(out.job.external_id, '2501');
  assert.equal(out.job.title, 'Marine Superintendent');
  // The detail endpoint states a real instant WITH an offset — unlike the list,
  // which states only a date.
  assert.equal(detail.items[0].ExternalPostedStartDate, '2026-08-04T12:24:29+00:00');
  assert.equal(out.job.posted_at, '2026-08-04T12:24:29.000Z');
  assert.equal(out.job.posted_at_precision, 'instant');
  assert.equal(detail.items[0].ExternalPostedEndDate, '2026-08-14T21:00:00+00:00');
  assert.equal(out.job.expires_at, '2026-08-14T21:00:00.000Z');
});

test('a missing expiry stays null — an absent end date is not an open-ended claim', () => {
  const payload = structuredClone(detail);
  payload.items[0].ExternalPostedEndDate = null;
  assert.equal(parseOracleJobDetail(payload).job.expires_at, null);
});

test('an instant with no timezone is refused rather than assumed UTC', () => {
  const payload = structuredClone(detail);
  payload.items[0].ExternalPostedEndDate = '2026-08-14T21:00:00';
  assert.equal(parseOracleJobDetail(payload).job.expires_at, null);
});

test('RequisitionType is carried verbatim and never mapped to employment_type', () => {
  const out = parseOracleJobDetail(detail).job;
  assert.equal(out.requisition_type_stated, 'Full Time Employee (FTE)');
  assert.equal(out.schedule_stated, 'Full time');
  // Three tenants publish "Full Time Employee (FTE)", "Professional" and
  // "Permanent" in this one field — three vocabularies, not one taxonomy.
  assert.equal(out.employment_type, null);
  for (const v of ['Professional', 'Permanent']) {
    const p = structuredClone(detail);
    p.items[0].RequisitionType = v;
    const j = parseOracleJobDetail(p).job;
    assert.equal(j.requisition_type_stated, v);
    assert.equal(j.employment_type, null);
  }
});

test('detail refuses salary/seniority/function/industries just as the list does', () => {
  const j = parseOracleJobDetail(detail).job;
  for (const k of ['salary_min', 'salary_max', 'salary_currency', 'salary_period',
                   'seniority_level', 'job_function', 'industries',
                   'employment_type', 'applicant_count']) {
    assert.equal(j[k], null, k);
  }
});

test('description and responsibilities are captured verbatim, never truncated', () => {
  const j = parseOracleJobDetail(detail).job;
  assert.equal(j.description, detail.items[0].ExternalDescriptionStr.trim());
  assert.equal(j.responsibilities, detail.items[0].ExternalResponsibilitiesStr.trim());
  assert.ok(j.description.length > 500);
});

test('coordinates only when both numbers are real', () => {
  assert.deepEqual(parseOracleJobDetail(detail).job.coordinates,
    { lat: 25.29604, lng: 51.15999 });

  for (const bad of [[], [{ Latitude: '', Longitude: '' }],
                     [{ Latitude: '0', Longitude: '0' }],
                     [{ Latitude: '999', Longitude: '5' }]]) {
    const p = structuredClone(detail);
    p.items[0].primaryLocationCoordinates = bad;
    assert.equal(parseOracleJobDetail(p).job.coordinates, null);
  }
});

// ===========================================================================
// Host handling + constructed URL
// ===========================================================================

test('both live tenant host shapes are accepted; anything else is refused', () => {
  assert.equal(normalizeTenantHost('ejqa.fa.em2'), 'ejqa.fa.em2.oraclecloud.com');
  assert.equal(normalizeTenantHost('ejqa.fa.em2.oraclecloud.com'), 'ejqa.fa.em2.oraclecloud.com');
  assert.equal(normalizeTenantHost('https://ejqa.fa.em2.oraclecloud.com/hcmUI/x'),
    'ejqa.fa.em2.oraclecloud.com');
  // Qatar Steel / Qatar Foundation use this second, longer shape.
  assert.equal(normalizeTenantHost('fa-ewab-saasfaprod1.fa.ocs.oraclecloud.com'),
    'fa-ewab-saasfaprod1.fa.ocs.oraclecloud.com');
  // A complete hostname elsewhere must be REFUSED, never silently rewritten
  // into "evil.example.com.oraclecloud.com".
  assert.throws(() => normalizeTenantHost('evil.example.com'), /refusing/);
  assert.throws(() => normalizeTenantHost('oraclecloud.com.attacker.net'), /refusing/);
  assert.throws(() => normalizeTenantHost('evil.com@ejqa.fa.em2.oraclecloud.com'), /malformed/);
  assert.throws(() => normalizeTenantHost('ejqa.fa.em2.oraclecloud.com:8080'), /malformed/);
  assert.throws(() => normalizeTenantHost(''), /required/);
});

test('url is only built when the caller supplies the host — it is constructed, not stated', () => {
  assert.equal(parseOracleJobs(ejqa).jobs[0].url, null);
  const withHost = parseOracleJobs(ejqa, { tenantHost: 'ejqa.fa.em2', siteNumber: 'CX_1' });
  assert.equal(withHost.jobs[0].url,
    'https://ejqa.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1/job/2501');
  assert.equal(buildJobUrl('elus.fa.em2', 'CX_1001', '7'),
    'https://elus.fa.em2.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/7');
});

test('the API version stays pinned — 11.13.18.04 is a live HTTP 400', () => {
  assert.equal(ORACLE_API_VERSION, '11.13.18.05');
  assert.equal(ORACLE_EXPAND, 'requisitionList.secondaryLocations,flexFieldsFacet.values');
});
