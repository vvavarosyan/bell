// Firecrawl HTTP client — used by Stage 1 (LinkedIn discovery) and any future
// research-style stage. Token comes from Keychain (bdi-firecrawl) at call time.

import { getKey } from '../../keychain.js';

const API_BASE = 'https://api.firecrawl.dev';

async function tokenOrThrow() {
  const t = await getKey('firecrawl');
  // Internal message only (never shown to customers — research errors are
  // sanitized in the orchestrator). On Railway set BDI_KEY_FIRECRAWL.
  if (!t) throw new Error('research_provider_key_missing');
  return t;
}

async function call(path, body, timeoutMs = 120_000) {
  const token = await tokenOrThrow();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(API_BASE + path, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const ct = r.headers.get('content-type') || '';
    const data = ct.includes('application/json') ? await r.json() : await r.text();
    if (!r.ok) {
      const msg = typeof data === 'string' ? data : (data?.error || data?.message || JSON.stringify(data));
      const err = new Error(`Firecrawl ${r.status}: ${String(msg).slice(0, 300)}`);
      err.status = r.status;
      err.body = data;
      throw err;
    }
    return data;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Submit an async research job to Firecrawl Agent (Spark Pro).
 * Returns { id } — the agent's job handle. Poll with agentStatus().
 *
 * The agent autonomously browses the web, follows links, and extracts data
 * conforming to the JSON schema provided. Typical runtime 1–5 minutes for
 * complex queries; deep research can take 5+ min.
 *
 * Used by the Research orchestrator (server/research/orchestrator.js).
 */
export async function agent(prompt, schema, opts = {}) {
  const body = {
    prompt,
    // ALL Bell research uses Spark PRO (Val's directive 2026-05-31) — every
    // research job, whether started on the user portal or admin, runs on the
    // Pro agent. The orchestrator passes anchor URLs (buildAnchorUrls) so Pro
    // has concrete starting points and doesn't fall back to data:null.
    model: opts.model || 'spark-1-pro',
  };
  if (schema) body.schema = schema;
  if (Array.isArray(opts.urls) && opts.urls.length) body.urls = opts.urls;
  if (typeof opts.maxCredits === 'number') body.maxCredits = opts.maxCredits;
  if (opts.strictConstrainToURLs === true) body.strictConstrainToURLs = true;
  // The agent endpoint returns the job id immediately — short HTTP timeout is fine.
  const data = await call('/v2/agent', body, 60_000);
  // Firecrawl returns { success: true, id: '...' } or similar — normalize.
  const id = data?.id || data?.data?.id || data?.job_id;
  if (!id) {
    throw new Error('Firecrawl Agent: no job id in response: ' + JSON.stringify(data).slice(0, 200));
  }
  return { id, raw: data };
}

/**
 * Poll a Firecrawl Agent job. Returns:
 *   { status: 'processing' | 'completed' | 'failed', data?, error? }
 *
 * status='completed' → data contains the structured payload conforming to the
 * schema we passed to agent().
 */
export async function agentStatus(id) {
  const token = await tokenOrThrow();
  const r = await fetch(`${API_BASE}/v2/agent/${encodeURIComponent(id)}`, {
    method: 'GET',
    headers: { 'Authorization': 'Bearer ' + token },
  });
  const ct = r.headers.get('content-type') || '';
  const payload = ct.includes('application/json') ? await r.json() : await r.text();
  if (!r.ok) {
    const msg = typeof payload === 'string' ? payload : (payload?.error || payload?.message || JSON.stringify(payload));
    const err = new Error(`Firecrawl Agent status ${r.status}: ${String(msg).slice(0, 300)}`);
    err.status = r.status;
    err.body = payload;
    throw err;
  }
  // Normalize: Firecrawl returns { status, data, error?, progress? } directly
  // OR wrapped in { success: true, data: { status, ... } }
  const inner = payload?.data?.status ? payload.data : payload;
  return {
    status: String(inner.status || 'processing').toLowerCase(),
    data:   inner.data ?? inner.result ?? null,
    error:  inner.error || inner.message || null,
    progress: inner.progress ?? null,
    raw:    payload,
  };
}

/**
 * Scrape a single URL through Firecrawl. Returns { markdown, html, links,
 * metadata, … } as returned by Firecrawl. Stage 6 (contact discovery) uses
 * this for company website + contact pages.
 *
 * Firecrawl returns either { data: {...} } or {...} directly depending on
 * endpoint version — we normalize to the inner payload.
 */
export async function scrape(url, opts = {}) {
  const body = {
    url,
    formats: opts.formats || ['markdown', 'links'],
    onlyMainContent: opts.onlyMainContent === true,
    waitFor:         opts.waitFor || 0,
    timeout:         opts.timeout || 30000,
  };
  if (opts.includeHtml) {
    if (!body.formats.includes('html')) body.formats.push('html');
  }
  const data = await call('/v1/scrape', body);
  return data?.data || data;
}

/**
 * Generic web search via Firecrawl's /v1/search endpoint.
 * Returns array of { url, title, description } items.
 */
export async function search(query, { limit = 5, country = null } = {}) {
  const body = { query, limit };
  if (country) body.country = country;
  const data = await call('/v1/search', body);
  // Normalize across Firecrawl response shapes: { data: [...] } (v1),
  // { data: { web: [...] } } or { web: [...] } (newer search API).
  const d = data?.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.web)) return d.web;
  if (Array.isArray(data?.web)) return data.web;
  return [];
}

// TWO stop-word lists. They serve different purposes — keep them separate.
//
// SEARCH_STOP_WORDS — used by stripGenericWords() to clean the SEARCH query
// we send to Firecrawl. Aggressive: strip every legal form, every business-
// generic noun, AND geographic terms ("qatar","doha","gulf",…) so the
// search engine gets the distinctive part of the name and is more likely
// to surface the right LinkedIn page.
//
// SCORING_STOP_WORDS — used by tokenize() when COMPARING a candidate URL
// against the company name. Smaller: drop only truly generic terms.
// Geographic words STAY because they're the only discriminator between
// same-brand companies in different regions ("Qatar Airways" vs
// "British Airways", "Doha Bank" vs "Bank of America"). We hit exactly
// this bug on 2026-05-23 — the matcher accepted british-airways for
// Qatar Airways because "qatar" was being stripped.
const SEARCH_STOP_WORDS = new Set([
  'llc','wll','qfz','qfc','pjsc','plc','ltd','limited','inc','incorporated',
  'company','co','corp','corporation','the','of','and','for','an','a',
  'branch','holding','holdings','group','groupe','grp','trading','services',
  'service','enterprise','enterprises','solutions','solution','consult',
  'consulting','consultants','consultancy','center','centre','store','stores',
  'shop','establishment','international','intl','qatar','doha','gulf','arabia',
  'arabian','middle','east','mena','global','worldwide','associates','partners',
  'partnership',
]);
const SCORING_STOP_WORDS = new Set([
  'llc','wll','qfz','qfc','pjsc','plc','ltd','limited','inc','incorporated',
  'company','co','corp','corporation','the','of','and','for','an','a',
  'branch','holding','holdings','group','groupe','grp','trading','services',
  'service','enterprise','enterprises','solutions','solution','consult',
  'consulting','consultants','consultancy','center','centre','store','stores',
  'shop','establishment','international','intl','global','worldwide','associates','partners',
  'partnership',
  // NOTE: 'qatar','doha','gulf','arabia','arabian','middle','east','mena' are
  // DELIBERATELY NOT here — they discriminate region-specific same-brand
  // companies. Removing them broke Qatar Airways disambiguation.
]);

function tokenize(s, stopWords = SCORING_STOP_WORDS) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s\-]/g, ' ')
    .split(/[\s\-]+/)
    .filter(t => t.length > 2 && !stopWords.has(t));
}

/**
 * Strip legal-form / generic words (and geo terms) from a name to form a
 * cleaner SEARCH query. Returns the rewritten name (preserves token order +
 * non-stop tokens). If EVERYTHING is generic, returns the original name
 * (caller can fall back).
 */
function stripGenericWords(name) {
  const original = String(name || '').trim();
  if (!original) return '';
  const cleaned = original
    .replace(/[.,]/g, ' ')
    .split(/\s+/)
    .filter(w => {
      const t = w.toLowerCase().replace(/[^a-z0-9]/g, '');
      return t.length > 0 && !SEARCH_STOP_WORDS.has(t);
    })
    .join(' ')
    .trim();
  return cleaned || original;
}

function linkedInSlug(url) {
  const m = String(url || '').match(/linkedin\.com\/company\/([^\/?#]+)/i);
  return m ? m[1].toLowerCase() : '';
}

/**
 * Score + decision for how well a LinkedIn candidate matches the company.
 *
 * Returns { score, matched, total, accept }.
 *   - matched / total → the ratio reported as "score"
 *   - For short names (1-2 distinctive tokens), ALL must match — short names
 *     are too easy to spoof with a single generic word like "bank".
 *   - For longer names, at least 60% must match.
 *   - For a fully generic name (0 distinctive tokens), fall back to a soft
 *     contains check on the raw strings.
 */
export function scoreLinkedInMatch(companyName, candidateUrl, candidateTitle) {
  const nameTokens = new Set(tokenize(companyName));
  const total = nameTokens.size;

  if (total === 0) {
    // Entirely generic — fall back to "does the candidate contain the raw name?"
    const cn = String(companyName || '').toLowerCase().trim();
    const ht = (linkedInSlug(candidateUrl) + ' ' + (candidateTitle || '')).toLowerCase();
    const containsRaw = cn.length >= 4 && ht.includes(cn);
    return { score: containsRaw ? 0.5 : 0, matched: 0, total: 0, accept: containsRaw };
  }

  // Build the discrete-token haystack from the slug (split on -) and the title.
  const fullSlug = linkedInSlug(candidateUrl);
  const fullTitle = String(candidateTitle || '').toLowerCase();
  const haystack = new Set([
    ...fullSlug.split('-').filter(t => t.length > 2),
    ...tokenize(candidateTitle || ''),
  ]);

  // Match a name token if EITHER:
  //   a) it appears as a discrete token in the slug/title, OR
  //   b) it appears as a substring inside the full slug or title
  //      (handles slugs like "qatarairways" with no hyphen separator).
  let matched = 0;
  for (const t of nameTokens) {
    if (haystack.has(t)) { matched++; continue; }
    if (t.length >= 4 && (fullSlug.includes(t) || fullTitle.includes(t))) matched++;
  }

  // Adaptive threshold:
  //   total ≤ 2:   require ALL distinctive tokens to match
  //   total >= 3:  require at least 60%
  const required = total <= 2 ? total : Math.ceil(total * 0.6);
  const accept = matched >= required;

  return {
    score: Number((matched / total).toFixed(3)),
    matched,
    total,
    accept,
  };
}

/**
 * Find the LinkedIn company page URL for a Qatar-based company.
 * Returns { url, confidence, candidates } or { url: null, candidates, reason }.
 *
 * Strategy: search for "<name> Qatar site:linkedin.com/company", score each
 * candidate by name token overlap, accept the best if it passes the threshold,
 * otherwise return null with the candidate list so the admin can override.
 */
export async function findLinkedInCompanyUrl(companyName) {
  if (!companyName || !companyName.trim()) {
    return { url: null, candidates: [], reason: 'empty_company_name' };
  }
  // Strip legal-form / generic words from the *search query* so Firecrawl
  // gets the distinctive part of the name. Scoring still uses the full
  // original name so validation isn't affected.
  const cleanForQuery = stripGenericWords(companyName);
  const searchTerm = cleanForQuery || companyName.trim();

  // Multi-query strategy: do a quoted strict search, then an unquoted broader
  // search. Merge + dedupe results so the scorer sees the union. We do NOT
  // include "Qatar" in the query — Qatar companies often have LinkedIn pages
  // whose name doesn't contain "Qatar", and the keyword was filtering them
  // out. The site: filter alone restricts to LinkedIn company pages.
  const queries = [
    `"${searchTerm}" site:linkedin.com/company`,
    `${searchTerm} site:linkedin.com/company`,
  ];

  const seenUrls = new Set();
  let merged = [];
  let usedFallback = false;
  for (const q of queries) {
    let r = [];
    try {
      r = await search(q, { limit: 10 });
    } catch (err) {
      if (err.status === 401 || err.status === 402 || err.status === 404) {
        if (!usedFallback) {
          usedFallback = true;
          r = await scrapeSearchFallback(companyName);
        }
      } else {
        throw err;
      }
    }
    for (const item of r) {
      const u = item?.url;
      if (!u || seenUrls.has(u)) continue;
      seenUrls.add(u);
      merged.push(item);
    }
    // Stop early if we already have several LinkedIn hits.
    const liCount = merged.filter(x => /linkedin\.com\/company\//i.test(x.url || '')).length;
    if (liCount >= 5) break;
  }
  const results = merged;

  const linkedinResults = results
    .filter(r => /linkedin\.com\/company\//i.test(r?.url || ''))
    .map(r => {
      const url = cleanLinkedinUrl(r.url);
      const title = r.title || r.metadata?.title || '';
      const m = scoreLinkedInMatch(companyName, url, title);
      return {
        url,
        title,
        description: r.description,
        score:   m.score,
        matched: m.matched,
        total:   m.total,
        accept:  m.accept,
      };
    })
    .sort((a, b) => b.score - a.score);

  if (linkedinResults.length === 0) {
    return { url: null, candidates: results, reason: 'no_linkedin_results' };
  }

  const best = linkedinResults[0];
  if (!best.accept) {
    return {
      url:         null,
      candidates:  linkedinResults,
      reason:      'low_confidence_match',
      best_score:  best.score,
    };
  }

  return {
    url:        best.url,
    confidence: best.score,
    candidates: linkedinResults,
  };
}

function cleanLinkedinUrl(u) {
  try {
    const url = new URL(u);
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return u;
  }
}

async function scrapeSearchFallback(name) {
  // Scrape a public web search results page and look for LinkedIn URLs.
  const url = 'https://www.google.com/search?q=' + encodeURIComponent(name + ' Qatar site:linkedin.com/company');
  try {
    const data = await call('/v1/scrape', { url, formats: ['markdown', 'links'] });
    const links = data?.data?.links || data?.links || [];
    return links
      .filter(l => /linkedin\.com\/company\//i.test(l))
      .slice(0, 5)
      .map(l => ({ url: l, title: '', description: '' }));
  } catch {
    return [];
  }
}
