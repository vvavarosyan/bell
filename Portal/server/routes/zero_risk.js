// /api/zero-risk (user) + /api/zero-risk-admin (admin) — the 0 Risk offering.
//
// User routes are gated by requireAuth ONLY (0 Risk accounts are authenticated
// but have NO paid subscription, so the normal `feature` subscription gate must
// not apply). Admin routes are mounted under the adminOnly gate in server.js.
// Everything is tenant-scoped via req.tenant.id.

import { Router } from 'express';
import {
  enroll, getStatus, profileCompleteness, saveDocument, submitForApproval,
  requestList, listRequests, reportDeal, listDeals, getAgreementTerms, switchToPaid,
  isProfileLocked, zrCompanyDetail, exportListCsv,
  adminPendingAccounts, adminAllAccounts, adminApprove, adminReject, adminRequestResubmission,
  adminPendingLists, adminDeliverList, adminFinalizeDeal, adminSetLimits, adminCounts, adminSearchCompanies,
} from '../lib/zerorisk.js';
import { query } from '../db.js';

const tid = (req) => req.tenant?.id;
const actor = (req) => req.user?.email || null;
// Admin routes take numeric ids in the path — reject junk up front instead of
// letting NaN reach the SQL layer (500s / phantom no-op successes).
const pathId = (v) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.floor(n) : null; };

// ---------------------------------------------------------------------------
// USER router
// ---------------------------------------------------------------------------
export const userRouter = Router();

userRouter.get('/status', async (req, res, next) => {
  try { if (!tid(req)) return res.status(401).json({ error: 'no_tenant' }); res.json(await getStatus(tid(req))); }
  catch (err) { next(err); }
});

userRouter.post('/enroll', async (req, res, next) => {
  try {
    if (!tid(req)) return res.status(401).json({ error: 'no_tenant' });
    res.json(await enroll(tid(req), actor(req)));
  } catch (err) {
    if (err.message === 'already_paid') return res.status(409).json({ error: 'already_paid' });
    next(err);
  }
});

// Reuses tenant_profile (the ICP builder's table). GET returns the full profile.
const PROFILE_COLS = ['company_name', 'company_overview', 'existing_customers', 'services_offered',
  'products_services', 'pricing_items', 'target_industries', 'target_sizes', 'target_titles',
  'target_keywords', 'target_tech_stack', 'target_has_website', 'icp_notes',
  'cr_number', 'cc_number', 'qid_number', 'contact_number', 'contact_email'];

userRouter.get('/profile', async (req, res, next) => {
  try {
    if (!tid(req)) return res.status(401).json({ error: 'no_tenant' });
    const p = (await query(`SELECT ${PROFILE_COLS.join(', ')} FROM tenant_profile WHERE tenant_id=$1`, [tid(req)])).rows[0] || {};
    res.json({ profile: p, completeness: await profileCompleteness(tid(req)) });
  } catch (err) { next(err); }
});

userRouter.put('/profile', async (req, res, next) => {
  try {
    if (!tid(req)) return res.status(401).json({ error: 'no_tenant' });
    // Post-signature lock: no profile changes after the signed agreement is
    // uploaded / the application is submitted — unless admin asked for a
    // resubmission (which reopens the form).
    if (await isProfileLocked(tid(req))) return res.status(409).json({ error: 'locked' });
    const b = req.body || {};
    const cols = [], vals = [tid(req)]; let i = 1;
    const set = (col, val) => { vals.push(val); cols.push(`${col}=$${++i}`); };
    if (b.company_name !== undefined)       set('company_name', String(b.company_name || '').slice(0, 300));
    if (b.company_overview !== undefined)   set('company_overview', String(b.company_overview || ''));
    if (b.existing_customers !== undefined) set('existing_customers', String(b.existing_customers || ''));
    if (b.products_services !== undefined)  set('products_services', String(b.products_services || ''));
    if (b.icp_notes !== undefined)          set('icp_notes', String(b.icp_notes || ''));
    if (b.target_has_website !== undefined) set('target_has_website', b.target_has_website || null);
    for (const s of ['cr_number', 'cc_number', 'qid_number', 'contact_number', 'contact_email']) {
      if (b[s] !== undefined) set(s, String(b[s] || '').slice(0, 120));
    }
    if (Array.isArray(b.services_offered))  set('services_offered', JSON.stringify(b.services_offered));
    if (Array.isArray(b.pricing_items))     set('pricing_items', JSON.stringify(b.pricing_items));
    for (const arr of ['target_industries', 'target_sizes', 'target_titles', 'target_keywords', 'target_tech_stack']) {
      if (Array.isArray(b[arr])) set(arr, b[arr]);
    }
    if (!cols.length) return res.json({ ok: true, noop: true });
    // services_offered / pricing_items are jsonb; arrays are text[]; cast in SQL.
    const jsonbCols = new Set(['services_offered', 'pricing_items']);
    const assigns = cols.map((c) => { const name = c.split('=')[0]; return jsonbCols.has(name) ? c + '::jsonb' : c; });
    await query(
      `INSERT INTO tenant_profile (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`, [tid(req)]);
    await query(`UPDATE tenant_profile SET ${assigns.join(', ')}, updated_at=now() WHERE tenant_id=$1`, vals);
    res.json({ ok: true, completeness: await profileCompleteness(tid(req)) });
  } catch (err) { next(err); }
});

userRouter.post('/documents', async (req, res, next) => {
  try {
    if (!tid(req)) return res.status(401).json({ error: 'no_tenant' });
    // No document changes while the application is under review / decided.
    // (During onboarding re-uploads are fine; resubmission reopens everything.)
    const st = (await query(`SELECT zero_risk_status FROM tenants WHERE id=$1`, [tid(req)])).rows[0]?.zero_risk_status;
    if (['pending_approval', 'approved', 'rejected'].includes(st)) return res.status(409).json({ error: 'locked' });
    const { kind, filename, mime_type, content_base64 } = req.body || {};
    if (!content_base64) return res.status(400).json({ error: 'no_content' });
    const buffer = Buffer.from(String(content_base64), 'base64');
    const row = await saveDocument({ tenantId: tid(req), kind, filename, mimeType: mime_type, buffer, actor: actor(req) });
    res.json({ ok: true, document: row });
  } catch (err) {
    if (['bad_kind', 'empty_file', 'file_too_large'].includes(err.message)) return res.status(400).json({ error: err.message });
    next(err);
  }
});

userRouter.post('/submit', async (req, res, next) => {
  try {
    if (!tid(req)) return res.status(401).json({ error: 'no_tenant' });
    res.json(await submitForApproval(tid(req)));
  } catch (err) {
    if (err.message === 'profile_incomplete') return res.status(400).json({ error: 'profile_incomplete' });
    if (err.message === 'documents_missing') return res.status(400).json({ error: 'documents_missing', missing: err.missing });
    next(err);
  }
});

userRouter.get('/agreement-terms', async (req, res, next) => {
  try { if (!tid(req)) return res.status(401).json({ error: 'no_tenant' }); res.json(await getAgreementTerms(tid(req))); }
  catch (err) { next(err); }
});

userRouter.post('/switch', async (req, res, next) => {
  try { if (!tid(req)) return res.status(401).json({ error: 'no_tenant' }); res.json(await switchToPaid(tid(req))); }
  catch (err) { next(err); }
});

userRouter.get('/list-requests', async (req, res, next) => {
  try { if (!tid(req)) return res.status(401).json({ error: 'no_tenant' }); res.json({ rows: await listRequests(tid(req)) }); }
  catch (err) { next(err); }
});

userRouter.post('/list-requests', async (req, res, next) => {
  try {
    if (!tid(req)) return res.status(401).json({ error: 'no_tenant' });
    res.json(await requestList(tid(req), actor(req)));
  } catch (err) {
    if (err.message === 'cannot_request') return res.status(409).json({ error: 'cannot_request', reason: err.reason });
    next(err);
  }
});

// Full dossier for ONE delivered company — the same drawer data paid users get,
// but gated to the tenant's delivered list items and returned unmasked.
userRouter.get('/companies/:id', async (req, res, next) => {
  try {
    if (!tid(req)) return res.status(401).json({ error: 'no_tenant' });
    const id = pathId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_id' });
    res.json(await zrCompanyDetail(tid(req), id));
  } catch (err) {
    if (err.message === 'not_in_list') return res.status(403).json({ error: 'not_in_list' });
    if (err.message === 'not_found') return res.status(404).json({ error: 'not_found' });
    next(err);
  }
});

// CSV export of one delivered list.
userRouter.get('/list-requests/:id/export.csv', async (req, res, next) => {
  try {
    if (!tid(req)) return res.status(401).json({ error: 'no_tenant' });
    const id = pathId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_id' });
    const { filename, csv } = await exportListCsv(tid(req), id);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    if (err.message === 'not_found') return res.status(404).json({ error: 'not_found' });
    next(err);
  }
});

userRouter.get('/deals', async (req, res, next) => {
  try { if (!tid(req)) return res.status(401).json({ error: 'no_tenant' }); res.json({ rows: await listDeals(tid(req)) }); }
  catch (err) { next(err); }
});

userRouter.post('/deals', async (req, res, next) => {
  try {
    if (!tid(req)) return res.status(401).json({ error: 'no_tenant' });
    const b = req.body || {};
    const d = await reportDeal({ tenantId: tid(req), requestId: b.request_id || null, companyId: b.company_id || null,
      userStatus: b.user_status || 'contacted', revenueAmount: b.revenue_amount ?? null, note: b.note || null, actor: actor(req) });
    res.json({ ok: true, deal: d });
  } catch (err) {
    if (err.message === 'bad_status') return res.status(400).json({ error: 'bad_status' });
    next(err);
  }
});

// ---------------------------------------------------------------------------
// ADMIN router (mounted under adminOnly in server.js)
// ---------------------------------------------------------------------------
export const adminRouter = Router();

adminRouter.get('/accounts', async (req, res, next) => {
  try { res.json({ rows: await adminPendingAccounts() }); } catch (err) { next(err); }
});
adminRouter.get('/accounts/all', async (req, res, next) => {
  try { res.json({ rows: await adminAllAccounts() }); } catch (err) { next(err); }
});
adminRouter.post('/accounts/:tenantId/approve', async (req, res, next) => {
  try {
    const id = pathId(req.params.tenantId);
    if (!id) return res.status(400).json({ error: 'bad_id' });
    res.json(await adminApprove(id, actor(req)));
  } catch (err) { if (err.message === 'not_found') return res.status(404).json({ error: 'not_found' }); next(err); }
});
adminRouter.post('/accounts/:tenantId/reject', async (req, res, next) => {
  try {
    const id = pathId(req.params.tenantId);
    if (!id) return res.status(400).json({ error: 'bad_id' });
    res.json(await adminReject(id, actor(req), req.body?.note || null, req.body?.reasons || []));
  } catch (err) { if (err.message === 'not_found') return res.status(404).json({ error: 'not_found' }); next(err); }
});
adminRouter.post('/accounts/:tenantId/resubmission', async (req, res, next) => {
  try {
    const id = pathId(req.params.tenantId);
    if (!id) return res.status(400).json({ error: 'bad_id' });
    res.json(await adminRequestResubmission(id, actor(req), req.body?.note || null, req.body?.reasons || []));
  } catch (err) { if (err.message === 'not_found') return res.status(404).json({ error: 'not_found' }); next(err); }
});
// Workload counts (sidebar badge + section headers).
adminRouter.get('/counts', async (req, res, next) => {
  try { res.json(await adminCounts()); } catch (err) { next(err); }
});
// Company search for list prep (name contains / exact id).
adminRouter.get('/companies', async (req, res, next) => {
  try { res.json({ rows: await adminSearchCompanies(req.query.q || '') }); } catch (err) { next(err); }
});
adminRouter.get('/lists', async (req, res, next) => {
  try { res.json({ rows: await adminPendingLists() }); } catch (err) { next(err); }
});
adminRouter.post('/lists/:id/deliver', async (req, res, next) => {
  try {
    const id = pathId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_id' });
    res.json(await adminDeliverList(id, req.body?.items || [], actor(req)));
  } catch (err) { if (err.message === 'not_found') return res.status(404).json({ error: 'not_found' }); next(err); }
});
adminRouter.get('/deals', async (req, res, next) => {
  try {
    const rows = (await query(`
      SELECT d.id, d.tenant_id, t.name AS tenant_name, d.company_id, c.name AS company_name,
             d.user_status, d.admin_status, d.revenue_amount, d.currency, d.note, d.updated_at
        FROM zero_risk_deals d JOIN tenants t ON t.id=d.tenant_id LEFT JOIN companies c ON c.id=d.company_id
       ORDER BY (d.admin_status='open') DESC, d.updated_at DESC LIMIT 500`)).rows;
    res.json({ rows });
  } catch (err) { next(err); }
});
adminRouter.post('/deals/:id/finalize', async (req, res, next) => {
  try {
    const id = pathId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_id' });
    res.json(await adminFinalizeDeal(id, req.body?.admin_status, actor(req)));
  } catch (err) { if (['bad_status', 'not_found'].includes(err.message)) return res.status(400).json({ error: err.message }); next(err); }
});
adminRouter.post('/limits/:tenantId', async (req, res, next) => {
  try {
    const id = pathId(req.params.tenantId);
    if (!id) return res.status(400).json({ error: 'bad_id' });
    res.json(await adminSetLimits(id,
      { companiesPerRequest: Number(req.body?.companies_per_request), listsAllowed: Number(req.body?.lists_allowed) }, actor(req)));
  } catch (err) { next(err); }
});

// View an uploaded document (admin reviewing CR/QID/signed agreement).
adminRouter.get('/documents/:id/content', async (req, res, next) => {
  try {
    const id = pathId(req.params.id);
    if (!id) return res.status(400).json({ error: 'bad_id' });
    const d = (await query(`SELECT filename, mime_type, content FROM zero_risk_documents WHERE id=$1`, [id])).rows[0];
    if (!d || !d.content) return res.status(404).json({ error: 'not_found' });
    res.setHeader('Content-Type', d.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${(d.filename || 'document').replace(/"/g, '')}"`);
    res.send(Buffer.from(d.content));
  } catch (err) { next(err); }
});

export default userRouter;
