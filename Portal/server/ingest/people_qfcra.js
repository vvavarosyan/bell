// QFCRA approved individuals → people.
// ---------------------------------------------------------------------------
// Reads the QFCRA scan (companies + people) and upserts each approved individual
// as a person (keyed by AI number — the QFCRA Approved-Individual number, no
// LinkedIn required), then links them to every firm they hold a controlled
// function at via person_companies (title = the controlled function). Firms must
// already be ingested as QFCRA companies (extra_fields.qfcra_qfc_number) so the
// links resolve; the company ingest runs first in the same pass.
//
// Idempotent: re-running updates the existing person (matched by AI number) and
// refreshes their firm links.

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { query } from '../db.js';

const __filename = fileURLToPath(import.meta.url);
const SERVER_DIR = path.dirname(path.dirname(__filename));
const WORKSPACE  = path.resolve(SERVER_DIR, '..', '..');
const FILE = path.join(WORKSPACE, 'Data', 'Companies', '1. Data Gathering',
  'Other Sources', 'QFCRA', 'scans', 'qfcra_latest.json');

const INGEST_STAGE = 0; // direct ingest link (not a LinkedIn enrichment stage)

const nz = (v) => { const s = (v == null) ? '' : String(v).trim(); return s === '' ? null : s; };
function splitName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: null, last: null };
  if (parts.length === 1) return { first: parts[0], last: null };
  return { first: parts[0], last: parts[parts.length - 1] };
}

export async function ingestQfcraPeople(jobProgress) {
  let buf;
  try { buf = await fs.readFile(FILE, 'utf-8'); }
  catch { jobProgress?.('No QFCRA file yet — skipping people ingest.'); return { people_new: 0, people_updated: 0, linked: 0, skipped: 0, total: 0 }; }

  const json = JSON.parse(buf);
  const rows = Array.isArray(json.people) ? json.people : [];
  jobProgress?.(`Approved individuals in file: ${rows.length.toLocaleString()}`);

  // Resync id sequences (explicit-id imports can leave bigserial behind MAX(id)).
  for (const t of ['people', 'person_companies']) {
    await query(`SELECT setval(pg_get_serial_sequence('${t}', 'id'), (SELECT COALESCE(MAX(id), 1) FROM ${t}))`);
  }

  // QFC number → FINAL canonical company id (firms ingested as QFCRA companies).
  const firmMap = new Map();
  const fres = await query(
    `SELECT COALESCE(canonical_id, id) AS cid, extra_fields->>'qfcra_qfc_number' AS qfc
       FROM companies WHERE extra_fields ? 'qfcra_qfc_number'`);
  for (const r of fres.rows) if (r.qfc) firmMap.set(String(r.qfc), r.cid);

  let peopleNew = 0, peopleUpd = 0, linked = 0, skipped = 0;
  for (const p of rows) {
    const ai   = nz(p.ai_number);
    const full = nz(p.name) || nz(p.name_raw);
    if (!full || !ai) { skipped++; continue; }
    const { first, last } = splitName(full);

    const cfs = Array.isArray(p.controlled_functions) ? p.controlled_functions : [];
    const headline = nz((cfs[0] || {}).function) || 'Approved Individual';

    const extra = {
      qfcra_ai_number:   ai,
      qfcra_status:      nz(p.status),
      qfcra_name_raw:    nz(p.name_raw),
      qfcra_functions:   cfs.map(c => nz(c.function)).filter(Boolean).join(', ') || null,
      source:            'QFCRA',
    };

    // Upsert person by AI number.
    const ex = await query(
      `SELECT id FROM people WHERE extra_fields->>'qfcra_ai_number' = $1 LIMIT 1`, [ai]);
    let pid;
    if (ex.rows.length) {
      pid = ex.rows[0].id;
      await query(
        `UPDATE people
            SET full_name = $2,
                first_name = COALESCE(first_name, $3),
                last_name  = COALESCE(last_name, $4),
                headline   = COALESCE(NULLIF(headline, ''), $5),
                country    = COALESCE(country, 'Qatar'),
                extra_fields = extra_fields || $6::jsonb,
                updated_at = now()
          WHERE id = $1`,
        [pid, full, first, last, headline, JSON.stringify(extra)]);
      peopleUpd++;
    } else {
      const ins = await query(
        `INSERT INTO people (full_name, first_name, last_name, headline, country, extra_fields)
         VALUES ($1, $2, $3, $4, 'Qatar', $5::jsonb) RETURNING id`,
        [full, first, last, headline, JSON.stringify(extra)]);
      pid = ins.rows[0].id;
      peopleNew++;
    }

    // Link to every firm the person holds a controlled function at. Resolve the
    // firm by QFC number; one link per distinct firm, titled by its function(s).
    const byFirm = new Map(); // qfc -> { title, status }
    for (const cf of cfs) {
      const qfc = nz(cf.qfc_number);
      if (!qfc) continue;
      const fn = nz(cf.function);
      if (byFirm.has(qfc)) {
        const cur = byFirm.get(qfc);
        if (fn && !cur.title.includes(fn)) cur.title += ', ' + fn;
      } else {
        byFirm.set(qfc, { title: fn || 'Approved Individual', status: nz(cf.status) });
      }
    }
    for (const [qfc, info] of byFirm) {
      const cid = firmMap.get(String(qfc));
      if (!cid) continue;
      const isCurrent = !info.status || /approv/i.test(info.status);
      await query(
        `DELETE FROM person_companies WHERE person_id=$1 AND company_id=$2 AND source_stage=$3`,
        [pid, cid, INGEST_STAGE]);
      await query(
        `INSERT INTO person_companies (person_id, company_id, title, is_current, source_stage, raw_payload)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
        [pid, cid, info.title, isCurrent, INGEST_STAGE, JSON.stringify({ ai_number: ai, qfc_number: qfc })]);
      linked++;
    }
  }

  jobProgress?.(`Approved individuals → people: ${peopleNew.toLocaleString()} new · ${peopleUpd.toLocaleString()} updated · ${linked.toLocaleString()} firm links · ${skipped} skipped`);
  return { people_new: peopleNew, people_updated: peopleUpd, linked, skipped, total: rows.length };
}
