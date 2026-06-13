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
import { searchWeb, rendererAvailable, closeRenderer } from './render.js';

export const STAGE_LABEL = 'Local Engine 1 — Website Finder';
export const TOOL_NAME   = 'local_website_finder';

const CONCURRENCY = Number(process.env.BELL_FINDER_CONCURRENCY || 6);
const TLDS = ['com', 'com.qa', 'qa', 'net'];

// Words stripped from a company name before slugifying to a domain.
const LEGAL_STOP = new Set([
  'llc', 'l.l.c', 'wll', 'w.l.l', 'qfz', 'qstp', 'qfc', 'co', 'company', 'companies',
  'group', 'holding', 'holdings', 'trading', 'trade', 'intl', 'international',
  'services', 'service', 'solutions', 'solution', 'qatar', 'doha', 'est',
  'establishment', 'enterprises', 'enterprise', 'and', 'the', 'for', 'general',
  'contracting', 'wll.', 'inc', 'ltd', 'limited', 'sons', 'bros', 'brothers',
]);

const PARKING_RX = /(domain (is )?for sale|buy this domain|this domain (is|may be) (for sale|parked)|parked (free|domain)|hugedomains|sedo(parking)?|afternic|dan\.com|godaddy\.com\/domainsearch|domain parking|backorder this domain|is for sale|interested in this domain|the domain .* is available|under construction)/i;

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

/** Candidate domain slugs (most-distinctive first). */
export function nameSlugs(name) {
  const toks = significantTokens(name);
  if (!toks.length) return [];
  const slugs = [];
  const all = toks.join('');
  if (all.length >= 3 && all.length <= 30) slugs.push(all);
  if (toks.length >= 2) {
    const two = (toks[0] + toks[1]);
    if (two.length >= 4 && two.length <= 30 && two !== all) slugs.push(two);
  }
  if (toks.length === 1 && toks[0].length >= 4) { /* already in `all` */ }
  // Acronym for 3+ word names (e.g. "Qatar National Bank" → qnb) — only if short.
  if (toks.length >= 3) {
    const acr = toks.map(t => t[0]).join('');
    if (acr.length >= 3 && acr.length <= 5) slugs.push(acr);
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

export function verifyMatch(page, company, { fromGuess }) {
  if (!page || !page.ok) return false;
  if (isParked(page)) return false;

  const tokens = significantTokens(company.name);
  const host = hostOf(page.finalUrl) || '';
  // A guessed domain that redirected to a registrar/parking/webmail host is a
  // dead end, not the company — reject regardless of page text.
  if (REDIRECT_TRAP_HOSTS.test(host)) return false;

  const domainSlug = host.split('.')[0] || '';
  const joined = tokens.join('');
  const domainMatchesName = tokens.some(t => t.length >= 4 && domainSlug.includes(t))
    || (joined.length >= 4 && domainSlug.includes(joined));
  const hits = tokenHits(page, tokens);

  if (fromGuess) {
    // Only accept a guess for a DISTINCTIVE name (coined / full-name domain).
    // Generic names fall through (return false) → the Finder then tries search.
    if (!distinctiveGuess(tokens, domainSlug)) return false;
    // Distinctive + reachable + not parked/trapped ⇒ it's almost certainly them.
    return true;
  }

  // Search result: the domain is unrelated to the name, so require real overlap.
  const need = tokens.length <= 1 ? 1 : 2;
  return domainMatchesName || hits >= need;
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

  // 1) Domain guessing — fetch all candidates in parallel (https first wave,
  // then http for any that failed), then accept the first that verifies in
  // priority order. Much faster than sequential, and trims not_found latency.
  const cands = domainCandidates(company.name);
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

  // 2) Search fallback (headless browser). Verify each candidate strictly.
  if (await rendererAvailable()) {
    const results = await searchWeb(`${company.name} Qatar official website`, { limit: 6 });
    for (const url of results) {
      const page = await fetchPage(url, { respectRobots: false, timeoutMs: 9000 });
      if (verifyMatch(page, company, { fromGuess: false })) {
        // Save the site root, not the deep result URL.
        let root = page.finalUrl;
        try { const u = new URL(page.finalUrl); u.pathname = '/'; u.search = ''; u.hash = ''; root = u.toString().replace(/\/$/, ''); } catch {}
        return await saveWebsite(company, root, 'search');
      }
    }
  }

  await markStage(company.id, 'no_data', { stage8_checked_at: new Date().toISOString() });
  return { status: 'no_data', reason: 'not_found' };
}

async function saveWebsite(company, website, method) {
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
  let done = 0, noData = 0, failed = 0, finished = 0;
  const total = companies.length;
  const hasBrowser = await rendererAvailable();
  jobLog?.(`  Concurrency: ${CONCURRENCY} · Search tier: ${hasBrowser ? 'headless search enabled' : 'domain-guessing only (install headless browser for search)'}`);
  try {
    await pool(companies, CONCURRENCY, async (c) => {
      try {
        const r = await enrichCompany(c);
        if (r.status === 'done') done++; else noData++;
        const tag = r.status === 'done' ? '✓' : '·';
        jobLog?.(`  ${tag} [${++finished}/${total}] ${c.name}` +
          (r.website ? ` → ${r.website} (${r.method})` : ` — ${r.reason || 'not found'}`));
      } catch (err) {
        failed++;
        jobLog?.(`  ✗ [${++finished}/${total}] ${c.name} — ${err.message}`);
      }
    });
  } finally {
    await closeRenderer();
  }
  jobLog?.(`  ▸ Found ${done} website(s); ${noData} not found.`);
  return { done, no_data: noData, failed, usd: 0 };
}
