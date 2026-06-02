// Local-engine side of the REVERSE sync: pull research-originated companies and
// people back from prod so the local database (the source of truth) also holds
// the entities that were created/enriched by research jobs that ran on bell.qa.
//
// Why this exists: research runs on whichever deployment the job was started on.
// Jobs started on bell.qa execute on Railway and write new rows directly to the
// prod DB. The forward mirror (push.js) is one-way (local→prod), so without this
// pull those rows would never reach local — and a mirror rebuild would delete
// them. With it, the two databases converge.
//
// Apply rules:
//   • CREATED entities carry a HIGH-band id (>= 2,000,000,000, see migration
//     0017). They don't exist locally → full upsert by id, preserving the id.
//   • ENRICHED entities have a LOW (local-originated) id and already exist
//     locally. We must NOT clobber their local canonical columns, so we only
//     merge the research_derived subtree of extra_fields.
//
// The pull is driven from local (prod cannot reach the Mac) and runs just BEFORE
// each push, so local first absorbs prod's research changes and then re-asserts
// the unified state upward.

import { query } from '../db.js';
import { getKey } from '../keychain.js';

const HIGH_BASE = 2000000000;
const EPOCH = '1970-01-01T00:00:00Z';
const SETTINGS_PULL_WATERMARK = 'sync_pull_last_at';
const SETTINGS_TARGET_URL = 'sync_target_url';
const DEFAULT_TARGET = 'https://app.bell.qa';

async function getSetting(key) {
  const r = await query(`SELECT value FROM settings WHERE key = $1`, [key]);
  return r.rows.length ? r.rows[0].value : null;
}
async function setSetting(key, value) {
  await query(
    `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}
async function resolveBase() {
  const fromSettings = await getSetting(SETTINGS_TARGET_URL);
  return (fromSettings || process.env.BDI_SYNC_TARGET_URL || DEFAULT_TARGET)
    .toString().replace(/\/+$/, '');
}

// ---- local column metadata (for the dynamic upsert of created rows) ---------
const _colCache = new Map();
async function getLocalColumnMeta(table) {
  if (_colCache.has(table)) return _colCache.get(table);
  const r = await query(
    `SELECT column_name, data_type, udt_name
       FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1`,
    [table]
  );
  const meta = {};
  for (const row of r.rows) meta[row.column_name] = row;
  _colCache.set(table, meta);
  return meta;
}
const q = (id) => `"${String(id).replace(/"/g, '""')}"`;
function isJsonb(m) {
  return m && (m.data_type === 'jsonb' || m.udt_name === 'jsonb'
            || m.data_type === 'json'  || m.udt_name === 'json');
}

// Upsert a set of full rows into a local table, preserving their ids. Columns
// are intersected with the local schema so the upsert tolerates any column prod
// has that local doesn't (and vice-versa). `conflict`:
//   'update' → ON CONFLICT (id) DO UPDATE (mirror prod's values)
//   'ignore' → ON CONFLICT (id) DO NOTHING (keep local — used for candidates so
//              a local approve/reject decision is never reverted by a re-pull)
async function upsertFullRows(table, rows, conflict = 'update') {
  if (!rows.length) return 0;
  const meta = await getLocalColumnMeta(table);
  let done = 0;
  for (const row of rows) {
    const cols = Object.keys(row).filter((k) => meta[k]);
    if (!cols.includes('id')) continue;
    const vals = cols.map((c) => (row[c] != null && isJsonb(meta[c])) ? JSON.stringify(row[c]) : row[c]);
    const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
    const tail = conflict === 'ignore'
      ? 'ON CONFLICT (id) DO NOTHING'
      : 'ON CONFLICT (id) DO UPDATE SET ' + cols.filter((c) => c !== 'id').map((c) => `${q(c)} = EXCLUDED.${q(c)}`).join(', ');
    try {
      await query(
        `INSERT INTO ${q(table)} (${cols.map(q).join(', ')}) VALUES (${placeholders}) ${tail}`,
        vals
      );
      done++;
    } catch (err) {
      console.warn(`[pull] upsert ${table} id=${row.id} failed: ${err.message}`);
    }
  }
  // We do NOT advance the local id sequence to the high band — local must keep
  // issuing LOW ids — so nothing to do here.
  return done;
}

// Merge ONLY the research_derived subtree for ENRICHED low-id entities so local
// canonical columns are never overwritten by prod.
async function mergeResearchDerived(table, rows) {
  let done = 0;
  for (const row of rows) {
    const rd = row.extra_fields && row.extra_fields.research_derived;
    if (!rd) continue;
    try {
      await query(
        `UPDATE ${q(table)}
            SET extra_fields = jsonb_set(
                  coalesce(extra_fields, '{}'::jsonb),
                  '{research_derived}',
                  coalesce(extra_fields->'research_derived', '{}'::jsonb) || $2::jsonb
                )
          WHERE id = $1`,
        [row.id, JSON.stringify(rd)]
      );
      done++;
    } catch (err) {
      console.warn(`[pull] merge ${table} id=${row.id} failed: ${err.message}`);
    }
  }
  return done;
}

function split(rows) {
  const created = [], enriched = [];
  for (const r of rows) (Number(r.id) >= HIGH_BASE ? created : enriched).push(r);
  return { created, enriched };
}

// Absorb prod-discovered approval candidates into the LOCAL holding pen. We
// dedupe by NATURAL key (linkedin → name_normalized → reg) and assign a fresh
// LOCAL id (candidates aren't id-mirrored), so re-discovery on prod never
// duplicates a candidate locally, and a local approve/reject decision is never
// overwritten. Returns the prod ids we absorbed so the caller can drain them
// from prod (non-displayed companies must not accumulate in the online DB).
async function absorbCandidates(rows) {
  let inserted = 0;
  const absorbedProdIds = [];
  for (const c of rows) {
    absorbedProdIds.push(Number(c.id));
    // Already known locally? (by linkedin / name_normalized / reg)
    let match = null;
    if (c.linkedin_url) {
      const r = await query(`SELECT id FROM research_candidates WHERE linkedin_url = $1 LIMIT 1`, [c.linkedin_url]);
      if (r.rows.length) match = r.rows[0];
    }
    if (!match && c.name_normalized) {
      const r = await query(`SELECT id FROM research_candidates WHERE name_normalized = $1 LIMIT 1`, [c.name_normalized]);
      if (r.rows.length) match = r.rows[0];
    }
    if (!match && c.primary_registration_no) {
      const r = await query(`SELECT id FROM research_candidates WHERE primary_registration_no = $1 LIMIT 1`, [c.primary_registration_no]);
      if (r.rows.length) match = r.rows[0];
    }
    if (match) continue;   // already in the local pen — keep local decision/state

    try {
      await query(`
        INSERT INTO research_candidates
          (kind, name, name_normalized, country, primary_registration_no, website,
           linkedin_url, city, industry, relation_to_target, raw,
           discovered_from_job_id, discovered_at, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)
      `, [
        ['pending','non_qatar','rejected','approved'].includes(c.kind) ? c.kind : 'pending',
        c.name, c.name_normalized, c.country, c.primary_registration_no, c.website,
        c.linkedin_url, c.city, c.industry, c.relation_to_target,
        JSON.stringify(c.raw || {}), c.discovered_from_job_id, c.discovered_at || new Date().toISOString(),
        c.notes || null,
      ]);
      inserted++;
    } catch (err) {
      console.warn(`[pull] candidate insert failed (prod id=${c.id}): ${err.message}`);
    }
  }
  return { inserted, absorbedProdIds };
}

// Absorb research-created employment links into local, keyed by the natural
// (person_id, company_id) pair so re-pulls don't duplicate. The link's ids
// reference mirrored entities, but we skip any whose person or company isn't
// present locally yet (FK safety).
async function absorbPersonLinks(rows) {
  let inserted = 0;
  for (const l of rows) {
    try {
      const ok = await query(
        `SELECT
            EXISTS(SELECT 1 FROM people    WHERE id = $1) AS has_person,
            EXISTS(SELECT 1 FROM companies WHERE id = $2) AS has_company`,
        [l.person_id, l.company_id]
      );
      if (!ok.rows[0].has_person || !ok.rows[0].has_company) continue;
      const dup = await query(
        `SELECT 1 FROM person_companies WHERE person_id = $1 AND company_id = $2 LIMIT 1`,
        [l.person_id, l.company_id]
      );
      if (dup.rows.length) continue;
      // Preserve the prod (high-band) id so a later local push re-asserts the
      // SAME prod row instead of colliding with a local low id.
      await query(`
        INSERT INTO person_companies (id, person_id, company_id, title, is_current, source_stage, raw_payload)
        VALUES ($1, $2, $3, $4, COALESCE($5, true), COALESCE($6, 0), $7::jsonb)
        ON CONFLICT (id) DO NOTHING
      `, [l.id, l.person_id, l.company_id, l.title, l.is_current, l.source_stage, JSON.stringify(l.raw_payload || {})]);
      inserted++;
    } catch (err) {
      console.warn(`[pull] person_link insert failed (${l.person_id}->${l.company_id}): ${err.message}`);
    }
  }
  return inserted;
}

// Absorb research-created company facts into local, preserving the prod
// (high-band) id so a later push re-asserts the same prod row. Skips rows whose
// company isn't present locally (FK safety). ON CONFLICT (id) handles re-pulls.
async function absorbFacts(table, rows) {
  if (!rows.length) return 0;
  const meta = await getLocalColumnMeta(table);
  let inserted = 0;
  for (const row of rows) {
    try {
      const has = await query(`SELECT 1 FROM companies WHERE id = $1`, [row.company_id]);
      if (!has.rows.length) continue;
      const cols = Object.keys(row).filter((k) => meta[k]);
      if (!cols.includes('id')) continue;
      const vals = cols.map((c) => (row[c] != null && isJsonb(meta[c])) ? JSON.stringify(row[c]) : row[c]);
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      await query(
        `INSERT INTO ${q(table)} (${cols.map(q).join(', ')}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
        vals
      );
      inserted++;
    } catch (err) {
      console.warn(`[pull] ${table} insert failed (id=${row.id}): ${err.message}`);
    }
  }
  return inserted;
}

async function drainProdCandidates(base, token, ids) {
  if (!ids.length) return 0;
  const res = await fetch(base + '/api/sync/research-candidates-drain', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ ids }),
  });
  if (!res.ok) throw new Error(`drain HTTP ${res.status}`);
  const body = await res.json().catch(() => ({}));
  return body.deleted || 0;
}

/**
 * Pull research-originated entities from prod into local. Returns a summary.
 * Safe to call with no token / unreachable prod — it just reports an error and
 * leaves the watermark untouched so the next attempt retries the same window.
 */
export async function runPull() {
  const token = await getKey('sync-token');
  if (!token) return { skipped: true, reason: 'no_sync_token' };
  const base = await resolveBase();
  const since = (await getSetting(SETTINGS_PULL_WATERMARK)) || EPOCH;

  const res = await fetch(base + '/api/sync/research-pull', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ since }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = { raw: text }; }
  if (!res.ok) throw new Error(`research-pull HTTP ${res.status}: ${body.error || text.slice(0, 200)}`);

  const companies = split(body.companies || []);
  const people    = split(body.people    || []);

  const summary = {
    since, watermark: body.watermark,
    companies_created:  await upsertFullRows('companies', companies.created),
    companies_enriched: await mergeResearchDerived('companies', companies.enriched),
    people_created:     await upsertFullRows('people', people.created),
    people_enriched:    await mergeResearchDerived('people', people.enriched),
  };

  // Research-created employment links → keep people connected to companies locally.
  summary.person_links = await absorbPersonLinks(body.person_links || []);

  // Rich research facts (financials / shareholders / partnerships).
  const f = body.facts || {};
  summary.financials   = await absorbFacts('company_financials',   f.company_financials   || []);
  summary.shareholders = await absorbFacts('company_shareholders', f.company_shareholders || []);
  summary.partnerships = await absorbFacts('company_partnerships', f.company_partnerships || []);

  // Approval candidates: absorb into the LOCAL pen (dedupe by natural key), then
  // DRAIN them from prod so non-displayed companies never accumulate online.
  const cand = await absorbCandidates(body.candidates || []);
  summary.candidates_absorbed = cand.inserted;
  try {
    summary.candidates_drained = await drainProdCandidates(base, token, cand.absorbedProdIds);
  } catch (err) {
    summary.candidates_drained = 0;
    summary.candidate_drain_error = err.message;
  }

  // Advance the pull watermark only after a clean apply, so a mid-pull failure
  // re-pulls the same window next time (the applies are idempotent).
  await setSetting(SETTINGS_PULL_WATERMARK, body.watermark);
  return summary;
}
