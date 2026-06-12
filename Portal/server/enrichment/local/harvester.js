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
import { fetchPage, toRootUrl, sameHost } from './http.js';
import {
  findEmails, findPhones, findSocials,
  guessAddress, extractTeam, extractPartners, pickLogo,
} from './extract.js';

export const STAGE_LABEL = 'Stage 7 — Local Website Harvester';
export const TOOL_NAME   = 'local_website_harvester';

const MAX_PAGES        = 7;      // homepage + up to 6 discovered pages
const PER_COMPANY_MS   = 700;    // politeness delay between companies
const SOURCE           = 'stage7-website';

// Page-path hints, grouped by what we expect to mine there.
const PAGE_HINTS = {
  contact: ['/contact', '/contact-us', '/contactus', '/get-in-touch', '/reach-us', '/reach', '/enquir', '/inquir'],
  about:   ['/about', '/about-us', '/aboutus', '/who-we-are', '/company', '/overview'],
  team:    ['/team', '/our-team', '/people', '/leadership', '/management', '/board', '/staff', '/directors', '/founders'],
  partner: ['/partner', '/partners', '/clients', '/our-clients', '/customers', '/sponsors', '/brands'],
};
const ALL_HINTS = Object.values(PAGE_HINTS).flat();

function classifyPage(url) {
  let path = '/';
  try { path = new URL(url).pathname.toLowerCase(); } catch {}
  for (const [kind, hints] of Object.entries(PAGE_HINTS)) {
    if (hints.some(h => path.includes(h))) return kind;
  }
  return 'other';
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
    let path = '';
    try { path = new URL(clean).pathname.toLowerCase(); } catch {}
    if (!ALL_HINTS.some(h => path.includes(h))) continue;
    const kind = classifyPage(clean);
    // Prefer breadth: at most 2 pages of any single kind.
    const kindCount = picked.filter(p => p.kind === kind).length;
    if (kindCount >= 2) continue;
    seen.add(clean);
    gotKind.add(kind);
    picked.push({ url: clean, kind });
  }
  // Sort so contact/team come first (most valuable) within our small budget.
  const order = { contact: 0, team: 1, about: 2, partner: 3, other: 4 };
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

  // 1) Homepage.
  const home = await fetchPage(homeUrl);
  if (!home.ok) {
    await markStage(company.id, 'failed', { stage7_error: home.error || 'home_unreachable' });
    return { status: 'failed', reason: home.error || 'home_unreachable', usd: 0 };
  }

  const pages = [{ url: home.finalUrl, kind: 'home', page: home }];

  // 2) Discover + fetch key pages (sequential, polite).
  for (const p of pickPages(home.finalUrl, home.links)) {
    const r = await fetchPage(p.url);
    if (r.ok) pages.push({ url: r.finalUrl, kind: p.kind, page: r });
  }

  // 3) Aggregate.
  const allText  = pages.map(p => p.page.text).join('\n');
  const allLinks = pages.flatMap(p => p.page.links);
  const allMailto = pages.flatMap(p => p.page.mailto);
  const allTel    = pages.flatMap(p => p.page.tel);

  // 4) Extract.
  const emails  = [...new Set([...allMailto, ...findEmails(allText)])];
  const phones  = findPhones(allText, allTel);
  const socials = findSocials(allText, allLinks);
  const address = guessAddress(allText);
  const logo    = pickLogo(pages[0].page.meta);
  const description = pages[0].page.meta.description || null;

  // Team people only from team/about pages (least noisy).
  const teamPages = pages.filter(p => p.kind === 'team' || p.kind === 'about');
  const team = teamPages.length
    ? dedupeByName(teamPages.flatMap(p => extractTeam(p.page.text).map(t => ({ ...t, url: p.url }))))
    : [];

  // Partners only from partner pages.
  const partnerPages = pages.filter(p => p.kind === 'partner');
  const partners = partnerPages.length
    ? [...new Set(partnerPages.flatMap(p => extractPartners(p.page.html)))].slice(0, 60)
    : [];

  // 5) Persist contacts (provenance = the page each was found on, best-effort).
  const homeProv = pages[0].url;
  let wE = 0, wP = 0, wS = 0;
  for (const e of emails) {
    const r = await upsertContact('company', company.id, { type: 'email', value: e, source: SOURCE, source_url: homeProv });
    if (r) wE++;
  }
  for (const p of phones) {
    const r = await upsertContact('company', company.id, { type: 'phone', value: p.value, value_display: p.display, source: SOURCE, source_url: homeProv });
    if (r) wP++;
  }
  for (const s of socials) {
    const r = await upsertContact('company', company.id, { type: 'social', value: s.url, value_display: s.url, source: SOURCE, source_url: homeProv, source_label: s.network });
    if (r) wS++;
  }

  // 6) Company-level fields (only fill blanks — never overwrite curated data).
  await fillCompanyBlanks(company.id, { address, logo, description });

  // 7) People + partners.
  const peopleAdded = await persistTeam(company.id, team);
  if (partners.length) await mergePartners(company.id, partners);

  // 8) Summary + status + live Bell Score.
  const summary = {
    stage7_scraped_at: new Date().toISOString(),
    stage7_pages:      pages.map(p => ({ url: p.url, kind: p.kind })),
    stage7_found:      { emails: wE, phones: wP, socials: wS, people: peopleAdded, partners: partners.length },
  };
  const wroteSomething = (wE + wP + wS + peopleAdded + partners.length) > 0 || !!address || !!logo;
  await markStage(company.id, wroteSomething ? 'done' : 'no_data', summary);
  await recomputeBellScoreForCompany(company.id);

  return {
    status: wroteSomething ? 'done' : 'no_data',
    usd: 0,
    scraped_pages: pages.map(p => p.url),
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
async function fillCompanyBlanks(companyId, { address, logo, description }) {
  if (address) {
    await query(
      `UPDATE companies SET address = $2
       WHERE id = $1 AND (address IS NULL OR btrim(address) = '')`,
      [companyId, address.slice(0, 300)],
    );
  }
  const extra = {};
  if (logo)        extra.website_logo_url    = logo;
  if (description) extra.website_description  = description.slice(0, 1000);
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
}

// ---------------------------------------------------------------------------
// Bulk entry point — the orchestrator calls this.
// ---------------------------------------------------------------------------

export async function enrichCompanies(companies, jobLog = null) {
  let done = 0, noData = 0, failed = 0;
  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    try {
      const r = await enrichCompany(c);
      if (r.status === 'done')        done++;
      else if (r.status === 'no_data') noData++;
      else                             failed++;
      const tag = r.status === 'done' ? '✓' : (r.status === 'no_data' ? '·' : '✗');
      jobLog?.(`  ${tag} [${i + 1}/${companies.length}] ${c.name}` +
        (r.found ? ` — +${r.found.emails}e/${r.found.phones}p/${r.found.socials}s/${r.found.people}ppl/${r.found.partners}ptnr` : '') +
        (r.reason ? ` (${r.reason})` : ''));
    } catch (err) {
      failed++;
      jobLog?.(`  ✗ [${i + 1}/${companies.length}] ${c.name} — ${err.message}`);
    }
    if (i < companies.length - 1) await new Promise(r => setTimeout(r, PER_COMPANY_MS));
  }
  return { done, no_data: noData, failed, usd: 0 };
}
