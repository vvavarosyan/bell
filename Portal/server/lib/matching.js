// Import matching engine (Import Phase 2, design §4) — shared by Track A
// (link my import rows to Bell) and any future internal dedup sweep.
//
// Pipeline per row: NORMALIZE → BLOCK (cheap candidate generation via indexes,
// never N²) → SCORE (weighted, deterministic — no ML) → DECIDE by band.
//
//   confidence >= 0.82 AND a strong identifier  → 'matched'  (auto-link)
//   confidence in [0.55, 0.82)                  → 'review'   (user confirms)
//   confidence <  0.55                          → 'new'      (create a record)
//
// CONSERVATIVE GUARD (Val 2026-06-30): a high score from a FUZZY NAME ALONE is
// never enough to auto-match — auto-match requires an exact identifier
// (domain / phone / email) OR a near-exact name (>=0.85) plus a corroborator
// (same city / phone). This is the exact lesson from the website auto-approve
// mess: a name lookalike must go to review, not silently merge.
//
// Pure helpers (normalizers, trigramSim, scoring, decide) are exported for unit
// tests; matchCompany/matchPerson run the SQL blocks (inject `q` to test).

import { query as defaultQuery } from '../db.js';
import { normalizeName } from '../ingest/normalize.js';

// ---------------------------------------------------------------------------
// Normalizers (kept in lock-step with migration 066's index expressions).
// ---------------------------------------------------------------------------

/** Registrable host of a website: lower → strip scheme → strip a leading
 *  "www." → host before the first "/". MUST mirror idx_companies_website_domain
 *  in migration 066 so the same value is produced on both sides of a match. */
export function companyDomain(v) {
  if (v == null) return null;
  let s = String(v).trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z]+:\/\//, '');   // scheme
  s = s.replace(/^www\./, '');         // leading www.
  s = s.split('/')[0];                 // host before first path segment
  return s || null;
}

/** Qatar phone match key: digits only, last 8 (the local subscriber number),
 *  so +974 / 00974 / spacing variations all collapse to the same key. */
export function phoneKey(v) {
  const d = String(v == null ? '' : v).replace(/\D/g, '');
  if (d.length < 7) return null;
  return d.slice(-8);
}

/** Validated lower-cased email, or null. */
export function emailKey(v) {
  const s = String(v == null ? '' : v).trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s) ? s : null;
}

const lc = (v) => String(v == null ? '' : v).trim().toLowerCase();

/** Dice coefficient over character trigrams — a 0..1 name similarity that
 *  approximates Postgres pg_trgm's similarity() closely enough for scoring. */
export function trigramSim(a, b) {
  const grams = (s) => {
    const t = `  ${String(s || '').toLowerCase().trim()} `;
    const set = new Set();
    for (let i = 0; i < t.length - 2; i++) set.add(t.slice(i, i + 3));
    return set;
  };
  const A = grams(a), B = grams(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

// ---------------------------------------------------------------------------
// Scoring (design §4 weight table). Returns { confidence, nameSim, strongId }.
// `strongId` gates auto-match: an exact identifier, or a near-exact name with a
// corroborator. Without it, even a 0.9 score is capped to 'review'.
// ---------------------------------------------------------------------------

export function scoreCompanyCandidate(row, cand) {
  const dom = companyDomain(row.website);
  const cDom = companyDomain(cand.website);
  const ph = phoneKey(row.phone);
  const cPh = phoneKey(cand.phone);
  const nameSim = trigramSim(normalizeName(row.name), cand.name_normalized || normalizeName(cand.name));

  const domainMatch = !!(dom && cDom && dom === cDom);
  const phoneMatch = !!(ph && cPh && ph === cPh);
  const cityMatch = !!(lc(row.city) && lc(cand.city) && lc(row.city) === lc(cand.city));
  const domainConflict = !!(dom && cDom && dom !== cDom);
  const phoneConflict = !!(ph && cPh && ph !== cPh);

  let c = 0;
  if (domainMatch) c += 0.55;
  if (phoneMatch) c += 0.25;
  c += 0.30 * nameSim;
  if (cityMatch) c += 0.10;
  if (domainConflict || phoneConflict) c -= 0.30;   // a hard contradiction

  const strongId = domainMatch || phoneMatch || (nameSim >= 0.85 && cityMatch);
  return { confidence: clamp01(c), nameSim, strongId, signals: { domainMatch, phoneMatch, cityMatch, domainConflict, phoneConflict } };
}

export function scorePersonCandidate(row, cand) {
  const em = emailKey(row.email);
  const cEm = emailKey(cand.email) || (cand._emails || []).map(emailKey).find((x) => x && x === em) || null;
  const ph = phoneKey(row.phone);
  const cPh = phoneKey(cand.phone);
  const nameSim = trigramSim(row.name, cand.full_name);

  const emailMatch = !!(em && cEm && em === cEm);
  const phoneMatch = !!(ph && cPh && ph === cPh);
  const cityMatch = !!(lc(row.city) && lc(cand.city) && lc(row.city) === lc(cand.city));
  const emailConflict = !!(em && cand.email && emailKey(cand.email) && emailKey(cand.email) !== em && !emailMatch);

  let c = 0;
  if (emailMatch) c += 0.55;
  if (phoneMatch) c += 0.25;
  c += 0.30 * nameSim;
  if (cityMatch) c += 0.10;
  if (emailConflict) c -= 0.30;

  const strongId = emailMatch || (nameSim >= 0.85 && (phoneMatch || cityMatch));
  return { confidence: clamp01(c), nameSim, strongId, signals: { emailMatch, phoneMatch, cityMatch, emailConflict } };
}

/** Map a (confidence, strongId) to a band. The strongId guard is what stops a
 *  fuzzy-name-only lookalike from auto-matching. */
export function decideBand(confidence, strongId) {
  if (confidence >= 0.82 && strongId) return 'matched';
  if (confidence >= 0.55) return 'review';
  return 'new';
}

// ---------------------------------------------------------------------------
// Blocking + orchestration. Each returns:
//   { status:'matched'|'review'|'new', confidence, entity_id, candidate }
// `candidate` (best match) is null for 'new'. Inject `q` in tests.
// ---------------------------------------------------------------------------

// companies.website domain expression — IDENTICAL to idx_companies_website_domain.
const DOMAIN_EXPR = (x) =>
  `lower(split_part(regexp_replace(regexp_replace(${x}::text,'^[a-z]+://','','i'),'^www\\.','','i'),'/',1))`;

export async function matchCompany(row, { q = defaultQuery, limit = 25 } = {}) {
  const norm = normalizeName(row.company_name || row.name || '');
  const dom = companyDomain(row.website);
  const row2 = { ...row, name: row.company_name || row.name || '' };
  if (!norm && !dom) return { status: 'new', confidence: 0, entity_id: null, candidate: null };

  const byId = new Map();
  const add = (rows) => { for (const r of rows) if (!byId.has(Number(r.id))) byId.set(Number(r.id), r); };

  // BLOCK 1 — exact website domain (index-backed; both sides use the same expr).
  if (dom) {
    const r = await q(
      `SELECT id, name, name_normalized, website, phone, city, country
         FROM companies
        WHERE website IS NOT NULL AND COALESCE(archived,false)=false
          AND ${DOMAIN_EXPR('website')} = ${DOMAIN_EXPR('$1')}
        LIMIT 10`,
      [row.website],
    );
    add(r.rows);
  }
  // BLOCK 2 — name trigram, scoped to Qatar (uses idx_companies_name_trgm).
  if (norm) {
    const r = await q(
      `SELECT id, name, name_normalized, website, phone, city, country
         FROM companies
        WHERE COALESCE(archived,false)=false
          AND (country='Qatar' OR country IS NULL)
          AND name_normalized % $1
        ORDER BY similarity(name_normalized, $1) DESC
        LIMIT $2`,
      [norm, limit],
    );
    add(r.rows);
  }

  return pickBest([...byId.values()].map((cand) => ({ cand, sc: scoreCompanyCandidate(row2, cand) })));
}

export async function matchPerson(row, { q = defaultQuery, limit = 25 } = {}) {
  const em = emailKey(row.email);
  const norm = String(row.name || '').trim();
  if (!em && !norm) return { status: 'new', confidence: 0, entity_id: null, candidate: null };

  const byId = new Map();
  const add = (rows) => { for (const r of rows) if (!byId.has(Number(r.id))) byId.set(Number(r.id), r); };

  // BLOCK 1 — exact email, on the people row OR a person_contacts email.
  if (em) {
    const r = await q(
      `SELECT p.id, p.full_name, p.email, p.phone, p.city
         FROM people p
        WHERE COALESCE(p.archived,false)=false
          AND ( lower(p.email::text) = $1
                OR p.id IN (SELECT person_id FROM person_contacts WHERE type='email' AND lower(value)=$1) )
        LIMIT 10`,
      [em],
    );
    add(r.rows);
  }
  // BLOCK 2 — name trigram (uses idx_people_name_trgm).
  if (norm) {
    const r = await q(
      `SELECT p.id, p.full_name, p.email, p.phone, p.city
         FROM people p
        WHERE COALESCE(p.archived,false)=false AND p.full_name % $1
        ORDER BY similarity(p.full_name, $1) DESC
        LIMIT $2`,
      [norm, limit],
    );
    add(r.rows);
  }

  return pickBest([...byId.values()].map((cand) => ({ cand, sc: scorePersonCandidate(row, cand) })), true);
}

/** Choose the highest-confidence candidate and resolve its band. */
function pickBest(scored, isPerson = false) {
  if (!scored.length) return { status: 'new', confidence: 0, entity_id: null, candidate: null };
  scored.sort((a, b) => b.sc.confidence - a.sc.confidence);
  const best = scored[0];
  const status = decideBand(best.sc.confidence, best.sc.strongId);
  if (status === 'new') return { status, confidence: best.sc.confidence, entity_id: null, candidate: null };
  const c = best.cand;
  return {
    status,
    confidence: Number(best.sc.confidence.toFixed(3)),
    entity_id: Number(c.id),
    candidate: {
      id: Number(c.id),
      name: isPerson ? c.full_name : c.name,
      website: c.website || null,
      email: c.email || null,
      phone: c.phone || null,
      city: c.city || null,
      nameSim: Number(best.sc.nameSim.toFixed(3)),
      signals: best.sc.signals,
    },
  };
}
