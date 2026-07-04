// /api/public/research — PUBLIC (no auth) published Bell research reports for
// the marketing site's /research section (Val 2026-07-03: every research —
// admin- or user-commissioned — publishes to bell.qa like the news pages do;
// fresh content + organic traffic + conversion).
//
// Safety rules:
//   • Only reports the release pipeline PUBLISHED (is_published = true —
//     status 'ready', past the exclusivity window, not opted out).
//   • ANONYMOUS: the commissioning tenant/user is never selected, let alone
//     returned. Only report content + job type/target label.
//   • Read-only, CDN-cacheable.

import { Router } from 'express';
import { query } from '../db.js';

const router = Router();
const MAX_LIMIT = 50;

// Defense-in-depth: never surface report types Bell keeps private (person —
// PDPPL / People-lockdown). The publish pipeline already refuses to publish
// them; this guarantees the public read excludes them even for any legacy row.
// Types are env-validated to [a-z_] so inlining them in SQL is injection-safe.
const PRIVATE_TYPES = (process.env.BDI_RESEARCH_PRIVATE_TYPES ?? 'person')
  .split(',').map((s) => s.trim().toLowerCase()).filter((t) => /^[a-z_]+$/.test(t));
const PRIVATE_SQL = PRIVATE_TYPES.length
  ? `AND lower(j.type) <> ALL(ARRAY[${PRIVATE_TYPES.map((t) => `'${t}'`).join(',')}]::text[])`
  : '';

const SAFE_LIST = `
  SELECT r.id, r.title, r.summary, r.public_slug, r.published_at,
         jsonb_array_length(COALESCE(r.sections, '[]'::jsonb)) AS section_count,
         j.type, j.target_label
    FROM research_reports r
    JOIN research_jobs j ON j.id = r.job_id
   WHERE r.is_published = true
   ${PRIVATE_SQL}
`;

// GET /api/public/research?type=&limit=
router.get('/', async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), MAX_LIMIT);
    const params = [];
    let typeSql = '';
    if (req.query.type) { params.push(String(req.query.type)); typeSql = `AND j.type = $${params.length}`; }
    params.push(limit);
    const r = await query(
      `${SAFE_LIST} ${typeSql} ORDER BY r.published_at DESC NULLS LAST LIMIT $${params.length}`,
      params
    );
    res.set('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
    res.json({ items: r.rows });
  } catch (err) { next(err); }
});

// GET /api/public/research/:slug — full report + related (same type).
router.get('/:slug', async (req, res, next) => {
  try {
    const slug = String(req.params.slug || '').slice(0, 120);
    const r = await query(`
      SELECT r.id, r.title, r.summary, r.sections, r.public_slug, r.published_at,
             j.type, j.target_label
        FROM research_reports r
        JOIN research_jobs j ON j.id = r.job_id
       WHERE r.is_published = true AND r.public_slug = $1
       ${PRIVATE_SQL}
    `, [slug]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    const item = r.rows[0];
    const rel = await query(
      `${SAFE_LIST} AND j.type = $1 AND r.public_slug <> $2 ORDER BY r.published_at DESC NULLS LAST LIMIT 4`,
      [item.type, slug]
    );
    res.set('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
    res.json({ item, related: rel.rows });
  } catch (err) { next(err); }
});

export default router;
