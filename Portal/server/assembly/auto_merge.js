// Automatic merging of companies the REGISTRY itself says are the same.
//
// Val, 2026-07-22: "if CR number is matching let it link automatically." This is the merge half of
// that instruction, and it is deliberately narrower than the words, because measuring the data
// showed the plain reading is unsafe.
//
// ── WHY "MATCHING CR NUMBER" IS NOT THE RULE ────────────────────────────────────────────────────
// Grouping live companies by registration NUMBER alone yields 627 groups. Many are nonsense,
// because different issuing bodies number their own registers independently — number 00003 exists
// under company_record, QFC and QFCRA, and they are three unrelated organisations. Real examples
// that a number-only rule would have merged:
//     CR 14173 → "Qatar ALhadeetha Kindergarteen"  +  "QATAR GROUP FOR PETROLWUM SERVICES"
//     CR 15101 → "Dar AL-Doha modern electronics"  +  "The Gulf English School"
// A kindergarten is not a petroleum services company. Merging those would destroy two real records
// and fabricate a third, and nothing downstream would ever notice.
//
// ── THE RULE THAT IS SAFE, AND WHY ──────────────────────────────────────────────────────────────
// Two companies merge only when ALL of these hold:
//   1. the SAME issuing BODY states the SAME registration_type and the SAME number — a register is
//      unique within itself, so this is the registry asserting one entity, not Bell guessing;
//   2. the number is at least 5 characters — short codes collide by chance;
//   3. their names NORMALIZE to the same string. This is the guard against a registry typo or a
//      bad ingest, and it costs nothing today: measured on live data, all 41 qualifying groups
//      already agree on the name (Barclays Bank PLC twice, KPMG LLC twice, and so on). If a group
//      ever disagrees, Bell leaves it alone and says so rather than picking a winner.
//
// Branch registrations are excluded by construction, not by a special case: the registry writes a
// branch as 42828/2, which is a DIFFERENT number from 42828, so they never group. Branches are
// LINKED by chain_link.js (Val's decision: "one organized view, sixteen true records"), never
// merged — the two mechanisms cannot fight over the same rows.
//
// mergeCompanies() carries every child table, unions industries, evicts colliding rows WITH
// sync_deletions tombstones and stamps updated_at so the push publishes the result. That was
// proven end-to-end on a disposable copy before this was allowed to run unattended.

import { query } from '../db.js';
import { mergeCompanies } from './dedup.js';
import { normalizeName } from '../ingest/normalize.js';

const MIN_NUMBER_LEN = 5;

/**
 * Groups the registry itself identifies as one company.
 * @returns {Promise<Array<{key:string, ids:number[], names:string[], agree:boolean}>>}
 */
export async function findExactRegistrationGroups() {
  const r = await query(`
    SELECT r.body, r.registration_type, r.number,
           array_agg(c.id ORDER BY COALESCE(c.bell_score,0) DESC, c.id) AS ids,
           array_agg(c.name ORDER BY COALESCE(c.bell_score,0) DESC, c.id) AS names
      FROM company_registrations r
      JOIN companies c ON c.id = r.company_id
     WHERE COALESCE(c.archived, false) = false
       AND c.canonical_id IS NULL
       AND length(r.number) >= $1
     GROUP BY r.body, r.registration_type, r.number
    HAVING count(DISTINCT r.company_id) > 1`, [MIN_NUMBER_LEN]);

  return r.rows.map((row) => {
    const norms = new Set(row.names.map((n) => normalizeName(n) || String(n || '').toLowerCase().trim()));
    return {
      key: `${row.body} ${row.registration_type} ${row.number}`,
      ids: row.ids.map(Number),
      names: row.names,
      agree: norms.size === 1,
    };
  });
}

/**
 * Merge every group the registry identifies AND whose names agree.
 * @param {object} opts
 * @param {boolean} [opts.apply=false]  false = report only, nothing written
 * @param {function} [opts.log]
 */
export async function autoMergeExactRegistrations({ apply = false, log = () => {} } = {}) {
  const groups = await findExactRegistrationGroups();
  const eligible = groups.filter((g) => g.agree);
  const held = groups.filter((g) => !g.agree);

  // A group whose names disagree is reported, never merged, and never silently dropped: it is
  // either a registry error or two genuinely different firms, and both need a human.
  for (const g of held) {
    log(`  held (names differ) [${g.key}] ${g.names.map((n) => String(n).slice(0, 40)).join(' || ')}`);
  }

  let merged = 0, failed = 0;
  const done = [];
  for (const g of eligible) {
    // Survivor = the most complete record (highest Bell Score, oldest on a tie) — the array was
    // ordered that way by the query, so ids[0] is the keeper.
    const [survivor, ...dups] = g.ids;
    for (const dup of dups) {
      if (!apply) { merged++; done.push({ key: g.key, survivor, dup, name: g.names[0] }); continue; }
      try {
        await mergeCompanies(survivor, dup, () => {});
        merged++;
        done.push({ key: g.key, survivor, dup, name: g.names[0] });
        log(`  merged #${dup} → #${survivor}  [${g.key}]  ${String(g.names[0]).slice(0, 50)}`);
      } catch (err) {
        failed++;
        log(`  ✗ #${dup} → #${survivor} [${g.key}]: ${err.message}`);
      }
    }
  }

  return { groups: groups.length, eligible: eligible.length, held: held.length, merged, failed, applied: apply, done, heldGroups: held };
}
