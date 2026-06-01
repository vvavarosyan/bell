// /api/companies — listing, filtering, inline edit, single-row fetch.

import { Router } from 'express';
import { query } from '../db.js';
import {
  listCompanyContacts, loadCompanyContactsByIds,
  upsertContact, setPrimaryContact, deleteContact,
} from '../lib/contacts.js';
import { wipeStaleEnrichmentAfterUrlReplace } from '../enrichment/stages/stage1.js';
import { revealOne, revealBulk, getRevealedSet, bypassesCredits } from '../lib/credits.js';
import { denyUnlessLocalEngine } from '../lib/auth.js';

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

    if (q) {
      params.push('%' + q.toLowerCase() + '%');
      where.push(`(lower(name) LIKE $${params.length} OR lower(coalesce(legal_name,'')) LIKE $${params.length} OR coalesce(primary_registration_no,'') ILIKE $${params.length})`);
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
             industry, sector, employee_count, founded_year,
             linkedin_url, linkedin_logo_url,
             stage1_status, stage1_at,
             stage2_status, stage2_at,
             stage3_status, stage3_at,
             stage4_status, stage4_at,
             stage5_status, stage5_at,
             stage6_status, stage6_at,
             extra_fields,
             created_at, updated_at, assembled_at, archived,
             archive_reason, needs_review, review_reason, manual_status_override,
             (SELECT array_agg(DISTINCT cs.source ORDER BY cs.source)
              FROM company_sources cs WHERE cs.company_id = companies.id ${srcFilter}) AS sources,
             (SELECT json_agg(json_build_object('source', cs.source, 'record_id', cs.source_record_id) ORDER BY cs.source)
              FROM company_sources cs WHERE cs.company_id = companies.id ${srcFilter}) AS source_records
      FROM companies
      ${whereSql}
      ORDER BY id DESC
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
             c.founded_year,
             EXTRACT(YEAR FROM c.incorporation_date)::int AS incorporation_year,
             (SELECT array_agg(DISTINCT cs.source ORDER BY cs.source)
              FROM company_sources cs WHERE cs.company_id = c.id) AS sources
      FROM companies c
      WHERE c.latitude IS NOT NULL
        AND c.longitude IS NOT NULL
        AND c.archived = false
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
        city:     row.city,
        sources:  row.sources || [],
        website:  row.website,
        linkedin_url: row.linkedin_url,
        // Prefer founded_year; fall back to year from incorporation_date.
        year: row.founded_year || row.incorporation_year || null,
      },
    }));
    res.json({
      type: 'FeatureCollection',
      features,
      total: features.length,
    });
  } catch (err) { next(err); }
});

// GET /api/companies/:id — full row including extra_fields + linked sources
// Includes raw_payload from EVERY source so the detail drawer shows every
// JSON field that was ever scraped.
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) {
      // Stops the NaN-bigint blowup if a non-numeric path slips past the route
      // matchers above (e.g. a future sibling route added without checking).
      return res.status(400).json({ error: 'invalid_id', got: req.params.id });
    }
    const [company, sources, people, contacts] = await Promise.all([
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
               p.is_revealed,
               pc.title, pc.seniority_level, pc.org_chart_level, pc.is_current
        FROM person_companies pc
        JOIN people p ON p.id = pc.person_id
        WHERE pc.company_id = $1
        ORDER BY pc.org_chart_level NULLS LAST, p.full_name
        LIMIT 200
      `, [id]),
      listCompanyContacts(id),
    ]);
    if (!company.rows.length) return res.status(404).json({ error: 'not_found' });
    const row = company.rows[0];
    row.contacts = contacts;             // gate company + its contacts together
    await maskCompanies(req, [row]);
    const maskedContacts = row.contacts;
    delete row.contacts;
    res.json({
      company:  row,
      sources:  sources.rows,
      people:   people.rows,
      contacts: maskedContacts,
    });
  } catch (err) { next(err); }
});

// POST /api/companies/:id/reveal — unlock company contact details (1 credit).
router.post('/:id/reveal', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const actor = req.user?.email || 'unknown';
    if (bypassesCredits(req.user, req.tenant)) {
      return res.json({ revealed: true, charged: 0, unlimited: true, company: await companyContact(id) });
    }
    const result = await revealOne(req.tenant.id, 'company', id, actor);
    if (result.insufficient) {
      return res.status(402).json({ error: 'insufficient_credits', balance: result.balance });
    }
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
      return res.json({ unlimited: true, revealed: ids.length, requested: ids.length });
    }
    res.json(await revealBulk(req.tenant.id, 'company', ids, actor));
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
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/companies/reclassify-statuses
// Re-evaluate is_active + archived for ALL existing companies using the
// multi-source OR rule (any active source → company active). Use after a
// status rule change, to avoid re-ingesting all JSON files.
router.post('/reclassify-statuses', async (req, res, next) => {
  try {
    const { recomputeCompanyStatus } = await import('../ingest/recompute_status.js');
    const allIds = await query(`SELECT DISTINCT company_id FROM company_sources`);
    let scanned = 0;
    for (const row of allIds.rows) {
      await recomputeCompanyStatus(row.company_id);
      scanned++;
    }
    res.json({ scanned });
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
    if (setParts.length === 0) {
      return res.status(400).json({ error: 'no_fields_to_update' });
    }
    params.push(id);
    const sql = `UPDATE companies SET ${setParts.join(', ')} WHERE id = $${params.length} RETURNING *`;
    const result = await query(sql, params);
    if (!result.rows.length) return res.status(404).json({ error: 'not_found' });
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
    res.json({ ok: true, company_id: id, ...summary });
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
