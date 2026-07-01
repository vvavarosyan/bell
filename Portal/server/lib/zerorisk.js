// "0 Risk Agreement" offering — server logic (Phase 0/1).
//
// A 0 Risk company uses the same Bell login but in a restricted "0 Risk mode"
// (tenants.account_type = 'zero_risk'). It REUSES tenant_profile for the
// company/ICP intake (extended in migration 067) and adds documents, an
// agreement, list requests, deal tracking and admin-controlled limits.
//
// Decoupled from core auth: everything keys off tenant_id and reads
// account_type / zero_risk_status directly, so no change to the (delicate)
// auth resolution is required. Person-level data into Bell's shared DB stays
// out of scope here — 0 Risk only consumes Bell's company data.

import { query } from '../db.js';

export const REVENUE_SHARE_PCT = 15;          // placeholder, adjustable (migration default matches)
export const DEFAULT_LIST_SIZE = 100;
const DOC_KINDS = ['cr', 'qid', 'company_doc', 'signed_agreement'];
const REQUIRED_DOC_KINDS = ['cr', 'qid', 'signed_agreement'];   // company_doc optional in v1

// ---------------------------------------------------------------------------
// Enrolment + status
// ---------------------------------------------------------------------------

/** Flip the current tenant into 0 Risk mode (idempotent). Refuses a tenant that
 *  is already a paying customer. Seeds the limits + agreement rows. */
export async function enroll(tenantId, actor = null) {
  const t = (await query(`SELECT id, account_type, plan, subscription_status FROM tenants WHERE id=$1`, [tenantId])).rows[0];
  if (!t) throw new Error('no_tenant');
  if (t.account_type === 'zero_risk') return { ok: true, already: true };
  if (t.subscription_status === 'active' || (t.plan && !['free', 'internal'].includes(t.plan))) {
    throw new Error('already_paid');   // paying customers use the normal app, not 0 Risk
  }
  await query(`UPDATE tenants SET account_type='zero_risk', zero_risk_status='onboarding', updated_at=now() WHERE id=$1`, [tenantId]);
  await query(`INSERT INTO zero_risk_limits (tenant_id, updated_by) VALUES ($1,$2) ON CONFLICT (tenant_id) DO NOTHING`, [tenantId, actor]);
  await query(
    `INSERT INTO zero_risk_agreements (tenant_id, revenue_share_pct) SELECT $1,$2
       WHERE NOT EXISTS (SELECT 1 FROM zero_risk_agreements WHERE tenant_id=$1)`,
    [tenantId, REVENUE_SHARE_PCT],
  );
  return { ok: true, already: false };
}

/** Profile completeness for the onboarding meter. Returns { pct, missing[] }. */
export async function profileCompleteness(tenantId) {
  const p = (await query(`SELECT * FROM tenant_profile WHERE tenant_id=$1`, [tenantId])).rows[0] || {};
  const has = (v) => !!(v && String(v).trim());
  const checks = [
    ['Company name',        has(p.company_name)],
    ['Company overview',    has(p.company_overview)],
    ['Products / services', has(p.products_services) || (Array.isArray(p.services_offered) && p.services_offered.length > 0)],
    ['Existing customers',  has(p.existing_customers)],
    ['Pricing',             Array.isArray(p.pricing_items) && p.pricing_items.length > 0],
    ['Target industries',   Array.isArray(p.target_industries) && p.target_industries.length > 0],
    ['Target company size', Array.isArray(p.target_sizes) && p.target_sizes.length > 0],
    ['Decision-maker titles', Array.isArray(p.target_titles) && p.target_titles.length > 0],
    // Legal identifiers — required, and auto-filled into the agreement (migration 068).
    ['CR number',           has(p.cr_number)],
    ['Computer Card number', has(p.cc_number)],
    ['QID number',          has(p.qid_number)],
    ['Contact number',      has(p.contact_number)],
    ['Contact email',       has(p.contact_email)],
  ];
  const done = checks.filter(([, ok]) => ok).length;
  const pct = Math.round((done / checks.length) * 100);
  return { pct, missing: checks.filter(([, ok]) => !ok).map(([label]) => label) };
}

/** Full status object that drives the 0 Risk portal UI. */
export async function getStatus(tenantId) {
  const t = (await query(`SELECT account_type, zero_risk_status FROM tenants WHERE id=$1`, [tenantId])).rows[0] || {};
  const completeness = await profileCompleteness(tenantId);
  const docs = (await query(`SELECT kind, status, filename, uploaded_at FROM zero_risk_documents WHERE tenant_id=$1 ORDER BY uploaded_at DESC`, [tenantId])).rows;
  const docByKind = {};
  for (const d of docs) if (!docByKind[d.kind]) docByKind[d.kind] = d;   // newest per kind
  const agreement = (await query(`SELECT id, status, revenue_share_pct, signed_document_id FROM zero_risk_agreements WHERE tenant_id=$1 ORDER BY id DESC LIMIT 1`, [tenantId])).rows[0] || null;
  const limits = (await query(`SELECT companies_per_request, lists_allowed, finalized_won_count FROM zero_risk_limits WHERE tenant_id=$1`, [tenantId])).rows[0]
    || { companies_per_request: DEFAULT_LIST_SIZE, lists_allowed: 1, finalized_won_count: 0 };
  const openReq = (await query(`SELECT id, seq, size, status FROM zero_risk_list_requests WHERE tenant_id=$1 AND status IN ('pending','preparing') ORDER BY seq DESC LIMIT 1`, [tenantId])).rows[0] || null;
  const gate = await canRequestList(tenantId);
  return {
    account_type: t.account_type || 'standard',
    zero_risk_status: t.zero_risk_status || null,
    revenue_share_pct: agreement?.revenue_share_pct ?? REVENUE_SHARE_PCT,
    completeness,
    agreement_ready: completeness.pct === 100,   // the agreement unlocks at 100% (incl. legal identifiers)
    documents: DOC_KINDS.map((k) => ({ kind: k, required: REQUIRED_DOC_KINDS.includes(k), ...(docByKind[k] || { status: 'missing' }) })),
    agreement,
    limits,
    open_request: openReq,
    can_request_list: gate.ok,
    request_block_reason: gate.reason || null,
  };
}

// ---------------------------------------------------------------------------
// Documents + agreement
// ---------------------------------------------------------------------------

export async function saveDocument({ tenantId, kind, filename, mimeType, buffer, actor }) {
  if (!DOC_KINDS.includes(kind)) throw new Error('bad_kind');
  if (!buffer || !buffer.length) throw new Error('empty_file');
  if (buffer.length > 7 * 1024 * 1024) throw new Error('file_too_large');   // 7MB raw (~9.3MB base64, under the 10mb JSON limit)
  const r = await query(
    `INSERT INTO zero_risk_documents (tenant_id, kind, filename, mime_type, byte_size, content, uploaded_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, kind, filename, status, uploaded_at`,
    [tenantId, kind, filename || null, mimeType || null, buffer.length, buffer, actor],
  );
  // A freshly uploaded signed agreement links to the agreement record.
  if (kind === 'signed_agreement') {
    await query(`UPDATE zero_risk_agreements SET signed_document_id=$2, status='submitted', submitted_at=now()
                  WHERE tenant_id=$1 AND id=(SELECT id FROM zero_risk_agreements WHERE tenant_id=$1 ORDER BY id DESC LIMIT 1)`,
      [tenantId, r.rows[0].id]);
  }
  return r.rows[0];
}

/** Submit the whole application for admin approval. Requires a complete profile,
 *  the required documents, and a signed agreement upload. */
export async function submitForApproval(tenantId) {
  const c = await profileCompleteness(tenantId);
  if (c.pct < 100) throw new Error('profile_incomplete');
  const have = new Set((await query(`SELECT DISTINCT kind FROM zero_risk_documents WHERE tenant_id=$1`, [tenantId])).rows.map((r) => r.kind));
  const missingDocs = REQUIRED_DOC_KINDS.filter((k) => !have.has(k));
  if (missingDocs.length) { const e = new Error('documents_missing'); e.missing = missingDocs; throw e; }
  await query(`UPDATE tenants SET zero_risk_status='pending_approval', updated_at=now() WHERE id=$1 AND account_type='zero_risk'`, [tenantId]);
  return { ok: true, status: 'pending_approval' };
}

/** Data for the in-portal agreement review — auto-filled with the company's own
 *  details so the user reviews the exact terms (their CR/CC/QID/contact) before
 *  signing & stamping. Mirrors what will appear on the document they receive. */
export async function getAgreementTerms(tenantId) {
  const p = (await query(`SELECT company_name, cr_number, cc_number, qid_number, contact_number, contact_email FROM tenant_profile WHERE tenant_id=$1`, [tenantId])).rows[0] || {};
  const a = (await query(`SELECT revenue_share_pct, jurisdiction, status FROM zero_risk_agreements WHERE tenant_id=$1 ORDER BY id DESC LIMIT 1`, [tenantId])).rows[0] || {};
  return {
    company_name: p.company_name || null,
    cr_number: p.cr_number || null, cc_number: p.cc_number || null, qid_number: p.qid_number || null,
    contact_number: p.contact_number || null, contact_email: p.contact_email || null,
    revenue_share_pct: a.revenue_share_pct ?? REVENUE_SHARE_PCT,
    jurisdiction: a.jurisdiction || 'State of Qatar',
    status: a.status || 'presented',
  };
}

/** User elects to move from 0 Risk to a normal (paid) Bell account. Flips the
 *  account type so the app stops diverting them to the 0 Risk portal (their 0
 *  Risk history is retained). They still complete the /subscribe flow to unlock
 *  the full product. */
export async function switchToPaid(tenantId) {
  await query(`UPDATE tenants SET account_type='standard', updated_at=now() WHERE id=$1 AND account_type='zero_risk'`, [tenantId]);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// List requests + gating
// ---------------------------------------------------------------------------

/** Whether this tenant may request a list right now (the control rules). */
export async function canRequestList(tenantId) {
  const t = (await query(`SELECT zero_risk_status FROM tenants WHERE id=$1`, [tenantId])).rows[0] || {};
  if (t.zero_risk_status !== 'approved') return { ok: false, reason: 'not_approved' };
  const open = (await query(`SELECT 1 FROM zero_risk_list_requests WHERE tenant_id=$1 AND status IN ('pending','preparing') LIMIT 1`, [tenantId])).rows.length;
  if (open) return { ok: false, reason: 'request_outstanding' };
  const lim = (await query(`SELECT lists_allowed FROM zero_risk_limits WHERE tenant_id=$1`, [tenantId])).rows[0];
  if (!lim || lim.lists_allowed <= 0) return { ok: false, reason: 'no_allowance' };
  return { ok: true };
}

/** Create a list request (consumes one allowance). */
export async function requestList(tenantId, actor = null) {
  const gate = await canRequestList(tenantId);
  if (!gate.ok) { const e = new Error('cannot_request'); e.reason = gate.reason; throw e; }
  const size = (await query(`SELECT companies_per_request FROM zero_risk_limits WHERE tenant_id=$1`, [tenantId])).rows[0]?.companies_per_request || DEFAULT_LIST_SIZE;
  const seq = ((await query(`SELECT COALESCE(MAX(seq),0) AS m FROM zero_risk_list_requests WHERE tenant_id=$1`, [tenantId])).rows[0].m) + 1;
  const r = await query(
    `INSERT INTO zero_risk_list_requests (tenant_id, seq, size, status, requested_by) VALUES ($1,$2,$3,'pending',$4) RETURNING id, seq, size, status, requested_at`,
    [tenantId, seq, size, actor],
  );
  await query(`UPDATE zero_risk_limits SET lists_allowed = GREATEST(lists_allowed-1,0), updated_at=now() WHERE tenant_id=$1`, [tenantId]);
  return r.rows[0];
}

/** This tenant's list requests + (for delivered ones) their dossiers. */
export async function listRequests(tenantId) {
  const reqs = (await query(`SELECT id, seq, size, status, note, requested_at, delivered_at FROM zero_risk_list_requests WHERE tenant_id=$1 ORDER BY seq DESC`, [tenantId])).rows;
  for (const rq of reqs) {
    if (rq.status === 'delivered') {
      rq.items = (await query(
        `SELECT li.id, li.company_id, li.dossier, c.name AS company_name
           FROM zero_risk_list_items li LEFT JOIN companies c ON c.id = li.company_id
          WHERE li.request_id=$1 ORDER BY li.id`, [rq.id])).rows;
    }
  }
  return reqs;
}

// ---------------------------------------------------------------------------
// Deals (user reports; only admin finalizes)
// ---------------------------------------------------------------------------

export async function reportDeal({ tenantId, requestId = null, companyId = null, userStatus = 'contacted', revenueAmount = null, note = null, actor = null }) {
  const valid = ['contacted', 'negotiating', 'won', 'lost'];
  if (!valid.includes(userStatus)) throw new Error('bad_status');
  // One deal per (tenant, company): update if it exists, else insert.
  const ex = companyId ? (await query(`SELECT id FROM zero_risk_deals WHERE tenant_id=$1 AND company_id=$2 LIMIT 1`, [tenantId, companyId])).rows[0] : null;
  if (ex) {
    const r = await query(`UPDATE zero_risk_deals SET user_status=$2, revenue_amount=COALESCE($3,revenue_amount), note=COALESCE($4,note), updated_at=now() WHERE id=$1 RETURNING *`,
      [ex.id, userStatus, revenueAmount, note]);
    return r.rows[0];
  }
  const r = await query(
    `INSERT INTO zero_risk_deals (tenant_id, request_id, company_id, user_status, revenue_amount, note, reported_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
    [tenantId, requestId, companyId, userStatus, revenueAmount, note, actor],
  );
  return r.rows[0];
}

export async function listDeals(tenantId) {
  return (await query(
    `SELECT d.id, d.company_id, d.user_status, d.admin_status, d.revenue_amount, d.currency, d.note, d.updated_at, c.name AS company_name
       FROM zero_risk_deals d LEFT JOIN companies c ON c.id=d.company_id
      WHERE d.tenant_id=$1 ORDER BY d.updated_at DESC`, [tenantId])).rows;
}

// ---------------------------------------------------------------------------
// ADMIN (admin.bell.qa / local engine) — approvals, list prep, finalization
// ---------------------------------------------------------------------------

/** ALL 0 Risk accounts (not just pending) with status, limits + quick counts. */
export async function adminAllAccounts() {
  return (await query(`
    SELECT t.id AS tenant_id, t.name, t.zero_risk_status,
           COALESCE(l.companies_per_request,100) AS companies_per_request,
           COALESCE(l.lists_allowed,0)          AS lists_allowed,
           COALESCE(l.finalized_won_count,0)    AS finalized_won_count,
           (SELECT count(*) FROM zero_risk_list_requests r WHERE r.tenant_id=t.id) AS list_count,
           (SELECT count(*) FROM zero_risk_deals d WHERE d.tenant_id=t.id AND d.admin_status='finalized_won') AS wins
      FROM tenants t
      LEFT JOIN zero_risk_limits l ON l.tenant_id=t.id
     WHERE t.account_type='zero_risk'
     ORDER BY t.updated_at DESC`)).rows;
}

export async function adminPendingAccounts() {
  return (await query(`
    SELECT t.id AS tenant_id, t.name, t.zero_risk_status,
           a.status AS agreement_status, a.signed_document_id,
           (SELECT count(*) FROM zero_risk_documents d WHERE d.tenant_id=t.id) AS doc_count
      FROM tenants t
      LEFT JOIN LATERAL (SELECT status, signed_document_id FROM zero_risk_agreements WHERE tenant_id=t.id ORDER BY id DESC LIMIT 1) a ON true
     WHERE t.account_type='zero_risk' AND t.zero_risk_status='pending_approval'
     ORDER BY t.updated_at ASC`)).rows;
}

export async function adminApprove(tenantId, by) {
  await query(`UPDATE tenants SET zero_risk_status='approved', updated_at=now() WHERE id=$1 AND account_type='zero_risk'`, [tenantId]);
  await query(`UPDATE zero_risk_agreements SET status='approved', approved_by=$2, approved_at=now() WHERE tenant_id=$1 AND id=(SELECT id FROM zero_risk_agreements WHERE tenant_id=$1 ORDER BY id DESC LIMIT 1)`, [tenantId, by]);
  await query(`INSERT INTO zero_risk_limits (tenant_id, lists_allowed, updated_by) VALUES ($1,1,$2)
                ON CONFLICT (tenant_id) DO UPDATE SET lists_allowed=GREATEST(zero_risk_limits.lists_allowed,1), updated_at=now()`, [tenantId, by]);
  return { ok: true, status: 'approved' };
}

export async function adminReject(tenantId, by, note = null) {
  await query(`UPDATE tenants SET zero_risk_status='onboarding', updated_at=now() WHERE id=$1 AND account_type='zero_risk'`, [tenantId]);
  await query(`UPDATE zero_risk_agreements SET status='rejected' WHERE tenant_id=$1 AND id=(SELECT id FROM zero_risk_agreements WHERE tenant_id=$1 ORDER BY id DESC LIMIT 1)`, [tenantId]);
  return { ok: true, status: 'onboarding', note };
}

export async function adminPendingLists() {
  return (await query(`
    SELECT r.id, r.tenant_id, t.name AS tenant_name, r.seq, r.size, r.status, r.requested_at
      FROM zero_risk_list_requests r JOIN tenants t ON t.id=r.tenant_id
     WHERE r.status IN ('pending','preparing') ORDER BY r.requested_at ASC`)).rows;
}

/** Deliver a prepared list: store the company dossiers + mark delivered. */
export async function adminDeliverList(requestId, items, by) {
  const req = (await query(`SELECT id, tenant_id, status FROM zero_risk_list_requests WHERE id=$1`, [requestId])).rows[0];
  if (!req) throw new Error('not_found');
  if (req.status === 'delivered') return { ok: true, already: true };
  for (const it of (items || [])) {
    await query(`INSERT INTO zero_risk_list_items (request_id, tenant_id, company_id, dossier) VALUES ($1,$2,$3,$4::jsonb)`,
      [requestId, req.tenant_id, it.company_id || null, JSON.stringify(it.dossier || {})]);
  }
  await query(`UPDATE zero_risk_list_requests SET status='delivered', prepared_by=$2, delivered_at=now() WHERE id=$1`, [requestId, by]);
  return { ok: true, delivered: (items || []).length };
}

/** Finalize a deal. A finalized win earns +1 list allowance (the spec's
 *  "close 1 → request 1 more"); admin can grant more via adminSetLimits. */
export async function adminFinalizeDeal(dealId, adminStatus, by) {
  if (!['finalized_won', 'finalized_lost', 'open'].includes(adminStatus)) throw new Error('bad_status');
  const d = (await query(`SELECT id, tenant_id, admin_status FROM zero_risk_deals WHERE id=$1`, [dealId])).rows[0];
  if (!d) throw new Error('not_found');
  await query(`UPDATE zero_risk_deals SET admin_status=$2, finalized_by=$3, finalized_at=now(), updated_at=now() WHERE id=$1`, [dealId, adminStatus, by]);
  if (adminStatus === 'finalized_won' && d.admin_status !== 'finalized_won') {
    await query(`INSERT INTO zero_risk_limits (tenant_id, lists_allowed, finalized_won_count, updated_by)
                 VALUES ($1,1,1,$2)
                 ON CONFLICT (tenant_id) DO UPDATE SET lists_allowed = zero_risk_limits.lists_allowed+1,
                   finalized_won_count = zero_risk_limits.finalized_won_count+1, updated_at=now()`, [d.tenant_id, by]);
  }
  return { ok: true, admin_status: adminStatus };
}

export async function adminSetLimits(tenantId, { companiesPerRequest, listsAllowed }, by) {
  const sets = [], params = [tenantId]; let i = 1;
  if (Number.isFinite(companiesPerRequest)) { params.push(Math.max(1, Math.floor(companiesPerRequest))); sets.push(`companies_per_request=$${++i}`); }
  if (Number.isFinite(listsAllowed))        { params.push(Math.max(0, Math.floor(listsAllowed)));        sets.push(`lists_allowed=$${++i}`); }
  if (!sets.length) return { ok: true, noop: true };
  params.push(by);
  await query(`INSERT INTO zero_risk_limits (tenant_id) VALUES ($1) ON CONFLICT (tenant_id) DO NOTHING`, [tenantId]);
  await query(`UPDATE zero_risk_limits SET ${sets.join(', ')}, updated_by=$${++i}, updated_at=now() WHERE tenant_id=$1`, params);
  return { ok: true };
}
