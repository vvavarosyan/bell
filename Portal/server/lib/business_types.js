// ============================================================================
// Business-type search — bridges USER vocabulary ("haircut salon", "laundries",
// "gift shop") to SOURCE vocabulary (QCCI sub-categories held in
// companies.sector, specific trade tags in companies.industries[], and Google
// Maps categories in extra_fields.gmaps_categories).
// ----------------------------------------------------------------------------
// Query-side ONLY: nothing here writes per-company data, so Rule 2.1 holds —
// Bell only surfaces classifications a source actually stated. The vocabulary
// is the live set of distinct stated values (with counts), cached briefly.
// ============================================================================

import { query } from '../db.js';

// --- normalization ----------------------------------------------------------
// QCCI spells "Saloons"; users type "salons". Light stemming: -ies → y
// (laundries → laundry, pharmacies → pharmacy), then trailing -s (not -ss).
const normText = (s) => String(s || '').toLowerCase()
  .replace(/saloon/g, 'salon')
  .replace(/[^a-z0-9&]+/g, ' ')
  .trim();

export function stemToken(t) {
  if (t.endsWith('ies') && t.length > 4) return t.slice(0, -3) + 'y';
  if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) return t.slice(0, -1);
  return t;
}

// Generic wrapper words users add around a trade ("gift SHOP", "law FIRM",
// "cleaning COMPANY") — never required to appear in the stated label. If ALL
// tokens are generic, there is no type query.
const GENERIC = new Set([
  'shop', 'store', 'firm', 'company', 'center', 'centre', 'office', 'outlet',
  'house', 'service', 'business', 'provider', 'place', 'venue', 'vendor',
  'all', 'the', 'in', 'of', 'and', 'or', 'to', 'for', 'qatar', 'doha',
  'industry', 'sector', 'list', 'show', 'me', 'find', 'any', 'near', 'best',
]);

// User words → words that actually appear in stated labels. Expansion only —
// each expansion still has to match a real stated value to have any effect.
const SYNONYMS = {
  haircut: ['salon', 'barber', 'hairdress'],
  haircutting: ['salon', 'barber', 'hairdress'],
  hairdresser: ['salon', 'barber', 'hairdress'],
  hairdressing: ['salon', 'barber'],
  barbershop: ['barber', 'salon', 'gent'],
  laundromat: ['laundry'],
  'drycleaner': ['laundry', 'dry'],
  souvenir: ['gift'],
  florist: ['flower'],
  gym: ['fitness', 'gym'],
  grocery: ['grocer', 'foodstuff', 'supermarket'],
  minimarket: ['grocer', 'supermarket'],
  eatery: ['restaurant', 'cafeteria'],
  diner: ['restaurant'],
  cafe: ['cafe', 'coffee', 'cafeteria'],
  chemist: ['pharmacy'],
  drugstore: ['pharmacy'],
  optician: ['optic'],
  vet: ['veterinar'],
  daycare: ['nursery', 'kindergarten'],
  tailoring: ['tailor'],
  upholsterer: ['upholster'],
  realtor: ['real estate', 'property'],
  mechanic: ['car repair', 'garage', 'auto'],
  workshop: ['repair', 'workshop'],
  it: ['information technology', 'computer', 'software'],
  tech: ['technology', 'information technology'],
  design: ['design', 'decor', 'decoration'],
  designer: ['design', 'decor'],
};

// --- vocabulary (stated values + counts), cached ---------------------------
let VOCAB = null;           // [{label, src: registry|tag|google, count, tokens}]
let VOCAB_AT = 0;
const VOCAB_TTL_MS = 10 * 60 * 1000;

async function loadVocab() {
  if (VOCAB && Date.now() - VOCAB_AT < VOCAB_TTL_MS) return VOCAB;
  const r = await query(`
    SELECT btrim(sector) AS label, 'registry' AS src, count(*)::int AS n
      FROM companies WHERE archived = false AND sector IS NOT NULL AND btrim(sector) <> ''
     GROUP BY 1
    UNION ALL
    SELECT u.tag, 'tag', count(*)::int
      FROM companies, LATERAL unnest(industries) AS u(tag)
     WHERE archived = false AND btrim(u.tag) <> ''
     GROUP BY 1
    UNION ALL
    SELECT g.cat, 'google', count(DISTINCT companies.id)::int
      FROM companies, LATERAL jsonb_array_elements_text(extra_fields->'gmaps_categories') AS g(cat)
     -- jsonb_typeof guard is load-bearing: the key-exists test is TRUE even when
     -- the value is JSON null (CLAUDE.md section 7), and jsonb_array_elements_text
     -- throws on a scalar. Stage 5 can write gmaps_categories null, so require an
     -- array here or one poisoned row would 500 EVERY company search.
     WHERE archived = false AND jsonb_typeof(extra_fields->'gmaps_categories') = 'array' AND btrim(g.cat) <> ''
     GROUP BY 1`);
  VOCAB = r.rows.map((v) => ({
    label: v.label, src: v.src, count: v.n,
    tokens: normText(v.label).split(' ').filter(Boolean).map(stemToken),
  }));
  VOCAB_AT = Date.now();
  return VOCAB;
}

export function invalidateBusinessTypeVocab() { VOCAB = null; }

// --- matching ---------------------------------------------------------------
const tokMatch = (a, b) =>
  a === b || (a.length >= 4 && b.startsWith(a)) || (b.length >= 4 && a.startsWith(b));

function queryTokens(q) {
  return normText(q).split(' ').filter((t) => t.length >= 2 && !GENERIC.has(t)).map(stemToken);
}

/**
 * Match a user query against the stated business-type vocabulary.
 * Full-tier: entries where EVERY query token (or a synonym of it) appears.
 * Partial-tier (only when nothing matches fully): entries matching ANY token.
 * Returns { types: [{label, src, count}], full } — capped, biggest counts first.
 */
export async function matchBusinessTypes(q, { cap = 40 } = {}) {
  const toks = queryTokens(q);
  if (!toks.length) return { types: [], full: false };
  const expanded = toks.map((t) => {
    const alts = new Set([t]);
    for (const s of SYNONYMS[t] || []) for (const w of normText(s).split(' ')) alts.add(stemToken(w));
    return [...alts];
  });
  const vocab = await loadVocab();
  const scored = [];
  for (const v of vocab) {
    let hit = 0;
    for (const alts of expanded) {
      if (alts.some((a) => v.tokens.some((vt) => tokMatch(a, vt)))) hit += 1;
    }
    if (hit > 0) scored.push({ v, frac: hit / expanded.length });
  }
  const full = scored.filter((s) => s.frac === 1);
  const pick = (full.length ? full : scored)
    .sort((a, b) => b.v.count - a.v.count)
    .slice(0, cap)
    .map((s) => ({ label: s.v.label, src: s.v.src, count: s.v.count }));
  return { types: pick, full: full.length > 0 };
}

/** List/search the vocabulary for the filter panel (top by count). */
export async function listBusinessTypes(q, { cap = 100 } = {}) {
  const vocab = await loadVocab();
  if (!q || !String(q).trim()) {
    return [...vocab].sort((a, b) => b.count - a.count).slice(0, cap)
      .map(({ label, src, count }) => ({ label, src, count }));
  }
  const { types } = await matchBusinessTypes(q, { cap });
  return types;
}

// --- broad-industry gate (search precision) ---------------------------------
// A query earns a WHOLE-industry match only by naming the industry itself (its
// label words, or a true whole-industry synonym). A trade word must not dump
// its parent industry: "pharmacy" used to return all 6,975 Healthcare companies.
const INDUSTRY_NAME_ALIASES = {
  'Information Technology': ['it', 'ict', 'tech', 'technology', 'software'],
  'Healthcare': ['medical', 'health'],
  'Hospitality & F&B': ['food', 'hospitality'],
  'Banking & Finance': ['bank', 'banking', 'finance', 'financial'],
  'Legal Services': ['law', 'legal'],
  'Construction & Contracting': ['construction', 'contracting', 'contractor'],
  'Logistics & Transport': ['logistics', 'transport', 'transportation', 'shipping'],
  'Facilities & Cleaning': ['cleaning', 'facilities', 'facility'],
  'Oil & Gas': ['oil', 'gas', 'petroleum'],
  'Real Estate': ['property'],
  'Automotive': ['automotive'],
  'Trading & Distribution': ['trading', 'trade', 'distribution'],
  'Marketing & Advertising': ['marketing', 'advertising'],
  'Media & Entertainment': ['media', 'entertainment'],
  'Travel & Tourism': ['travel', 'tourism'],
  'Education & Training': ['education', 'training'],
  'Manpower & Recruitment': ['manpower', 'recruitment', 'staffing'],
  'Agriculture & Fisheries': ['agriculture', 'farming', 'fisheries'],
  'Textiles & Garments': ['textiles', 'garments', 'clothing'],
  'Jewellery & Gold': ['jewellery', 'jewelry', 'gold'],
  'Security Services': ['security'],
  'Sports & Recreation': ['sports'],
  'Chemicals & Plastics': ['chemicals', 'plastics'],
  'Energy & Utilities': ['energy', 'utilities'],
  'Government & Public Sector': ['government'],
  'Beauty & Wellness': ['beauty', 'wellness'],
  // QCCI has no "interior design" wording — Furniture & Interior is the stated
  // home of interior-design firms, so naming that trade reaches the industry.
  'Furniture & Interior': ['furniture', 'interior', 'design', 'decor', 'decoration'],
};
export function queryNamesIndustry(canon, q) {
  const toks = queryTokens(q);
  if (!toks.length) return false;
  const pool = [
    ...normText(canon).split(' ').filter((t) => t.length >= 2),
    ...(INDUSTRY_NAME_ALIASES[canon] || []),
  ].map(stemToken);
  return toks.every((t) => pool.some((p) => tokMatch(t, p)));
}

/** SQL fragment matching companies whose stated type is one of `types`.
 *  Pushes params; returns the OR-able condition (or '' when types is empty). */
export function businessTypeCondition(types, params) {
  const regs = types.filter((t) => t.src === 'registry').map((t) => t.label);
  const tags = types.filter((t) => t.src === 'tag').map((t) => t.label);
  const goog = types.filter((t) => t.src === 'google').map((t) => t.label);
  const ors = [];
  if (regs.length) { params.push(regs); ors.push(`btrim(companies.sector) = ANY($${params.length}::text[])`); }
  if (tags.length) { params.push(tags); ors.push(`companies.industries && $${params.length}::text[]`); }
  if (goog.length) { params.push(goog); ors.push(`(companies.extra_fields ? 'gmaps_categories' AND companies.extra_fields->'gmaps_categories' ?| $${params.length}::text[])`); }
  return ors.length ? `(${ors.join(' OR ')})` : '';
}

/** Same, for the filter-panel param where labels arrive without a source —
 *  each label is tried against all three stated-type columns. */
export function businessTypeFilterCondition(labels, params) {
  return businessTypeCondition(
    labels.flatMap((l) => [{ label: l, src: 'registry' }, { label: l, src: 'tag' }, { label: l, src: 'google' }]),
    params);
}
