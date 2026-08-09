// Qatar Living Jobs parser — proven against VERBATIM live captures of
// 2026-08-07 (Qatar morning). Nothing in these fixtures was edited.
//
//   ql_jobs_list_p1.html                  GET /en/jobs/jobs/list          (page 1 of 19)
//   ql_job_electronics_elv_technician.html GET /en/jobs/jobs/profile/electronics-elv-technician
//   ql_job_direct_sales_agent_1.html       GET /en/jobs/jobs/profile/direct-sales-agent-1
//   ql_job_fomv_splicer.html               GET /en/jobs/jobs/profile/fomv-splicer
//   ql_job_nanny_33_personal.html          GET /en/jobs/jobs/profile/nanny-33
//
// LIVE MEASUREMENT that day: the site's own pagination block said
// totalItems 228 / totalPages 19 / itemsPerPage 12, and a full 19-page crawl
// returned exactly 228 distinct vacancies from 69 named employers. Every one
// of the 228 carried status "active", is_published true, is_deleted false,
// is_drafted false, moderation_status "approved".
//
// Run:  node --test server/tests/jobs_qatarliving.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  unflight,
  qlListRecordToJob,
  parseQatarLivingList,
  parseQatarLivingListPagination,
  parseQatarLivingJob,
  mergeQatarLivingJob,
  fetchQatarLivingJobs,
  closedExternalIds,
  salaryFromJsonLd,
  statedString,
  statedPositiveNumber,
  remoteFromArrangement,
  employerFromRecord,
  activeFromListRecord,
  assertAllowedPath,
  qlHtmlToText,
  QL_SOURCE,
} from '../jobs/sources/qatarliving.js';

const here = dirname(fileURLToPath(import.meta.url));
const fx = (n) => readFileSync(join(here, 'fixtures', n), 'utf8');

const LIST_P1 = fx('ql_jobs_list_p1.html');
const JOB_ELV = fx('ql_job_electronics_elv_technician.html');
const JOB_DSA = fx('ql_job_direct_sales_agent_1.html');
const JOB_FOMV = fx('ql_job_fomv_splicer.html');
const JOB_NANNY = fx('ql_job_nanny_33_personal.html');

const listJobs = parseQatarLivingList(LIST_P1);
const bySlug = new Map(listJobs.map((j) => [j.extra_fields.ql_slug, j]));

/* ── 1. the list page: every vacancy, nothing invented ─────────────────── */

test('list page 1 yields all 12 server-rendered vacancies, in page order', () => {
  assert.equal(listJobs.length, 12);
  assert.deepEqual(listJobs.map((j) => j.extra_fields.ql_slug), [
    'electronics-elv-technician',
    'structural-cabling-it-communication',
    'control-room-operator-bms-operator-1',
    'electronics-elv-supervisor',
    'f-b-supervisor-malaysia',
    'autocad-designer-1',
    'kitchen-appliance-technician',
    'bms-technician',
    'multi-skilled-electrician',
    'social-media-specialist',
    'engineering-supervisor',
    'mechanical-commissioning-engineer',
  ]);
});

test("the site's own pagination is read verbatim (228 vacancies / 19 pages)", () => {
  assert.deepEqual(parseQatarLivingListPagination(LIST_P1), {
    totalItems: 228, totalPages: 19, currentPage: 1, itemsPerPage: 12, hasNextPage: true,
  });
});

test('12/12 name a real employer — the field Bell needs to attach the job', () => {
  assert.deepEqual(listJobs.map((j) => j.extra_fields.employer_name), [
    'Trilogistics WLL',
    'Trilogistics WLL',
    'Trilogistics WLL',
    'Trilogistics WLL',
    'C2HR GLOBAL LLC Qatar',
    'Sector Steel Doha',
    'Trilogistics WLL',
    'Trilogistics WLL',
    'Trilogistics WLL',
    'Laseta Designs',
    'Trilogistics WLL',
    'Madre Integrated Engineering',
  ]);
  assert.ok(listJobs.every((j) => !j.extra_fields.employer_refused_reason));
});

test('12/12 state a real ISO posting instant — not "3 days ago"', () => {
  const iso = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
  assert.ok(listJobs.every((j) => iso.test(j.posted_at)));
  assert.equal(bySlug.get('electronics-elv-technician').posted_at, '2026-06-29T08:08:48.018Z');
  assert.equal(bySlug.get('social-media-specialist').posted_at, '2026-08-04T20:52:03.996Z');
  assert.equal(bySlug.get('mechanical-commissioning-engineer').posted_at, '2026-08-02T08:29:44.593Z');
});

test('a whole record maps field-for-field to what the page states', () => {
  const j = bySlug.get('electronics-elv-technician');
  assert.equal(j.source, QL_SOURCE);
  assert.equal(j.source_url, 'https://www.qatarliving.com/en/jobs/jobs/profile/electronics-elv-technician');
  assert.equal(j.external_id, '2713d50b-6b7a-4dcc-938c-e66bbe74756d');
  assert.equal(j.title, 'Electronics / ELV Technician');
  assert.equal(j.location_text, 'Doha, Qatar');
  assert.equal(j.workplace_type, 'On-Site');
  assert.equal(j.is_remote, false);
  assert.equal(j.employment_type, 'Contract');
  assert.equal(j.seniority_level, 'Mid Level');
  assert.equal(j.job_function, 'Engineering');
  assert.equal(j.applicant_count, 28);
  assert.equal(j.is_active, true);
  assert.equal(j.company_id, null); // the parser never resolves the employer
  assert.equal(j.extra_fields.posting_as, 'company');
  assert.equal(j.extra_fields.number_of_hires, 1);
  assert.equal(j.extra_fields.minimum_education, 'Diploma');
  assert.equal(j.extra_fields.years_of_experience, '5–7 Years');
  assert.equal(j.extra_fields.visa_status, 'Qatar Company Visa (With NOC)');
});

test('the description keeps the published wording, entities decoded', () => {
  const j = bySlug.get('electronics-elv-technician');
  assert.equal(
    j.description,
    '2 years Industrial training institutes (ITI) certificate in Electronics / ELV or equivalent from respective country.\n\n'
    + '3 years experience in operation and maintenance.\n\n'
    + '5 Years total & 3 years O&M works in a major Hospital & Hands on trade expertise.',
  );
  assert.ok(!/&nbsp;|&amp;|<p>/.test(j.description));
});

/* ── 2. the traps ──────────────────────────────────────────────────────── */

test('TRAP: validThrough is datePosted + exactly 30 days — never expires_at', () => {
  // Measured on 11/11 live listings. Two of them are in these fixtures.
  for (const [html, posted, valid] of [
    [JOB_ELV, '2026-06-29T08:08:48.018Z', '2026-07-29T08:08:48.018Z'],
    [JOB_DSA, '2026-07-20T13:44:36.145Z', '2026-08-19T13:44:36.145Z'],
    [JOB_FOMV, '2026-05-13T06:14:46.446Z', '2026-06-12T06:14:46.446Z'],
    [JOB_NANNY, '2026-08-02T15:29:01.682Z', '2026-09-01T15:29:01.682Z'],
  ]) {
    const j = parseQatarLivingJob(html);
    assert.equal(j.posted_at, posted);
    assert.equal(j.extra_fields.ld_valid_through, valid);
    assert.equal(Date.parse(valid) - Date.parse(posted), 30 * 24 * 3600 * 1000);
    assert.equal(j.expires_at, null, 'validThrough must never become expires_at');
  }
});

test('expires_at comes only from the stated job_expiry_date', () => {
  // 1 of the 12 on page 1 states one; the other 11 leave it null and Bell
  // claims nothing, even though all 12 carry a validThrough.
  const stated = listJobs.filter((j) => j.expires_at);
  assert.equal(stated.length, 1);
  assert.equal(stated[0].extra_fields.ql_slug, 'social-media-specialist');
  assert.equal(stated[0].expires_at, '2026-09-03T20:56:42.030Z');
  assert.equal(listJobs.filter((j) => j.expires_at == null).length, 11);
});

test('TRAP: a personal-hirer ad names "Qatar Living Jobs" and is refused', () => {
  const j = parseQatarLivingJob(JOB_NANNY);
  assert.equal(j.title, 'Nanny');
  assert.equal(j.extra_fields.employer_name, undefined);
  assert.equal(j.extra_fields.employer_refused_reason, 'job_type "personal" — not a company vacancy');
  // and the JSON-LD placeholder is caught on its own too
  assert.deepEqual(employerFromRecord({ company_name: 'Qatar Living Jobs' }), {
    name: null, slug: null, refusal: '"Qatar Living Jobs" is the site\'s own placeholder, not an employer',
  });
  // an individual hirer is refused whatever the ad calls itself
  assert.deepEqual(employerFromRecord({
    job_type: 'corporate', company_name: 'A Family in Lusail', personal_hirer_id: 'd098b391-74da-4168-a3e9-0745eb56d9a3',
  }), { name: null, slug: null, refusal: 'personal_hirer_id set — an individual, not a company' });
});

test('the placeholder guard must not swallow the real "Qatar Living" employer', () => {
  // Live, 2026-08-07: Qatar Living the COMPANY (company_id 2c286303-…,
  // info@qatarliving.com) is itself hiring a Sales Executive — 617 applicants.
  // Only the JSON-LD stand-in "Qatar Living Jobs" is a placeholder.
  assert.deepEqual(employerFromRecord({
    job_type: 'corporate', posting_as: 'company', personal_hirer_id: '',
    company_id: '2c286303-f44b-460d-8151-0e0647856c98', company_name: 'Qatar Living',
  }), { name: 'Qatar Living', slug: null, refusal: null });
});

test('TRAP: salary only from JSON-LD baseSalary, which alone states a currency', () => {
  // Stated in full: QAR 3500–4000 per MONTH.
  const dsa = parseQatarLivingJob(JOB_DSA);
  assert.equal(dsa.salary_min, 3500);
  assert.equal(dsa.salary_max, 4000);
  assert.equal(dsa.salary_currency, 'QAR');
  assert.equal(dsa.salary_period, 'month');

  // Same site, same job id: the LIST states 3400/3500 with no currency and no
  // period anywhere, and the job page states no baseSalary at all. Bell writes
  // no salary, and says why.
  const listElv = bySlug.get('electronics-elv-technician');
  assert.equal(listElv.extra_fields.list_salary_min_no_currency_stated, 3400);
  assert.equal(listElv.extra_fields.list_salary_max_no_currency_stated, 3500);
  assert.equal(listElv.salary_min, null);
  assert.equal(listElv.salary_max, null);
  assert.equal(listElv.salary_currency, null);
  assert.match(listElv.extra_fields.salary_refused_reason, /no currency and no period/);

  const detailElv = parseQatarLivingJob(JOB_ELV);
  assert.equal(detailElv.salary_min, null);
  assert.equal(detailElv.salary_currency, null);
});

test('TRAP: the QatarEnergy zero-dollar shape is refused, loudly', () => {
  const r = salaryFromJsonLd({
    baseSalary: {
      '@type': 'MonetaryAmount', currency: 'USD',
      value: { '@type': 'QuantitativeValue', value: 0, minValue: 0, maxValue: 0, unitText: 'YEAR' },
    },
  });
  assert.equal(r.salary_min, null);
  assert.equal(r.salary_max, null);
  assert.equal(r.salary_currency, null);
  assert.equal(r.refusal, 'baseSalary stated no non-zero figure');
});

test('TRAP: an unknown salary period fails loudly instead of defaulting', () => {
  const r = salaryFromJsonLd({
    baseSalary: { currency: 'QAR', value: { minValue: 100, maxValue: 200, unitText: 'FORTNIGHT' } },
  });
  assert.equal(r.salary_period, null);
  assert.equal(r.salary_min, null);
  assert.match(r.refusal, /unitText not recognised/);
  // and a figure with no currency is equally refused
  const r2 = salaryFromJsonLd({ baseSalary: { value: { minValue: 100, maxValue: 200, unitText: 'MONTH' } } });
  assert.equal(r2.salary_min, null);
  assert.match(r2.refusal, /no usable currency/);
});

test('TRAP: an empty string is absent, not a value', () => {
  assert.equal(statedString(''), null);
  assert.equal(statedString('   '), null);
  assert.equal(statedString('UNAVAILABLE'), null);
  assert.equal(statedString('N/A'), null);
  assert.equal(statedString('null'), null);
  assert.equal(statedString('Full-Time'), 'Full-Time');
  // Live proof: a job page that leaves the seniority unanswered.
  const nanny = parseQatarLivingJob(JOB_NANNY);
  assert.equal(nanny.seniority_level, null);
  assert.equal(nanny.workplace_type, null);
  assert.equal(nanny.is_remote, null); // unstated is not "on-site"
});

test('TRAP: industries is the per-job selection, provably not the employer\'s', () => {
  // Madre Integrated Engineering, one employer, two vacancies, two different
  // stated industries that follow the JOB, not the company.
  assert.deepEqual(parseQatarLivingJob(JOB_FOMV).industries, ['Oil & Gas / Energy']);
  assert.equal(parseQatarLivingJob(JOB_FOMV).extra_fields.employer_name, 'Madre Integrated Engineering');
  assert.deepEqual(bySlug.get('mechanical-commissioning-engineer').industries, ['Oil & Gas / Energy']);
  assert.equal(bySlug.get('mechanical-commissioning-engineer').extra_fields.employer_name, 'Madre Integrated Engineering');
  // Trilogistics WLL likewise varies per vacancy.
  assert.deepEqual(bySlug.get('electronics-elv-technician').industries, ['Recruitment & HR Services']);
  assert.deepEqual(bySlug.get('bms-technician').industries, ['Healthcare & Medical']);
  assert.deepEqual(bySlug.get('control-room-operator-bms-operator-1').industries,
    ['Healthcare & Medical', 'Construction & Engineering']);
});

test('seniority and function are stated by Qatar Living, so they are kept verbatim', () => {
  assert.deepEqual(listJobs.map((j) => j.seniority_level), [
    'Mid Level', 'Senior Level', 'Senior Level', 'Senior Level', 'Mid Level', 'Senior Level',
    'Mid Level', 'Senior Level', 'Senior Level', 'Senior Level', 'Senior Level', 'Mid Level',
  ]);
  assert.equal(bySlug.get('social-media-specialist').job_function, 'Advertising & Marketing');
  assert.equal(bySlug.get('autocad-designer-1').job_function, 'Manufacturing & Production');
  // nothing is derived from the title: "Senior Level" is never inferred
  assert.equal(parseQatarLivingJob(JOB_NANNY).seniority_level, null);
});

/* ── 3. closure: a filled or withdrawn vacancy must stop showing ───────── */

test('the live list is the liveness oracle — 12/12 active on page 1', () => {
  assert.ok(listJobs.every((j) => j.is_active === true));
  assert.ok(listJobs.every((j) => j.extra_fields.ql_status === 'active'));
  assert.ok(listJobs.every((j) => j.extra_fields.ql_is_deleted === false));
  assert.ok(listJobs.every((j) => j.extra_fields.ql_moderation_status === 'approved'));
});

test('a job page on its own cannot claim liveness', () => {
  for (const html of [JOB_ELV, JOB_DSA, JOB_FOMV, JOB_NANNY]) {
    assert.equal(parseQatarLivingJob(html).is_active, null);
  }
});

test('every liveness flag must agree; a missing flag means unknown, not active', () => {
  const live = { status: 'active', is_published: true, is_deleted: false, is_drafted: false, moderation_status: 'approved' };
  assert.equal(activeFromListRecord(live), true);
  assert.equal(activeFromListRecord({ ...live, status: 'closed' }), false);
  assert.equal(activeFromListRecord({ ...live, is_deleted: true }), false);
  assert.equal(activeFromListRecord({ ...live, is_published: false }), false);
  assert.equal(activeFromListRecord({ ...live, is_drafted: true }), false);
  assert.equal(activeFromListRecord({ ...live, moderation_status: 'pending' }), false);
  assert.equal(activeFromListRecord({ ...live, moderation_status: undefined }), null);
  assert.equal(activeFromListRecord({ ...live, is_deleted: undefined }), null);
  assert.equal(activeFromListRecord(null), null);
});

test('anything Bell holds that is absent from a COMPLETE crawl is closed', () => {
  const crawl = { complete: true, liveExternalIds: ['a', 'b', 'c'] };
  assert.deepEqual(closedExternalIds(['a', 'b', 'z', 'y'], crawl), { closed: ['z', 'y'], refused: null });
  assert.deepEqual(closedExternalIds(['a', 'b'], crawl), { closed: [], refused: null });
});

test('a PARTIAL crawl closes nothing — it must never mass-deactivate', () => {
  const partial = { complete: false, liveExternalIds: ['a'] };
  const r = closedExternalIds(['a', 'b', 'c'], partial);
  assert.deepEqual(r.closed, []);
  assert.match(r.refused, /refusing to close any vacancy from a partial list/);
  assert.deepEqual(closedExternalIds(['a'], null).closed, []);
});

/* ── 4. the crawl: complete, polite, robots-bound ──────────────────────── */

test('fetchQatarLivingJobs walks the pages and only reports complete when it is', async () => {
  const seen = [];
  const res = await fetchQatarLivingJobs({
    delayMs: 0,
    fetchText: async (url) => {
      seen.push(url);
      return { ok: true, status: 200, html: LIST_P1, url };
    },
    maxPages: 3,
  });
  // page 1 of the real site says totalPages 19, so 3 pages is NOT complete
  assert.equal(res.totalItems, 228);
  assert.equal(res.totalPages, 19);
  assert.equal(res.pagesFetched, 3);
  assert.equal(res.complete, false, 'stopping short of the last page is not a complete crawl');
  assert.equal(res.jobs.length, 12); // same fixture served 3× — ids deduplicated
  assert.deepEqual(seen, [
    'https://www.qatarliving.com/en/jobs/jobs/list?page=1',
    'https://www.qatarliving.com/en/jobs/jobs/list?page=2',
    'https://www.qatarliving.com/en/jobs/jobs/list?page=3',
  ]);
  assert.deepEqual(closedExternalIds(['ghost'], res), {
    closed: [], refused: 'crawl incomplete — refusing to close any vacancy from a partial list',
  });
});

test('a crawl that reaches the last page but misses rows is not complete either', async () => {
  const res = await fetchQatarLivingJobs({
    delayMs: 0,
    fetchText: async (url) => (url.endsWith('page=1')
      ? { ok: true, status: 200, html: LIST_P1, url }
      : { ok: false, status: 500, html: '', url }),
    maxPages: 5,
  });
  assert.equal(res.complete, false);
  assert.equal(res.errors.length, 1);
  assert.equal(res.errors[0].error, 'HTTP 500');
});

test('robots.txt: /api/ is hard-refused, HTML paths are allowed', () => {
  assert.throws(() => assertAllowedPath('https://www.qatarliving.com/api/jobs/list'), /robots\.txt disallows/);
  assert.throws(() => assertAllowedPath('/api/v1/jobs'), /robots\.txt disallows/);
  assert.equal(
    assertAllowedPath('https://www.qatarliving.com/en/jobs/jobs/list?page=2'),
    'https://www.qatarliving.com/en/jobs/jobs/list?page=2',
  );
});

/* ── 5. merging the two surfaces ───────────────────────────────────────── */

test('merge: the job page contributes the currency-bearing salary and nothing else', () => {
  const listRow = bySlug.get('electronics-elv-technician');
  const detail = parseQatarLivingJob(JOB_ELV);
  const merged = mergeQatarLivingJob(listRow, detail);
  assert.equal(merged.is_active, true, 'liveness stays the list\'s verdict');
  assert.deepEqual(merged.industries, ['Recruitment & HR Services'], 'list value not overwritten by the thinner job page');
  assert.equal(merged.salary_min, null);

  // a job page that does state a salary supplies it
  const withSalary = mergeQatarLivingJob(
    { ...listRow, external_id: 'x', salary_min: null, salary_max: null, salary_currency: null, salary_period: null },
    parseQatarLivingJob(JOB_DSA),
  );
  assert.equal(withSalary.salary_min, 3500);
  assert.equal(withSalary.salary_currency, 'QAR');
  assert.equal(withSalary.salary_period, 'month');
  assert.equal(withSalary.extra_fields.salary_refused_reason, undefined);
});

/* ── 6. small helpers, so the traps stay closed ────────────────────────── */

test('helpers refuse what they should', () => {
  assert.equal(statedPositiveNumber(0), null);
  assert.equal(statedPositiveNumber('0.00'), null);
  assert.equal(statedPositiveNumber('3500.00'), 3500);
  assert.equal(statedPositiveNumber(-5), null);
  assert.equal(statedPositiveNumber('abc'), null);
  assert.equal(remoteFromArrangement('Remote'), true);
  assert.equal(remoteFromArrangement('On-Site'), false);
  assert.equal(remoteFromArrangement('Hybrid'), false);
  assert.equal(remoteFromArrangement(''), null);
  assert.equal(remoteFromArrangement(undefined), null);
  assert.equal(qlHtmlToText('<p>A&nbsp;&amp;&nbsp;B</p><p>C</p>'), 'A & B\n\nC');
  assert.equal(qlHtmlToText(''), null);
});

test('a page with no job data returns null rather than an empty invented row', () => {
  assert.equal(parseQatarLivingJob('<html><body>404</body></html>'), null);
  assert.deepEqual(parseQatarLivingList('<html></html>'), []);
});

test('raw_payload is valid JSON, never a truncated string (Rule 2.4)', () => {
  for (const j of listJobs) {
    assert.equal(typeof j.raw_payload, 'string');
    const back = JSON.parse(j.raw_payload); // throws if truncated
    assert.equal(back.id, j.external_id);
  }
});

// ── TRAP 6: a React Flight pointer is not text ───────────────────────────────────────────────
// The list page is an RSC payload. A string starting with `$` is a POINTER to another chunk, and a
// real string starting with a dollar sign is escaped by doubling it. The four long-text fields
// (job_description, job_description_ar, company_about, company_about_ar) arrive as pointers whose
// chunks the site streams LATER — measured live across 60 listings on 5 pages, not one was present
// in the delivered HTML.
//
// The first version passed them through, so Bell stored 158 of 233 descriptions as the literal
// strings "$2d", "$31", "$34" and showed them to customers as the job description.

test('a flight pointer is absent, not a description', () => {
  for (const ptr of ['$2d', '$31', '$3b', '$L4', '$undefined', '$@1', '$K2', '$']) {
    assert.equal(unflight(ptr), null, `${ptr} is a pointer`);
    assert.equal(qlHtmlToText(ptr), null, `${ptr} must not become description text`);
    assert.equal(statedString(ptr), null, `${ptr} must not become a stated value`);
  }
});

test('a real string that starts with a dollar sign survives, unescaped', () => {
  // RSC escapes a genuine leading '$' by doubling it, so this is how "$500 signing bonus" arrives.
  assert.equal(unflight('$$500 signing bonus'), '$500 signing bonus');
  assert.equal(statedString('$$500 signing bonus'), '$500 signing bonus');
  // The escape applies to the WHOLE value, not to dollar signs inside it: a description whose
  // HTML merely contains '$$' never needed escaping, so those characters are literal text and
  // must survive verbatim. Only a leading '$$' is an escape.
  assert.equal(qlHtmlToText('$$<p>500 bonus</p>'), '$500 bonus');
  assert.equal(qlHtmlToText('<p>Pays $$500</p>'), 'Pays $$500');
});

test('ordinary text is untouched by the guard', () => {
  assert.equal(unflight('Mechanical Draftsman'), 'Mechanical Draftsman');
  assert.equal(qlHtmlToText('<p>Immediate Joining</p><p>6+ years</p>'), 'Immediate Joining\n\n6+ years');
  assert.equal(unflight(null), null);
  assert.equal(unflight(42), null);
});

test('a listing whose description is a pointer yields a job with NO description', () => {
  // The rest of the row is still perfectly good — only the unresolvable field goes missing.
  const rec = {
    id: '11111111-2222-3333-4444-555555555555', job_type: 'corporate',
    title: 'AutoCAD designer', slug: 'autocad-designer',
    job_description: '$2d', city: 'Doha', country: 'Qatar',
    created_at: '2026-08-09T06:00:00.000Z',
    posting_as: { name: 'Zzql Test Employer' },
  };
  const job = qlListRecordToJob(rec);
  assert.ok(job, 'the listing is still a job');
  assert.equal(job.title, 'AutoCAD designer');
  assert.equal(job.description, null, 'the description is absent, not "$2d"');
  assert.equal(job.extra_fields.description_html, undefined, 'and it is not smuggled into extra_fields');
});
