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
import { mergeCompanies, registrationBases } from './dedup.js';
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
 * Groups where DIFFERENT registry bodies state the SAME national CR for different rows.
 *
 * ⚠️ WHY THIS SECOND FINDER EXISTS. The same-body finder above found ZERO groups for five
 * consecutive nights ('zero' in job_runs) while 6,934 cross-body duplicate groups sat in the
 * data — QCCI writes the CR as "00036876" and CRA as "36876", so an exact-string, same-body
 * group can never see them. Val reported the symptom on 2026-08-05 (iHorizons ×5).
 *
 * The join is NOT the number-collision trap the file header warns about, and that is proven,
 * not assumed: MOCI, QCCI and CRA all type these rows 'commercial_registration', and on the
 * 4,312 companies that carry BOTH a MOCI and a QCCI row themselves, the two numbers agree
 * 94.3% of the time (measured 2026-08-13) — they are the same national register. company_record,
 * QFC, QFCRA and MoPH number their own registers independently and stay excluded.
 *
 * That same 94.3% is also why a name guard still exists: ~6% of QCCI-stated CRs disagree with
 * MOCI's on the very same company, so the number alone can be a typo. Merging happens only in
 * three tiers of CONCLUSIVE evidence; everything else is held and reported:
 *   exact         — every member's normalized name is identical (registry + name agree).
 *   shell         — the group is nameless registry shells ("MOCI CR-109498 (name missing)")
 *                   plus exactly ONE named company. The shell asserts nothing but the CR, and
 *                   the CR matches; filling it is not a guess.
 *   corroborated  — the two members share a PHONE (last 8 digits) or WEBSITE DOMAIN. Names like
 *                   "Al Wadi Al Akhdar" / "Green Valley Trading" are the same firm translated,
 *                   and no string similarity can prove that — an independent shared contact can.
 * Held groups include real danger: "almustaqbal Engineering" vs "Diplomat For Men's Supplies"
 * share a base CR and are plainly not one firm. A wrong number on one side does exist; that is
 * what the tiers are for.
 *
 * Branch registrations (…/2) never enter: `number !~ '/'` excludes them by construction, so this
 * cannot fight chain_link.js over the same rows.
 */
export async function findCrossBodyBaseCrGroups({ onlyBases = null } = {}) {
  // onlyBases: test hook — the suite creates fixtures with distinctive base CRs on the disposable
  // copy and must not depend on (or pay for) the thousands of real groups also present there.
  const r = await query(`
    SELECT ltrim(split_part(r.number,'/',1),'0') AS base,
           array_agg(c.id ORDER BY COALESCE(c.bell_score,0) DESC, c.id) AS ids,
           array_agg(c.name ORDER BY COALESCE(c.bell_score,0) DESC, c.id) AS names,
           array_agg(DISTINCT r.body) AS bodies
      FROM company_registrations r
      JOIN companies c ON c.id = r.company_id
     WHERE COALESCE(c.archived, false) = false
       AND c.canonical_id IS NULL
       AND r.body IN ('MOCI','QCCI','CRA')
       AND r.registration_type = 'commercial_registration'
       AND r.number !~ '/'
       AND length(ltrim(split_part(r.number,'/',1),'0')) >= $1
       AND ($2::text[] IS NULL OR ltrim(split_part(r.number,'/',1),'0') = ANY($2::text[]))
     GROUP BY 1
    HAVING count(DISTINCT r.company_id) > 1`, [MIN_NUMBER_LEN, onlyBases]);

  const out = [];
  for (const row of r.rows) {
    const ids = [...new Set(row.ids.map(Number))];
    if (ids.length < 2) continue;
    const named = row.names.filter((n) => !/\(name missing\)\s*$/.test(String(n || '')));
    const norms = new Set(named.map((n) => normalizeName(n) || String(n || '').toLowerCase().trim()));
    let tier = 'held';
    if (named.length >= 1 && norms.size <= 1 && named.length < row.names.length) tier = 'shell';
    else if (norms.size === 1 && named.length === row.names.length) tier = 'exact';
    else if (ids.length === 2) {
      // Corroboration: an independent contact both rows state. Checked only for pairs — a
      // 3+ group with disagreeing names needs eyes, not transitivity.
      const c = await query(`
        SELECT EXISTS (
          SELECT 1 FROM company_contacts p1 JOIN company_contacts p2
            ON p1.type='phone' AND p2.type='phone'
           AND right(regexp_replace(p1.value,'\\D','','g'),8) = right(regexp_replace(p2.value,'\\D','','g'),8)
           AND length(regexp_replace(p1.value,'\\D','','g')) >= 8
         WHERE p1.company_id = $1 AND p2.company_id = $2) AS phone,
        (SELECT lower(regexp_replace(regexp_replace(a.website,'^https?://',''),'^www\\.|/.*$','','g'))
           FROM companies a WHERE a.id = $1 AND a.website IS NOT NULL AND btrim(a.website) <> '') IS NOT DISTINCT FROM
        (SELECT lower(regexp_replace(regexp_replace(b.website,'^https?://',''),'^www\\.|/.*$','','g'))
           FROM companies b WHERE b.id = $2 AND b.website IS NOT NULL AND btrim(b.website) <> '')
        AND EXISTS (SELECT 1 FROM companies a WHERE a.id = $1 AND a.website IS NOT NULL AND btrim(a.website) <> '') AS domain`,
        [ids[0], ids[1]]);
      if (c.rows[0].phone || c.rows[0].domain) tier = 'corroborated';
    }
    out.push({ key: `base CR ${row.base} (${row.bodies.join('+')})`, base: row.base, ids, names: row.names, tier });
  }
  return out;
}

/**
 * Merge every group the registry identifies AND whose names agree.
 * @param {object} opts
 * @param {boolean} [opts.apply=false]  false = report only, nothing written
 * @param {function} [opts.log]
 * @param {number}  [opts.crossBodyLimit=250]  merges per run from the cross-body finder — keeps
 *                  the first (bulk) night inside a predictable window; the rest drain nightly.
 */
export async function autoMergeExactRegistrations({ apply = false, log = () => {}, crossBodyLimit = 250 } = {}) {
  const groups = await findExactRegistrationGroups();
  const eligible = groups.filter((g) => g.agree);
  const held = groups.filter((g) => !g.agree);

  // Cross-body pass: same national CR stated by different registry bodies. Only the three
  // conclusive tiers merge; 'held' groups are counted, never queued — ~5,800 of them would
  // drown any review queue, and Val's standing constraint is automation on conclusive
  // evidence, not bulk eyeballing (2026-08-06).
  const cross = await findCrossBodyBaseCrGroups();
  const crossEligible = cross.filter((g) => g.tier !== 'held').slice(0, Math.max(0, crossBodyLimit));
  const crossHeld = cross.filter((g) => g.tier === 'held');
  log(`  cross-body CR: ${cross.length} group(s) — ${cross.filter((g) => g.tier !== 'held').length} conclusive (${crossEligible.length} this run) · ${crossHeld.length} held for stronger evidence`);
  for (const g of crossEligible) {
    // Survivor: for shell groups the NAMED row must survive regardless of score — the shell has
    // nothing worth keeping and its name is a placeholder that must not win.
    if (g.tier === 'shell') {
      const namedIdx = g.names.findIndex((n) => !/\(name missing\)\s*$/.test(String(n || '')));
      if (namedIdx > 0) {
        g.ids = [g.ids[namedIdx], ...g.ids.filter((_, i) => i !== namedIdx)];
        g.names = [g.names[namedIdx], ...g.names.filter((_, i) => i !== namedIdx)];
      }
    }
    eligible.push({ key: `${g.key} [${g.tier}]`, ids: g.ids, names: g.names, agree: true });
  }

  // A group whose names disagree is reported, never merged, and never silently dropped: it is
  // either a registry error or two genuinely different firms, and both need a human.
  for (const g of held) {
    log(`  held (names differ) [${g.key}] ${g.names.map((n) => String(n).slice(0, 40)).join(' || ')}`);
  }

  // The same branch-stripped base form the guard uses (a "/2" suffix is the same legal entity).
  const baseOf = (s) => {
    const v = String(s || '').trim();
    if (!v) return null;
    let x = v.split('/')[0];
    if (/^\d+$/.test(x)) x = x.replace(/^0+/, '') || '0';
    return x.length >= 4 ? x : null;
  };
  let merged = 0, failed = 0, queuedForReview = 0;
  // ⚠️ WHY A MERGE FAILED USED TO EXIST ONLY IN A WINDOWS TASK LOG. `failed: 12` reached
  // job_runs with no reason attached, and answering "were those correct refusals?" took a
  // full investigation. summarize() keeps nested NUMBERS, so a tally of reasons survives into
  // job_runs.result — the next person reads it instead of re-deriving it.
  const failedBy = { registration_conflict: 0, sibling_branches: 0, other: 0 };
  const done = [];
  for (const g of eligible) {
    // Survivor = the most complete record (highest Bell Score, oldest on a tie) — the array was
    // ordered that way by the query, so ids[0] is the keeper.
    const [survivor, ...dups] = g.ids;
    for (const dup of dups) {
      if (!apply) { merged++; done.push({ key: g.key, survivor, dup, name: g.names[0] }); continue; }
      // ⚠️ THE GUARD GOT MORE PERMISSIVE TODAY, AND THE AUTOMATIC PATH DELIBERATELY DOES NOT
      // FOLLOW IT ALL THE WAY. Correcting the licence-vs-CR comparison unblocks ~110 pairs that
      // were refused for years. Most are real duplicates — but "Tadmur Holding" and "Tadmur
      // Trading" state each other's CRs and may still be two legal entities in one group, which
      // is exactly the merge Val objected to on iHorizons. So when the two records disagree
      // about their PRIMARY number, the pair goes to the Dedup Queue with its evidence instead
      // of being merged tonight. Nothing is lost; the decision moves to a human.
      const [pa, pb] = await Promise.all([registrationBases(survivor), registrationBases(dup)]);
      const primaryA = baseOf(pa.primary), primaryB = baseOf(pb.primary);
      if (primaryA && primaryB && primaryA !== primaryB) {
        const shared = [...pa.bases].filter((x) => pb.bases.has(x));
        queuedForReview++;
        await query(
          `INSERT INTO dedup_candidates (company_a_id, company_b_id, similarity_score, similarity_reasons)
           VALUES (LEAST($1,$2), GREATEST($1,$2), 0.900, $3::jsonb)
           ON CONFLICT (company_a_id, company_b_id) DO NOTHING`,
          [survivor, dup, JSON.stringify([
            `both_state_cr(${shared.join(',') || 'none'})`,
            `primary_numbers_differ(${primaryA} vs ${primaryB})`,
            `finder_tier(${g.key})`,
          ])]).catch(() => {});
        log(`  → review #${dup} ↔ #${survivor} [${g.key}]: share CR ${shared.join(',')}, primaries differ ${primaryA} vs ${primaryB}`);
        continue;
      }
      try {
        // Pass the real logger: the guard explains its own refusals, and swallowing that line
        // is how "failed: 12" became unanswerable.
        await mergeCompanies(survivor, dup, (m) => log(m));
        merged++;
        done.push({ key: g.key, survivor, dup, name: g.names[0] });
        log(`  merged #${dup} → #${survivor}  [${g.key}]  ${String(g.names[0]).slice(0, 50)}`);
      } catch (err) {
        failed++;
        const code = err.code === 'registration_conflict' || err.code === 'sibling_branches' ? err.code : 'other';
        failedBy[code]++;
        log(`  ✗ #${dup} → #${survivor} [${g.key}]: ${err.message}`);
      }
    }
  }

  if (queuedForReview) log(`  ${queuedForReview} pair(s) sent to the Dedup Queue instead of merging (primary numbers differ)`);
  return { groups: groups.length, eligible: eligible.length, held: held.length, merged, failed, failedBy, queuedForReview, applied: apply, done, heldGroups: held };
}
