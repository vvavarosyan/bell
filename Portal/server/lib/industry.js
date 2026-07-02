// ============================================================================
// Industry derivation — turn a company's signals into canonical industry tags
// ----------------------------------------------------------------------------
// A Qatar company often spans several industries ("Trading & Contracting",
// "Brand Consulting"), so each company carries a SET of canonical industry tags
// plus one PRIMARY. Tags are derived, in reliability order, from:
//
//   1. Source-directory category  (QCCI / QFZ / QSTP / QSE / MOCI / sector) —
//      the source already classified the company, so this is the best signal.
//   2. LinkedIn industry label.
//   3. Strict name/description inference (extract.js inferIndustry) — only when
//      a definitive marker is present.
//
// `mapLabelToCanonical` is LENIENT (its input is already an industry label, so
// broad keyword matching is safe), while name/description inference stays STRICT.
// The existing free-text `companies.industry` value is intentionally NOT used as
// an input, so old wrong guesses (e.g. QNBN → "Healthcare") are replaced, not
// propagated.
// ============================================================================

import { inferIndustry } from '../enrichment/local/extract.js';
import fs from 'node:fs';

// Curated specific-trade vocabulary (built by scripts/build_trade_vocabulary.js).
// When present, ONLY these specific trades are emitted as tags; when absent (not
// yet built) all cleaned trades pass through. Loaded once at module startup.
let TRADE_VOCAB = null;
try {
  const _vraw = fs.readFileSync(new URL('../data/trade_vocab.json', import.meta.url), 'utf8');
  const _varr = JSON.parse(_vraw);
  if (Array.isArray(_varr) && _varr.length) TRADE_VOCAB = new Set(_varr);
} catch { /* no vocabulary file yet — emit all cleaned trades */ }

// The canonical industry vocabulary. Keep labels stable — they're stored and
// shown in the filter dropdown.
export const CANONICAL_INDUSTRIES = [
  'Oil & Gas', 'Energy & Utilities', 'Telecommunications', 'Information Technology',
  'Banking & Finance', 'Insurance', 'Real Estate', 'Construction & Contracting',
  'Engineering', 'Healthcare', 'Pharmaceuticals', 'Logistics & Transport',
  'Trading & Distribution', 'Retail', 'Manufacturing', 'Chemicals & Plastics',
  'Automotive', 'Marketing & Advertising', 'Media & Entertainment', 'Hospitality & F&B',
  'Travel & Tourism', 'Legal Services', 'Consulting', 'Security Services',
  'Facilities & Cleaning', 'Education & Training', 'Agriculture & Fisheries',
  'Aviation & Aerospace', 'Furniture & Interior', 'Textiles & Garments',
  'Beauty & Wellness', 'Jewellery & Gold', 'Government & Public Sector',
  'Sports & Recreation', 'Manpower & Recruitment',
];

// [canonical, keywords] — a keyword appearing in an industry LABEL maps it to the
// canonical bucket. A single label can map to several canonicals (e.g. "Trading
// & Contracting" → Trading + Construction). Most-specific entries first.
export const LABEL_MAP = [
  ['Oil & Gas', ['oil', 'gas', 'petroleum', 'petrochemical', ' lng', 'hydrocarbon', 'upstream', 'downstream', 'petrol station']],
  ['Energy & Utilities', ['electricity', 'power generation', 'utilities', 'water treatment', 'solar', 'renewable', 'district cooling', 'desalination', 'energy']],
  ['Telecommunications', ['telecom', 'communication', 'broadband', 'fiber', 'fibre', 'satellite', 'network services']],
  ['Information Technology', ['information technology', 'software', ' it ', 'ict', 'computer', 'digital', 'technology', 'cyber', 'data services', 'internet']],
  ['Banking & Finance', ['bank', 'financ', 'invest', 'capital market', 'wealth', 'asset manage', 'exchange house', 'brokerage']],
  ['Insurance', ['insurance', 'takaful', 'reinsur']],
  ['Real Estate', ['real estate', 'real-estate', 'realestate', 'property', 'realty']],
  ['Construction & Contracting', ['construct', 'contract', 'building', 'civil works', 'infrastructure', 'concrete', 'asphalt', 'aluminium', 'aluminum', 'plumbing', 'air conditioning', 'elevator', 'escalator', 'carpentry']],
  ['Engineering', ['engineering', 'electromechanical']],
  ['Pharmaceuticals', ['pharmaceutical']],
  ['Healthcare', ['health', 'medical', 'hospital', 'clinic', 'pharma', 'dental', 'nursing', 'diagnostic', 'wellness clinic', 'physiotherap']],
  ['Logistics & Transport', ['logistic', 'transport', 'shipping', 'freight', 'cargo', 'warehous', 'supply chain', 'courier', 'maritime', 'port ']],
  ['Trading & Distribution', ['trading', 'trade', 'distribut', 'import', 'export', 'wholesale', 'merchant', 'commercial agent']],
  ['Retail', ['retail', 'consumer goods', 'supermarket', 'hypermarket', 'shopping', 'fashion']],
  ['Manufacturing', ['manufactur', 'industrial', 'industries', 'factory', 'production', 'fabricat']],
  ['Chemicals & Plastics', ['chemical', 'plastic', 'polymer', 'paint', 'coating', 'rubber']],
  ['Automotive', ['automotive', 'vehicle', 'motor', ' auto', 'car service', 'car repair', 'car rental']],
  ['Marketing & Advertising', ['advertis', 'marketing', 'branding', 'public relations', 'signage']],
  ['Media & Entertainment', [' media ', 'broadcast', 'film', 'television', 'publishing', 'entertainment']],
  ['Hospitality & F&B', ['hospitality', 'restaurant', 'food', 'beverage', 'catering', 'hotel', 'cafe', 'bakery', 'baker', 'hosbitality']],
  ['Travel & Tourism', ['travel', 'tourism', ' tour']],
  ['Legal Services', ['legal', ' law', 'advocate', 'attorney']],
  ['Consulting', ['consult', 'professional services', 'business services', 'advisory', 'management services', 'auditing', 'audit office', 'accounts audit']],
  ['Security Services', ['security', 'surveillance', 'guarding']],
  ['Facilities & Cleaning', ['facilit', 'cleaning', 'maintenance', 'landscap', 'pest control', 'laundry', 'rodent']],
  ['Education & Training', ['education', 'training', 'school', 'academ', 'institute', 'university', 'e-learning', 'teaching', 'kinder']],
  ['Agriculture & Fisheries', ['agricultur', 'farm', 'fisher', 'livestock', 'poultry']],
  ['Aviation & Aerospace', ['aviation', 'airline', 'aircraft', 'aerospace', 'airport']],
  ['Furniture & Interior', ['furniture', 'interior', 'joinery', 'upholstery', 'carpentry']],
  ['Textiles & Garments', ['textile', 'garment', 'apparel', 'tailor', 'clothing']],
  ['Beauty & Wellness', ['beauty', 'salon', ' spa', 'cosmetic', 'perfume', 'barber', 'massage']],
  ['Jewellery & Gold', ['jewel', 'gold', 'watches', 'diamond']],
  ['Government & Public Sector', ['government', 'ministry', 'public sector', 'municipal']],
  ['Sports & Recreation', ['sports', 'fitness', 'recreation', 'sporting']],
  ['Manpower & Recruitment', ['manpower', 'recruitment', 'staffing', 'human resources']],
];

/** Map one industry/category LABEL to zero-or-more canonical industries. */
export function mapLabelToCanonical(label) {
  const hay = ' ' + String(label || '').toLowerCase().replace(/\s+/g, ' ') + ' ';
  if (hay.length < 4) return [];
  const out = [];
  for (const [canon, kws] of LABEL_MAP) {
    if (kws.some((k) => hay.includes(k))) out.push(canon);
  }
  return out;
}

/** The definitive LABEL_MAP keywords that appear in a label (e.g. "real estate"
 *  for "real estate agencies") — used by search to tell a category query from a
 *  company-name query. */
export function industryKeywordsIn(label) {
  const hay = ' ' + String(label || '').toLowerCase().replace(/\s+/g, ' ') + ' ';
  const out = [];
  for (const [, kws] of LABEL_MAP) for (const k of kws) if (hay.includes(k)) out.push(k.trim());
  return out;
}

function arrText(v) {
  if (v == null) return '';
  if (Array.isArray(v)) return v.join(', ');
  return String(v);
}

// Generic source labels that carry no real industry meaning — never promoted to
// a specific-trade tag (a company with only these stays unclassified).
const GENERIC_CATEGORY = new Set([
  'services', 'service', 'commercial services', 'industry', 'industries', 'company',
  'companies', 'general', 'others', 'other', 'miscellaneous', 'misc', 'business',
  'n/a', 'na', 'none', 'unknown', 'establishment', 'various', 'activities',
  'project & branches & management & supervising', 'establishing & supervising companies',
  'point of interest', 'store', 'premise', 'corporate office',   // generic Google Maps categories
]);

// Bare words that ARE a broad industry — never emit as a separate "specific"
// trade, because the broad canonical already covers them (avoids "Trade" next to
// "Trading & Distribution", "Contracting" next to "Construction", etc.).
const BROAD_SYNONYM = new Set([
  'trade', 'trading', 'contracting', 'construction', 'tourism', 'technology',
  'transport', 'transportation', 'agriculture', 'jewellery', 'jewelry', 'media',
  'retail', 'manufacturing', 'manufacture', 'consulting', 'consultancy', 'insurance',
  'engineering', 'banking', 'banks', 'marketing', 'advertising', 'advertisement',
  'education', 'hospitality', 'logistics', 'security', 'automotive', 'automobile',
  'pharmaceuticals', 'real estate', 'telecommunications', 'telecom', 'aviation',
  'energy', 'oil', 'gas', 'healthcare', 'health', 'finance', 'financial',
  'industrial', 'commerce',
]);

const TYPO_FIX = [
  [/\bhosbitality\b/gi, 'Hospitality'], [/\bsurey\b/gi, 'Survey'],
  [/\bmanagaement\b/gi, 'Management'], [/\bmanufacuring\b/gi, 'Manufacturing'],
];

function titleCaseLabel(s) {
  return s.replace(/\w\S*/g, (t) => t[0].toUpperCase() + t.slice(1).toLowerCase());
}

/** Normalise a raw source category into a clean specific-trade tag, or null when
 *  it's generic, a broad-industry synonym, or too short to be a real trade. */
export function cleanCategoryLabel(raw) {
  let s = String(raw || '').replace(/\s+/g, ' ').trim()
    .replace(/^[\s'"’.•·\-]+/, '')   // strip leading quotes/bullets/dashes/dots
    .replace(/^\d+\.\s*/, '')                   // strip a leading "1." numbering
    .replace(/[.;:,]+$/, '').trim();
  if (s.length < 3) return null;
  const low = s.toLowerCase();
  if (GENERIC_CATEGORY.has(low) || BROAD_SYNONYM.has(low)) return null;
  let out = titleCaseLabel(s);
  for (const [rx, rep] of TYPO_FIX) out = out.replace(rx, rep);
  return out;
}

// Split a raw source label into candidate trade parts — on commas/semicolons/
// pipes/slashes/bullets AND on "1." "2." numbered-list markers (QFZ sectors).
function splitLabelParts(label) {
  return String(label || '')
    .replace(/[•·]/g, ',')
    .split(/[,;|/]+|\s\d+\.\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** All cleaned specific-trade candidates for a company (BEFORE the vocabulary
 *  filter) — used by deriveIndustries and by the vocabulary builder. */
export function specificTradesFor(c = {}) {
  const extra = c.extra || c.extra_fields || {};
  const labels = [
    extra.qcci_sub_category, extra.qcci_category, c.sector, extra.qfz_sectors_raw,
    extra.qstp_category, arrText(extra.qstp_sector_tags), extra.qse_sector,
    extra.qse_sector_name, extra.moci_activity, extra.moci_main_activity,
    extra.gmaps_category, arrText(extra.gmaps_categories),   // Google Maps place category
    // NOTE: qfc_permitted_activities is long legal PROSE — used for broad industry
    // mapping only (in deriveIndustries), never as specific trades (it produced junk
    // fragments like "Shares"/"Foundation Models"/"Special Purpose Company").
  ];
  const out = []; const seen = new Set();
  for (const label of labels) for (const part of splitLabelParts(label)) {
    const spec = cleanCategoryLabel(part);
    if (spec && !seen.has(spec)) { seen.add(spec); out.push(spec); }
  }
  return out;
}

/**
 * Derive a company's industry tags + primary from its signals.
 * Produces BOTH levels (Val 2026-06-22): the broad canonical industries AND the
 * company's specific trade(s) (e.g. "Car Repair") — but a specific trade is only
 * emitted when it's in the curated TRADE_VOCAB (or no vocab is built yet), which
 * drops one-off / typo'd noise. `primary` stays a broad canonical when known.
 * @param {object} c   { name, legal_name, sector, description, industry, extra }
 * @returns {{ primary: string|null, tags: string[] }}
 */
export function deriveIndustries(c = {}) {
  const extra = c.extra || c.extra_fields || {};
  const broad = []; const seenB = new Set();
  const addBroad = (x) => { if (x && !seenB.has(x)) { seenB.add(x); broad.push(x); } };

  // 1) Source-directory categories → broad canonical(s).
  const sourceLabels = [
    extra.qcci_sub_category, extra.qcci_category, c.sector, extra.qfz_sectors_raw,
    extra.qstp_category, arrText(extra.qstp_sector_tags), extra.qse_sector,
    extra.qse_sector_name, extra.moci_activity, extra.moci_main_activity,
    extra.gmaps_category, arrText(extra.gmaps_categories),   // Google Maps place category
    extra.qfc_permitted_activities,                          // QFC official licensed activities
  ];
  for (const label of sourceLabels) for (const canon of mapLabelToCanonical(label)) addBroad(canon);

  // 2) LinkedIn industry label → broad. 3) strict name/desc inference → broad.
  for (const label of [extra.linkedin_industry_v2_taxonomy, extra.linkedin_industry]) {
    for (const canon of mapLabelToCanonical(label)) addBroad(canon);
  }
  const inferred = inferIndustry(`${c.name || ''}  ${c.legal_name || ''}  ${c.description || extra.website_description || ''}`);
  if (inferred) addBroad(inferred);

  // 4) Specific trades — only those in the curated vocabulary (if built).
  const specific = [];
  for (const spec of specificTradesFor(c)) {
    if (!TRADE_VOCAB || TRADE_VOCAB.has(spec)) specific.push(spec);
  }

  const tags = [...broad, ...specific];
  return { primary: broad[0] || specific[0] || null, tags };
}
