// Phase 5 — Bell identifier assignment (BIN / PIN / JIN).
//
// Each canonical/standalone row that doesn't yet have an identifier gets one
// from the corresponding sequence (bin_seq, pin_seq, jin_seq) using the
// format_*() functions defined in migration 001:
//     bin = format_bin(seq.nextval) → 'BIN-00000001'
//     pin = format_pin(seq.nextval) → 'BELL-P-00000001'
//     jin = format_jin(seq.nextval) → 'BELL-J-00000001'
//
// Merged-into rows (merge_status='merged_into') do NOT get identifiers — they
// point to a canonical via canonical_id. The canonical owns the identifier.

import { query } from '../db.js';

export async function assignBins(jobLog = null) {
  // Eligible: standalone or canonical companies that don't yet have a BIN.
  const r = await query(`
    UPDATE companies
    SET bin = format_bin(nextval('bin_seq')),
        assembled_at = COALESCE(assembled_at, now()),
        updated_at   = now()
    WHERE bin IS NULL
      AND archived = false
      AND merge_status <> 'merged_into'
    RETURNING id, bin
  `);
  jobLog?.(`  Assigned ${r.rows.length.toLocaleString()} BIN(s)`);
  return { assigned: r.rows.length };
}

export async function assignPins(jobLog = null) {
  const r = await query(`
    UPDATE people
    SET pin = format_pin(nextval('pin_seq')),
        assembled_at = COALESCE(assembled_at, now()),
        updated_at   = now()
    WHERE pin IS NULL
      AND archived = false
      AND merge_status <> 'merged_into'
    RETURNING id, pin
  `);
  jobLog?.(`  Assigned ${r.rows.length.toLocaleString()} PIN(s)`);
  return { assigned: r.rows.length };
}

export async function assignJins(jobLog = null) {
  // Jobs only have one merge axis (linkedin_job_url uniqueness) — no merge_status.
  const r = await query(`
    UPDATE jobs
    SET jin = format_jin(nextval('jin_seq')),
        assembled_at = COALESCE(assembled_at, now()),
        updated_at   = now()
    WHERE jin IS NULL
      AND archived = false
    RETURNING id, jin
  `);
  jobLog?.(`  Assigned ${r.rows.length.toLocaleString()} JIN(s)`);
  return { assigned: r.rows.length };
}

export async function assignAllIdentifiers(jobLog = null) {
  jobLog?.(`▸ Assigning Bell identifiers`);
  const bins = await assignBins(jobLog);
  const pins = await assignPins(jobLog);
  const jins = await assignJins(jobLog);
  jobLog?.(`▸ Identifier assignment complete`);
  return { bins, pins, jins };
}
