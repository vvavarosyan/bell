// Source-agnostic normalization helpers used by every ingest module.

const QATAR_LEGAL_FORM_WORDS = /\b(llc|wll|qfz|qfc|pjsc|ltd|limited|inc|incorporated|company|co|the|branch|holding|holdings|group|trading|services|s\.?p\.?c\.?)\b/gi;

export function normalizeName(name) {
  if (!name) return '';
  return String(name)
    // Fold Unicode punctuation to ASCII first, so en/em dashes and curly quotes
    // behave like their ASCII cousins ("Averda – Qatar" == "Averda - Qatar",
    // "Burj Al’Amah" == "Burj Al'Amah"). Otherwise they survive the strip
    // below and create phantom non-duplicate twins.
    .replace(/[‐-―−]/g, '-')           // hyphen/figure/en/em dash, minus
    .replace(/[‘’‚‛ʼ]/g, "'") // curly / modifier apostrophes
    .replace(/[“”]/g, '"')                   // curly double quotes
    .toLowerCase()
    .replace(/[.,()&'"\-]/g, ' ')
    .replace(QATAR_LEGAL_FORM_WORDS, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// =============================================================================
// Source-specific status normalizers (decided 2026-05-21 with the user)
//
//   QFC active iff license_status ∈ { Licensed, Frozen Under Court Order,
//                                     Licensed - not yet commenced regulated activities }
//     registration_status is preserved (extra_fields) but does NOT decide active.
//   MOCI active iff cr_status === 'Active'  (cp_status preserved but ignored).
//   QFZ/QSTP — no status field → active.
//
// Anything not active → archived=true at ingest.
// =============================================================================

const QFC_ACTIVE_STATUSES = new Set([
  'Licensed',
  'Frozen Under Court Order',
  'Licensed - not yet commenced regulated activities',
]);

const QFC_STATUS_MAP = {
  'Licensed':                                              'active',
  'Frozen Under Court Order':                              'frozen',
  'Licensed - not yet commenced regulated activities':     'active',
  'Licence Withdrawn by QFCA':                             'withdrawn',
  'License Voluntarily Withdrawn':                         'withdrawn',
  'Licensed - In Liquidation':                             'in_liquidation',
  'Licensed - Inactive':                                   'inactive',
  'Licensed – Regulated Activities Suspended':             'suspended',
  'Suspended by Court Order':                              'suspended',
  'Under Deregistration':                                  'deregistered',
  'Not yet licensed to conduct permitted activities':      'not_licensed',
  'Not Licensed':                                          'not_licensed',
  'Registered':                                            'active',     // trusts
};

const MOCI_STATUS_MAP = {
  'Active':               'active',
  'Inactive':             'inactive',
  'Expired':              'inactive',
  'Scarified':            'deregistered',   // MOCI's translation of "struck off"
  'Under liquidation':    'in_liquidation',
  'Judicial Custody':     'frozen',
  'Block Administrative': 'frozen',
};

/** QFC active decision: license_status whitelist. */
export function normalizeQFCStatus(licenseStatus, _registrationStatus) {
  const s = (licenseStatus || '').trim();
  return {
    status_normalized: QFC_STATUS_MAP[s] || 'unknown',
    is_active:         QFC_ACTIVE_STATUSES.has(s),
  };
}

/** MOCI active decision: cr_status === 'Active'. */
export function normalizeMOCIStatus(crStatus, _cpStatus) {
  const s = (crStatus || '').trim();
  return {
    status_normalized: MOCI_STATUS_MAP[s] || 'unknown',
    is_active:         s === 'Active',
  };
}

/** Sources with no status field — assume active. */
export function normalizeUnspecifiedStatus() {
  return { status_normalized: 'active', is_active: true };
}

/** Legacy entrypoint — routes to the source-specific normalizer. */
export function normalizeStatus(source, rawStatus) {
  if (source === 'QFC')  return normalizeQFCStatus(rawStatus);
  if (source === 'MOCI') return normalizeMOCIStatus(rawStatus);
  return normalizeUnspecifiedStatus();
}

/**
 * Parse common date forms into YYYY-MM-DD or null.
 * Accepts: "14/05/2026", "2026-05-14", "2026-05-14T10:00:00+00:00", "31-July".
 */
export function parseDate(s) {
  if (!s) return null;
  const str = String(s).trim();
  let m;
  if ((m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) {
    return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.slice(0, 10);
  return null;
}

/** Coerce empty strings to null. Useful for fields that should not be empty. */
export function nz(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Take only the columns we know about, drop the rest into extra_fields. */
export function partitionExtras(row, knownKeys) {
  const known = {};
  const extras = {};
  for (const [k, v] of Object.entries(row)) {
    if (knownKeys.has(k)) known[k] = v;
    else extras[k] = v;
  }
  return { known, extras };
}

/** Build the "name_normalized" + name pair from a raw record. */
export function namePair(rawName) {
  const n = nz(rawName) || '';
  return { name: n, name_normalized: normalizeName(n) };
}
