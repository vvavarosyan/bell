// Shared seniority inference + recompute helper. Used by Stage 3, Stage 3.5,
// and the /api/people/recompute-seniority endpoint.

import { query } from '../db.js';

/**
 * Map a job title / headline to a seniority level + org chart level.
 * Levels: 1=C-suite/Owner, 2=VP/President, 3=Director/Head of,
 *         4=Manager/Lead, 5=Other staff (IC).
 *
 * Patterns are evaluated top-down so the highest-rank match wins, even when a
 * title contains words from multiple levels (e.g. "Founder & Sales Lead" →
 * level 1, not 4).
 */
export function inferSeniority(rawTitle) {
  const t = String(rawTitle || '').toLowerCase().trim();
  if (!t) return { seniority_level: 'unknown', org_chart_level: null };

  // Level 2 (VP) checked BEFORE Level 1 so "Vice President" doesn't get bumped
  // up by the bare \bpresident\b pattern below.
  const isVp = /\b(vice[\s\-]?president|vp|svp|evp|avp)\b/.test(t)
            || /\bassociate\s+president\b/.test(t);

  // Level 1 — Founders / Owners / C-suite / Chairman / Managing Director / President
  if (!isVp && (
    /\bfounder\b|\bco[\s\-]?founder\b|\bcofounder\b/.test(t) ||
    /\bowner\b|\bproprietor\b/.test(t) ||
    /\bmanaging\s+partner\b/.test(t) ||
    /\bchairman\b|\bchairwoman\b|\bchairperson\b/.test(t) ||
    /\bc[eflitoasd]o\b/.test(t) ||                    // ceo cfo cto coo cio cmo cso cdo cao cpo etc
    /\bchief\s+\w+/.test(t) ||                         // "Chief X Officer", "Chief of Y"
    /\bmanaging\s+director\b/.test(t) ||
    /\bgeneral\s+manager\b|\bgm\b/.test(t) ||
    /\b(md|ceo|cto|cfo|coo|cio|cmo|cso|cdo|cao|cpo)\b/.test(t) ||
    /\bpresident\b/.test(t) ||
    /\bexecutive\s+director\b/.test(t)
  )) {
    return {
      seniority_level: /founder|owner|proprietor/.test(t) ? 'owner' : 'c_level',
      org_chart_level: 1,
    };
  }

  // Level 2 — Vice Presidents
  if (isVp) {
    return { seniority_level: 'vp', org_chart_level: 2 };
  }

  // Level 3 — Directors, Heads of
  if (/\bdirector\b|\bhead\s+of\b|\bdept\.?\s+head\b|\bdepartment\s+head\b/.test(t)) {
    return { seniority_level: 'director', org_chart_level: 3 };
  }

  // Level 4 — Managers, Leads, Principals
  if (/\bmanager\b|\bteam\s+lead\b|\btech\s+lead\b|\blead\b|\bprincipal\b|\bsupervisor\b/.test(t)) {
    return { seniority_level: 'manager', org_chart_level: 4 };
  }

  // Level 5 — Senior / Junior / Intern / Other staff
  if (/\b(senior|sr\.?|staff)\b/.test(t))            return { seniority_level: 'senior', org_chart_level: 5 };
  if (/\b(junior|jr\.?|intern|associate|trainee|graduate)\b/.test(t))
    return { seniority_level: 'junior', org_chart_level: 5 };

  return { seniority_level: 'mid', org_chart_level: 5 };
}

/**
 * Recompute seniority_level + org_chart_level for ALL existing person_companies
 * rows. Useful after the rule set is upgraded.
 *
 * Implementation note: Stage 3 (SERP scrape) writes pc.title from the Google
 * snippet, which is often a short generic phrase like "Doctor at DOC Medical".
 * Stage 3.5 (deep-enrich) then updates people.headline with the canonical
 * LinkedIn tagline ("Founder & CEO at DOC Medical Center") but does NOT
 * back-fill pc.title. So inferring seniority from pc.title alone misses real
 * founders/C-levels. We feed BOTH strings into the matcher so any senior
 * keyword in either one wins.
 */
export async function recomputeAllSeniority() {
  const r = await query(`
    SELECT pc.id, pc.title, p.headline
    FROM person_companies pc
    JOIN people p ON p.id = pc.person_id
  `);
  let updated = 0, unchanged = 0;
  for (const row of r.rows) {
    const combined = [row.title, row.headline].filter(Boolean).join(' || ');
    const { seniority_level, org_chart_level } = inferSeniority(combined);
    const upd = await query(
      `UPDATE person_companies
       SET seniority_level = $2, org_chart_level = $3
       WHERE id = $1
         AND (seniority_level IS DISTINCT FROM $2 OR org_chart_level IS DISTINCT FROM $3)
       RETURNING id`,
      [row.id, seniority_level, org_chart_level],
    );
    if (upd.rows.length) updated++; else unchanged++;
  }
  return { scanned: r.rows.length, updated, unchanged };
}
