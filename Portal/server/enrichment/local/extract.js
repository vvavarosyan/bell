// Extraction library for the Website Harvester (Stage 7).
// ----------------------------------------------------------------------------
// Pure functions: given page text / html, pull out structured signals.
//   • findEmails / findPhones / findSocials  — ported from the proven Stage 6
//     Firecrawl extractor (battle-tested against Qatar sites).
//   • guessAddress   — best-effort postal address line (Qatar-aware).
//   • extractTeam    — candidate people (name + title) from team/about pages.
//   • extractPartners— candidate partner/client company names.
//   • pickLogo       — choose the best logo URL from meta tags.
//
// Everything here is conservative: it would rather miss a noisy signal than
// poison the database with junk. People/partners are returned as *candidates*;
// the harvester decides how to persist them.

import {
  normalizePhone, cleanCompanySocials, rankCompanyEmails,
  looksLikeName as dqLooksLikeName, isHeadingTitle,
  isTemplatePersonTitle, isPlaceholderName,
} from '../../lib/dataquality.js';

// ===========================================================================
// Emails
// ===========================================================================

const EMAIL_RX = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,24}/gi;

export function findEmails(text) {
  if (!text) return [];
  const seen = new Set();
  const out = [];
  for (const m of text.match(EMAIL_RX) || []) {
    const v = m.toLowerCase();
    if (seen.has(v)) continue;
    if (/\.(png|jpe?g|gif|svg|webp|ico|pdf|css|js)$/i.test(v)) continue;  // asset filenames
    if (/^[0-9]+@[0-9]+/.test(v)) continue;                               // pure-numeric junk
    if (/sentry\.io$|wixpress\.com$|example\.|placeholder|@sentry|\.png@/i.test(v)) continue;
    if (/@(\d+\.){3}\d+$/.test(v)) continue;                              // ip-literal
    if (v.length > 80) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

// Free webmail providers. A company contact on one of these is legit (many
// Qatar SMEs use webmail), but an email on a DIFFERENT company's domain is
// almost always a footer credit ("site by webteck.com"), a client, or a
// partner — not the company's own address.
const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com',
  'live.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'icloud.com', 'me.com',
  'aol.com', 'protonmail.com', 'proton.me', 'mail.com', 'gmx.com', 'zoho.com',
]);

export function emailDomain(email) {
  const m = String(email || '').toLowerCase().match(/@([^@\s]+)$/);
  return m ? m[1] : '';
}

/**
 * Keep only emails that plausibly belong to THIS company: same registrable
 * domain as the site, or a free-webmail address. Drops emails on other company
 * domains (the classic "designed by webteck.com" / client-email pollution).
 * Own-domain first, then webmail, capped. If no site domain is known, returns
 * the deduped input (capped).
 */
export function preferOwnEmails(emails, siteDomain = '', cap = 12) {
  // Delegate to the shared ranker (server/lib/dataquality.js): keeps own-domain,
  // Qatar-ISP, and free-webmail addresses — own-domain first so the caller can
  // mark index 0 as primary — and drops emails on a DIFFERENT company's domain
  // (the classic "designed by webteck.com" / client-email pollution).
  return rankCompanyEmails(emails, siteDomain).slice(0, cap);
}

// ===========================================================================
// Phones
// ===========================================================================

const PHONE_RX = /(\+?\d[\d\s\-().]{5,18}\d)/g;
const PHONE_LABEL_RX = /(tel\.?|telephone|phone|mobile|cell|call|whatsapp|fax|hotline|contact|customer\s+(service|care)|reservations?|booking|sales|support|enquiries|inquiries|toll[-\s]?free|reach\s+us|هاتف|تليفون|اتصل|واتساب)\s*(?:[:#.\-]|number|no\.?|on)?\s*$/i;

function acceptPhone(rawMatch, fullText, matchIndex) {
  const trimmed = rawMatch.trim();
  const digits  = trimmed.replace(/[^\d]/g, '');
  if (digits.length < 8 || digits.length > 15) return false;
  if (/^(\d)\1+$/.test(digits))           return false;   // 1111111
  if (/^(19|20)\d{2}$/.test(digits))      return false;   // years
  if (/^(?:\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4}|\d{2}\/\d{2}\/\d{4})$/.test(trimmed.replace(/\s/g, ''))) return false;
  if (trimmed.startsWith('+')) return true;
  if (digits.startsWith('00') && digits.length >= 10) return true;
  const hasSeparator = /[\s\-().]/.test(trimmed);
  if (digits.length >= 9 && hasSeparator) return true;
  if (digits.length === 8) {
    const before = fullText.slice(Math.max(0, matchIndex - 40), matchIndex);
    if (PHONE_LABEL_RX.test(before)) return true;
  }
  return false;
}

export function findPhones(text, telLinks = []) {
  // Validate EVERY candidate through the shared phone validator
  // (server/lib/dataquality.js): a real Qatar number is +974 + 8 digits, and
  // well-formed international (+CC) numbers are kept. Bare 9/10-digit strings
  // like "320-2446-483" or "(40778730) 17" are rejected as scraping junk.
  // Dedup by the canonical E.164 form so one number in several formats = 1 row.
  const seen = new Set();
  const out = [];
  const push = (raw) => {
    const norm = normalizePhone(raw);
    if (!norm || seen.has(norm.e164)) return;
    seen.add(norm.e164);
    out.push({ display: norm.display, value: norm.e164 });
  };
  for (const t of telLinks || []) push(t);                 // tel: links
  if (text) for (const m of text.matchAll(PHONE_RX)) push(m[0]);
  return out;
}

// ===========================================================================
// Socials
// ===========================================================================

const SOCIAL_PATTERNS = [
  { name: 'linkedin',  rx: /https?:\/\/(?:[\w-]+\.)?linkedin\.com\/(?:in|company|school)\/[\w\-_.%]+/gi },
  { name: 'instagram', rx: /https?:\/\/(?:www\.)?instagram\.com\/[\w\-_.]+/gi },
  { name: 'facebook',  rx: /https?:\/\/(?:www\.)?facebook\.com\/[\w\-_.%]+/gi },
  { name: 'twitter',   rx: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[\w\-_.]+/gi },
  { name: 'youtube',   rx: /https?:\/\/(?:www\.)?youtube\.com\/(?:c\/|channel\/|user\/|@)[\w\-_.\/]+/gi },
  { name: 'tiktok',    rx: /https?:\/\/(?:www\.)?tiktok\.com\/@[\w\-_.]+/gi },
];

// Social handles that are platform chrome, not the company's own profile.
const SOCIAL_JUNK = /\/(sharer|share|intent|home|login|signup|hashtag|explore|policies|help|about|privacy)\b/i;

export function findSocials(text, links = [], opts = {}) {
  // Pull candidate URLs out of the page, then hand them to the shared cleaner
  // (server/lib/dataquality.js): it canonicalizes per platform, merges
  // twitter/x/tweeter, dedups numeric-vs-slug LinkedIn pages, drops personal
  // /in/ profiles + known third-party "designed by" handles (teepublic,
  // zozo-themes…), and caps per platform. Passing companyName/siteDomain lets
  // it recognise which handles actually belong to this company.
  const haystack = (text || '') + '\n' + (links || []).join('\n');
  const raw = [];
  for (const { rx } of SOCIAL_PATTERNS) {
    for (const m of haystack.match(rx) || []) raw.push(m);
  }
  const { kept } = cleanCompanySocials(raw, {
    companyName: opts.companyName || '',
    siteDomain: opts.siteDomain || '',
    strictAffinity: !!opts.strictAffinity,
  });
  return kept.map((k) => ({ network: k.network, url: k.url }));
}

// ===========================================================================
// Address (best-effort, Qatar-aware)
// ===========================================================================

const ADDR_HINT_RX = /\b(p\.?\s?o\.?\s?box|street|st\.|road|rd\.|tower|building|bldg|floor|fl\.|suite|office|zone|area|district|avenue|ave\.|boulevard|blvd|doha|qatar|west bay|al\s+\w+|industrial area|corniche)\b/i;

/** Return a single best address line, or null. Only used when DB address is empty. */
export function guessAddress(text) {
  if (!text) return null;
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  let best = null, bestScore = 0;
  for (const line of lines) {
    if (line.length < 12 || line.length > 160) continue;
    if (!/\d/.test(line)) continue;                 // addresses almost always have a number
    const hits = (line.match(ADDR_HINT_RX) ? 1 : 0)
               + (/qatar/i.test(line) ? 1 : 0)
               + (/doha/i.test(line) ? 1 : 0)
               + (/p\.?\s?o\.?\s?box/i.test(line) ? 1 : 0);
    if (hits >= 2 && hits > bestScore) { best = line; bestScore = hits; }
  }
  return best;
}

// ===========================================================================
// Team people (name + title) — conservative
// ===========================================================================

const ROLE_RX = /\b(c[efo]o|cto|cmo|coo|chief|founder|co-?founder|owner|president|vice president|vp|director|managing director|general manager|head of|partner|principal|manager|lead|chairman|chairwoman|board member|ceo|cfo)\b/i;
const NAME_TOKEN = /^[A-Z][a-zA-Z'’.-]+$/;
const NAME_JUNK = /\b(home|about|contact|services|products|news|blog|careers?|team|menu|copyright|all rights|privacy|terms|cookie|subscribe|newsletter|read more|learn more|view|click|email|phone)\b/i;

// Delegate to the shared, hardened name check (server/lib/dataquality.js):
// rejects section headings like "Our Company" / "Our History" / "Meet The Team"
// that the old two-capitalised-words rule let through, while still allowing
// middle initials ("Clifford W Lasrado") and Arabic-style particles.
function looksLikeName(s) {
  return dqLooksLikeName(s);
}

function cleanTitle(s) {
  return s.replace(/\s+/g, ' ').replace(/[|•·–—-]\s*$/, '').trim().slice(0, 120);
}

/**
 * Scan team/about page text for "Name" followed (same or next line) by a role
 * title. Returns [{ name, title }]. Capped + de-duped. Heuristic — only emits a
 * person when BOTH a plausible human name AND a role keyword are present.
 */
export function extractTeam(text, cap = 40) {
  if (!text) return [];
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const out = [];
  const seen = new Set();

  const tryAdd = (name, title) => {
    if (isHeadingTitle(title)) return;                 // "Chairman's Message" is a section, not a person
    if (isTemplatePersonTitle(title)) return;          // "CEO at Google" — website-template placeholder
    if (isPlaceholderName(name)) return;               // "John Doe" / "Team Member"
    const key = name.toLowerCase().replace(/[^a-z]/g, '');
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push({ name: name.replace(/\s+/g, ' ').trim(), title: cleanTitle(title) });
  };

  for (let i = 0; i < lines.length && out.length < cap; i++) {
    const line = lines[i];

    // Pattern A: "Name — Title" / "Name, Title" / "Name | Title" on one line.
    const inline = line.match(/^(.{3,40}?)\s*[|,–—-]\s*(.{2,80})$/);
    if (inline && looksLikeName(inline[1]) && ROLE_RX.test(inline[2])) {
      tryAdd(inline[1], inline[2]);
      continue;
    }

    // Pattern B: name on this line, title on the next.
    if (looksLikeName(line) && i + 1 < lines.length) {
      const next = lines[i + 1];
      if (next.length <= 90 && ROLE_RX.test(next) && !looksLikeName(next)) {
        tryAdd(line, next);
        i++;
        continue;
      }
    }

    // Pattern C: title on this line, name on the next.
    if (ROLE_RX.test(line) && line.length <= 90 && !looksLikeName(line) && i + 1 < lines.length) {
      const next = lines[i + 1];
      if (looksLikeName(next)) { tryAdd(next, line); i++; }
    }
  }
  return out;
}

// ===========================================================================
// Partner / client company names
// ===========================================================================

const PARTNER_ALT_JUNK = /\b(logo|icon|image|photo|banner|placeholder|avatar|facebook|instagram|twitter|linkedin|youtube|whatsapp|menu|arrow|close|search)\b/i;

/**
 * From a partners/clients page, pull candidate company names out of <img alt>
 * attributes (logo walls) and prominent link text. Returns string[] (names).
 * Conservative — stored for review, never auto-merged.
 */
export function extractPartners(html, cap = 60, { sectionOnly = false } = {}) {
  if (!html) return [];
  const seen = new Set();
  const out = [];
  const pull = (region) => {
    for (const m of region.matchAll(/<img\b[^>]*\balt\s*=\s*["']([^"']+)["']/gi)) {
      let alt = m[1].replace(/\s+/g, ' ').trim();
      alt = alt.replace(/\s*(logo|icon|image)\s*$/i, '').trim();
      if (alt.length < 2 || alt.length > 60) continue;
      if (PARTNER_ALT_JUNK.test(alt)) continue;
      if (!/[A-Za-z؀-ۿ]/.test(alt)) continue;
      const key = alt.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(alt);
      if (out.length >= cap) return;
    }
  };
  if (sectionOnly) {
    // For a general page (homepage/about), only pull logos that sit within a
    // "partners / clients / trusted by / sponsors / brands" section — avoids
    // grabbing hero/banner images as fake partners.
    const rx = /\b(our\s+partners?|our\s+clients?|our\s+customers?|valued\s+clients?|trusted\s+by|partners?|clients?|sponsors?|brands?\s+we\s+work\s+with|we\s+work\s+with)\b/gi;
    let m;
    while ((m = rx.exec(html)) && out.length < cap) {
      pull(html.slice(m.index, m.index + 6000));
    }
  } else {
    // Dedicated partners page — the whole page is the logo wall.
    pull(html);
  }
  return out;
}

// ===========================================================================
// Logo selection
// ===========================================================================

/** Pick the best logo URL from a page's meta tags. og:image preferred, icon fallback. */
export function pickLogo(meta) {
  if (!meta) return null;
  const cand = meta.ogImage || meta.icon || null;
  if (!cand) return null;
  if (/\.(svg|png|jpe?g|webp|ico|gif)(\?|$)/i.test(cand) || /og:image|image|logo|icon/i.test(cand)) return cand;
  return cand;  // accept anyway — better than nothing
}

// ===========================================================================
// Industry / founded year / description  (richer company profile)
// ===========================================================================

// DEFINITIVE industry markers — phrases that, on their own, unambiguously
// indicate a single industry. Deliberately CONSERVATIVE: ambiguous words like
// "trading", "investment", "holding", "industries", "services", "technologies"
// are intentionally excluded because they appear across many industries and
// caused wrong guesses. Better to leave a company blank than mislabel it.
const INDUSTRY_KEYWORDS = {
  'Oil & Gas': ['oil and gas', 'oil & gas', 'petroleum', 'petrochemical', 'oilfield', ' lng ', 'natural gas'],
  'Engineering': ['engineering consultancy', 'consulting engineers', 'mechanical engineering', 'electrical engineering', 'electromechanical'],
  'Construction & Contracting': ['contracting', 'general contracting', 'construction company', 'building contracting', 'civil construction'],
  'Information Technology': ['software development', 'software solutions', 'information technology', 'it solutions', 'web development', 'cyber security', 'cybersecurity'],
  'Telecommunications': ['telecommunication', 'telecommunications'],
  'Pharmaceuticals': ['pharmaceutical'],
  'Healthcare': ['medical center', 'medical centre', 'polyclinic', 'hospital', 'dental clinic', 'medical clinic', 'health center', 'health centre', 'pharmacy', 'medical supplies', 'diagnostic center'],
  'Banking & Finance': [' bank ', 'banking', 'islamic bank', 'investment bank'],
  'Insurance': ['insurance', 'takaful', 'reinsurance'],
  'Real Estate': ['real estate', 'real-estate', 'property management', 'property developer'],
  'Logistics & Transport': ['logistics', 'freight forwarding', 'cargo services', 'shipping and clearing', 'customs clearance'],
  'Trading & Distribution': ['general trading', 'trading and distribution', 'trading & distribution', 'import and export', 'import & export'],
  'Retail': ['supermarket', 'hypermarket', 'department store', 'shopping mall'],
  'Chemicals & Plastics': ['paints and coatings', 'plastic manufacturing', 'chemical industries'],
  'Manufacturing': ['manufacturing', 'fabrication factory', 'production facility'],
  'Automotive': ['automotive', 'car rental', 'rent a car', 'auto spare parts', 'car showroom'],
  'Marketing & Advertising': ['advertising', 'marketing agency', 'branding agency', 'signage and printing'],
  'Media & Entertainment': ['film production', 'television production', 'broadcasting', 'production house'],
  'Hospitality & F&B': ['restaurant', 'catering services', 'catering company', 'hotel and resort', 'coffee shop'],
  'Travel & Tourism': ['travel agency', 'tours and travel', 'travel and tours', 'travel & tours', 'tourism company'],
  'Legal Services': ['law firm', 'legal consultancy', 'law office', 'advocates and legal'],
  'Security Services': ['security services', 'security solutions', 'manpower security'],
  'Facilities & Cleaning': ['facilities management', 'cleaning services', 'pest control'],
  'Education & Training': ['training center', 'training centre', 'training institute'],
  'Energy & Utilities': ['power generation', 'water treatment', 'solar energy', 'renewable energy', 'district cooling', 'desalination'],
  'Agriculture & Fisheries': ['agriculture', 'poultry farm', 'fisheries'],
  'Aviation & Aerospace': ['aviation', 'aircraft maintenance', 'ground handling'],
  'Furniture & Interior': ['interior design', 'interior decoration', 'furniture manufacturing', 'furniture trading'],
  'Textiles & Garments': ['tailoring', 'readymade garments', 'garments manufacturing'],
  'Beauty & Wellness': ['beauty salon', 'beauty saloon', 'spa and wellness', 'ladies salon', 'gents salon'],
  'Jewellery & Gold': ['jewellery', 'jewelry'],
};

/**
 * CONSERVATIVE industry classifier. Returns an industry ONLY when the text
 * contains a definitive marker for EXACTLY ONE industry — otherwise null, so we
 * leave the company blank rather than guess (Val: only the ones we're 100% sure
 * of). An authoritative industry from an upload / LinkedIn is set by the caller
 * and overwrites; this only ever proposes a value for an otherwise-blank row.
 */
export function inferIndustry(blob) {
  const hay = ' ' + String(blob || '').toLowerCase().replace(/\s+/g, ' ') + ' ';
  if (hay.length < 6) return null;
  // "Trading & Contracting" is a Qatar catch-all spanning two industries — don't
  // force it into one.
  if (/\btrading\b/.test(hay) && /\bcontracting\b/.test(hay)) return null;
  const matched = new Set();
  for (const [industry, phrases] of Object.entries(INDUSTRY_KEYWORDS)) {
    for (const p of phrases) { if (hay.includes(p)) { matched.add(industry); break; } }
  }
  return matched.size === 1 ? [...matched][0] : null;
}

/** First credible "founded/established YYYY" year on the page (1900..now), or null. */
export function extractFoundedYear(text) {
  if (!text) return null;
  const now = new Date().getFullYear();
  const rx = /\b(?:established|founded|incorporated|operating since|in business since|since|est\.?)\s*(?:in)?\s*[:\-]?\s*((?:19|20)\d{2})\b/gi;
  let m;
  while ((m = rx.exec(text))) {
    const y = Number(m[1]);
    if (y >= 1900 && y <= now) return y;
  }
  return null;
}

/**
 * Best one-line company description: the meta/og description if present, else
 * the first substantial, sentence-like line from the page text (80–400 chars).
 */
export function bestDescription(meta, text) {
  const md = (meta && meta.description ? String(meta.description) : '').trim();
  if (md.length >= 40) return md.slice(0, 500);
  for (const lineRaw of String(text || '').split(/\n+/)) {
    const line = lineRaw.trim();
    if (line.length < 80 || line.length > 400) continue;
    if (!/[a-z]/i.test(line)) continue;
    if (!/\b(we|our|is a|provides?|offers?|specialis|specializ|leading|established|company|services|solutions)\b/i.test(line)) continue;
    return line.slice(0, 500);
  }
  return md || null;
}
