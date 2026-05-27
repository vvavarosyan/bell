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
  if (country && country.toLowerCase() !== 'qatar') {
    return audit(client, jobId, 'company', null, 'skipped', null, 'non-Qatar entity');
  }

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

  // CREATE: new Qatar company seeded by research. Goes through normal
  // enrichment pipeline from Stage 1 onward.
  try {
    const r = await client.query(`
      INSERT INTO companies (
        name, name_normalized,
        is_active, status_normalized,
        primary_registration_no, website, linkedin_url, city, country,
        industry,
        extra_fields
      ) VALUES ($1,$2,true,'unknown',$3,$4,$5,$6,$7,$8,$9::jsonb)
      RETURNING id
    `, [
      name, normalized,
      registrationNo, website, linkedinUrl,
      clean(c.city) || 'Doha', 'Qatar',
      clean(c.industry),
      JSON.stringify({
        seed_source: 'research',
        seed_job_id: jobId,
        relation_to_target: clean(c.relation_to_target),
      }),
    ]);
    const companyId = Number(r.rows[0].id);

    // Provenance row — same shape ingest runner uses
    await client.query(`
      INSERT INTO company_sources (company_id, source, source_record_id, source_url, raw_payload)
      VALUES ($1, 'research', $2, NULL, $3::jsonb)
      ON CONFLICT DO NOTHING
    `, [companyId, `research:job-${jobId}:` + (normalized || name).slice(0, 60), JSON.stringify(c)]);

    return audit(client, jobId, 'company', companyId, 'created',
      { name, registration_no: registrationNo, website, linkedin_url: linkedinUrl, city: clean(c.city) },
      null);
  } catch (err) {
    // Unique violation on linkedin_url race — treat as a soft enrichment
    if (err && err.code === '23505') {
      return audit(client, jobId, 'company', null, 'skipped', null, 'unique violation: ' + err.constraint);
    }
    return audit(client, jobId, 'company', null, 'skipped', null, 'insert error: ' + err.message);
  }
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
    const r = await client.query(`
      INSERT INTO people (full_name, headline, linkedin_url, country, extra_fields)
      VALUES ($1, $2, $3, 'Qatar', $4::jsonb)
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
