// /api/people — listing, inline edit, reveal flow.

import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { jobs } from '../ingest/jobs.js';
import { enrichPeople as deepEnrich } from '../enrichment/stages/stage3_5.js';
import { recomputeAllSeniority } from '../enrichment/seniority.js';
import {
  listPersonContacts, loadPersonContactsByIds,
  upsertContact, setPrimaryContact, deleteContact,
} from '../lib/contacts.js';
import { revealOne, revealBulk, getRevealedSet, bypassesCredits } from '../lib/credits.js';
import { denyUnlessLocalEngine } from '../lib/auth.js';
import { addRevealedToCrm } from '../lib/crm.js';

const router = Router();

// Canonical people data is mutated ONLY on the local engine (source of truth);
// app/admin are read-only for it. Allow GET + reveal everywhere, block all other
// mutations (edit, archive, contacts CRUD, deep-enrich, …) off-local.
router.use((req, res, next) => {
  if (req.method === 'GET') return next();
  if (/\/reveal(-bulk)?$/.test(req.path)) return next();
  return denyUnlessLocalEngine(req, res, next);
});

// Contact types that are credit-gated (the "valuable details" — emails/numbers).
const SENSITIVE_CONTACT_TYPES = new Set(['email', 'phone', 'mobile', 'whatsapp', 'telephone', 'tel']);

// Mask email/phone on people rows for tenants that haven't revealed them.
// platform_admin + internal tenant (bypass) see everything. Adds
// `revealed_by_tenant` so the UI can show a Reveal button vs the value.
export async function maskPeople(req, rows) {
  if (!rows.length) return;
  if (bypassesCredits(req.user, req.tenant)) {
    for (const r of rows) r.revealed_by_tenant = true;
    return;
  }
  const revealed = await getRevealedSet(req.tenant.id, 'person', rows.map((r) => Number(r.id)));
  for (const r of rows) {
    const ok = revealed.has(Number(r.id));
    r.revealed_by_tenant = ok;
    // Photos are ADMIN-ONLY — never exposed to customers (admins bypass this
    // path via bypassesCredits above). Customers see initials avatars.
    r.profile_picture_url = null;
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

// Whitelist of editable people fields. System fields (id, pin, created_at,
// updated_at, assembled_at, extra_fields, experience/education/skills jsonb)
// are intentionally NOT editable.
const EDITABLE_FIELDS = new Set([
  'full_name', 'first_name', 'last_name', 'headline',
  'linkedin_url', 'linkedin_public_id',
  'email', 'phone',
  'location_text', 'country', 'city', 'summary',
  'profile_picture_url',
]);

router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit ?? 100), 1000);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const q      = (req.query.q || '').trim();
    const companyId = req.query.company_id ? Number(req.query.company_id) : null;
    const companyName = (req.query.company || '').trim();   // employer NAME text filter
    const source = (req.query.source || '').trim();          // MoPH | LinkedIn | manual | …
    const onlyRevealed = req.query.revealed;
    const archivedQ = req.query.archived;   // 'true' | 'false' | 'all' | undefined → defaults to 'false'
    const employment = req.query.employment; // 'with' | 'without' | undefined → no filter

    const where = [];
    const params = [];

    // Archive filter — default is Active tab (archived = false)
    if (archivedQ !== 'all') {
      const wantArchived = archivedQ === 'true';
      params.push(wantArchived);
      where.push(`archived = $${params.length}`);
    }

    if (q) {
      params.push('%' + q.toLowerCase() + '%');
      const p = `$${params.length}`;
      // Search name, linkedin, email, headline, and MoPH scope/license too, so the
      // box doubles as a specialty/license search.
      where.push(`(lower(full_name) LIKE ${p} OR coalesce(linkedin_url,'') ILIKE ${p} OR coalesce(email::text,'') ILIKE ${p} OR lower(coalesce(headline,'')) LIKE ${p} OR lower(coalesce(extra_fields->>'moph_scope','')) LIKE ${p} OR lower(coalesce(extra_fields->>'moph_license_no','')) LIKE ${p})`);
    }
    if (companyId) {
      params.push(companyId);
      where.push(`EXISTS (SELECT 1 FROM person_companies pc WHERE pc.person_id = people.id AND pc.company_id = $${params.length})`);
    }
    if (companyName) {
      params.push('%' + companyName + '%');
      where.push(`EXISTS (SELECT 1 FROM person_companies pc JOIN companies c ON c.id = pc.company_id
                          WHERE pc.person_id = people.id AND c.name ILIKE $${params.length})`);
    }
    if (source) {
      // 'LinkedIn' is derived from having a profile URL; everything else is the
      // explicit extra_fields.source tag (e.g. 'MoPH', 'manual').
      if (source === 'LinkedIn') {
        where.push(`linkedin_url IS NOT NULL`);
      } else {
        params.push(source);
        where.push(`extra_fields->>'source' = $${params.length}`);
      }
    }
    if (onlyRevealed === 'true' || onlyRevealed === 'false') {
      params.push(onlyRevealed === 'true');
      where.push(`is_revealed = $${params.length}`);
    }
    // Employment-link coverage filter (no params needed — correlated EXISTS).
    if (employment === 'with') {
      where.push(`EXISTS (SELECT 1 FROM person_companies pc WHERE pc.person_id = people.id)`);
    } else if (employment === 'without') {
      where.push(`NOT EXISTS (SELECT 1 FROM person_companies pc WHERE pc.person_id = people.id)`);
    }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    params.push(limit, offset);

    const sql = `
      SELECT id, pin, full_name, first_name, last_name, headline,
             linkedin_url, email, phone,
             location_text, country, city,
             profile_picture_url,
             extra_fields, bell_score,
             is_revealed, revealed_at,
             created_at, updated_at, archived,
             (SELECT c.name FROM person_companies pc
                JOIN companies c ON c.id = pc.company_id
               WHERE pc.person_id = people.id
               ORDER BY pc.is_current DESC NULLS LAST, pc.start_date DESC NULLS LAST
               LIMIT 1) AS current_company,
             (SELECT pc.title FROM person_companies pc
               WHERE pc.person_id = people.id AND pc.title IS NOT NULL AND pc.title <> ''
               ORDER BY pc.is_current DESC NULLS LAST, pc.start_date DESC NULLS LAST
               LIMIT 1) AS current_title
      FROM people
      ${whereSql}
      ORDER BY bell_score DESC, id DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}
    `;
    const countSql = `SELECT count(*)::int AS total FROM people ${whereSql}`;

    const [rowsResult, countResult] = await Promise.all([
      query(sql, params),
      query(countSql, params.slice(0, params.length - 2)),
    ]);

    // Attach contacts per row (one bulk query for all visible people)
    const visibleIds = rowsResult.rows.map(r => r.id);
    const contactsMap = await loadPersonContactsByIds(visibleIds);
    for (const row of rowsResult.rows) {
      row.contacts = contactsMap.get(row.id) || [];
      // Derive the source badge(s): explicit extra_fields.source (MoPH/manual/…)
      // plus 'LinkedIn' when we have a profile URL. Done before masking so the
      // badge is accurate even when the URL itself is hidden in user mode.
      const srcs = [];
      const s = row.extra_fields && row.extra_fields.source;
      if (s) srcs.push(s);
      if (row.linkedin_url) srcs.push('LinkedIn');
      row.sources = [...new Set(srcs)];
    }
    await maskPeople(req, rowsResult.rows);

    res.json({
      total: countResult.rows[0].total,
      limit, offset,
      rows: rowsResult.rows,
    });
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const [person, companies, contacts] = await Promise.all([
      query('SELECT * FROM people WHERE id = $1', [id]),
      query(`
        SELECT pc.*, c.bin, c.name AS company_name, c.linkedin_url AS company_linkedin_url
        FROM person_companies pc
        JOIN companies c ON c.id = pc.company_id
        WHERE pc.person_id = $1
        ORDER BY pc.is_current DESC, pc.start_date DESC NULLS LAST
      `, [id]),
      listPersonContacts(id),
    ]);
    if (!person.rows.length) return res.status(404).json({ error: 'not_found' });
    const row = person.rows[0];
    row.contacts = contacts;             // let maskPeople gate them together
    await maskPeople(req, [row]);
    const maskedContacts = row.contacts;
    delete row.contacts;
    res.json({
      person:    row,
      companies: companies.rows,
      contacts:  maskedContacts,
    });
  } catch (err) { next(err); }
});

// -----------------------------------------------------------------------------
// Contacts CRUD — adds/edits/removes individual contact rows for a person
// -----------------------------------------------------------------------------

router.post('/:id/contacts', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};
    if (!['email','phone','social'].includes(body.type)) {
      return res.status(400).json({ error: 'invalid_type' });
    }
    const row = await upsertContact('person', id, {
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

router.post('/:id/contacts/:cid/primary', async (req, res, next) => {
  try {
    const id  = Number(req.params.id);
    const cid = Number(req.params.cid);
    const type = String(req.body?.type || '').trim();
    if (!['email','phone','social'].includes(type)) {
      return res.status(400).json({ error: 'invalid_type' });
    }
    await setPrimaryContact('person', id, cid, type);
    res.json({ ok: true });
  } catch (err) { next(err); }
});

router.delete('/:id/contacts/:cid', async (req, res, next) => {
  try {
    const id  = Number(req.params.id);
    const cid = Number(req.params.cid);
    const ok  = await deleteContact('person', id, cid);
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

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
    if (setParts.length === 0) return res.status(400).json({ error: 'no_fields_to_update' });
    params.push(id);
    const sql = `UPDATE people SET ${setParts.join(', ')} WHERE id = $${params.length} RETURNING *`;
    const result = await query(sql, params);
    if (!result.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ person: result.rows[0] });
  } catch (err) { next(err); }
});

// POST /api/people/:id/archive — soft-delete toggle (mirrors company flow)
router.post('/:id/archive', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const archived = req.body?.archived !== false;
    const result = await query(
      'UPDATE people SET archived = $1 WHERE id = $2 RETURNING id, archived',
      [archived, id],
    );
    if (!result.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// Fetch the now-unlocked contact fields for a person (used in reveal responses).
async function personContact(id) {
  const r = await query(`SELECT id, pin, full_name, email, phone FROM people WHERE id = $1`, [id]);
  return r.rows[0] || null;
}

// POST /api/people/:id/reveal — unlock contact details.
//   • Customer tenants (user mode): charge 1 credit per tenant, once per person.
//   • platform_admin / internal (admin.bell.qa, local): no charge; also flips the
//     global is_revealed data flag (Bell-side "we have this contact").
router.post('/:id/reveal', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const actor = req.user?.email || 'unknown';

    if (bypassesCredits(req.user, req.tenant)) {
      await query(
        `UPDATE people SET is_revealed = true, revealed_at = now(), revealed_by = $2
          WHERE id = $1 AND is_revealed = false`,
        [id, actor]
      );
      await addRevealedToCrm(req.tenant?.id, 'person', [id], actor);
      return res.json({ revealed: true, charged: 0, unlimited: true, person: await personContact(id) });
    }

    const result = await revealOne(req.tenant.id, 'person', id, actor);
    if (result.insufficient) {
      return res.status(402).json({ error: 'insufficient_credits', balance: result.balance });
    }
    await addRevealedToCrm(req.tenant.id, 'person', [id], actor);
    res.json({ ...result, person: await personContact(id) });
  } catch (err) { next(err); }
});

// POST /api/people/reveal-bulk — reveal many at once. Body: { ids: [...] }.
// Partial: reveals as many not-yet-revealed as the balance allows.
router.post('/reveal-bulk', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length) return res.status(400).json({ error: 'bad_request', reason: 'ids[] required' });
    const actor = req.user?.email || 'unknown';

    if (bypassesCredits(req.user, req.tenant)) {
      await query(
        `UPDATE people SET is_revealed = true, revealed_at = now(), revealed_by = $2
          WHERE id = ANY($1::bigint[]) AND is_revealed = false`,
        [ids.map(Number), actor]
      );
      await addRevealedToCrm(req.tenant?.id, 'person', ids, actor);
      return res.json({ unlimited: true, revealed: ids.length, requested: ids.length });
    }
    const result = await revealBulk(req.tenant.id, 'person', ids, actor);
    await addRevealedToCrm(req.tenant.id, 'person', ids, actor);
    res.json(result);
  } catch (err) { next(err); }
});

// POST /api/people/recompute-seniority
// Re-runs inferSeniority on every person_companies row. Use after improving
// the rule set.
router.post('/recompute-seniority', async (req, res, next) => {
  try {
    const r = await recomputeAllSeniority();
    res.json(r);
  } catch (err) { next(err); }
});

// POST /api/people/deep-enrich  { person_ids: [...] }
// Stage 3.5 — fills photo, email, full experience/education/skills via
// harvestapi/linkedin-profile-scraper. Runs in the background; returns a job
// id for polling via /api/enrichment/jobs/:id.
router.post('/deep-enrich', async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.person_ids) ? req.body.person_ids.map(Number).filter(Number.isFinite) : [];
    if (ids.length === 0) return res.status(400).json({ error: 'person_ids required' });

    const job = jobs.start({ kind: 'enrichment', source: 'deep-enrich-people' });
    res.json({ job_id: job.id, status: job.status });

    (async () => {
      try {
        jobs.log(job.id, `▸ Initializing Stage 3.5 — Deep-enrich People`);
        jobs.log(job.id, `Target set: ${ids.length} ${ids.length === 1 ? 'person' : 'people'}`);
        jobs.log(job.id, `Engine: apify_harvestapi_profile`);
        jobs.log(job.id, `Deploying agents…`);
        const result = await deepEnrich(ids, (m) => jobs.log(job.id, m));
        // Refresh seniority bucketing for the affected people (their headlines
        // may have been updated by the deep-enrich and would otherwise stay in
        // the old org-chart level).
        try {
          const sen = await recomputeAllSeniority();
          jobs.log(job.id, `  Recomputed seniority — updated ${sen.updated} of ${sen.scanned} links`);
        } catch (e) { jobs.log(job.id, `  (seniority recompute failed: ${e.message})`); }
        jobs.complete(job.id, result);
      } catch (err) {
        jobs.fail(job.id, err);
      }
    })();
  } catch (err) { next(err); }
});

// POST /api/people/dedupe-person-companies
// One-shot cleanup: collapse duplicate (person_id, company_id, source_stage=3)
// links from old Stage 3 runs down to one row per pair. Keeps the most recent.
router.post('/dedupe-person-companies', async (req, res, next) => {
  try {
    const r = await query(`
      WITH ranked AS (
        SELECT id,
               row_number() OVER (
                 PARTITION BY person_id, company_id, source_stage, is_current
                 ORDER BY updated_at DESC NULLS LAST, id DESC
               ) AS rn
        FROM person_companies
      )
      DELETE FROM person_companies
      WHERE id IN (SELECT id FROM ranked WHERE rn > 1)
      RETURNING id
    `);
    res.json({ removed: r.rows.length });
  } catch (err) { next(err); }
});

// DELETE /api/people/:id — PERMANENT hard delete (local engine, platform_admin).
// Mirrors the company delete: purge a wrong/junk person (e.g. a "Board of
// Directors" heading that slipped in from a site scrape). person_companies /
// person_contacts cascade; the deletion mirrors to prod on the next push via a
// sync_deletions tombstone. (Blocked off-local by the router.use gate above.)
router.delete('/:id', async (req, res, next) => {
  try {
    if (req.user?.role !== 'platform_admin') return res.status(403).json({ error: 'admin_only' });
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const result = await query('DELETE FROM people WHERE id = $1 RETURNING id, full_name', [id]);
    if (!result.rows.length) return res.status(404).json({ error: 'not_found' });
    await query(`INSERT INTO sync_deletions (table_name, row_id) VALUES ('people', $1)`, [id])
      .catch((e) => console.warn('[people] tombstone insert failed for', id, '—', e.message));
    res.json({ deleted: result.rows[0].id, name: result.rows[0].full_name });
  } catch (err) { next(err); }
});

export default router;
