// Shared helpers for company_contacts + person_contacts.
//
// Both tables have identical shape; we just swap the foreign-key column name.
// Used by:
//   - GET endpoints  → load contacts for a row
//   - POST/PATCH/DELETE → CRUD from the drawer UI
//   - Enrichment stages (2, 3.5, 5, 6) → record every discovered email/phone

import { query, withTransaction } from '../db.js';

// ---------------------------------------------------------------------------
// Normalizers
// ---------------------------------------------------------------------------

/** Lower-case, trim, strip leading/trailing whitespace. Returns null if blank. */
export function normalizeEmail(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim().toLowerCase();
  if (!s) return null;
  // Very loose RFC-5322ish sniff. We don't reject odd-looking ones — just refuse
  // anything missing an @ or a TLD.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) return null;
  return s;
}

/** Digits + leading + only. Drops spaces, dashes, parens, dots. Null if <6 digits. */
export function normalizePhone(raw) {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).replace(/[^\d+]/g, '');
  // Strip any '+' that isn't at index 0
  const cleaned = s.replace(/(?!^)\+/g, '');
  const digitCount = cleaned.replace(/\D/g, '').length;
  // Sane phone length: 6–13 digits. Longer values aren't real numbers — we've
  // seen 14-digit millisecond-timestamp IDs leak into phone fields.
  if (digitCount < 6 || digitCount > 13) return null;
  return cleaned;
}

/** Strip query/hash + trailing slash + lowercase host. Null if blank. */
export function normalizeSocialUrl(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    u.search = ''; u.hash = '';
    return u.toString().replace(/\/$/, '').toLowerCase();
  } catch { return s.toLowerCase().replace(/\/$/, ''); }
}

/** Common false-positive emails we should never store (placeholder, web logger). */
const EMAIL_BLOCKLIST = [
  /^you@/i, /^example@/i, /^name@example/i, /^user@/i,
  /@example\.(com|org|net)$/i, /@sentry\.io$/i,
  /@email\.(com|test)$/i, /^test@test/i,
  /^no[-_.]?reply@/i,    // we DO want noreply addresses sometimes; comment out if too aggressive
  /\.png$|\.jpg$|\.gif$|\.svg$|\.webp$/i,  // image filenames mistakenly parsed
];

/** Returns true if the email is suspicious and should be skipped. */
export function isJunkEmail(email) {
  if (!email) return true;
  return EMAIL_BLOCKLIST.some(rx => rx.test(email));
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------

/** Load contacts for a single company. Ordered: primary first, then by id. */
export async function listCompanyContacts(companyId) {
  const r = await query(`
    SELECT id, type, value, value_display, source, source_url, source_label,
           is_primary, is_verified, verified_at, created_at, updated_at
    FROM company_contacts
    WHERE company_id = $1
    ORDER BY is_primary DESC, type, created_at ASC
  `, [companyId]);
  return r.rows;
}

/** Load contacts for a single person. Same ordering. */
export async function listPersonContacts(personId) {
  const r = await query(`
    SELECT id, type, value, value_display, source, source_url, source_label,
           is_primary, is_verified, verified_at, created_at, updated_at
    FROM person_contacts
    WHERE person_id = $1
    ORDER BY is_primary DESC, type, created_at ASC
  `, [personId]);
  return r.rows;
}

/** Bulk-load: returns Map<refId, [contact, ...]> for a set of company ids. */
export async function loadCompanyContactsByIds(ids) {
  if (!ids || ids.length === 0) return new Map();
  const r = await query(`
    SELECT company_id AS ref_id,
           id, type, value, value_display, source, source_url, source_label,
           is_primary, is_verified, verified_at
    FROM company_contacts
    WHERE company_id = ANY($1)
    ORDER BY is_primary DESC, type, created_at ASC
  `, [ids]);
  const m = new Map();
  for (const row of r.rows) {
    if (!m.has(row.ref_id)) m.set(row.ref_id, []);
    m.get(row.ref_id).push(row);
  }
  return m;
}

/** Bulk-load people version. */
export async function loadPersonContactsByIds(ids) {
  if (!ids || ids.length === 0) return new Map();
  const r = await query(`
    SELECT person_id AS ref_id,
           id, type, value, value_display, source, source_url, source_label,
           is_primary, is_verified, verified_at
    FROM person_contacts
    WHERE person_id = ANY($1)
    ORDER BY is_primary DESC, type, created_at ASC
  `, [ids]);
  const m = new Map();
  for (const row of r.rows) {
    if (!m.has(row.ref_id)) m.set(row.ref_id, []);
    m.get(row.ref_id).push(row);
  }
  return m;
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------

/**
 * Upsert a contact onto either a company or a person.
 *   kind:     'company' | 'person'
 *   refId:    company.id or person.id
 *   contact:  { type, value, value_display?, source, source_url?, source_label?, is_primary?, is_verified? }
 *
 * Re-discovering the same (refId, type, value) is a no-op except for updating
 * the source/url labels (we keep the more recent one — useful when website
 * scrape finds an email already pulled from LinkedIn).
 */
export async function upsertContact(kind, refId, contact) {
  if (kind !== 'company' && kind !== 'person') {
    throw new Error('upsertContact: kind must be "company" or "person"');
  }
  const table  = kind === 'company' ? 'company_contacts' : 'person_contacts';
  const refCol = kind === 'company' ? 'company_id'       : 'person_id';

  // Normalize value
  let normalized = contact.value;
  if (contact.type === 'email')  normalized = normalizeEmail(contact.value);
  if (contact.type === 'phone')  normalized = normalizePhone(contact.value);
  if (contact.type === 'social') normalized = normalizeSocialUrl(contact.value);
  if (!normalized) return null;

  if (contact.type === 'email' && isJunkEmail(normalized)) return null;

  const display = contact.value_display
    || (contact.type === 'phone' ? contact.value : normalized);
  const source  = contact.source || 'manual';

  const r = await query(`
    INSERT INTO ${table}
      (${refCol}, type, value, value_display, source, source_url, source_label,
       is_primary, is_verified, verified_at, extra_fields)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
    ON CONFLICT (${refCol}, type, value) DO UPDATE SET
      value_display = COALESCE(${table}.value_display, EXCLUDED.value_display),
      source        = CASE WHEN ${table}.source = 'backfill'
                           THEN EXCLUDED.source ELSE ${table}.source END,
      source_url    = COALESCE(${table}.source_url,   EXCLUDED.source_url),
      source_label  = COALESCE(${table}.source_label, EXCLUDED.source_label),
      is_verified   = ${table}.is_verified OR EXCLUDED.is_verified,
      verified_at   = COALESCE(${table}.verified_at,  EXCLUDED.verified_at),
      extra_fields  = ${table}.extra_fields || EXCLUDED.extra_fields,
      updated_at    = now()
    RETURNING id, ${refCol} AS ref_id, type, value, value_display,
              source, source_url, source_label, is_primary, is_verified
  `, [
    refId, contact.type, normalized, display,
    source, contact.source_url || null, contact.source_label || null,
    contact.is_primary === true,
    contact.is_verified === true,
    contact.is_verified === true ? new Date() : null,
    JSON.stringify(contact.extra_fields || {}),
  ]);

  // If this row was marked primary, demote any sibling of the same type
  if (contact.is_primary === true) {
    await query(
      `UPDATE ${table} SET is_primary = false
       WHERE ${refCol} = $1 AND type = $2 AND id <> $3`,
      [refId, contact.type, r.rows[0].id],
    );
    await syncPrimaryToParent(kind, refId, contact.type);
  } else {
    // If there is no primary yet for this type, promote the only existing row
    await query(`
      UPDATE ${table} SET is_primary = true
      WHERE id = (
        SELECT id FROM ${table}
        WHERE ${refCol} = $1 AND type = $2
        ORDER BY is_verified DESC, created_at ASC
        LIMIT 1
      )
      AND NOT EXISTS (
        SELECT 1 FROM ${table}
        WHERE ${refCol} = $1 AND type = $2 AND is_primary = true
      )
    `, [refId, contact.type]);
    await syncPrimaryToParent(kind, refId, contact.type);
  }

  return r.rows[0];
}

/** Bulk insert: same as upsertContact in a tighter loop, returns the count actually written. */
export async function upsertContactsBulk(kind, refId, contacts) {
  let written = 0;
  for (const c of contacts) {
    const r = await upsertContact(kind, refId, c);
    if (r) written++;
  }
  return written;
}

/** Mark a contact row as primary for its (refId, type). Demotes siblings. */
export async function setPrimaryContact(kind, refId, contactId, type) {
  const table  = kind === 'company' ? 'company_contacts' : 'person_contacts';
  const refCol = kind === 'company' ? 'company_id'       : 'person_id';

  await withTransaction(async (client) => {
    await client.query(
      `UPDATE ${table} SET is_primary = false
       WHERE ${refCol} = $1 AND type = $2`,
      [refId, type],
    );
    await client.query(
      `UPDATE ${table} SET is_primary = true
       WHERE id = $1 AND ${refCol} = $2`,
      [contactId, refId],
    );
  });
  await syncPrimaryToParent(kind, refId, type);
}

/** Delete a contact row. Re-promotes another contact to primary if needed. */
export async function deleteContact(kind, refId, contactId) {
  const table  = kind === 'company' ? 'company_contacts' : 'person_contacts';
  const refCol = kind === 'company' ? 'company_id'       : 'person_id';

  const r = await query(
    `DELETE FROM ${table}
     WHERE id = $1 AND ${refCol} = $2
     RETURNING type, is_primary`,
    [contactId, refId],
  );
  if (r.rows.length === 0) return false;
  const { type, is_primary } = r.rows[0];

  if (is_primary) {
    // Promote next-best sibling
    await query(`
      UPDATE ${table} SET is_primary = true
      WHERE id = (
        SELECT id FROM ${table}
        WHERE ${refCol} = $1 AND type = $2
        ORDER BY is_verified DESC, created_at ASC
        LIMIT 1
      )
    `, [refId, type]);
  }
  await syncPrimaryToParent(kind, refId, type);
  return true;
}

/**
 * Keep the legacy companies.email / phone (and people.email / phone) columns
 * in sync with the primary contact of that type. Lets the rest of the system
 * (grid, exports, Bell.qa schema) keep using those columns until we cut over.
 */
async function syncPrimaryToParent(kind, refId, type) {
  if (type !== 'email' && type !== 'phone') return;
  const sourceTable = kind === 'company' ? 'company_contacts' : 'person_contacts';
  const refCol      = kind === 'company' ? 'company_id'       : 'person_id';
  const parentTable = kind === 'company' ? 'companies'        : 'people';
  const parentCol   = type === 'email' ? 'email' : 'phone';

  await query(`
    UPDATE ${parentTable} SET ${parentCol} = (
      SELECT COALESCE(value_display, value)
      FROM ${sourceTable}
      WHERE ${refCol} = $1 AND type = $2 AND is_primary = true
      LIMIT 1
    )
    WHERE id = $1
  `, [refId, type]);
}
