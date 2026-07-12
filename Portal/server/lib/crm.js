// CRM helpers — per-tenant action layer.
//
// The CRM is prod-owned customer state (like tenant_reveals). These helpers are
// safe to call with either the pool `query` or a transaction client; pass a
// runner that exposes `.query(...)`.

import { query as poolQuery } from '../db.js';

function runnerOf(clientOrNull) {
  return clientOrNull && typeof clientOrNull.query === 'function'
    ? clientOrNull
    : { query: (...a) => poolQuery(...a) };
}

/**
 * Ensure a company/person is in this tenant's CRM. Idempotent (UNIQUE on
 * tenant+entity). Returns { id, created }. Logs an 'added'/'reveal' activity
 * the first time the record appears.
 */
export async function ensureCrmRecord(client, tenantId, entityType, entityId, source = 'manual', addedBy = null, ownerUserId = null) {
  const r = runnerOf(client);
  if (!tenantId || !entityType || !entityId) return { id: null, created: false };

  const ins = await r.query(
    `INSERT INTO crm_records (tenant_id, entity_type, entity_id, source, added_by, owner_user_id)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (tenant_id, entity_type, entity_id) DO NOTHING
     RETURNING id`,
    [tenantId, entityType, Number(entityId), source, addedBy, ownerUserId]
  );
  if (!ins.rows.length) {
    // Already in CRM — return its id.
    const ex = await r.query(
      `SELECT id FROM crm_records WHERE tenant_id=$1 AND entity_type=$2 AND entity_id=$3`,
      [tenantId, entityType, Number(entityId)]
    );
    return { id: ex.rows[0]?.id || null, created: false };
  }
  const recordId = Number(ins.rows[0].id);
  await logActivity(r, tenantId, recordId, source === 'reveal' ? 'reveal' : 'added', {
    actorEmail: addedBy,
    summary: source === 'reveal' ? 'Added to CRM on reveal' : 'Added to CRM',
  });
  return { id: recordId, created: true };
}

/**
 * When the first outreach goes out, advance a 'new' record to 'contacted'
 * (no-op for any other status). Logs a status_change so the timeline reflects it.
 */
export async function markContacted(client, tenantId, recordId, actorEmail = null) {
  const r = runnerOf(client);
  const up = await r.query(
    `UPDATE crm_records SET status='contacted' WHERE id=$1 AND tenant_id=$2 AND status='new' RETURNING id`,
    [recordId, tenantId]
  );
  if (up.rows.length) {
    await logActivity(r, tenantId, recordId, 'status_change', {
      actorEmail, summary: 'Status → Contacted (outreach sent)', payload: { from: 'new', to: 'contacted', auto: true },
    });
  }
}

// ── Email personalization (merge tokens) ────────────────────────────────────
// Available tokens, substituted per recipient at send time:
//   {name} {first_name} {company} {industry} {city} {title} {website}
export const MERGE_TOKENS = ['name', 'first_name', 'company', 'industry', 'city', 'title', 'website'];

// Build the merge variables for a record. `row` must include entity_type plus
// the aliased joins: company_name/company_industry/company_city/company_website
// and person_name/person_headline (+ optional company_name_hint for people).
export function buildMergeVars(row) {
  const isCompany = row.entity_type === 'company';
  const name = isCompany ? (row.company_name || '') : (row.person_name || '');
  const first = isCompany ? name : (String(name).trim().split(/\s+/)[0] || name);
  return {
    name,
    first_name: first,
    company: isCompany ? (row.company_name || '') : (row.company_name_hint || ''),
    industry: row.company_industry || '',
    city: row.company_city || '',
    title: isCompany ? '' : (row.person_headline || ''),
    website: row.company_website || '',
  };
}

// Replace {token} with its value. Known tokens with no value → empty string;
// unknown tokens are left untouched so typos are visible rather than silently dropped.
export function applyMerge(text, vars) {
  if (!text) return text;
  return String(text).replace(/\{(\w+)\}/g, (m, key) => {
    const k = key.toLowerCase();
    return Object.prototype.hasOwnProperty.call(vars, k) ? (vars[k] || '') : m;
  });
}

/** Append a timeline activity + bump the record's last_activity_at. */
export async function logActivity(client, tenantId, recordId, type, { actorUserId = null, actorEmail = null, summary = null, payload = {} } = {}) {
  const r = runnerOf(client);
  if (!recordId) return;
  await r.query(
    `INSERT INTO crm_activities (tenant_id, record_id, type, actor_user_id, actor_email, summary, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [tenantId, recordId, type, actorUserId, actorEmail, summary, JSON.stringify(payload || {})]
  );
  await r.query(`UPDATE crm_records SET last_activity_at = now() WHERE id = $1`, [recordId]);
}

/**
 * Bulk auto-add on reveal. Best-effort, never throws into the reveal flow.
 * `ids` is an array of canonical entity ids of `entityType`.
 */
export async function addRevealedToCrm(tenantId, entityType, ids, addedBy, ownerUserId = null) {
  if (!tenantId || !Array.isArray(ids) || !ids.length) return 0;
  let added = 0;
  for (const id of ids) {
    try {
      // Auto-assign the newly revealed lead to whoever revealed it (Phase 5) —
      // only on create; ensureCrmRecord never reassigns an existing record.
      const res = await ensureCrmRecord(null, tenantId, entityType, id, 'reveal', addedBy, ownerUserId);
      if (res.created) added++;
    } catch (e) {
      console.warn('[crm] auto-add on reveal failed', entityType, id, '—', e.message);
    }
  }
  return added;
}
