// Whose vacancy is this?
//
// Val, 2026-08-07: cover the whole active company database, and never show a vacancy that has
// closed, "so it's not misleading information for our users." A vacancy attached to the WRONG
// company is misleading in exactly the same way — worse, actually, because it carries a real date
// and lights a hiring signal Bell then sells.
//
// ── TWO WAYS TO DECIDE, AND ONLY ONE OF THEM IS EVIDENCE ─────────────────────────────────────
// (1) BY BOARD: "this careers page was linked from company X's website, so its jobs are X's."
//     That inherits every error in Bell's stored websites. "Honey Well Trading & Contracting", a
//     Qatar trading firm, has honeywell.com on record; that board carries 1,282 vacancies in
//     Chennai, Pune and Bracknell, and Honeywell also has a genuine Doha vacancy — so filtering to
//     Qatar does not save you. The board model already refuses to attribute an unverified board.
//
// (2) BY STATED EMPLOYER: the posting itself names who is hiring. QatarEnergy's pages state
//     "QatarEnergy". Qatar Living's listings name the employer on the listing. That is the SOURCE
//     speaking, which is the only thing Rule 2.1 lets Bell repeat.
//
// This module is (2). It is strictly better than (1) where it applies, and it is why Oracle's 34
// requisitions stay unattached: Oracle Cloud returns no employer on 86 of 86 requisitions sampled,
// so there is nothing to match, and inventing one from the tenant host would be a guess.
//
// ── WHY IT IS THIS STRICT ────────────────────────────────────────────────────────────────────
// A stated employer name is matched only when it lands on EXACTLY ONE active company, on a
// word-preserving key. Deliberately NOT ingest/normalize.js's normalizeName: that strips
// "company", "group", "holding", "trading", "services" as legal-form noise, which already caused a
// real Rule-2.1 bug ("Al Jaber Holding Company" collapsing onto "Al Jaber & Partners"). Here those
// words are the difference between two real employers, so they are kept.
//
// Two companies sharing the key → no attribution. A key too short or too generic → no attribution.
// Leaving a vacancy unattached costs Bell a link; attaching it to the wrong firm costs a customer
// a wrong decision.

import { query } from '../db.js';

const hit = (row, stated, how) => ({
  company_id: Number(row.id),
  company_name: row.name,
  why: `the posting names its employer as "${String(stated).slice(0, 120)}", which matches exactly one active company by ${how}`,
});

/**
 * Lowercase, &→and, strip punctuation, collapse spaces. EVERY word survives (Latin + Arabic).
 * Same shape as enrichment/branch_link.js's cleanName, and deliberately so — two places that
 * compare company names should not disagree about what a name is.
 */
export function employerKey(name) {
  return String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9؀-ۿ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// A trailing legal form may differ between how a job board writes an employer and how the
// registry does ("Milaha" ↔ "Milaha W.L.L."), so it is allowed to differ — but only at the END,
// and only these tokens. Nothing that distinguishes two firms is ever dropped.
/**
 * ⚠️ ONE LIST, TWO CONSUMERS. These tokens build BOTH the JS regex below and the SQL expression
 * sent to Postgres (and indexed by migrations 112 + 113). They were once written out twice by hand
 * and drifted: the JS list had the SPACED form `w l l` and the SQL list did not, so 2,188 live
 * companies registered as "… W.L.L." could never be matched — "Encon Corporation" simply failed to
 * find "Encon Corporation W.L.L.". Derived from one array now, and tests/jobs_attribution.test.mjs
 * asserts the shipped index definition still contains every token.
 *
 * A SPACED entry is not decoration: employerKey turns "W.L.L." into "w l l" and
 * "Qatar Aluminium Co. W . L . L" into "… co w l l", so the spaced spellings are what actually
 * arrive. Only trailing forms are optional; nothing that distinguishes two firms is ever dropped.
 */
export const LEGAL_TRAIL_TOKENS = [
  'co', 'company', 'llc', 'ltd', 'limited', 'inc', 'plc', 'est', 'establishment',
  'spc', 'qpsc', 'qsc', 'qssc', 'sae', 'sao', 'wll', 'psc', 'qfz', 'qfc',
  // the same forms as the punctuation-stripper leaves them
  'w l l', 's p c', 'q p s c', 'q s c', 'q s s c', 's a e', 's a o', 'l l c', 'p l c',
];
const LEGAL_TRAIL_RE = new RegExp(`(?:\\b(?:${LEGAL_TRAIL_TOKENS.join('|')})\\b[\\s.]*)+$`);
export const employerCore = (name) => employerKey(name).replace(LEGAL_TRAIL_RE, '').trim();

/** The SQL forms of the three keys. Exported so a test can compare them with the live indexes. */
export const SQL_KEY = `btrim(regexp_replace(regexp_replace(lower(replace(name, '&', ' and ')), '[^a-z0-9؀-ۿ]+', ' ', 'g'), '\\s+', ' ', 'g'))`;
export const SQL_CORE = `btrim(regexp_replace(${SQL_KEY}, '( ?\\m(${LEGAL_TRAIL_TOKENS.join('|')})\\M)+$', '', 'g'))`;
export const SQL_TIGHT = `replace(${SQL_KEY}, ' ', '')`;

// Words that name an industry or a place rather than a firm. A "stated employer" made only of
// these is a category, not a company — job boards are full of them ("Trading Company", "Hotel
// Doha", "Restaurant"). Matching on one would attach dozens of unrelated vacancies to whichever
// company happens to be registered under that generic name.
const GENERIC_ONLY = new Set([
  'qatar', 'doha', 'company', 'trading', 'contracting', 'services', 'group', 'holding',
  'international', 'general', 'business', 'consultancy', 'consulting', 'solutions', 'enterprises',
  'restaurant', 'hotel', 'clinic', 'hospital', 'school', 'centre', 'center', 'agency',
  'confidential', 'private', 'client', 'employer', 'recruitment', 'hiring', 'various',
]);

/**
 * Is this stated employer specific enough to be worth matching at all?
 *
 * A one-word name is allowed — Qatar's biggest employers are one word (QatarEnergy, Milaha,
 * Ooredoo, Baladna) and refusing them threw away the best matches this rule has. The protection is
 * not word COUNT, it is: no word from the generic list on its own, and the name must land on
 * exactly one active company. "Qatar", "Trading", "Hotel" fail the first test; anything vague
 * enough to be risky fails the second, because vague names are never unique across 197k companies.
 */
export function isSpecificEmployer(stated) {
  const core = employerCore(stated);
  if (!core) return false;
  const words = core.split(' ').filter(Boolean);
  const meaningful = words.filter((w) => !GENERIC_ONLY.has(w));
  if (!meaningful.length) return false;
  // A single word has to carry its own weight; two or more can be shorter each.
  if (words.length === 1) return core.length >= 5;
  return core.length >= 6;
}

/**
 * The one company this stated employer names — or null, which is a perfectly good answer.
 *
 * @param {string} stated  the employer exactly as the source wrote it
 * @returns {Promise<{company_id, company_name, why} | null>}
 */
export async function matchStatedEmployer(stated, { q = query } = {}) {
  if (!isSpecificEmployer(stated)) return null;
  const core = employerCore(stated);

  // ⚠️ THESE EXPRESSIONS ARE INDEXED (migrations 112 + 113) AND MUST MATCH THE INDEX EXACTLY.
  // Without the index this is a full rewrite-and-scan of 190k names per lookup — measured at 2.4 s
  // for a hit and 4.4 s for a miss. They are built from LEGAL_TRAIL_TOKENS above so the JS and SQL
  // sides cannot drift; a test asserts the live index definition still agrees.
  const KEY = SQL_KEY, CORE = SQL_CORE, TIGHT = SQL_TIGHT;
  const LIVE = `COALESCE(archived, false) = false AND canonical_id IS NULL AND is_active IS NOT false`;

  // ── PASS 1: THE NAME EXACTLY AS REGISTERED ───────────────────────────────────────────────────
  // LIKE, ILIKE and trigram similarity are absent on purpose: "Qatar Steel" and "Qatar Steel
  // Industrial" are two different companies, and a fuzzy match here would merge them.
  const r = await q(
    `SELECT id, name FROM companies WHERE ${LIVE} AND ${KEY} = $1 LIMIT 3`, [core]);
  if (r.rows.length === 1) return hit(r.rows[0], stated, 'name');
  // Ambiguity is not a tie to break — it is a reason to stop. Two live companies whose names
  // reduce to the same words means the source has not told Bell which one is hiring.
  if (r.rows.length > 1) return null;

  // ── PASS 2: ALLOWING A TRAILING LEGAL FORM TO DIFFER ─────────────────────────────────────────
  // Only when pass 1 found NOTHING, because an exact registered name is the better answer whenever
  // one exists. Bell holds both "ooredoo" and "Ooredoo Q.P.S.C."; running the two comparisons in a
  // single OR made "Ooredoo" ambiguous and lost a match that had been correct — precision first,
  // then reach.
  const rc = await q(
    `SELECT id, name FROM companies WHERE ${LIVE} AND ${CORE} = $1 LIMIT 3`, [core]);
  if (rc.rows.length === 1) return hit(rc.rows[0], stated, 'name, allowing a trailing legal form to differ');
  if (rc.rows.length > 1) return null;

  // ── PASS 3: WORD BREAKS ONLY ─────────────────────────────────────────────────────────────────
  // Only when both passes above found NOTHING. A brand that writes itself as one word is registered
  // as two, or the reverse: the career portal says "QatarEnergy", the register says "Qatar Energy".
  // Comparing with the spaces removed preserves letter order, so two names can only collide if
  // they spell the same thing.
  //
  // MEASURED BEFORE SHIPPING, not assumed (rule 2.2): across all live company names, exactly 12
  // groups have different word-keys that collapse to the same spaceless key — "Aalaf Qatar" /
  // "aalafqatar", "Tadmur Holding" / "tadmurholding", "Al Arab Bakery & Sweets" / "Alarab Bakery
  // and Sweets". All 12 are the SAME firm written twice. Zero pairs of genuinely different
  // companies collide, and where Bell holds the firm twice the uniqueness test refuses anyway.
  const tight = core.replace(/ /g, '');
  if (tight.length < 6) return null;
  const r2 = await q(
    `SELECT id, name FROM companies WHERE ${LIVE} AND ${TIGHT} = $1 LIMIT 3`, [tight]);
  if (r2.rows.length !== 1) return null;
  return hit(r2.rows[0], stated, 'name ignoring word breaks');
}

/**
 * Decide company_id for one incoming job.
 *
 * THE POSTING OUTRANKS THE BOARD. A verified board — a careers page on the company's own domain —
 * is good evidence, but it is evidence about the PAGE, not about each vacancy on it. Recruitment
 * agencies are the case that breaks a board-only rule and they are common in Qatar: an agency's own
 * careers page advertises its CLIENTS' vacancies, and every one of them would otherwise be recorded
 * as the agency hiring. The same shape appears wherever a site embeds a shared job widget.
 *
 * So when the posting names an employer AND that name resolves to exactly one active company, that
 * company wins — it is the more specific statement, and it is the source's own. The board answers
 * only when the posting says nothing, which is the common case (Oracle states no employer on 86 of
 * 86 requisitions sampled).
 *
 * @returns {Promise<{company_id: number|null, how: string}>}
 */
export async function attributeJob(board, job, { q = query } = {}) {
  const m = await matchStatedEmployer(job?.employer_stated, { q });
  if (m) {
    const boardId = board?.attribution === 'verified' && board.company_id ? Number(board.company_id) : null;
    return {
      company_id: m.company_id,
      how: boardId && boardId !== m.company_id
        ? `${m.why} — which is NOT the company whose page carries this board, so the posting wins`
        : m.why,
    };
  }
  if (board?.attribution === 'verified' && board.company_id) {
    return { company_id: Number(board.company_id), how: 'verified board on the company\'s own domain; the posting names no employer' };
  }
  return { company_id: null, how: 'no company named by the source, or the name matched more than one' };
}
