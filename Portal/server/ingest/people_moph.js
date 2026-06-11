// MoPH/DHP practitioners → people.
// ---------------------------------------------------------------------------
// Reads scans/moph_practitioners_latest.json and upserts each licensed
// practitioner as a person (keyed by license number, no LinkedIn required —
// see migration 032), then links them to their employer facility via
// person_companies. Facilities must already be ingested as MoPH companies
// (extra_fields.moph_facility_id) so the link can resolve; the company ingest
// runs first in the same pass.
//
// Idempotent: re-running updates existing people (matched by license) and
// refreshes the facility link.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const SERVER_DIR = path.dirname(path.dirname(__filename));
const WORKSPACE  = path.resolve(SERVER_DIR, '..', '..');
const FILE = path.join(WORKSPACE, 'Data', 'Companies', '1. Data Gathering',
  'Other Sources', 'MoPH', 'scans', 'moph_practitioners_latest.json');

// person_companies.source_stage is "which enrichment stage produced this link";
// 0 marks a direct ingest link (not LinkedIn enrichment stages 1-6).
const INGEST_STAGE = 0;

const nz = (v) => { const s = (v == null) ? '' : String(v).trim(); return s === '' ? null : s; };
function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts[parts.length - 1] };
}

export async function ingestMophPractitioners(jobProgress) {
  let buf;
  try { buf = await fs.readFile(FILE, 'utf-8'); }
  catch { jobProgress?.('No practitioners file yet — skipping people ingest.'); return { people_new: 0, people_updated: 0, linked: 0, skipped: 0, total: 0 }; }

  const json = JSON.parse(buf);
  const rows = Array.isArray(json.people) ? json.people : [];
  jobProgress?.(`Practitioners in file: ${rows.length.toLocaleString()}`);

  // facility id → FINAL canonical company id (facilities ingested as MoPH companies)
  const facMap = new Map();
  const fres = await query(
    `SELECT COALESCE(canonical_id, id) AS cid, extra_fields->>'moph_facility_id' AS fid
       FROM companies WHERE extra_fields ? 'moph_facility_id'`);
  for (const r of fres.rows) if (r.fid) facMap.set(String(r.fid), r.cid);

  let peopleNew = 0, peopleUpd = 0, linked = 0, skipped = 0;
  for (const p of rows) {
    const lic  = nz(p.license_number);
    const full = nz(p.full_name);
    if (!full || !lic) { skipped++; continue; }
    const { first, last } = splitName(full);
    const scope = nz(p.scope_of_practice);

    const extra = {
      moph_license_no:     lic,
      moph_scope:          scope,
      moph_license_expiry: nz(p.license_expiry),
      moph_provisional:    !!p.provisional,
      moph_facility_id:    nz(p.facility_id),
      moph_facility_name:  nz(p.place_of_work) || nz(p.facility_name),
      source:              'MoPH',
    };

    // Upsert person by license number (select-then-write; mirrors stage3).
    const ex = await query(`SELECT id FROM people WHERE extra_fields->>'moph_license_no' = $1 LIMIT 1`, [lic]);
    let pid;
    if (ex.rows.length) {
      pid = ex.rows[0].id;
      await query(
        `UPDATE people
            SET full_name = $2,
                first_name = COALESCE(first_name, $3),
                last_name  = COALESCE(last_name, $4),
                headline   = $5,
                country    = COALESCE(country, 'Qatar'),
                extra_fields = extra_fields || $6::jsonb,
                updated_at = now()
          WHERE id = $1`,
        [pid, full, first, last, scope, JSON.stringify(extra)]);
      peopleUpd++;
    } else {
      const ins = await query(
        `INSERT INTO people (full_name, first_name, last_name, headline, country, extra_fields)
         VALUES ($1, $2, $3, $4, 'Qatar', $5::jsonb) RETURNING id`,
        [full, first, last, scope, JSON.stringify(extra)]);
      pid = ins.rows[0].id;
      peopleNew++;
    }

    // Link to the employer facility (if it resolved to a company).
    const cid = facMap.get(String(p.facility_id));
    if (cid) {
      await query(
        `DELETE FROM person_companies WHERE person_id=$1 AND company_id=$2 AND source_stage=$3`,
        [pid, cid, INGEST_STAGE]);
      await query(
        `INSERT INTO person_companies (person_id, company_id, title, is_current, source_stage, raw_payload)
         VALUES ($1, $2, $3, true, $4, $5::jsonb)`,
        [pid, cid, scope, INGEST_STAGE, JSON.stringify(p)]);
      linked++;
    }
  }

  jobProgress?.(`Practitioners → people: ${peopleNew.toLocaleString()} new · ${peopleUpd.toLocaleString()} updated · ${linked.toLocaleString()} linked to facility · ${skipped} skipped`);
  return { people_new: peopleNew, people_updated: peopleUpd, linked, skipped, total: rows.length };
}
