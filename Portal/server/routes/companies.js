// /api/companies — listing, filtering, inline edit, single-row fetch.

import { Router } from 'express';
import { query } from '../db.js';
import { consolidateFinancials } from '../lib/financials.js';
import { qarCaseSql } from '../lib/fx.js';
import {
  listCompanyContacts, loadCompanyContactsByIds,
  upsertContact, setPrimaryContact, deleteContact,
  loadPersonContactsByIds,
} from '../lib/contacts.js';
import { listRejects } from '../enrichment/local/rejects.js';
import { maskPeople } from './people.js';
import { wipeStaleEnrichmentAfterUrlReplace } from '../enrichment/stages/stage1.js';
import { recomputeBellScoreForCompany } from '../assembly/bell_score.js';
import { revealOne, revealBulk, getRevealedSet, bypassesCredits, markRevealed } from '../lib/credits.js';
import { denyUnlessLocalEngine } from '../lib/auth.js';
import { addRevealedToCrm } from '../lib/crm.js';
import { normalizeName } from '../ingest/normalize.js';
import { mapLabelToCanonical } from '../lib/industry.js';
import { getIndustryGroups } from '../lib/industry_groups.js';
import { matchBusinessTypes, listBusinessTypes, businessTypeCondition, businessTypeFilterCondition, queryNamesIndustry } from '../lib/business_types.js';
import { displayAddressSql } from '../lib/location_display.js';

// Escape LIKE wildcards in user input so a literal % or _ doesn't widen the match.
function likeEscape(s) { return String(s).replace(/[\\%_]/g, '\\$&'); }

const router = Router();

// Hard deletes may ONLY originate on the local engine — it is the source of
// truth for the mirror. A delete on a prod-backed deployment would be clobbered
// by the next push (which re-upserts every local row), so we forbid it there.
const MODE = (process.env.BDI_MODE || 'local-admin').toLowerCase();

// Canonical company data is mutated ONLY on the local engine (source of truth);
// app/admin are read-only for it. Allow GET + reveal everywhere, block all other
// mutations (edit, archive, reset-enrichment, delete, contacts CRUD, …) off-local.
router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  if (/\/reveal(-bulk)?$/.test(req.path)) return next();
  return denyUnlessLocalEngine(req, res, next);
});

const SENSITIVE_CONTACT_TYPES = new Set(['email', 'phone', 'mobile', 'whatsapp', 'telephone', 'tel']);

// Mask email/phone on company rows for tenants that haven't revealed them.
async function maskCompanies(req, rows) {
  if (!rows.length) return;
  if (bypassesCredits(req.user, req.tenant)) {
    for (const r of rows) r.revealed_by_tenant = true;
    return;
  }
  const revealed = await getRevealedSet(req.tenant.id, 'company', rows.map((r) => Number(r.id)));
  for (const r of rows) {
    const ok = revealed.has(Number(r.id));
    r.revealed_by_tenant = ok;
    if (!ok) {
      // Keep AVAILABILITY (so the user sees what exists) but hide the VALUE.
      r.email_locked = !!r.email;
      r.phone_locked = !!r.phone;
      r.email = null;
      r.phone = null;
      if (Array.isArray(r.contacts)) {
        r.contacts = r.contacts.map((c) =>
          SENSITIVE_CONTACT_TYPES.has(String(c.type || '').toLowerCase())
            ? { ...c, value: null, value_display: null, locked: true }
            : c);
      }
    }
  }
}

async function companyContact(id) {
  const r = await query(`SELECT id, bin, name, email, phone FROM companies WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

// Fields the admin is allowed to edit inline. This is a deliberate whitelist —
// system-managed fields (id, bin, created_at, updated_at, assembled_at,
// extra_fields, *_status timestamps) are NOT editable.
const EDITABLE_FIELDS = new Set([
  // Identity
  'name', 'legal_name', 'legal_form',
  'primary_registration_no', 'incorporation_date',
  'founded_year',
  // Status (admin override of computed value)
  'is_active', 'status_raw', 'status_normalized',
  // Contact
  'website', 'email', 'phone',
  'address', 'city', 'country', 'postal_code',
  'latitude', 'longitude',
  // Classification
  'industry', 'sector', 'sub_sector',
  'employee_count', 'employee_count_range', 'company_size_category',
  // LinkedIn
  'linkedin_url', 'linkedin_id', 'linkedin_description',
  'linkedin_followers', 'linkedin_logo_url', 'linkedin_cover_url',
  'linkedin_specialties', 'linkedin_headquarters',
  // Google Maps
  'gmaps_place_id', 'gmaps_url', 'gmaps_rating', 'gmaps_reviews_count',
]);

// GET /api/companies?limit=&offset=&q=&status=&stage1=&archived=
// Default: archived=false (Active tab). Archived tab passes archived=true.
router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit ?? 100), 1000);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const q      = (req.query.q || '').trim();
    const status = req.query.status;
    const isActive = req.query.is_active;
    const archivedQ = req.query.archived;   // 'true' | 'false' | undefined | 'all'
    const reviewQ = req.query.review;       // 'true' → the Review queue

    const where = [];
    const params = [];

    // Advanced search: every detail is searchable via the maintained search_blob
    // (name, legal name, CR/CP/QFC #, ISIN/symbol, BIN, city, contacts, acronym,
    // any extra_fields value), AND the name is matched fuzzily (pg_trgm) so typos
    // and partial spellings still surface the intended company.
    // Default: most-complete records first (Bell Score), then newest.
    let orderSql = 'ORDER BY companies.bell_score DESC, id DESC';
    let matchedTypes = null;
    if (q) {
      const qLower = q.toLowerCase();
      const qNorm = normalizeName(q) || qLower;
      params.push(qNorm);
      const pNorm = params.length;
      // Whole-phrase match. A bare substring on a 1-2 char query matches most of
      // the database ("it" hit 73% of all companies), so short queries use a
      // word-boundary regex instead.
      let phraseCond;
      if (qLower.length >= 3) {
        params.push('%' + likeEscape(qLower) + '%');
        phraseCond = `companies.search_blob LIKE $${params.length}`;
      } else {
        params.push('\\m' + qLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\M');
        phraseCond = `companies.search_blob ~* $${params.length}`;
      }
      // Token matching: drop filler words and de-pluralize so "all banks" or
      // "beauty salons" matches blob text. Each token ≥3 chars must appear in
      // the blob (AND), which keeps multi-word searches precise; shorter tokens
      // only participate in the type/industry branches below.
      const STOP = new Set(['all','the','in','of','and','or','to','for','qatar','industry','industries','sector','sectors','company','companies','business','businesses','list','show','me','find','any','with','that','are','our','their']);
      const tokens = qLower.split(/[^a-z0-9&]+/)
        .filter((t) => t.length >= 2 && !STOP.has(t))
        .map((t) => (t.length > 3 && t.endsWith('s') && !t.endsWith('ss')) ? t.slice(0, -1) : t);
      const tokenConds = [];
      for (const t of tokens.filter((t) => t.length >= 3)) { params.push('%' + likeEscape(t) + '%'); tokenConds.push(`companies.search_blob LIKE $${params.length}`); }
      const tokenBranch = tokenConds.length ? ` OR (${tokenConds.join(' AND ')})` : '';
      // Stated business types: bridge the user's wording ("haircut salon",
      // "laundries") to the source's wording ("Ladies Beauty Saloons", "Clothes
      // Laundry & Iron", Google "Gift shop"). Applied only when EVERY meaningful
      // token matched the stated vocabulary (directly or via a synonym), so a
      // company-NAME search never explodes into a whole trade.
      const bt = await matchBusinessTypes(qLower);
      let typeCond = '';
      if (bt.full && bt.types.length) {
        typeCond = businessTypeCondition(bt.types, params);
        matchedTypes = bt.types;
      }
      const typeBranch = typeCond ? ` OR ${typeCond}` : '';
      // Whole-industry match ONLY when the query names the industry itself
      // ("construction", "IT") — a trade word ("pharmacy") must not pull in its
      // entire parent industry (that once made "pharmacy" return all of Healthcare).
      const synInd = mapLabelToCanonical(qLower).filter((canon) => queryNamesIndustry(canon, qLower));
      let synBranch = '';
      if (synInd.length) {
        const ors = [];
        for (const it of synInd) {
          params.push(it); ors.push(`companies.industries @> ARRAY[$${params.length}]::text[]`);
          params.push(it); ors.push(`companies.industry = $${params.length}`);
        }
        synBranch = ` OR ${ors.join(' OR ')}`;
      }
      where.push(
        `(${phraseCond}` +
        `${tokenBranch}${synBranch}${typeBranch} ` +
        `OR (char_length($${pNorm}) >= 3 AND companies.name_normalized % $${pNorm}))`
      );
      // Rank: exact normalized name, then substring hits, then stated-type hits,
      // then fuzzy closeness; most-complete records (Bell Score) break ties.
      orderSql =
        `ORDER BY (companies.name_normalized = $${pNorm}) DESC, ` +
        `(${phraseCond}) DESC, ` +
        (typeCond ? `(${typeCond}) DESC, ` : '') +
        `similarity(companies.name_normalized, $${pNorm}) DESC, ` +
        `companies.bell_score DESC, companies.name ASC`;
    }
    if (status) {
      params.push(status);
      where.push(`status_normalized = $${params.length}`);
    }
    if (isActive === 'true' || isActive === 'false') {
      params.push(isActive === 'true');
      where.push(`is_active = $${params.length}`);
    }
    // Review queue: companies that disappeared from a non-QFZ source and await
    // an admin decision. Shown regardless of archived state.
    if (reviewQ === 'true') {
      where.push(`needs_review = true`);
    } else if (archivedQ !== 'all') {
      // archived filter — default is "only show active" (archived=false)
      const wantArchived = archivedQ === 'true';
      params.push(wantArchived);
      where.push(`archived = $${params.length}`);
    }
    // source filter — restrict to companies appearing in a specific source
    if (req.query.source) {
      params.push(req.query.source);
      where.push(`EXISTS (SELECT 1 FROM company_sources cs WHERE cs.company_id = companies.id AND cs.source = $${params.length})`);
    }
    // industry filter — match the company's industry TAGS (industries[]), with a
    // fallback to the legacy primary `industry` column for rows not yet re-derived.
    if (req.query.industry) {
      params.push(req.query.industry);
      where.push(`(companies.industries @> ARRAY[$${params.length}]::text[] OR companies.industry = $${params.length})`);
    }
    // ---- Advanced filter panel params (all optional, AND-combined) ----------
    const csv = (v) => String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
    // multi-select industry tags
    const indList = csv(req.query.industries);
    if (indList.length) {
      params.push(indList);
      where.push(`(companies.industries && $${params.length}::text[] OR companies.industry = ANY($${params.length}::text[]))`);
    }
    // multi-select business types — exact stated values (QCCI sub-category in
    // sector, trade tags, Google categories), from the Business-type facet.
    const btList = csv(req.query.business_types);
    if (btList.length) {
      const cond = businessTypeFilterCondition(btList, params);
      if (cond) where.push(cond);
    }
    // multi-select status
    const statusList = csv(req.query.statuses);
    if (statusList.length) {
      params.push(statusList);
      where.push(`status_normalized = ANY($${params.length}::text[])`);
    }
    // multi-select source
    const sourceList = csv(req.query.sources);
    if (sourceList.length) {
      params.push(sourceList);
      where.push(`EXISTS (SELECT 1 FROM company_sources cs WHERE cs.company_id = companies.id AND cs.source = ANY($${params.length}::text[]))`);
    }
    // employee-size buckets (OR of ranges over employee_count)
    const EMP_BUCKETS = { '1-10': [1, 10], '11-50': [11, 50], '51-200': [51, 200], '201-1000': [201, 1000], '1001-5000': [1001, 5000], '5000+': [5001, null] };
    const empSel = csv(req.query.emp_buckets);
    if (empSel.length) {
      const ors = [];
      for (const b of empSel) {
        const r = EMP_BUCKETS[b]; if (!r) continue;
        if (r[1] == null) { params.push(r[0]); ors.push(`companies.employee_count >= $${params.length}`); }
        else { params.push(r[0]); const lo = params.length; params.push(r[1]); ors.push(`companies.employee_count BETWEEN $${lo} AND $${params.length}`); }
      }
      if (ors.length) where.push(`(${ors.join(' OR ')})`);
    }
    if (req.query.city) {
      params.push('%' + likeEscape(String(req.query.city).toLowerCase()) + '%');
      where.push(`lower(companies.city) LIKE $${params.length}`);
    }
    if (req.query.founded_min) { params.push(Number(req.query.founded_min)); where.push(`companies.founded_year >= $${params.length}`); }
    if (req.query.founded_max) { params.push(Number(req.query.founded_max)); where.push(`companies.founded_year <= $${params.length}`); }

    // Capital filter, normalized to QAR (Val 2026-07-12). Matches companies with
    // ANY capital figure (authorised / issued / paid-up / registered share
    // capital) whose QAR-equivalent falls in range. Foreign currencies are
    // converted via lib/fx.js (USD at the fixed peg; EUR/GBP approximate);
    // unknown currencies convert to NULL and are excluded — never guessed.
    const capMin = req.query.capital_min_qar, capMax = req.query.capital_max_qar;
    if ((capMin != null && capMin !== '') || (capMax != null && capMax !== '')) {
      const qar = qarCaseSql('cf.value_num', 'cf.currency');
      const conds = [
        'cf.company_id = companies.id',
        `cf.metric IN ('authorized_capital','capital','paid_up_capital','registered_capital')`,
        'cf.value_num IS NOT NULL',
        `${qar} IS NOT NULL`,
      ];
      if (capMin != null && capMin !== '') { params.push(Number(capMin)); conds.push(`${qar} >= $${params.length}`); }
      if (capMax != null && capMax !== '') { params.push(Number(capMax)); conds.push(`${qar} <= $${params.length}`); }
      where.push(`EXISTS (SELECT 1 FROM company_financials cf WHERE ${conds.join(' AND ')})`);
    }
    if (req.query.score_min)   { params.push(Number(req.query.score_min));   where.push(`companies.bell_score >= $${params.length}`); }
    // data-completeness toggles
    if (req.query.has_website  === '1') where.push(`companies.website IS NOT NULL AND btrim(companies.website::text) <> ''`);
    else if (req.query.has_website === '0') where.push(`(companies.website IS NULL OR btrim(companies.website::text) = '')`);
    if (req.query.has_linkedin === '1') where.push(`companies.linkedin_url IS NOT NULL`);
    if (req.query.has_email    === '1') where.push(`(companies.email IS NOT NULL OR EXISTS (SELECT 1 FROM company_contacts cc WHERE cc.company_id = companies.id AND cc.type = 'email'))`);
    if (req.query.has_phone    === '1') where.push(`(companies.phone IS NOT NULL OR EXISTS (SELECT 1 FROM company_contacts cc WHERE cc.company_id = companies.id AND cc.type = 'phone'))`);
    if (req.query.has_people   === '1') where.push(`EXISTS (SELECT 1 FROM person_companies pc WHERE pc.company_id = companies.id)`);

    for (const k of ['stage1','stage2','stage3','stage4','stage5']) {
      if (req.query[k]) {
        params.push(req.query[k]);
        where.push(`${k}_status = $${params.length}`);
      }
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    // Internal research provenance (source like 'research:job-…') is admin-only;
    // hide it from customers so research-added companies look like any other.
    const srcFilter = (req.user?.role === 'platform_admin') ? '' : "AND cs.source NOT LIKE 'research:%'";

    params.push(limit, offset);

    const sql = `
      SELECT id, bin, name, legal_name, legal_form,
             is_active, status_normalized,
             primary_registration_no, incorporation_date,
             website, email, phone, address, city, country,
             industry, sector, employee_count, employee_count_range, founded_year,
             linkedin_url, linkedin_logo_url,
             stage1_status, stage1_at,
             stage2_status, stage2_at,
             stage3_status, stage3_at,
             stage4_status, stage4_at,
             stage5_status, stage5_at,
             stage6_status, stage6_at,
             extra_fields, bell_score,
             created_at, updated_at, assembled_at, archived,
             archive_reason, needs_review, review_reason, manual_status_override,
             (SELECT array_agg(DISTINCT cs.source ORDER BY cs.source)
              FROM company_sources cs WHERE cs.company_id = companies.id ${srcFilter}) AS sources,
             (SELECT json_agg(json_build_object('source', cs.source, 'record_id', cs.source_record_id) ORDER BY cs.source)
              FROM company_sources cs WHERE cs.company_id = companies.id ${srcFilter}) AS source_records
      FROM companies
      ${whereSql}
      ${orderSql}
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const countSql = `SELECT count(*)::int AS total FROM companies ${whereSql}`;

    const [rowsResult, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, params.slice(0, params.length - 2)),
    ]);

    // Attach contacts (list of email/phone/social entries) per row. One bulk
    // query for all visible rows keeps this O(1) extra round-trip.
    const visibleIds = rowsResult.rows.map(r => r.id);
    const contactsMap = await loadCompanyContactsByIds(visibleIds);
    for (const row of rowsResult.rows) {
      row.contacts = contactsMap.get(row.id) || [];
    }
    await maskCompanies(req, rowsResult.rows);

    res.json({
      total: countResult.rows[0].total,
      limit, offset,
      matched_types: matchedTypes || undefined,
      rows: rowsResult.rows,
    });
  } catch (err) { next(err); }
});

// GET /api/companies/map  → GeoJSON FeatureCollection of all geocoded companies
// Used by the Map tab (Mapbox GL JS). Only returns companies with valid
// lat/lng. Each feature has properties: id, name, bin, sources, status,
// industry, linkedin_url, website — enough for marker color + popup teaser
// without a follow-up fetch.
//
// IMPORTANT: this route MUST be declared BEFORE the `/:id` handler below, or
// Express matches /:id first with id="map" and a NaN bigint blows up Postgres.
router.get('/map', async (req, res, next) => {
  try {
    const r = await query(`
      SELECT c.id, c.bin, c.name, c.legal_name,
             c.is_active, c.status_normalized,
             c.industry, c.city, c.country,
             c.linkedin_url, c.website,
             c.latitude, c.longitude, c.archived,
             c.founded_year, c.parent_company_id,
             EXTRACT(YEAR FROM c.incorporation_date)::int AS incorporation_year,
             -- Area DERIVED from the pin's coordinate (nearest GIS district), so the
             -- popup label always matches where the dot actually is. companies.city
             -- is unreliable (LinkedIn HQ = a branch, blanket 'Doha' hardcodes) — it
             -- made an Al Sadd pin read "Lusail" (Val 2026-07-20). Read off the pin,
             -- not guessed → Rule 2.1-safe.
             (SELECT d.ename FROM gis_districts d WHERE d.centroid_lat IS NOT NULL
               ORDER BY (d.centroid_lat - c.latitude)^2 + (d.centroid_lng - c.longitude)^2
               LIMIT 1) AS derived_area,
             (SELECT array_agg(DISTINCT cs.source ORDER BY cs.source)
              FROM company_sources cs WHERE cs.company_id = c.id) AS sources
      FROM companies c
      WHERE c.latitude IS NOT NULL
        AND c.longitude IS NOT NULL
        AND c.archived = false
        -- All Bell data is Qatar; a coordinate outside the country bbox is a bad
        -- geocode (e.g. stage5 resolving a bare company name to a foreign place).
        -- Never emit it as a map pin — to any consumer (map, Bella, exports).
        AND c.longitude BETWEEN 50.55 AND 51.85 AND c.latitude BETWEEN 24.40 AND 26.30
    `);
    const features = r.rows.map(row => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [Number(row.longitude), Number(row.latitude)] },
      properties: {
        id:       row.id,
        bin:      row.bin,
        name:     row.name,
        is_active: row.is_active,
        status:   row.status_normalized,
        industry: row.industry,
        city:     row.derived_area || row.city,
        sources:  row.sources || [],
        website:  row.website,
        linkedin_url: row.linkedin_url,
        // parent_company_id lets the client draw a tie-line from a branch pin to
        // its parent company (the branch-network layer).
        parent_company_id: row.parent_company_id || null,
        // Prefer founded_year; fall back to year from incorporation_date.
        year: row.founded_year || row.incorporation_year || null,
      },
    }));

    // Track B: BRANCH pins from company_locations (geocoded, non-primary — the primary point
    // already shows via companies.latitude, which the geocoder fills). Each branch carries the
    // parent's sources/year so the map's source-chip + year filters keep working on them.
    try {
      // ONE pin per real SITE per website. The harvester writes a website's branch
      // coordinates onto EVERY company row sharing that website (16 "Yateem
      // Optician*" rows each got the same 5 pins = 80 stacked features), so
      // rendering them raw piles dozens of phantom dots on one spot. Deduping by
      // (coord, normalized website) collapses one chain's copies to its real sites
      // while KEEPING two genuinely different companies at the same mall — they
      // have different websites. Companies with no website fall back to their own
      // id, so they are never merged with each other. Render-only: no data deleted.
      const locs = await query(`
        SELECT DISTINCT ON (l.latitude, l.longitude, site_key)
               l.id AS location_id, l.company_id, l.label, l.is_primary, l.latitude, l.longitude,
               c.bin, c.name, c.is_active, c.status_normalized, c.industry, c.city,
               c.linkedin_url, c.website, c.founded_year,
               -- Area read off THIS PIN's own coordinate, exactly like the main pins above.
               -- Branch pins used to inherit companies.city, so every DOC branch read
               -- "Lusail" — including the one in Izghawa and the one in Al Sadd (Val,
               -- 2026-07-21). Wrong on 544 of 1,090 branch pins. A pin is labelled by
               -- where it IS, never by a field that describes a different site.
               (SELECT d.ename FROM gis_districts d WHERE d.centroid_lat IS NOT NULL
                 ORDER BY (d.centroid_lat - l.latitude)^2 + (d.centroid_lng - l.longitude)^2
                 LIMIT 1) AS derived_area,
               EXTRACT(YEAR FROM c.incorporation_date)::int AS incorporation_year,
               (SELECT array_agg(DISTINCT cs.source ORDER BY cs.source)
                FROM company_sources cs WHERE cs.company_id = c.id) AS sources
          FROM company_locations l
          JOIN companies c ON c.id = l.company_id
          CROSS JOIN LATERAL (SELECT COALESCE(NULLIF(lower(regexp_replace(regexp_replace(btrim(c.website::text),
                        '^https?://(www\\.)?', '', 'i'), '/+$', '')), ''), 'c' || c.id) AS site_key) sk
         WHERE l.latitude IS NOT NULL AND l.longitude IS NOT NULL
           AND l.is_primary = false
           AND c.archived = false
           -- Same Qatar-bbox guard as the main pins (P6 hardening) — a bad branch
           -- geocode must never render off-country for any consumer.
           AND l.longitude BETWEEN 50.55 AND 51.85 AND l.latitude BETWEEN 24.40 AND 26.30
           -- NOT the same spot as the company's own main pin. The harvester stores a
           -- map-link coordinate as its own row even when a row already sits there, so
           -- the head office rendered TWICE — two dots stacked exactly (Val spotted it
           -- on DOC: an "Al Sadd" dot and a second one on top of it). 461 across the DB.
           -- 0.0002 deg is about 22 m: the same doorway, not the neighbouring building.
           AND NOT (c.latitude IS NOT NULL AND c.longitude IS NOT NULL
                    AND abs(l.latitude - c.latitude) < 0.0002
                    AND abs(l.longitude - c.longitude) < 0.0002)
         -- Prefer the registered / richest company as the surviving pin.
         ORDER BY l.latitude, l.longitude, site_key,
                  (c.primary_registration_no IS NOT NULL) DESC, c.bell_score DESC NULLS LAST, c.id`);
      for (const row of locs.rows) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [Number(row.longitude), Number(row.latitude)] },
          properties: {
            id: row.company_id, location_id: row.location_id, location_label: row.label || 'Branch',
            // The location belongs to company_id — that's the pin it ties back to.
            parent_company_id: row.company_id, is_branch: true,
            bin: row.bin, name: row.name, is_active: row.is_active, status: row.status_normalized,
            industry: row.industry, city: row.derived_area || row.city, sources: row.sources || [],
            website: row.website, linkedin_url: row.linkedin_url,
            year: row.founded_year || row.incorporation_year || null,
          },
        });
      }
    } catch { /* table may not exist on a stale boot — the base map still works */ }

    // Branch model (migration 101): ARCHIVED child companies that carry their own
    // coordinate are real facilities of a parent operator. The two queries above
    // filter archived=false, so these never render — add them here as branch pins
    // tied to their parent. Latent until the branch geocode backfills coords, but
    // the render path must exist. Same Qatar-bbox guard.
    try {
      const kids = await query(`
        SELECT c.id, c.bin, c.name, c.is_active, c.status_normalized, c.industry, c.city,
               c.linkedin_url, c.website, c.founded_year, c.parent_company_id,
               c.latitude, c.longitude,
               -- Same rule as every other pin: label it by where it actually is.
               (SELECT d.ename FROM gis_districts d WHERE d.centroid_lat IS NOT NULL
                 ORDER BY (d.centroid_lat - c.latitude)^2 + (d.centroid_lng - c.longitude)^2
                 LIMIT 1) AS derived_area,
               EXTRACT(YEAR FROM c.incorporation_date)::int AS incorporation_year,
               (SELECT array_agg(DISTINCT cs.source ORDER BY cs.source)
                FROM company_sources cs WHERE cs.company_id = c.id) AS sources
          FROM companies c
         WHERE c.parent_company_id IS NOT NULL
           -- ARCHIVED children only. The comment above always said "these are archived
           -- facilities the two active passes skip" — but this filter was never written,
           -- harmless while ONLY MoPH shells (all archived) had parents. The chain model
           -- links ACTIVE companies, and an active child already renders as its own main
           -- pin above, so without archived=true it drew TWICE (7 live, the chain
           -- adversarial review caught it 2026-07-24).
           AND c.archived = true
           AND c.latitude IS NOT NULL AND c.longitude IS NOT NULL
           AND c.longitude BETWEEN 50.55 AND 51.85 AND c.latitude BETWEEN 24.40 AND 26.30`);
      for (const row of kids.rows) {
        features.push({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [Number(row.longitude), Number(row.latitude)] },
          properties: {
            id: row.id, parent_company_id: row.parent_company_id, is_branch: true,
            location_label: 'Branch',
            bin: row.bin, name: row.name, is_active: row.is_active, status: row.status_normalized,
            industry: row.industry, city: row.derived_area || row.city, sources: row.sources || [],
            website: row.website, linkedin_url: row.linkedin_url,
            year: row.founded_year || row.incorporation_year || null,
          },
        });
      }
    } catch { /* pre-101 boot — column may not exist yet; base map still works */ }

    res.json({
      type: 'FeatureCollection',
      features,
      total: features.length,
    });
  } catch (err) { next(err); }
});

// GET /api/companies/:id/locations — all of a company's locations (for the drawer block and
// the map's sibling-spread tie-lines). MUST stay above the generic /:id handler.
router.get('/:id/locations', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.json({ locations: [] });
    const r = await query(
      `SELECT id, label, ${displayAddressSql('address')} AS address,
              zone_no, street_no, building_no, latitude, longitude,
              is_primary, source, geocode_status, geocode_method, geocoded_at
         FROM company_locations WHERE company_id=$1
        ORDER BY is_primary DESC, id`, [id]);
    res.json({ locations: r.rows });
  } catch (err) { next(err); }
});

// GET /api/companies/:id — full row including extra_fields + linked sources
// Includes raw_payload from EVERY source so the detail drawer shows every
// JSON field that was ever scraped.
// GET /api/companies/business-types?q= — the stated fine-grained business-type
// vocabulary (QCCI sub-categories, trade tags, Google categories) with counts,
// for the Business-type facet. With q, returns the types the query names.
router.get('/business-types', async (req, res, next) => {
  try {
    res.json({ types: await listBusinessTypes(String(req.query.q || '')) });
  } catch (err) { next(err); }
});

// Distinct industries (for the companies-list filter dropdown), most-common first.
router.get('/industries', async (req, res, next) => {
  try {
    // Distinct industry TAGS (unnest industries[]), falling back to the legacy
    // primary `industry` for rows without tags yet. Most-common first.
    const r = await query(
      `SELECT ind AS industry, count(*)::int AS n
         FROM (SELECT unnest(coalesce(NULLIF(industries, '{}'), ARRAY[industry])) AS ind
                 FROM companies WHERE archived = false) t
        WHERE ind IS NOT NULL AND ind <> ''
        GROUP BY ind
        ORDER BY n DESC, ind ASC
        LIMIT 300`);
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});

// Umbrella SECTOR groups with live counts + tag search-synonyms (A3
// findability). Must be declared before /:id so the literal path matches.
router.get('/industry-groups', async (req, res, next) => {
  try { res.json(await getIndustryGroups()); } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      // Stops the NaN-bigint blowup if a non-numeric path slips past the route
      // matchers above (e.g. a future sibling route added without checking).
      return res.status(400).json({ error: 'invalid_id', got: req.params.id });
    }
    const [company, sources, people, contacts, financials, shareholders, partnerships, rejects, tech] = await Promise.all([
      query('SELECT * FROM companies WHERE id = $1', [id]),
      query(`
        SELECT id, source, source_record_id, source_url, raw_payload,
               first_seen_at, last_seen_at
        FROM company_sources
        WHERE company_id = $1
        ORDER BY first_seen_at
      `, [id]),
      query(`
        SELECT p.id, p.pin, p.full_name, p.headline, p.linkedin_url,
               p.is_revealed, p.email, p.phone, p.profile_picture_url, p.bell_score,
               pc.title, pc.seniority_level, pc.org_chart_level, pc.is_current
        FROM person_companies pc
        JOIN people p ON p.id = pc.person_id
        WHERE pc.company_id = $1 AND COALESCE(p.archived, false) = false
        ORDER BY pc.org_chart_level NULLS LAST, p.full_name
        LIMIT 200
      `, [id]),
      listCompanyContacts(id),
      query(`SELECT id, metric, value_text, value_num, currency, period, as_of, confidence, source
               FROM company_financials WHERE company_id = $1 ORDER BY metric, period`, [id]),
      query(`SELECT id, holder_name, holder_type, stake_pct, stake_text, as_of, confidence, source
               FROM company_shareholders WHERE company_id = $1 ORDER BY stake_pct DESC NULLS LAST, holder_name`, [id]),
      query(`SELECT id, partner_name, partner_company_id, relationship, description, since, confidence, source
               FROM company_partnerships WHERE company_id = $1 ORDER BY partner_name`, [id]),
      listRejects(id),
      // Engine 6 technographics — what the company's website runs. Table may
      // not exist before migration 076 applies, so fail soft.
      query(`SELECT id, tech, category, confidence, evidence, detected_at, updated_at
               FROM company_tech WHERE company_id = $1 ORDER BY category, tech`, [id]).catch(() => ({ rows: [] })),
    ]);
    // Track B: physical locations (head office + branches) — also feeds Bella's get_company so
    // she can personalize with "your Lusail branch". Fail-soft pre-098.
    const locations = await query(
      `SELECT id, label, ${displayAddressSql('address')} AS address,
              latitude, longitude, is_primary, source, geocode_status
         FROM company_locations WHERE company_id = $1 ORDER BY is_primary DESC, id`, [id])
      .then((r) => r.rows).catch(() => []);
    if (!company.rows.length) return res.status(404).json({ error: 'not_found' });
    const row = company.rows[0];
    // Branch model (migration 101): a company may be the PARENT of collapsed
    // facility shells, or itself be a branch pointing at a parent. Fail-soft
    // pre-101 (the column may not exist yet).
    const parentCompany = row.parent_company_id
      ? await query(`SELECT id, name FROM companies WHERE id = $1`, [row.parent_company_id])
          .then((r) => r.rows[0] || null).catch(() => null)
      : null;
    const branches = await query(
      `SELECT id, name, city, latitude, longitude FROM companies
         WHERE parent_company_id = $1 ORDER BY name`, [id])
      .then((r) => r.rows).catch(() => []);
    const efSnapshot = row.extra_fields || {};   // capture before masking may strip it
    row.contacts = contacts;             // gate company + its contacts together
    await maskCompanies(req, [row]);
    const maskedContacts = row.contacts;
    delete row.contacts;
    // Honest labelling: mark a DERIVED (inferred) industry so the UI can tag it as
    // "derived" vs a registry-stated one; expose the website-conflict quarantine to
    // admins (for the "restore website" action).
    row.industry_derived = efSnapshot.industry_derived || null;
    if (MODE === 'local-admin' || req.user?.role === 'platform_admin') {
      row.website_conflict = efSnapshot.website_conflict || null;
      row.website_content_conflict = efSnapshot.website_content_conflict || null;
    }

    // Drawer People tab. PEOPLE PUBLIC LOCKDOWN (Val 2026-07-02): customers get
    // only the COUNT (the UI shows a banner); full rows stay for platform_admin.
    const peopleLocked = req.user?.role !== 'platform_admin';
    let peopleRows = people.rows;
    let peopleCount = peopleRows.length;
    if (peopleLocked) {
      peopleCount = (await query(`SELECT count(*)::int AS n FROM person_companies WHERE company_id = $1`, [id])).rows[0].n;
      peopleRows = [];
    } else if (peopleRows.length) {
      const pcMap = await loadPersonContactsByIds(peopleRows.map(p => p.id));
      for (const p of peopleRows) p.contacts = pcMap.get(p.id) || [];
      await maskPeople(req, peopleRows);
    }

    // SOURCE PROVENANCE IS ADMIN-ONLY (Val 2026-07-24: "users must not see the sources
    // of any details"). A regular customer sees the FACT, never where Bell got it — that
    // sourcing is Bell's own asset. Admins (and the local engine) keep full provenance.
    const showSources = MODE === 'local-admin' || req.user?.role === 'platform_admin';
    const stripSrc = (rows) => showSources ? rows
      : (rows || []).map((r) => { const { source, source_url, source_record_id, ...rest } = r; return rest; });
    const stripGrouped = (groups) => showSources ? groups
      : (groups || []).map((g) => ({ ...g, entries: (g.entries || []).map((e) => { const { source, ...rest } = e; return rest; }) }));

    res.json({
      company:  row,
      sources:  showSources ? sources.rows : [],
      people:   peopleRows,
      people_locked: peopleLocked,
      people_count:  peopleCount,
      contacts: maskedContacts,
      financials:   stripSrc(financials.rows),
      // Clean, source-attributed, confidence-tagged view + conservative
      // interpolated estimates (Val 2026-07-12) — the reliable presentation.
      financials_grouped: stripGrouped(consolidateFinancials(financials.rows, { estimate: true })),
      shareholders: stripSrc(shareholders.rows),
      partnerships: stripSrc(partnerships.rows),
      rejects:      showSources ? rejects : [],
      tech:         stripSrc(tech.rows),
      locations,
      parent_company: parentCompany,
      branches,
    });
  } catch (err) { next(err); }
});

// GET /api/companies/:id/map-network — this company's network edges for the
// Map's animated arcs (Phase D): partners/clients/affiliates/group members
// from Engine 3, with target coordinates where the target is a Bell company.
router.get('/:id/map-network', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const r = await query(`
      SELECT cr.id, cr.relation_type, cr.target_name, cr.target_company_id,
             tc.latitude  AS t_lat,
             tc.longitude AS t_lng
        FROM company_relationships cr
        LEFT JOIN companies tc
          ON tc.id = cr.target_company_id AND COALESCE(tc.archived, false) = false
       WHERE cr.source_company_id = $1
         AND cr.relation_type IN ('partner', 'client', 'affiliate', 'parent', 'subsidiary')
       ORDER BY (tc.latitude IS NOT NULL) DESC, cr.created_at DESC
       LIMIT 40`, [id]);
    res.json({ edges: r.rows });
  } catch (err) { next(err); }
});

// POST /api/companies/:id/reveal — unlock company contact details (1 credit).
router.post('/:id/reveal', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const actor = req.user?.email || 'unknown';
    if (bypassesCredits(req.user, req.tenant)) {
      await markRevealed(req.tenant?.id, 'company', id, actor);
      await addRevealedToCrm(req.tenant?.id, 'company', [id], actor, req.user?.id || null);
      return res.json({ revealed: true, charged: 0, unlimited: true, company: await companyContact(id) });
    }
    const result = await revealOne(req.tenant.id, 'company', id, actor);
    if (result.insufficient) {
      return res.status(402).json({ error: 'insufficient_credits', balance: result.balance });
    }
    await addRevealedToCrm(req.tenant.id, 'company', [id], actor, req.user?.id || null);
    res.json({ ...result, company: await companyContact(id) });
  } catch (err) { next(err); }
});

// POST /api/companies/reveal-bulk  { ids: [...] }
router.post('/reveal-bulk', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'bad_request', reason: 'ids[] required' });
    const actor = req.user?.email || 'unknown';
    if (bypassesCredits(req.user, req.tenant)) {
      await markRevealed(req.tenant?.id, 'company', ids, actor);
      await addRevealedToCrm(req.tenant?.id, 'company', ids, actor, req.user?.id || null);
      return res.json({ unlimited: true, revealed: ids.length, requested: ids.length });
    }
    const out = await revealBulk(req.tenant.id, 'company', ids, actor);
    await addRevealedToCrm(req.tenant.id, 'company', ids, actor, req.user?.id || null);
    res.json(out);
  } catch (err) { next(err); }
});

// -----------------------------------------------------------------------------
// Contacts CRUD — adds/edits/removes individual contact rows for a company
// -----------------------------------------------------------------------------

// POST /api/companies/:id/contacts  { type, value, value_display?, source?, is_primary? }
router.post('/:id/contacts', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};
    if (!['email','phone','social'].includes(body.type)) {
      return res.status(400).json({ error: 'invalid_type' });
    }
    const row = await upsertContact('company', id, {
      type:          body.type,
      value:         body.value,
      value_display: body.value_display,
      source:        body.source || 'manual',
      source_url:    body.source_url,
      source_label:  body.source_label,
      is_primary:    body.is_primary === true,
      is_verified:   body.is_verified === true,
    });
    if (!row) return res.status(400).json({ error: 'invalid_or_junk_value' });
    await recomputeBellScoreForCompany(id);
    res.json({ contact: row });
  } catch (err) { next(err); }
});

// POST /api/companies/:id/contacts/:cid/primary  — mark this row as primary
router.post('/:id/contacts/:cid/primary', async (req, res, next) => {
  try {
    const id  = Number(req.params.id);
    const cid = Number(req.params.cid);
    const type = String(req.body?.type || '').trim();
    if (!['email','phone','social'].includes(type)) {
      return res.status(400).json({ error: 'invalid_type' });
    }
    await setPrimaryContact('company', id, cid, type);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// DELETE /api/companies/:id/contacts/:cid
router.delete('/:id/contacts/:cid', async (req, res, next) => {
  try {
    const id  = Number(req.params.id);
    const cid = Number(req.params.cid);
    const ok  = await deleteContact('company', id, cid);
    if (!ok) return res.status(404).json({ error: 'not_found' });
    await recomputeBellScoreForCompany(id);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/companies/reclassify-statuses
// Re-evaluate is_active + archived (and archive_reason) for ALL companies in a
// SINGLE set-based statement — fast enough to run synchronously on 100k+ rows.
// Mirrors recompute_status.js exactly:
//   • a source link counts toward "active" if it is CURRENT or NOT QFZ
//   • QFC active iff license/licence_status ∈ the active whitelist
//   • MOCI active iff cr_status = 'Active'
//   • every other source (QFZ/QSTP/research/…) is active when it counts
//   • manual_status_override rows are skipped (admin decisions stick)
//   • archived = NOT is_active; reason 'qfz_disappeared' if a QFZ listing
//     vanished and nothing else keeps it active, else 'inactive'
// status_normalized/status_raw are left to per-ingest (which sets the precise
// per-source label); this maintenance pass only fixes is_active + archived.
router.post('/reclassify-statuses', async (req, res, next) => {
  try {
    const result = await query(`
      WITH agg AS (
        SELECT cs.company_id,
          COALESCE(bool_or(
            (cs.is_current OR cs.source <> 'QFZ')
            AND CASE
              WHEN cs.source = 'QFC'  THEN COALESCE(cs.raw_payload->>'license_status', cs.raw_payload->>'licence_status')
                                            IN ('Licensed','Frozen Under Court Order','Licensed - not yet commenced regulated activities')
              WHEN cs.source = 'MOCI' THEN (cs.raw_payload->>'cr_status') = 'Active'
              ELSE true
            END
          ), false) AS any_active,
          bool_or(cs.source = 'QFZ' AND cs.is_current = false) AS qfz_gone
        FROM company_sources cs
        GROUP BY cs.company_id
      )
      UPDATE companies c
         SET is_active      = agg.any_active,
             archived       = NOT agg.any_active,
             archive_reason = CASE WHEN agg.any_active THEN NULL
                                   WHEN agg.qfz_gone   THEN 'qfz_disappeared'
                                   ELSE 'inactive' END,
             archived_at    = CASE WHEN NOT agg.any_active AND c.archived_at IS NULL THEN now()
                                   WHEN agg.any_active THEN NULL
                                   ELSE c.archived_at END,
             updated_at     = now()
        FROM agg
       WHERE c.id = agg.company_id
         AND c.manual_status_override = false
         AND (c.is_active IS DISTINCT FROM agg.any_active
              OR c.archived IS DISTINCT FROM NOT agg.any_active)
    `);
    res.json({ scanned: result.rowCount, updated: result.rowCount });
  } catch (err) { next(err); }
});

// PATCH /api/companies/:id — inline edit. Only whitelisted fields allowed.
router.patch('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const updates = req.body || {};
    const setParts = [];
    const params = [];
    for (const [field, value] of Object.entries(updates)) {
      if (!EDITABLE_FIELDS.has(field)) {
        return res.status(400).json({ error: 'field_not_editable', field });
      }
      params.push(value === '' ? null : value);
      setParts.push(`${field} = $${params.length}`);
    }
    // A manual industry edit becomes the single tag AND locks the company so the
    // automatic re-derivation (uploads / backfill) won't overwrite the admin's call.
    if (Object.prototype.hasOwnProperty.call(updates, 'industry')) {
      const v = updates.industry === '' ? null : updates.industry;
      params.push(true);        setParts.push(`industry_locked = $${params.length}`);
      params.push(v ? [v] : null); setParts.push(`industries = $${params.length}`);
    }
    if (setParts.length === 0) {
      return res.status(400).json({ error: 'no_fields_to_update' });
    }
    params.push(id);
    const sql = `UPDATE companies SET ${setParts.join(', ')} WHERE id = $${params.length} RETURNING *`;
    const result = await query(sql, params);
    if (!result.rows.length) return res.status(404).json({ error: 'not_found' });
    await recomputeBellScoreForCompany(id);
    res.json({ company: result.rows[0] });
  } catch (err) { next(err); }
});

// POST /api/companies/:id/set-linkedin-url { url }
// Admin one-click "Use this URL" from the slug guesses or candidates list.
// Sets linkedin_url and flips stage1_status to 'done' so the dot turns green.
router.post('/:id/set-linkedin-url', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const url = String(req.body?.url || '').trim();
    if (!/^https?:\/\/(\w+\.)?linkedin\.com\/company\/[^\/?#]+/i.test(url)) {
      return res.status(400).json({ error: 'invalid_linkedin_url' });
    }
    // Strip trailing slash + query/hash
    const clean = url.replace(/\?.*$/, '').replace(/#.*$/, '').replace(/\/$/, '');
    const r = await query(`
      UPDATE companies
      SET linkedin_url = $2,
          stage1_status = 'done',
          stage1_at     = now(),
          extra_fields  = extra_fields || $3::jsonb
      WHERE id = $1
      RETURNING id, linkedin_url, stage1_status, stage1_at
    `, [
      id,
      clean,
      JSON.stringify({
        firecrawl_manual_override: clean,
        firecrawl_manual_at:       new Date().toISOString(),
      }),
    ]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    await recomputeBellScoreForCompany(id);
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// POST /api/companies/:id/reset-enrichment — wipe LinkedIn-derived data so
// stages 2/3/4/6 can be re-run fresh after a wrong-LinkedIn-URL Stage 1 fix.
// Called from the company drawer's "Reset enrichment data" button. Does NOT
// touch Stage 5 (Google Maps) data or identity fields (name, BIN, regs).
router.post('/:id/reset-enrichment', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    // Confirm the company exists before doing destructive work
    const exists = await query(`SELECT id, name FROM companies WHERE id = $1`, [id]);
    if (!exists.rows.length) return res.status(404).json({ error: 'not_found' });
    const summary = await wipeStaleEnrichmentAfterUrlReplace(id);
    // Record the manual reset in extra_fields for audit
    await query(
      `UPDATE companies SET extra_fields = extra_fields || $2::jsonb WHERE id = $1`,
      [id, JSON.stringify({
        manual_enrichment_reset: {
          ...summary,
          reset_at: new Date().toISOString(),
        },
      })],
    );
    await recomputeBellScoreForCompany(id);   // data shrank → rescore live
    res.json({ ok: true, company_id: id, ...summary });
  } catch (err) { next(err); }
});

// POST /api/companies/:id/restore-website — undo a wrong-website flag when an admin
// confirms the flagged site IS this company's. Restores website + email + un-hides
// the quarantined contacts + clears the review flag. Tech re-populates on the next
// enrich (website + tech stages were re-queued when it was flagged).
router.post('/:id/restore-website', async (req, res, next) => {
  try {
    if (MODE === 'user') return res.status(403).json({ error: 'not_allowed_on_user_portal' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const r = (await query(`SELECT extra_fields FROM companies WHERE id = $1`, [id])).rows[0];
    if (!r) return res.status(404).json({ error: 'not_found' });
    const wc = (r.extra_fields || {}).website_conflict;
    if (!wc) return res.status(400).json({ error: 'no_conflict' });
    await query(
      `UPDATE companies SET website = $2, email = COALESCE(email, $3),
         needs_review = false, review_reason = NULL,
         extra_fields = (coalesce(extra_fields,'{}'::jsonb) - 'website_conflict') || jsonb_build_object('website_restored_at', to_jsonb($4::text)),
         updated_at = now()
       WHERE id = $1`,
      [id, wc.website || null, wc.email || null, new Date().toISOString()]);
    const conIds = (wc.contacts || []).map((c) => c.id).filter(Boolean);
    if (conIds.length) await query(`UPDATE company_contacts SET extra_fields = coalesce(extra_fields,'{}'::jsonb) - 'hidden_conflict', updated_at = now() WHERE id = ANY($1::bigint[])`, [conIds]);
    res.json({ ok: true, company_id: id, website: wc.website });
  } catch (err) { next(err); }
});

// POST /api/companies/:id/restore-website-content — undo a wrong-CONTENT flag when an
// admin confirms the served page IS this company's after all. Restores the snapshotted
// logo/description, un-hides the website-harvested contacts, clears the flag. (Tech
// re-populates on the next enrich.) The website itself was never removed.
router.post('/:id/restore-website-content', async (req, res, next) => {
  try {
    if (MODE === 'user') return res.status(403).json({ error: 'not_allowed_on_user_portal' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const r = (await query(`SELECT extra_fields FROM companies WHERE id = $1`, [id])).rows[0];
    if (!r) return res.status(404).json({ error: 'not_found' });
    const wcc = (r.extra_fields || {}).website_content_conflict;
    if (!wcc) return res.status(400).json({ error: 'no_conflict' });
    const restore = {};
    if (wcc.logo_url) restore.website_logo_url = wcc.logo_url;
    if (wcc.description) restore.website_description = wcc.description;
    await query(
      `UPDATE companies SET
         needs_review = false, review_reason = NULL,
         extra_fields = ((coalesce(extra_fields,'{}'::jsonb) - 'website_content_conflict') || $2::jsonb
                        || jsonb_build_object('website_content_restored_at', to_jsonb($3::text))),
         updated_at = now()
       WHERE id = $1`,
      [id, JSON.stringify(restore), new Date().toISOString()]);
    await query(`UPDATE company_contacts SET extra_fields = coalesce(extra_fields,'{}'::jsonb) - 'hidden_conflict', updated_at = now() WHERE company_id = $1 AND source = 'stage7-website'`, [id]);
    res.json({ ok: true, company_id: id });
  } catch (err) { next(err); }
});

// POST /api/companies/:id/archive  — soft-delete toggle
router.post('/:id/archive', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const archived = req.body?.archived !== false;
    // A manual archive/unarchive is a DELIBERATE admin decision: set the override
    // flag so automatic status recomputation never reverts it, stamp the reason,
    // and clear any pending review (the admin has acted).
    const result = await query(
      `UPDATE companies
          SET archived               = $1,
              manual_status_override = true,
              archive_reason         = CASE WHEN $1 THEN 'admin' ELSE NULL END,
              archived_at            = CASE WHEN $1 THEN now() ELSE NULL END,
              needs_review           = false,
              review_reason          = NULL
        WHERE id = $2
      RETURNING id, archived`,
      [archived, id],
    );
    if (!result.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// POST /api/companies/:id/keep — resolve a review by KEEPING the company as-is.
// Marks it admin-decided (sticky) and clears the review flag so future uploads
// won't keep re-flagging the same disappearance.
router.post('/:id/keep', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const result = await query(
      `UPDATE companies
          SET needs_review = false, review_reason = NULL, manual_status_override = true
        WHERE id = $1
      RETURNING id, is_active, archived`,
      [id],
    );
    if (!result.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/companies/:id  — PERMANENT hard delete (platform_admin only).
//
// Used to purge bad records: non-Qatar companies wrongly ingested, expired
// companies, or wrong/duplicate rows. This is intentionally NOT archive —
// Val wants the row gone so a future legitimate re-ingest of the same company
// starts clean rather than colliding with a stale archived row.
//
// FK children clean up automatically:
//   • company_contacts / company_sources / person_companies / company_similar /
//     company_dedup_candidates → ON DELETE CASCADE
//   • research_jobs.target_company_id / jobs.company_id / canonical_id → SET NULL
// (feed_items/feed_events store company ids in a bigint[] with no FK, so a
// deleted id simply stops resolving to a chip — harmless.)
//
// The local→Railway mirror sync propagates the deletion on the next push.
router.delete('/:id', async (req, res, next) => {
  try {
    if (MODE !== 'local-admin') {
      // Curate data on the local engine; the deletion mirrors to prod on push.
      return res.status(403).json({ error: 'delete_local_only' });
    }
    if (req.user?.role !== 'platform_admin') {
      return res.status(403).json({ error: 'admin_only' });
    }
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const result = await query(
      'DELETE FROM companies WHERE id = $1 RETURNING id, name',
      [id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'not_found' });
    // Tombstone so the next mirror push removes the row from prod too.
    await query(
      `INSERT INTO sync_deletions (table_name, row_id) VALUES ('companies', $1)`,
      [id]
    ).catch((e) => console.warn('[companies] tombstone insert failed for', id, '—', e.message));
    res.json({ deleted: result.rows[0].id, name: result.rows[0].name });
  } catch (err) { next(err); }
});

export default router;
