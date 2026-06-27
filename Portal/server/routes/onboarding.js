// /api/onboarding — new-user "Getting Started" checklist state for the portal.
// ---------------------------------------------------------------------------
// Per-tenant, mounted under the `feature` gate (auth + active subscription).
// Derives 4 setup milestones from existing tables (READ-ONLY) plus a dismissal
// flag stored on tenant_profile. Every signal query is wrapped so a missing
// table / empty profile can never 500 — worst case a milestone reads "not done".
//   1. icp       — tenant_profile has real ICP content
//   2. revealed  — tenant has revealed ≥1 company/person (tenant_reveals)
//   3. crm       — tenant has ≥1 CRM record (crm_records)
//   4. outreach  — tenant has sent ≥1 email (crm_emails, direction='out')

import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

async function countOne(sql, params) {
  try { const r = await query(sql, params); return Number(r.rows[0]?.n || 0); }
  catch { return 0; }
}

router.get('/', async (req, res, next) => {
  try {
    const t = req.tenant?.id;
    if (!t) return res.json({ steps: {}, counts: {}, complete: false, dismissed: false });

    // ICP configured + dismissal flag (one tenant_profile row, or none yet).
    let icp = false, dismissed = false;
    try {
      const r = await query(
        `SELECT company_name, products_services, target_industries, target_titles, onboarding_dismissed
           FROM tenant_profile WHERE tenant_id = $1`, [t]);
      const p = r.rows[0];
      if (p) {
        dismissed = p.onboarding_dismissed === true;
        icp = !!(p.company_name || p.products_services
          || (Array.isArray(p.target_industries) && p.target_industries.length)
          || (Array.isArray(p.target_titles) && p.target_titles.length));
      }
    } catch { /* profile not created yet → icp stays false */ }

    const revealed = await countOne(`SELECT count(*)::int AS n FROM tenant_reveals WHERE tenant_id = $1`, [t]);
    const crm      = await countOne(`SELECT count(*)::int AS n FROM crm_records   WHERE tenant_id = $1`, [t]);
    const outreach = await countOne(`SELECT count(*)::int AS n FROM crm_emails    WHERE tenant_id = $1 AND direction = 'out'`, [t]);

    const steps = { icp, revealed: revealed > 0, crm: crm > 0, outreach: outreach > 0 };
    const complete = steps.icp && steps.revealed && steps.crm && steps.outreach;
    res.json({ steps, counts: { revealed, crm, outreach }, complete, dismissed });
  } catch (e) { next(e); }
});

// Permanently dismiss the checklist (upsert the flag; create the row if needed).
router.post('/dismiss', async (req, res, next) => {
  try {
    const t = req.tenant?.id;
    if (!t) return res.json({ ok: true });
    await query(
      `INSERT INTO tenant_profile (tenant_id, onboarding_dismissed, updated_at)
       VALUES ($1, true, now())
       ON CONFLICT (tenant_id) DO UPDATE SET onboarding_dismissed = true, updated_at = now()`,
      [t]);
    res.json({ ok: true });
  } catch (e) { next(e); }
});

export default router;
