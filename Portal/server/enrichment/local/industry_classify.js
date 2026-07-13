// Deterministic website → industry classifier (Val 2026-07-13: keyword rules,
// NO AI). Maps a company's OWN website text to Bell's industry taxonomy, and
// assigns an industry ONLY when one clearly wins — otherwise returns null (never
// guess; a missing value stays missing, Rule 2.1). Pure + unit-testable.
//
// Each industry has STRONG signals (weight 3 — distinctive to that industry) and
// WEAK signals (weight 1 — supporting). A match must clear an absolute score AND
// beat the runner-up by a clear margin, so ambiguous sites are left blank.

// [industry, strongKeywords[], weakKeywords[]]
const RULES = [
  ['Construction & Contracting', ['general contracting', 'civil works', 'building contractor', 'construction company', 'mep contracting', 'earthworks', 'scaffolding', 'fit out', 'fit-out', 'road construction', 'infrastructure projects'], ['construction', 'contracting', 'concrete', 'renovation', 'contractors', 'buildings']],
  ['Trading & Distribution', ['sole distributor', 'authorized distributor', 'import and export', 'wholesale supplier', 'distribution company', 'trading company', 'general trading'], ['trading', 'distributor', 'wholesale', 'suppliers', 'import', 'export']],
  ['Healthcare', ['medical center', 'medical centre', 'polyclinic', 'dental clinic', 'physiotherapy', 'diagnostic center', 'health care center', 'day surgery', 'medical services'], ['clinic', 'hospital', 'healthcare', 'dental', 'patients', 'medical']],
  ['Information Technology', ['software development', 'it solutions', 'web development', 'mobile app', 'systems integration', 'cyber security', 'cybersecurity', 'cloud solutions', 'erp', 'digital transformation', 'managed services', 'software company'], ['software', 'technology solutions', 'it services', 'developers', 'applications']],
  ['Hospitality & F&B', ['restaurant', 'catering services', 'food and beverage', 'fine dining', 'cloud kitchen', 'coffee shop', 'bakery', 'cuisine'], ['cafe', 'hotel', 'hospitality', 'menu', 'dining', 'catering']],
  ['Banking & Finance', ['investment bank', 'asset management', 'wealth management', 'financial services', 'brokerage', 'private equity', 'islamic banking'], ['bank', 'finance', 'investment', 'lending', 'financing']],
  ['Automotive', ['spare parts', 'auto service', 'car rental', 'vehicle showroom', 'automotive workshop', 'tyres', 'car dealership', 'used cars'], ['automotive', 'vehicles', 'garage', 'showroom', 'cars']],
  ['Telecommunications', ['telecommunications', 'network solutions', 'fiber optic', 'satellite communication', 'vsat', 'structured cabling'], ['telecom', 'connectivity', 'networking', 'communications']],
  ['Facilities & Cleaning', ['facility management', 'facilities management', 'cleaning services', 'janitorial', 'pest control', 'housekeeping services', 'integrated facilities'], ['cleaning', 'maintenance services', 'facilities']],
  ['Logistics & Transport', ['freight forwarding', 'supply chain', 'logistics services', 'cargo services', 'customs clearance', 'warehousing', 'shipping line'], ['logistics', 'freight', 'transport', 'cargo', 'shipping', 'warehouse']],
  ['Oil & Gas', ['oil and gas', 'oilfield services', 'drilling services', 'offshore', 'refinery', 'petroleum', 'upstream', 'downstream', 'wellhead'], ['oil', 'gas', 'energy sector', 'pipeline']],
  ['Textiles & Garments', ['garment', 'tailoring', 'uniforms', 'textile', 'fabrics', 'embroidery', 'apparel'], ['clothing', 'stitching', 'fashion']],
  ['Beauty & Wellness', ['beauty salon', 'spa and wellness', 'skincare', 'hair salon', 'cosmetics', 'nail', 'grooming'], ['salon', 'spa', 'beauty', 'wellness']],
  ['Marketing & Advertising', ['digital marketing', 'advertising agency', 'branding agency', 'creative agency', 'media buying', 'social media marketing', 'marketing agency'], ['marketing', 'advertising', 'branding', 'campaigns']],
  ['Manufacturing', ['manufacturing company', 'manufacturer of', 'production facility', 'factory', 'industrial manufacturing', 'assembly line'], ['manufacturing', 'production', 'industrial']],
  ['Consulting', ['management consulting', 'business consultancy', 'advisory services', 'consultancy services', 'strategy consulting'], ['consulting', 'consultancy', 'advisory', 'consultants']],
  ['Travel & Tourism', ['travel agency', 'tour operator', 'holiday packages', 'tourism company', 'ticketing', 'umrah', 'hajj packages'], ['travel', 'tourism', 'tours', 'holidays', 'visa']],
  ['Agriculture & Fisheries', ['agriculture', 'greenhouse', 'poultry farm', 'aquaculture', 'livestock', 'agro', 'fisheries', 'farming'], ['farm', 'crops', 'agricultural']],
  ['Education & Training', ['training center', 'training institute', 'international school', 'academy', 'e-learning', 'vocational training', 'tutoring', 'curriculum'], ['school', 'education', 'training', 'courses', 'students']],
  ['Real Estate', ['real estate', 'property management', 'property developer', 'realty', 'real estate brokerage', 'property leasing'], ['properties', 'leasing', 'developer']],
  ['Retail', ['retail store', 'online store', 'e-commerce', 'boutique', 'shopping'], ['retail', 'store', 'shop']],
  ['Jewellery & Gold', ['jewellery', 'jewelry', 'gold and diamond', 'diamond', 'luxury watches', 'gold jewellery'], ['gold', 'watches', 'ornaments']],
  ['Furniture & Interior', ['interior design', 'furniture manufacturer', 'joinery', 'interior fit out', 'home furniture', 'upholstery', 'interior decoration'], ['furniture', 'interiors', 'decor']],
  ['Engineering', ['engineering consultancy', 'engineering services', 'structural engineering', 'mechanical engineering', 'design and engineering'], ['engineering', 'engineers']],
  ['Security Services', ['security services', 'manned guarding', 'security solutions', 'cctv', 'surveillance systems', 'access control'], ['security', 'guarding', 'surveillance']],
  ['Manpower & Recruitment', ['recruitment agency', 'manpower supply', 'staffing solutions', 'talent acquisition', 'hr solutions', 'labour supply'], ['recruitment', 'manpower', 'staffing', 'hiring']],
  ['Pharmaceuticals', ['pharmaceutical', 'pharma company', 'medicines', 'drug manufacturer'], ['pharmaceuticals', 'pharma']],
  ['Media & Entertainment', ['production house', 'film production', 'broadcasting', 'event management', 'entertainment company'], ['media', 'entertainment', 'events', 'production']],
  ['Chemicals & Plastics', ['chemical company', 'plastics manufacturer', 'polymer', 'coatings', 'industrial chemicals', 'resin'], ['chemicals', 'plastics', 'coatings']],
  ['Insurance', ['insurance company', 'takaful', 'insurance broker', 'reinsurance', 'underwriting'], ['insurance', 'policies']],
  ['Energy & Utilities', ['renewable energy', 'solar energy', 'power generation', 'utilities', 'water treatment', 'energy solutions'], ['energy', 'solar', 'power', 'utilities']],
  ['Legal Services', ['law firm', 'legal consultancy', 'attorneys', 'advocates and legal', 'litigation', 'legal services'], ['legal', 'lawyers', 'law']],
  ['Marine Services', ['marine services', 'ship repair', 'dredging', 'offshore marine', 'vessel', 'port services', 'shipyard'], ['marine', 'maritime', 'vessels']],
  ['Aviation & Aerospace', ['aviation services', 'aircraft', 'aerospace', 'ground handling', 'airline'], ['aviation', 'aircraft', 'aerospace']],
];

// Distinctive words that, when they appear in a company's NAME, are authoritative
// about its business ("Elite Cleaning Services" IS cleaning). Only unambiguous
// words — nothing generic ("national", "star", "food", "gulf") that fits many.
const NAME_KEYWORDS = [
  ['Construction & Contracting', ['contracting', 'construction', 'contractors', 'scaffolding', 'formwork']],
  ['Trading & Distribution', ['trading', 'distribution', 'wholesale']],
  ['Healthcare', ['clinic', 'medical', 'dental', 'polyclinic', 'physiotherapy', 'healthcare', 'dermatology', 'orthopedic']],
  ['Information Technology', ['software', 'technologies', 'infotech', 'it solutions', 'cyber', 'digital solutions', 'systems']],
  ['Hospitality & F&B', ['restaurant', 'cafe', 'cafeteria', 'catering', 'bakery', 'kitchen', 'coffee', 'sweets', 'confectionery', 'grill', 'shawarma']],
  ['Banking & Finance', ['finance', 'financial', 'investment', 'capital', 'exchange']],
  ['Automotive', ['automotive', 'automobiles', 'motors', 'auto spare', 'car rental', 'tyres', 'garage', 'car wash']],
  ['Telecommunications', ['telecom', 'telecommunications']],
  ['Facilities & Cleaning', ['cleaning', 'facility management', 'facilities management', 'pest control', 'laundry', 'janitorial', 'housekeeping']],
  ['Logistics & Transport', ['logistics', 'freight', 'cargo', 'forwarding', 'transport', 'shipping', 'clearance']],
  ['Oil & Gas', ['oilfield', 'petroleum', 'oil and gas', 'oil field']],
  ['Textiles & Garments', ['tailoring', 'tailors', 'garments', 'textiles', 'uniforms', 'embroidery', 'fashion']],
  ['Beauty & Wellness', ['salon', 'spa', 'beauty', 'barber', 'ladies salon', 'gents salon']],
  ['Marketing & Advertising', ['advertising', 'marketing', 'branding']],
  ['Manufacturing', ['manufacturing', 'factory', 'industries', 'manufacturers']],
  ['Consulting', ['consultancy', 'consulting', 'consultants']],
  ['Travel & Tourism', ['travel', 'tourism', 'tours']],
  ['Agriculture & Fisheries', ['agriculture', 'agro', 'poultry', 'fisheries', 'nursery', 'greenhouse', 'landscaping', 'florist', 'flowers']],
  ['Education & Training', ['school', 'academy', 'institute', 'training', 'kindergarten', 'nursery school', 'education']],
  ['Real Estate', ['real estate', 'properties', 'realty', 'property']],
  ['Jewellery & Gold', ['jewellery', 'jewelry', 'jewellers', 'gold', 'diamonds']],
  ['Furniture & Interior', ['furniture', 'interior', 'decor', 'joinery', 'carpentry', 'upholstery', 'flooring', 'curtains', 'aluminium']],
  ['Engineering', ['engineering', 'engineers']],
  ['Security Services', ['security services', 'security systems', 'guarding']],
  ['Manpower & Recruitment', ['manpower', 'recruitment', 'staffing']],
  ['Pharmaceuticals', ['pharmaceutical', 'pharmacy', 'pharma']],
  ['Media & Entertainment', ['production house', 'events', 'entertainment', 'photography']],
  ['Chemicals & Plastics', ['chemicals', 'plastics', 'polymers', 'paints']],
  ['Insurance', ['insurance', 'takaful']],
  ['Legal Services', ['law firm', 'advocates', 'legal consultancy', 'attorneys']],
  ['Marine Services', ['marine', 'maritime', 'shipyard', 'diving']],
  ['Aviation & Aerospace', ['aviation', 'aerospace']],
];

/** Industries whose distinctive words appear in a company NAME. */
export function industriesFromName(name) {
  const blob = ' ' + String(name || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  const hits = [];
  for (const [industry, words] of NAME_KEYWORDS) {
    const kw = words.find((w) => blob.includes(' ' + w + ' ') || blob.includes(' ' + w));
    if (kw) hits.push({ industry, keyword: kw });
  }
  return hits;
}

// Best guess from a company's NAME + any stored description text. Name is
// authoritative when it points at exactly one industry; otherwise the description
// keyword classifier decides. Returns { industry, source, keywords } or null.
export function classifyCompany({ name = '', description = '' } = {}) {
  const nameHits = industriesFromName(name);
  const body = classifyIndustry(`${description} ${name}`);
  // Name points at exactly one industry → authoritative (a company naming itself
  // "X Cleaning" IS cleaning), UNLESS the description clearly says a different one.
  if (nameHits.length === 1) {
    if (body && body.industry !== nameHits[0].industry && body.score >= 6) return { industry: body.industry, source: 'website', keywords: body.keywords };
    return { industry: nameHits[0].industry, source: 'name', keywords: [nameHits[0].keyword] };
  }
  // Name ambiguous/none → use description if it produced a confident winner, and
  // only if the name doesn't contradict it.
  if (body && (!nameHits.length || nameHits.some((h) => h.industry === body.industry))) {
    return { industry: body.industry, source: nameHits.length ? 'name+website' : 'website', keywords: body.keywords };
  }
  return null;
}

const STOP_BLANK = /^\s*$/;

// Return { industry, score, runnerUp, keywords[] } or null (no confident winner).
export function classifyIndustry(text) {
  const blob = ' ' + String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ') + ' ';
  if (STOP_BLANK.test(blob) || blob.length < 60) return null;
  const scored = [];
  for (const [industry, strong, weak] of RULES) {
    let score = 0; const hits = [];
    for (const k of strong) if (blob.includes(' ' + k + ' ') || blob.includes(' ' + k)) { score += 3; hits.push(k); }
    for (const k of weak) if (blob.includes(' ' + k + ' ') || blob.includes(' ' + k)) { score += 1; hits.push(k); }
    if (score > 0) scored.push({ industry, score, keywords: hits });
  }
  if (!scored.length) return null;
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0], second = scored[1];
  // Confidence gate: a clear, distinctive winner. Needs an absolute floor AND a
  // margin over the runner-up, and at least one STRONG (distinctive) hit.
  const hasStrong = top.keywords.some((k) => RULES.find((r) => r[0] === top.industry)[1].includes(k));
  if (top.score < 4 || !hasStrong) return null;
  if (second && top.score < second.score * 1.7) return null;   // too close to call → leave blank
  return { industry: top.industry, score: top.score, runnerUp: second ? { industry: second.industry, score: second.score } : null, keywords: top.keywords.slice(0, 6) };
}
