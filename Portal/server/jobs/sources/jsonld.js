// A company's OWN careers page — read only where the page states its vacancies in a machine
// -readable form it published itself.
//
// Val, 2026-08-07: cover "not only for the big websites, big companies, but also for the entire
// active companies database." Bell holds 238 careers pages on companies' own domains and had a
// reader for none of them, because every one is a different hand-built HTML layout.
//
// ── WHY THIS READS STRUCTURED DATA AND NOTHING ELSE ──────────────────────────────────────────
// The tempting approach is to scrape the visible page: find the headings that look like job
// titles, the dates that look like posting dates. That is guessing, and it fails in the specific
// way Rule 2.1 exists to prevent — it produces confident, plausible, WRONG rows. A careers page's
// "Life at X" testimonials become vacancies; a "since 2019" becomes a posted date.
//
// schema.org/JobPosting is different: it is a claim the site itself publishes, in a named field,
// for search engines to read. Google requires it for a job to appear in Google Jobs, so serious
// Qatar employers emit it. If a page carries no JobPosting, this reader returns nothing and says
// so — an honest zero, which the sweeper records as a read with no vacancies rather than a failure.
//
// ── THE FABRICATED-EXPIRY TRAP ───────────────────────────────────────────────────────────────
// QatarEnergy's pages carry a validThrough that is create_date plus EXACTLY 365 days whenever the
// underlying ATS states no real expiry. Trusting it would have closed 9 of 43 live vacancies. That
// is an ATS default, not a QatarEnergy quirk, so the same guard applies here: a validThrough
// exactly one year after datePosted is treated as unstated. Bell would rather keep showing a job
// one week too long than delete a live vacancy — and absence from the board closes it anyway.

import { fetchPage } from '../../enrichment/local/http.js';

export const JSONLD_SOURCE = 'own_site';

/** Every <script type="application/ld+json"> payload on the page, parsed, junk skipped. */
export function extractLdBlocks(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    let text = m[1].trim();
    if (!text) continue;
    // Some CMSs wrap the payload in a CDATA guard or an HTML comment.
    text = text.replace(/^<!--/, '').replace(/-->$/, '').replace(/^\/\/\s*<!\[CDATA\[/, '').replace(/\]\]>$/, '').trim();
    try { out.push(JSON.parse(text)); } catch { /* a malformed block is not a vacancy */ }
  }
  return out;
}

const typeList = (t) => (Array.isArray(t) ? t : [t]).filter(Boolean).map(String);
const isJobPosting = (n) => n && typeof n === 'object' && typeList(n['@type']).some((t) => /(^|\/)JobPosting$/i.test(t));

/** Walk a parsed block and collect every JobPosting, including inside @graph and ItemList. */
export function collectJobPostings(node, depth = 0, seen = new Set()) {
  if (!node || typeof node !== 'object' || depth > 6) return [];
  if (seen.has(node)) return [];
  seen.add(node);
  if (Array.isArray(node)) return node.flatMap((n) => collectJobPostings(n, depth + 1, seen));
  if (isJobPosting(node)) return [node];
  const out = [];
  // Only the containers the vocabulary actually uses. Walking every key would drag in unrelated
  // nested objects and slow this to a crawl on a big page.
  for (const key of ['@graph', 'itemListElement', 'item', 'mainEntity', 'mainEntityOfPage', 'hasPart']) {
    if (node[key]) out.push(...collectJobPostings(node[key], depth + 1, seen));
  }
  return out;
}

const str = (v) => {
  if (v == null) return null;
  if (typeof v === 'string') { const s = v.trim(); return s || null; }
  if (typeof v === 'number') return String(v);
  if (typeof v === 'object') return str(v.name) || str(v['@value']);
  return null;
};

/** An ISO instant, or null. A date-only value is kept as stated (midnight UTC). */
export function ldInstant(v) {
  const s = str(v);
  if (!s) return null;
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  // A posting dated in the far future or before the web existed is a serialiser artefact.
  const year = new Date(t).getUTCFullYear();
  if (year < 1996 || year > new Date().getUTCFullYear() + 5) return null;
  return new Date(t).toISOString();
};

/** "Doha, Qatar" from jobLocation.address, using only fields the page states. */
export function ldLocation(job) {
  const locs = Array.isArray(job.jobLocation) ? job.jobLocation : [job.jobLocation];
  for (const l of locs) {
    const a = l?.address || l;
    if (!a) continue;
    const parts = [str(a.addressLocality), str(a.addressRegion), str(a.addressCountry)].filter(Boolean);
    if (parts.length) return parts.join(', ');
    const single = str(a);
    if (single) return single;
  }
  return null;
}

// The gap that means "no real expiry was stated" — see the header. 365 days, to the day, with a
// tolerance of a few minutes for serialisers that re-stamp the clock.
const YEAR_MS = 365 * 24 * 3600 * 1000;
export function ldExpiry(job) {
  const posted = ldInstant(job.datePosted);
  const through = ldInstant(job.validThrough);
  if (!through) return { expires_at: null, note: 'the page states no expiry' };
  if (posted && Math.abs((Date.parse(through) - Date.parse(posted)) - YEAR_MS) < 5 * 60_000) {
    return {
      expires_at: null,
      note: 'validThrough is exactly one year after datePosted — the ATS default, not a stated expiry',
    };
  }
  return { expires_at: through, note: 'stated by the page' };
}

/** A stable id for this posting. Prefer what the page states; fall back to its own URL. */
export function ldExternalId(job, pageUrl) {
  const ident = job.identifier;
  const fromIdent = str(ident?.value) || (typeof ident === 'string' ? ident.trim() : null);
  const url = str(job.url) || str(job['@id']) || null;
  const raw = fromIdent || url || (str(job.title) ? `${pageUrl}#${str(job.title)}` : null);
  return raw ? String(raw).slice(0, 300) : null;
}

/**
 * PURE. One page's HTML → the vacancies it states.
 * @returns {{jobs: object[], blocks: number, postings: number}}
 */
export function parseJobPostings(html, pageUrl) {
  const blocks = extractLdBlocks(html);
  const postings = blocks.flatMap((b) => collectJobPostings(b));
  const jobs = [];
  const seen = new Set();
  for (const p of postings) {
    const title = str(p.title) || str(p.name);
    const external_id = ldExternalId(p, pageUrl);
    // No title or no identity means Bell cannot show it or track its closure. Skipped, not guessed.
    if (!title || !external_id || seen.has(external_id)) continue;
    seen.add(external_id);
    const expiry = ldExpiry(p);
    jobs.push({
      source: JSONLD_SOURCE,
      external_id,
      source_url: str(p.url) || pageUrl,
      title,
      description: null,          // the page states it as HTML; the harvester owns text extraction
      location_text: ldLocation(p),
      // hiringOrganization is the SOURCE naming its own employer — the same claim Bell matches on
      // for every other job source, kept verbatim and separate from company_id.
      employer_stated: str(p.hiringOrganization) || null,
      employment_type: str(p.employmentType),
      // Everything below is left NULL unless the page states it. Deriving seniority from a title,
      // or an industry from the employer, is the guess this reader exists to avoid.
      seniority_level: null,
      job_function: null,
      industries: null,
      salary_min: null, salary_max: null, salary_currency: null, salary_period: null,
      posted_at: ldInstant(p.datePosted),
      expires_at: expiry.expires_at,
      extra_fields: { ld_expiry_note: expiry.note, ld_page: pageUrl },
      raw: p,
    });
  }
  return { jobs, blocks: blocks.length, postings: postings.length };
}

/**
 * Read one careers page.
 *
 * A page that cannot be fetched THROWS, so the sweeper records the read as failed and closes
 * nothing. A page that loads and states no JobPosting returns an empty list — an honest zero.
 */
export async function fetchOwnSiteJobs(url, { get = fetchPage } = {}) {
  // fetchPage honours robots.txt, caps the body size and follows redirects — the same reader the
  // harvester uses on these very domains, so a site that has already asked Bell not to crawl a path
  // is not crawled twice under a different name.
  const res = await get(url, { timeoutMs: 20_000, retries: 1 });
  if (!res?.ok || !res.html) {
    throw new Error(`careers page unreadable (${res?.error || 'HTTP ' + (res?.status ?? 0)})`);
  }
  const { jobs, postings } = parseJobPostings(res.html, res.finalUrl || url);
  return { jobs, postings };
}
