// Branch–parent matching (Val 2026-07-20 "recommended combo"). EXACT-OR-REVIEW —
// never name-alone. Two honest flavors, two different treatments:
//
//   A. MoPH facility clusters — empty, unregistered facility shells (a pharmacy,
//      a lab, a first-aid unit) that belong to ONE registered operator. These
//      COLLAPSE into locations of the parent (the shell is archived, reversibly).
//   B. Free-zone legal branches (QFC/QFZ "… Branch") — the branch IS the real
//      Qatar legal entity, so it stays a company; we only add a parent LINK.
//
// PRECISION over recall. The stored companies.name_normalized is too lossy to
// match on (it strips "Holding"/"Company", so "Al Jaber Holding Company" reduces
// to "al jaber" and would wrongly swallow the unrelated "Al Jaber & Partners for
// Const & Energy" — a Rule 2.1 corruption). So we do two passes:
//   1. SQL prefilter on name_normalized — a loose net that over-generates
//      candidate (shell, parent) pairs (good recall, cheap).
//   2. A strict WORD-PRESERVING check in JS — the shell name must literally begin
//      with the parent's FULL name (all words kept; only a trailing legal-form
//      token like "Co"/"Ltd"/"WLL" may be dropped), the parent core must be ≥2
//      words and ≥6 chars, AND exactly one registered parent may survive for a
//      shell (uniqueness guard — this is what kills the "Al Noor" trap: six
//      unrelated "Al Noor …" firms share the prefix but none is a full-name match).
// Rejecting a real branch here is harmless (it just stays a separate company);
// fusing two distinct firms is not — so we err strict.

import { query } from '../db.js';

// Trailing legal-form tokens that may differ between a parent and its branch
// ("Boom Construction Co" ↔ "Boom Construction Al Gharrafa"). NOT distinguishing
// words like holding / group / trading / partners — those must match.
const LEGAL_TRAIL_RE = /(?:\b(?:co|company|llc|ltd|limited|inc|plc|est|establishment|spc|qpsc|qsc|qssc|sae|sao|wll|w l l|w\.l\.l)\b[\s.]*)+$/;

// Lowercase, &→and, strip punctuation, collapse spaces. Preserves EVERY word
// (Latin + Arabic). This is deliberately far less aggressive than normalizeName.
export function cleanName(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// The parent's identifying core: its cleaned name minus any trailing legal form.
export function parentCore(name) {
  return cleanName(name).replace(LEGAL_TRAIL_RE, '').trim();
}

// Strict test: does the shell name begin with the parent's full core, at a word
// boundary, with the core specific enough to trust?
export function strictBranchMatch(shellName, parentName) {
  const core = parentCore(parentName);
  const words = core.split(' ').filter(Boolean);
  if (words.length < 2) return false;               // one-word cores are never specific enough
  if (core.length < 8 && words.length < 3) return false;  // a bare 2-word generic ("al noor") is too risky
  const shell = cleanName(shellName);
  return shell.startsWith(core + ' ');
}

// A parent whose name-core is shared as a name prefix by MORE THAN this many
// OTHER registered companies is "generic" (e.g. "Al Sultan", "Al Mannai",
// "QatarEnergy LNG") — its facility shells might belong to a DIFFERENT same-named
// entity, so we do NOT auto-collapse them; they're reported as skipped and stay
// separate companies. (Larsen & Toubro has 2 siblings and is still trusted.)
const MAX_GENERIC_SIBLINGS = 2;

/**
 * Flavor A — MoPH facility shells → their one registered parent operator.
 * Returns { groups, skipped }, each an array of
 *   { shell_id, shell_name, shell_address, parent_id, parent_name }.
 *   groups  = high-confidence collapses (Apply acts on these).
 *   skipped = matched but the parent name is generic (left as separate companies).
 */
export async function findMophCollapse() {
  // Pass 1 — loose SQL candidate net (recall).
  const candidates = (await query(`
    WITH shell AS (
      SELECT s.id, s.name, s.name_normalized, s.address
        FROM companies s
       WHERE s.primary_registration_no IS NULL
         AND (s.website IS NULL OR btrim(s.website) = '')
         AND s.parent_company_id IS NULL
         AND s.is_active = true AND COALESCE(s.archived, false) = false
         AND length(s.name_normalized) > 4
         AND EXISTS (SELECT 1 FROM company_sources cs WHERE cs.company_id = s.id AND cs.source = 'MoPH')
    )
    SELECT shell.id AS shell_id, shell.name AS shell_name, shell.address AS shell_address,
           p.id AS parent_id, p.name AS parent_name, p.name_normalized AS parent_norm
      FROM shell
      JOIN companies p
        ON p.id <> shell.id
       AND p.primary_registration_no IS NOT NULL
       AND COALESCE(p.archived, false) = false
       AND length(p.name_normalized) >= 4
       AND shell.name_normalized LIKE p.name_normalized || ' %'`)).rows;

  // Pass 2 — strict word-preserving check + per-shell uniqueness (precision).
  const byShell = new Map();
  for (const c of candidates) {
    if (!strictBranchMatch(c.shell_name, c.parent_name)) continue;
    if (!byShell.has(c.shell_id)) byShell.set(c.shell_id, []);
    byShell.get(c.shell_id).push(c);
  }
  const survivors = [];
  for (const matches of byShell.values()) {
    const parentIds = new Set(matches.map((m) => m.parent_id));
    if (parentIds.size !== 1) continue;   // UNIQUENESS GUARD — ambiguous → skip
    survivors.push(matches[0]);
  }

  // Pass 3 — genericness guard. Count, per surviving parent, how many OTHER
  // registered companies share its normalized name as a prefix.
  const parentNorms = new Map();
  for (const s of survivors) parentNorms.set(s.parent_id, s.parent_norm);
  const genericIds = new Set();
  if (parentNorms.size) {
    const ids = [...parentNorms.keys()];
    const sib = (await query(`
      SELECT p.id,
        (SELECT count(*) FROM companies o
          WHERE o.id <> p.id AND o.primary_registration_no IS NOT NULL AND COALESCE(o.archived,false)=false
            AND o.name_normalized LIKE p.name_normalized || '%') AS sib
      FROM companies p WHERE p.id = ANY($1::bigint[])`, [ids])).rows;
    for (const r of sib) if (Number(r.sib) > MAX_GENERIC_SIBLINGS) genericIds.add(Number(r.id));
  }

  const byName = (a, b) => String(a.parent_name).localeCompare(String(b.parent_name)) || String(a.shell_name).localeCompare(String(b.shell_name));
  const strip = ({ parent_norm, ...rest }) => rest;   // don't leak the internal field
  const groups = survivors.filter((s) => !genericIds.has(s.parent_id)).map(strip).sort(byName);
  const skipped = survivors.filter((s) => genericIds.has(s.parent_id)).map(strip).sort(byName);
  return { groups, skipped };
}

/**
 * Flavor B — free-zone legal branches (name contains "branch"/"فرع", QFC/QFZ
 * source) → a sibling parent company (same base name without the branch marker),
 * if exactly one exists. Non-destructive: only sets the parent link. In practice
 * these branches' parents are foreign HQs absent from our Qatar DB, so this
 * usually finds nothing — and that is the correct, honest outcome (the branch is
 * itself the real Qatar entity and stays a standalone company).
 */
export async function findLegalBranchLinks() {
  const rows = (await query(`
    WITH br AS (
      SELECT b.id, b.name, b.name_normalized,
             btrim(regexp_replace(b.name_normalized, '\\m(branch|فرع)\\M', '', 'gi')) AS base_norm
        FROM companies b
       WHERE b.name ~* '\\m(branch|فرع)\\M'
         AND b.parent_company_id IS NULL
         AND COALESCE(b.archived, false) = false
         AND EXISTS (SELECT 1 FROM company_sources cs WHERE cs.company_id = b.id AND cs.source IN ('QFC','QFZ'))
    ),
    matched AS (
      SELECT br.id AS branch_id, br.name AS branch_name, p.id AS parent_id, p.name AS parent_name,
             count(*) OVER (PARTITION BY br.id) AS n
        FROM br
        JOIN companies p
          ON p.id <> br.id
         AND COALESCE(p.archived, false) = false
         AND p.name !~* '\\m(branch|فرع)\\M'
         AND length(br.base_norm) >= 8
         AND btrim(regexp_replace(p.name_normalized, '\\s+', ' ', 'g')) = br.base_norm
    )
    SELECT branch_id, branch_name, parent_id, parent_name
      FROM matched
     WHERE n = 1
     ORDER BY parent_name`)).rows;
  return rows;
}
