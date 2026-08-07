// QatarEnergy career portal (iCIMS behind a Jibe/Radancy front end) — job reader.
// ============================================================================
// Source:   https://careerportal.qatarenergy.qa/jobs/{id}?lang=en-us
// robots.txt (fetched live 2026-08-07, verbatim):
//     User-agent: *
//     Allow: /
//     Sitemap: http://careerportal.qatarenergy.qa/sitemap.xml
//     crawl-delay: 5
// The 5-second delay is STATED by the site, so it is honoured here, not optional.
// Every network call in this file goes through one process-wide gate that keeps
// requests to this host at least QE_CRAWL_DELAY_MS apart.
//
// This source NAMES ITS OWN EMPLOYER (hiringOrganization = "QatarEnergy"), so it
// never depends on Bell's company -> website link being correct.
//
// ---------------------------------------------------------------------------
// ⚠️ THE TRAP THAT MAKES THIS FILE LOOK PARANOID: validThrough IS FABRICATED
// ---------------------------------------------------------------------------
// Every job page carries a schema.org JobPosting in <script type="application/
// ld+json">. It ALWAYS has a `validThrough`. That date is NOT always a statement
// by QatarEnergy.
//
// Measured on 43 live job pages, 2026-08-07, zero exceptions:
//   •  8 pages where the underlying iCIMS record states `posting_expiry_date`:
//      ld+json validThrough == that stated date, exactly.               8/8
//   • 35 pages where the iCIMS record states NO expiry at all:
//      ld+json validThrough == job.create_date + EXACTLY 365 days,
//      to the second, across create dates from Jan-2025 to Aug-2026.   35/35
//
// A "standard" schema.org mapper that reads validThrough would therefore have
// invented an expiry date for 35 of 43 postings (81%), and would have marked
// NINE currently-listed, still-applyable vacancies as expired and pulled them
// off Bell's portal — among them 'FRESH QATARI GRADUATES' (3488), 'STATION
// COMMANDER' (3202) and 'RELIABILITY ENGINEER (MAJOR R/E)' (3087), all of which
// QatarEnergy still lists in its own sitemap today.
//
// So: expires_at comes ONLY from the iCIMS record's own `posting_expiry_date`
// (or the identical `meta_data.icims.primary_posted_site_object.validThrough`).
// The ld+json validThrough is read only to CROSS-CHECK it, never to supply it.
// If the structured iCIMS payload is missing, expires_at stays NULL — because
// then we cannot tell a stated date from a manufactured one.
//
// ---------------------------------------------------------------------------
// ⚠️ THE SALARY TRAP (live, on every single page)
// ---------------------------------------------------------------------------
// 43/43 pages state, identically:
//     "salaryCurrency": "USD",
//     "baseSalary": { "@type":"MonetaryAmount", "currency":"USD",
//                     "value": { "value":0, "minValue":0, "maxValue":0,
//                                "unitText":"YEAR" } }
// Job 5731 (HEAD, QHSE — DOHA) is the canonical case. A naive mapper writes a
// zero-dollar US salary onto a Doha job. Two independent refusals below:
//   (a) a zero / non-finite / negative figure is not a salary;
//   (b) the currency is a TEMPLATE CONSTANT on this source, not a per-job
//       statement — 35 of the 43 pages carry "USD" while stating no salary at
//       all — so even a non-zero figure cannot be trusted to be US dollars.
// Result: this source never yields salary_min / salary_max / salary_currency.
// If a non-zero figure ever appears, the record carries `_salary_review` so a
// human sees it, instead of the number being silently published or silently
// dropped. That is the loud failure Rule 2.1 asks for.
//
// ---------------------------------------------------------------------------
// FIELDS THIS SOURCE DOES NOT STATE — and which therefore stay NULL
// ---------------------------------------------------------------------------
//   employment_type   43/43 pages say the literal string "UNAVAILABLE"
//   industries        43/43 pages say the literal string "UNAVAILABLE"
//   seniority_level   not present in any payload. Reading it off a job title
//                     ("SR. PIPELINE INSPECTOR") is a guess.
//   job_function      not present. The site DOES state its own `category`
//                     ("Project Engineering", "Drilling", …) — that is kept
//                     verbatim in extra_fields.category, and is deliberately
//                     NOT poured into job_function, because mapping one
//                     vocabulary onto another is the same class of error as
//                     deriving a tender's industry from the buyer's department.
//   is_remote /       not stated. Every page has location_type "LAT_LNG" and a
//   workplace_type    physical Qatar address; absence of the word "remote" is
//                     not a statement that the job is on-site.
//   applicant_count   not stated.
//   salary_*          see the salary trap above.
//
// Verified with: server/tests/jobs_qatarenergy.test.mjs (real captured pages).
// ============================================================================

import { packRaw } from '../../tenders/raw.js';
import { fetchPage } from '../../enrichment/local/http.js';

export const QE_SOURCE        = 'qatarenergy';
export const QE_HOST          = 'careerportal.qatarenergy.qa';
export const QE_BASE_URL      = `https://${QE_HOST}`;
export const QE_SITEMAP_URL   = `${QE_BASE_URL}/sitemap.xml`;
export const QE_CRAWL_DELAY_MS = 5000;          // stated by robots.txt
export const QE_EMPLOYER_NAME = 'QatarEnergy';  // the page names its own employer
export const QE_PARSER_V      = 1;

/** How many sitemaps deep we are willing to follow (index -> children). */
const QE_MAX_SITEMAPS = 20;

// ---------------------------------------------------------------------------
// Small value guards — "the source did not say it" always wins.
// ---------------------------------------------------------------------------

/**
 * The Jibe/iCIMS template writes the literal string "UNAVAILABLE" where the ATS
 * has no value. It is a placeholder, not a value. Empty strings likewise.
 */
function stated(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;
  if (s.toUpperCase() === 'UNAVAILABLE') return null;
  return s;
}

/** A finite number, or null. Strings that merely look numeric are not accepted. */
function finiteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/**
 * Parse an instant the source published, into an ISO-8601 UTC string.
 * Accepts the two shapes this source actually emits — "+0000" and "Z" — plus
 * any explicit numeric offset. REFUSES a bare local datetime with no zone,
 * because the zone would then be a guess.
 * @returns {string|null}
 */
export function qeParseInstant(value) {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(Z|[+-]\d{2}:?\d{2})$/.exec(s);
  if (!m) return null;
  const zone = m[8] === 'Z' ? 'Z' : (m[8].length === 5 ? `${m[8].slice(0, 3)}:${m[8].slice(3)}` : m[8]);
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? '00'}.${(m[7] ?? '0').padEnd(3, '0')}${zone}`;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

// ---------------------------------------------------------------------------
// Extracting the two payloads a job page carries
// ---------------------------------------------------------------------------

/**
 * The schema.org JobPosting block. Pure.
 * A page may carry several ld+json blocks (breadcrumbs, org, …) — take the
 * JobPosting one, never "the first one".
 * @returns {object|null}
 */
export function qeExtractJobPosting(html) {
  if (typeof html !== 'string' || !html) return null;
  const rx = /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = rx.exec(html)) !== null) {
    let parsed;
    try { parsed = JSON.parse(m[1]); } catch { continue; }
    const candidates = Array.isArray(parsed) ? parsed
      : (Array.isArray(parsed?.['@graph']) ? parsed['@graph'] : [parsed]);
    for (const c of candidates) {
      const t = c?.['@type'];
      const types = Array.isArray(t) ? t : [t];
      if (types.includes('JobPosting')) return c;
    }
  }
  return null;
}

/**
 * `window.jobDescriptionConfig = { … }` — the structured payload the ld+json is
 * generated FROM. This is the authoritative record: it is the only place that
 * distinguishes a stated expiry from no expiry.
 *
 * Anchored on the exact identifier. The same page also assigns
 * `window.jobDescriptionTemplates`, which contains a SECOND copy of the job
 * fields (including another "posted_date"); a parser that searched the page for
 * a key name rather than reading this object would read the wrong copy.
 * Brace-matching is string- and escape-aware, so a `{` or `}` inside a job
 * description cannot end the object early.
 * @returns {object|null} the `job` sub-object, or null
 */
export function qeExtractJobConfig(html) {
  if (typeof html !== 'string' || !html) return null;
  const anchor = /window\.jobDescriptionConfig\s*=\s*\{/.exec(html);
  if (!anchor) return null;
  const start = anchor.index + anchor[0].length - 1;   // at the '{'

  let depth = 0, inString = false, escaped = false, end = -1;
  for (let i = start; i < html.length; i++) {
    const ch = html[i];
    if (escaped) { escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return null;

  let cfg;
  try { cfg = JSON.parse(html.slice(start, end + 1)); } catch { return null; }
  const job = cfg?.job;
  return (job && typeof job === 'object' && !Array.isArray(job)) ? job : null;
}

// ---------------------------------------------------------------------------
// Expiry — the whole point of this file
// ---------------------------------------------------------------------------

/**
 * The expiry QatarEnergy actually STATES, plus the evidence for the verdict.
 *
 * `posting_expiry_date` and `meta_data.icims.primary_posted_site_object
 * .validThrough` are the two places the ATS publishes a real expiry; on all 8
 * live pages that had one, the two agreed exactly. If they ever disagree we
 * refuse the field rather than pick a winner.
 *
 * @param {object|null} job    the jobDescriptionConfig.job object
 * @param {object|null} posting the ld+json JobPosting (cross-check only)
 * @returns {{expiresAt: string|null, source: string, note: string}}
 */
export function qeStatedExpiry(job, posting) {
  const fromJob = qeParseInstant(job?.posting_expiry_date);
  const pps = job?.meta_data?.icims?.primary_posted_site_object;
  const fromSite = qeParseInstant(pps?.validThrough);
  const fromLd = qeParseInstant(posting?.validThrough);

  if (fromJob && fromSite && fromJob !== fromSite) {
    return {
      expiresAt: null,
      source: 'conflict',
      note: `iCIMS states two different expiries (posting_expiry_date=${fromJob}, primary_posted_site_object.validThrough=${fromSite}); refused`,
    };
  }

  const statedExpiry = fromJob || fromSite;
  if (statedExpiry) {
    return {
      expiresAt: statedExpiry,
      source: fromJob ? 'icims.posting_expiry_date' : 'icims.primary_posted_site_object.validThrough',
      note: (fromLd && fromLd !== statedExpiry)
        ? `ld+json validThrough (${fromLd}) disagrees with the stated expiry; the stated one wins`
        : 'stated by the source',
    };
  }

  // No stated expiry. The ld+json still carries one — it is create_date + 365d.
  if (!job) {
    return {
      expiresAt: null,
      source: 'none',
      note: 'no iCIMS payload on the page, so a stated expiry cannot be told from a generated one; refused',
    };
  }
  return {
    expiresAt: null,
    source: 'none',
    note: fromLd
      ? `source states no expiry; ld+json validThrough (${fromLd}) is generated from create_date + 365 days and is not a claim by QatarEnergy`
      : 'source states no expiry',
  };
}

/**
 * Salary, refused for this source — with the reason attached rather than hidden.
 * Exported so the test can prove the refusal on the live 5731 payload.
 * @returns {{salary: null, review: object|null}}
 */
export function qeStatedSalary(posting) {
  const base = posting?.baseSalary;
  if (!base || typeof base !== 'object') return { salary: null, review: null };
  const v = base.value && typeof base.value === 'object' ? base.value : {};
  const figures = [finiteNumber(v.value), finiteNumber(v.minValue), finiteNumber(v.maxValue)]
    .filter((n) => n !== null && n > 0);

  // (a) no positive figure -> nothing was stated. The 0/0/0 case. Silent, normal.
  if (figures.length === 0) return { salary: null, review: null };

  // (b) a positive figure DID appear. The currency on this source is a template
  //     constant ("USD" on 43/43 pages, 35 of which state no salary at all), so
  //     the amount cannot be published without a human confirming the currency.
  return {
    salary: null,
    review: {
      reason: 'qatarenergy_states_a_figure_but_its_currency_is_a_template_constant',
      figures,
      currency_as_published: stated(base.currency) || stated(posting?.salaryCurrency) || null,
      unit_as_published: stated(v.unitText) || null,
    },
  };
}

// ---------------------------------------------------------------------------
// The parser
// ---------------------------------------------------------------------------

/**
 * PURE. Turn one already-fetched job page into a Bell `jobs` record.
 *
 * @param {string} html   the page exactly as the server sent it
 * @param {object} [opts]
 * @param {Date|number|string} [opts.now]  evaluation instant for is_active
 * @param {string} [opts.url]              the URL this html came from
 * @returns {object|null}  null when the page carries no job (404 shell, error page)
 */
export function parseQatarEnergyJob(html, opts = {}) {
  const posting = qeExtractJobPosting(html);
  const job = qeExtractJobConfig(html);
  if (!posting && !job) return null;

  const nowMs = opts.now == null ? Date.now() : new Date(opts.now).getTime();

  // --- identity -----------------------------------------------------------
  const externalId = stated(job?.req_id) || stated(job?.slug) || qeIdFromUrl(posting?.url) || qeIdFromUrl(opts.url);
  const sourceUrl = stated(posting?.url) || stated(opts.url) || (externalId ? qeJobUrl(externalId) : null);

  // --- what the page states ----------------------------------------------
  const title = stated(job?.title) || stated(posting?.title);

  // `description` is the full posting body, verbatim HTML as published.
  // The page ALSO publishes `qualifications` and `responsibilities` separately,
  // but measured on all 43 live pages each of those is a verbatim substring of
  // `description` (43/43 and 42/42 — one page has no responsibilities block),
  // so copying them into extra_fields would only duplicate bytes.
  // Note: QatarEnergy's own "responsibilities" block in fact holds education
  // requirements on many rows. That is the employer's labelling; nothing here
  // relabels or reinterprets it.
  const description = stated(job?.description) || stated(posting?.description) || null;

  const addr = posting?.jobLocation?.address || {};
  const locationText = stated(job?.full_location)
    || stated(job?.short_location)
    || [stated(addr.addressLocality), stated(addr.addressCountry)].filter(Boolean).join(', ')
    || null;

  const postedAt = qeParseInstant(job?.posted_date) || qeParseInstant(posting?.datePosted);
  const expiry = qeStatedExpiry(job, posting);
  const salary = qeStatedSalary(posting);

  const employer = stated(job?.hiring_organization)
    || stated(posting?.hiringOrganization?.name)
    || stated(job?.brand)
    || null;

  // --- is the vacancy open? ----------------------------------------------
  // Only a STATED expiry that has passed closes a job here. A page that no
  // longer exists is closed too, but that verdict belongs to the fetcher — an
  // HTML body cannot tell you it 404'd.
  const expired = expiry.expiresAt != null && Date.parse(expiry.expiresAt) <= nowMs;
  const isActive = !expired;

  // --- raw payload (Rule 2.4: packRaw, never a slice) ---------------------
  // The three HTML bodies already live in their own columns; keeping them here
  // as well is what would push the payload past the jsonb limit.
  const rawSource = {
    parser: 'qatarenergy',
    parser_v: QE_PARSER_V,
    job: job ? stripBodies(job) : null,
    ld_json: posting ? stripBodies(posting) : null,
  };
  const rawPayload = packRaw(rawSource);

  return {
    // ---- jobs columns the source genuinely states ----
    title,
    description,
    location_text: locationText,
    posted_at: postedAt,
    expires_at: expiry.expiresAt,
    is_active: isActive,

    // ---- jobs columns nobody states here: left NULL on purpose ----
    is_remote: null,
    workplace_type: null,
    employment_type: null,     // "UNAVAILABLE" on 43/43 live pages
    seniority_level: null,     // never published; inferring from the title is a guess
    job_function: null,        // see extra_fields.category
    industries: null,          // "UNAVAILABLE" on 43/43 live pages
    salary_min: null,
    salary_max: null,
    salary_currency: null,
    salary_period: null,
    applicant_count: null,
    company_id: null,          // the ingest links it; the page names the employer below

    // ---- provenance ----
    source: QE_SOURCE,
    source_url: sourceUrl,
    external_id: externalId,

    extra_fields: compact({
      employer_name: employer,
      apply_url: stated(job?.apply_url),
      // The site's own taxonomy, verbatim. Deliberately not mapped to job_function.
      category: Array.isArray(job?.categories)
        ? job.categories.map((c) => stated(c?.name)).filter(Boolean)
        : (Array.isArray(job?.category) ? job.category.map(stated).filter(Boolean) : null),
      recruitment_track: Array.isArray(job?.tags1) ? job.tags1.map(stated).filter(Boolean) : null,
      job_grade: Array.isArray(job?.tags3) ? job.tags3.map(stated).filter(Boolean) : null,
      city: stated(job?.city) || stated(addr.addressLocality),
      country: stated(job?.country) || stated(addr.addressCountry),
      country_code: stated(job?.country_code),
      street_address: stated(job?.street_address) || stated(addr.streetAddress),
      latitude: finiteNumber(job?.latitude),
      longitude: finiteNumber(job?.longitude),
      ats_code: stated(job?.ats_code),
      applyable: typeof job?.applyable === 'boolean' ? job.applyable : null,
      searchable: typeof job?.searchable === 'boolean' ? job.searchable : null,
      source_create_date: qeParseInstant(job?.create_date),
      source_update_date: qeParseInstant(job?.update_date),
      // Bell's own bookkeeping, clearly labelled as such — never a source claim.
      expiry_provenance: expiry.source,
      expiry_note: expiry.note,
      ld_json_valid_through: stated(posting?.validThrough),
    }),

    raw_payload: rawPayload,

    // ---- not columns: keys prefixed `_` are for the ingest layer / review ----
    _employer_name: employer,
    _raw_too_large: rawPayload === null,
    _salary_review: salary.review,
    _closure: {
      state: isActive ? 'open' : 'expired',
      reason: expired
        ? 'the source states an expiry date that has passed'
        : (expiry.expiresAt
          ? 'the source states an expiry date still in the future'
          : 'the source states no expiry; the page is served and the posting is listed'),
      evidence: expiry.note,
    },
  };
}

function stripBodies(obj) {
  const out = { ...obj };
  delete out.description;
  delete out.qualifications;
  delete out.responsibilities;
  return out;
}

function compact(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out;
}

/** `https://…/jobs/5731?lang=en-us` -> `5731`; anything else -> null. */
export function qeIdFromUrl(url) {
  if (typeof url !== 'string') return null;
  const m = /\/jobs\/(\d+)(?:[/?#]|$)/.exec(url);
  return m ? m[1] : null;
}

export function qeJobUrl(id) {
  return `${QE_BASE_URL}/jobs/${encodeURIComponent(String(id))}?lang=en-us`;
}

// ---------------------------------------------------------------------------
// Sitemap parsing (pure)
// ---------------------------------------------------------------------------

/** `<sitemapindex>` children. PURE. @returns {{loc:string,lastmod:string|null}[]} */
export function parseQatarEnergySitemapIndex(xml) {
  if (typeof xml !== 'string' || !/<sitemapindex/i.test(xml)) return [];
  return blocks(xml, 'sitemap').map((b) => ({
    loc: text(b, 'loc'),
    lastmod: text(b, 'lastmod'),
  })).filter((s) => s.loc);
}

/**
 * `<urlset>` job entries. PURE.
 *
 * ⚠️ Membership of this sitemap means "QatarEnergy lists this URL". It does NOT
 * mean the vacancy is open — 9 of 43 sampled entries carried a ld+json expiry
 * already in the past (all of them fabricated, see the header). Never report
 * "in the sitemap" as "open".
 *
 * @returns {{url:string,id:string,lastmod:string|null}[]}
 */
export function parseQatarEnergyJobSitemap(xml) {
  if (typeof xml !== 'string' || !/<urlset/i.test(xml)) return [];
  const out = [];
  const seen = new Set();
  for (const b of blocks(xml, 'url')) {
    const url = text(b, 'loc');
    if (!url) continue;
    const id = qeIdFromUrl(url);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ url, id, lastmod: text(b, 'lastmod') });
  }
  return out;
}

function blocks(xml, tag) {
  const rx = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'gi');
  const out = [];
  let m;
  while ((m = rx.exec(xml)) !== null) out.push(m[1]);
  return out;
}

function text(block, tag) {
  const m = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, 'i').exec(block);
  if (!m) return null;
  const s = m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
  return s || null;
}

// ---------------------------------------------------------------------------
// Fetching — thin, and politely rate-limited
// ---------------------------------------------------------------------------

const QE_USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/124.0 Safari/537.36 BellBot/1.0 (+https://bell.qa/bot)';

let gate = Promise.resolve();
let lastRequestAt = 0;

/** Serialise every request to this host, at least `delayMs` apart. */
function politely(delayMs, fn) {
  const run = gate.then(async () => {
    const wait = lastRequestAt + delayMs - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastRequestAt = Date.now();
    return fn();
  });
  gate = run.then(() => {}, () => {});
  return run;
}

async function get(url, opts) {
  const {
    delayMs = QE_CRAWL_DELAY_MS,
    timeoutMs = 30_000,
    retries = 1,
    fetchImpl = fetchPage,     // injectable so tests never touch the network
  } = opts || {};
  return politely(delayMs, () => fetchImpl(url, { timeoutMs, retries, respectRobots: true }));
}

/**
 * The sitemaps are served as `text/xml; charset=utf-8`, which the shared
 * fetchPage() rejects as non-HTML (its allow-list covers text/html,
 * application/xhtml and application/xml — not text/xml). Proven live:
 * fetchPage('…/sitemap.xml') returns { ok:false, error:'non_html' }.
 * So sitemaps get their own tiny reader. Same politeness gate, same 3 MB cap.
 */
async function getXml(url, opts) {
  const {
    delayMs = QE_CRAWL_DELAY_MS,
    timeoutMs = 30_000,
    xmlFetchImpl,
    fetchImpl,
  } = opts || {};
  // A test-injected transport wins, so the suite never touches the network.
  const injected = xmlFetchImpl || fetchImpl;
  if (injected) return politely(delayMs, () => injected(url, { timeoutMs }));

  return politely(delayMs, async () => {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': QE_USER_AGENT, Accept: 'application/xml,text/xml,*/*;q=0.8' },
        redirect: 'follow',
        signal: ctl.signal,
      });
      if (!res.ok) return { ok: false, status: res.status, finalUrl: res.url || url, html: '', error: 'http_' + res.status };
      const body = await res.text();
      return { ok: true, status: res.status, finalUrl: res.url || url, html: body.slice(0, 3_000_000) };
    } catch (err) {
      return { ok: false, status: 0, finalUrl: url, html: '', error: String(err?.message || err) };
    } finally {
      clearTimeout(to);
    }
  });
}


/**
 * Every job URL QatarEnergy lists. Follows the sitemap index to its children,
 * one request every 5 s.
 * @returns {Promise<{url:string,id:string,lastmod:string|null}[]>}
 */
export async function fetchQatarEnergySitemap(opts = {}) {
  const indexUrl = opts.sitemapUrl || QE_SITEMAP_URL;
  const first = await getXml(indexUrl, opts);
  if (!first.ok) throw new Error(`qatarenergy sitemap ${indexUrl}: ${first.error || first.status}`);

  const direct = parseQatarEnergyJobSitemap(first.html);
  if (direct.length) return direct;

  const children = parseQatarEnergySitemapIndex(first.html).slice(0, QE_MAX_SITEMAPS);
  const out = [];
  const seen = new Set();
  for (const child of children) {
    // The index advertises https for its children; keep whatever it published.
    const res = await getXml(child.loc, opts);
    if (!res.ok) continue;
    for (const entry of parseQatarEnergyJobSitemap(res.html)) {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push(entry);
    }
  }
  return out;
}

/**
 * One job, fetched and parsed. Honours the 5 s crawl-delay.
 *
 * A removed posting answers 404 (proven live: 5 delisted ids, 5/5 → 404, and
 * the body carries no ld+json and no jobDescriptionConfig). That 404 is the
 * strongest closure signal this source gives, so it is reported explicitly
 * rather than swallowed.
 *
 * @returns {Promise<{ok:boolean, status:number, closed:boolean, reason:string|null, record:object|null}>}
 */
export async function fetchQatarEnergyJob(id, opts = {}) {
  const url = opts.url || qeJobUrl(id);
  const res = await get(url, opts);

  if (!res.ok) {
    const gone = res.status === 404 || res.status === 410;
    return {
      ok: false,
      status: res.status || 0,
      closed: gone,
      reason: gone
        ? 'the posting is gone from the career portal (HTTP ' + res.status + ')'
        : null,
      error: res.error || null,
      record: null,
    };
  }

  const record = parseQatarEnergyJob(res.html, { now: opts.now, url: res.finalUrl || url });
  if (!record) {
    // 200 with no job payload — an error shell. NOT evidence the job closed.
    return { ok: false, status: res.status, closed: false, reason: null, error: 'no_job_payload', record: null };
  }
  return {
    ok: true,
    status: res.status,
    closed: record.is_active === false,
    reason: record.is_active === false ? record._closure.reason : null,
    error: null,
    record,
  };
}
