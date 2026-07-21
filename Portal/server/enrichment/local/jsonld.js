// schema.org (JSON-LD) reader.
//
// Sites publish their real postal address, phone and branches in a machine-readable
// <script type="application/ld+json"> block — the format Google reads to build a
// business card. Bell read NONE of it (a repo-wide grep for "ld+json" returned zero
// hits), so a stated, structured, unambiguous address was being ignored on ~4,048
// company sites. DOC Medical Center publishes its Lusail address exactly this way.
//
// Rule 2.1 throughout:
//   • malformed JSON → skip the block (fail closed), never regex-scrape values out
//   • only PLACE-ish @types may contribute an address — a Person or Article node
//     carrying an address must not become a company location
//   • addresses are assembled VERBATIM from the parts the site states; a missing
//     part is left missing, never inferred

const LD_RX = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

const asArray = (v) => (Array.isArray(v) ? v : (v == null ? [] : [v]));
const typesOf = (n) => asArray(n && n['@type']).map((t) => String(t || ''));

/** Flatten arrays and @graph containers into a flat list of nodes. */
function flatten(node, out = [], depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return out;
  if (Array.isArray(node)) { for (const n of node) flatten(n, out, depth + 1); return out; }
  out.push(node);
  for (const n of asArray(node['@graph'])) flatten(n, out, depth + 1);
  return out;
}

/** Every JSON-LD node on the page. Blocks that don't parse are skipped. */
export function extractJsonLd(html) {
  const out = [];
  for (const m of String(html || '').matchAll(LD_RX)) {
    const raw = String(m[1] || '').trim();
    if (!raw) continue;
    let data;
    try { data = JSON.parse(raw); } catch { continue; }   // fail closed
    flatten(data, out);
  }
  return out;
}

// Only these may contribute a company location.
const PLACE_TYPE_RX = /^(Organization|Corporation|LocalBusiness|Place|Store|Restaurant|Hotel|Hospital|Clinic|Dentist|Pharmacy|MedicalBusiness|MedicalClinic|MedicalOrganization|Physician|EducationalOrganization|GovernmentOrganization|FinancialService|AutomotiveBusiness|HomeAndConstructionBusiness|ProfessionalService|HealthAndBeautyBusiness|FoodEstablishment|Cafe|CafeOrCoffeeShop|BarOrPub|Bakery|EntertainmentBusiness|SportsActivityLocation|TravelAgency|RealEstateAgent|InsuranceAgency|LegalService|\w*Shop|\w*Business|\w*Store)$/i;
// Where a schema.org node hangs its branches.
const BRANCH_KEYS = ['branch', 'branchOf', 'subOrganization', 'department', 'location', 'hasPOS', 'containsPlace'];

/** Compose an address string VERBATIM from a PostalAddress node. */
function addressOf(pa) {
  if (!pa || typeof pa !== 'object') return null;
  if (pa['@type'] && !/PostalAddress/i.test(String(pa['@type']))) return null;
  const parts = [pa.streetAddress, pa.addressLocality, pa.addressRegion, pa.postalCode]
    .map((s) => (typeof s === 'string' ? s.trim() : ''))
    .filter(Boolean);
  if (!parts.length) return null;
  const joined = parts.join(', ').replace(/\s+/g, ' ').trim();
  return joined.length >= 6 ? joined.slice(0, 300) : null;
}

const nameOf = (n) => {
  const v = n && (n.name || n.legalName || n.alternateName);
  return typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null;
};
const phoneOf = (n) => {
  const v = n && n.telephone;
  return typeof v === 'string' && /\d/.test(v) ? v.trim().slice(0, 60) : null;
};

/**
 * Locations stated in a page's JSON-LD.
 * Returns [{ label, address, phone, lat, lng }] — deduped by address.
 * Coordinates are taken ONLY from an explicit GeoCoordinates node.
 */
export function jsonLdLocations(nodes) {
  const out = [];
  const seen = new Set();

  const push = (node, addrNode, labelHint) => {
    const address = addressOf(addrNode);
    if (!address) return;
    const key = address.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    const geo = node && node.geo && typeof node.geo === 'object' ? node.geo : null;
    const lat = geo && Number(geo.latitude), lng = geo && Number(geo.longitude);
    out.push({
      label: labelHint || nameOf(node) || null,
      address,
      phone: phoneOf(node),
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
    });
  };

  for (const n of nodes || []) {
    if (!typesOf(n).some((t) => PLACE_TYPE_RX.test(t))) continue;
    push(n, n.address, nameOf(n));                     // the node's own address
    for (const key of BRANCH_KEYS) {                   // and any branch it declares
      for (const child of asArray(n[key])) {
        if (!child || typeof child !== 'object') continue;
        const childAddr = /PostalAddress/i.test(String(child['@type'] || '')) ? child : child.address;
        push(child, childAddr, nameOf(child));
      }
    }
  }
  return out;
}

/** Convenience: page HTML → stated locations. */
export function locationsFromHtml(html) {
  return jsonLdLocations(extractJsonLd(html));
}
