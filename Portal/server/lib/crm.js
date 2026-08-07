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
/**
 * A user id supplied by a client may only ever name a member of THAT client's own tenant.
 *
 * ⚠️ SECURITY (found 2026-08-06). Three CRM write paths took `assignee_user_id` / `owner_user_id`
 * straight from the request body with no membership check, while the matching read paths joined
 * `LEFT JOIN users u ON u.id = t.assignee_user_id` with NO tenant predicate and returned
 * `u.email`. So a user in tenant A could assign a task to a user id belonging to tenant B, then
 * read that person's EMAIL ADDRESS back out of their own task list. The record was scoped; the
 * assignee never was.
 *
 * Returns the member row, or null. Callers must reject on null — never silently store the id.
 */
export async function tenantMember(tenantId, userId) {
  const id = Number(userId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const r = await poolQuery(
    `SELECT id, full_name, email FROM users WHERE id = $1 AND tenant_id = $2 AND is_active = true`,
    [id, tenantId]);
  return r.rows[0] || null;
}

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

// ── CRM search ──────────────────────────────────────────────────────────────
//
// What a salesperson types into the CRM search box, and where Bell actually
// holds the answer:
//
//   "al baraka"          → companies.name / companies.legal_name / people.full_name
//   "albaraka.com"       → companies.website
//   "ir@albaraka.com"    → company_contacts (type='email') / people.email
//   "4455 5333"          → company_contacts (type='phone'|'whatsapp') / people.phone
//   "30734" / "BIN-0002" → company_registrations.number(_normalized) / companies.bin
//   "sent the quote"     → crm_notes.body   (this tenant's own notes only)
//   "Q3 renewal"         → crm_deals.title  (this tenant's own deals only)
//
// Three rules this code exists to enforce:
//
//  1. TENANT SCOPING. The whole search is anchored on crm_records rows that
//     already passed `r.tenant_id = $1`, and the two tenant-owned sources
//     (crm_notes, crm_deals) carry their OWN `tenant_id = $1` predicate as well
//     — a stray row with a colliding record_id can never surface in another
//     tenant's list. crm_deals.record_id has no compound tenant key in
//     migration 022, so that second predicate is load-bearing, not decoration.
//
//  2. ENTITY-TYPE GUARD. `crm_records.entity_id` is polymorphic: it is a
//     companies.id on a company row and a people.id on a person row. Joining
//     company_contacts.company_id = r.entity_id WITHOUT checking entity_type
//     would match a completely unrelated company for every person record. Every
//     company-side subquery below is wrapped in `r.entity_type = 'company'`.
//
//  3. NO FREE REVEALS (Rule 2.1 adjacent). Contact VALUES are the product Bell
//     charges credits for. Matching on an email/phone the tenant has not
//     revealed would turn the search box into a free confirmation oracle
//     ("is this address this company's?"). Contact matching is therefore gated
//     by tenant_reveals, exactly as routes/export.js masks its contact columns.
//     Name / website / registration / notes / deals are never gated.

/** LIKE metacharacters are literal text when a salesperson types them. */
export function likeEscape(s) { return String(s).replace(/[\\%_]/g, '\\$&'); }

/** The field keys `match_fields` can report, in the order they are evaluated. */
export const CRM_SEARCH_FIELDS = ['name', 'website', 'registration', 'email', 'phone', 'note', 'deal'];

/**
 * Normalize what the user typed. Returns null when there is nothing to search,
 * so an empty (or one-character) box can never fall through to "match
 * everything" — the caller must treat null as "apply no search condition at
 * all", never as "match all rows".
 */
export function parseCrmQuery(raw) {
  const text = String(raw ?? '').trim();
  if (text.length < 2) return null;
  const digits = text.replace(/[^0-9]/g, '');
  const dense = text.replace(/\s+/g, '').length || 1;
  // A phone / registration lookup only when the typed string is mostly digits —
  // otherwise "Al Baraka 2" would go hunting through every phone number.
  const numeric = digits.length >= 4 && digits.length / dense >= 0.5 ? digits : null;
  // A registration number is an IDENTIFIER, so it is matched exactly, never as
  // a substring ("3073" must not find CR 30734 — that is a different company).
  // `company_registrations.number_normalized` is the canonical stored form, and
  // it was verified against all 195,496 live rows: 195,479 equal either the
  // digits of `number` or those digits with leading zeros stripped, and the
  // remaining 10 are the verbatim strings TR00001…TR00010. Those three forms
  // therefore cover the table completely.
  const bare = digits.replace(/^0+/, '');
  const regCandidates = [...new Set([
    digits.length >= 3 ? digits : null,
    bare.length >= 3 ? bare : null,
    /^[A-Za-z0-9/_.-]{3,24}$/.test(text) ? text.toUpperCase() : null,
  ].filter(Boolean))];
  return { text, like: '%' + likeEscape(text.toLowerCase()) + '%', digits, numeric, regCandidates };
}

/**
 * Build the SQL for a CRM record search.
 *
 * `params` is the live parameter array for the query being assembled — this
 * pushes onto it and returns `$n` references, so it must be called while the
 * array is in the state the caller expects.
 *
 * Returns `{ where, matchSelect }`:
 *   where       — one parenthesised boolean, AND it into the record WHERE list
 *   matchSelect — `, ARRAY[…] AS match_fields`, append to the SELECT column list
 *
 * Aliases assumed present: r (crm_records), c (companies), p (people).
 */
export function buildCrmSearch(parsed, params, { tenantParam, revealBypass = false } = {}) {
  if (!parsed) return null;
  const push = (v) => { params.push(v); return '$' + params.length; };
  const like = push(parsed.like);
  const num = parsed.numeric ? push('%' + parsed.numeric + '%') : null;

  // Backslash is Postgres' default LIKE escape character, so likeEscape() above
  // is sufficient — no ESCAPE clause needed (same convention as routes/companies.js).
  const L = (expr) => `lower(coalesce(${expr},'')) LIKE ${like}`;
  const DIGITS = (expr) => `regexp_replace(coalesce(${expr},''),'[^0-9]','','g')`;

  const revealed = revealBypass
    ? 'true'
    : `EXISTS (SELECT 1 FROM tenant_reveals tr
                WHERE tr.tenant_id = ${tenantParam}
                  AND tr.entity_type = r.entity_type
                  AND tr.entity_id   = r.entity_id)`;

  const f = {};
  f.name = `(${L('c.name')} OR ${L('c.legal_name')} OR ${L('p.full_name')} OR ${L('p.headline')})`;
  f.website = L('c.website::text');
  // companies.bin (Bell's own reference, e.g. "BIN-00023779") is free to search
  // — `c` is already joined — so it is matched as a substring like any other
  // display field.
  //
  // company_registrations is NOT free: 195,496 rows, and a substring LIKE on it
  // made the planner take one full pass over the table on EVERY search with a
  // digit in it — measured at ~440 ms even for a tenant with 1,000 records.
  // It is now an indexed equality against the pre-computed candidate forms (see
  // parseCrmQuery), which is both faster and more correct: a registration
  // number identifies one company, so "3073" must not surface CR 30734.
  const regs = parsed.regCandidates.length ? push(parsed.regCandidates) : null;
  f.registration = `(${L('c.bin')}
      ${num ? `OR (r.entity_type = 'company' AND ${DIGITS('c.bin')} LIKE ${num})` : ''}
      ${regs ? `OR (r.entity_type = 'company' AND EXISTS (
            SELECT 1 FROM company_registrations cr
             WHERE cr.company_id = r.entity_id
               AND cr.number_normalized = ANY(${regs}::text[])))` : ''})`;
  f.email = `(${revealed} AND (
      (r.entity_type = 'company' AND EXISTS (
          SELECT 1 FROM company_contacts cc
           WHERE cc.company_id = r.entity_id AND cc.type = 'email' AND ${L('cc.value')}))
      OR (r.entity_type = 'person' AND ${L('p.email::text')})))`;
  f.phone = num
    ? `(${revealed} AND (
      (r.entity_type = 'company' AND EXISTS (
          SELECT 1 FROM company_contacts cc
           WHERE cc.company_id = r.entity_id AND cc.type IN ('phone','whatsapp')
             AND ${DIGITS('cc.value')} LIKE ${num}))
      OR (r.entity_type = 'person' AND ${DIGITS('p.phone')} LIKE ${num})))`
    : 'false';
  // Tenant-owned text. Both predicates are required: record_id alone is not
  // tenant-safe (see rule 1 above).
  f.note = `EXISTS (SELECT 1 FROM crm_notes n
                     WHERE n.record_id = r.id AND n.tenant_id = ${tenantParam} AND ${L('n.body')})`;
  f.deal = `EXISTS (SELECT 1 FROM crm_deals d
                     WHERE d.record_id = r.id AND d.tenant_id = ${tenantParam} AND ${L('d.title')})`;

  const active = CRM_SEARCH_FIELDS.filter((k) => f[k] !== 'false');
  const where = '(' + active.map((k) => f[k]).join(' OR ') + ')';
  // Evaluated only for rows that already passed the WHERE, so the duplicated
  // predicates cost nothing on the rows that did not match.
  const matchSelect = ', array_remove(ARRAY['
    + active.map((k) => `CASE WHEN ${f[k]} THEN '${k}' END`).join(', ')
    + '], NULL) AS match_fields';
  return { where, matchSelect };
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
