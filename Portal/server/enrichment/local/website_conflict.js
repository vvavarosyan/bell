// Detect a company whose WEBSITE domain provably belongs to a DIFFERENT company
// (the "Integrated Technical Services → arabian-mep.com" class of bug). Pure +
// deterministic — no network. Used by the flag-conflicts cleanup and testable in
// isolation.
//
// Signal: the website's registrable domain equals another Bell company's NAME
// slug, that other company shares NO distinctive token with this one, and the two
// names aren't near-duplicates (spelling variants / parent-subsidiary). Only then
// is it a true cross-company mismatch. Everything else (a company on its own
// domain, initials domains, brand domains nobody in Bell owns) is left alone.

import { significantTokens, nameSlugs, GENERIC_WORDS } from './finder.js';

// Site builders where the company identity is the SUBDOMAIN, not the base domain
// (myfairsweets.square.site is MY FAIR SWEETS' own site — not "Square"'s).
const SITE_BUILDERS = new Set([
  'business.site', 'square.site', 'wixsite.com', 'weebly.com', 'blogspot.com', 'godaddysites.com',
  'wordpress.com', 'webflow.io', 'myshopify.com', 'shopify.com', 'wixstudio.com', 'square.online',
]);

// Registrable main label: buildings.honeywell.com → "honeywell";
// www.arabian-mep.com → "arabianmep"; x.finemattress.com.qa → "finemattress".
export function hostSlug(url) {
  try {
    const labels = new URL(url).host.replace(/^www\./i, '').toLowerCase().split('.').filter(Boolean);
    if (labels.length < 2) return '';
    if (SITE_BUILDERS.has(labels.slice(-2).join('.')) && labels.length >= 3) return labels[0].replace(/[^a-z0-9]/g, '');
    const two = labels.slice(-2).join('.');
    const ccSld = /^(com|net|org|gov|edu|mil)\.(qa|ae|sa|bh|om|kw)$/.test(two) || /\.(com|co|net|org|gov)\.[a-z]{2}$/.test(two);
    const main = ccSld ? labels[labels.length - 3] : labels[labels.length - 2];
    return (main || '').replace(/[^a-z0-9]/g, '');
  } catch { return ''; }
}

export const distinctiveTokens = (name) => new Set(significantTokens(name).filter((t) => t.length >= 4 && !GENERIC_WORDS.has(t)));
export function shareDistinctive(a, b) { const A = distinctiveTokens(a); for (const t of distinctiveTokens(b)) if (A.has(t)) return true; return false; }

// Dice bigram similarity on the alnum-normalised names — catches spelling variants
// ("Al Hareb Model Techno" ~ "Al Harib Modern Technology") so we don't flag them.
export function diceSim(a, b) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const bg = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) { const g = s.slice(i, i + 2); m.set(g, (m.get(g) || 0) + 1); } return m; };
  const x = norm(a), y = norm(b);
  if (x.length < 2 || y.length < 2) return x === y ? 1 : 0;
  const A = bg(x), B = bg(y); let inter = 0, aN = 0, bN = 0;
  for (const v of A.values()) aN += v; for (const v of B.values()) bN += v;
  for (const [g, c] of A) if (B.has(g)) inter += Math.min(c, B.get(g));
  return (2 * inter) / (aN + bN);
}

// Slugs (≥6 chars) that identify a company by NAME — used to index who "owns" a domain.
export const ownSlugs = (name) => [...new Set(nameSlugs(name).filter((s) => s.length >= 6))];
export function ownsDomain(ownSlugList, d) {
  return ownSlugList.some((s) => s === d || (d.length >= 7 && s.length >= 7 && (s.includes(d) || d.includes(s))));
}

// companies: [{ id, name, website }]. Returns the cross-company conflicts.
export function findWebsiteConflicts(companies) {
  const index = new Map();     // name-slug → Set(id)
  const slugCache = new Map();
  const nameById = new Map();
  for (const c of companies) {
    const sl = ownSlugs(c.name); slugCache.set(c.id, sl); nameById.set(c.id, c.name);
    for (const s of sl) { if (!index.has(s)) index.set(s, new Set()); index.get(s).add(c.id); }
  }
  const out = [];
  for (const c of companies) {
    if (!c.website || !/^https?:/i.test(c.website)) continue;
    const d = hostSlug(c.website);
    if (!d || d.length < 5) continue;
    if (ownsDomain(slugCache.get(c.id) || [], d)) continue;      // company on its own domain → fine
    const owners = index.get(d);
    if (!owners) continue;                                       // nobody's name is this domain → can't tell
    const otherId = [...owners].find((id) => id !== c.id
      && !shareDistinctive(c.name, nameById.get(id))             // not a name variant / same-root
      && diceSim(c.name, nameById.get(id)) < 0.5);               // not a near-duplicate spelling
    if (otherId == null) continue;
    out.push({ id: c.id, name: c.name, website: c.website, domain: d, belongs_to_id: otherId, belongs_to: nameById.get(otherId) });
  }
  return out;
}
