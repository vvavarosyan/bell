// /api/onboarding — the portal's guided setup / "Getting Started" state.
// ---------------------------------------------------------------------------
// Phase 4: a WEIGHTED setup meter. Derives each milestone READ-ONLY from
// existing tables (per-user profile/email + per-tenant ICP/reveal/CRM/outreach),
// returns a completion `percent`, and carries for each step BOTH where to go
// ("action") and an instruction Bella can run on the user's behalf ("bella").
// Every signal query is wrapped so a missing table / empty profile can never
// 500 — worst case a milestone reads "not done". A dismissal flag on
// tenant_profile hides it once the user opts out.

import { Router } from 'express';
import { query } from '../db.js';

const router = Router();

async function countOne(sql, params) {
  try { const r = await query(sql, params); return Number(r.rows[0]?.n || 0); }
  catch { return 0; }
}

// The steps, in order, with weights (ICP matters most — it powers matches,
// signals and Bella). `action` drives the "Do it" button; `bella` is the
// instruction the "Bella does it for me" button sends her.
const STEP_DEFS = [
  { key: 'profile',  weight: 1, label: 'Add your job title',
    hint: 'So your name and role appear on the emails you send.',
    action: { tab: 'account', subsection: 'profile' },
    bella: 'Help me set my job title in my profile — ask me what it is, then fill it in.' },
  { key: 'icp',      weight: 2, label: 'Set up your Company & ICP profile',
    hint: 'Tell Bell who you sell to — it powers your matches, signals and Bella.',
    action: { tab: 'account', subsection: 'icp' },
    bella: 'Help me fill in my Company & ICP profile — ask me about my company and the customers I target, then fill in the ICP form for me.' },
  { key: 'email',    weight: 1, label: 'Brand your emails',
    hint: 'Add an email header, footer and signature so your outreach looks designed.',
    action: { tab: 'account', subsection: 'email' },
    bella: 'Create a professional email header, footer and signature for my company and set them up in my email settings.' },
  { key: 'revealed', weight: 1, label: 'Reveal your first contact',
    hint: 'Filter to your target market, then reveal a company or person’s details.',
    action: { tab: 'companies' },
    bella: 'Find companies that match my ICP and show me the best ones — then offer to reveal the top contact.' },
  { key: 'crm',      weight: 1, label: 'Add a lead to your CRM',
    hint: 'Track the companies and people you want to pursue.',
    action: { tab: 'crm' },
    bella: 'Help me add my most promising target company to my CRM.' },
  { key: 'outreach', weight: 1, label: 'Send your first outreach',
    hint: 'Reach out from your CRM using your own branding.',
    action: { tab: 'crm' },
    bella: 'Help me draft and send my first outreach email to a lead in my CRM — personalize it and use my email branding.' },
];

router.get('/', async (req, res, next) => {
  try {
    const t = req.tenant?.id;
    const uid = req.user?.id;
    if (!t) return res.json({ items: [], steps: {}, percent: 0, complete: false, dismissed: false });

    // Per-USER: job title + any email branding (users row + extra_fields).
    let profile = false, email = false;
    try {
      const r = await query(`SELECT title, extra_fields FROM users WHERE id = $1`, [uid]);
      const u = r.rows[0] || {};
      const p = (u.extra_fields || {}).profile || {};
      profile = !!String(u.title || '').trim();
      email = !!(String(p.email_header_html || '').trim() || String(p.email_footer_html || '').trim() || String(p.email_signature || '').trim());
    } catch { /* leave both false */ }

    // Per-TENANT: ICP content + dismissal flag.
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

    const done = { profile, icp, email, revealed: revealed > 0, crm: crm > 0, outreach: outreach > 0 };
    const items = STEP_DEFS.map((s) => ({ ...s, done: !!done[s.key] }));

    const totalW = items.reduce((a, s) => a + s.weight, 0);
    const doneW  = items.reduce((a, s) => a + (s.done ? s.weight : 0), 0);
    const percent = totalW ? Math.round((doneW / totalW) * 100) : 0;
    const complete = items.every((s) => s.done);

    res.json({
      items, percent, complete, dismissed,
      // Backward-compatible with the old checklist shape.
      steps: done, counts: { revealed, crm, outreach },
    });
  } catch (e) { next(e); }
});

// Permanently dismiss the guide (upsert the flag; create the row if needed).
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
