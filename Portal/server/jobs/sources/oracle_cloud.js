// Oracle Recruiting Cloud (Fusion HCM) — public job-board reader.
// ---------------------------------------------------------------------------
// The widest FREE vacancy source found for Qatar. Every Oracle Fusion HCM
// tenant exposes its external careers board through an unauthenticated REST
// endpoint. No key, no browser, no cost.
//
// Verified live 2026-08-07 against SEVEN tenants (86 requisitions):
//   ejqa.fa.em2 (Milaha) · elat.fa.em2 (Vodafone Qatar) · eipb.fa.em2 (Aspire)
//   elus.fa.em2 (QTerminals) · hcxg.fa.em2 (Technip Energies, 176 jobs)
//   fa-ewab-saasfaprod1.fa.ocs (Qatar Steel) · fa-eolw-saasfaprod1.fa.ocs (QF)
//
// ---------------------------------------------------------------------------
// WHAT THIS SOURCE ACTUALLY STATES  (Rule 2.1 — never guess)
// ---------------------------------------------------------------------------
// STATED by the list endpoint, and therefore read here:
//   Id · Title · PostedDate (a DATE, no clock time) · PrimaryLocation ·
//   PrimaryLocationCountry · WorkplaceType / WorkplaceTypeCode (often blank)
//
// STATED by the DETAIL endpoint only:
//   ExternalPostedStartDate / ExternalPostedEndDate (real instants) ·
//   ExternalDescriptionStr · JobSchedule · RequisitionType · Category
//
// NOT STATED BY ANYONE on this source — these columns MUST stay NULL:
//   salary_min/max/currency/period ....... no salary field exists at all
//   seniority_level ...................... nobody states it; reading it off a
//                                          title ("Senior X") is a guess
//   job_function ......................... JobFunction/JobFunctionCode were
//                                          null on 86 of 86 rows
//   industries ........................... nobody states it; inheriting the
//                                          employer's industry is the same
//                                          error class as deriving a tender's
//                                          industry from the buyer's department
//   employment_type ...................... ContractType/WorkerType/JobType were
//                                          null on 86 of 86 rows. See the
//                                          RequisitionType trap below.
//   applicant_count ...................... not published
//   is_remote ............................ only ever inferable from
//                                          WorkplaceType, which is blank far
//                                          more often than not; left to the
//                                          ingest layer, which gets the stated
//                                          string verbatim
//
// TRAP 1 — employer name. LegalEmployer, Organization, BusinessUnit and
//   Department are null on 86 of 86 requisitions across all seven tenants, in
//   BOTH the list and the detail payload. `employer_stated` is therefore
//   virtually always null. The tenant HOST is the employer's identity, and
//   mapping host -> company_id is the caller's job, not this parser's.
//   Do NOT reach for `organizationsFacet` to fill the gap: on Milaha it reads
//   "Ship Management", "Mechanical", "Legal" — internal departments, not the
//   employer. It happens to read "Vodafone Qatar P.Q.S.C." on one tenant and
//   that coincidence is exactly what would make the mistake look correct.
//
// TRAP 2 — RequisitionType is NOT employment_type. Observed values across
//   three tenants: "Full Time Employee (FTE)", "Professional", "Permanent".
//   Three different vocabularies from three different HR configurations. It is
//   carried through verbatim as `requisition_type_stated` and never mapped.
//
// TRAP 3 — placeholder literals. Oracle boards publish "" and (on QatarEnergy's
//   schema.org feed) the literal string "UNAVAILABLE" where there is no value.
//   A naive mapper stores those as if they were data. See NON_VALUES.
//
// TRAP 4 — a board's contents are not automatically current. elus.fa.em2
//   carries exactly one requisition, posted 2022-06-05 — over four years old
//   and still listed. This reader reports PostedDate faithfully and never
//   stamps a row as fresh. Freshness is computed downstream from posted_at.
//
// ---------------------------------------------------------------------------
// THREE ENDPOINT BEHAVIOURS THIS READER MUST RESPECT
// ---------------------------------------------------------------------------
// 1. PIN THE API VERSION. resources/11.13.18.05/ and resources/latest/ are
//    byte-identical today; 11.13.18.04 returns a loud HTTP 400. Pinning turns a
//    future Oracle reshape into a crash instead of a silently wrong parser.
//
// 2. &expand= IS LOAD-BEARING. Omit it and Oracle answers HTTP 200 with a
//    correct TotalJobsCount and NO requisitionList key at all — a run that
//    looks perfectly successful and ingests nothing. Proven live and captured
//    in fixtures/oracle_ejqa_noexpand.json. parseOracleJobs THROWS on it.
//    Note the distinction that makes this safe: the trap OMITS the key, while
//    a genuinely empty page returns `requisitionList: []`.
//
// 3. siteNumber IS A NO-OP FOR THE API. CX_1, CX_99 and CX_ZZZ return identical
//    payloads. It is never evidence of anything. It DOES matter for the human
//    URL — see buildJobUrl.
//
// ---------------------------------------------------------------------------
// CLOSURE — "if the post is deleted or expired or they already hired somebody,
// we delete it from our portal" (Val, 2026-08-07)
// ---------------------------------------------------------------------------
// Two independent closure signals, in order of authority:
//
//   A. ABSENT FROM THE BOARD. A full sweep of a tenant returns every currently
//      posted requisition. Any external_id Bell holds for that tenant which is
//      no longer in the sweep has been withdrawn, filled or expired.
//      This requires a COMPLETE sweep — see fetchOracleJobs, which refuses to
//      report completeness unless it collected TotalJobsCount rows.
//
//   B. PER-JOB CONFIRMATION. The detail endpoint returns count:0 / items:[]
//      for a requisition that is gone. Verified 11/11 live on Milaha:
//      4 on-board ids -> count 1; 7 off-board ids -> count 0.
//      parseOracleJobDetail surfaces this as { found: false }.
//
//   ⚠ DO NOT use the careers-page redirect as a liveness test. It looks like a
//   closure signal and is not: /sites/CX_1/job/{id} 302-redirects to the
//   canonical site path for ids that are GONE (2000, 2300, 2400, 2470 all
//   redirect happily while the detail API reports count:0). It only reaches
//   /errors/404 for some ids. Using it would leave filled jobs on the portal.
//
//   ExternalPostedEndDate is a real stated expiry when present (Milaha
//   2026-08-14, Vodafone 2026-10-30) but was null on 2 of 4 tenants. Absent it,
//   nothing is assumed — expires_at stays null and closure relies on A/B.
//
// ---------------------------------------------------------------------------
// This module is PURE + a thin fetch wrapper. It performs no database work and
// stores nothing. Callers persisting `raw` MUST route it through
// server/tenders/raw.js packRaw() — never JSON.stringify().slice() (Rule 2.4).
// ---------------------------------------------------------------------------

export const ORACLE_API_VERSION = '11.13.18.05';   // PINNED — see behaviour 1

// The expand clause is not optional. See behaviour 2.
export const ORACLE_EXPAND =
  'requisitionList.secondaryLocations,flexFieldsFacet.values';

const DEFAULT_PAGE_SIZE   = 25;
const DEFAULT_TIMEOUT_MS  = 20_000;
const MAX_PAGES           = 400;        // 10,000 requisitions — a safety stop
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36 BellBot/1.0 (+https://bell.qa/bot)';

// Literals that mean "no value stated". Storing any of these as data is the
// mistake; refusing them can only ever leave a column NULL, which is the safe
// direction under Rule 2.1. NOT applied to title or description, where such a
// string would be genuine content.
const NON_VALUES = new Set([
  '', '-', '--', 'n/a', 'na', 'null', 'none', 'unavailable', 'unspecified',
  'not specified', 'not applicable', 'tbd', 'undefined',
]);

/** Verbatim trimmed string, or null when the source states nothing usable. */
function stated(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (NON_VALUES.has(trimmed.toLowerCase())) return null;
  return trimmed;
}

/** Content string: trimmed, but placeholder words are NOT filtered. */
function content(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}

/** ISO-8601 date exactly as published (YYYY-MM-DD), or null. Never widened. */
function statedDate(value) {
  const s = stated(value);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * A real instant with a real offset, normalised to ISO UTC.
 * Oracle publishes "2026-08-04T12:24:29+00:00". A value without a timezone is
 * refused rather than assumed to be UTC.
 */
function statedInstant(value) {
  const s = stated(value);
  if (!s) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(s)) return null;
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) return null;      // no zone -> refuse
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** ISO-3166 alpha-2 exactly as published, upper-cased, or null. */
function statedCountry(value) {
  const s = stated(value);
  if (!s) return null;
  return /^[A-Za-z]{2}$/.test(s) ? s.toUpperCase() : null;
}

// ---------------------------------------------------------------------------
// Host + URL helpers
// ---------------------------------------------------------------------------

/**
 * Accepts either short form ("ejqa.fa.em2") or a full hostname
 * ("fa-ewab-saasfaprod1.fa.ocs.oraclecloud.com" — Qatar Steel and Qatar
 * Foundation use this second shape). Refuses anything not on oraclecloud.com,
 * so a bad config value cannot point the reader at an arbitrary host.
 */
export function normalizeTenantHost(tenantHost) {
  const raw = stated(tenantHost);
  if (!raw) throw new Error('oracle: tenantHost is required');
  let host = raw.replace(/^https?:\/\//i, '').replace(/[/?#].*$/, '').trim().toLowerCase();
  if (!host) throw new Error('oracle: tenantHost is required');

  // Userinfo ("evil.com@oraclecloud.com") and ports are never part of a real
  // tenant host, and both are classic ways to smuggle a different origin past
  // a suffix check.
  if (host.includes('@') || host.includes(':')) {
    throw new Error(`oracle: refusing malformed host "${tenantHost}"`);
  }

  if (!host.endsWith('.oraclecloud.com')) {
    // Short tenant form ("ejqa.fa.em2") gets the domain appended. A value that
    // already looks like a complete hostname must NOT be silently rewritten
    // into "evil.example.com.oraclecloud.com" — refuse it instead.
    if (/\.[a-z]{2,}$/.test(host) && /\.(com|net|org|io|co|cloud|dev|app|gov|edu|info|biz|me|ru|cn)$/.test(host)) {
      throw new Error(`oracle: refusing non-oraclecloud host "${tenantHost}"`);
    }
    host += '.oraclecloud.com';
  }
  if (!/^[a-z0-9][a-z0-9.-]*\.oraclecloud\.com$/.test(host)) {
    throw new Error(`oracle: refusing non-oraclecloud host "${tenantHost}"`);
  }
  return host;
}

/**
 * The human careers URL. CONSTRUCTED, not stated by the payload — which is why
 * it is only produced when the caller supplies the tenant host, and why the
 * site number must be the one from the employer's real careers link. Oracle
 * 302-redirects a wrong site number to the canonical one, so a slightly wrong
 * value still lands, but the redirect is NOT proof the job exists (see TRAP in
 * the header).
 */
export function buildJobUrl(tenantHost, siteNumber, id) {
  if (!tenantHost || !id) return null;
  const site = stated(siteNumber) || 'CX_1';
  return `https://${normalizeTenantHost(tenantHost)}` +
         `/hcmUI/CandidateExperience/en/sites/${encodeURIComponent(site)}` +
         `/job/${encodeURIComponent(String(id))}`;
}

function buildListUrl(host, { siteNumber, limit, offset }) {
  const finder =
    `findReqs;siteNumber=${siteNumber},limit=${limit},offset=${offset}` +
    `,sortBy=POSTING_DATES_DESC`;
  return `https://${host}/hcmRestApi/resources/${ORACLE_API_VERSION}` +
         `/recruitingCEJobRequisitions?onlyData=true` +
         `&expand=${encodeURIComponent(ORACLE_EXPAND)}` +
         `&finder=${encodeURIComponent(finder)}`;
}

function buildDetailUrl(host, id, siteNumber = 'CX_1') {
  const finder = `ById;Id="${String(id)}",siteNumber=${siteNumber}`;
  return `https://${host}/hcmRestApi/resources/${ORACLE_API_VERSION}` +
         `/recruitingCEJobRequisitionDetails?onlyData=true&expand=all` +
         `&finder=${encodeURIComponent(finder)}`;
}

// ---------------------------------------------------------------------------
// PURE PARSER — list payload
// ---------------------------------------------------------------------------

/**
 * Parse one page of the recruitingCEJobRequisitions payload.
 *
 * @param {object} json    the decoded payload, exactly as Oracle returned it
 * @param {object} [opts]  { tenantHost, siteNumber } — only used to build the
 *                         human `url`; omit them and `url` is null.
 * @returns {{ total:number, offset:number, limit:number, jobs:Array,
 *             rejected:Array }}
 *
 * THROWS — loudly, never silently — when the payload is structurally wrong.
 * A crash is the correct outcome for an unknown shape (Rule 2.1: an unknown
 * option must fail loudly, never fall back to a destructive default). A
 * swallowed error here means "0 jobs", and 0 jobs means Bell deletes every
 * vacancy it holds for that employer.
 */
export function parseOracleJobs(json, opts = {}) {
  if (!json || typeof json !== 'object') {
    throw new Error('oracle: payload is not an object');
  }
  if (!Array.isArray(json.items)) {
    throw new Error('oracle: payload has no items[] — endpoint shape changed');
  }
  if (json.items.length === 0) {
    throw new Error('oracle: items[] is empty — expected one search result');
  }

  const result = json.items[0];
  const total  = Number.isFinite(result.TotalJobsCount) ? result.TotalJobsCount : null;
  if (total === null) {
    throw new Error('oracle: no TotalJobsCount — endpoint shape changed');
  }

  const offset = Number.isFinite(result.Offset) ? result.Offset : 0;
  const limit  = Number.isFinite(result.Limit)  ? result.Limit  : DEFAULT_PAGE_SIZE;

  // Behaviour 2: the &expand= trap. The key is ABSENT (not empty) when the
  // expand clause was dropped. An empty page legitimately returns [].
  if (!('requisitionList' in result)) {
    throw new Error(
      `oracle: TotalJobsCount=${total} but the payload carries no ` +
      `requisitionList key — the &expand= clause was dropped. This is NOT an ` +
      `empty board.`,
    );
  }
  const list = result.requisitionList;
  if (!Array.isArray(list)) {
    throw new Error('oracle: requisitionList is not an array');
  }

  // The same trap, second form: key present but empty on the FIRST page while
  // the board reports jobs. Only meaningful at offset 0 — past the end of a
  // paginated board an empty page is the normal termination signal.
  if (offset === 0 && total > 0 && list.length === 0) {
    throw new Error(
      `oracle: TotalJobsCount=${total} but zero requisitions parsed on the ` +
      `first page — treat as an ERROR, never as an empty board.`,
    );
  }

  const jobs = [];
  const rejected = [];

  for (const req of list) {
    if (!req || typeof req !== 'object') {
      rejected.push({ reason: 'not an object', req });
      continue;
    }
    const externalId = stated(req.Id);
    const title      = content(req.Title);

    // A requisition with no id cannot be tracked, and one with no title cannot
    // be shown. Skipped and counted — never invented.
    if (!externalId) { rejected.push({ reason: 'no Id', req }); continue; }
    if (!title)      { rejected.push({ reason: 'no Title', external_id: externalId }); continue; }

    jobs.push({
      external_id: externalId,
      title,                                             // VERBATIM
      posted_at: statedDate(req.PostedDate),
      posted_at_precision: statedDate(req.PostedDate) ? 'date' : null,
      location_text: stated(req.PrimaryLocation),
      country_code: statedCountry(req.PrimaryLocationCountry),
      employer_stated: firstStatedEmployer(req),
      url: opts.tenantHost
        ? buildJobUrl(opts.tenantHost, opts.siteNumber, externalId)
        : null,

      // Stated-but-usually-blank. Passed through verbatim; the ingest layer
      // decides what, if anything, to do with them. Never turned into
      // is_remote or employment_type here.
      workplace_type_stated: stated(req.WorkplaceType),
      workplace_type_code: stated(req.WorkplaceTypeCode),

      // Stated by nobody on this source — present and explicitly null so a
      // reader of this record can see the refusal rather than wonder.
      expires_at: statedInstant(req.PostingEndDate),   // null on 86/86 in list
      employment_type: null,
      seniority_level: null,
      job_function: null,
      industries: null,
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      salary_period: null,
      applicant_count: null,

      raw: req,        // verbatim; persist via packRaw() (Rule 2.4)
    });
  }

  return { total, offset, limit, jobs, rejected };
}

/**
 * The employer as the SOURCE states it. Null on 86 of 86 requisitions observed
 * across seven tenants — kept so that a tenant which does populate it is
 * captured, and so nobody later "fixes" the gap with organizationsFacet.
 */
function firstStatedEmployer(req) {
  return stated(req.LegalEmployer)
      ?? stated(req.Organization)
      ?? stated(req.BusinessUnit)
      ?? stated(req.Department)
      ?? null;
}

// ---------------------------------------------------------------------------
// PURE PARSER — detail payload (carries the stated expiry + the closure signal)
// ---------------------------------------------------------------------------

/**
 * @returns {{ found:boolean, job:object|null }}
 *
 * found:false means Oracle no longer publishes this requisition — it was
 * withdrawn, filled, or expired. Verified 11/11 live. THIS is the per-job
 * closure signal; the careers-page redirect is not.
 */
export function parseOracleJobDetail(json, opts = {}) {
  if (!json || typeof json !== 'object') {
    throw new Error('oracle: detail payload is not an object');
  }
  if (!Array.isArray(json.items)) {
    throw new Error('oracle: detail payload has no items[] — shape changed');
  }
  if (json.items.length === 0) return { found: false, job: null };

  const d = json.items[0];
  const externalId = stated(d.Id);
  if (!externalId) throw new Error('oracle: detail item has no Id');

  const startInstant = statedInstant(d.ExternalPostedStartDate);

  return {
    found: true,
    job: {
      external_id: externalId,
      title: content(d.Title),
      posted_at: startInstant,
      posted_at_precision: startInstant ? 'instant' : null,

      // The one genuinely stated expiry on this source. Null on 2 of 4 tenants
      // checked — absent it, nothing is assumed.
      expires_at: statedInstant(d.ExternalPostedEndDate),

      location_text: stated(d.PrimaryLocation),
      country_code: statedCountry(d.PrimaryLocationCountry),
      employer_stated: firstStatedEmployer(d),

      description: content(d.ExternalDescriptionStr),          // HTML, verbatim
      short_description: content(d.ShortDescriptionStr),
      responsibilities: content(d.ExternalResponsibilitiesStr),
      qualifications: content(d.ExternalQualificationsStr),

      // Verbatim vocabulary, deliberately NOT mapped. RequisitionType reads
      // "Full Time Employee (FTE)" / "Professional" / "Permanent" on three
      // different tenants — three taxonomies, not one employment_type.
      requisition_type_stated: stated(d.RequisitionType),
      schedule_stated: stated(d.JobSchedule),
      category_stated: stated(d.Category),
      study_level_stated: stated(d.StudyLevel),
      workplace_type_stated: stated(d.WorkplaceType),
      workplace_type_code: stated(d.WorkplaceTypeCode),

      // Refused — see the header block.
      employment_type: null,
      seniority_level: null,
      job_function: null,
      industries: null,
      salary_min: null,
      salary_max: null,
      salary_currency: null,
      salary_period: null,
      applicant_count: null,

      coordinates: parseCoordinates(d.primaryLocationCoordinates),
      raw: d,
    },
  };
}

/** Coordinates only when both numbers are genuinely present and finite. */
function parseCoordinates(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  const c = arr[0];
  if (!c) return null;
  const lat = Number(stated(c.Latitude));
  const lng = Number(stated(c.Longitude));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (lat === 0 && lng === 0) return null;                 // Null Island
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

// ---------------------------------------------------------------------------
// THIN FETCH WRAPPERS — the only part that touches the network
// ---------------------------------------------------------------------------

async function getJson(url, timeoutMs) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ac.signal,
      headers: { accept: 'application/json', 'user-agent': USER_AGENT },
    });
    if (!res.ok) {
      throw new Error(`oracle: HTTP ${res.status} for ${url}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fetch every requisition on a tenant's board, following pagination.
 *
 * Proven live on hcxg.fa.em2 (Technip Energies): 9 requests, 176 ids collected,
 * 176 unique, TotalJobsCount 176 — no gaps, no duplicates.
 *
 * @returns {{ total, jobs, rejected, pages, complete }}
 *   `complete` is TRUE only when the sweep collected exactly TotalJobsCount
 *   distinct requisitions. A caller must NOT retire missing vacancies on an
 *   incomplete sweep — that is how a network hiccup deletes a live board.
 */
export async function fetchOracleJobs(tenantHost, opts = {}) {
  const host       = normalizeTenantHost(tenantHost);
  const siteNumber = stated(opts.siteNumber) || 'CX_1';   // no-op for the API
  const pageSize   = Number.isFinite(opts.limit) && opts.limit > 0
    ? Math.min(opts.limit, 200) : DEFAULT_PAGE_SIZE;
  const timeoutMs  = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const maxPages   = Number.isFinite(opts.maxPages) ? opts.maxPages : MAX_PAGES;

  const jobs = [];
  const rejected = [];
  const seen = new Set();
  let total = 0;
  let pages = 0;

  for (let offset = 0; pages < maxPages; offset += pageSize) {
    const url  = buildListUrl(host, { siteNumber, limit: pageSize, offset });
    const json = await getJson(url, timeoutMs);
    const page = parseOracleJobs(json, { tenantHost: host, siteNumber });
    pages++;
    total = page.total;
    rejected.push(...page.rejected);

    if (page.jobs.length === 0) break;                    // normal termination

    for (const job of page.jobs) {
      if (seen.has(job.external_id)) continue;            // defensive
      seen.add(job.external_id);
      jobs.push(job);
    }
    if (jobs.length >= total) break;
  }

  return {
    total,
    jobs,
    rejected,
    pages,
    tenant_host: host,
    site_number: siteNumber,
    complete: jobs.length === total,
  };
}

/**
 * Fetch one requisition's detail — the per-job closure check.
 * `found:false` means the vacancy is gone and must stop showing.
 */
export async function fetchOracleJobDetail(tenantHost, id, opts = {}) {
  const host = normalizeTenantHost(tenantHost);
  const siteNumber = stated(opts.siteNumber) || 'CX_1';
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : DEFAULT_TIMEOUT_MS;
  const json = await getJson(buildDetailUrl(host, id, siteNumber), timeoutMs);
  return parseOracleJobDetail(json, { tenantHost: host, siteNumber });
}
