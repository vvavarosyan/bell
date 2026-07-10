// Proof-of-search ledger — writer (Phase 2 A3). One call per engine outcome,
// hooked inside each engine's markStage helper. BEST-EFFORT by contract, like
// rejects.js: a ledger failure must never break an engine. The always-on
// daemon can run for days on old schema (migration 080 applies only at Portal
// boot), so a missing table warns ONCE and goes quiet — the beat() pattern.

import { query } from '../../db.js';
import { ENGINE_OF_STAGE, LEDGER_INSERT_SQL, outcomeFor } from './ledger_rules.js';

let _warnedMissing = false;

/**
 * Record one search attempt outcome. Never throws.
 * @param {number|string} companyId
 * @param {number} stage      7..12
 * @param {string} status     the stageN_status value the engine just stamped
 * @param {object|null} searched  the exact extras object it stamped (tiers/pages/counts)
 */
export async function recordSearch(companyId, stage, status, searched = null) {
  try {
    const outcome = outcomeFor(stage, status, searched);
    if (!outcome) return;                       // 'running' etc. — not an outcome
    const engine = ENGINE_OF_STAGE[stage];
    if (!engine || !companyId) return;
    let payload = null;
    if (searched) {
      try {
        const s = JSON.stringify(searched);
        payload = s.length <= 8_000 ? s : null;  // keep rows small; drop whole, never slice
      } catch { payload = null; }
    }
    await query(LEDGER_INSERT_SQL, [companyId, stage, engine, outcome, payload]);
  } catch (err) {
    if (!_warnedMissing) {
      _warnedMissing = true;
      console.warn(`⚠ search ledger write failed (${err.message}) — restart the local Portal to apply migration 080. Engines continue unaffected.`);
    }
  }
}
