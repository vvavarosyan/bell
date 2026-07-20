// Stage 7 — Local Website Harvester  (Bell's local enrichment superpower)
// ----------------------------------------------------------------------------
// For each active company that has a website, crawl the site locally (NO
// Firecrawl / Apify) and mine every contact signal we can:
//
//   homepage  →  discover the high-value pages (contact / about / team /
//   leadership / careers / partners) from the header & footer nav  →  fetch
//   them  →  extract:
//       • emails, phones, social profiles  → company_contacts
//       • postal address                   → companies.address (if empty)
//       • logo (og:image / favicon)        → extra_fields.website_logo_url
//       • description                       → extra_fields.website_description
//       • team people (name + title)       → people + person_companies
//       • partner / client company names   → extra_fields.harvested_partners
//
// Provenance: every contact row is stamped source='stage7-website',
// source_url=the exact page it came from, so the admin can verify each find in
// the drawer. Re-running is idempotent (upserts + name-keyed people lookup), so
// the engine can sweep the database continuously and only ever *adds* data.
//
// Cost: $0 — it's all local fetch.

import { query } from '../../db.js';
import { upsertContact } from '../../lib/contacts.js';
import { recomputeBellScoreForCompany } from '../../assembly/bell_score.js';
import { inferSeniority } from '../seniority.js';
import { fetchPage, toRootUrl, sameHost, hostOf, pool } from './http.js';
import { renderPage, rendererAvailable, closeRenderer } from './render.js';
import { recordReject } from './rejects.js';
import { recordSearch } from './ledger.js';
import { contentIdentity } from './content_identity.js';
import { extractMapLinks } from './maplinks.js';
import {
  findEmails, findCfEmails, findPhones, findSocials, findWhatsApp, preferOwnEmails,
  guessAddress, guessAddresses, extractTeam, extractPartners, pickLogo,
  inferIndustry, extractFoundedYear, bestDescription,
} from './extract.js';

export const STAGE_LABEL = 'Local Engine 2 — Website Harvester';
export const TOOL_NAME   = 'local_website_harvester';

const MAX_PAGES        = 13;     // homepage + up to 12 discovered pages (Track A: was 9 — room for locations + lang-prefixed pages)
const JS_SHELL_CHARS   = 400;    // homepage text shorter than this ⇒ JS-rendered shell
const CONCURRENCY      = Number(process.env.BELL_HARVESTER_CONCURRENCY || 7);
const SOURCE           = 'stage7-website';
// Track A: at most this many per-page render escalations per company (each render is 5-22s;
// the MAX_BROWSER_PAGES=3 semaphore protects memory, this protects sweep time).
const MAX_PAGE_RENDERS = 2;

// Page-path hints, grouped by what we expect to mine there. Arabic hints work because
// classifyPage/pickPages decode the pathname before matching.
const PAGE_HINTS = {
  contact:  ['/contact', '/contact-us', '/contactus', '/get-in-touch', '/reach-us', '/reach', '/enquir', '/inquir', '/اتصل', '/تواصل'],
  location: ['/location', '/locations', '/branch', '/branches', '/our-locations', '/our-branches', '/where-we-are', '/find-us', '/store-locator', '/showrooms', '/outlets', '/فروع'],
  about:    ['/about', '/about-us', '/aboutus', '/who-we-are', '/company', '/overview'],
  // Clinical/professional staff pages included (Val approved 2026-07-15: doctors/staff
  // captured; people data is already admin-locked platform-wide, so this inherits PDPPL
  // protection automatically — customers never see person details).
  team:     ['/team', '/our-team', '/people', '/leadership', '/management', '/board', '/staff', '/directors', '/founders',
             '/doctors', '/our-doctors', '/physicians', '/medical-team', '/consultants', '/specialists', '/dentists', '/أطباء'],
  partner:  ['/partner', '/partners', '/clients', '/our-clients', '/customers', '/sponsors', '/brands'],
};
const ALL_HINTS = Object.values(PAGE_HINTS).flat();

function decodedPath(url) {
  let path = '/';
  try { path = new URL(url).pathname.toLowerCase(); } catch {}
  try { path = decodeURIComponent(path); } catch { /* keep encoded */ }
  return path;
}

function classifyPage(url) {
  const path = decodedPath(url);
  for (const [kind, hints] of Object.entries(PAGE_HINTS)) {
    if (hints.some(h => path.includes(h))) return kind;
  }
  return 'other';
}

// Common paths to probe directly even when the homepage doesn't link them
// (sites with JavaScript-rendered navs hide their links from the raw HTML).
// Track A adds locations + language-prefixed variants (/en/contact, /ar/contact) — many Qatar
// sites live entirely under a language prefix, where the bare guesses 404.
const GUESS_PATHS = [
  { path: '/contact',     kind: 'contact' },
  { path: '/contact-us',  kind: 'contact' },
  { path: '/en/contact',  kind: 'contact' },
  { path: '/en/contact-us', kind: 'contact' },
  { path: '/ar/contact',  kind: 'contact' },
  { path: '/locations',   kind: 'location' },
  { path: '/branches',    kind: 'location' },
  { path: '/about',       kind: 'about'   },
  { path: '/about-us',    kind: 'about'   },
  { path: '/en/about',    kind: 'about'   },
  { path: '/our-team',    kind: 'team'    },
  { path: '/team',        kind: 'team'    },
  { path: '/partners',    kind: 'partner' },
  { path: '/clients',     kind: 'partner' },
  { path: '/our-clients', kind: 'partner' },
];

function guessPages(homeUrl) {
  let origin;
  try { origin = new URL(homeUrl).origin; } catch { return []; }
  return GUESS_PATHS.map(g => ({ url: origin + g.path, kind: g.kind, guessed: true }));
}

function safePath(url) {
  try { return new URL(url).pathname.replace(/\/$/, '').toLowerCase() || '/'; }
  catch { return url; }
}

/** From the homepage link list, choose the key pages to crawl (same host). */
function pickPages(homeUrl, links) {
  const picked = [];
  const seen = new Set();
  const wantKinds = new Set(['contact', 'about', 'team', 'partner']);
  const gotKind = new Set();

  for (const l of links || []) {
    if (picked.length >= MAX_PAGES - 1) break;
    if (!sameHost(homeUrl, l)) continue;
    let clean = l;
    try { const u = new URL(l); u.search = ''; u.hash = ''; clean = u.toString().replace(/\/$/, ''); } catch { continue; }
    if (clean === homeUrl || seen.has(clean)) continue;
    const path = decodedPath(clean);
    if (!ALL_HINTS.some(h => path.includes(h))) continue;
    const kind = classifyPage(clean);
    // Prefer breadth: at most 2 pages of any single kind.
    const kindCount = picked.filter(p => p.kind === kind).length;
    if (kindCount >= 2) continue;
    seen.add(clean);
    gotKind.add(kind);
    picked.push({ url: clean, kind });
  }
  // Sort so contact/locations/team come first (most valuable) within our small budget.
  const order = { contact: 0, location: 1, team: 2, about: 3, partner: 4, other: 5 };
  picked.sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9));
  return picked.slice(0, MAX_PAGES - 1);
}

// ---------------------------------------------------------------------------
// Per-company harvest
// ---------------------------------------------------------------------------

export async function enrichCompany(company) {
  const homeUrl = toRootUrl(company.website);
  if (!homeUrl) {
    await markStage(company.id, 'no_data', { stage7_skip_reason: 'no_website' });
    return { status: 'no_data', reason: 'no_website', usd: 0 };
  }

  await markStage(company.id, 'running');

  // 1) Homepage — plain fetch first (fast, $0; 1 retry on transient errors). If
  // it comes back as a near-empty JS shell, re-render it with a headless browser
  // (if one is installed). The whole site is then crawled in the same mode.
  let home = await fetchPage(homeUrl, { retries: 1 });
  let renderMode = false;
  let renderTried = false;

  const isShell = (p) => !p.ok || (p.text || '').length < JS_SHELL_CHARS;
  if (isShell(home) && await rendererAvailable()) {
    renderTried = true;
    const r = await renderPage(homeUrl);
    if (r.ok && (r.text || '').length > (home.text || '').length) { home = r; renderMode = true; }
  }

  if (!home.ok) {
    // robots-blocked is a polite skip, not a failure — record it quietly.
    if (home.error === 'robots_disallow') {
      await markStage(company.id, 'no_data', { stage7_skip_reason: 'robots' });
      return { status: 'no_data', reason: 'robots', usd: 0 };
    }
    await markStage(company.id, 'failed', { stage7_error: home.error || 'home_unreachable' });
    return { status: 'failed', reason: home.error || 'home_unreachable', usd: 0 };
  }

  // Pick the loader for the rest of the site based on the homepage's mode.
  const load = (url) => (renderMode ? renderPage(url) : fetchPage(url));

  const pages = [{ url: home.finalUrl, kind: 'home', page: home }];

  // 2) Build the crawl set: pages linked from the homepage, then common paths
  // probed directly (covers JS navs). De-dupe by URL/path, cap at MAX_PAGES.
  const linked = pickPages(home.finalUrl, home.links);
  const seenPath = new Set([safePath(home.finalUrl)]);
  for (const p of linked) seenPath.add(safePath(p.url));
  const guesses = guessPages(home.finalUrl).filter(g => !seenPath.has(safePath(g.url)));
  const toCrawl = [...linked, ...guesses].slice(0, MAX_PAGES - 1);

  // 3) Load them (sequential, polite). Guessed pages soft-fail on 404.
  // Track A: PER-PAGE render escalation — a fetch-mode crawl whose contact/locations page is a
  // JS shell used to silently yield nothing (only the HOMEPAGE ever escalated). Bounded to
  // MAX_PAGE_RENDERS per company, highest-value kinds only.
  let pageRenders = 0;
  let shellSubpageUnrendered = false;
  for (const p of toCrawl) {
    let r = await load(p.url);
    const isShellPage = !r.ok || (r.text || '').length < JS_SHELL_CHARS;
    if (isShellPage && !renderMode && (p.kind === 'contact' || p.kind === 'location')) {
      if (pageRenders < MAX_PAGE_RENDERS && await rendererAvailable()) {
        pageRenders += 1;
        const rr = await renderPage(p.url);
        if (rr.ok && (rr.text || '').length > (r.text || '').length) r = rr;
      } else if (isShellPage) {
        // A key page stayed unreadable — proof-of-search must not claim verified-empty.
        shellSubpageUnrendered = true;
      }
    }
    if (r.ok && r.text) pages.push({ url: r.finalUrl, kind: p.kind, page: r });
  }

  // 3) Aggregate.
  const allText  = pages.map(p => p.page.text).join('\n');
  const allLinks = pages.flatMap(p => p.page.links);
  const allMailto = pages.flatMap(p => p.page.mailto);
  const allTel    = pages.flatMap(p => p.page.tel);

  // 4) Extract. Keep contacts that plausibly belong to THIS company:
  //    - emails: same domain as the site, or webmail (drops footer-credit /
  //      client emails on other companies' domains);
  //    - phones: deduped by digits (collapses format variants), capped;
  //    - socials: capped per platform inside findSocials.
  const siteDomain = (hostOf(home.finalUrl) || '').replace(/^www\./, '');
  // Track A: also decode Cloudflare-obfuscated emails from RAW HTML (invisible in text), and
  // detect web-agency credit domains ("designed by …") so role emails on an agency's domain
  // are still dropped even though role@other-domain is now generally kept.
  const cfEmails = pages.flatMap((p) => findCfEmails(p.page.html));
  const agencyDomains = new Set();
  for (const m of allText.matchAll(/(?:designed|developed|powered|created|built)\s+by[^\n]{0,80}/gi)) {
    for (const dm of m[0].matchAll(/([a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,24})/gi)) agencyDomains.add(dm[1].toLowerCase());
  }
  const rawEmails = [...new Set([...allMailto, ...findEmails(allText), ...cfEmails])];
  const emails  = preferOwnEmails(rawEmails, siteDomain, 12, { agencyDomains });
  const phones  = findPhones(allText, allTel).slice(0, 10);
  const socials = findSocials(allText, allLinks, { companyName: company.name, siteDomain });
  const whatsapp = findWhatsApp(allText, allLinks);
  const address = guessAddress(allText);
  // Track B: ALL address lines, per page (provenance kept), for company_locations.
  const locationCandidates = [];
  for (const p of pages) {
    if (p.kind !== 'contact' && p.kind !== 'location' && p.kind !== 'home') continue;
    for (const a of guessAddresses(p.page.text)) locationCandidates.push({ ...a, source_url: p.url });
  }
  // Track B+: Google-Maps links the company pins on its OWN site carry EXACT
  // coordinates (the company stated them — not a guess), so a branch becomes a
  // map pin with no INWANI codes needed. Each distinct pin → a location with
  // lat/lng already set (Qatar-bbox validated inside extractMapLinks).
  const mapPins = [];
  for (const p of pages) {
    if (p.kind !== 'contact' && p.kind !== 'location' && p.kind !== 'home') continue;
    const { coords } = extractMapLinks(p.page.html, p.page.links);
    for (const c of coords) mapPins.push({ ...c, source_url: p.url });
  }
  const seenPin = new Set();
  for (const pin of mapPins) {
    const key = pin.lat.toFixed(4) + ',' + pin.lng.toFixed(4);
    if (seenPin.has(key)) continue;
    seenPin.add(key);
    locationCandidates.push({
      label: pin.name || 'Branch',
      // Distinct address key per pin (satisfies the UNIQUE) — the place name if
      // the link had one, else the coordinate string. Never a fabricated street.
      address: pin.name || (pin.lat.toFixed(5) + ', ' + pin.lng.toFixed(5)),
      latitude: pin.lat, longitude: pin.lng,
      source_url: pin.source_url,
    });
  }
  const logo    = pickLogo(pages[0].page.meta);
  const homeMeta = pages[0].page.meta || {};
  const description = bestDescription(homeMeta, allText);
  const keywords = homeMeta.keywords || null;
  const industry = inferIndustry(`${homeMeta.title || ''} ${description || ''} ${keywords || ''} ${allText.slice(0, 4000)}`);
  const foundedYear = extractFoundedYear(allText);

  // Content-identity guard (Rule 2.1): a RIGHT domain can serve the WRONG company
  // (e.g. foundationendowment.com — matches "Qatar Foundation Endowment" — actually
  // serving a "Smart Evolution" tech blog). If the page's content clearly belongs to a
  // DIFFERENT brand and never mentions this company, store NOTHING derived from it and
  // flag for admin review. We keep the website itself (the domain matches the name; only
  // the content is wrong — a parked/hijacked/rebranded page), never wiping it.
  const idv = contentIdentity(company, { meta: homeMeta, text: allText, ok: home.ok, url: home.finalUrl });
  if (idv.verdict === 'content-conflict') {
    await flagWebsiteContentConflict(company.id, idv, home.finalUrl);
    for (const e of rawEmails.slice(0, 40)) {
      await recordReject(company.id, 'harvester', 'email', e, `website content is a different company (${idv.brand})`);
    }
    const summary = {
      stage7_scraped_at: new Date().toISOString(),
      stage7_pages: pages.map(p => ({ url: p.url, kind: p.kind })),
      stage7_rendered: renderMode,
      stage7_content_conflict: { brand: idv.brand, matched: idv.matched, evidence: idv.evidence },
      stage7_found: { emails: 0, phones: 0, socials: 0, people: 0, partners: 0 },
    };
    await markStage(company.id, 'done', summary);
    await recomputeBellScoreForCompany(company.id);
    return { status: 'done', usd: 0, scraped_pages: pages.map(p => p.url), note: `website content conflict: ${idv.brand}`, found: summary.stage7_found };
  }

  // Team people only from team/about pages (least noisy).
  const teamPages = pages.filter(p => p.kind === 'team' || p.kind === 'about');
  const team = teamPages.length
    ? dedupeByName(teamPages.flatMap(p => extractTeam(p.page.text).map(t => ({ ...t, url: p.url }))))
    : [];

  // Partners/clients: dedicated partner pages (whole page is the logo wall),
  // PLUS a "partners / clients / trusted by" SECTION on the homepage or about
  // page — that's where most sites (e.g. Q7Software Solutions) list them.
  const partnerPages = pages.filter(p => p.kind === 'partner');
  const sectionPages = pages.filter(p => p.kind === 'home' || p.kind === 'about');
  const partners = [...new Set([
    ...partnerPages.flatMap(p => extractPartners(p.page.html)),
    ...sectionPages.flatMap(p => extractPartners(p.page.html, 60, { sectionOnly: true })),
  ])].slice(0, 60);

  // 5) Persist contacts (provenance = the page each was found on, best-effort).
  const homeProv = pages[0].url;
  let wE = 0, wP = 0, wS = 0, wW = 0, wL = 0;
  const keptEmailSet = new Set(emails.map((x) => String(x).toLowerCase()));
  const siteDomLower = siteDomain.toLowerCase();
  for (const e of emails) {
    // Off-domain ROLE mailboxes are kept (Doha Clinic class) but labelled so the drawer
    // shows WHY the domain differs.
    const d = String(e).split('@')[1] || '';
    const offDomainRole = siteDomLower && d !== siteDomLower && !d.endsWith('.' + siteDomLower) && !siteDomLower.endsWith('.' + d);
    const r = await upsertContact('company', company.id, {
      type: 'email', value: e, source: SOURCE, source_url: homeProv,
      ...(offDomainRole ? { source_label: 'role email on external domain' } : {}),
    });
    if (r) wE++; else await recordReject(company.id, 'harvester', 'email', e, 'invalid or junk address');
  }
  // Emails seen on the page but NOT kept (other companies' domains / over cap).
  for (const e of rawEmails.slice(0, 40)) {
    if (!keptEmailSet.has(String(e).toLowerCase())) await recordReject(company.id, 'harvester', 'email', e, 'off-domain — not this company');
  }
  for (const p of phones) {
    const r = await upsertContact('company', company.id, { type: 'phone', value: p.value, value_display: p.display, source: SOURCE, source_url: homeProv });
    if (r) wP++;
  }
  for (const w of whatsapp) {
    const r = await upsertContact('company', company.id, { type: 'whatsapp', value: w, value_display: w, source: SOURCE, source_url: homeProv, source_label: 'WhatsApp' });
    if (r) wW++;
  }
  for (const s of socials) {
    const r = await upsertContact('company', company.id, { type: 'social', value: s.url, value_display: s.url, source: SOURCE, source_url: homeProv, source_label: s.network });
    if (r) wS++;
  }

  // 5b) Branch/location rows (Track B). One row per distinct address line; re-harvest updates
  // (unique on company_id + lower(address)), never duplicates. Geocoding happens later via
  // "Geocode Companies.command" — coordinates stay NULL here (Rule 2.1).
  for (const loc of locationCandidates.slice(0, 12)) {
    try {
      const hasCoords = Number.isFinite(loc.latitude) && Number.isFinite(loc.longitude);
      const r = await query(
        `INSERT INTO company_locations (company_id, label, address, latitude, longitude, source, source_url, geocode_status, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8, now())
         ON CONFLICT (company_id, lower(address)) DO UPDATE
           SET label = COALESCE(company_locations.label, EXCLUDED.label),
               -- Only ADD coordinates from a map pin; never overwrite an existing geocode.
               latitude  = COALESCE(company_locations.latitude,  EXCLUDED.latitude),
               longitude = COALESCE(company_locations.longitude, EXCLUDED.longitude),
               geocode_status = CASE WHEN company_locations.latitude IS NULL AND EXCLUDED.latitude IS NOT NULL
                                     THEN EXCLUDED.geocode_status ELSE company_locations.geocode_status END,
               source_url = EXCLUDED.source_url, updated_at = now()
         RETURNING id`,
        [company.id, loc.label ? loc.label.slice(0, 120) : null, loc.address.slice(0, 300),
         hasCoords ? loc.latitude : null, hasCoords ? loc.longitude : null,
         SOURCE, loc.source_url, hasCoords ? 'website-maplink' : null]);
      if (r.rows[0]) wL++;
    } catch (e) { /* table may predate migration 098 on stale boots; never break the harvest */ }
  }

  // 6) Company-level fields (only fill blanks — never overwrite curated data).
  await fillCompanyBlanks(company.id, { address, logo, description, industry, foundedYear, keywords });

  // 7) People + partners.
  const peopleAdded = await persistTeam(company.id, team);
  if (partners.length) await mergePartners(company.id, partners);

  // 8) Summary + status + live Bell Score.
  const summary = {
    stage7_scraped_at: new Date().toISOString(),
    stage7_pages:      pages.map(p => ({ url: p.url, kind: p.kind })),
    stage7_rendered:   renderMode,
    stage7_found:      { emails: wE, phones: wP, socials: wS, whatsapp: wW, locations: wL, people: peopleAdded, partners: partners.length },
    stage7_page_renders: pageRenders,
    // Proof-of-search: a JS-shell homepage crawled WITHOUT a successful render
    // was never actually readable — "no data" from it proves nothing (the
    // ledger demotes it to degraded_empty instead of verified_empty).
    stage7_shell_unrendered: (pages[0].page.text.length < JS_SHELL_CHARS && !renderMode) || shellSubpageUnrendered,
  };
  const wroteSomething = (wE + wP + wS + wW + wL + peopleAdded + partners.length) > 0 || !!address || !!logo;
  await markStage(company.id, wroteSomething ? 'done' : 'no_data', summary);
  await recomputeBellScoreForCompany(company.id);

  // Diagnostics: a "done" with no contacts is usually a JS-rendered site (the
  // homepage came back as a near-empty shell) — flag it so the admin knows.
  const homeTextLen = pages[0].page.text.length;
  let note = null;
  if ((wE + wP + wS) === 0) {
    if (homeTextLen < JS_SHELL_CHARS && !renderMode) {
      note = renderTried
        ? 'JS-rendered; headless render returned no text'
        : 'JS-rendered — run "Install Harvester Browser.command"';
    } else {
      note = renderMode ? 'rendered, no contacts found' : 'no contacts found on crawled pages';
    }
  }

  return {
    status: wroteSomething ? 'done' : 'no_data',
    usd: 0,
    scraped_pages: pages.map(p => p.url),
    pages_crawled: pages.length,
    home_text_len: homeTextLen,
    rendered: renderMode,
    note,
    found: { emails: wE, phones: wP, socials: wS, people: peopleAdded, partners: partners.length },
  };
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

function dedupeByName(rows) {
  const seen = new Set();
  const out = [];
  for (const r of rows) {
    const k = r.name.toLowerCase().replace(/[^a-z]/g, '');
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}

/** Only set address / website logo / description when the column is currently empty. */
// Record that a company's website served a DIFFERENT brand's content. Stamps a
// verbatim, provenance-carrying flag into extra_fields and raises needs_review so the
// admin drawer surfaces it. Non-destructive: keeps the website + any prior data; the
// separate cleanup .command is what quarantines already-stored wrong artifacts.
async function flagWebsiteContentConflict(companyId, idv, url) {
  const flag = {
    brand: idv.brand || null,
    matched: idv.matched || null,
    evidence: idv.evidence || null,
    url: url || null,
    flagged_at: new Date().toISOString(),
  };
  await query(
    `UPDATE companies
        SET extra_fields = extra_fields || jsonb_build_object('website_content_conflict', $2::jsonb),
            needs_review = TRUE,
            review_reason = $3
      WHERE id = $1`,
    [companyId, JSON.stringify(flag), `Website content appears to be a different company (${idv.brand || 'unknown brand'}) — logo/description not stored`],
  );
}

async function fillCompanyBlanks(companyId, { address, logo, description, industry, foundedYear, keywords }) {
  if (address) {
    await query(
      `UPDATE companies SET address = $2
       WHERE id = $1 AND (address IS NULL OR btrim(address) = '')`,
      [companyId, address.slice(0, 300)],
    );
  }
  if (industry) {
    await query(
      `UPDATE companies SET industry = $2
       WHERE id = $1 AND (industry IS NULL OR btrim(industry) = '')`,
      [companyId, String(industry).slice(0, 80)],
    );
  }
  if (foundedYear) {
    await query(
      `UPDATE companies SET founded_year = $2 WHERE id = $1 AND founded_year IS NULL`,
      [companyId, foundedYear],
    );
  }
  const extra = {};
  if (logo)        extra.website_logo_url    = logo;
  if (description) extra.website_description  = description.slice(0, 1000);
  if (keywords)    extra.website_keywords     = String(keywords).slice(0, 500);
  if (Object.keys(extra).length) {
    // jsonb || only adds/overwrites these keys; existing fields untouched.
    await query(
      `UPDATE companies SET extra_fields = extra_fields || $2::jsonb WHERE id = $1`,
      [companyId, JSON.stringify(extra)],
    );
  }
}

/**
 * Insert/refresh website-discovered team members. Idempotent: a person already
 * linked to this company under the same name is updated, not duplicated. These
 * people carry source_stage=7 and no linkedin_url, so the conservative people
 * dedup can later merge them with their LinkedIn profiles.
 * Returns the number of people newly inserted.
 */
async function persistTeam(companyId, team) {
  let inserted = 0;
  for (const t of team) {
    const fullName = t.name.trim();
    if (!fullName) continue;
    const title = t.title || null;

    // Already linked to this company under this name?
    const existing = await query(
      `SELECT p.id FROM people p
         JOIN person_companies pc ON pc.person_id = p.id
        WHERE pc.company_id = $1 AND lower(btrim(p.full_name)) = lower($2)
        LIMIT 1`,
      [companyId, fullName],
    );

    let personId;
    if (existing.rows.length) {
      personId = existing.rows[0].id;
      if (title) {
        await query(
          `UPDATE person_companies SET title = COALESCE(NULLIF(title,''), $3)
            WHERE person_id = $1 AND company_id = $2 AND source_stage = 7`,
          [personId, companyId, title],
        );
      }
      continue;   // not a new person
    }

    const parts = fullName.split(/\s+/);
    const ins = await query(
      `INSERT INTO people (full_name, first_name, last_name, headline, extra_fields)
       VALUES ($1, $2, $3, $4, $5::jsonb)
       RETURNING id`,
      [
        fullName,
        parts[0] || null,
        parts.length > 1 ? parts.slice(1).join(' ') : null,
        title,
        JSON.stringify({ source: 'website-harvest', harvested_at: new Date().toISOString(), source_url: t.url || null }),
      ],
    );
    personId = ins.rows[0].id;
    inserted++;

    const { seniority_level, org_chart_level } = inferSeniority(title);
    await query(
      `INSERT INTO person_companies
         (person_id, company_id, title, seniority_level, org_chart_level, is_current, source_stage, raw_payload)
       VALUES ($1, $2, $3, $4, $5, true, 7, $6::jsonb)`,
      [personId, companyId, title, seniority_level, org_chart_level, JSON.stringify({ source: 'website-harvest', url: t.url || null })],
    );
    await recomputeBellScoreForCompany(companyId).catch(() => {});  // person link bumps nothing on company, but cheap + safe
  }
  return inserted;
}

/** Merge discovered partner names into extra_fields.harvested_partners (unique). */
async function mergePartners(companyId, partners) {
  const cur = await query(`SELECT extra_fields->'harvested_partners' AS p FROM companies WHERE id = $1`, [companyId]);
  const existing = Array.isArray(cur.rows[0]?.p) ? cur.rows[0].p : [];
  const merged = [...new Set([...existing, ...partners].map(s => String(s).trim()).filter(Boolean))].slice(0, 200);
  await query(
    `UPDATE companies SET extra_fields = jsonb_set(extra_fields, '{harvested_partners}', $2::jsonb, true) WHERE id = $1`,
    [companyId, JSON.stringify(merged)],
  );
}

async function markStage(companyId, status, extras = null) {
  if (extras) {
    await query(
      `UPDATE companies SET stage7_status = $2, stage7_at = now(),
              extra_fields = extra_fields || $3::jsonb
        WHERE id = $1`,
      [companyId, status, JSON.stringify(extras)],
    );
  } else {
    await query(`UPDATE companies SET stage7_status = $2, stage7_at = now() WHERE id = $1`, [companyId, status]);
  }
  await recordSearch(companyId, 7, status, extras);
}

// ---------------------------------------------------------------------------
// Bulk entry point — the orchestrator calls this.
// ---------------------------------------------------------------------------

export async function enrichCompanies(companies, jobLog = null) {
  let done = 0, noData = 0, failed = 0, rendered = 0, finished = 0;
  const total = companies.length;
  const hasBrowser = await rendererAvailable();
  jobLog?.(`  Concurrency: ${CONCURRENCY} · Render tier: ${hasBrowser ? 'headless browser ready (JS sites supported)' : 'fetch-only — run "Install Harvester Browser.command" to harvest JS sites'}`);
  try {
    await pool(companies, CONCURRENCY, async (c) => {
      try {
        const r = await enrichCompany(c);
        if (r.status === 'done')        done++;
        else if (r.status === 'no_data') noData++;
        else                             failed++;
        if (r.rendered) rendered++;
        const tag = r.status === 'done' ? '✓' : (r.status === 'no_data' ? '·' : '✗');
        jobLog?.(`  ${tag} [${++finished}/${total}] ${c.name}` +
          (r.found ? ` — +${r.found.emails}e/${r.found.phones}p/${r.found.socials}s/${r.found.people}ppl/${r.found.partners}ptnr` : '') +
          (r.pages_crawled ? ` · ${r.pages_crawled}pg/${r.home_text_len}ch${r.rendered ? '/JS' : ''}` : '') +
          (r.note ? ` · ${r.note}` : '') +
          (r.reason ? ` (${r.reason})` : ''));
      } catch (err) {
        failed++;
        // Stamp the failure — a company left on 'running' never re-enters the
        // frontier and silently poisons the proof-of-search set.
        try { await markStage(c.id, 'failed', { stage7_error: String(err.message || err).slice(0, 140) }); } catch { /* ignore */ }
        jobLog?.(`  ✗ [${++finished}/${total}] ${c.name} — ${err.message}`);
      }
    });
  } finally {
    await closeRenderer();   // free Chromium at the end of the run
  }
  if (rendered) jobLog?.(`  ▸ ${rendered} site(s) needed headless rendering.`);
  return { done, no_data: noData, failed, usd: 0 };
}
