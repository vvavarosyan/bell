// Contributed datapoints (Import Phase 2, Layer 1).
//
// Users add datapoints to any CRM record's entity (company/person). Each row is
// BOTH the user's private overlay (they see their own) AND the admin review pool.
// We capture EVERYTHING (Val's model) but FLAG junk via the existing data-quality
// validators so the admin (Layer 2) isn't flooded. Promotion to canonical is a
// later, admin-gated step. Tenant-scoped throughout.

import { query } from '../db.js';
import { isValidPhone, normalizePhone, cleanWebsiteUrl, parseSocialUrl, looksLikeName } from './dataquality.js';
import { upsertContact } from './contacts.js';
import { normalizeName } from '../ingest/normalize.js';
import { recomputeBellScoreForCompany } from '../assembly/bell_score.js';
import { ensureCrmRecord } from './crm.js';

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Datapoint types a user may add. Free-text ones (address/title/note/custom) are
// always accepted; typed ones are format-validated for the admin's benefit.
export const DATAPOINT_FIELDS = ['phone', 'email', 'website', 'address', 'social', 'name', 'title', 'note', 'custom'];

/**
 * Lightweight per-field validation → { ok, reason?, normalized? }. Flags junk for
 * the admin pool but NEVER blocks capture — we collect everything the user adds.
 */
export function validateDatapoint(field, value) {
  const v = String(value || '').trim();
  if (!v) return { ok: false, reason: 'empty' };
  try {
    switch (field) {
      case 'email':   return EMAIL_RX.test(v) ? { ok: true } : { ok: false, reason: 'bad_email' };
      case 'phone':   return isValidPhone(v, 'QA') ? { ok: true, normalized: normalizePhone(v, 'QA') } : { ok: false, reason: 'bad_phone' };
      case 'website': { const c = cleanWebsiteUrl(v); return c ? { ok: true, normalized: c } : { ok: false, reason: 'bad_website' }; }
      case 'social':  { const s = parseSocialUrl(v); return s ? { ok: true } : { ok: false, reason: 'bad_social' }; }
      case 'name':    return looksLikeName(v) ? { ok: true } : { ok: false, reason: 'bad_name' };
      default:        return { ok: true };   // address / title / note / custom — free text
    }
  } catch { return { ok: true }; }            // never let a validator throw block capture
}

/** Add a datapoint to a record's canonical entity (private overlay + admin pool). */
export async function addDatapoint({ tenantId, entityType, entityId, field, value, label = null, createdBy = null, source = 'crm_add', importBatchId = null }) {
  if (!tenantId || !entityType || !entityId || !field) throw new Error('missing_fields');
  if (!DATAPOINT_FIELDS.includes(field)) throw new Error('bad_field');
  if (entityType !== 'company' && entityType !== 'person') throw new Error('bad_entity_type');
  const v = String(value || '').trim();
  if (!v) throw new Error('empty_value');

  const validation = validateDatapoint(field, v);
  const ins = await query(`
    INSERT INTO contributed_datapoints
      (tenant_id, entity_type, entity_id, field, label, value, source, import_batch_id, validation, created_by)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)
    ON CONFLICT (tenant_id, entity_type, entity_id, field, value) DO NOTHING
    RETURNING id, field, label, value, status, validation, created_by, created_at
  `, [tenantId, entityType, Number(entityId), field, label, v, source, importBatchId, JSON.stringify(validation), createdBy]);

  if (ins.rows.length) return ins.rows[0];
  // Identical datapoint already captured — return it (idempotent).
  const ex = await query(
    `SELECT id, field, label, value, status, validation, created_by, created_at
       FROM contributed_datapoints
      WHERE tenant_id=$1 AND entity_type=$2 AND entity_id=$3 AND field=$4 AND value=$5`,
    [tenantId, entityType, Number(entityId), field, v],
  );
  return { ...ex.rows[0], duplicate: true };
}

/** A tenant's datapoints for one record's entity (their private overlay). */
export async function listDatapoints({ tenantId, entityType, entityId }) {
  const r = await query(`
    SELECT id, field, label, value, status, validation, created_by, created_at, decided_at
      FROM contributed_datapoints
     WHERE tenant_id=$1 AND entity_type=$2 AND entity_id=$3
     ORDER BY created_at DESC
  `, [tenantId, entityType, Number(entityId)]);
  return r.rows;
}

/** Delete a tenant's OWN datapoint. Does not touch any value already promoted to
 *  canonical (promotion is a separate copy). Pending pool row simply disappears. */
export async function deleteDatapoint({ tenantId, id }) {
  const r = await query(`DELETE FROM contributed_datapoints WHERE id=$1 AND tenant_id=$2 RETURNING id`, [Number(id), tenantId]);
  return r.rows.length > 0;
}

// ---------------------------------------------------------------------------
// NEW-ENTITY CAPTURE — a user adds a brand-new company/person Bell doesn't have.
// SAFE: stored as a tenant-private PROPOSAL in imported_records (no canonical
// write at all). It enters the admin pool (enrich_status='pending_review'); the
// admin's promote-creates-canonical is a separate, audited step. Captures 100%.
// ---------------------------------------------------------------------------

/** Capture a new company/person the user added to their CRM as a private,
 *  pending-review proposal. Never writes canonical. Returns the stored row. */
export async function addNewEntity({ tenantId, kind, name, company = null, email = null, phone = null, website = null, city = null, title = null, notes = null, createdBy = null }) {
  if (!tenantId) throw new Error('no_tenant');
  const nm = String(name || '').trim();
  if (!nm) throw new Error('name_required');
  const k = kind === 'company' ? 'company' : 'contact';   // imported_records kinds
  const r = await query(`
    INSERT INTO imported_records
      (tenant_id, batch_id, kind, name, email, phone, company_name, title, website, city, notes, raw, enrich_status, created_by)
    VALUES ($1, NULL, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, 'pending_review', $12)
    RETURNING id, kind, name, enrich_status, created_at
  `, [tenantId, k, nm, email, phone, company, title, website, city, notes,
      JSON.stringify({ source: 'crm_add' }), createdBy]);
  return r.rows[0];
}

// ---------------------------------------------------------------------------
// ADMIN CURATION (Layer 2) — local engine only (canonical mutation). The admin
// reviews the pool and promotes datapoints into Bell's canonical DB or rejects
// them. Person→canonical promotion is LAWYER-GATED behind a setting (default off).
// ---------------------------------------------------------------------------

/** Is admin promotion of PERSON datapoints into canonical enabled? Default OFF
 *  (Qatar PDPPL — person data into the shared DB needs the lawyer's sign-off). */
export async function peopleEnrichEnabled() {
  const r = await query(`SELECT value FROM settings WHERE key='enrich_people_enabled'`).catch(() => ({ rows: [] }));
  const v = String(r.rows[0]?.value || '').toLowerCase();
  return v === 'true' || v === '1' || v === 'on';
}

/** The admin review pool, joined to its target entity + contributor. Valid rows
 *  first, junk-flagged last; newest within each. */
export async function listPool({ status = 'pending', entityType = null, limit = 200, offset = 0 } = {}) {
  const where = ['1=1'];
  const params = [];
  if (status && status !== 'all') { params.push(status); where.push(`d.status = $${params.length}`); }
  if (entityType === 'company' || entityType === 'person') { params.push(entityType); where.push(`d.entity_type = $${params.length}`); }
  const whereSql = where.join(' AND ');

  const total = (await query(`SELECT count(*)::int AS n FROM contributed_datapoints d WHERE ${whereSql}`, params)).rows[0].n;

  params.push(limit, offset);
  const rows = (await query(`
    SELECT d.id, d.tenant_id, d.entity_type, d.entity_id, d.field, d.label, d.value, d.source,
           d.status, d.validation, d.created_by, d.created_at, d.decided_by, d.decided_at,
           c.name AS company_name, c.bin AS company_bin,
           p.full_name AS person_name, p.pin AS person_pin,
           t.name AS contributor_name
      FROM contributed_datapoints d
      LEFT JOIN companies c ON d.entity_type='company' AND c.id=d.entity_id
      LEFT JOIN people    p ON d.entity_type='person'  AND p.id=d.entity_id
      LEFT JOIN tenants   t ON t.id=d.tenant_id
     WHERE ${whereSql}
     ORDER BY ((d.validation->>'ok')='false') ASC, d.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params)).rows;
  return { rows, total };
}

/** Counts for the admin header. */
export async function poolCounts() {
  const r = await query(`
    SELECT count(*) FILTER (WHERE status='pending')::int AS pending,
           count(*) FILTER (WHERE status='pending' AND entity_type='company')::int AS pending_company,
           count(*) FILTER (WHERE status='pending' AND entity_type='person')::int AS pending_person,
           count(*) FILTER (WHERE status='pending' AND (validation->>'ok')='false')::int AS pending_flagged
      FROM contributed_datapoints`);
  return r.rows[0] || {};
}

/**
 * Promote a pending datapoint into the canonical DB (LOCAL engine). Additive +
 * non-destructive: contacts (email/phone/social) are upserted into the contact
 * tables; website/address fill a blank column only; everything else is appended
 * to the entity's extra_fields.contributed[] bucket so nothing is lost and nothing
 * trusted is overwritten. Person promotion is blocked unless the lawyer-gate
 * setting is on. Writes an enrichment_audit row. The canonical change then rides
 * the existing mirror-sync to prod.
 */
export async function promoteDatapoint({ id, decidedBy = 'admin' }) {
  const dp = (await query(`SELECT * FROM contributed_datapoints WHERE id=$1`, [Number(id)])).rows[0];
  if (!dp) throw new Error('not_found');
  if (dp.status !== 'pending') return { id: dp.id, status: dp.status, noop: true };
  if (dp.entity_type === 'person' && !(await peopleEnrichEnabled())) throw new Error('person_gated');

  const eid = Number(dp.entity_id);
  let oldValue = null;

  if (dp.entity_type === 'company') {
    if (dp.field === 'email' || dp.field === 'phone' || dp.field === 'social') {
      await upsertContact('company', eid, { type: dp.field, value: dp.value, value_display: dp.value, source: 'contributed' });
    } else if (dp.field === 'website') {
      const cur = (await query(`SELECT website FROM companies WHERE id=$1`, [eid])).rows[0];
      oldValue = cur?.website || null;
      await query(`UPDATE companies SET website=$2 WHERE id=$1 AND (website IS NULL OR btrim(website)='')`, [eid, dp.value]);
    } else if (dp.field === 'address') {
      const cur = (await query(`SELECT address FROM companies WHERE id=$1`, [eid])).rows[0];
      oldValue = cur?.address || null;
      await query(`UPDATE companies SET address=$2 WHERE id=$1 AND (address IS NULL OR btrim(address)='')`, [eid, dp.value]);
    } else {
      await query(`UPDATE companies SET extra_fields = jsonb_set(extra_fields,'{contributed}',
        coalesce(extra_fields->'contributed','[]'::jsonb) || $2::jsonb, true) WHERE id=$1`,
        [eid, JSON.stringify([{ field: dp.field, label: dp.label, value: dp.value, by: dp.tenant_id, at: new Date().toISOString() }])]);
    }
  } else { // person — already gated above
    if (dp.field === 'email' || dp.field === 'phone') {
      await upsertContact('person', eid, { type: dp.field, value: dp.value, value_display: dp.value, source: 'contributed' });
    } else {
      await query(`UPDATE people SET extra_fields = jsonb_set(extra_fields,'{contributed}',
        coalesce(extra_fields->'contributed','[]'::jsonb) || $2::jsonb, true) WHERE id=$1`,
        [eid, JSON.stringify([{ field: dp.field, label: dp.label, value: dp.value, by: dp.tenant_id, at: new Date().toISOString() }])]);
    }
  }

  await query(`UPDATE contributed_datapoints SET status='promoted', decided_by=$2, decided_at=now() WHERE id=$1`, [dp.id, decidedBy]);
  await query(`INSERT INTO enrichment_audit (datapoint_id, entity_type, entity_id, field, old_value, new_value, contributor_tenant, decided_by, action)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'promote')`,
    [dp.id, dp.entity_type, eid, dp.field, oldValue, dp.value, dp.tenant_id, decidedBy]);
  return { id: dp.id, status: 'promoted' };
}

/** Reject a pending datapoint — it never enters canonical (the contributing user
 *  still sees it as 'rejected' in their own overlay). Audited. */
export async function rejectDatapoint({ id, decidedBy = 'admin' }) {
  const dp = (await query(`SELECT id, entity_type, entity_id, field, value, tenant_id, status FROM contributed_datapoints WHERE id=$1`, [Number(id)])).rows[0];
  if (!dp) throw new Error('not_found');
  if (dp.status !== 'pending') return { id: dp.id, status: dp.status, noop: true };
  await query(`UPDATE contributed_datapoints SET status='rejected', decided_by=$2, decided_at=now() WHERE id=$1`, [dp.id, decidedBy]);
  await query(`INSERT INTO enrichment_audit (datapoint_id, entity_type, entity_id, field, new_value, contributor_tenant, decided_by, action)
               VALUES ($1,$2,$3,$4,$5,$6,$7,'reject')`,
    [dp.id, dp.entity_type, Number(dp.entity_id), dp.field, dp.value, dp.tenant_id, decidedBy]);
  return { id: dp.id, status: 'rejected' };
}

// ---------------------------------------------------------------------------
// NEW-ENTITY admin review (Layer 2 cont.) — proposals captured in
// imported_records (user "+ New" adds + CSV import rows). Admin promotes a
// proposal into canonical: a same-name company is LINKED (no duplicate),
// otherwise a new company is CREATED. People are lawyer-gated. Local engine only.
// ---------------------------------------------------------------------------

/** Map imported_records.kind → entity type. */
const irEntity = (kind) => (kind === 'company' ? 'company' : 'person');

/** Pending/decided new-entity proposals, with contributor name. */
export async function listNewEntities({ status = 'pending_review', kind = null, limit = 200, offset = 0 } = {}) {
  const where = ['1=1'];
  const params = [];
  if (status && status !== 'all') { params.push(status); where.push(`r.enrich_status = $${params.length}`); }
  if (kind === 'company' || kind === 'contact') { params.push(kind); where.push(`r.kind = $${params.length}`); }
  const whereSql = where.join(' AND ');
  const total = (await query(`SELECT count(*)::int AS n FROM imported_records r WHERE ${whereSql}`, params)).rows[0].n;
  params.push(limit, offset);
  const rows = (await query(`
    SELECT r.id, r.tenant_id, r.kind, r.name, r.company_name, r.email, r.phone, r.website, r.city, r.title,
           r.enrich_status, r.matched_entity_type, r.matched_entity_id, r.created_by, r.created_at,
           t.name AS contributor_name
      FROM imported_records r
      LEFT JOIN tenants t ON t.id = r.tenant_id
     WHERE ${whereSql}
     ORDER BY r.created_at DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}
  `, params)).rows;
  return { rows, total };
}

/** Counts for the new-entity header. */
export async function newEntityCounts() {
  const r = await query(`
    SELECT count(*) FILTER (WHERE enrich_status='pending_review')::int AS pending,
           count(*) FILTER (WHERE enrich_status='pending_review' AND kind='company')::int AS pending_company,
           count(*) FILTER (WHERE enrich_status='pending_review' AND kind<>'company')::int AS pending_person
      FROM imported_records`);
  return r.rows[0] || {};
}

/**
 * Promote a new-entity proposal into canonical. COMPANY: link an existing
 * same-normalized-name Qatar company if one exists (no duplicate), else CREATE a
 * new company; attach the proposal's email/phone; add it to the contributor's
 * CRM. PERSON: lawyer-gated. Audited. Local engine only.
 */
export async function promoteNewEntity({ id, decidedBy = 'admin' }) {
  const ir = (await query(`SELECT * FROM imported_records WHERE id=$1`, [Number(id)])).rows[0];
  if (!ir) throw new Error('not_found');
  if (ir.enrich_status !== 'pending_review') return { id: ir.id, status: ir.enrich_status, noop: true };
  const entityType = irEntity(ir.kind);
  if (entityType === 'person' && !(await peopleEnrichEnabled())) throw new Error('person_gated');

  let entityId = null, created = false;

  if (entityType === 'company') {
    const nn = normalizeName(ir.name);
    const existing = (await query(
      `SELECT id FROM companies WHERE name_normalized=$1 AND COALESCE(archived,false)=false ORDER BY id LIMIT 1`, [nn],
    )).rows[0];
    if (existing) { entityId = existing.id; }
    else {
      const ins = await query(
        `INSERT INTO companies (name, name_normalized, website, country, is_active, archived, status_normalized, extra_fields)
         VALUES ($1,$2,$3,'Qatar',true,false,'active',$4::jsonb) RETURNING id`,
        [ir.name, nn, ir.website || null, JSON.stringify({ created_via: 'user_contributed', contributor_tenant: ir.tenant_id })],
      );
      entityId = ins.rows[0].id; created = true;
      await recomputeBellScoreForCompany(entityId).catch(() => {});
    }
    if (ir.email) await upsertContact('company', entityId, { type: 'email', value: ir.email, value_display: ir.email, source: 'contributed' }).catch(() => {});
    if (ir.phone) await upsertContact('company', entityId, { type: 'phone', value: ir.phone, value_display: ir.phone, source: 'contributed' }).catch(() => {});
  } else { // person (gated above)
    const ins = await query(
      `INSERT INTO people (full_name, extra_fields) VALUES ($1,$2::jsonb) RETURNING id`,
      [ir.name, JSON.stringify({ created_via: 'user_contributed', contributor_tenant: ir.tenant_id, company_hint: ir.company_name || null })],
    );
    entityId = ins.rows[0].id; created = true;
    if (ir.email) await upsertContact('person', entityId, { type: 'email', value: ir.email, value_display: ir.email, source: 'contributed' }).catch(() => {});
    if (ir.phone) await upsertContact('person', entityId, { type: 'phone', value: ir.phone, value_display: ir.phone, source: 'contributed' }).catch(() => {});
  }

  // Add the now-canonical entity to the contributor's CRM (best-effort).
  await ensureCrmRecord(null, ir.tenant_id, entityType, entityId, 'import', decidedBy).catch(() => {});

  await query(`UPDATE imported_records SET enrich_status='promoted', matched_entity_type=$2, matched_entity_id=$3 WHERE id=$1`,
    [ir.id, entityType, entityId]);
  await query(`INSERT INTO enrichment_audit (datapoint_id, entity_type, entity_id, field, new_value, contributor_tenant, decided_by, action)
               VALUES (NULL,$1,$2,'__new_entity__',$3,$4,$5,'promote')`,
    [entityType, entityId, ir.name, ir.tenant_id, decidedBy]);
  return { id: ir.id, status: 'promoted', entity_type: entityType, entity_id: entityId, created };
}

/** Reject a new-entity proposal — it never enters canonical. */
export async function rejectNewEntity({ id, decidedBy = 'admin' }) {
  const ir = (await query(`SELECT id, kind, name, tenant_id, enrich_status FROM imported_records WHERE id=$1`, [Number(id)])).rows[0];
  if (!ir) throw new Error('not_found');
  if (ir.enrich_status !== 'pending_review') return { id: ir.id, status: ir.enrich_status, noop: true };
  await query(`UPDATE imported_records SET enrich_status='rejected' WHERE id=$1`, [ir.id]);
  await query(`INSERT INTO enrichment_audit (datapoint_id, entity_type, entity_id, field, new_value, contributor_tenant, decided_by, action)
               VALUES (NULL,$1,0,'__new_entity__',$2,$3,$4,'reject')`,
    [irEntity(ir.kind), ir.name, ir.tenant_id, decidedBy]);
  return { id: ir.id, status: 'rejected' };
}
