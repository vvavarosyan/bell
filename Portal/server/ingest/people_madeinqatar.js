// Made in Qatar owners → people.
// ---------------------------------------------------------------------------
// The Made in Qatar exhibitor records each carry a "Company Owner" — a real
// decision-maker. After the exhibitor companies are ingested, this pass folds
// each owner in as a person (keyed by the GravityView entry id, no LinkedIn
// required) and links them to their company via person_companies with the title
// "Owner". Companies must already be ingested (extra_fields.madeinqatar_entry_id)
// so the link resolves; the company ingest runs first in the same pass.
//
// Idempotent: re-running updates the existing person (matched by entry id) and
// refreshes the company link.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const SERVER_DIR = path.dirname(path.dirname(__filename));
const WORKSPACE  = path.resolve(SERVER_DIR, '..', '..');
const FILE = path.join(WORKSPACE, 'Data', 'Companies', '1. Data Gathering',
  'Other Sources', 'Made in Qatar', 'scans', 'made_in_qatar_companies_latest.json');

// person_companies.source_stage = 0 marks a direct ingest link (not a LinkedIn
// enrichment stage).
const INGEST_STAGE = 0;

const nz = (v) => { const s = (v == null) ? '' : String(v).trim(); return s === '' ? null : s; };
function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts[parts.length - 1] };
}

export async function ingestMadeInQatarOwners(jobProgress) {
  let buf;
  try { buf = await fs.readFile(FILE, 'utf-8'); }
  catch { jobProgress?.('No Made in Qatar file yet — skipping owners ingest.'); return { people_new: 0, people_updated: 0, linked: 0, skipped: 0, total: 0 }; }

  const json = JSON.parse(buf);
  const rows = Array.isArray(json.companies) ? json.companies : [];
  const withOwner = rows.filter(r => nz(r.owner));
  jobProgress?.(`Exhibitors with an owner: ${withOwner.length.toLocaleString()} of ${rows.length.toLocaleString()}`);

  // Resync id sequences (explicit-id imports can leave bigserial behind MAX(id)).
  for (const t of ['people', 'person_companies']) {
    await query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), (SELECT COALESCE(MAX(id), 1) FROM ${t}))`);
  }

  // entry id → FINAL canonical company id (exhibitors ingested as MadeInQatar companies)
  const coMap = new Map();
  const cres = await query(
    `SELECT COALESCE(canonical_id, id) AS cid, extra_fields->>'madeinqatar_entry_id' AS eid
       FROM companies WHERE extra_fields ? 'madeinqatar_entry_id'`);
  for (const r of cres.rows) if (r.eid) coMap.set(String(r.eid), r.cid);

  let peopleNew = 0, peopleUpd = 0, linked = 0, skipped = 0;
  for (const c of withOwner) {
    const eid  = nz(c.entry_id);
    const full = nz(c.owner);
    if (!full || !eid) { skipped++; continue; }
    const { first, last } = splitName(full);

    const extra = {
      madeinqatar_owner_entry: eid,
      madeinqatar_company:     nz(c.name),
      source:                  'MadeInQatar',
    };

    // Upsert person by the synthetic owner key (entry id).
    const ex = await query(
      `SELECT id FROM people WHERE extra_fields->>'madeinqatar_owner_entry' = $1 LIMIT 1`, [eid]);
    let pid;
    if (ex.rows.length) {
      pid = ex.rows[0].id;
      await query(
        `UPDATE people
            SET full_name = $2,
                first_name = COALESCE(first_name, $3),
                last_name  = COALESCE(last_name, $4),
                headline   = COALESCE(NULLIF(headline, ''), 'Owner'),
                country    = COALESCE(country, 'Qatar'),
                extra_fields = extra_fields || $5::jsonb,
                updated_at = now()
          WHERE id = $1`,
        [pid, full, first, last, JSON.stringify(extra)]);
      peopleUpd++;
    } else {
      const ins = await query(
        `INSERT INTO people (full_name, first_name, last_name, headline, country, extra_fields)
         VALUES ($1, $2, $3, 'Owner', 'Qatar', $4::jsonb) RETURNING id`,
        [full, first, last, JSON.stringify(extra)]);
      pid = ins.rows[0].id;
      peopleNew++;
    }

    // Link to the employer company (if it resolved).
    const cid = coMap.get(String(eid));
    if (cid) {
      await query(
        `DELETE FROM person_companies WHERE person_id=$1 AND company_id=$2 AND source_stage=$3`,
        [pid, cid, INGEST_STAGE]);
      await query(
        `INSERT INTO person_companies (person_id, company_id, title, is_current, source_stage, raw_payload)
         VALUES ($1, $2, 'Owner', true, $3, $4::jsonb)`,
        [pid, cid, INGEST_STAGE, JSON.stringify({ owner: full, entry_id: eid })]);
      linked++;
    }
  }

  jobProgress?.(`Owners → people: ${peopleNew.toLocaleString()} new · ${peopleUpd.toLocaleString()} updated · ${linked.toLocaleString()} linked to company · ${skipped} skipped`);
  return { people_new: peopleNew, people_updated: peopleUpd, linked, skipped, total: withOwner.length };
}
