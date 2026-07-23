// /api/chains — brand-chain proposals (Tier 2): the Yateem shape.
//
// One record carries the registration (the operator); the rest are Maps/MoPH discoveries
// with no CR of their own, all sharing the operator's website, named as extensions of its
// brand ("Yateem Optician - Mirqab Mall"). Strong evidence — but the adversarial pass for
// auto-linking could not run, so NOTHING links without Val's click. His approval writes
// parent_company_id; rejection is remembered on the member so the pair is never re-asked.
//
// Local engine only — canonical data; prod is a mirror.

import { Router } from 'express';
import { query } from '../db.js';
import { findBrandChains } from '../enrichment/chain_link.js';
import { recomputeBellScoreForCompany } from '../assembly/bell_score.js';

const router = Router();

let cache = null;
const CACHE_MS = 120_000;
const invalidate = () => { cache = null; };
async function getChains() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const data = await findBrandChains();
  cache = { at: Date.now(), data };
  return data;
}

router.get('/summary', async (_req, res, next) => {
  try {
    const g = await getChains();
    res.json({ groups: g.length, branches: g.reduce((n, x) => n + x.branches.length, 0) });
  } catch (e) { next(e); }
});

router.get('/groups', async (req, res, next) => {
  try {
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const g = await getChains();
    res.json({ total: g.length, rows: g.slice(0, limit) });
  } catch (e) { next(e); }
});

// Link ONE branch, or the whole group — either way each row is guarded individually.
router.post('/approve', async (req, res, next) => {
  try {
    const parentId = Number(req.body?.parent_id);
    const ids = (Array.isArray(req.body?.member_ids) ? req.body.member_ids : [req.body?.member_id])
      .map(Number).filter(Boolean);
    if (!parentId || !ids.length) return res.status(400).json({ error: 'ids_required' });
    // The parent must be real, active, and must not itself be someone's branch —
    // a two-level tree keeps "part of" honest and the map lines simple.
    const p = (await query(
      `SELECT id FROM companies WHERE id=$1 AND COALESCE(archived,false)=false AND parent_company_id IS NULL`,
      [parentId])).rows[0];
    if (!p) {
      // Say WHY in words Val can act on — 'parent_not_linkable' told him nothing.
      const row = (await query(`SELECT archived, parent_company_id FROM companies WHERE id=$1`, [parentId])).rows[0];
      const reason = !row ? 'That record no longer exists.'
        : row.archived ? 'That record is archived.'
        : row.parent_company_id ? 'That record is already a BRANCH of another family — it cannot also be a parent. The family may already be linked correctly; check the company drawer.'
        : 'That record cannot be a parent right now.';
      return res.status(409).json({ error: 'parent_not_linkable', reason });
    }
    let linked = 0;
    for (const id of ids) {
      const r = await query(`
        UPDATE companies SET parent_company_id = $2, updated_at = now()
         WHERE id = $1 AND id <> $2 AND COALESCE(archived,false) = false
           AND (parent_company_id IS NULL OR parent_company_id = $2)`, [id, parentId]);
      linked += r.rowCount;
      if (r.rowCount) await recomputeBellScoreForCompany(id).catch(() => {});
    }
    if (linked) await recomputeBellScoreForCompany(parentId).catch(() => {});
    invalidate();
    res.json({ ok: true, linked });
  } catch (e) { next(e); }
});

// Remembered on the MEMBER (extra_fields.chain_rejected), keyed by the proposed parent —
// so the same wrong proposal never comes back, but a different parent still can.
router.post('/reject', async (req, res, next) => {
  try {
    const parentId = Number(req.body?.parent_id);
    const ids = (Array.isArray(req.body?.member_ids) ? req.body.member_ids : [req.body?.member_id])
      .map(Number).filter(Boolean);
    if (!parentId || !ids.length) return res.status(400).json({ error: 'ids_required' });
    for (const id of ids) {
      await query(`
        UPDATE companies
           SET extra_fields = COALESCE(extra_fields,'{}'::jsonb) || jsonb_build_object('chain_rejected',
                 COALESCE(extra_fields->'chain_rejected','[]'::jsonb) ||
                 jsonb_build_object('parent_id', $2::bigint, 'at', now()::text)),
               updated_at = now()
         WHERE id = $1`, [id, parentId]);
    }
    invalidate();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
