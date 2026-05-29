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

const router = Router();

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
      where.push(`(lower(full_name) LIKE $${params.length} OR coalesce(linkedin_url,'') ILIKE $${params.length} OR coalesce(email::text,'') ILIKE $${params.length})`);
    }
    if (companyId) {
      params.push(companyId);
      where.push(`EXISTS (SELECT 1 FROM person_companies pc WHERE pc.person_id = people.id AND pc.company_id = $${params.length})`);
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
             extra_fields,
             is_revealed, revealed_at,
             created_at, updated_at, archived
      FROM people
      ${whereSql}
      ORDER BY id DESC
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
    }

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
    res.json({
      person:    person.rows[0],
      companies: companies.rows,
      contacts,
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

// POST /api/people/:id/reveal — mark as revealed and bill the credit
router.post('/:id/reveal', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const adminEmail = req.body?.admin_email || 'unknown@local';
    const result = await withTransaction(async (client) => {
      const r = await client.query(
        `UPDATE people
            SET is_revealed = true,
                revealed_at = now(),
                revealed_by = $2
          WHERE id = $1
            AND is_revealed = false
        RETURNING id, pin, full_name, is_revealed, revealed_at`,
        [id, adminEmail]
      );
      if (r.rows.length === 0) return null; // already revealed or not found
      await client.query(
        `INSERT INTO enrichment_credits (day, stage, tool, credits_used, usd_used, run_count)
         VALUES (current_date, 3, 'reveal', 1, 0, 1)
         ON CONFLICT (day, stage, tool) DO UPDATE
           SET credits_used = enrichment_credits.credits_used + 1,
               run_count   = enrichment_credits.run_count + 1`
      );
      return r.rows[0];
    });
    if (!result) return res.status(409).json({ error: 'already_revealed_or_missing' });
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

export default router;
