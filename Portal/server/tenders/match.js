// =============================================================================
// #72 — Tender → industry matching (PURE module: no imports, no DB).
// -----------------------------------------------------------------------------
// Maps a tender's ACTIVITY CODES (Monaqasat detail pages carry Qatar's national
// activity classification, an ISIC Rev.4-based scheme: 6-digit codes whose first
// two digits are the ISIC DIVISION — verified live: 620900 "Other information
// technology…" = ISIC 6209, 016103 gardens/irrigation = 0161 crop support,
// 477290 retail pharma = 4772) and/or its CATEGORY text (Ashghal: ICT/Building/
// Roads/Drainage…, QatarEnergy: free text, Monaqasat card "sector") onto Bell's
// 35 CANONICAL industry tags (lib/industry.js) — the same tags companies carry
// in `industries` and tenants pick as ICP target_industries. That shared
// vocabulary is what makes an open tender matchable to "companies in that line
// of business" and scoreable against a tenant's ICP with ZERO fuzziness.
//
// Matching order per activity (most→least precise, never guesses):
//   1. CLASS_OVERRIDES — longest matching code prefix, for classes whose
//      division bucket would be wrong/too coarse (e.g. 3211 jewellery inside
//      "other manufacturing").
//   2. DIVISION_MAP — first two digits of the code. Applies to BOTH 6-digit
//      AND 5-digit codes: the 2026-07-09 Preview run on the real corpus proved
//      Qatar prints 5-digit codes as true ISIC class+check (33140 "Electrical
//      equipment repair"=div 33, 61900 "Other communications"=61, 52101
//      "Storage"=52, 36000 "Water collection…"=36, 41002 "Construction of
//      non-residential buildings"=41 — every sample consistent), while low
//      divisions arrive zero-PADDED as 6 digits ("016103"), so a leading-zero
//      code can never masquerade as a 5-digit one.
//   3. NAME_KEYWORDS — curated keyword → tag table over the activity's ENGLISH
//      name (also used for category/sector strings).
// No match → no tags → NO signal (we never invent relevance — 100% bar).
//
// The SQL constants for the opportunity-signal generator live here too so the
// PGlite test can exercise the EXACT strings + the pure builder without
// importing db.js (which opens a pool on import). server/news/signals.js
// genTenderOpportunities() is a thin glue loop over these.
// =============================================================================

// ── Canonical tags (MUST match lib/industry.js CANONICAL_INDUSTRIES) ─────────
const T = {
  OIL: 'Oil & Gas', ENERGY: 'Energy & Utilities', TELECOM: 'Telecommunications',
  IT: 'Information Technology', FINANCE: 'Banking & Finance', INSURANCE: 'Insurance',
  REALESTATE: 'Real Estate', CONSTRUCTION: 'Construction & Contracting',
  ENGINEERING: 'Engineering', HEALTH: 'Healthcare', PHARMA: 'Pharmaceuticals',
  LOGISTICS: 'Logistics & Transport', TRADING: 'Trading & Distribution',
  RETAIL: 'Retail', MANUFACTURING: 'Manufacturing', CHEMICALS: 'Chemicals & Plastics',
  AUTOMOTIVE: 'Automotive', MARKETING: 'Marketing & Advertising',
  MEDIA: 'Media & Entertainment', HOSPITALITY: 'Hospitality & F&B',
  TRAVEL: 'Travel & Tourism', LEGAL: 'Legal Services', CONSULTING: 'Consulting',
  SECURITY: 'Security Services', FACILITIES: 'Facilities & Cleaning',
  EDUCATION: 'Education & Training', AGRI: 'Agriculture & Fisheries',
  AVIATION: 'Aviation & Aerospace', FURNITURE: 'Furniture & Interior',
  TEXTILES: 'Textiles & Garments', JEWELLERY: 'Jewellery & Gold',
  BEAUTY: 'Beauty & Wellness', MANPOWER: 'Manpower & Recruitment',
  SPORTS: 'Sports & Recreation', GOV: 'Government & Public Sector',
};

// ── ISIC Rev.4 division (first 2 digits of a 6-digit code) → tags ────────────
export const DIVISION_MAP = {
  '01': [T.AGRI], '02': [T.AGRI], '03': [T.AGRI],
  '05': [T.MANUFACTURING], '06': [T.OIL], '07': [T.MANUFACTURING], '08': [T.MANUFACTURING], '09': [T.OIL],
  '10': [T.MANUFACTURING], '11': [T.MANUFACTURING], '12': [T.MANUFACTURING],
  '13': [T.TEXTILES], '14': [T.TEXTILES], '15': [T.TEXTILES],
  '16': [T.MANUFACTURING], '17': [T.MANUFACTURING], '18': [T.MANUFACTURING],
  '19': [T.OIL], '20': [T.CHEMICALS], '21': [T.PHARMA], '22': [T.CHEMICALS],
  '23': [T.MANUFACTURING, T.CONSTRUCTION], '24': [T.MANUFACTURING], '25': [T.MANUFACTURING],
  '26': [T.MANUFACTURING], '27': [T.MANUFACTURING], '28': [T.MANUFACTURING],
  '29': [T.AUTOMOTIVE, T.MANUFACTURING], '30': [T.AUTOMOTIVE, T.MANUFACTURING],
  '31': [T.FURNITURE], '32': [T.MANUFACTURING], '33': [T.MANUFACTURING],
  '35': [T.ENERGY], '36': [T.ENERGY], '37': [T.ENERGY],
  '38': [T.ENERGY, T.FACILITIES], '39': [T.ENERGY],
  '41': [T.CONSTRUCTION], '42': [T.CONSTRUCTION], '43': [T.CONSTRUCTION],
  '45': [T.AUTOMOTIVE], '46': [T.TRADING], '47': [T.RETAIL],
  '49': [T.LOGISTICS], '50': [T.LOGISTICS], '51': [T.AVIATION, T.LOGISTICS],
  '52': [T.LOGISTICS], '53': [T.LOGISTICS],
  '55': [T.HOSPITALITY], '56': [T.HOSPITALITY],
  '58': [T.MEDIA], '59': [T.MEDIA], '60': [T.MEDIA],
  '61': [T.TELECOM], '62': [T.IT], '63': [T.IT],
  '64': [T.FINANCE], '65': [T.INSURANCE], '66': [T.FINANCE],
  '68': [T.REALESTATE], '69': [T.LEGAL, T.CONSULTING], '70': [T.CONSULTING],
  '71': [T.ENGINEERING], '72': [T.CONSULTING], '73': [T.MARKETING], '74': [T.CONSULTING],
  '75': [T.HEALTH], '77': [T.TRADING], '78': [T.MANPOWER], '79': [T.TRAVEL],
  '80': [T.SECURITY], '81': [T.FACILITIES], '82': [T.CONSULTING],
  '84': [T.GOV], '85': [T.EDUCATION],
  '86': [T.HEALTH], '87': [T.HEALTH], '88': [T.HEALTH],
  '90': [T.MEDIA], '91': [T.MEDIA], '92': [T.MEDIA], '93': [T.SPORTS],
  '94': [T.GOV], '95': [T.IT], '96': [T.BEAUTY], '99': [T.GOV],
};

// ── Class-level overrides (code PREFIX, longest wins; applied before division).
// Only where the division bucket is wrong or usefully sharpened — keep short,
// grow it from Preview-report evidence, never speculation. ─────────────────────
export const CLASS_OVERRIDES = [
  ['46495', [T.PHARMA, T.TRADING]],        // wholesale of medicines/medical supplies (tender 3499/2026 "Supply of Drugs": 464951/464959)
  ['3211',  [T.JEWELLERY]],                // jewellery mfg, else buried in "other manufacturing"
  ['4651',  [T.IT, T.TRADING]],            // wholesale of computers/software
  ['4652',  [T.TELECOM, T.IT, T.TRADING]], // wholesale of electronic & telecom equipment
  ['4661',  [T.OIL, T.TRADING]],           // wholesale of fuels
  ['4663',  [T.CONSTRUCTION, T.TRADING]],  // wholesale of construction materials
  ['4772',  [T.PHARMA, T.RETAIL]],         // retail pharma/medical (477290 observed live)
  ['5820',  [T.IT]],                       // software publishing (division 58 = media)
  ['8130',  [T.FACILITIES, T.AGRI]],       // landscape care — the gardens/irrigation tenders
  ['952',   [T.RETAIL]],                   // repair of personal/household goods (division 95 = IT for 951x)
  ['9601',  [T.FACILITIES]],               // laundry (division 96 = beauty/personal care)
  // ── added from the 2026-07-09 Preview run on the real corpus ──
  ['33202', [T.TELECOM, T.MANUFACTURING]], // installation of communications equipment (332021 on "Hosted IP-Telephony" — division 33 alone mis-led the primary to Manufacturing)
  ['8292',  [T.LOGISTICS]],                // packaging & packing services (division 82 = office support would be wrong)
  ['31000', [T.CONSULTING]],               // Qatar quirk: code 31000 carries "Risk Management and ISO" (ISO 31000), NOT furniture
];

// ── Name/category keyword fallback (lowercase substring → tags) ──────────────
// Used for: activity names whose code could not be mapped (5-digit / unknown
// division) and for category/sector strings (Ashghal, QatarEnergy, Monaqasat
// card sector). Order matters only for PRIMARY selection (first hit listed
// first); all hits are collected.
export const NAME_KEYWORDS = [
  ['information technology', [T.IT]], ['software', [T.IT]], ['computer', [T.IT]],
  ['cyber', [T.IT]], [' ict', [T.IT, T.TELECOM]], ['data cent', [T.IT]], ['digital', [T.IT]],
  ['telecom', [T.TELECOM]], ['fiber', [T.TELECOM]], ['fibre', [T.TELECOM]], ['communication', [T.TELECOM]],
  ['telephony', [T.TELECOM]], ['voip', [T.TELECOM]], ['pabx', [T.TELECOM]],   // real Monaqasat title: "Hosted IP-Telephony Services"
  ['construction', [T.CONSTRUCTION]], ['contracting', [T.CONSTRUCTION]],
  ['civil works', [T.CONSTRUCTION]], ['road', [T.CONSTRUCTION]], ['bridge', [T.CONSTRUCTION]],
  ['infrastructure', [T.CONSTRUCTION]], ['demolition', [T.CONSTRUCTION]], ['excavation', [T.CONSTRUCTION]],
  ['drainage', [T.CONSTRUCTION, T.ENERGY]], ['sewerage', [T.ENERGY]], ['sewage', [T.ENERGY]],
  ['water treatment', [T.ENERGY]], ['desalination', [T.ENERGY]], ['electricity', [T.ENERGY]],
  ['power', [T.ENERGY]], ['substation', [T.ENERGY]], ['solar', [T.ENERGY]], ['renewable', [T.ENERGY]],
  ['engineering', [T.ENGINEERING]], ['architect', [T.ENGINEERING]], ['surveying', [T.ENGINEERING]],
  ['consultanc', [T.CONSULTING]], ['consulting', [T.CONSULTING]], ['advisory', [T.CONSULTING]],
  ['risk management', [T.CONSULTING]], ['packaging', [T.LOGISTICS]],
  ['drilling', [T.OIL]], ['oilfield', [T.OIL]], ['petroleum', [T.OIL]], ['offshore', [T.OIL]],
  ['pipeline', [T.OIL]], ['refinery', [T.OIL]], ['lng', [T.OIL]], ['rig ', [T.OIL]],
  ['marine', [T.LOGISTICS]], ['vessel', [T.LOGISTICS]], ['shipping', [T.LOGISTICS]],
  ['freight', [T.LOGISTICS]], ['logistic', [T.LOGISTICS]], ['transport', [T.LOGISTICS]],
  ['warehous', [T.LOGISTICS]], ['courier', [T.LOGISTICS]],
  ['medical', [T.HEALTH]], ['hospital', [T.HEALTH]], ['clinic', [T.HEALTH]],
  ['health', [T.HEALTH]], ['dental', [T.HEALTH]],
  ['pharmaceutical', [T.PHARMA]], ['medicine', [T.PHARMA]], ['drug', [T.PHARMA]], ['vaccine', [T.PHARMA]],
  ['security', [T.SECURITY]], ['guard', [T.SECURITY]], ['cctv', [T.SECURITY]], ['surveillance', [T.SECURITY]],
  ['cleaning', [T.FACILITIES]], ['janitorial', [T.FACILITIES]], ['pest control', [T.FACILITIES]],
  ['facility management', [T.FACILITIES]], ['facilities management', [T.FACILITIES]],
  ['waste', [T.FACILITIES, T.ENERGY]],
  ['landscap', [T.FACILITIES, T.AGRI]], ['garden', [T.FACILITIES, T.AGRI]],
  ['irrigation', [T.AGRI, T.FACILITIES]], ['nurser', [T.AGRI]],
  ['agricultur', [T.AGRI]], ['farm', [T.AGRI]], ['livestock', [T.AGRI]], ['fisher', [T.AGRI]],
  ['catering', [T.HOSPITALITY]], ['restaurant', [T.HOSPITALITY]], ['hotel', [T.HOSPITALITY]],
  ['accommodation', [T.HOSPITALITY]], ['food service', [T.HOSPITALITY]], ['camp', [T.HOSPITALITY]],
  ['training', [T.EDUCATION]], ['education', [T.EDUCATION]], ['school', [T.EDUCATION]], ['bootcamp', [T.EDUCATION]],
  ['manpower', [T.MANPOWER]], ['recruitment', [T.MANPOWER]], ['staffing', [T.MANPOWER]], ['outsourc', [T.MANPOWER]],
  ['advertis', [T.MARKETING]], ['marketing', [T.MARKETING]], ['branding', [T.MARKETING]],
  ['event management', [T.MARKETING]], ['exhibition', [T.MARKETING]],
  ['media', [T.MEDIA]], ['broadcast', [T.MEDIA]], ['production', [T.MEDIA]],
  ['insurance', [T.INSURANCE]], ['bank', [T.FINANCE]], ['financial', [T.FINANCE]], ['audit', [T.FINANCE]],
  ['legal', [T.LEGAL]], ['law firm', [T.LEGAL]],
  ['real estate', [T.REALESTATE]], ['property management', [T.REALESTATE]],
  ['vehicle', [T.AUTOMOTIVE]], ['automotive', [T.AUTOMOTIVE]], ['fleet', [T.AUTOMOTIVE]],
  ['spare part', [T.AUTOMOTIVE, T.TRADING]],
  ['furniture', [T.FURNITURE]], ['interior', [T.FURNITURE]], ['fit-out', [T.FURNITURE]], ['fitout', [T.FURNITURE]],
  ['uniform', [T.TEXTILES]], ['garment', [T.TEXTILES]], ['textile', [T.TEXTILES]],
  ['aviation', [T.AVIATION]], ['aircraft', [T.AVIATION]], ['airport', [T.AVIATION]],
  ['manufactur', [T.MANUFACTURING]], ['fabrication', [T.MANUFACTURING]], ['steel', [T.MANUFACTURING]],
  ['aluminium', [T.MANUFACTURING]], ['cement', [T.MANUFACTURING, T.CONSTRUCTION]],
  ['concrete', [T.MANUFACTURING, T.CONSTRUCTION]],
  ['chemical', [T.CHEMICALS]], ['plastic', [T.CHEMICALS]], ['lubricant', [T.CHEMICALS]],
  ['sports', [T.SPORTS]], ['stadium', [T.SPORTS]], ['gym', [T.SPORTS]],
  ['travel', [T.TRAVEL]], ['tourism', [T.TRAVEL]], ['ticketing', [T.TRAVEL]],
  ['salon', [T.BEAUTY]], ['beauty', [T.BEAUTY]], ['barber', [T.BEAUTY]], ['spa ', [T.BEAUTY]],
  ['supply', [T.TRADING]], ['wholesale', [T.TRADING]], ['trading', [T.TRADING]],
  ['building', [T.CONSTRUCTION]],   // late: "building" appears inside many non-construction names too — let sharper keywords win primary first
];

// Exact category strings seen at the sources (checked before keywords).
export const CATEGORY_MAP = {
  ict: [T.IT, T.TELECOM],
  it: [T.IT],
  building: [T.CONSTRUCTION], buildings: [T.CONSTRUCTION],
  roads: [T.CONSTRUCTION], road: [T.CONSTRUCTION],
  drainage: [T.CONSTRUCTION, T.ENERGY],
  works: [T.CONSTRUCTION],
  services: [],            // too generic — no tags, keyword pass may still hit
  supply: [T.TRADING], supplies: [T.TRADING],
  consultancy: [T.CONSULTING],
};

const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

export function tagsForText(s) {
  const t = ' ' + norm(s) + ' ';
  if (t.trim().length < 3) return [];
  const out = [];
  for (const [kw, tags] of NAME_KEYWORDS) {
    if (t.includes(kw)) for (const tag of tags) if (!out.includes(tag)) out.push(tag);
  }
  return out;
}

// One activity {code, name} → { tags, via } (via: class | division | name | null).
export function tagsForActivity(a = {}) {
  const code = String(a.code || '').trim();
  const name = String(a.name || '');
  if (/^\d{5,6}$/.test(code)) {   // 5-digit = ISIC class+check, 6-digit = national code (see header — Preview-proven 2026-07-09)
    // longest-prefix class override first
    let best = null;
    for (const [prefix, tags] of CLASS_OVERRIDES) {
      if (code.startsWith(prefix) && (!best || prefix.length > best[0].length)) best = [prefix, tags];
    }
    if (best) return { tags: [...best[1]], via: 'class' };
    const div = DIVISION_MAP[code.slice(0, 2)];
    if (div) return { tags: [...div], via: 'division' };
  }
  // unknown/absent division: the name decides — never guess numerically.
  const byName = tagsForText(name);
  return { tags: byName, via: byName.length ? 'name' : null };
}

// Whole tender → { tags (≤4), primary, via:{class,division,name,category,title} }.
// Inputs: activities (raw.activities), category column, raw.sector (Monaqasat
// card), and — only as a LAST RESORT — the tender title.
//
// TITLE FALLBACK (Val 2026-07-09): most archived tenders carry no activity codes,
// and the "category"/"sector" strings at each source turn out to be bidder-TYPE
// labels ("Suppliers", "Contractors", "Service Providers") or tender-TYPE codes
// (GTC/STC/ITC/Limited) — never an industry, so they're correctly refused. That
// left ~24 of 176 OPEN tenders with no industry at all (incl. every QatarEnergy
// open, whose TENDER_CATEGORY is literally "-"). Their TITLES, though, are
// explicit ("LTA Drilling Services", "Hosted IP-Telephony"). So: if codes and
// category yield nothing, match the title through the same curated keyword table.
// It fires ONLY when nothing better exists, is recorded as via:'title' so the
// Preview report shows exactly how many signals rest on it, and still yields
// NOTHING when the title says nothing — we never guess.
export function tenderIndustries(t = {}) {
  const raw = t.raw || {};
  const acts = Array.isArray(raw.activities) ? raw.activities : [];
  const counts = new Map();   // tag → weight (activity hits count double vs category)
  const via = { class: 0, division: 0, name: 0, category: 0, title: 0 };
  const bump = (tag, w) => counts.set(tag, (counts.get(tag) || 0) + w);

  for (const a of acts) {
    const m = tagsForActivity(a);
    if (m.via) via[m.via]++;
    m.tags.forEach((tag, i) => bump(tag, i === 0 ? 2 : 1));   // first tag of an activity = its main meaning
  }
  for (const s of [t.category, raw.sector]) {
    const key = norm(s);
    if (!key) continue;
    const mapped = CATEGORY_MAP[key] ?? tagsForText(key);
    if (mapped.length) via.category++;
    mapped.forEach((tag, i) => bump(tag, i === 0 ? 1 : 0.5));
  }

  if (!counts.size && t.title) {              // last resort only
    const byTitle = tagsForText(t.title);
    if (byTitle.length) {
      via.title++;
      byTitle.forEach((tag, i) => bump(tag, i === 0 ? 1 : 0.5));
    }
  }

  const ranked = [...counts.entries()].sort((x, y) => y[1] - x[1]).map(([tag]) => tag);
  return { tags: ranked.slice(0, 4), primary: ranked[0] || null, via };
}

// ── Opportunity-signal building (pure) ───────────────────────────────────────
// Open tenders published (or first captured) in the last 21 days that map to at
// least one industry become kind='tender' / subkind='opportunity' signals with
// NO company (they are market-side demand, not a company event): the ICP scorer
// matches them to tenants via `industry`, and the in-market/company grouping
// naturally ignores NULL-company rows.
export const OPEN_TENDER_SELECT_SQL = `
  SELECT id, source, source_ref, title, buyer, category, status, value_amount, currency,
         published_at, deadline_at, created_at, raw
    FROM tenders
   WHERE status = 'open'
     AND (deadline_at IS NULL OR deadline_at > now())
     AND COALESCE(published_at, created_at) > now() - interval '21 days'
   ORDER BY COALESCE(published_at, created_at) DESC
   LIMIT 1500`;

// `industries` (migration 077) carries EVERY industry the tender fits, primary
// first, so a tenant whose ICP targets any of them matches — not just the primary.
export const OPPORTUNITY_INSERT_SQL = `
  INSERT INTO signals (kind, subkind, company_id, company_name, title, body, source_kind, ref_table, ref_id,
                       industry, industries, employee_count, importance, occurred_at, dedup_key)
  VALUES ('tender', 'opportunity', NULL, NULL, $1, $2, 'tenders', 'tenders', $3,
          $4, $5::text[], NULL, $6, $7, $8)
  ON CONFLICT (dedup_key) DO NOTHING`;

const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

export function buildTenderOpportunitySignals(rows = [], now = Date.now()) {
  const out = [];
  for (const t of rows) {
    const m = tenderIndustries(t);
    if (!m.primary) continue;                       // unmatched → no signal, never guess
    const value = Number(t.value_amount) || 0;
    const deadline = t.deadline_at ? new Date(t.deadline_at) : null;
    const closingSoon = deadline && (deadline.getTime() - now) < 7 * 86_400_000 && deadline.getTime() > now;
    // Monaqasat's value_amount is the TENDER BOND (true contract value isn't
    // published — see scrape_monaqasat.js) → label it honestly and scale its
    // importance bump to bond-sized numbers (500k bond = a big project);
    // other sources carry real values → 50M scale.
    const isBond = t.source === 'monaqasat';
    const valueScale = isBond ? 500_000 : 50_000_000;
    const importance = Math.min(0.78,
      0.55 + Math.min(value, valueScale) / valueScale * 0.15 + (closingSoon ? 0.05 : 0));
    const body = [
      t.buyer || null,
      deadline ? 'closes ' + deadline.toLocaleDateString('en-GB') : null,
      value ? (isBond ? 'bond ' : '') + Math.round(value).toLocaleString('en-US') + ' ' + (t.currency || 'QAR') : null,
      m.tags.length > 1 ? 'fits: ' + m.tags.join(', ') : null,
    ].filter(Boolean).join(' · ');
    out.push({
      title: 'Open tender — ' + m.primary + ': ' + clip(t.title, 120),
      body,
      ref_id: t.id,
      industry: m.primary,
      industries: m.tags,          // ALL fitting industries → multi-industry ICP match
      importance: Math.round(importance * 100) / 100,
      occurred_at: t.published_at || t.created_at,
      dedup_key: 'tenderopp:' + t.id,
    });
  }
  return out;
}
