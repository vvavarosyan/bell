// Snowball ingestion. Reads derived_entities.{companies, people} from a
// finished research job and:
//   • creates new Qatar entities in the canonical tables (source='research')
//   • merges new datapoints into existing entities' extra_fields
//   • audits every action in research_derived_entities
//
// Conservative by design:
//   • Skip entries that lack a name.
//   • Skip companies that aren't Qatar-based (Bell is Qatar-scoped).
//   • For PEOPLE: require linkedin_url because people.linkedin_url is UNIQUE
//     NOT NULL in the schema. Without it we log 'skipped' for the audit and
//     move on — these can be picked up later by a relaxed ingestion or schema
//     change.

import { normalizeName } from '../ingest/normalize.js';

// Research can run on any deployment. On a prod-backed deployment (anything that
// is NOT the local engine) a newly-created entity must take its id from the
// high band so it can never collide with a local-originated id when the mirror
// later syncs. On the local engine, research-created rows are ordinary local
// rows (normal low-id sequence) and mirror up the usual way.
const MODE = (process.env.BDI_MODE || 'local-admin').toLowerCase();
const PROD_ORIGIN = MODE !== 'local-admin';

/**
 * Run the snowball ingestion for one job. Caller passes a pg client in a
 * transaction. Returns counts.
 */
export async function ingestDerivedEntities(client, jobId, derived) {
  const companies = Array.isArray(derived?.companies) ? derived.companies : [];
  const people    = Array.isArray(derived?.people)    ? derived.people    : [];

  let createdCompanies = 0, enrichedCompanies = 0, skippedCompanies = 0;
  let createdPeople    = 0, enrichedPeople    = 0, skippedPeople    = 0;

  for (const c of companies) {
    const result = await processCompany(client, jobId, c);
    if      (result.action === 'created')   createdCompanies++;
    else if (result.action === 'enriched')  enrichedCompanies++;
    else                                    skippedCompanies++;
  }
  for (const p of people) {
    const result = await processPerson(client, jobId, p);
    if      (result.action === 'created')   createdPeople++;
    else if (result.action === 'enriched')  enrichedPeople++;
    else                                    skippedPeople++;
  }

  return {
    companies: { created: createdCompanies, enriched: enrichedCompanies, skipped: skippedCompanies },
    people:    { created: createdPeople,    enriched: enrichedPeople,    skipped: skippedPeople },
  };
}

// ---------------------------------------------------------------------------
// Companies
// ---------------------------------------------------------------------------
async function processCompany(client, jobId, c) {
  const name = String(c?.name || '').trim();
  if (!name) return audit(client, jobId, 'company', null, 'skipped', null, 'missing name');

  const country = String(c?.country || 'Qatar').trim();
  const isQatar = !country || country.toLowerCase() === 'qatar';

  const normalized = normalizeName(name);
  const linkedinUrl    = clean(c.linkedin_url);
  const website        = clean(c.website);
  const registrationNo = clean(c.registration_no);

  // Match priority: linkedin_url → name_normalized → primary_registration_no
  let existing = null;
  if (linkedinUrl) {
    const r = await client.query(`SELECT id, extra_fields FROM companies WHERE linkedin_url = $1`, [linkedinUrl]);
    if (r.rows.length) existing = r.rows[0];
  }
  if (!existing && normalized) {
    const r = await client.query(`SELECT id, extra_fields FROM companies WHERE name_normalized = $1 LIMIT 1`, [normalized]);
    if (r.rows.length) existing = r.rows[0];
  }
  if (!existing && registrationNo) {
    const r = await client.query(`SELECT id, extra_fields FROM companies WHERE primary_registration_no = $1 LIMIT 1`, [registrationNo]);
    if (r.rows.length) existing = r.rows[0];
  }

  // NEW discovery (not already a live company) → goes to the approval holding pen
  // instead of straight into `companies`. Qatar → pending; non-Qatar → kept in
  // the admin-only international store. Dedupe against prior candidates so a
  // rejected / non-Qatar / already-queued company isn't re-added.
  if (!existing) {
    return processCandidate(client, jobId, c, {
      name, normalized, linkedinUrl, website, registrationNo, country, isQatar,
    });
  }

  if (existing) {
    // ENRICH: merge research findings into extra_fields without touching
    // formal columns (we don't trust agent output enough yet to overwrite
    // canonical values — that's a higher-confidence pipeline).
    const newExtras = {
      research_derived: {
        ...(existing.extra_fields?.research_derived || {}),
        [`from_job_${jobId}`]: {
          name, registration_no: registrationNo, website, linkedin_url: linkedinUrl,
          industry: clean(c.industry), city: clean(c.city),
          relation: clean(c.relation_to_target),
          derived_at: new Date().toISOString(),
        },
      },
    };
    await client.query(`
      UPDATE companies SET extra_fields = extra_fields || $2::jsonb WHERE id = $1
    `, [existing.id, JSON.stringify(newExtras)]);
    return audit(client, jobId, 'company', existing.id, 'enriched',
      { research_derived: newExtras.research_derived[`from_job_${jobId}`] },
      'merged into extra_fields.research_derived');
  }

  // (unreachable — !existing returns via processCandidate above)
}

// A newly-discovered company → the approval holding pen (research_candidates),
// NOT the live companies table. Qatar → 'pending' (awaits approval); non-Qatar →
// 'non_qatar' (kept admin-only for future expansion). If a matching candidate
// already exists we DON'T duplicate or re-open a decided one (remember rejection).
async function processCandidate(client, jobId, c, f) {
  const { name, normalized, linkedinUrl, website, registrationNo, country, isQatar } = f;

  // Dedupe against existing candidates (linkedin → name_normalized → reg).
  let cand = null;
  if (linkedinUrl) {
    const r = await client.query(`SELECT id, kind FROM research_candidates WHERE linkedin_url = $1 LIMIT 1`, [linkedinUrl]);
    if (r.rows.length) cand = r.rows[0];
  }
  if (!cand && normalized) {
    const r = await client.query(`SELECT id, kind FROM research_candidates WHERE name_normalized = $1 LIMIT 1`, [normalized]);
    if (r.rows.length) cand = r.rows[0];
  }
  if (!cand && registrationNo) {
    const r = await client.query(`SELECT id, kind FROM research_candidates WHERE primary_registration_no = $1 LIMIT 1`, [registrationNo]);
    if (r.rows.length) cand = r.rows[0];
  }

  if (cand) {
    // Already known. Don't re-open a decided one; just refresh the raw snapshot
    // on a still-pending/non-Qatar candidate so the queue shows latest findings.
    if (cand.kind === 'pending' || cand.kind === 'non_qatar') {
      await client.query(
        `UPDATE research_candidates SET raw = $2::jsonb, updated_at = now() WHERE id = $1`,
        [cand.id, JSON.stringify(c)],
      );
    }
    return audit(client, jobId, 'company', null, 'skipped', null,
      `already a ${cand.kind} candidate (#${cand.id})`);
  }

  // Insert a fresh candidate. On prod, id comes from the high band so it can be
  // pulled to local without colliding with local-originated candidate ids.
  const kind = isQatar ? 'pending' : 'non_qatar';
  const idExpr = PROD_ORIGIN ? `nextval('research_entity_id_seq'),` : '';
  const r = await client.query(`
    INSERT INTO research_candidates (
      ${PROD_ORIGIN ? 'id,' : ''}
      kind, name, name_normalized, country,
      primary_registration_no, website, linkedin_url, city, industry,
      relation_to_target, raw, discovered_from_job_id
    ) VALUES (${idExpr}$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)
    RETURNING id
  `, [
    kind, name, normalized, country || (isQatar ? 'Qatar' : null),
    registrationNo, website, linkedinUrl, clean(c.city), clean(c.industry),
    clean(c.relation_to_target), JSON.stringify(c), jobId,
  ]);
  const candId = Number(r.rows[0].id);
  return audit(client, jobId, 'company', null, 'skipped',
    { name, registration_no: registrationNo, website, linkedin_url: linkedinUrl, city: clean(c.city) },
    isQatar ? `queued for approval (pending #${candId})` : `stored — non-Qatar (#${candId})`);
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------
async function processPerson(client, jobId, p) {
  const fullName = String(p?.full_name || '').trim();
  if (!fullName) return audit(client, jobId, 'person', null, 'skipped', null, 'missing full_name');

  const linkedinUrl = clean(p.linkedin_url);
  // people.linkedin_url is UNIQUE NOT NULL — without it we cannot insert.
  if (!linkedinUrl) {
    return audit(client, jobId, 'person', null, 'skipped',
      { full_name: fullName, title: clean(p.title), company_name: clean(p.company_name) },
      'no linkedin_url; cannot ingest (schema requires it)');
  }

  // Match by linkedin_url (the canonical key)
  const existing = await client.query(`SELECT id, extra_fields FROM people WHERE linkedin_url = $1`, [linkedinUrl]);
  if (existing.rows.length) {
    const row = existing.rows[0];
    const newExtras = {
      research_derived: {
        ...(row.extra_fields?.research_derived || {}),
        [`from_job_${jobId}`]: {
          full_name: fullName,
          title: clean(p.title),
          company_name: clean(p.company_name),
          role_at_target: clean(p.role_at_target),
          derived_at: new Date().toISOString(),
        },
      },
    };
    await client.query(`UPDATE people SET extra_fields = extra_fields || $2::jsonb WHERE id = $1`,
      [row.id, JSON.stringify(newExtras)]);
    return audit(client, jobId, 'person', row.id, 'enriched',
      { research_derived: newExtras.research_derived[`from_job_${jobId}`] },
      'merged into extra_fields.research_derived');
  }

  try {
    const idExpr = PROD_ORIGIN ? `nextval('research_entity_id_seq'),` : '';
    const r = await client.query(`
      INSERT INTO people (${PROD_ORIGIN ? 'id,' : ''}full_name, headline, linkedin_url, country, extra_fields)
      VALUES (${idExpr}$1, $2, $3, 'Qatar', $4::jsonb)
      RETURNING id
    `, [
      fullName,
      clean(p.title),
      linkedinUrl,
      JSON.stringify({
        seed_source: 'research',
        seed_job_id: jobId,
        company_name_hint: clean(p.company_name),
        role_at_target: clean(p.role_at_target),
      }),
    ]);
    return audit(client, jobId, 'person', Number(r.rows[0].id), 'created',
      { full_name: fullName, title: clean(p.title), linkedin_url: linkedinUrl, company_name: clean(p.company_name) },
      null);
  } catch (err) {
    if (err && err.code === '23505') {
      return audit(client, jobId, 'person', null, 'skipped', null, 'unique violation: ' + err.constraint);
    }
    return audit(client, jobId, 'person', null, 'skipped', null, 'insert error: ' + err.message);
  }
}

// ---------------------------------------------------------------------------
// Audit log helper
// ---------------------------------------------------------------------------
async function audit(client, jobId, entityType, entityId, action, fieldsChanged, notes) {
  await client.query(`
    INSERT INTO research_derived_entities (job_id, entity_type, entity_id, action, fields_changed, notes)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6)
  `, [
    jobId, entityType,
    entityId || 0,                                  // 0 = sentinel for skipped/no-entity
    action,
    JSON.stringify(fieldsChanged || {}),
    notes || null,
  ]);
  return { action, entity_id: entityId };
}

function clean(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}
