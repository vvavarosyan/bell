// /api/research-candidates — the research approval queue (holding pen).
//
// Companies that research DISCOVERS land in research_candidates and wait here for
// an admin decision. This router is mounted LOCAL-ENGINE-ONLY (see server.js):
// approval is canonical curation, so it happens where the source of truth lives.
//
//   GET    /                      list (?kind=pending|non_qatar|rejected|approved) + counts
//   POST   /:id/approve           promote a pending candidate into companies
//   POST   /:id/reject            mark rejected (remembered; not re-queued)
//   POST   /:id/restore           move a non_qatar/rejected candidate back to pending
//
// Approving a candidate creates a real (customer-visible) Qatar company on the
// local engine; it then mirrors up to bell.qa via the normal push.

import { Router } from 'express';
import { query, withTransaction } from '../db.js';
import { normalizeName } from '../ingest/normalize.js';
import { recomputeCompanyStatus } from '../ingest/recompute_status.js';

const router = Router();

// GET /api/research-candidates?kind=&limit=&offset=
router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit ?? 100), 500);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const kind   = req.query.kind;

    const where = [];
    const params = [];
    if (kind) { params.push(kind); where.push(`kind = $${params.length}`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    params.push(limit, offset);
    const [rows, counts] = await Promise.all([
      query(`
        SELECT id, kind, name, name_normalized, country,
               primary_registration_no, website, linkedin_url, city, industry,
               relation_to_target, discovered_from_job_id, discovered_at,
               decided_by, decided_at, promoted_company_id, notes, updated_at
          FROM research_candidates
          ${whereSql}
          ORDER BY discovered_at DESC
          LIMIT $${params.length - 1} OFFSET $${params.length}
      `, params),
      query(`SELECT kind, count(*)::int AS n FROM research_candidates GROUP BY kind`),
    ]);

    const byKind = { pending: 0, non_qatar: 0, rejected: 0, approved: 0 };
    for (const r of counts.rows) byKind[r.kind] = r.n;

    res.json({ counts: byKind, rows: rows.rows, limit, offset });
  } catch (err) { next(err); }
});

// POST /api/research-candidates/:id/approve — promote a PENDING candidate into
// the live companies table. Qatar only (non-Qatar must be restored→pending first
// if the admin reclassifies it).
router.post('/:id/approve', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });

    const out = await withTransaction(async (client) => {
      const cr = await client.query(`SELECT * FROM research_candidates WHERE id = $1 FOR UPDATE`, [id]);
      if (!cr.rows.length) return { error: 'not_found' };
      const cand = cr.rows[0];
      if (cand.kind !== 'pending') return { error: 'not_pending', kind: cand.kind };

      const normalized = cand.name_normalized || normalizeName(cand.name);

      // Guard: if a live company already matches (created since discovery), link
      // to it instead of inserting a duplicate.
      let companyId = null;
      if (cand.linkedin_url) {
        const r = await client.query(`SELECT id FROM companies WHERE linkedin_url = $1`, [cand.linkedin_url]);
        if (r.rows.length) companyId = Number(r.rows[0].id);
      }
      if (!companyId && normalized) {
        const r = await client.query(`SELECT id FROM companies WHERE name_normalized = $1 LIMIT 1`, [normalized]);
        if (r.rows.length) companyId = Number(r.rows[0].id);
      }

      if (!companyId) {
        const ins = await client.query(`
          INSERT INTO companies (
            name, name_normalized, is_active, status_normalized,
            primary_registration_no, website, linkedin_url, city, country, industry,
            extra_fields
          ) VALUES ($1,$2,true,'unknown',$3,$4,$5,$6,'Qatar',$7,$8::jsonb)
          RETURNING id
        `, [
          cand.name, normalized,
          cand.primary_registration_no, cand.website, cand.linkedin_url,
          cand.city || 'Doha', cand.industry,
          JSON.stringify({
            seed_source: 'research',
            seed_job_id: cand.discovered_from_job_id,
            approved_from_candidate: cand.id,
            relation_to_target: cand.relation_to_target,
          }),
        ]);
        companyId = Number(ins.rows[0].id);
      }

      // Provenance row so the company carries its research origin.
      await client.query(`
        INSERT INTO company_sources (company_id, source, source_record_id, source_url, raw_payload)
        VALUES ($1, 'research', $2, NULL, $3::jsonb)
        ON CONFLICT DO NOTHING
      `, [companyId, `research:candidate-${cand.id}`, JSON.stringify(cand.raw || {})]);

      await client.query(`
        UPDATE research_candidates
           SET kind = 'approved', promoted_company_id = $2,
               decided_by = $3, decided_at = now(), updated_at = now()
         WHERE id = $1
      `, [id, companyId, req.user?.email || null]);

      await recomputeCompanyStatus(companyId, client);
      return { approved: id, company_id: companyId };
    });

    if (out.error === 'not_found')   return res.status(404).json({ error: 'not_found' });
    if (out.error === 'not_pending') return res.status(409).json({ error: 'not_pending', kind: out.kind });
    res.json(out);
  } catch (err) { next(err); }
});

// POST /api/research-candidates/:id/reject — remember the rejection.
router.post('/:id/reject', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const r = await query(`
      UPDATE research_candidates
         SET kind = 'rejected', decided_by = $2, decided_at = now(), updated_at = now()
       WHERE id = $1 AND kind IN ('pending','non_qatar')
      RETURNING id, kind
    `, [id, req.user?.email || null]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found_or_decided' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// POST /api/research-candidates/:id/restore — move a non_qatar/rejected candidate
// back to pending (admin reclassified it as Qatar / wants to reconsider).
router.post('/:id/restore', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const r = await query(`
      UPDATE research_candidates
         SET kind = 'pending', decided_by = NULL, decided_at = NULL, updated_at = now()
       WHERE id = $1 AND kind IN ('non_qatar','rejected')
      RETURNING id, kind
    `, [id]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found_or_not_restorable' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

export default router;
