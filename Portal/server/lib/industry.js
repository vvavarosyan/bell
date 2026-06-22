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
const LABEL_MAP = [
  ['Oil & Gas', ['oil', 'gas', 'petroleum', 'petrochemical', ' lng', 'hydrocarbon', 'upstream', 'downstream', 'petrol station']],
  ['Energy & Utilities', ['electricity', 'power generation', 'utilities', 'water treatment', 'solar', 'renewable', 'district cooling', 'desalination', 'energy']],
  ['Telecommunications', ['telecom', 'communication', 'broadband', 'fiber', 'fibre', 'satellite', 'network services']],
  ['Information Technology', ['information technology', 'software', ' it ', 'ict', 'computer', 'digital', 'technology', 'cyber', 'data services', 'internet']],
  ['Banking & Finance', ['bank', 'financ', 'invest', 'capital market', 'wealth', 'asset manage', 'exchange house', 'brokerage']],
  ['Insurance', ['insurance', 'takaful', 'reinsur']],
  ['Real Estate', ['real estate', 'real-estate', 'realestate', 'property', 'realty']],
  ['Construction & Contracting', ['construct', 'contract', 'building', 'civil works', 'infrastructure', 'concrete', 'asphalt', 'aluminium', 'aluminum', 'plumbing']],
  ['Engineering', ['engineering', 'electromechanical', 'air conditioning', 'elevator', 'escalator']],
  ['Pharmaceuticals', ['pharmaceutical']],
  ['Healthcare', ['health', 'medical', 'hospital', 'clinic', 'pharma', 'dental', 'nursing', 'diagnostic', 'wellness clinic', 'physiotherap']],
  ['Logistics & Transport', ['logistic', 'transport', 'shipping', 'freight', 'cargo', 'warehous', 'supply chain', 'courier', 'maritime', 'port ']],
  ['Trading & Distribution', ['trading', 'trade', 'distribut', 'import', 'export', 'wholesale', 'merchant', 'commercial agent']],
  ['Retail', ['retail', 'consumer goods', 'supermarket', 'hypermarket', 'shopping', 'fashion']],
  ['Manufacturing', ['manufactur', 'industrial', 'industries', 'factory', 'production', 'fabricat']],
  ['Chemicals & Plastics', ['chemical', 'plastic', 'polymer', 'paint', 'coating', 'rubber']],
  ['Automotive', ['automotive', 'vehicle', 'motor', ' auto', 'car service', 'car repair', 'car rental']],
  ['Marketing & Advertising', ['advertis', 'marketing', 'branding', 'public relations', 'signage']],
  ['Media & Entertainment', ['media', 'broadcast', 'film', 'television', 'publishing', 'entertainment']],
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

/**
 * Derive a company's industry tags + primary from its signals.
 * @param {object} c   { name, legal_name, sector, description, industry, extra }
 *   `extra` is the company's extra_fields jsonb.
 * @returns {{ primary: string|null, tags: string[] }}
 */
export function deriveIndustries(c = {}) {
  const extra = c.extra || c.extra_fields || {};
  const tags = [];
  const seen = new Set();
  const add = (canon) => { if (canon && !seen.has(canon)) { seen.add(canon); tags.push(canon); } };

  // 1) Source-directory categories (most reliable) — order = priority.
  const sourceLabels = [
    extra.qcci_sub_category, extra.qcci_category,
    c.sector,
    extra.qfz_sectors_raw,
    extra.qstp_category, arrText(extra.qstp_sector_tags),
    extra.qse_sector, extra.qse_sector_name,
    extra.moci_activity, extra.moci_main_activity,
  ];
  for (const label of sourceLabels) for (const canon of mapLabelToCanonical(label)) add(canon);

  // 2) LinkedIn industry label.
  for (const label of [extra.linkedin_industry_v2_taxonomy, extra.linkedin_industry]) {
    for (const canon of mapLabelToCanonical(label)) add(canon);
  }

  // 3) Strict name/description inference — only adds a definitive single match.
  const inferred = inferIndustry(`${c.name || ''}  ${c.legal_name || ''}  ${c.description || extra.website_description || ''}`);
  if (inferred) add(inferred);

  return { primary: tags[0] || null, tags };
}
