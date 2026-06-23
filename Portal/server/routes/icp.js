// /api/icp — per-tenant company profile + ideal customer profile (ICP).
// Drives personalized Signals + Bella. Mounted under the `feature` gate
// (auth + active subscription); every query is scoped to req.tenant.id.

import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const r = await query(`SELECT * FROM tenant_profile WHERE tenant_id = $1`, [req.tenant.id]);
    res.json({ profile: r.rows[0] || null });
  } catch (e) { next(e); }
});

router.put('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    const s = (v) => (v == null || v === '') ? null : String(v).slice(0, 8000);
    const arr = (v) => Array.isArray(v) ? v.map(String).filter(Boolean).slice(0, 60) : null;
    await query(
      `INSERT INTO tenant_profile
         (tenant_id, company_about, products_services, pricing, current_customers,
          target_industries, target_sizes, target_geographies, target_titles, target_keywords, icp_notes, updated_at, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, now(), $12)
       ON CONFLICT (tenant_id) DO UPDATE SET
         company_about=$2, products_services=$3, pricing=$4, current_customers=$5,
         target_industries=$6, target_sizes=$7, target_geographies=$8, target_titles=$9,
         target_keywords=$10, icp_notes=$11, updated_at=now(), updated_by=$12`,
      [req.tenant.id, s(b.company_about), s(b.products_services), s(b.pricing), s(b.current_customers),
       arr(b.target_industries), arr(b.target_sizes), s(b.target_geographies), s(b.target_titles),
       s(b.target_keywords), s(b.icp_notes), req.user?.email || null]);
    const r = await query(`SELECT * FROM tenant_profile WHERE tenant_id = $1`, [req.tenant.id]);
    res.json({ profile: r.rows[0] });
  } catch (e) { next(e); }
});

export default router;
