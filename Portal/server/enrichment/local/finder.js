// Stage 8 — Local Website Finder
// ----------------------------------------------------------------------------
// Most companies in Bell have no website yet, which leaves the harvester (Stage
// 7) with nothing to chew on. This stage finds a company's official website
// locally (no Apify/Firecrawl), two ways, cheapest first:
//
//   1. DOMAIN GUESS — turn the company name into candidate domains
//      (acme.com / acme.qa / acme.com.qa …), fetch each, and VERIFY the page
//      actually belongs to the company before accepting it.
//   2. SEARCH — for the misses, run a headless-browser web search for the
//      company name + "Qatar", take the top organic non-directory result, and
//      verify it the same way.
//
// A website is only ever saved when verification passes (name match + not a
// parked/for-sale page), so we never poison the DB with a wrong site. On
// success we set companies.website and stamp provenance, then the harvester can
// pick it up.

import { query } from '../../db.js';
import { recomputeBellScoreForCompany } from '../../assembly/bell_score.js';
import { fetchPage, hostOf, pool } from './http.js';
import { searchWeb, rendererAvailable, closeRenderer, beginSearchSession, searchState } from './render.js';
import { search as firecrawlSearch } from '../clients/firecrawl.js';
import * as apify from '../clients/apify.js';

export const STAGE_LABEL = 'Local Engine 1 — Website Finder';
export const TOOL_NAME   = 'local_website_finder';

const CONCURRENCY = Number(process.env.BELL_FINDER_CONCURRENCY || 8);
const TLDS = ['com', 'com.qa', 'qa', 'net'];

// Website search for the companies domain-guessing misses.
// PRIMARY = Apify Google Maps (compass/crawler-google-places): a Maps listing
// usually carries the official website, at far higher yield + lower cost than a
// generic web search. On by default; set BELL_FINDER_APIFY=0 to disable.
// Firecrawl search is now an OPT-IN fallback (set BELL_FINDER_FIRECRAWL=1) — its
// ROI was poor (~5% of paid searches saved a site). Headless search is the $0
// last resort. Every candidate is still verified/corroborated before saving.
const APIFY_FINDER     = process.env.BELL_FINDER_APIFY !== '0';
const FIRECRAWL_FINDER = process.env.BELL_FINDER_FIRECRAWL === '1';
const MAPS_ACTOR = 'compass/crawler-google-places';
const FC = { searches: 0, credits: 0, results: 0, errors: 0, disabled: false };
const AP = { runs: 0, results: 0, errors: 0, disabled: false };
export function finderSearchState() { return { ...FC }; }
export function finderApifyState() { return { ...AP }; }

// Words stripped from a company name before slugifying to a domain.
const LEGAL_STOP = new Set([
  'llc', 'l.l.c', 'wll', 'w.l.l', 'qfz', 'qstp', 'qfc', 'co', 'company', 'companies',
  'group', 'holding', 'holdings', 'trading', 'trade', 'intl', 'international',
  'services', 'service', 'solutions', 'solution', 'qatar', 'doha', 'est',
  'establishment', 'enterprises', 'enterprise', 'and', 'the', 'for', 'general',
  'contracting', 'wll.', 'inc', 'ltd', 'limited', 'sons', 'bros', 'brothers',
]);

// Generic business/descriptor words that appear in countless company names AND
// on countless unrelated websites — useless for verifying a SEARCH result.
export const GENERIC_WORDS = new Set([
  'technology', 'technologies', 'tech', 'consulting', 'consultancy', 'consultant', 'consultants',
  'systems', 'system', 'digital', 'smart', 'media', 'marketing', 'advertising', 'business',
  'supply', 'supplies', 'products', 'product', 'projects', 'project', 'building', 'construction',
  'water', 'energy', 'power', 'well', 'star', 'advance', 'advanced', 'post', 'production',
  'films', 'film', 'treatment', 'equipment', 'automotive', 'beverages', 'foodstuff', 'food',
  'industries', 'industry', 'industrial', 'global', 'middle', 'east', 'gulf', 'arabia', 'arabian',
  'real', 'estate', 'engine', 'support', 'aviation', 'logistics', 'turnkey', 'dreams', 'group',
  'trust', 'prime', 'royal', 'crown', 'apparel', 'beauty', 'health', 'medical', 'pharma',
  'pharmaceutical', 'pharmaceuticals', 'agriculture', 'plastics', 'plastic', 'metal', 'steel',
  'oil', 'gas', 'petroleum', 'drilling', 'security', 'cyber', 'cloud', 'data', 'network',
  'networks', 'communications', 'telecom', 'electronics', 'electronic', 'electrical', 'computer',
  'computers', 'mobile', 'mobiles', 'general', 'national', 'international', 'company', 'services',
  'solutions', 'trading', 'world', 'works', 'center', 'centre', 'studio', 'studios', 'agency',
]);

const PARKING_RX =/(domain (is )?for sale|buy this domain|this domain (is|may be) (for sale|parked)|parked (free|domain)|hugedomains|sedo(parking)?|afternic|dan\.com|godaddy\.com\/domainsearch|domain parking|backorder this domain|is for sale|interested in this domain|the domain .* is available|under construction)/i;

// Hosts that a guessed domain commonly *redirects* to — generic registrars,
// parking, or webmail/login — which means the guess was wrong, not the company.
export const REDIRECT_TRAP_HOSTS = /(afternic\.com|dan\.com|sedo\.com|hugedomains\.com|godaddy\.com|namecheap\.com|bluehost\.com|hostgator\.com|wix\.com|squarespace\.com|wordpress\.com|rediff|gabia\.com|register\.com|domain\.com|porkbun\.com|name\.com)/i;

// ---------------------------------------------------------------------------
// Name → domain candidates
// ---------------------------------------------------------------------------

/** Significant, lower-cased, alpha tokens of a company name (legal words dropped). */
export function significantTokens(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t && t.length >= 2 && !LEGAL_STOP.has(t) && !/^\d+$/.test(t));
}

// For DOMAIN generation we keep descriptor words ("solutions", "trading",
// "services") and geo ("qatar", "doha") — they're usually IN the real domain —
// and drop only legal forms + connectors. This is why "Q7Software Solutions"
// must yield q7softwaresolutions.com, not just q7software.com.
const FULLSLUG_DROP = new Set([
  'llc', 'wll', 'qfz', 'qstp', 'fzc', 'fze', 'fzco', 'fzllc', 'plc', 'ltd', 'limited',
  'inc', 'corp', 'co', 'est', 'sa', 'spc', 'psc', 'qpsc', 'qsc', 'bsc', 'spa', 'gmbh',
  'pvt', 'the', 'and', 'for', 'of', 'a', 'an',
]);

/** Full-name slug: every meaningful token joined (only legal forms/connectors dropped). */
export function fullNameSlug(name) {
  const toks = String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t && !FULLSLUG_DROP.has(t));
  const slug = toks.join('');
  return (slug.length >= 6 && slug.length <= 40) ? slug : null;
}

/** Candidate domain slugs (most-distinctive first). */
export function nameSlugs(name) {
  const toks = significantTokens(name);
  const slugs = [];
  // Full-name domain FIRST — it's the single most common real domain
  // (e.g. q7softwaresolutions.com, binjumahmarine.com).
  const full = fullNameSlug(name);
  if (full) slugs.push(full);
  if (toks.length) {
    const all = toks.join('');
    if (all.length >= 3 && all.length <= 30 && !slugs.includes(all)) slugs.push(all);
    if (toks.length >= 2) {
      const two = (toks[0] + toks[1]);
      if (two.length >= 4 && two.length <= 30 && !slugs.includes(two)) slugs.push(two);
    }
    // Acronym for 3+ word names (e.g. "Qatar National Bank" → qnb) — only if short.
    if (toks.length >= 3) {
      const acr = toks.map(t => t[0]).join('');
      if (acr.length >= 3 && acr.length <= 5 && !slugs.includes(acr)) slugs.push(acr);
    }
  }
  return [...new Set(slugs)];
}

/** Full candidate domain list (slug × tld), capped. */
export function domainCandidates(name, cap = 8) {
  const out = [];
  for (const slug of nameSlugs(name)) {
    for (const tld of TLDS) {
      out.push(`${slug}.${tld}`);
      if (out.length >= cap) return out;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

function isParked(page) {
  const blob = ((page.title || '') + ' ' + (page.text || '')).slice(0, 4000);
  return PARKING_RX.test(blob);
}

/** How many significant name tokens appear in the page's title+text. */
function tokenHits(page, tokens) {
  const blob = ((page.title || '') + ' ' + (page.text || '')).toLowerCase();
  let n = 0;
  for (const t of tokens) if (t.length >= 3 && blob.includes(t)) n++;
  return n;
}

/**
 * Decide whether `page` (a fetched candidate) really belongs to `company`.
 *   fromGuess=true  → the domain was derived from the name, so the domain itself
 *                     is strong evidence; we only need the page to be real + not
 *                     parked (a token hit further strengthens it).
 *   fromGuess=false → a search result: the domain is unrelated to the name, so
 *                     require real name-token overlap on the page.
 */
/**
 * A guess is "distinctive" only when the domain slug contains the FULL
 * concatenation of the company's significant tokens (e.g. jasworldwide,
 * chainsys, thinkresearch) or a single long coined token (ipsotek, designorina).
 * Generic/short matches (master.com for "Master", begin.net for "Begin",
 * globalstorage.net for "Global Storage Tanks") are NOT distinctive — those go
 * to the search path instead, which finds the actual company site far more
 * reliably than guessing a common-word domain.
 */
export function distinctiveGuess(tokens, domainSlug) {
  const joined = tokens.join('');
  if (tokens.length >= 2 && joined.length >= 6 && domainSlug.includes(joined)) return true;
  if (tokens.length === 1 && tokens[0].length >= 7 && domainSlug.includes(tokens[0])) return true;
  return false;
}

/**
 * MODERATE bar for SEARCH candidates that go to the human review queue (not
 * auto-saved). Looser than the auto verifier — it surfaces plausible matches
 * (the reviewer filters the rest) but still blocks obvious noise (a page that
 * doesn't mention any distinctive company word, or a domain unrelated to it).
 * Returns a short reason string if worthy, else null.
 */
export function candidateReason(page, company) {
  if (!page || !page.ok) return null;
  if (isParked(page)) return null;
  const host = hostOf(page.finalUrl) || '';
  if (!host || REDIRECT_TRAP_HOSTS.test(host)) return null;

  const tokens = significantTokens(company.name);
  const distinctive = tokens.filter(t => t.length >= 4 && !GENERIC_WORDS.has(t));
  if (!distinctive.length) return null;                  // nothing distinctive to match on

  const slug = host.split('.')[0] || '';
  const blob = ((page.title || '') + ' ' + (page.text || '')).toLowerCase();
  const onPage = distinctive.filter(t => blob.includes(t));
  if (!onPage.length) return null;                       // page doesn't mention the company at all

  const domRelated = distinctive.some(t => slug.includes(t));
  if (domRelated && onPage.length >= 1) return `domain+${onPage.length} word(s)`;
  if (onPage.length >= 2) return `${onPage.length} words on page`;
  return null;
}

export function verifyMatch(page, company, { fromGuess }) {
  if (!page || !page.ok) return false;
  if (isParked(page)) return false;

  const tokens = significantTokens(company.name);
  const host = hostOf(page.finalUrl) || '';
  // A guessed domain that redirected to a registrar/parking/webmail host is a
  // dead end, not the company — reject regardless of page text.
  if (REDIRECT_TRAP_HOSTS.test(host)) return false;

  const domainSlug = host.split('.')[0] || '';

  if (fromGuess) {
    // Only accept a guess for a DISTINCTIVE name (coined / full-name domain).
    // Generic names fall through (return false) → the Finder then tries search.
    if (!distinctiveGuess(tokens, domainSlug)) return false;
    // Distinctive + reachable + not parked/trapped ⇒ it's almost certainly them.
    return true;
  }

  // Search result (CONSERVATIVE policy, chosen 2026-06-13): a single short word
  // like "fiba", "excel", "lama" or "closed" is a famous OTHER company's domain,
  // and name-only matching can't tell them apart. So we trust a search result
  // ONLY when the company has ≥2 DISTINCTIVE (non-generic) words that both appear
  // on the page AND are reflected in the domain (full-name domain, or ≥2
  // distinctive words in the slug). Drops single-brand recall for precision.
  const distinctive = tokens.filter(t => t.length >= 4 && !GENERIC_WORDS.has(t));
  if (distinctive.length < 2) return false;
  const blob = ((page.title || '') + ' ' + (page.text || '')).toLowerCase();
  const onPage = distinctive.filter(t => blob.includes(t));
  if (onPage.length < 2) return false;

  const dj = distinctive.join('');
  const domHasJoin = dj.length >= 6 && domainSlug.includes(dj);          // full-name domain
  const domHasTwo  = distinctive.filter(t => domainSlug.includes(t)).length >= 2;
  return domHasJoin || domHasTwo;
}

/** Root URL (scheme + host only), no path/query/hash. */
function rootOf(u) { try { const x = new URL(u); x.pathname = '/'; x.search = ''; x.hash = ''; return x.toString().replace(/\/$/, ''); } catch { return u; } }

/** Last 8 digits of a phone (Qatar local-number length) for page corroboration. */
function phoneTail(s) { const d = String(s || '').replace(/\D/g, ''); return d.length >= 8 ? d.slice(-8) : ''; }

/**
 * Strong, name-independent proof that a fetched page belongs to `company`:
 *   • the page shows the company's KNOWN phone (we hold these for many companies
 *     from QFC / MOCI / Google Maps), OR
 *   • the site host equals the company's KNOWN email domain.
 * Either is near-certain → safe to AUTO-SAVE even for generic-named companies.
 * Returns 'phone' | 'email-domain' | null.
 */
function corroborates(page, company) {
  if (!page || !page.ok) return null;
  const host = (hostOf(page.finalUrl) || '').toLowerCase();
  if (!host || REDIRECT_TRAP_HOSTS.test(host)) return null;
  const tail = phoneTail(company.phone);
  if (tail) {
    const digits = ((page.title || '') + ' ' + (page.text || '')).replace(/\D/g, '');
    if (digits.includes(tail)) return 'phone';
  }
  const em = String(company.email || '').toLowerCase();
  const dom = em.includes('@') ? em.split('@')[1].trim() : '';
  if (dom && (host === dom || host.endsWith('.' + dom) || dom.endsWith('.' + host))) return 'email-domain';
  return null;
}

/** Firecrawl web search → candidate URLs. Reliable replacement for the blocked
 *  headless search. Counts credits; auto-disables on auth/quota/missing-key. */
async function firecrawlSearchUrls(company) {
  if (!FIRECRAWL_FINDER || FC.disabled) return [];
  try {
    const items = await firecrawlSearch(`${company.name} Qatar official website`, { limit: 6 });
    FC.searches++; FC.credits += 2;
    const urls = (items || []).map((it) => it && it.url).filter(Boolean);
    FC.results += urls.length;
    return urls;
  } catch (e) {
    FC.errors++;
    if (e?.status === 401 || e?.status === 402 || e?.status === 429 || /key_missing|missing/i.test(String(e?.message))) FC.disabled = true;
    return [];
  }
}

/** Apify Google Maps → the official website(s) for a company. Maps lists the site
 *  directly, so this is the primary (cheaper, higher-yield) finder. Auto-disables
 *  if the Apify token is missing/unauthorized. */
async function apifyMapsUrls(company) {
  if (!APIFY_FINDER || AP.disabled) return [];
  try {
    const items = await apify.runSync(MAPS_ACTOR, {
      searchStringsArray: [company.name],
      locationQuery: 'Qatar',
      maxCrawledPlacesPerSearch: 2,
      language: 'en',
      skipClosedPlaces: false,
      scrapeContacts: false,
      maxImages: 0,
      maxReviews: 0,
    }, { timeoutMs: 120_000 });
    AP.runs++;
    const urls = (items || []).map((p) => p && (p.website || p.websiteUrl)).filter(Boolean);
    AP.results += urls.length;
    return [...new Set(urls)];
  } catch (e) {
    AP.errors++;
    if (e?.status === 401 || e?.status === 402 || /token|unauthor|key_missing|missing/i.test(String(e?.message))) AP.disabled = true;
    return [];
  }
}

// ---------------------------------------------------------------------------
// Per-company find
// ---------------------------------------------------------------------------

export async function enrichCompany(company) {
  if (company.website && String(company.website).trim()) {
    await markStage(company.id, 'skipped', { stage8_skip_reason: 'has_website' });
    return { status: 'no_data', reason: 'has_website' };
  }
  await markStage(company.id, 'running');

  // Domains we've previously cleared as wrong for this company — never re-save.
  const rejected = rejectedSet(company);

  // 1) Domain guessing — fetch all candidates in parallel (https first wave,
  // then http for any that failed), then accept the first that verifies in
  // priority order. Much faster than sequential, and trims not_found latency.
  const cands = domainCandidates(company.name).filter(d => !rejected.has(d.toLowerCase()));
  if (cands.length) {
    const httpsPages = await Promise.all(
      cands.map(d => fetchPage('https://' + d, { respectRobots: false, timeoutMs: 7000 }).catch(() => null)),
    );
    for (let k = 0; k < cands.length; k++) {
      if (verifyMatch(httpsPages[k], company, { fromGuess: true })) {
        return await saveWebsite(company, httpsPages[k].finalUrl, 'guess');
      }
    }
    // http fallback only for candidates whose https didn't even connect.
    const needHttp = cands.filter((_, k) => !httpsPages[k] || !httpsPages[k].ok);
    if (needHttp.length) {
      const httpPages = await Promise.all(
        needHttp.map(d => fetchPage('http://' + d, { respectRobots: false, timeoutMs: 7000 }).catch(() => null)),
      );
      for (let k = 0; k < needHttp.length; k++) {
        if (verifyMatch(httpPages[k], company, { fromGuess: true })) {
          return await saveWebsite(company, httpPages[k].finalUrl, 'guess');
        }
      }
    }
  }

  // 2) Find the official site. Apify Google Maps first (cheap + high-yield — Maps
  // lists the website), then optional Firecrawl search, then free headless search.
  // Every candidate is still verified/corroborated below before it can be saved.
  let results = await apifyMapsUrls(company);
  if (!results.length && FIRECRAWL_FINDER) results = await firecrawlSearchUrls(company);
  if (!results.length && await rendererAvailable()) {
    results = await searchWeb(`${company.name} Qatar official website`, { limit: 6 });
  }
  let firstCandidate = null;
  for (const url of results) {
    const uhost = (hostOf(url) || '').toLowerCase();
    if (!uhost || rejected.has(uhost)) continue;
    const page = await fetchPage(url, { respectRobots: false, timeoutMs: 9000, retries: 1 });
    if (!page || !page.ok) continue;
    const corr = corroborates(page, company);
    if (corr || verifyMatch(page, company, { fromGuess: false })) {
      return await saveWebsite(company, rootOf(page.finalUrl), corr ? 'search-' + corr : 'search');
    }
    if (!firstCandidate) { const reason = candidateReason(page, company); if (reason) firstCandidate = { root: rootOf(page.finalUrl), reason }; }
  }
  if (firstCandidate) {
    await proposeCandidate(company.id, firstCandidate.root, 'search:' + firstCandidate.reason);
    await markStage(company.id, 'candidate', { stage8_candidate: firstCandidate.root });
    return { status: 'candidate', candidate: firstCandidate.root };
  }

  await markStage(company.id, 'no_data', { stage8_checked_at: new Date().toISOString() });
  return { status: 'no_data', reason: 'not_found' };
}

/** Queue a search-found URL for human review (one pending row per url). */
async function proposeCandidate(companyId, url, reason) {
  await query(`
    INSERT INTO website_candidates (company_id, candidate_url, reason, status)
    VALUES ($1, $2, $3, 'pending')
    ON CONFLICT (company_id, candidate_url) DO NOTHING
  `, [companyId, url, reason]);
}

/** Set of hosts previously cleared as wrong for this company (lower-cased). */
function rejectedSet(company) {
  const raw = company?.extra_fields?.website_rejected;
  const arr = Array.isArray(raw) ? raw : [];
  return new Set(arr.map(h => String(h).toLowerCase()));
}

async function saveWebsite(company, website, method) {
  // Defensive: never save a host we've already rejected for this company.
  const host = (hostOf(website) || '').toLowerCase();
  if (host && rejectedSet(company).has(host)) {
    await markStage(company.id, 'no_data', { stage8_skip_reason: 'rejected_host' });
    return { status: 'no_data', reason: 'rejected_host' };
  }
  await query(
    `UPDATE companies
        SET website = $2,
            extra_fields = extra_fields || $3::jsonb
      WHERE id = $1 AND (website IS NULL OR btrim(website) = '')`,
    [company.id, website, JSON.stringify({ website_found: { method, at: new Date().toISOString() } })],
  );
  await markStage(company.id, 'done', { stage8_found: website, stage8_method: method });
  await recomputeBellScoreForCompany(company.id);
  return { status: 'done', website, method };
}

async function markStage(companyId, status, extras = null) {
  if (extras) {
    await query(
      `UPDATE companies SET stage8_status = $2, stage8_at = now(),
              extra_fields = extra_fields || $3::jsonb
        WHERE id = $1`,
      [companyId, status, JSON.stringify(extras)],
    );
  } else {
    await query(`UPDATE companies SET stage8_status = $2, stage8_at = now() WHERE id = $1`, [companyId, status]);
  }
}

// ---------------------------------------------------------------------------
// Bulk entry point — orchestrator calls this.
// ---------------------------------------------------------------------------

export async function enrichCompanies(companies, jobLog = null) {
  let done = 0, noData = 0, failed = 0, candidates = 0, finished = 0;
  const total = companies.length;
  const hasBrowser = await rendererAvailable();
  beginSearchSession();   // reset the search rate-limit guard for this run
  FC.searches = 0; FC.credits = 0; FC.results = 0; FC.errors = 0; FC.disabled = false;
  AP.runs = 0; AP.results = 0; AP.errors = 0; AP.disabled = false;
  const searchTier = APIFY_FINDER ? 'Apify Google Maps' : (FIRECRAWL_FINDER ? 'Firecrawl search' : (hasBrowser ? 'headless search' : 'domain-guessing only'));
  jobLog?.(`  Concurrency: ${CONCURRENCY} · Search: ${searchTier}`);
  try {
    await pool(companies, CONCURRENCY, async (c) => {
      try {
        const r = await enrichCompany(c);
        if (r.status === 'done') done++;
        else if (r.status === 'candidate') candidates++;
        else noData++;
        const tag = r.status === 'done' ? '✓' : (r.status === 'candidate' ? '⊕' : '·');
        jobLog?.(`  ${tag} [${++finished}/${total}] ${c.name}` +
          (r.website ? ` → ${r.website} (${r.method})`
            : r.candidate ? ` → candidate: ${r.candidate} (review)`
            : ` — ${r.reason || 'not found'}`));
      } catch (err) {
        failed++;
        jobLog?.(`  ✗ [${++finished}/${total}] ${c.name} — ${err.message}`);
      }
    });
  } finally {
    await closeRenderer();
  }
  const ss = searchState();
  const fc = finderSearchState();
  const ap = finderApifyState();
  if (APIFY_FINDER) jobLog?.(`  Apify Maps: ${ap.runs} lookup(s), ${ap.results} website(s)${ap.disabled ? ' · DISABLED (token)' : ''}, ${ap.errors} error(s).`);
  if (FIRECRAWL_FINDER) jobLog?.(`  Firecrawl search: ${fc.searches} quer(ies) (~${fc.credits} credits), ${fc.results} result(s)${fc.disabled ? ' · DISABLED (auth/quota/key)' : ''}, ${fc.errors} error(s).`);
  if (hasBrowser) jobLog?.(`  Headless search diagnostic: ${ss.count} ran, ${ss.results} result(s)${ss.disabled ? ` · DISABLED (${ss.reason})` : ''}.`);
  jobLog?.(`  ▸ Found ${done} website(s) (auto) · ${candidates} candidate(s) for review · ${noData} not found.`);
  return { done, candidates, no_data: noData, failed, usd: 0 };
}
