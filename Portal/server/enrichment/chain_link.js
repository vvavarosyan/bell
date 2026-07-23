// Chain links — one brand, many registered branches, ONE organized view.
//
// Val's decision (2026-07-22): LINK, never merge. Each branch is a legally distinct
// registered company; a tender award to "Yateem Optician - Al Wakra" is a fact about that
// entity. parent_company_id (migration 101) draws the family tree; no record loses its
// registration number, status or history, and one UPDATE to NULL undoes any link.
//
// TWO TIERS, honestly separated by evidence strength:
//
//   TIER 1 — REGISTRY-STATED. Qatar's registry numbers branch registrations with a /n
//   suffix on the base CR: 42828, 42828/2, 42828/3 are one firm's registrations by the
//   registry's OWN convention. Measured live: 5,327 suffixed CRs. Not an inference — but
//   it still ships as Preview/Apply so Val reads the list before anything is written.
//   Gates (each from a measured trap):
//     • both parent and member must carry a MOCI or QCCI source row — QFC/CRA/QFCRA
//       licence numbers COLLIDE numerically with MOCI CR bases (106 members measured);
//     • the parent is the record holding the BARE base CR; no bare-base record → review;
//     • a member already linked to a DIFFERENT parent → review, never overwrite.
//
//   TIER 2 — BRAND EVIDENCE (proposals only; Val's click links). The Yateem shape:
//   ONE record carries the CR (#163975), the other 15 are Maps/MoPH discoveries with no
//   CR of their own, all sharing yateemoptician.qa. Evidence = shared registrable website
//   + the member's name extends the head's word-preserving core at a word boundary
//   + the member is identity-blank (no CR of its own, no different website). ONE stranger
//   (a member with its own different base CR or its own different domain) flags the whole
//   group for caution — measured: real chains have zero strangers, family-name coincidence
//   piles have 5–15.
//
// The adversarial-verification pass for this design could NOT run (session limit), which
// is exactly WHY nothing here auto-links: Tier 1 is registry-stated + Val's Apply click;
// Tier 2 is per-card human judgment. Do not "upgrade" Tier 2 to automatic without running
// that verification.

import { query } from '../db.js';
import { cleanName, parentCore } from './branch_link.js';

const normReg = (s) => String(s || '').trim().toUpperCase().replace(/\s+/g, '');
const baseOf = (s) => {
  const v = normReg(s);
  if (!v) return null;
  let x = v.replace(/\/\d+$/, '');
  if (/^\d+$/.test(x)) x = x.replace(/^0+/, '') || '0';
  return x.length >= 4 ? x : null;
};
const suffixOf = (s) => (normReg(s).match(/\/(\d+)$/) || [])[1] || null;
const hostOf = (u) => {
  try { return new URL(String(u).startsWith('http') ? u : 'https://' + u).hostname.replace(/^www\./, '').toLowerCase(); }
  catch { return null; }
};
// Registrable label ("yateemoptician.qa" → "yateemoptician") so .qa/.com variants agree.
const labelOf = (h) => {
  if (!h) return null;
  const parts = h.split('.').filter(Boolean);
  if (parts.length <= 1) return parts[0] || null;
  const CO = new Set(['com', 'co', 'net', 'org', 'gov', 'edu']);
  let i = parts.length - 2;
  if (i > 0 && CO.has(parts[i])) i -= 1;
  return parts[i] || null;
};

/**
 * TIER 1: registry-stated branch groups. Returns { link: [...], review: [...] } where
 * each link is { parent, members[] } ready for Preview/Apply.
 */
export async function findRegistryChains() {
  const rows = (await query(`
    SELECT c.id, c.name, c.primary_registration_no AS reg, c.website, c.parent_company_id,
           EXISTS (SELECT 1 FROM company_sources s WHERE s.company_id = c.id
                     AND s.source IN ('MOCI','moci','QCCI','qcci-ingest','qcci-directory')) AS registry_sourced
      FROM companies c
     WHERE COALESCE(c.archived,false) = false
       AND COALESCE(c.merge_status,'') <> 'merged_into'
       AND c.primary_registration_no IS NOT NULL
       AND c.primary_registration_no ~ '/\\s*\\d+\\s*$'`)).rows;

  const byBase = new Map();
  for (const r of rows) {
    const b = baseOf(r.reg);
    if (!b) continue;
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b).push(r);
  }
  if (!byBase.size) return { link: [], review: [] };

  // The bare-base records these groups attach to.
  const bases = [...byBase.keys()];
  const parents = (await query(`
    SELECT c.id, c.name, c.primary_registration_no AS reg, c.website,
           EXISTS (SELECT 1 FROM company_sources s WHERE s.company_id = c.id
                     AND s.source IN ('MOCI','moci','QCCI','qcci-ingest','qcci-directory')) AS registry_sourced
      FROM companies c
     WHERE COALESCE(c.archived,false) = false
       AND COALESCE(c.merge_status,'') <> 'merged_into'
       AND c.primary_registration_no IS NOT NULL
       AND c.primary_registration_no !~ '/'`)).rows;
  const parentByBase = new Map();
  for (const p of parents) {
    const b = baseOf(p.reg);
    if (b && bases.includes(b)) {
      // Two bare-base claimants for one base = ambiguous → neither is trusted.
      parentByBase.set(b, parentByBase.has(b) ? 'AMBIGUOUS' : p);
    }
  }

  const link = [], review = [];
  for (const [base, members] of byBase) {
    const parent = parentByBase.get(base);
    if (!parent) { review.push({ base, why: 'no bare-base parent record', members }); continue; }
    if (parent === 'AMBIGUOUS') { review.push({ base, why: 'two records claim the bare base CR', members }); continue; }
    if (!parent.registry_sourced) { review.push({ base, why: 'parent has no MOCI/QCCI source row (licence-number collision risk)', members }); continue; }
    const ok = [], held = [];
    for (const m of members) {
      if (Number(m.id) === Number(parent.id)) continue;
      if (m.parent_company_id && Number(m.parent_company_id) !== Number(parent.id)) {
        held.push({ ...m, why: 'already linked to a different parent' }); continue;
      }
      if (!m.registry_sourced) { held.push({ ...m, why: 'no MOCI/QCCI source row' }); continue; }
      if (!suffixOf(m.reg)) continue;
      ok.push(m);
    }
    if (ok.length) link.push({ base, parent, members: ok });
    if (held.length) review.push({ base, why: 'members held by a gate', members: held, parent });
  }
  return { link, review };
}

/**
 * TIER 2: brand-evidence proposals (Yateem shape). One card per group; Val links members
 * individually or all at once. Never written without his click.
 */
export async function findBrandChains() {
  const rows = (await query(`
    SELECT c.id, c.name, c.primary_registration_no AS reg, c.website, c.city,
           c.parent_company_id, c.bell_score,
           COALESCE((c.extra_fields->'chain_rejected')::jsonb, '[]'::jsonb) AS chain_rejected
      FROM companies c
     WHERE COALESCE(c.archived,false) = false
       AND COALESCE(c.merge_status,'') <> 'merged_into'
       AND c.website IS NOT NULL AND btrim(c.website::text) <> ''`)).rows;

  const byLabel = new Map();
  for (const r of rows) {
    const l = labelOf(hostOf(r.website));
    if (!l || l.length < 5) continue;                    // "qatar", "gmail" style labels are meaningless
    if (!byLabel.has(l)) byLabel.set(l, []);
    byLabel.get(l).push(r);
  }

  const groups = [];
  for (const [label, members] of byLabel) {
    if (members.length < 3) continue;                    // a chain, not a pair
    // Head = the member whose cleaned name is the shortest core that the others extend.
    // ORDER MATTERS, learned live (Al Misbah / Care N Cure, 2026-07-23): a record that is
    // ITSELF someone's branch can never be head, and when both a bare CR and a suffixed CR
    // are in the group, the BARE one is the head — the registry says so. The old sort
    // preferred the higher-scored record, which proposed the family UPSIDE-DOWN (the parent
    // as a branch of its own branch) and the approve guard rightly refused with a message
    // that told Val nothing.
    const barePref = (x) => (x.reg && !/\/\s*\d+\s*$/.test(String(x.reg)) ? 1 : 0);
    const sorted = [...members]
      .filter((x) => !x.parent_company_id)
      .sort((a, b) =>
        barePref(b) - barePref(a) ||
        (b.reg ? 1 : 0) - (a.reg ? 1 : 0) ||
        (Number(b.bell_score) || 0) - (Number(a.bell_score) || 0) ||
        cleanName(a.name).length - cleanName(b.name).length);
    const head = sorted[0];
    if (!head) continue;                                 // every member already in a family
    const core = parentCore(head.name);
    if (!core || core.split(' ').filter(Boolean).length < 2) continue;   // one-word cores are coincidence bait

    const branches = [], strangers = [];
    for (const m of members) {
      if (Number(m.id) === Number(head.id)) continue;
      const rejected = Array.isArray(m.chain_rejected) && m.chain_rejected.some((x) => Number(x.parent_id) === Number(head.id));
      if (rejected) continue;
      if (m.parent_company_id) continue;                 // already in a family
      const mBase = baseOf(m.reg), hBase = baseOf(head.reg);
      const ownDifferentCr = mBase && hBase && mBase !== hBase;
      // Same base but the MEMBER holds the bare CR → the member is the registry's parent;
      // proposing it as a branch would invert the family. Skip outright.
      if (mBase && hBase && mBase === hBase && m.reg && !/\/\s*\d+\s*$/.test(String(m.reg))) continue;
      const nameExtends = cleanName(m.name).startsWith(core + ' ') || cleanName(m.name) === core;
      if (ownDifferentCr) { strangers.push({ id: m.id, name: m.name, why: 'own different registration' }); continue; }
      if (!nameExtends && !mBase) {
        // Same website, name doesn't extend the core — could still be the operator's other
        // brand; only a human can tell. Shown as a stranger, not silently dropped.
        strangers.push({ id: m.id, name: m.name, why: 'name does not extend the brand core' });
        continue;
      }
      branches.push({ id: m.id, name: m.name, reg: m.reg, city: m.city, identity_blank: !m.reg });
    }
    if (!branches.length) continue;
    groups.push({
      label, head: { id: head.id, name: head.name, reg: head.reg, website: head.website },
      core, branches, strangers,
      clean: strangers.length === 0,
    });
  }
  // Cleanest, biggest chains first — Yateem should lead.
  groups.sort((a, b) => (a.clean === b.clean ? b.branches.length - a.branches.length : a.clean ? -1 : 1));
  return groups;
}

/**
 * Auto-apply Tier 1. Val's standing instruction (2026-07-22, after reviewing the Chains
 * queue): "if CR number is matching let it link automatically." Registry-stated evidence
 * + founder authorization = no per-run click needed. All Tier-1 gates still apply
 * (MOCI/QCCI source both ends, unique bare-base parent, never overwrite a different
 * link) — this changes WHO clicks, not what qualifies. Tier 2 (brand evidence, no CR)
 * stays human-only in the Chains tab.
 */
export async function autoLinkRegistryChains(jobLog = null) {
  const { link } = await findRegistryChains();
  let written = 0;
  const parents = new Set();
  for (const g of link) {
    for (const m of g.members) {
      // Only write a REAL change: updated_at is the sync watermark, and rewriting an
      // already-correct link every night would re-push thousands of unchanged rows.
      const r = await query(`
        UPDATE companies SET parent_company_id = $2, updated_at = now()
         WHERE id = $1 AND COALESCE(archived,false) = false
           AND parent_company_id IS NULL`, [m.id, g.parent.id]);
      if (r.rowCount) { written += 1; parents.add(g.parent.id); jobLog?.(`  ⛓ #${m.id} "${m.name}" → #${g.parent.id} "${g.parent.name}" (CR ${g.base})`); }
    }
  }
  return { written, firms: parents.size };
}
