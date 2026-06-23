// /api/icp — per-tenant company profile + ideal customer profile (ICP).
// Drives personalized Signals + Bella. Mounted under the `feature` gate
// (auth + active subscription); every query is scoped to req.tenant.id.

import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

const s = (v) => (v == null || v === '') ? null : String(v).slice(0, 8000);
const arr = (v) => Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 80) : null;
const website = (v) => (['has', 'none'].includes(String(v)) ? String(v) : 'any');
const priceItems = (v) => {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 40)
    .map((it) => ({ title: String(it?.title || '').slice(0, 200), price: String(it?.price || '').slice(0, 200) }))
    .filter((it) => it.title || it.price);
};

router.get('/', async (req, res, next) => {
  try {
    const r = await query(`SELECT * FROM tenant_profile WHERE tenant_id = $1`, [req.tenant.id]);
    res.json({ profile: r.rows[0] || null });
  } catch (e) { next(e); }
});

router.put('/', async (req, res, next) => {
  try {
    const b = req.body || {};
    await query(
      `INSERT INTO tenant_profile
         (tenant_id, company_name, company_about, products_services, pricing_items, current_customers,
          target_industries, target_sizes, target_titles, target_tech_stack, target_has_website, target_keywords, icp_notes,
          updated_at, updated_by)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,$11,$12,$13, now(), $14)
       ON CONFLICT (tenant_id) DO UPDATE SET
         company_name=$2, company_about=$3, products_services=$4, pricing_items=$5::jsonb, current_customers=$6,
         target_industries=$7, target_sizes=$8, target_titles=$9, target_tech_stack=$10, target_has_website=$11,
         target_keywords=$12, icp_notes=$13, updated_at=now(), updated_by=$14`,
      [req.tenant.id, s(b.company_name), s(b.company_about), s(b.products_services),
       JSON.stringify(priceItems(b.pricing_items)), s(b.current_customers),
       arr(b.target_industries), arr(b.target_sizes), arr(b.target_titles), arr(b.target_tech_stack),
       website(b.target_has_website), arr(b.target_keywords), s(b.icp_notes), req.user?.email || null]);
    const r = await query(`SELECT * FROM tenant_profile WHERE tenant_id = $1`, [req.tenant.id]);
    res.json({ profile: r.rows[0] });
  } catch (e) { next(e); }
});

export default router;
