// Manual Company Lookup — Bell's local "type a name, find everything" engine.
// ----------------------------------------------------------------------------
// An admin types a company name. We:
//
//   1. Look for an EXISTING company by normalised name (exact, then a strong
//      fuzzy match). If found, we simply run the real local engines on it
//      (Engine 1 Finder → Engine 2 Harvester → Engine 3 Mapper) — normal
//      enrichment of a real record — and report what was added.
//
//   2. Otherwise we GATHER A PREVIEW using the same extraction logic the engines
//      use, but WITHOUT writing anything to companies/contacts/people. So an
//      un-approved lookup never enters the database (or the Bell.qa mirror). The
//      preview — website, detected country, emails, phones, socials, address,
//      logo, people, partners — is stored on the manual_lookups row for review.
//
//   3. On APPROVE we create the real company (routed by the detected country)
//      and run the real engines to populate it (which then syncs to Bell.qa like
//      any approved company). On REJECT we mark it rejected — nothing was created.
//
// Local-only, $0 (no Apify/Firecrawl), reuses Engines 1–3 wholesale.

import { query } from '../../db.js';
import { recomputeBellScoreForCompany } from '../../assembly/bell_score.js';
import { normalizeName } from '../../ingest/normalize.js';
import { fetchPage, hostOf, toRootUrl } from './http.js';
import { renderPage, rendererAvailable, searchWeb, beginSearchSession } from './render.js';
import { domainCandidates, verifyMatch, candidateReason, enrichCompany as findWebsite } from './finder.js';
import { enrichCompany as harvestSite } from './harvester.js';
import { enrichCompany as mapNetwork } from './relationships.js';
import { findEmails, findPhones, findSocials, preferOwnEmails, guessAddress, pickLogo, extractTeam, extractPartners, inferIndustry, extractFoundedYear, bestDescription } from './extract.js';
import { classifyCountry } from './country.js';

const JS_SHELL_CHARS = 400;
const MAX_PAGES = 9;
const PAGE_PATHS = ['contact', 'contact-us', 'about', 'about-us', 'team', 'our-team', 'partners', 'clients'];

function safePath(u) {
  try { return (new URL(u).pathname || '/').replace(/\/+$/, '').toLowerCase() || '/'; }
  catch { return String(u).toLowerCase(); }
}
function pathKind(p) {
  if (p.startsWith('contact')) return 'contact';
  if (p.startsWith('about'))   return 'about';
  if (p.startsWith('team') || p.startsWith('our-team')) return 'team';
  if (p.startsWith('partner') || p.startsWith('client')) return 'partner';
  return 'other';
}

// ---------------------------------------------------------------------------
// Lifecycle: create a lookup row before kicking off the background job.
// ---------------------------------------------------------------------------
export async function createLookup(name, triggeredBy = null) {
  const r = await query(
    `INSERT INTO manual_lookups (query_name, name_normalized, status, triggered_by)
     VALUES ($1, $2, 'running', $3) RETURNING id`,
    [name, normalizeName(name), triggeredBy],
  );
  return r.rows[0].id;
}

export async function listLookups(status = 'all') {
  const filter = status && status !== 'all' ? `WHERE l.status = $1` : '';
  const params = status && status !== 'all' ? [status] : [];
  const r = await query(`
    SELECT l.id, l.query_name, l.status, l.result, l.matched_company_id,
           l.triggered_by, l.decided_by, l.created_at, l.decided_at,
           c.name AS matched_company_name, c.bin AS matched_company_bin
      FROM manual_lookups l
      LEFT JOIN companies c ON c.id = l.matched_company_id
      ${filter}
     ORDER BY l.created_at DESC
     LIMIT 100`, params);
  return r.rows;
}

// ---------------------------------------------------------------------------
// Existing-company match (so we enrich rather than duplicate).
// ---------------------------------------------------------------------------
export async function findExistingMatch(name) {
  const norm = normalizeName(name);
  if (!norm || norm.length < 3) return null;
  // 1) Exact normalised name.
  let r = await query(
    `SELECT id, name, website FROM companies
      WHERE name_normalized = $1 AND COALESCE(archived,false) = false
      ORDER BY id LIMIT 1`, [norm]);
  if (r.rows.length) return { ...r.rows[0], match: 'exact' };
  // 2) Strong fuzzy match (pg_trgm). Only >= 0.6 similarity counts as the same co.
  r = await query(
    `SELECT id, name, website, similarity(name_normalized, $1) AS sim
       FROM companies
      WHERE COALESCE(archived,false) = false AND name_normalized % $1
      ORDER BY sim DESC LIMIT 1`, [norm]);
  if (r.rows.length && Number(r.rows[0].sim) >= 0.72) {
    return { ...r.rows[0], match: 'fuzzy', similarity: Number(r.rows[0].sim) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Preview website discovery (no DB writes) — Engine 1's logic, but MORE
// aggressive: a manual lookup is human-confirmed, so we'd rather surface a
// best-guess (clearly marked unverified) than find nothing.
// ---------------------------------------------------------------------------
function rootOf(u) {
  try { const x = new URL(u); x.pathname = '/'; x.search = ''; x.hash = ''; return x.toString().replace(/\/$/, ''); }
  catch { return u; }
}

async function findWebsiteForName(name, jobLog) {
  const probe = { name };
  // 1) Domain guessing — full-name domain + variants, https wave then an http
  //    fallback for any that didn't connect. Verified strictly (the domain itself
  //    is the evidence). Reliable for a company whose domain is just its name,
  //    e.g. q7softwaresolutions.com.
  const cands = domainCandidates(name, 12);
  if (cands.length) {
    const httpsPages = await Promise.all(
      cands.map(d => fetchPage('https://' + d, { respectRobots: false, timeoutMs: 8000 }).catch(() => null)),
    );
    for (let i = 0; i < cands.length; i++) {
      if (verifyMatch(httpsPages[i], probe, { fromGuess: true })) {
        jobLog?.(`  ✓ domain guess verified → ${httpsPages[i].finalUrl}`);
        return { url: httpsPages[i].finalUrl, method: 'guess', page: httpsPages[i] };
      }
    }
    const needHttp = cands.filter((_, k) => !httpsPages[k] || !httpsPages[k].ok);
    if (needHttp.length) {
      const httpPages = await Promise.all(
        needHttp.map(d => fetchPage('http://' + d, { respectRobots: false, timeoutMs: 8000 }).catch(() => null)),
      );
      for (let k = 0; k < needHttp.length; k++) {
        if (verifyMatch(httpPages[k], probe, { fromGuess: true })) {
          jobLog?.(`  ✓ domain guess verified → ${httpPages[k].finalUrl}`);
          return { url: httpPages[k].finalUrl, method: 'guess', page: httpPages[k] };
        }
      }
    }
  }
  // 2) Search — accept ONLY a result that verifies against the name. Try a few
  //    queries to give the verifier more chances. NO blind "first result"
  //    fallback (that grabbed irrelevant sites); if nothing verifies we honestly
  //    report "no website found".
  if (await rendererAvailable()) {
    beginSearchSession();
    const queries = [`${name} Qatar official website`, `${name} Qatar`, `${name}`];
    const tried = new Set();
    for (const q of queries) {
      const results = await searchWeb(q, { limit: 6 });
      for (const url of results) {
        const host = (hostOf(url) || '').toLowerCase();
        if (!host || tried.has(host)) continue;
        tried.add(host);
        const page = await fetchPage(url, { respectRobots: false, timeoutMs: 9000, retries: 1 });
        if (candidateReason(page, probe)) {
          jobLog?.(`  ⊕ search match → ${rootOf(page.finalUrl)}`);
          return { url: rootOf(page.finalUrl), method: 'search', page };
        }
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Preview crawl + extract (no DB writes) — mirrors Engine 2's extraction.
// ---------------------------------------------------------------------------
async function crawlAndExtract(siteUrl, jobLog) {
  const homeUrl = toRootUrl(siteUrl) || siteUrl;
  let home = await fetchPage(homeUrl, { retries: 1 });
  let rendered = false;
  if ((!home.ok || (home.text || '').length < JS_SHELL_CHARS) && await rendererAvailable()) {
    const r = await renderPage(homeUrl);
    if (r.ok && (r.text || '').length > (home.text || '').length) { home = r; rendered = true; }
  }
  if (!home.ok) return { ok: false, reason: home.error || 'home_unreachable' };

  const load = (u) => (rendered ? renderPage(u) : fetchPage(u));
  const pages = [{ url: home.finalUrl, kind: 'home', page: home }];
  const seen = new Set([safePath(home.finalUrl)]);
  for (const p of PAGE_PATHS) {
    if (pages.length >= MAX_PAGES) break;
    let u; try { u = new URL('/' + p, home.finalUrl).toString(); } catch { continue; }
    if (seen.has(safePath(u))) continue;
    seen.add(safePath(u));
    const r = await load(u);
    if (r.ok && r.text) pages.push({ url: r.finalUrl, kind: pathKind(p), page: r });
  }

  const allText   = pages.map(p => p.page.text).join('\n');
  const allLinks  = pages.flatMap(p => p.page.links || []);
  const allMailto = pages.flatMap(p => p.page.mailto || []);
  const allTel    = pages.flatMap(p => p.page.tel || []);

  const siteDomain = (hostOf(home.finalUrl) || '').replace(/^www\./, '');
  const emails  = preferOwnEmails([...new Set([...allMailto, ...findEmails(allText)])], siteDomain, 12);
  const phones  = findPhones(allText, allTel).slice(0, 10).map(p => p.display || p.value);
  const socials = findSocials(allText, allLinks).slice(0, 20).map(s => ({ network: s.network, url: s.url }));
  const address = guessAddress(allText);
  const logo    = pickLogo(pages[0].page.meta || {});
  const homeMeta = pages[0].page.meta || {};
  const description = bestDescription(homeMeta, allText);
  const keywords = homeMeta.keywords || null;
  const industry = inferIndustry(`${homeMeta.title || ''} ${description || ''} ${keywords || ''} ${allText.slice(0, 4000)}`);
  const foundedYear = extractFoundedYear(allText);

  const teamPages = pages.filter(p => p.kind === 'team' || p.kind === 'about');
  const people = (teamPages.length ? teamPages.flatMap(p => extractTeam(p.page.text)) : [])
    .map(t => ({ name: t.name, title: t.title || null })).slice(0, 40);

  const partnerPages = pages.filter(p => p.kind === 'partner');
  const sectionPages = pages.filter(p => p.kind === 'home' || p.kind === 'about');
  const partners = [...new Set([
    ...partnerPages.flatMap(p => extractPartners(p.page.html)),
    ...sectionPages.flatMap(p => extractPartners(p.page.html, 60, { sectionOnly: true })),
  ])].slice(0, 60);

  return {
    ok: true, rendered, pages_crawled: pages.length,
    emails, phones, socials, address, logo, description, keywords, industry, founded_year: foundedYear, people, partners,
  };
}

// ---------------------------------------------------------------------------
// Helpers for the existing-match path.
// ---------------------------------------------------------------------------
async function contactCounts(companyId) {
  const r = await query(`
    SELECT
      (SELECT count(*) FROM company_contacts      WHERE company_id = $1)        AS contacts,
      (SELECT count(*) FROM person_companies       WHERE company_id = $1)        AS people,
      (SELECT count(*) FROM company_relationships  WHERE source_company_id = $1) AS edges`, [companyId]);
  const x = r.rows[0] || {};
  return { contacts: Number(x.contacts || 0), people: Number(x.people || 0), edges: Number(x.edges || 0) };
}

async function runEnginesOn(companyId, jobLog, { runFinder = false } = {}) {
  const row0 = (await query(`SELECT * FROM companies WHERE id = $1`, [companyId])).rows[0];
  if (!row0) return;
  if (runFinder && (!row0.website || !String(row0.website).trim())) {
    try { await findWebsite(row0); } catch (e) { jobLog?.(`  [E1] ${e.message}`); }
  }
  const row1 = (await query(`SELECT * FROM companies WHERE id = $1`, [companyId])).rows[0];
  try { await harvestSite(row1); } catch (e) { jobLog?.(`  [E2] ${e.message}`); }
  const row2 = (await query(`SELECT * FROM companies WHERE id = $1`, [companyId])).rows[0];
  try { await mapNetwork(row2); } catch (e) { jobLog?.(`  [E3] ${e.message}`); }
}

// Gather a no-DB-write PREVIEW of a typed name: find its website (Engine 1
// logic), crawl + extract (Engine 2 logic), classify country. Returns the
// findings object that gets stored on the lookup for the admin to review.
async function gatherPreview(name, jobLog) {
  const site = await findWebsiteForName(name, jobLog);
  if (!site) {
    jobLog?.(`  · No website found for "${name}". You can still approve to add it by name only.`);
    return { website: null, website_method: null, country: null, ok: false, reason: 'no_website_found' };
  }
  jobLog?.(`  Crawling ${site.url} for contacts, people and partners…`);
  const ex = await crawlAndExtract(site.url, jobLog);
  const country = classifyCountry({ domain: hostOf(site.url), page: site.page });
  if (ex.ok) {
    jobLog?.(`  ✓ Preview ready — ${ex.emails.length} email(s), ${ex.phones.length} phone(s), ${ex.socials.length} social(s), ${ex.people.length} people, ${ex.partners.length} partner(s) · country: ${country.status}`);
  } else {
    jobLog?.(`  · Found the site but crawl failed (${ex.reason}). You can still approve it.`);
  }
  return { website: site.url, website_method: site.method, country, ...ex };
}

// ---------------------------------------------------------------------------
// Main: run a lookup (called in the background after createLookup()).
// ---------------------------------------------------------------------------
export async function runLookup(lookupId, name, { jobLog = null } = {}) {
  jobLog?.(`▸▸▸ Manual Lookup — "${name}"`);
  try {
    // 1) Check Bell first. We NEVER auto-act — the admin always decides.
    const match = await findExistingMatch(name);

    // 1a) EXACT match → it's the same company. Offer to enrich it (no preview,
    //     and no "add as new" which would just create a duplicate).
    if (match && match.match === 'exact') {
      jobLog?.(`  ● "${name}" already exists in Bell as #${match.id} — "${match.name}". Choose to enrich it, or reject.`);
      await query(
        `UPDATE manual_lookups SET status='pending', matched_company_id=NULL, result=$2::jsonb, updated_at=now() WHERE id=$1`,
        [lookupId, JSON.stringify({
          exact: true,
          suggested_match: { id: match.id, name: match.name, website: match.website || null, similarity: 1, match: 'exact' },
        })],
      );
      jobLog?.(`▸▸▸ Lookup complete — confirm whether to enrich the existing company.`);
      return { matched: false, pending: true, suggested: true, exact: true };
    }

    // 1b) Fuzzy match (a suggestion) or no match → run the engines on the name
    //     the admin actually typed, gather a preview, and present for approval.
    if (match) {
      jobLog?.(`  ⚠ Possible existing match: #${match.id} "${match.name}" (${Math.round((match.similarity || 0) * 100)}% similar). Looking up "${name}" itself so you can compare…`);
    } else {
      jobLog?.(`  No existing company matches "${name}". Running the engines to find it…`);
    }
    const preview = await gatherPreview(name, jobLog);
    if (match) {
      preview.suggested_match = {
        id: match.id, name: match.name, website: match.website || null, similarity: match.similarity || null, match: 'fuzzy',
      };
    }
    await query(
      `UPDATE manual_lookups SET status='pending', result=$2::jsonb, updated_at=now() WHERE id=$1`,
      [lookupId, JSON.stringify(preview)],
    );
    jobLog?.(`▸▸▸ Lookup complete — ${match ? `enrich the suggested match, or approve "${name}" as new.` : 'review and approve or reject.'}`);
    return { matched: false, pending: true, suggested: !!match, website: preview.website };
  } catch (err) {
    await query(`UPDATE manual_lookups SET status='error', result=$2::jsonb, updated_at=now() WHERE id=$1`,
      [lookupId, JSON.stringify({ error: err.message })]).catch(() => {});
    jobLog?.(`  ✗ Lookup failed: ${err.message}`);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Approve — materialise a pending lookup into a real, enriched company.
// ---------------------------------------------------------------------------
export async function approveLookup(lookupId, admin, { jobLog = null } = {}) {
  const lk = (await query(`SELECT * FROM manual_lookups WHERE id = $1`, [lookupId])).rows[0];
  if (!lk) throw new Error('lookup not found');

  // A matched lookup already enriched a real company — just record the decision.
  if (lk.status === 'matched') {
    await query(`UPDATE manual_lookups SET status='approved', decided_by=$2, decided_at=now(), updated_at=now() WHERE id=$1`, [lookupId, admin]);
    return { company_id: lk.matched_company_id, created: false };
  }
  if (lk.status !== 'pending') throw new Error(`lookup is "${lk.status}", cannot approve`);
  if (lk.result?.exact) throw new Error(`"${lk.query_name}" already exists in Bell — use "Enrich" instead of adding a duplicate.`);

  const r = lk.result || {};
  const name = lk.query_name;
  const website = r.website || null;
  // Country: trust a confident classifier; default Qatar (admin approved it for Bell).
  const country = r.country?.status === 'non_qatar'
    ? (r.country?.country || 'Unknown')
    : 'Qatar';

  jobLog?.(`▸▸▸ Approving "${name}" — creating company…`);
  const ins = await query(
    `INSERT INTO companies
       (name, name_normalized, website, country, is_active, archived, status_normalized, extra_fields)
     VALUES ($1, $2, $3, $4, true, false, 'active', $5::jsonb)
     RETURNING *`,
    [name, normalizeName(name), website, country,
     JSON.stringify({ created_via: 'manual_lookup', manual_lookup_id: lookupId })],
  );
  const company = ins.rows[0];
  await recomputeBellScoreForCompany(company.id).catch(() => {});
  jobLog?.(`  ✓ Created company #${company.id}${website ? ' · ' + website : ' (name only)'}`);

  // Populate it for real (persists + syncs). Engine 2 then Engine 3; Engine 1
  // only if we somehow have no website yet (admin may have a name-only record).
  await runEnginesOn(company.id, jobLog, { runFinder: !website });

  await query(
    `UPDATE manual_lookups SET status='approved', matched_company_id=$2, decided_by=$3, decided_at=now(), updated_at=now() WHERE id=$1`,
    [lookupId, company.id, admin],
  );
  jobLog?.(`▸▸▸ Approved — company #${company.id} is now in Bell and will sync on next push.`);
  return { company_id: company.id, created: true };
}

// ---------------------------------------------------------------------------
// Enrich the SUGGESTED existing company instead of creating a new one — used
// when the admin confirms a fuzzy suggestion ("yes, it's that company").
// ---------------------------------------------------------------------------
export async function enrichMatchLookup(lookupId, admin, { jobLog = null } = {}) {
  const lk = (await query(`SELECT * FROM manual_lookups WHERE id = $1`, [lookupId])).rows[0];
  if (!lk) throw new Error('lookup not found');
  if (lk.status !== 'pending') throw new Error(`lookup is "${lk.status}", cannot enrich a match`);
  const sm = lk.result?.suggested_match;
  if (!sm?.id) throw new Error('no suggested match on this lookup');

  jobLog?.(`▸▸▸ Enriching existing match #${sm.id} — "${sm.name}"…`);
  const before = await contactCounts(sm.id);
  await runEnginesOn(sm.id, jobLog, { runFinder: true });
  const after = await contactCounts(sm.id);
  const enriched = {
    added_contacts: after.contacts - before.contacts,
    added_people:   after.people   - before.people,
    added_edges:    after.edges    - before.edges,
  };
  await query(
    `UPDATE manual_lookups SET status='matched', matched_company_id=$2, result = result || $3::jsonb, decided_by=$4, decided_at=now(), updated_at=now() WHERE id=$1`,
    [lookupId, sm.id, JSON.stringify({ matched: { id: sm.id, name: sm.name, match: 'fuzzy' }, enriched, decision: 'enrich_match' }), admin],
  );
  jobLog?.(`▸▸▸ Done — enriched #${sm.id}: +${enriched.added_contacts} contact(s), +${enriched.added_people} people, +${enriched.added_edges} edge(s).`);
  return { company_id: sm.id, created: false };
}

// ---------------------------------------------------------------------------
// Reject — discard a pending lookup. Nothing was ever created.
// ---------------------------------------------------------------------------
export async function rejectLookup(lookupId, admin) {
  const r = await query(
    `UPDATE manual_lookups
        SET status='rejected', decided_by=$2, decided_at=now(), updated_at=now()
      WHERE id=$1 AND status IN ('pending','error')
      RETURNING id`,
    [lookupId, admin],
  );
  if (!r.rows.length) throw new Error('only a pending lookup can be rejected');
  return { rejected: true };
}
