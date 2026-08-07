// Qatar Living Jobs — job-vacancy source #3 (qatarliving.com/en/jobs).
//
// WHY THIS SOURCE. Bell's "hiring" and "expansion" signals need vacancies from
// ORDINARY Qatari businesses, not only blue chips. Qatar Living Jobs is where
// small and mid-sized Qatar employers post: on the live crawl of 2026-08-07 it
// carried 228 open corporate vacancies from 69 named employers — gyms,
// kindergartens, jewellers, contractors, recruiters — and the employer is named
// on every single one of them.
//
// HOW THE PAGE IS BUILT (verified live, 2026-08-07)
//   The site is a Next.js App Router app. Both the list page and the job page
//   are SERVER-rendered: the whole job record is already inside the HTML as
//   React Flight chunks (`self.__next_f.push([1,"…"])`). No browser, no JS
//   execution, no API call is needed — which matters, because robots.txt says
//   `Disallow: /api/`. Everything below reads the delivered HTML only.
//
//   The detail page ALSO carries a schema.org JobPosting JSON-LD block. We use
//   it for exactly one thing (salary — see below) because it is the only place
//   that states a CURRENCY.
//
// ⚠️ FIVE TRAPS PROVEN ON THE LIVE PAGES — every one of them would have written
//    a claim Qatar Living never made (Rule 2.1):
//
//   1. `validThrough` IS NOT AN EXPIRY DATE. On 11 of 11 listings checked it is
//      `datePosted` + EXACTLY 30 days, to the millisecond. It is a mechanical
//      SEO field, not a deadline: the Trilogistics "Electronics / ELV
//      Technician" posting carries validThrough 2026-07-29 and was still listed
//      as `status: "active"` on 2026-08-07. Never map it to expires_at.
//      The real, poster-stated field is `job_expiry_date` (69 of 228 state one).
//
//   2. `hiringOrganization.name` IS A PLACEHOLDER ON PERSONAL-HIRER ADS.
//      Household ads (nanny, housemaid, private driver) are posted by
//      individuals, and the JSON-LD names the hiring organization
//      "Qatar Living Jobs". A schema.org mapper would attach ~10 domestic-help
//      ads to Qatar Living itself. Those rows are refused outright: only
//      `job_type: "corporate"` records name a real employer.
//
//   3. THE LIST AND THE DETAIL PAGE DISAGREE ABOUT SALARY. For job
//      2713d50b-6b7a-4dcc-938c-e66bbe74756d the list states min 3400 / max 3500
//      while the detail page states `min_salary: null`. And NEITHER the list
//      record NOR the detail record states a currency or a period anywhere —
//      only the detail page's JSON-LD `baseSalary` does. So salary is taken
//      from JSON-LD `baseSalary` alone, and only when a real non-zero figure,
//      a real currency and a real unitText are all present. The bare list
//      numbers are preserved verbatim in extra_fields, labelled as having no
//      currency stated, and never written to salary_min/salary_max.
//
//   4. AN EMPTY STRING IS NOT A VALUE. Qatar Living writes `""` (not null) for
//      an unanswered field — `employment_type_name: ""` on 1 of 228,
//      `career_level_name: ""` on 21, `industry_type_name: ""` on 207,
//      `gender: ""` on 20. Blank-after-trim is treated as absent everywhere.
//
//   5. `industry_names` IS THE JOB'S OWN INDUSTRY, NOT THE EMPLOYER'S — but
//      only because that is provable. Madre Integrated Engineering (an
//      engineering firm) tags its "IFRS 9 ECL Professional" vacancy
//      "Financial Services (Banking, Insurance)" and its "FOMV Splicer"
//      vacancy "Oil & Gas / Energy". Same employer, different values, matching
//      the job. It is a per-job multi-select the poster fills in, so it is
//      stated and may be stored. (`industry_names_ar` is the same list in
//      Arabic and is kept out of the industries column.)
//
// CLOSURE — the founder's hard requirement, "if the post is deleted or expired
// or they already hired somebody, delete it from our portal".
//   Qatar Living gives one trustworthy liveness oracle and several decoys.
//   The oracle: the paginated live list. Every one of the 228 records it served
//   had status "active", is_published true, is_deleted false, is_drafted false,
//   moderation_status "approved" — the list IS the set of open vacancies.
//   So closure = "this external_id was in our jobs table and is NOT in today's
//   complete crawl". `fetchQatarLivingJobs` returns `liveExternalIds` together
//   with a `complete` flag, and `closedExternalIds()` REFUSES to compute a
//   closure set from an incomplete crawl — a half-finished crawl must never be
//   allowed to mass-deactivate live vacancies.
//   Decoys, do not use: `validThrough` (trap 1); `job_expiry_date` (7 of the 69
//   stated dates were already in the past while the job was still listed as
//   active — the poster's intention, not the site's behaviour); the sitemap
//   (it still lists withdrawn slugs).
//   A detail-page fetch returning HTTP 404 is a definite removal — verified
//   live against a slug that does not exist.
//
// ROBOTS. https://www.qatarliving.com/robots.txt on 2026-08-07 is
//   `User-Agent: *  /  Allow: /  /  Disallow: /api/` with NO crawl-delay.
//   Every path this module touches is an ordinary HTML page under /en/jobs/.
//   `assertAllowedPath()` hard-refuses anything under /api/ so no future edit
//   can quietly reach for the JSON endpoint. Requests are serialised with a
//   default 1500 ms gap (19 pages ≈ 30 s for the whole site).

import { packRaw } from '../../tenders/raw.js';

export const QL_SOURCE = 'qatarliving';
export const QL_BASE = 'https://www.qatarliving.com';
export const QL_LIST_PATH = '/en/jobs/jobs/list';
export const QL_PROFILE_PATH = '/en/jobs/jobs/profile';
export const QL_DEFAULT_DELAY_MS = 1500;

// robots.txt: Disallow: /api/
const QL_DISALLOWED_PREFIXES = ['/api/'];

// The literal string the JSON-LD writes on household/individual ads. It is the
// site's stand-in for "no organization", not an employer. Compared case-folded.
//
// ⚠️ EXACTLY this string, and no near-miss. "Qatar Living" WITHOUT "Jobs" is a
// real corporate employer on this site: company_id 2c286303-…, posting_as
// "company", info@qatarliving.com, currently hiring a Sales Executive with 617
// applicants. A broader guard silently threw that vacancy away — caught on the
// live 228-row crawl, 2026-08-07.
const QL_PLACEHOLDER_EMPLOYERS = new Set(['qatar living jobs']);

// Only corporate postings name a real employer (see trap 2).
const QL_EMPLOYER_JOB_TYPE = 'corporate';

// schema.org unitText → the vocabulary the jobs table stores. Anything else
// FAILS LOUDLY: the salary is refused and the reason recorded, never guessed.
const QL_SALARY_PERIODS = new Map([
  ['HOUR', 'hour'], ['DAY', 'day'], ['WEEK', 'week'],
  ['MONTH', 'month'], ['YEAR', 'year'],
]);

// Values employers/serialisers use to mean "not answered". Never stored.
const QL_NULLISH_TOKENS = new Set(['', 'null', 'undefined', 'n/a', 'na', 'none', 'unavailable', '-', '--']);

/* ────────────────────────────── tiny helpers ───────────────────────────── */

const NAMED_ENTITIES = new Map([
  ['amp', '&'], ['lt', '<'], ['gt', '>'], ['quot', '"'], ['apos', "'"],
  ['nbsp', ' '], ['ndash', '–'], ['mdash', '—'], ['hellip', '…'],
  ['rsquo', '’'], ['lsquo', '‘'], ['rdquo', '”'], ['ldquo', '“'], ['#39', "'"],
]);

export function decodeEntities(s) {
  if (typeof s !== 'string' || s.indexOf('&') === -1) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (m, ent) => {
    if (ent[0] === '#') {
      const code = ent[1] === 'x' || ent[1] === 'X'
        ? parseInt(ent.slice(2), 16)
        : parseInt(ent.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : m;
    }
    const hit = NAMED_ENTITIES.get(ent.toLowerCase());
    return hit === undefined ? m : hit;
  });
}

/** Qatar Living stores descriptions as <p>…</p> HTML. Paragraphs → blank-line
 *  separated plain text. Nothing is invented and nothing is dropped. */
export function qlHtmlToText(html) {
  if (typeof html !== 'string' || !html) return null;
  const text = decodeEntities(
    html
      .replace(/<\s*(br|BR)\s*\/?>/g, '\n')
      .replace(/<\/\s*(p|div|li|h[1-6]|tr)\s*>/gi, '\n\n')
      .replace(/<\s*li[^>]*>/gi, '• ')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/ /g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return text || null;
}

/** A stated string, or null. Blank-after-trim and the "not answered" tokens
 *  above are absent, not values (trap 4). */
export function statedString(v) {
  if (typeof v !== 'string') return null;
  const t = decodeEntities(v).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return QL_NULLISH_TOKENS.has(t.toLowerCase()) ? null : t;
}

/** A stated finite number > 0, accepting Qatar Living's "3500.00" strings.
 *  Zero is refused — a zero salary is the QatarEnergy trap, and it is never a
 *  wage anyone published. */
export function statedPositiveNumber(v) {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v === 'string') {
    const t = v.trim();
    if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  return null;
}

/** A stated ISO-8601 instant, or null. Anything unparseable is refused. */
export function statedInstant(v) {
  const s = statedString(v);
  if (!s) return null;
  const ms = Date.parse(s);
  if (!Number.isFinite(ms)) return null;
  return new Date(ms).toISOString();
}

export function assertAllowedPath(url) {
  let path;
  try {
    path = new URL(url, QL_BASE).pathname;
  } catch {
    throw new Error(`qatarliving: not a URL: ${url}`);
  }
  for (const bad of QL_DISALLOWED_PREFIXES) {
    if (path.startsWith(bad)) {
      throw new Error(
        `qatarliving: robots.txt disallows ${bad} — refusing to fetch ${path}. ` +
        'Everything Bell needs is in the server-rendered HTML.',
      );
    }
  }
  return url;
}

/* ─────────────────── React Flight payload extraction ───────────────────── */

/** Concatenate the server-rendered React Flight chunks embedded in the page.
 *  This is delivered HTML — no JS is executed. */
export function readFlightPayload(html) {
  if (typeof html !== 'string') return '';
  let buf = '';
  const re = /self\.__next_f\.push\((\[[\s\S]*?\])\)\s*<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let arr;
    try { arr = JSON.parse(m[1]); } catch { continue; }
    if (Array.isArray(arr) && typeof arr[1] === 'string') buf += arr[1];
  }
  return buf;
}

/** Walk a balanced JSON object starting at `start`, skipping over string
 *  literals so a `}` inside a description cannot end it early. */
function sliceJsonObject(buf, start) {
  let depth = 0;
  for (let i = start; i < buf.length; i += 1) {
    const c = buf[i];
    if (c === '"') {
      i += 1;
      while (i < buf.length) {
        if (buf[i] === '\\') { i += 1; }
        else if (buf[i] === '"') break;
        i += 1;
      }
      continue;
    }
    if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) return buf.slice(start, i + 1);
    }
  }
  return null;
}

const LIST_RECORD_PATTERN = '\\{"id":"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}","job_type":"';

/** Every job row the list page server-rendered, in page order. */
export function readListRecords(html) {
  const buf = readFlightPayload(html);
  const out = [];
  const seen = new Set();
  const re = new RegExp(LIST_RECORD_PATTERN, 'g'); // fresh: no shared lastIndex
  let m;
  while ((m = re.exec(buf)) !== null) {
    const json = sliceJsonObject(buf, m.index);
    if (!json) continue;
    let rec;
    try { rec = JSON.parse(json); } catch { continue; }
    if (!rec || typeof rec.id !== 'string' || seen.has(rec.id)) continue;
    seen.add(rec.id);
    out.push(rec);
  }
  return out;
}

/** The list page's own pagination block, verbatim. */
export function parseQatarLivingListPagination(html) {
  const buf = readFlightPayload(html);
  const i = buf.indexOf('"pagination":{');
  if (i === -1) return null;
  const json = sliceJsonObject(buf, i + '"pagination":'.length);
  if (!json) return null;
  try {
    const p = JSON.parse(json);
    return {
      totalItems: Number.isFinite(p.totalItems) ? p.totalItems : null,
      totalPages: Number.isFinite(p.totalPages) ? p.totalPages : null,
      currentPage: Number.isFinite(p.currentPage) ? p.currentPage : null,
      itemsPerPage: Number.isFinite(p.itemsPerPage) ? p.itemsPerPage : null,
      hasNextPage: typeof p.hasNextPage === 'boolean' ? p.hasNextPage : null,
    };
  } catch { return null; }
}

/** The detail page's `initialJobData` object. */
export function readDetailRecord(html) {
  const buf = readFlightPayload(html);
  const key = '"initialJobData":';
  const i = buf.indexOf(key);
  if (i === -1) return null;
  const json = sliceJsonObject(buf, i + key.length);
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

/** The schema.org JobPosting block, if the page carries one. */
export function readJobPostingLd(html) {
  if (typeof html !== 'string') return null;
  const re = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html)) !== null) {
    let obj;
    try { obj = JSON.parse(m[1]); } catch { continue; }
    const list = Array.isArray(obj) ? obj : [obj];
    for (const o of list) if (o && o['@type'] === 'JobPosting') return o;
  }
  return null;
}

/* ──────────────────────────── field mapping ────────────────────────────── */

/**
 * Salary, from schema.org `baseSalary` ONLY — the single place Qatar Living
 * states a currency and a period (trap 3).
 * Returns {salary_min, salary_max, salary_currency, salary_period, refusal}.
 * `refusal` is a short verbatim reason whenever a figure was present but not
 * usable, so the refusal is visible in extra_fields rather than silent.
 */
export function salaryFromJsonLd(ld) {
  const none = { salary_min: null, salary_max: null, salary_currency: null, salary_period: null, refusal: null };
  const bs = ld && ld.baseSalary;
  if (!bs || typeof bs !== 'object') return none;

  const currency = statedString(bs.currency);
  const val = bs.value && typeof bs.value === 'object' ? bs.value : null;
  const min = statedPositiveNumber(val && val.minValue);
  const max = statedPositiveNumber(val && val.maxValue);
  const single = statedPositiveNumber(val && val.value);
  const lo = min ?? single;
  const hi = max ?? single;

  if (lo == null && hi == null) {
    // QatarEnergy job 5731 shape: currency stated, every figure 0.
    return { ...none, refusal: 'baseSalary stated no non-zero figure' };
  }
  if (!currency || !/^[A-Za-z]{3}$/.test(currency)) {
    return { ...none, refusal: `baseSalary stated a figure but no usable currency (${JSON.stringify(bs.currency ?? null)})` };
  }
  const unit = statedString(val && val.unitText);
  const period = unit ? QL_SALARY_PERIODS.get(unit.toUpperCase()) : null;
  if (!period) {
    // Unknown option must fail loudly, never fall back to a default period.
    return { ...none, refusal: `baseSalary unitText not recognised (${JSON.stringify(unit)}) — salary refused` };
  }
  if (lo != null && hi != null && lo > hi) {
    return { ...none, refusal: `baseSalary min ${lo} > max ${hi}` };
  }
  return {
    salary_min: lo,
    salary_max: hi,
    salary_currency: currency.toUpperCase(),
    salary_period: period,
    refusal: null,
  };
}

/** "On-Site" | "Hybrid" | "Remote" → is_remote. Unstated stays null: Bell does
 *  not claim a job is on-site just because nobody said it was remote. */
export function remoteFromArrangement(name) {
  const s = statedString(name);
  if (!s) return null;
  const k = s.toLowerCase().replace(/[\s_-]/g, '');
  if (k === 'remote' || k === 'workfromhome') return true;
  if (k === 'onsite' || k === 'hybrid') return false;
  return null;
}

/** The employer, or an explicit refusal. Personal-hirer ads name Qatar Living
 *  itself (trap 2) and are never attributed to a company. */
export function employerFromRecord(rec) {
  const jobType = statedString(rec && rec.job_type);
  const raw = statedString(rec && (rec.company_name ?? (rec.company && rec.company.name)));
  if (jobType && jobType.toLowerCase() !== QL_EMPLOYER_JOB_TYPE) {
    return { name: null, slug: null, refusal: `job_type "${jobType}" — not a company vacancy` };
  }
  // An individual hirer, whatever the ad calls itself. On household ads the
  // record sets personal_hirer_id (and company_id mirrors it) — 0 of the 228
  // live corporate vacancies set it.
  if (statedString(rec && rec.personal_hirer_id)) {
    return { name: null, slug: null, refusal: 'personal_hirer_id set — an individual, not a company' };
  }
  if (!raw) return { name: null, slug: null, refusal: 'no employer name stated' };
  if (QL_PLACEHOLDER_EMPLOYERS.has(raw.toLowerCase())) {
    return { name: null, slug: null, refusal: `"${raw}" is the site's own placeholder, not an employer` };
  }
  const slug = statedString(rec && (rec.company_slug ?? (rec.company && rec.company.slug)));
  return { name: raw, slug, refusal: null };
}

/** The list page's liveness verdict. Every field must agree; a missing field
 *  makes the verdict unknown (null) rather than an assumed true. */
export function activeFromListRecord(rec) {
  if (!rec) return null;
  const status = statedString(rec.status);
  const moderation = statedString(rec.moderation_status);
  if (status == null || typeof rec.is_published !== 'boolean'
      || typeof rec.is_deleted !== 'boolean' || typeof rec.is_drafted !== 'boolean'
      || moderation == null) return null;
  return status.toLowerCase() === 'active'
    && rec.is_published === true
    && rec.is_deleted === false
    && rec.is_drafted === false
    && moderation.toLowerCase() === 'approved';
}

export function qlJobUrl(slug, lang = 'en') {
  const s = statedString(slug);
  return s ? `${QL_BASE}/${lang}/jobs/jobs/profile/${s}` : null;
}

/** packRaw with a job-shaped fallback: drop the Arabic mirror and the screening
 *  questions before giving up, and NEVER truncate the JSON (Rule 2.4). */
export function packJobRaw(rec) {
  let packed = packRaw(rec);
  if (packed) return { raw_payload: packed, omitted: null };
  const trimmed = { ...rec };
  for (const k of Object.keys(trimmed)) if (k.endsWith('_ar') || k === 'translation_ar') delete trimmed[k];
  packed = packRaw(trimmed);
  if (packed) return { raw_payload: packed, omitted: 'arabic_translations' };
  delete trimmed.screening_questions;
  delete trimmed.screening_question_ids;
  delete trimmed.screening_question_titles;
  delete trimmed.saved_by_users;
  packed = packRaw(trimmed);
  if (packed) return { raw_payload: packed, omitted: 'arabic_translations,screening_questions,saved_by_users' };
  return { raw_payload: null, omitted: 'whole_payload_too_large' };
}

/** Industries: the poster's own per-job multi-select (trap 5), verbatim. */
function industriesFrom(names, legacySingle) {
  const list = Array.isArray(names)
    ? names.map(statedString).filter(Boolean)
    : [];
  if (list.length) return Array.from(new Set(list));
  const one = statedString(legacySingle);
  return one ? [one] : null;
}

/**
 * Map one server-rendered list row to a jobs-table record.
 * Everything not stated stays null. Nothing is inferred from the title, the
 * employer, or the absence of a field.
 */
export function qlListRecordToJob(rec, { lang = 'en' } = {}) {
  if (!rec || typeof rec !== 'object' || typeof rec.id !== 'string') return null;

  const employer = employerFromRecord(rec);
  const url = qlJobUrl(rec.slug, lang);
  const { raw_payload, omitted } = packJobRaw(rec);

  const city = statedString(rec.city);
  const country = statedString(rec.country);
  const location_text = [city, country].filter(Boolean).join(', ') || null;

  // No currency and no period are stated anywhere on the list row, so these
  // figures cannot become salary_min/salary_max. Kept verbatim, labelled.
  const listMin = statedPositiveNumber(rec.min_salary);
  const listMax = statedPositiveNumber(rec.max_salary);

  const extra_fields = dropNulls({
    ql_job_id: statedString(rec.id),
    ql_slug: statedString(rec.slug),
    ql_job_type: statedString(rec.job_type),
    ql_status: statedString(rec.status),
    ql_moderation_status: statedString(rec.moderation_status),
    ql_is_published: typeof rec.is_published === 'boolean' ? rec.is_published : null,
    ql_is_deleted: typeof rec.is_deleted === 'boolean' ? rec.is_deleted : null,
    ql_is_drafted: typeof rec.is_drafted === 'boolean' ? rec.is_drafted : null,
    ql_updated_at: statedInstant(rec.updated_at),
    ql_last_refreshed_at: statedInstant(rec.last_refreshed_at),
    ql_encrypted_id: statedString(rec._encryptedId),
    employer_name: employer.name,
    employer_slug: employer.slug,
    employer_refused_reason: employer.refusal,
    posting_as: statedString(rec.posting_as),
    number_of_hires: statedPositiveNumber(rec.number_of_hires),
    is_confidential: typeof rec.is_confidential === 'boolean' ? rec.is_confidential : null,
    has_negotiable_salary: typeof rec.has_negotiable_salary === 'boolean' ? rec.has_negotiable_salary : null,
    // labelled so nothing downstream can mistake a bare number for a wage
    list_salary_min_no_currency_stated: listMin,
    list_salary_max_no_currency_stated: listMax,
    salary_refused_reason: (listMin != null || listMax != null)
      ? 'list row states figures but no currency and no period — salary taken only from the detail page JSON-LD'
      : null,
    stated_job_expiry_date: statedInstant(rec.job_expiry_date),
    minimum_education: statedString(rec.minimum_education_name),
    years_of_experience: statedString(rec.years_of_experience_name),
    visa_status: statedString(rec.visa_status_name),
    major: statedString(rec.major_name),
    gender_preference: statedString(rec.gender),
    job_languages: nonEmptyStrings(rec.job_language_names),
    screening_question_titles: nonEmptyStrings(rec.screening_question_titles),
    legacy_industry_type: statedString(rec.industry_type_name),
    description_html: statedString(rec.job_description),
    raw_payload_omitted: omitted,
  });

  return {
    source: QL_SOURCE,
    source_url: url,
    external_id: rec.id,

    title: statedString(rec.title),
    description: qlHtmlToText(rec.job_description),
    location_text,
    is_remote: remoteFromArrangement(rec.work_arrangement_type_name),
    workplace_type: statedString(rec.work_arrangement_type_name),
    employment_type: statedString(rec.employment_type_name),
    seniority_level: statedString(rec.career_level_name),
    job_function: statedString(rec.function_type_name),
    industries: industriesFrom(rec.industry_names, rec.industry_type_name),

    // Refused on the list row — no currency, no period stated. See trap 3.
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,

    posted_at: statedInstant(rec.created_at),
    expires_at: statedInstant(rec.job_expiry_date),
    is_active: activeFromListRecord(rec),
    applicant_count: Number.isFinite(rec.applicants_count) && rec.applicants_count >= 0
      ? rec.applicants_count : null,

    company_id: null, // resolved by the employer matcher, never by the parser
    extra_fields,
    raw_payload,
  };
}

function nonEmptyStrings(v) {
  if (!Array.isArray(v)) return null;
  const out = v.map(statedString).filter(Boolean);
  return out.length ? out : null;
}

function dropNulls(o) {
  const out = {};
  for (const [k, v] of Object.entries(o)) if (v !== null && v !== undefined) out[k] = v;
  return out;
}

/* ──────────────────────────── public parsers ───────────────────────────── */

/**
 * PURE. Parse a server-rendered Qatar Living jobs LIST page.
 * @param {string} html verbatim HTML of /en/jobs/jobs/list?page=N
 * @returns {Array<object>} one jobs-table record per listed vacancy, page order
 */
export function parseQatarLivingList(html) {
  return readListRecords(html)
    .map((rec) => qlListRecordToJob(rec))
    .filter(Boolean);
}

/**
 * PURE. Parse a Qatar Living JOB page.
 * Uses the server-rendered record for the explicitly labelled fields and the
 * schema.org block for salary only (the one place a currency is stated).
 * `is_active` is null here on purpose: a job page alone cannot tell a live
 * vacancy from a withdrawn one — only the live list can (see CLOSURE above).
 * @param {string} html verbatim HTML of /en/jobs/jobs/profile/<slug>
 * @returns {object|null}
 */
export function parseQatarLivingJob(html) {
  const rec = readDetailRecord(html);
  const ld = readJobPostingLd(html);
  if (!rec && !ld) return null;

  const base = rec ? qlListRecordToJob(flattenDetailRecord(rec)) : null;
  const job = base || {
    source: QL_SOURCE, source_url: null, external_id: null,
    title: null, description: null, location_text: null, is_remote: null,
    workplace_type: null, employment_type: null, seniority_level: null,
    job_function: null, industries: null,
    salary_min: null, salary_max: null, salary_currency: null, salary_period: null,
    posted_at: null, expires_at: null, is_active: null, applicant_count: null,
    company_id: null, extra_fields: {}, raw_payload: null,
  };

  // A job page never states liveness (trap: validThrough is datePosted+30d).
  job.is_active = null;

  if (ld) {
    const sal = salaryFromJsonLd(ld);
    job.salary_min = sal.salary_min;
    job.salary_max = sal.salary_max;
    job.salary_currency = sal.salary_currency;
    job.salary_period = sal.salary_period;
    if (sal.refusal) {
      job.extra_fields.salary_refused_reason = sal.refusal;
    } else if (sal.salary_min != null || sal.salary_max != null) {
      // A salary WAS stored, so the record-level "no currency stated" note the
      // flat mapper left behind is stale. Clear it rather than ship a row that
      // both states a wage and says the wage was refused.
      delete job.extra_fields.salary_refused_reason;
    }

    if (!job.title) job.title = statedString(ld.title);
    if (!job.description) job.description = qlHtmlToText(ld.description);
    if (!job.posted_at) job.posted_at = statedInstant(ld.datePosted);
    if (!job.source_url) job.source_url = statedString(ld.url);

    // Recorded verbatim, and explicitly NOT mapped to expires_at (trap 1).
    const vt = statedInstant(ld.validThrough);
    if (vt) {
      job.extra_fields.ld_valid_through = vt;
      job.extra_fields.ld_valid_through_note =
        'schema.org validThrough — verified on 11/11 live listings to be datePosted + exactly 30 days; not a stated deadline, never used as expires_at';
    }
    const ldEmployment = statedString(ld.employmentType);
    if (ldEmployment) job.extra_fields.ld_employment_type = ldEmployment;

    // If the flight record is missing entirely, the employer still has to pass
    // the placeholder test.
    if (!base) {
      const org = ld.hiringOrganization && statedString(ld.hiringOrganization.name);
      if (org && !QL_PLACEHOLDER_EMPLOYERS.has(org.toLowerCase())) {
        job.extra_fields.employer_name = org;
      } else if (org) {
        job.extra_fields.employer_refused_reason =
          `"${org}" is the site's own placeholder, not an employer`;
      }
      const loc = ld.jobLocation && ld.jobLocation.address;
      const locality = loc && statedString(loc.addressLocality);
      if (locality) job.location_text = locality;
    }
  }

  return job;
}

/** The detail page nests its lookups (`employment_type: {name}`); the list page
 *  flattens them (`employment_type_name`). Normalise to the flat shape so ONE
 *  mapper serves both surfaces. */
function flattenDetailRecord(rec) {
  const flat = { ...rec };
  const lookups = [
    ['employment_type', 'employment_type_name'],
    ['function_type', 'function_type_name'],
    ['career_level', 'career_level_name'],
    ['work_arrangement_type', 'work_arrangement_type_name'],
    ['minimum_education', 'minimum_education_name'],
    ['visa_status', 'visa_status_name'],
    ['major', 'major_name'],
    ['industry_type', 'industry_type_name'],
    ['years_of_experience', 'years_of_experience_name'],
  ];
  for (const [obj, flatKey] of lookups) {
    if (flat[flatKey] === undefined) {
      flat[flatKey] = rec[obj] && typeof rec[obj] === 'object' ? rec[obj].name : null;
    }
  }
  if (flat.company_name === undefined) flat.company_name = rec.company ? rec.company.name : null;
  if (flat.company_slug === undefined) flat.company_slug = rec.company ? rec.company.slug : null;
  if (flat.industry_names === undefined && Array.isArray(rec.industries)) {
    flat.industry_names = rec.industries.map((i) => (i && i.name) || null).filter(Boolean);
  }
  if (Array.isArray(rec.screening_questions) && flat.screening_question_titles === undefined) {
    flat.screening_question_titles = rec.screening_questions.map((q) => q && q.title).filter(Boolean);
  }
  // The job page does not publish moderation/liveness flags; leave them absent
  // so activeFromListRecord() returns null rather than inventing "active".
  return flat;
}

/* ─────────────────────────────── fetching ──────────────────────────────── */

async function defaultFetchText(url, { timeoutMs = 30_000, userAgent } = {}) {
  assertAllowedPath(url);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'user-agent': userAgent || 'BellDataIntelligence/1.0 (+https://bell.qa)',
        accept: 'text/html,application/xhtml+xml',
        'accept-language': 'en',
      },
    });
    const body = res.ok ? await res.text() : '';
    return { status: res.status, ok: res.ok, html: body, url: res.url || url };
  } finally {
    clearTimeout(timer);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Fetch every live Qatar Living corporate vacancy, politely.
 *
 * Only server-rendered HTML under /en/jobs/ is requested — robots.txt allows
 * it and disallows /api/, which this module refuses to touch. Pages are
 * fetched one at a time with `delayMs` between them.
 *
 * @param {object} [opts]
 * @param {number} [opts.delayMs=1500]  gap between requests
 * @param {number} [opts.maxPages=200]  hard stop
 * @param {function} [opts.fetchText]   injectable fetcher (tests/offline)
 * @param {function} [opts.onPage]      progress callback ({page,totalPages,jobs})
 * @param {string}  [opts.userAgent]
 * @returns {Promise<{jobs, liveExternalIds, totalItems, pagesFetched, totalPages, complete, errors}>}
 *   `complete` is true ONLY when every page reported by the site was fetched
 *   and parsed. Closure must never be computed from an incomplete crawl.
 */
export async function fetchQatarLivingJobs(opts = {}) {
  const {
    delayMs = QL_DEFAULT_DELAY_MS,
    maxPages = 200,
    fetchText = defaultFetchText,
    onPage,
    userAgent,
  } = opts;

  const jobs = [];
  const seen = new Set();
  const errors = [];
  let totalItems = null;
  let totalPages = null;
  let pagesFetched = 0;
  let complete = false;

  for (let page = 1; page <= maxPages; page += 1) {
    const url = assertAllowedPath(`${QL_BASE}${QL_LIST_PATH}?page=${page}`);
    let res;
    try {
      res = await fetchText(url, { userAgent });
    } catch (err) {
      errors.push({ page, error: String((err && err.message) || err) });
      break;
    }
    if (!res || !res.ok || !res.html) {
      errors.push({ page, error: `HTTP ${res && res.status}` });
      break;
    }
    pagesFetched += 1;

    const pag = parseQatarLivingListPagination(res.html);
    if (pag) {
      if (pag.totalItems != null) totalItems = pag.totalItems;
      if (pag.totalPages != null) totalPages = pag.totalPages;
    }

    const pageJobs = parseQatarLivingList(res.html);
    if (!pageJobs.length) {
      // An empty page past page 1 is the natural end; on page 1 it is a defect.
      if (page === 1) errors.push({ page, error: 'list page 1 served no job records' });
      break;
    }
    for (const j of pageJobs) {
      if (!j.external_id || seen.has(j.external_id)) continue;
      seen.add(j.external_id);
      jobs.push(j);
    }
    if (typeof onPage === 'function') onPage({ page, totalPages, jobs: pageJobs.length });

    if (totalPages != null && page >= totalPages) { complete = true; break; }
    if (pag && pag.hasNextPage === false) { complete = true; break; }
    if (delayMs > 0) await sleep(delayMs);
  }

  // The crawl only counts as complete if the site's own tally agrees.
  if (complete && totalItems != null && jobs.length !== totalItems) {
    errors.push({ error: `site says ${totalItems} vacancies, crawl collected ${jobs.length}` });
    complete = false;
  }
  if (errors.length) complete = false;

  return {
    jobs,
    liveExternalIds: jobs.map((j) => j.external_id),
    totalItems,
    totalPages,
    pagesFetched,
    complete,
    errors,
    fetchedAt: new Date().toISOString(),
  };
}

/** Fetch one job page. HTTP 404 is a definite removal (verified live). */
export async function fetchQatarLivingJob(url, opts = {}) {
  const { fetchText = defaultFetchText, userAgent } = opts;
  const res = await fetchText(assertAllowedPath(url), { userAgent });
  if (res && res.status === 404) return { removed: true, job: null, status: 404 };
  if (!res || !res.ok || !res.html) return { removed: false, job: null, status: res && res.status };
  return { removed: false, job: parseQatarLivingJob(res.html), status: res.status };
}

/**
 * Combine the two surfaces without either one inventing anything.
 *
 * The LIST row is the fuller record — it alone publishes liveness, the stated
 * `job_expiry_date`, `industry_names` and the moderation flags. The JOB page
 * contributes exactly one thing the list cannot: a salary WITH a currency and
 * a period. Every other detail-page value is used only to fill a gap the list
 * left, never to overwrite something the list stated.
 *
 * @param {object} listJob   from parseQatarLivingList()
 * @param {object} detailJob from parseQatarLivingJob()
 */
export function mergeQatarLivingJob(listJob, detailJob) {
  if (!listJob) return detailJob || null;
  if (!detailJob) return listJob;
  const out = { ...listJob, extra_fields: { ...listJob.extra_fields } };

  // The only fields the job page is authoritative for.
  out.salary_min = detailJob.salary_min;
  out.salary_max = detailJob.salary_max;
  out.salary_currency = detailJob.salary_currency;
  out.salary_period = detailJob.salary_period;

  for (const k of ['title', 'description', 'location_text', 'is_remote', 'workplace_type',
    'employment_type', 'seniority_level', 'job_function', 'industries', 'posted_at',
    'expires_at', 'applicant_count', 'source_url', 'external_id']) {
    if (out[k] == null && detailJob[k] != null) out[k] = detailJob[k];
  }
  for (const [k, v] of Object.entries(detailJob.extra_fields || {})) {
    if (out.extra_fields[k] === undefined) out.extra_fields[k] = v;
  }
  if (detailJob.extra_fields && detailJob.extra_fields.salary_refused_reason) {
    out.extra_fields.salary_refused_reason = detailJob.extra_fields.salary_refused_reason;
  } else if (out.salary_min != null || out.salary_max != null) {
    delete out.extra_fields.salary_refused_reason;
  }
  // Liveness stays the list's verdict; the job page cannot tell (see CLOSURE).
  out.is_active = listJob.is_active;
  return out;
}

/**
 * THE CLOSURE RULE the founder asked for: a vacancy Bell holds that is no
 * longer in Qatar Living's live list has been deleted, expired or filled and
 * must stop showing.
 *
 * REFUSES to answer when the crawl was incomplete — a partial crawl would
 * otherwise deactivate every vacancy it did not reach.
 *
 * @param {string[]} storedExternalIds ids Bell currently holds as active
 * @param {{liveExternalIds: string[], complete: boolean}} crawl
 * @returns {{closed: string[], refused: string|null}}
 */
export function closedExternalIds(storedExternalIds, crawl) {
  if (!crawl || crawl.complete !== true) {
    return {
      closed: [],
      refused: 'crawl incomplete — refusing to close any vacancy from a partial list',
    };
  }
  const live = new Set(crawl.liveExternalIds || []);
  const stored = Array.isArray(storedExternalIds) ? storedExternalIds : [];
  return { closed: stored.filter((id) => id && !live.has(id)), refused: null };
}
