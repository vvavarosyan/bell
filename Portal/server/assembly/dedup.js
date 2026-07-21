// Phase 5 — Dedup detection + merge logic for companies.
//
// Algorithm:
//   1. Walk all NON-merged companies (merge_status != 'merged_into', not archived).
//   2. For each candidate signal (LinkedIn URL, website domain, normalized
//      registration #, exact normalized name, fuzzy name), find groups of
//      companies sharing that signal.
//   3. For every pair within a group, compute a composite similarity score
//      (sum of weighted reasons, capped at 1.0).
//   4. Auto-merge when score >= AUTO_THRESHOLD (0.95) or when any single
//      strong unique-ID match fires (LinkedIn URL).
//   5. Queue pairs scoring 0.70-0.95 in dedup_candidates for admin review.
//
// Signal policy (updated 2026-05-23 per Val):
//   • Same Google Maps place_id is NOT a dedup signal (Qatar buildings/free
//     zones house many companies under one place_id → false positives).
//   • Same city / same country are NOT dedup signals (Qatar context: almost
//     every record is Doha/Qatar — adds no information).
//   • Exact normalized-name match IS a strong signal (added).
//
// Merge: pick the canonical (richer of the two), copy NULL fields,
// re-parent company_sources / company_contacts / person_companies / jobs to
// the canonical, archive the duplicate with canonical_id pointing back.

import { query, withTransaction } from '../db.js';
import { normalizeName } from '../ingest/normalize.js';

const AUTO_THRESHOLD   = 0.95;
const QUEUE_THRESHOLD  = 0.70;

// ---------------------------------------------------------------------------
// Defensive upsert into dedup_candidates that does NOT depend on an
// ON CONFLICT clause matching the table's UNIQUE constraint. We tried the
// idiomatic `ON CONFLICT (company_a_id, company_b_id) DO UPDATE` and hit
// "there is no unique or exclusion constraint matching the ON CONFLICT
//  specification" on 2026-05-23, suggesting the constraint Postgres had
// available didn't match the spec for some environments. This pattern is
// always two queries (UPDATE first, then INSERT if no row was touched),
// which is more code but bullet-proof and easier to reason about.
//
// `payload` shape:
//   { aId, bId, score, reasonsJson, decision, decidedBy }
//
// `decision` defaults to 'pending'. When 'pending', existing rows that have
// already been decided are left alone (we never re-open a decision).
// ---------------------------------------------------------------------------
async function upsertDedupCandidate(payload) {
  const { aId, bId, score, reasonsJson, decision = 'pending', decidedBy = null } = payload;

  if (decision === 'pending') {
    // Update only if the row is still pending — never re-open closed decisions.
    const upd = await query(`
      UPDATE dedup_candidates
      SET similarity_score   = $3::numeric,
          similarity_reasons = $4::jsonb
      WHERE company_a_id = $1 AND company_b_id = $2
        AND decision = 'pending'
      RETURNING id
    `, [aId, bId, score, reasonsJson]);
    if (upd.rowCount > 0) return;
    // Skip insert if there's already a row in a *non*-pending state for this pair.
    const exists = await query(`
      SELECT 1 FROM dedup_candidates WHERE company_a_id = $1 AND company_b_id = $2
    `, [aId, bId]);
    if (exists.rowCount > 0) return;
    await query(`
      INSERT INTO dedup_candidates (company_a_id, company_b_id, similarity_score, similarity_reasons)
      VALUES ($1, $2, $3::numeric, $4::jsonb)
    `, [aId, bId, score, reasonsJson]);
    return;
  }

  // Auto-merge audit — always wins over any prior state (including pending).
  const upd = await query(`
    UPDATE dedup_candidates
    SET decision           = $5,
        decided_at         = now(),
        decided_by         = $6,
        similarity_score   = $3::numeric,
        similarity_reasons = $4::jsonb
    WHERE company_a_id = $1 AND company_b_id = $2
    RETURNING id
  `, [aId, bId, score, reasonsJson, decision, decidedBy]);
  if (upd.rowCount > 0) return;
  await query(`
    INSERT INTO dedup_candidates (company_a_id, company_b_id, similarity_score, similarity_reasons, decision, decided_at, decided_by)
    VALUES ($1, $2, $3::numeric, $4::jsonb, $5, now(), $6)
  `, [aId, bId, score, reasonsJson, decision, decidedBy]);
}

// Weight per reason — anything ≥ 1.0 triggers auto-merge on its own.
// Combinations that auto-merge (score ≥ 0.95 after sum, capped at 1.0):
//   • linkedin_url_match alone                         (1.00)
//   • registration_no_match + anything ≥ 0.05          (≥ 0.95)
//   • name_exact_match + website_domain_match          (1.60 → cap 1.0)
//   • name_exact_match + registration_no_match         (1.75 → cap 1.0)
// Pairs reaching only name_exact_match alone (0.85) drop into the review queue.
const REASON_WEIGHTS = {
  linkedin_url_match:        1.00,
  registration_no_match:     0.90,
  name_exact_match:          0.85,    // identical name_normalized across two rows
  website_domain_match:      0.75,
  fuzzy_name_high:           0.55,    // pg_trgm >= 0.80 (and not an exact match)
  fuzzy_name_med:            0.30,    // pg_trgm >= 0.65 (and not an exact match)
};

// ---------------------------------------------------------------------------
// Normalizers (lightweight — heavy normalization stays in pg_trgm)
// ---------------------------------------------------------------------------
function normalizeDomain(url) {
  if (!url) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url);
    return u.hostname.replace(/^www\./, '').toLowerCase() || null;
  } catch { return null; }
}
function normalizeLinkedIn(url) {
  if (!url) return null;
  const m = String(url).toLowerCase().match(/linkedin\.com\/company\/([^\/?#]+)/);
  return m ? m[1].replace(/\/$/, '') : null;
}
// Preserve internal punctuation. The previous version stripped non-alphanumeric
// characters, which collapsed e.g. "62368" and "6236/8" to the same key and
// produced false matches. We now only normalize whitespace + case. A minimum
// length of 4 chars filters out trivially-short IDs that would otherwise
// over-match across the registry.
function normalizeRegistration(s) {
  if (!s) return null;
  let v = String(s).trim().toLowerCase().replace(/\s+/g, ' ');
  // Purely-numeric IDs (like the MOCI/QCCI CR number) can differ only by
  // leading zeros across sources (e.g. "00090275" vs "90275") — strip them so
  // the same CR matches regardless of formatting.
  if (/^\d+$/.test(v)) v = v.replace(/^0+/, '') || '0';
  return v.length >= 4 ? v : null;
}

// The branch-stripped BASE commercial registration. MOCI issues a branch CR as
// "<base>/<n>" (e.g. 42828/2) for the SAME legal entity as its base CR (42828) —
// so strip a trailing "/n" before comparing. Only a differing BASE is a true
// cross-entity conflict; a branch suffix is the same company and must still merge.
function baseRegistration(s) {
  const v = normalizeRegistration(s);
  if (!v) return null;
  let x = v.replace(/\/\d+$/, '');
  if (/^\d+$/.test(x)) x = x.replace(/^0+/, '') || '0';
  return x.length >= 4 ? x : null;
}

// ---------------------------------------------------------------------------
// Find candidate pairs across all signals — returns Map<pairKey, { a, b, reasons[] }>
// ---------------------------------------------------------------------------
async function findCandidatePairs(jobLog = null) {
  jobLog?.(`  Scanning eligible companies…`);
  const all = await query(`
    SELECT id, name, name_normalized, linkedin_url, website,
           primary_registration_no
    FROM companies
    WHERE merge_status <> 'merged_into'
      AND archived = false
  `);
  const rows = all.rows;
  jobLog?.(`  ${rows.length.toLocaleString()} canonical companies to compare`);

  // Per-company source set — needed by the registration_no_match gate (each
  // Qatar source has its own ID system, so a numeric collision across sources
  // is a coincidence, not a duplicate).
  const sourcesRes = await query(`
    SELECT DISTINCT company_id, source FROM company_sources
  `);
  const sourcesByCompany = new Map();  // company_id → Set<source>
  for (const r of sourcesRes.rows) {
    let set = sourcesByCompany.get(r.company_id);
    if (!set) { set = new Set(); sourcesByCompany.set(r.company_id, set); }
    set.add(r.source);
  }
  jobLog?.(`  Indexed source membership for ${sourcesByCompany.size.toLocaleString()} compan${sourcesByCompany.size === 1 ? 'y' : 'ies'}`);

  // True iff a and b appear in at least one common directory.
  const sharesSource = (a, b) => {
    const sa = sourcesByCompany.get(a);
    const sb = sourcesByCompany.get(b);
    if (!sa || !sb) return false;
    for (const s of sa) if (sb.has(s)) return true;
    return false;
  };

  // Sources that key on the SAME official MOCI Commercial Registration (CR)
  // number. A CR match BETWEEN any of these is a real duplicate (same company),
  // not a cross-system coincidence — so the registration gate must allow it even
  // though the two records come from different directories. (QCCI's primary
  // registration IS the MOCI CR; QFC/QFZ/QSTP/QSE use their own ID systems.)
  const CR_FAMILY = new Set(['MOCI', 'QCCI']);
  const inCrFamily = (id) => {
    const s = sourcesByCompany.get(id);
    if (!s) return false;
    for (const x of s) if (CR_FAMILY.has(x)) return true;
    return false;
  };

  // Build indexes for each signal so we can find groups in O(N)
  const byLinkedIn  = new Map();   // slug → [id, id...]
  const byRegNo     = new Map();
  const byDomain    = new Map();
  const byExactName = new Map();   // name_normalized → [id, id...]

  for (const r of rows) {
    const li = normalizeLinkedIn(r.linkedin_url);
    if (li) push(byLinkedIn, li, r.id);
    const regNo = normalizeRegistration(r.primary_registration_no);
    if (regNo) push(byRegNo, regNo, r.id);
    const dom = normalizeDomain(r.website);
    if (dom) push(byDomain, dom, r.id);
    const exact = (r.name_normalized || '').trim();
    if (exact) push(byExactName, exact, r.id);
  }

  // Helper: register a pair-reason
  const pairs = new Map();        // pairKey → { a, b, reasons:Set }
  const addReason = (a, b, reason) => {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    if (lo === hi) return;
    const k = lo + ':' + hi;
    let p = pairs.get(k);
    if (!p) { p = { a: lo, b: hi, reasons: new Set() }; pairs.set(k, p); }
    p.reasons.add(reason);
  };

  for (const grp of byLinkedIn.values()) {
    for (let i = 0; i < grp.length; i++)
      for (let j = i + 1; j < grp.length; j++)
        addReason(grp[i], grp[j], 'linkedin_url_match');
  }
  // Registration numbers ONLY count as a duplicate signal when both companies
  // share at least one source. Each Qatar agency runs its own registration
  // system (QFC license #s ≠ MOCI CR #s ≠ QFZ IDs ≠ QSTP IDs), so cross-source
  // numeric overlap is coincidence. Same-source overlap with a different format
  // (e.g. scraper drift) is the case we actually want to catch.
  let regCrossSourceSkipped = 0;
  for (const grp of byRegNo.values()) {
    for (let i = 0; i < grp.length; i++) {
      for (let j = i + 1; j < grp.length; j++) {
        // Allow same-source matches, AND cross-source matches within the CR
        // family (MOCI ↔ QCCI share the official CR number → real duplicate).
        if (sharesSource(grp[i], grp[j]) || (inCrFamily(grp[i]) && inCrFamily(grp[j]))) {
          addReason(grp[i], grp[j], 'registration_no_match');
        } else {
          regCrossSourceSkipped++;
        }
      }
    }
  }
  if (regCrossSourceSkipped > 0) {
    jobLog?.(`  Registration gate: skipped ${regCrossSourceSkipped.toLocaleString()} cross-source numeric collision(s)`);
  }
  for (const grp of byDomain.values()) {
    for (let i = 0; i < grp.length; i++)
      for (let j = i + 1; j < grp.length; j++)
        addReason(grp[i], grp[j], 'website_domain_match');
  }
  for (const grp of byExactName.values()) {
    for (let i = 0; i < grp.length; i++)
      for (let j = i + 1; j < grp.length; j++)
        addReason(grp[i], grp[j], 'name_exact_match');
  }

  // Fuzzy name match (pg_trgm). We strip out fuzzy_name_* later on any pair
  // that already has name_exact_match, so we don't double-count the same
  // signal.
  jobLog?.(`  Fuzzy-name pass via pg_trgm…`);
  const fuzzy = await query(`
    SELECT a.id AS a_id, b.id AS b_id,
           similarity(a.name_normalized, b.name_normalized) AS sim
    FROM companies a
    JOIN companies b
      ON a.id < b.id
     AND a.name_normalized % b.name_normalized
     AND similarity(a.name_normalized, b.name_normalized) >= 0.65
    WHERE a.merge_status <> 'merged_into' AND a.archived = false
      AND b.merge_status <> 'merged_into' AND b.archived = false
    LIMIT 50000
  `);
  for (const row of fuzzy.rows) {
    addReason(row.a_id, row.b_id, row.sim >= 0.80 ? 'fuzzy_name_high' : 'fuzzy_name_med');
  }

  // Mutually-exclusive cleanup: if a pair has name_exact_match, the fuzzy
  // tier is redundant (identical strings already trigram-score 1.0 and would
  // otherwise inflate the composite weight).
  for (const p of pairs.values()) {
    if (p.reasons.has('name_exact_match')) {
      p.reasons.delete('fuzzy_name_high');
      p.reasons.delete('fuzzy_name_med');
    }
  }

  jobLog?.(`  Found ${pairs.size.toLocaleString()} candidate pairs`);

  // Compute final score per pair
  for (const p of pairs.values()) {
    let s = 0;
    for (const r of p.reasons) s += (REASON_WEIGHTS[r] || 0);
    p.score = Math.min(1, s);
  }

  return [...pairs.values()];
}

function push(map, key, val) {
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(val);
}

// ---------------------------------------------------------------------------
// Pick canonical between two rows — prefer the one with more populated columns
// ---------------------------------------------------------------------------
async function pickCanonical(idA, idB) {
  const r = await query(`
    SELECT id,
           (CASE WHEN bin                  IS NOT NULL THEN 1 ELSE 0 END)
         + (CASE WHEN legal_name           IS NOT NULL THEN 1 ELSE 0 END)
         + (CASE WHEN primary_registration_no IS NOT NULL THEN 1 ELSE 0 END)
         + (CASE WHEN linkedin_url         IS NOT NULL THEN 1 ELSE 0 END)
         + (CASE WHEN website              IS NOT NULL THEN 1 ELSE 0 END)
         + (CASE WHEN email                IS NOT NULL THEN 1 ELSE 0 END)
         + (CASE WHEN phone                IS NOT NULL THEN 1 ELSE 0 END)
         + (CASE WHEN industry             IS NOT NULL THEN 1 ELSE 0 END)
         + (CASE WHEN city                 IS NOT NULL THEN 1 ELSE 0 END)
         + (CASE WHEN latitude             IS NOT NULL THEN 1 ELSE 0 END)
         + (CASE WHEN longitude            IS NOT NULL THEN 1 ELSE 0 END)
         + (CASE WHEN employee_count       IS NOT NULL THEN 1 ELSE 0 END)
         + (CASE WHEN founded_year         IS NOT NULL THEN 1 ELSE 0 END)
         + (CASE WHEN gmaps_place_id       IS NOT NULL THEN 1 ELSE 0 END)
           AS completeness,
           created_at
    FROM companies WHERE id IN ($1, $2)
  `, [idA, idB]);
  if (r.rows.length < 2) return idA;
  // Highest completeness wins; tiebreak by older row (lower created_at).
  const [a, b] = r.rows;
  if (a.completeness !== b.completeness) {
    return a.completeness > b.completeness ? a.id : b.id;
  }
  return new Date(a.created_at) <= new Date(b.created_at) ? a.id : b.id;
}

// ---------------------------------------------------------------------------
// Build the merged extra_fields jsonb for a canonical/duplicate pair.
//
// Two rules:
//   1. Top-level keys: canonical wins over duplicate (so we don't overwrite
//      the canonical's enrichment with the duplicate's). NEW keys present
//      only on the duplicate are copied across.
//   2. `merged_registration_nos` is treated as a UNION: every distinct
//      non-null primary_registration_no across the two rows AND any pre-
//      existing entries from either's merged_registration_nos accumulator
//      end up on the canonical (minus the canonical's own primary_registration_no).
// ---------------------------------------------------------------------------
function mergeExtraFields(canonExtra, dupExtra, canonReg, dupReg) {
  canonExtra = canonExtra || {};
  dupExtra   = dupExtra   || {};
  // Step 1: canonical wins for top-level keys; duplicate fills in missing.
  const out = { ...dupExtra, ...canonExtra };

  // Step 2: union all merged registration numbers we know about.
  const all = new Set();
  for (const r of (canonExtra.merged_registration_nos || [])) if (r) all.add(String(r));
  for (const r of (dupExtra.merged_registration_nos   || [])) if (r) all.add(String(r));
  if (dupReg)   all.add(String(dupReg));
  if (canonReg) all.delete(String(canonReg));   // canonical's own reg lives in primary_registration_no, not the accumulator
  if (all.size > 0) {
    out.merged_registration_nos = [...all].sort();
  } else {
    delete out.merged_registration_nos;
  }
  return out;
}

// ---------------------------------------------------------------------------
// MERGE — duplicateId is folded into canonicalId. Idempotent.
// ---------------------------------------------------------------------------
export async function mergeCompanies(canonicalId, duplicateId, jobLog = null) {
  if (canonicalId === duplicateId) return { merged: false, reason: 'same_id' };

  // REGISTRATION-CONFLICT GUARD (Rule 2.1). A differing OFFICIAL commercial
  // registration = a different legal entity, so never silently fuse the two — a
  // wrong merge corrupts prod. This is the single chokepoint every merge path
  // goes through (cluster pre-merge, pair pass, bulk-approve, manual admin), so
  // the guard lives here. It compares the BRANCH-STRIPPED base CR: a MOCI branch
  // record (42828/2) IS the same entity as its base CR (42828) and must still
  // merge; only a differing base blocks. Fails loudly (throws) rather than
  // returning quietly, so a caller can never record it as a successful merge.
  {
    const [{ rows: [cr] }, { rows: [dr] }] = await Promise.all([
      query('SELECT primary_registration_no FROM companies WHERE id = $1', [canonicalId]),
      query('SELECT primary_registration_no FROM companies WHERE id = $1', [duplicateId]),
    ]);
    const regA = baseRegistration(cr?.primary_registration_no);
    const regB = baseRegistration(dr?.primary_registration_no);
    if (regA && regB && regA !== regB) {
      jobLog?.(`    ⚠ skip #${duplicateId} → #${canonicalId}: registration conflict ${regA} vs ${regB} (distinct legal entities — not merged)`);
      throw Object.assign(new Error('registration_conflict'), { code: 'registration_conflict', regA, regB });
    }
  }

  // Per-step timer + error logger. Logs through jobLog AND console whenever
  // a step exceeds 500ms or throws. Added 2026-05-23 to diagnose a hang
  // where cluster pre-merge stalled after the 2nd successful merge with no
  // visible error. This is the replacement for the deleted client.query
  // monkey-patch in db.js — instead of wrapping every client query, we wrap
  // each call site that we already care about.
  const tag = `#${duplicateId}→#${canonicalId}`;
  const timed = async (step, fn) => {
    const t0 = Date.now();
    try {
      const r = await fn();
      const ms = Date.now() - t0;
      if (ms > 500) jobLog?.(`      ⏱ ${tag} ${step}: ${ms}ms`);
      return r;
    } catch (err) {
      const ms = Date.now() - t0;
      jobLog?.(`      ✗ ${tag} ${step} FAILED after ${ms}ms: ${err.message}`);
      console.error(`[merge ${tag}] step "${step}" failed after ${ms}ms:`, err.message);
      throw err;
    }
  };

  await withTransaction(async (client) => {
    // 0. Pre-fetch both rows so we can build the merged extra_fields in JS
    //    (accumulating registration numbers losslessly). Sequential, not
    //    Promise.all — pg-node serializes queries on a single client anyway
    //    and sequential makes the timing logs intelligible.
    const canonR = await timed('SELECT canonical extras',
      () => client.query(`SELECT primary_registration_no, extra_fields FROM companies WHERE id = $1`, [canonicalId]));
    const dupR = await timed('SELECT duplicate extras',
      () => client.query(`SELECT primary_registration_no, extra_fields FROM companies WHERE id = $1`, [duplicateId]));
    if (canonR.rows.length === 0 || dupR.rows.length === 0) {
      return; // one of the rows vanished (unlikely inside a tx) — bail safely
    }
    const mergedExtra = mergeExtraFields(
      canonR.rows[0].extra_fields,
      dupR.rows[0].extra_fields,
      canonR.rows[0].primary_registration_no,
      dupR.rows[0].primary_registration_no,
    );

    // 1. Copy any NULL fields from duplicate → canonical
    //    Field list mirrors the migration 001 columns we care about.
    //    extra_fields is computed in JS above and passed as a parameter
    //    so we can do the registration-number union cleanly.
    await timed('UPDATE companies (big COALESCE)', () => client.query(`
      UPDATE companies c
      SET legal_name              = COALESCE(c.legal_name, d.legal_name),
          legal_form              = COALESCE(c.legal_form, d.legal_form),
          status_raw              = COALESCE(c.status_raw, d.status_raw),
          status_normalized       = COALESCE(c.status_normalized, d.status_normalized),
          primary_registration_no = COALESCE(c.primary_registration_no, d.primary_registration_no),
          incorporation_date      = COALESCE(c.incorporation_date, d.incorporation_date),
          founded_year            = COALESCE(c.founded_year, d.founded_year),
          website                 = COALESCE(c.website, d.website),
          email                   = COALESCE(c.email,   d.email),
          phone                   = COALESCE(c.phone,   d.phone),
          address                 = COALESCE(c.address, d.address),
          city                    = COALESCE(c.city,    d.city),
          country                 = COALESCE(c.country, d.country),
          postal_code             = COALESCE(c.postal_code, d.postal_code),
          latitude                = COALESCE(c.latitude,  d.latitude),
          longitude               = COALESCE(c.longitude, d.longitude),
          industry                = COALESCE(c.industry, d.industry),
          sector                  = COALESCE(c.sector,   d.sector),
          sub_sector              = COALESCE(c.sub_sector, d.sub_sector),
          employee_count          = COALESCE(c.employee_count, d.employee_count),
          employee_count_range    = COALESCE(c.employee_count_range, d.employee_count_range),
          company_size_category   = COALESCE(c.company_size_category, d.company_size_category),
          linkedin_url            = COALESCE(c.linkedin_url, d.linkedin_url),
          linkedin_id             = COALESCE(c.linkedin_id, d.linkedin_id),
          linkedin_description    = COALESCE(c.linkedin_description, d.linkedin_description),
          linkedin_followers      = COALESCE(c.linkedin_followers, d.linkedin_followers),
          linkedin_logo_url       = COALESCE(c.linkedin_logo_url, d.linkedin_logo_url),
          linkedin_cover_url      = COALESCE(c.linkedin_cover_url, d.linkedin_cover_url),
          linkedin_specialties    = COALESCE(c.linkedin_specialties, d.linkedin_specialties),
          linkedin_headquarters   = COALESCE(c.linkedin_headquarters, d.linkedin_headquarters),
          linkedin_locations      = COALESCE(c.linkedin_locations, d.linkedin_locations),
          gmaps_place_id          = COALESCE(c.gmaps_place_id, d.gmaps_place_id),
          gmaps_url               = COALESCE(c.gmaps_url,      d.gmaps_url),
          gmaps_rating            = COALESCE(c.gmaps_rating,   d.gmaps_rating),
          gmaps_reviews_count     = COALESCE(c.gmaps_reviews_count, d.gmaps_reviews_count),
          gmaps_hours             = COALESCE(c.gmaps_hours,    d.gmaps_hours),
          gmaps_photos            = COALESCE(c.gmaps_photos,   d.gmaps_photos),
          extra_fields            = $3::jsonb,
          updated_at              = now()
      FROM companies d
      WHERE c.id = $1 AND d.id = $2
    `, [canonicalId, duplicateId, JSON.stringify(mergedExtra)]));

    // 2. Re-parent linked rows. The previous version used
    //    `ON CONFLICT (company_id, source, source_record_id)` which does NOT
    //    match the actual UNIQUE constraint in migration 001 — that is
    //    `UNIQUE (source, source_record_id)`. Since `(source, source_record_id)`
    //    is globally unique, dup and canonical can't share a row on those
    //    columns, so re-parenting is just an UPDATE. The defensive DELETE in
    //    front handles the impossible-but-cheap edge case where the unique
    //    constraint was somehow violated previously (e.g. an aborted prior
    //    migration). Net effect: every one of dup's source rows ends up on
    //    canonical, nothing duplicated.
    await timed('DELETE conflicting company_sources', () => client.query(
      `DELETE FROM company_sources
       WHERE company_id = $2
         AND (source, source_record_id) IN (
           SELECT source, source_record_id FROM company_sources WHERE company_id = $1
         )`,
      [canonicalId, duplicateId],
    ));
    await timed('UPDATE re-parent company_sources', () => client.query(
      `UPDATE company_sources SET company_id = $1, last_seen_at = GREATEST(last_seen_at, now())
       WHERE company_id = $2`,
      [canonicalId, duplicateId],
    ));

    // company_contacts — re-parent, then drop dupes (UNIQUE on ref+type+value).
    await timed('INSERT company_contacts re-parent', () => client.query(
      `INSERT INTO company_contacts (company_id, type, value, value_display, source, source_url, source_label, is_primary, is_verified, verified_at, extra_fields)
       SELECT $1, type, value, value_display, source, source_url, source_label, is_primary, is_verified, verified_at, extra_fields
       FROM company_contacts WHERE company_id = $2
       ON CONFLICT (company_id, type, value) DO NOTHING`,
      [canonicalId, duplicateId],
    ));
    await timed('DELETE old company_contacts', () => client.query(`DELETE FROM company_contacts WHERE company_id = $1`, [duplicateId]));

    // person_companies — same person can already be linked to canonical, so
    // a straight UPDATE may violate any uniqueness. We INSERT-or-skip then drop.
    await timed('UPDATE person_companies re-parent', () => client.query(`
      UPDATE person_companies SET company_id = $1
      WHERE company_id = $2
        AND person_id NOT IN (SELECT person_id FROM person_companies WHERE company_id = $1)
    `, [canonicalId, duplicateId]));
    await timed('DELETE old person_companies', () => client.query(`DELETE FROM person_companies WHERE company_id = $1`, [duplicateId]));

    // jobs — straight re-parent. linkedin_job_url is globally unique already.
    await timed('UPDATE jobs re-parent', () => client.query(`UPDATE jobs SET company_id = $1 WHERE company_id = $2`,
      [canonicalId, duplicateId]));

    // 3. Mark the duplicate as merged
    await timed('UPDATE dup merge_status', () => client.query(`
      UPDATE companies
      SET canonical_id = $1, merge_status = 'merged_into', archived = true, updated_at = now()
      WHERE id = $2
    `, [canonicalId, duplicateId]));

    // 3b. Flatten any merge chain: rows that previously pointed at this
    //     duplicate (because it used to be a canonical) must now point at the
    //     FINAL canonical. This keeps canonical_id always referencing a true
    //     top-level canonical — required so the mirror sync (which sends
    //     canonical rows before duplicates) never hits a forward reference.
    await timed('UPDATE flatten merge chain', () => client.query(
      `UPDATE companies SET canonical_id = $1 WHERE canonical_id = $2`,
      [canonicalId, duplicateId]));

    // 4. Mark the canonical as a canonical (it's now the survivor for at least one merge)
    await timed('UPDATE canonical merge_status', () => client.query(`
      UPDATE companies SET merge_status = 'canonical', updated_at = now() WHERE id = $1
    `, [canonicalId]));
  });

  jobLog?.(`    ✓ merged company #${duplicateId} → #${canonicalId}`);
  return { merged: true, canonicalId, duplicateId };
}

// ---------------------------------------------------------------------------
// Exact-name CLUSTER auto-merge (Phase 5 — added 2026-05-23 per Val's ask).
//
// Why it exists: the pair-based scanner emits N(N-1)/2 candidates for a group
// of N rows that all share a name. With 51 "APPAREL QATAR LIMITED" rows that's
// 1,275 pair rows in the review queue — useless. Instead we cluster every
// group of ≥2 rows sharing `name_normalized`, pick one canonical, and absorb
// the rest in a single sweep. All registration numbers, source records, and
// fields are preserved by mergeCompanies (which accumulates regs into
// extra_fields.merged_registration_nos and re-parents company_sources).
//
// Safety rail: a cluster is SKIPPED (rows kept separate, surfaced via the
// normal pair queue) when its members have CONFLICTING strong identifiers —
// two distinct non-null LinkedIn URLs, or two distinct non-null website
// domains. That covers the "same brand, actually different companies" case.
// ---------------------------------------------------------------------------
async function clusterMergeByExactName({ jobLog = null } = {}) {
  jobLog?.(`▸ Exact-name cluster pre-merge`);

  const all = await query(`
    SELECT id, name, name_normalized, linkedin_url, website
    FROM companies
    WHERE merge_status <> 'merged_into'
      AND archived = false
  `);

  // Group by a SPACE-STRIPPED normalized name so spacing/case/punctuation twins
  // collapse together: "A B S Qatar" == "Abs Qatar" == "ABS-Qatar". name_normalized
  // has already lowercased, stripped punctuation and dropped legal-form words
  // (LLC/WLL); we additionally remove all whitespace here. The conflict gate
  // below still blocks any cluster whose members have differing LinkedIn/website
  // identities, so distinct companies that share a collapsed name won't fuse.
  const clusters = new Map();
  for (const r of all.rows) {
    // Recompute the key from the raw name with the CURRENT normalizer (not the
    // stored name_normalized, which may predate a normalizer change), then strip
    // all whitespace. This lets normalizer improvements (e.g. Unicode dash/quote
    // folding) fix existing rows on the next run without a full re-ingest.
    const n = normalizeName(r.name).replace(/\s+/g, '');
    if (n.length < 4) continue;   // too short to collapse safely
    let arr = clusters.get(n);
    if (!arr) { arr = []; clusters.set(n, arr); }
    arr.push(r);
  }

  // Stats counters
  let clustersFound      = 0;
  let clustersMerged     = 0;
  let clustersConflict   = 0;
  let rowsAbsorbed       = 0;
  let scanned            = 0;
  const totalGroups      = clusters.size;

  for (const members of clusters.values()) {
    scanned++;
    // Heartbeat every 1000 groups scanned so the panel shows progress even
    // while we whiz through the long tail of single-row "clusters".
    if (scanned % 1000 === 0) {
      jobLog?.(`  … scanned ${scanned.toLocaleString()}/${totalGroups.toLocaleString()} name groups (clusters merged ${clustersMerged}, rows absorbed ${rowsAbsorbed})`);
    }
    if (members.length < 2) continue;
    clustersFound++;

    // Conflict gate: distinct non-null LinkedIn URLs or website domains mean
    // the cluster is too ambiguous to auto-merge. Let the pair pass surface
    // these for manual review.
    const liUrls  = new Set(members.map(m => normalizeLinkedIn(m.linkedin_url)).filter(Boolean));
    const domains = new Set(members.map(m => normalizeDomain(m.website)).filter(Boolean));
    if (liUrls.size > 1 || domains.size > 1) {
      clustersConflict++;
      jobLog?.(`  ⚠ Skipped cluster "${members[0].name}" (${members.length} rows) — conflicting identifiers (linkedin=${liUrls.size}, websites=${domains.size})`);
      continue;
    }

    // Pick the richest row as canonical (re-use the existing pickCanonical
    // heuristic via a reduce-style loop, since pickCanonical only takes 2 IDs).
    const tPick = Date.now();
    let canonicalId = members[0].id;
    for (let i = 1; i < members.length; i++) {
      canonicalId = await pickCanonical(canonicalId, members[i].id);
    }
    const pickMs = Date.now() - tPick;
    const dupIds = members.filter(m => m.id !== canonicalId).map(m => m.id);

    jobLog?.(`  → Cluster "${members[0].name}" (${members.length} rows, pick=${pickMs}ms): merging ${dupIds.length} → #${canonicalId}`);

    // Merge each duplicate into canonical, in sequence. mergeCompanies handles
    // the COALESCE field-fill, source re-parent, contacts re-parent, and the
    // merged_registration_nos accumulation. After this loop the canonical row
    // owns every reg # the cluster contributed.
    let absorbedThisCluster = 0;
    for (let i = 0; i < dupIds.length; i++) {
      const dupId = dupIds[i];
      const tMerge = Date.now();
      try {
        await mergeCompanies(canonicalId, dupId, jobLog);
        const mergeMs = Date.now() - tMerge;
        rowsAbsorbed++;
        absorbedThisCluster++;
        // Audit trail row — pair-based decision schema (a<b convention).
        const [a, b] = canonicalId < dupId ? [canonicalId, dupId] : [dupId, canonicalId];
        const tAudit = Date.now();
        await upsertDedupCandidate({
          aId: a, bId: b,
          score: '1.000',
          reasonsJson: JSON.stringify(['name_exact_match', 'cluster_auto_merge']),
          decision: 'auto_merged',
          decidedBy: 'system',
        });
        const auditMs = Date.now() - tAudit;
        if (mergeMs > 500 || auditMs > 500 || (i + 1) % 10 === 0) {
          jobLog?.(`      [${i+1}/${dupIds.length}] dup #${dupId} → #${canonicalId}  (merge=${mergeMs}ms, audit=${auditMs}ms)`);
        }
      } catch (err) {
        jobLog?.(`    ✗ failed to merge ${dupId} → ${canonicalId} in cluster "${members[0].name}": ${err.message}`);
      }
    }

    clustersMerged++;
    jobLog?.(`  ✓ Cluster "${members[0].name}" (#${canonicalId}) — absorbed ${absorbedThisCluster}/${dupIds.length} duplicate(s)`);
  }

  jobLog?.(`▸ Cluster pre-merge complete — ${clustersFound.toLocaleString()} cluster(s) of ≥2 rows found, ${clustersMerged.toLocaleString()} merged, ${clustersConflict.toLocaleString()} skipped (conflicting identifiers), ${rowsAbsorbed.toLocaleString()} duplicate row(s) absorbed`);
  return {
    clusters_found:     clustersFound,
    clusters_merged:    clustersMerged,
    clusters_conflict:  clustersConflict,
    rows_absorbed:      rowsAbsorbed,
  };
}

// ---------------------------------------------------------------------------
// Entry point — run dedup pass + auto-merge + queue uncertain pairs
// ---------------------------------------------------------------------------
// Re-parent any contacts/sources stranded on a merged (dead) row onto their
// final canonical, then delete the strays. Idempotent — safe to run any time.
// Mirrors migrations/031; called at the end of every dedup run so the audit's
// "stranded on a dead row" checks stay at zero.
export async function healStrandedChildren() {
  await query(`
    INSERT INTO company_contacts (company_id, type, value, value_display, source, source_url, source_label, is_primary, is_verified, verified_at, extra_fields)
    SELECT c.canonical_id, cc.type, cc.value, cc.value_display, cc.source, cc.source_url, cc.source_label, cc.is_primary, cc.is_verified, cc.verified_at, cc.extra_fields
      FROM company_contacts cc JOIN companies c ON c.id = cc.company_id
     WHERE c.merge_status = 'merged_into' AND c.canonical_id IS NOT NULL
    ON CONFLICT (company_id, type, value) DO NOTHING`);
  // Same guard as the INSERT above: only delete rows whose contacts were actually
  // re-parented. Without `canonical_id IS NOT NULL` a merged_into row with no canonical
  // target loses its contacts outright — delete with no home to move to.
  const cDel = await query(`DELETE FROM company_contacts cc USING companies c
     WHERE cc.company_id = c.id AND c.merge_status = 'merged_into' AND c.canonical_id IS NOT NULL`);

  await query(`
    UPDATE company_sources cs SET company_id = c.canonical_id
      FROM companies c
     WHERE cs.company_id = c.id AND c.merge_status='merged_into' AND c.canonical_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM company_sources x
                        WHERE x.company_id = c.canonical_id AND x.source = cs.source AND x.source_record_id = cs.source_record_id)`);
  const sDel = await query(`DELETE FROM company_sources cs USING companies c
     WHERE cs.company_id = c.id AND c.merge_status = 'merged_into'`);

  await query(`
    INSERT INTO person_contacts (person_id, type, value, value_display, source, source_url, source_label, is_primary, is_verified, verified_at, extra_fields)
    SELECT p.canonical_id, pc.type, pc.value, pc.value_display, pc.source, pc.source_url, pc.source_label, pc.is_primary, pc.is_verified, pc.verified_at, pc.extra_fields
      FROM person_contacts pc JOIN people p ON p.id = pc.person_id
     WHERE p.merge_status = 'merged_into' AND p.canonical_id IS NOT NULL
    ON CONFLICT (person_id, type, value) DO NOTHING`);
  const pcDel = await query(`DELETE FROM person_contacts pc USING people p
     WHERE pc.person_id = p.id AND p.merge_status = 'merged_into'`);

  return { contacts: cDel.rowCount || 0, sources: sDel.rowCount || 0, person_contacts: pcDel.rowCount || 0 };
}

// Bulk-approve the high-confidence slice of the pending review queue: pairs
// that share an EXACT normalized name and have NO conflicting strong identity
// (no two different non-null websites or LinkedIn handles). These are the
// same-name pairs the cluster pass left for review only because some sibling in
// their group had a conflict — the pair itself is safe to merge. Pairs whose
// match is registration/fuzzy with DIFFERENT names are deliberately left in the
// queue for manual admin approval (Val's rule).
export async function bulkApproveExactName({ jobLog = null } = {}) {
  const pend = await query(`
    SELECT dc.id, dc.company_a_id AS a, dc.company_b_id AS b,
           a.website AS aw, a.linkedin_url AS al,
           b.website AS bw, b.linkedin_url AS bl
      FROM dedup_candidates dc
      JOIN companies a ON a.id = dc.company_a_id
      JOIN companies b ON b.id = dc.company_b_id
     WHERE dc.decision = 'pending'
       AND dc.similarity_reasons @> '["name_exact_match"]'::jsonb
     ORDER BY dc.id
  `);
  jobLog?.(`▸ ${pend.rows.length.toLocaleString()} exact-name pairs to assess`);

  let merged = 0, skipped = 0;
  const touched = new Set();
  for (const r of pend.rows) {
    if (touched.has(r.a) || touched.has(r.b)) { skipped++; continue; }

    const domA = normalizeDomain(r.aw),  domB = normalizeDomain(r.bw);
    const liA  = normalizeLinkedIn(r.al), liB = normalizeLinkedIn(r.bl);
    const webConflict = domA && domB && domA !== domB;
    const liConflict  = liA  && liB  && liA  !== liB;
    if (webConflict || liConflict) { skipped++; continue; }  // genuinely ambiguous — keep for manual review

    try {
      const canonical = await pickCanonical(r.a, r.b);
      const duplicate = canonical === r.a ? r.b : r.a;
      await mergeCompanies(canonical, duplicate, jobLog);
      await query(
        `UPDATE dedup_candidates SET decision='auto_merged', decided_at=now(), decided_by='bulk-approve' WHERE id=$1`,
        [r.id],
      );
      touched.add(duplicate);
      touched.add(canonical);
      merged++;
      if (merged % 200 === 0) jobLog?.(`  … merged ${merged.toLocaleString()} so far`);
    } catch (err) {
      jobLog?.(`  ✗ ${r.a}↔${r.b} failed: ${err.message}`);
      skipped++;
    }
  }

  const healed = await healStrandedChildren();
  jobLog?.(`▸ Bulk-approve done — merged ${merged.toLocaleString()}, skipped ${skipped.toLocaleString()} (conflicts/ambiguous) of ${pend.rows.length.toLocaleString()} exact-name pairs`);
  return { examined: pend.rows.length, merged, skipped, healed };
}

export async function runDedup({ jobLog = null } = {}) {
  jobLog?.(`▸ Starting dedup scan`);

  // Step 0 — exact-name cluster auto-merge. Runs BEFORE the pair-based scan so
  // the pair scan doesn't waste cycles flagging N(N-1)/2 pairs for groups we
  // already collapsed.
  const cluster = await clusterMergeByExactName({ jobLog });

  const pairs = await findCandidatePairs(jobLog);

  let autoMerged = 0, queued = 0, skippedBelow = 0;
  // Sort by score descending so high-confidence merges happen first and we
  // don't waste work merging into a row that itself will be merged later.
  pairs.sort((a, b) => b.score - a.score);

  // Track companies that have been merged this run; skip pairs that include them
  const mergedSet = new Set();

  for (const p of pairs) {
    if (mergedSet.has(p.a) || mergedSet.has(p.b)) continue;
    if (p.score < QUEUE_THRESHOLD) { skippedBelow++; continue; }

    const reasonsArr = [...p.reasons];

    // Auto-merge requires NAME agreement (exact or high-fuzzy) OR a globally
    // unique id (LinkedIn URL). A registration/website match alone — i.e. with
    // DIFFERENT names — must NOT auto-merge; it goes to the admin queue for
    // manual approval (Val's rule 2026-06-09: different names → admin approval).
    const nameAgree = p.reasons.has('name_exact_match') || p.reasons.has('fuzzy_name_high');
    if (hasUniqueIdMatch(p.reasons) || (p.score >= AUTO_THRESHOLD && nameAgree)) {
      // Auto-merge
      const canonical = await pickCanonical(p.a, p.b);
      const duplicate = canonical === p.a ? p.b : p.a;
      try {
        await mergeCompanies(canonical, duplicate, jobLog);
        autoMerged++;
        mergedSet.add(duplicate);
        // Record the auto-merge in the candidates table for the audit trail.
        await upsertDedupCandidate({
          aId: p.a, bId: p.b,
          score: p.score.toFixed(3),
          reasonsJson: JSON.stringify(reasonsArr),
          decision: 'auto_merged',
          decidedBy: 'system',
        });
      } catch (err) {
        jobLog?.(`    ✗ merge ${p.a}↔${p.b} failed: ${err.message}`);
      }
    } else {
      // Queue for admin review
      try {
        await upsertDedupCandidate({
          aId: p.a, bId: p.b,
          score: p.score.toFixed(3),
          reasonsJson: JSON.stringify(reasonsArr),
          // decision defaults to 'pending' inside the helper, and the helper
          // refuses to re-open any pair that's already been decided.
        });
        queued++;
      } catch (err) {
        jobLog?.(`    ✗ queue ${p.a}↔${p.b} failed: ${err.message}`);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Stale-pending cleanup. Without this, a pair that USED to qualify under the
  // old scoring (e.g. fuzzy_name + same_city + same_country) but does NOT
  // surface under the new scoring would linger forever as a pending row.
  // We remove any pending candidate that this run didn't touch.
  // ---------------------------------------------------------------------------
  const livePairKeys = new Set(pairs.map(p => `${p.a}:${p.b}`));
  const pendingRes = await query(
    `SELECT id, company_a_id, company_b_id
     FROM dedup_candidates
     WHERE decision = 'pending'`
  );
  const staleIds = pendingRes.rows
    .filter(r => !livePairKeys.has(`${r.company_a_id}:${r.company_b_id}`))
    .map(r => r.id);
  if (staleIds.length > 0) {
    await query(`DELETE FROM dedup_candidates WHERE id = ANY($1)`, [staleIds]);
    jobLog?.(`  Removed ${staleIds.length.toLocaleString()} stale pending pair(s) (no longer match current scoring rules)`);
  }

  // Self-heal — re-parent any child rows stranded on a merged (dead) row to the
  // canonical. Merges already re-parent, but a late write (backfill / ingest to
  // the phone column) can land on an already-merged row; this guarantees the
  // audit's "stranded on a dead row" checks stay at zero after every run.
  const healed = await healStrandedChildren();
  if (healed.contacts || healed.sources || healed.person_contacts) {
    jobLog?.(`  Healed stranded rows → canonical: ${healed.contacts} contact(s), ${healed.sources} source(s), ${healed.person_contacts} person contact(s)`);
  }

  jobLog?.(`▸ Dedup complete — cluster pre-merge absorbed ${cluster.rows_absorbed} row(s) across ${cluster.clusters_merged} cluster(s); pair pass auto-merged ${autoMerged}, queued ${queued}, skipped (below threshold) ${skippedBelow}, stale removed ${staleIds.length}`);
  return {
    cluster_pre_merge: cluster,
    auto_merged:       autoMerged,
    queued,
    skipped_below:     skippedBelow,
    stale_removed:     staleIds.length,
    total_pairs:       pairs.length,
  };
}

function hasUniqueIdMatch(reasons) {
  // Only LinkedIn URL is treated as a globally-unique identifier worth
  // auto-merging on its own. Google Maps place_id was deliberately removed
  // (see REASON_WEIGHTS comment): in Qatar one place_id can cover many
  // tenants, so it is no longer a unique-ID signal — or any signal at all.
  return reasons.has('linkedin_url_match');
}
