// Local Engine 3 — Network Mapper  (Bell's local relationship-discovery engine)
// ----------------------------------------------------------------------------
// For each company, discover its business NETWORK — partners, clients,
// affiliates / parent / subsidiary, and competitors — fully locally ($0, no
// Apify/Firecrawl), and wire it into the graph:
//
//   • partners / clients   ← the company's own partner/clients/brands pages,
//                            primarily the OUTBOUND LINKS on those pages (a
//                            partner logo linking to the partner's real site is
//                            the most reliable signal), plus logo alt-text.
//   • affiliates / parent  ← about / group-page text patterns
//     / subsidiary           ("a subsidiary of X", "part of the X Group").
//   • competitors          ← (a) INTERNAL — same industry + Qatar, from Bell's
//                            own data; (b) WEB SEARCH — "<name> competitors".
//
// Every discovered entity is RESOLVED against the existing database (by domain,
// then by normalised name). If it already exists → we just link it. If it's NEW
// we classify its country (precision-first, see country.js) and ROUTE it:
//
//   CONFIRMED QATAR   → auto-enters `companies` (Bell shows it).
//   CONFIRMED FOREIGN → International holding pen (research_candidates,non_qatar).
//   UNCERTAIN         → pending admin approval (research_candidates,pending).
//
// so Bell only ever displays confirmed-Qatar companies, while every other lead
// is retained locally for future country expansion. Edges are stored in
// company_relationships (idempotent upsert). Name-only finds (a logo with no
// link) are kept as UNRESOLVED edges — metadata, no pending-queue noise.

import { query, withTransaction } from '../../db.js';
import { recomputeBellScoreForCompany } from '../../assembly/bell_score.js';
import { normalizeName } from '../../ingest/normalize.js';
import { fetchPage, hostOf, sameHost, toRootUrl, pool } from './http.js';
import { renderPage, rendererAvailable, closeRenderer, searchWeb, beginSearchSession, searchState } from './render.js';
import { significantTokens, GENERIC_WORDS, REDIRECT_TRAP_HOSTS } from './finder.js';
import { extractPartners } from './extract.js';
import { classifyCountry } from './country.js';
import { recordSearch } from './ledger.js';

export const STAGE_LABEL = 'Local Engine 3 — Network Mapper';
export const TOOL_NAME   = 'local_relationship_mapper';

const CONCURRENCY        = Number(process.env.BELL_MAPPER_CONCURRENCY || 5);
const JS_SHELL_CHARS     = 400;
const MAX_PARTNER_PAGES  = 6;
const MAX_PARTNERS       = 40;   // domain-bearing partner/client edges per company
const MAX_NAME_ONLY      = 25;   // unresolved (logo-alt) partner edges per company
const MAX_AFFILIATES     = 10;
const MAX_COMPET_INTERNAL = 6;
const MAX_COMPET_SEARCH   = 4;

// Pages where partners / clients are typically listed.
const PARTNER_HINTS = ['/partner', '/partners', '/our-partners', '/clients', '/our-clients',
  '/customers', '/our-customers', '/brands', '/sponsors', '/portfolio', '/references',
  '/associates', '/alliances', '/collaborat'];
const PARTNER_PROBE = ['/partners', '/clients', '/our-clients', '/brands', '/portfolio'];

// Pages where parent/group/affiliate info usually lives.
const AFFIL_HINTS = ['/about', '/about-us', '/who-we-are', '/company', '/group', '/our-group', '/overview'];
const AFFIL_PROBE = ['/about', '/about-us', '/our-group'];

// Outbound hosts that are NEVER a business partner (social, CDNs, infra, stores).
const NON_PARTNER_HOST_RX =
  /(facebook|twitter|x\.com|instagram|linkedin|youtube|tiktok|whatsapp|wa\.me|t\.me|telegram|pinterest|snapchat|google|gstatic|googleapis|gravatar|wordpress|w3\.org|schema\.org|fontawesome|cloudflare|jsdelivr|unpkg|bootstrapcdn|cdnjs|maps\.|goo\.gl|bit\.ly|apple\.com|apps\.apple|play\.google|adobe\.com|mozilla|microsoft\.com\/[a-z]{2}-[a-z]{2}|paypal|visa|mastercard|sharethis|addthis)/i;

// Affiliate / parent text patterns. Each captures the related entity name.
// Keyword letters are dual-cased ([Ss]ubsidiary) so sentence-initial mentions
// match, while the entity capture stays strict [A-Z] (no `i` flag — that would
// let it capture lowercase filler words like "the").
const AFFIL_PATTERNS = [
  { rx: /\b(?:[Aa]\s+)?(?:[Ww]holly[-\s]?owned\s+)?[Ss]ubsidiary\s+of\s+([A-Z][\w&.,'’\- ]{2,55}?)(?=[.,;:]|\s(?:and|in|with|which|that|is|was|based)\b|$)/g, type: 'parent' },
  { rx: /\b[Pp]art\s+of\s+(?:the\s+)?([A-Z][\w&.,'’\- ]{2,55}?)\s+(?:[Gg]roup|[Hh]olding|[Hh]oldings)\b/g, type: 'parent' },
  { rx: /\b[Mm]ember\s+of\s+(?:the\s+)?([A-Z][\w&.,'’\- ]{2,55}?)\s+(?:[Gg]roup|[Ff]amily|[Hh]olding|[Hh]oldings)\b/g, type: 'parent' },
  { rx: /\b[Pp]arent\s+company[:\s]+([A-Z][\w&.,'’\- ]{2,55}?)(?=[.,;:]|$)/g, type: 'parent' },
  { rx: /\b[Oo]wned\s+by\s+([A-Z][\w&.,'’\- ]{2,55}?)(?=[.,;:]|\s(?:and|in|with|which|that)\b|$)/g, type: 'parent' },
];

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

/** Registrable-domain compare (last two labels), so subdomains count as same. */
function registrable(host) {
  if (!host) return '';
  const parts = host.toLowerCase().replace(/^www\./, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  // crude eTLD handling for the two-label ccTLDs we care about (.com.qa, .co.uk)
  const last2 = parts.slice(-2).join('.');
  if (/^(com|co|net|org|gov|edu)\.[a-z]{2}$/.test(last2)) return parts.slice(-3).join('.');
  return last2;
}
function sameRegistrable(a, b) { return registrable(a) === registrable(b); }

function cleanName(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/[\s,.;:’'"\-–—]+$/, '')
    .replace(/^[\s,.;:’'"\-–—]+/, '')
    .trim()
    .slice(0, 80);
}

/** Is a name distinctive enough to risk creating/matching a company on? */
function distinctiveName(name) {
  const toks = significantTokens(name).filter(t => t.length >= 4 && !GENERIC_WORDS.has(t));
  return toks.length >= 1 && cleanName(name).length >= 4;
}

// ---------------------------------------------------------------------------
// Page loading (plain fetch, headless render fallback for JS shells)
// ---------------------------------------------------------------------------

async function loadHome(homeUrl) {
  let home = await fetchPage(homeUrl, { retries: 1 });
  let renderMode = false;
  const isShell = (p) => !p.ok || (p.text || '').length < JS_SHELL_CHARS;
  if (isShell(home) && await rendererAvailable()) {
    const r = await renderPage(homeUrl);
    if (r.ok && (r.text || '').length > (home.text || '').length) { home = r; renderMode = true; }
  }
  return { home, renderMode };
}

function pickHintPages(homeUrl, links, hints, cap) {
  const out = [];
  const seen = new Set();
  for (const l of links || []) {
    if (out.length >= cap) break;
    if (!sameHost(homeUrl, l)) continue;
    let clean = l, path = '';
    try { const u = new URL(l); u.search = ''; u.hash = ''; clean = u.toString().replace(/\/$/, ''); path = u.pathname.toLowerCase(); } catch { continue; }
    if (clean === homeUrl || seen.has(clean)) continue;
    if (!hints.some(h => path.includes(h))) continue;
    seen.add(clean);
    out.push(clean);
  }
  return out;
}

function probeUrls(homeUrl, probe, already) {
  let origin;
  try { origin = new URL(homeUrl).origin; } catch { return []; }
  return probe.map(p => origin + p).filter(u => !already.has(u.replace(/\/$/, '')));
}

// ---------------------------------------------------------------------------
// Discovery
// ---------------------------------------------------------------------------

/**
 * Crawl the company's own partner/client + about pages and return raw finds:
 *   { domainPartners:[{name,domain,url}], namePartners:[{name,url}], affiliates:[{name,type,url}] }
 */
async function discoverFromWebsite(company) {
  const homeUrl = toRootUrl(company.website);
  if (!homeUrl) return null;

  const { home, renderMode } = await loadHome(homeUrl);
  if (!home.ok) return { error: home.error || 'home_unreachable' };
  const load = (url) => (renderMode ? renderPage(url) : fetchPage(url));
  const selfHost = hostOf(home.finalUrl) || hostOf(homeUrl) || '';

  // --- partner / client pages ---
  const partnerLinked = pickHintPages(home.finalUrl, home.links, PARTNER_HINTS, MAX_PARTNER_PAGES);
  const seenP = new Set([home.finalUrl.replace(/\/$/, ''), ...partnerLinked.map(u => u.replace(/\/$/, ''))]);
  const partnerProbe = probeUrls(home.finalUrl, PARTNER_PROBE, seenP).slice(0, 3);
  const partnerPages = [];
  for (const url of [...partnerLinked, ...partnerProbe].slice(0, MAX_PARTNER_PAGES)) {
    const r = await load(url);
    if (r.ok && r.html) partnerPages.push(r);
  }

  const domainPartners = [];
  const namePartners   = [];
  const seenDom = new Set();
  const seenNm  = new Set();
  for (const pg of partnerPages) {
    // (a) outbound links → real partner domains (strongest signal)
    for (const link of pg.links || []) {
      const h = hostOf(link);
      if (!h || sameRegistrable(h, selfHost)) continue;
      if (NON_PARTNER_HOST_RX.test(h) || REDIRECT_TRAP_HOSTS.test(h)) continue;
      const reg = registrable(h);
      if (seenDom.has(reg)) continue;
      seenDom.add(reg);
      domainPartners.push({ name: reg.split('.')[0], domain: reg, url: pg.finalUrl });
      if (domainPartners.length >= MAX_PARTNERS) break;
    }
    // (b) logo alt-text → name-only partners (kept as unresolved metadata)
    for (const nm of extractPartners(pg.html)) {
      const c = cleanName(nm);
      const k = c.toLowerCase();
      if (!c || c.length < 3 || seenNm.has(k)) continue;
      seenNm.add(k);
      namePartners.push({ name: c, url: pg.finalUrl });
      if (namePartners.length >= MAX_NAME_ONLY) break;
    }
    if (domainPartners.length >= MAX_PARTNERS && namePartners.length >= MAX_NAME_ONLY) break;
  }

  // --- about / group pages → parent/affiliate text patterns ---
  const affilLinked = pickHintPages(home.finalUrl, home.links, AFFIL_HINTS, 4);
  const seenA = new Set([home.finalUrl.replace(/\/$/, ''), ...affilLinked.map(u => u.replace(/\/$/, ''))]);
  const affilProbe = probeUrls(home.finalUrl, AFFIL_PROBE, seenA).slice(0, 2);
  const affilTexts = [{ text: home.text, url: home.finalUrl }];
  for (const url of [...affilLinked, ...affilProbe].slice(0, 4)) {
    const r = await load(url);
    if (r.ok && r.text) affilTexts.push({ text: r.text, url: r.finalUrl });
  }
  const affiliates = [];
  const seenAff = new Set();
  for (const { text, url } of affilTexts) {
    for (const { rx, type } of AFFIL_PATTERNS) {
      rx.lastIndex = 0;
      let m;
      while ((m = rx.exec(text)) && affiliates.length < MAX_AFFILIATES) {
        const nm = cleanName(m[1]);
        const k = nm.toLowerCase();
        if (!nm || nm.length < 4 || seenAff.has(k)) continue;
        if (!distinctiveName(nm)) continue;
        // ignore self-references
        if (significantTokens(nm).join('') === significantTokens(company.name).join('')) continue;
        seenAff.add(k);
        affiliates.push({ name: nm, type, url });
      }
    }
  }

  return { domainPartners, namePartners, affiliates, renderMode, pages: partnerPages.length + affilTexts.length };
}

// ---------------------------------------------------------------------------
// Resolution + routing
// ---------------------------------------------------------------------------

/** Find an existing company by website domain, else by exact normalised name. */
async function matchExisting(name, domain) {
  if (domain) {
    const reg = registrable(domain);
    const r = await query(
      `SELECT id, name FROM companies
        WHERE website IS NOT NULL AND btrim(website) <> ''
          AND split_part(regexp_replace(lower(btrim(website)), '^https?://(www\\.)?', ''), '/', 1) IN ($1, $2)
        LIMIT 1`,
      [reg, 'www.' + reg],
    );
    if (r.rows.length) return r.rows[0];
  }
  if (name && distinctiveName(name)) {
    const norm = normalizeName(name);
    if (norm && norm.length >= 5) {
      const r = await query(`SELECT id, name FROM companies WHERE name_normalized = $1 LIMIT 1`, [norm]);
      if (r.rows.length) return r.rows[0];
    }
  }
  return null;
}

/** Insert a confirmed-Qatar discovery as a live (auto-entered) company. */
async function insertQatarCompany(name, domain, sourceId) {
  const website = domain ? ('https://' + registrable(domain)) : null;
  const r = await query(
    `INSERT INTO companies
       (name, name_normalized, website, country, is_active, archived, status_normalized, extra_fields)
     VALUES ($1, $2, $3, 'Qatar', true, false, 'active', $4::jsonb)
     RETURNING id`,
    [name, normalizeName(name), website,
     JSON.stringify({ created_via: 'engine3_relationship', source_company_id: sourceId })],
  );
  await recomputeBellScoreForCompany(r.rows[0].id).catch(() => {});
  return r.rows[0].id;
}

/** Upsert a non-Qatar / uncertain discovery into the local holding pen. */
async function upsertCandidate(kind, name, domain, country, relation, sourceId) {
  const website = domain ? ('https://' + registrable(domain)) : null;
  const norm = normalizeName(name);
  // Dedupe by website host or normalised name so re-runs / other sources don't pile up.
  const existing = await query(
    `SELECT id, kind FROM research_candidates
      WHERE ($1::text IS NOT NULL AND website = $1) OR name_normalized = $2
      ORDER BY id LIMIT 1`,
    [website, norm],
  );
  if (existing.rows.length) return existing.rows[0].id;
  const r = await query(
    `INSERT INTO research_candidates
       (kind, name, name_normalized, country, website, relation_to_target, raw, notes)
     VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
     RETURNING id`,
    [kind, name, norm, country, website, relation,
     JSON.stringify({ discovered_via: 'engine3_relationship', source_company_id: sourceId }),
     `${relation} of company #${sourceId} (Engine 3)`],
  );
  return r.rows[0].id;
}

/** Upsert one edge into company_relationships. */
async function upsertEdge(sourceId, { targetCompanyId = null, targetCandidateId = null, name, domain = null, type, via, sourceUrl = null, confidence, countryStatus }) {
  await query(
    `INSERT INTO company_relationships
       (source_company_id, target_company_id, target_candidate_id, target_name, target_domain,
        relation_type, discovered_via, source_url, confidence, country_status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (source_company_id, relation_type, lower(btrim(target_name)))
     DO UPDATE SET
       target_company_id   = COALESCE(EXCLUDED.target_company_id, company_relationships.target_company_id),
       target_candidate_id = COALESCE(EXCLUDED.target_candidate_id, company_relationships.target_candidate_id),
       target_domain       = COALESCE(EXCLUDED.target_domain, company_relationships.target_domain),
       discovered_via      = EXCLUDED.discovered_via,
       source_url          = COALESCE(EXCLUDED.source_url, company_relationships.source_url),
       confidence          = EXCLUDED.confidence,
       country_status      = EXCLUDED.country_status,
       updated_at          = now()`,
    [sourceId, targetCompanyId, targetCandidateId, name, domain, type, via, sourceUrl, confidence, countryStatus],
  );
}

/**
 * Resolve a domain-bearing or name-only discovery to a target and link it.
 * Returns a short outcome tag for counting.
 */
async function resolveAndLink(company, cand, { type, via, confidence = 'medium' }) {
  const name = cleanName(cand.name);
  const domain = cand.domain || null;

  // 1) Already in Bell? Just link.
  const hit = await matchExisting(name, domain);
  if (hit) {
    await upsertEdge(company.id, {
      targetCompanyId: hit.id, name: hit.name || name, domain, type, via,
      sourceUrl: cand.url || null, confidence, countryStatus: 'existing',
    });
    return 'linked_existing';
  }

  // 2) Name-only (no domain) → keep as UNRESOLVED metadata edge (no new company,
  //    no pending-queue noise). We can't classify country without a site.
  if (!domain) {
    if (!distinctiveName(name)) return 'skipped';
    await upsertEdge(company.id, { name, type, via, sourceUrl: cand.url || null, confidence: 'low', countryStatus: 'uncertain' });
    return 'unresolved';
  }

  // 3) New domain-bearing entity → classify country, then route.
  const page = await fetchPage('https://' + registrable(domain), { respectRobots: false, timeoutMs: 8000, retries: 0 })
    .catch(() => null);
  let cls = classifyCountry({ domain, page });
  // Cheap web-search corroboration ONLY when still uncertain and a browser is up:
  // if a .qa domain surfaces for this name, that nudges Qatar.
  if (cls.status === 'uncertain' && await rendererAvailable()) {
    const hosts = (await searchWeb(`${name} Qatar`, { limit: 4 }).catch(() => [])).map(hostOf).filter(Boolean);
    cls = classifyCountry({ domain, page, searchHosts: hosts });
  }

  let edge;
  if (cls.status === 'qatar') {
    const newId = await insertQatarCompany(name, domain, company.id);
    edge = { targetCompanyId: newId, countryStatus: 'qatar' };
  } else if (cls.status === 'non_qatar') {
    const candId = await upsertCandidate('non_qatar', name, domain, cls.country, type, company.id);
    edge = { targetCandidateId: candId, countryStatus: 'non_qatar' };
  } else {
    const candId = await upsertCandidate('pending', name, domain, null, type, company.id);
    edge = { targetCandidateId: candId, countryStatus: 'uncertain' };
  }
  await upsertEdge(company.id, { ...edge, name, domain: registrable(domain), type, via, sourceUrl: cand.url || null, confidence });
  return cls.status === 'qatar' ? 'created_qatar' : (cls.status === 'non_qatar' ? 'created_intl' : 'created_pending');
}

// ---------------------------------------------------------------------------
// Competitors
// ---------------------------------------------------------------------------

/** Internal-derived: other Qatar companies in the same industry, already in Bell. */
async function linkInternalCompetitors(company, tally) {
  if (!company.industry || !String(company.industry).trim()) return;
  const rows = await query(
    `SELECT id, name FROM companies
      WHERE id <> $1
        AND COALESCE(archived,false) = false AND is_active IS NOT false
        AND lower(btrim(country)) = 'qatar'
        AND industry IS NOT NULL AND lower(btrim(industry)) = lower(btrim($2))
        AND id NOT IN (SELECT target_company_id FROM company_relationships
                        WHERE source_company_id = $1 AND target_company_id IS NOT NULL)
      ORDER BY bell_score DESC NULLS LAST, id
      LIMIT $3`,
    [company.id, company.industry, MAX_COMPET_INTERNAL],
  );
  for (const r of rows.rows) {
    await upsertEdge(company.id, {
      targetCompanyId: r.id, name: r.name, type: 'competitor', via: 'internal_industry',
      confidence: 'low', countryStatus: 'existing',
    });
    tally.competitors++;
  }
}

/** Web-search competitors → resolve + route like any other discovery. */
async function linkSearchCompetitors(company, tally) {
  if (!(await rendererAvailable())) return;
  const selfHost = hostOf(company.website) || '';
  const results = await searchWeb(`${company.name} competitors Qatar`, { limit: 6 }).catch(() => []);
  let used = 0;
  const seen = new Set();
  for (const url of results) {
    if (used >= MAX_COMPET_SEARCH) break;
    const h = hostOf(url);
    if (!h || sameRegistrable(h, selfHost)) continue;
    if (NON_PARTNER_HOST_RX.test(h) || REDIRECT_TRAP_HOSTS.test(h)) continue;
    const reg = registrable(h);
    if (seen.has(reg)) continue;
    seen.add(reg);
    used++;
    const outcome = await resolveAndLink(company, { name: reg.split('.')[0], domain: reg, url },
      { type: 'competitor', via: 'web_search', confidence: 'low' });
    bump(tally, outcome);
    tally.competitors++;
  }
}

function bump(tally, outcome) {
  if (outcome === 'created_qatar')   tally.created_qatar++;
  else if (outcome === 'created_intl')    tally.created_intl++;
  else if (outcome === 'created_pending') tally.created_pending++;
  else if (outcome === 'linked_existing') tally.linked++;
  else if (outcome === 'unresolved')      tally.unresolved++;
}

// ---------------------------------------------------------------------------
// Per-company entry point
// ---------------------------------------------------------------------------

export async function enrichCompany(company) {
  if (!company.website || !String(company.website).trim()) {
    await markStage(company.id, 'no_data', { stage9_skip_reason: 'no_website' });
    return { status: 'no_data', reason: 'no_website' };
  }
  await markStage(company.id, 'running');

  const tally = { partners: 0, affiliates: 0, competitors: 0,
                  created_qatar: 0, created_intl: 0, created_pending: 0, linked: 0, unresolved: 0 };

  const found = await discoverFromWebsite(company);
  if (found?.error) {
    await markStage(company.id, 'failed', { stage9_error: found.error });
    return { status: 'failed', reason: found.error };
  }

  if (found) {
    for (const p of found.domainPartners) {
      bump(tally, await resolveAndLink(company, p, { type: 'partner', via: 'website', confidence: 'medium' }));
      tally.partners++;
    }
    for (const p of found.namePartners) {
      bump(tally, await resolveAndLink(company, p, { type: 'partner', via: 'website', confidence: 'low' }));
      tally.partners++;
    }
    for (const a of found.affiliates) {
      bump(tally, await resolveAndLink(company, a, { type: a.type, via: 'website', confidence: 'medium' }));
      tally.affiliates++;
    }
  }

  await linkInternalCompetitors(company, tally);
  await linkSearchCompetitors(company, tally);

  const total = tally.partners + tally.affiliates + tally.competitors;
  const summary = {
    stage9_mapped_at: new Date().toISOString(),
    stage9_found: tally,
    stage9_rendered: !!found?.renderMode,
  };
  await markStage(company.id, total > 0 ? 'done' : 'no_data', summary);

  return { status: total > 0 ? 'done' : 'no_data', tally, total };
}

async function markStage(companyId, status, extras = null) {
  if (extras) {
    await query(
      `UPDATE companies SET stage9_status = $2, stage9_at = now(),
              extra_fields = extra_fields || $3::jsonb
        WHERE id = $1`,
      [companyId, status, JSON.stringify(extras)],
    );
  } else {
    await query(`UPDATE companies SET stage9_status = $2, stage9_at = now() WHERE id = $1`, [companyId, status]);
  }
  await recordSearch(companyId, 9, status, extras);
}

// ---------------------------------------------------------------------------
// Bulk entry point — the orchestrator calls this.
// ---------------------------------------------------------------------------

export async function enrichCompanies(companies, jobLog = null) {
  let done = 0, noData = 0, failed = 0, finished = 0;
  const agg = { created_qatar: 0, created_intl: 0, created_pending: 0, linked: 0, unresolved: 0, edges: 0 };
  const total = companies.length;
  const hasBrowser = await rendererAvailable();
  beginSearchSession();
  jobLog?.(`  Concurrency: ${CONCURRENCY} · Search tier: ${hasBrowser ? 'headless search enabled (web competitors + .qa corroboration)' : 'website-only (install headless browser for web competitors)'}`);
  try {
    await pool(companies, CONCURRENCY, async (c) => {
      try {
        const r = await enrichCompany(c);
        if (r.status === 'done') done++;
        else if (r.status === 'no_data') noData++;
        else failed++;
        if (r.tally) {
          agg.created_qatar += r.tally.created_qatar;
          agg.created_intl += r.tally.created_intl;
          agg.created_pending += r.tally.created_pending;
          agg.linked += r.tally.linked;
          agg.unresolved += r.tally.unresolved;
          agg.edges += r.total;
        }
        const tag = r.status === 'done' ? '✓' : (r.status === 'no_data' ? '·' : '✗');
        jobLog?.(`  ${tag} [${++finished}/${total}] ${c.name}` +
          (r.tally ? ` — ${r.tally.partners}ptnr/${r.tally.affiliates}affil/${r.tally.competitors}comp` +
            ` · +${r.tally.created_qatar}QA/${r.tally.created_intl}intl/${r.tally.created_pending}pend, ${r.tally.linked} linked` : '') +
          (r.reason ? ` (${r.reason})` : ''));
      } catch (err) {
        failed++;
        // Stamp the failure — a company left on 'running' never re-enters the
        // frontier and silently poisons the proof-of-search set.
        try { await markStage(c.id, 'failed', { stage9_error: String(err.message || err).slice(0, 140) }); } catch { /* ignore */ }
        jobLog?.(`  ✗ [${++finished}/${total}] ${c.name} — ${err.message}`);
      }
    });
  } finally {
    await closeRenderer();
  }
  const ss = searchState();
  if (hasBrowser) jobLog?.(`  Search diagnostic: ${ss.count} searches ran, ${ss.results} result(s)${ss.disabled ? ` · DISABLED (${ss.reason})` : ''}.`);
  jobLog?.(`  ▸ ${agg.edges} edge(s) mapped · new companies: ${agg.created_qatar} Qatar (live), ${agg.created_intl} international, ${agg.created_pending} pending · ${agg.linked} linked to existing · ${agg.unresolved} unresolved.`);
  return { done, no_data: noData, failed, usd: 0 };
}
