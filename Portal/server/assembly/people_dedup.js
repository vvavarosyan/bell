// Phase 5 (people) — CONSERVATIVE people dedup.
// ---------------------------------------------------------------------------
// People names collide heavily ("Mohammed Ahmed" = many different humans), so
// unlike companies we do NOT auto-merge on name. Policy (Val 2026-06-11):
//   • AUTO-MERGE only on a truly-unique signal: a shared non-role email.
//     (LinkedIn URL is already UNIQUE so duplicates can't exist; MoPH licenses
//      are unique per practitioner and single-source, so they never cross-match.)
//   • QUEUE for manual review: same normalized name AND a shared employer
//     company. This is how a MoPH practitioner (no LinkedIn/email) can be linked
//     to a LinkedIn person — but only after the admin approves it.
//
// Mirrors the company dedup model: people.canonical_id / merge_status +
// person_dedup_candidates (pending → admin decides). mergePeople re-parents
// person_companies + person_contacts and is lossless.

import { query, withTransaction } from '../db.js';
import { normalizeEmail, isJunkEmail } from '../lib/contacts.js';

const QUEUE_SCORE = 0.700;

// Richer of two people becomes canonical (more populated fields; tie → lower id).
async function pickPersonCanonical(idA, idB) {
  const r = await query(`
    SELECT id,
      ((linkedin_url IS NOT NULL)::int + (email IS NOT NULL)::int + (phone IS NOT NULL)::int
       + (headline IS NOT NULL)::int + (location_text IS NOT NULL)::int
       + (profile_picture_url IS NOT NULL)::int + (pin IS NOT NULL)::int) AS score
      FROM people WHERE id = ANY($1)`, [[idA, idB]]);
  let best = null;
  for (const row of r.rows) {
    if (!best || row.score > best.score || (row.score === best.score && row.id < best.id)) best = row;
  }
  return best ? best.id : Math.min(idA, idB);
}

// Lossless merge of two people. Re-parents employment links + contacts, fills
// the canonical's NULL columns from the duplicate, flattens any chain.
export async function mergePeople(canonicalId, duplicateId, jobLog = null) {
  if (!canonicalId || !duplicateId || canonicalId === duplicateId) return;
  await withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT id, extra_fields, linkedin_url, linkedin_public_id FROM people WHERE id = ANY($1)`,
      [[canonicalId, duplicateId]]);
    const canon = rows.find(r => r.id === canonicalId) || {};
    const dup   = rows.find(r => r.id === duplicateId) || {};
    // Canonical wins on key conflicts; duplicate fills the rest.
    const mergedExtra = Object.assign({}, dup.extra_fields || {}, canon.extra_fields || {});

    // linkedin_url is UNIQUE — free the duplicate's BEFORE moving it onto the
    // canonical, so the two rows never momentarily share it (constraint is immediate).
    const dupLinkedin   = dup.linkedin_url || null;
    const dupLinkedinId = dup.linkedin_public_id || null;
    await client.query(`UPDATE people SET linkedin_url = NULL, linkedin_public_id = NULL WHERE id = $1`, [duplicateId]);

    // Fill the canonical's NULL columns (never overwrite a populated value).
    await client.query(`
      UPDATE people c SET
        full_name           = COALESCE(c.full_name, d.full_name),
        first_name          = COALESCE(c.first_name, d.first_name),
        last_name           = COALESCE(c.last_name, d.last_name),
        headline            = COALESCE(c.headline, d.headline),
        linkedin_url        = COALESCE(c.linkedin_url, $3),
        linkedin_public_id  = COALESCE(c.linkedin_public_id, $4),
        email               = COALESCE(c.email, d.email),
        phone               = COALESCE(c.phone, d.phone),
        location_text       = COALESCE(c.location_text, d.location_text),
        country             = COALESCE(c.country, d.country),
        city                = COALESCE(c.city, d.city),
        summary             = COALESCE(c.summary, d.summary),
        profile_picture_url = COALESCE(c.profile_picture_url, d.profile_picture_url),
        pin                 = COALESCE(c.pin, d.pin),
        extra_fields        = $5::jsonb,
        updated_at          = now()
      FROM people d
      WHERE c.id = $1 AND d.id = $2`,
      [canonicalId, duplicateId, dupLinkedin, dupLinkedinId, JSON.stringify(mergedExtra)]);

    // Re-parent employment links (unique on person_id,company_id,start_date,title).
    await client.query(`
      UPDATE person_companies pc SET person_id = $1
       WHERE pc.person_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM person_companies x
            WHERE x.person_id = $1 AND x.company_id = pc.company_id
              AND COALESCE(x.start_date,'1970-01-01') = COALESCE(pc.start_date,'1970-01-01')
              AND COALESCE(x.title,'') = COALESCE(pc.title,''))`, [canonicalId, duplicateId]);
    await client.query(`DELETE FROM person_companies WHERE person_id = $1`, [duplicateId]);

    // Collapse duplicate CURRENT links to the same employer (a person has one
    // current role per company). Keep the most useful title: a real designation
    // beats a blank or facility-name-as-title; then the longest; then oldest id.
    await client.query(`
      WITH ranked AS (
        SELECT pc.id, row_number() OVER (
          PARTITION BY pc.person_id, pc.company_id, pc.is_current
          ORDER BY (CASE WHEN pc.title IS NULL OR btrim(pc.title) = '' THEN 0
                         WHEN lower(btrim(pc.title)) = lower(btrim(c.name)) THEN 0
                         ELSE 1 END) DESC,
                   (CASE WHEN pc.source_stage = 0 AND coalesce(btrim(pc.title),'') <> '' THEN 1 ELSE 0 END) DESC,
                   length(coalesce(pc.title, '')) DESC, pc.id ASC) AS rn
          FROM person_companies pc JOIN companies c ON c.id = pc.company_id
         WHERE pc.person_id = $1
      )
      DELETE FROM person_companies WHERE id IN (SELECT id FROM ranked WHERE rn > 1)`, [canonicalId]);

    // Re-parent contacts (unique on person_id,type,value).
    await client.query(`
      INSERT INTO person_contacts (person_id, type, value, value_display, source, source_url, source_label, is_primary, is_verified, verified_at, extra_fields)
      SELECT $1, type, value, value_display, source, source_url, source_label, is_primary, is_verified, verified_at, extra_fields
        FROM person_contacts WHERE person_id = $2
      ON CONFLICT (person_id, type, value) DO NOTHING`, [canonicalId, duplicateId]);
    await client.query(`DELETE FROM person_contacts WHERE person_id = $1`, [duplicateId]);

    // Mark duplicate, flatten any chain pointing at it, mark canonical.
    await client.query(`UPDATE people SET canonical_id = $1, merge_status='merged_into', archived=true, updated_at=now() WHERE id = $2`, [canonicalId, duplicateId]);
    await client.query(`UPDATE people SET canonical_id = $1 WHERE canonical_id = $2`, [canonicalId, duplicateId]);
    await client.query(`UPDATE people SET merge_status='canonical', updated_at=now() WHERE id = $1`, [canonicalId]);
  });
  jobLog?.(`    ✓ merged person ${duplicateId} → ${canonicalId}`);
}

// Record a pending review pair (a<b convention; never re-open a decided pair).
async function queuePair(aId, bId, reasons) {
  const a = Math.min(aId, bId), b = Math.max(aId, bId);
  if (a === b) return;
  await query(`
    INSERT INTO person_dedup_candidates (person_a_id, person_b_id, similarity_score, similarity_reasons)
    VALUES ($1, $2, $3, $4::jsonb)
    ON CONFLICT (person_a_id, person_b_id) DO NOTHING`,
    [a, b, QUEUE_SCORE, JSON.stringify(reasons)]);
}

export async function runPeopleDedup({ jobLog = null } = {}) {
  jobLog?.(`▸ People dedup (conservative)`);

  // 1) AUTO-MERGE by shared personal email. Group live people by email; within a
  //    group merge everyone into one canonical. Skip role/junk emails.
  const emailGroups = await query(`
    SELECT lower(trim(email::text)) AS em, array_agg(id ORDER BY id) AS ids
      FROM people
     WHERE email IS NOT NULL
       AND merge_status IN ('standalone','canonical') AND archived = false
     GROUP BY 1 HAVING count(*) > 1`);
  let autoMerged = 0;
  for (const g of emailGroups.rows) {
    const em = normalizeEmail(g.em);
    if (!em || isJunkEmail(em)) continue;     // shared info@/no-reply etc. → not a person key
    const ids = g.ids;
    let canonical = ids[0];
    for (let i = 1; i < ids.length; i++) canonical = await pickPersonCanonical(canonical, ids[i]);
    for (const id of ids) {
      if (id === canonical) continue;
      try { await mergePeople(canonical, id, jobLog); autoMerged++; } catch (e) { jobLog?.(`    ✗ email-merge ${id}: ${e.message}`); }
    }
  }

  // 2) QUEUE name + shared-employer matches for manual review. Same normalized
  //    full name AND at least one shared employer company → candidate pair.
  const pairs = await query(`
    WITH live AS (
      SELECT id, lower(regexp_replace(coalesce(full_name,''),'[^a-z0-9]','','g')) AS nn
        FROM people
       WHERE merge_status IN ('standalone','canonical') AND archived = false
    ),
    named AS (SELECT id, nn FROM live WHERE length(nn) >= 5)
    SELECT a.id AS a, b.id AS b
      FROM named a JOIN named b ON a.nn = b.nn AND a.id < b.id
     WHERE EXISTS (
       SELECT 1 FROM person_companies pa
        JOIN person_companies pb ON pa.company_id = pb.company_id
        WHERE pa.person_id = a.id AND pb.person_id = b.id)
     LIMIT 20000`);
  let queued = 0;
  for (const p of pairs.rows) { await queuePair(p.a, p.b, ['name_company_match']); queued++; }

  jobLog?.(`▸ People dedup complete — auto-merged ${autoMerged} (shared email), queued ${queued} (name + shared employer) for review`);
  return { auto_merged: autoMerged, queued };
}
