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
  const seen = new Set();
  const out = [];
  const push = (display, value) => {
    if (!value || seen.has(value)) return;
    seen.add(value);
    out.push({ display, value });
  };
  // tel: links are high-confidence — accept directly.
  for (const t of telLinks || []) {
    const digits = String(t).replace(/[^\d]/g, '');
    if (digits.length < 8 || digits.length > 15) continue;
    push(String(t).trim(), (String(t).trim().startsWith('+') ? '+' : '') + digits);
  }
  if (text) {
    for (const m of text.matchAll(PHONE_RX)) {
      const raw = m[0], idx = m.index ?? 0;
      if (!acceptPhone(raw, text, idx)) continue;
      const digits = raw.replace(/[^\d]/g, '');
      push(raw.trim(), (raw.trim().startsWith('+') ? '+' : '') + digits);
    }
  }
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

export function findSocials(text, links = []) {
  const out = [];
  const seen = new Set();
  const haystack = (text || '') + '\n' + (links || []).join('\n');
  for (const { name, rx } of SOCIAL_PATTERNS) {
    for (const raw of haystack.match(rx) || []) {
      let clean = raw.replace(/[)\].,'"]+$/, '');
      if (SOCIAL_JUNK.test(clean)) continue;
      try { const u = new URL(clean); u.search = ''; u.hash = ''; clean = u.toString().replace(/\/$/, '').toLowerCase(); }
      catch { clean = clean.toLowerCase(); }
      // Drop bare profile roots (e.g. instagram.com/ with no handle).
      if (/(facebook|instagram|twitter|x|tiktok|youtube|linkedin)\.com\/?$/i.test(clean)) continue;
      // Drop Facebook generic section roots with no specific handle after them.
      // (Real profiles are facebook.com/people/Name/12345 — those have a handle
      // and are kept; a bare .../people, .../pages, .../groups is navigation.)
      if (/facebook\.com\/(people|pages|pg|groups|watch|marketplace|events|profile\.php|sharer)\/?$/i.test(clean)) continue;
      if (seen.has(clean)) continue;
      seen.add(clean);
      out.push({ network: name, url: clean });
    }
  }
  return out;
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

function looksLikeName(s) {
  if (!s || NAME_JUNK.test(s)) return false;
  if (ROLE_RX.test(s)) return false;   // a job title (e.g. "Chief Executive Officer") is not a name
  const toks = s.trim().split(/\s+/);
  if (toks.length < 2 || toks.length > 4) return false;
  let nameTokens = 0;
  for (const t of toks) {
    if (NAME_TOKEN.test(t.replace(/[.,]$/, ''))) nameTokens++;
    else if (!/^(bin|al|el|de|van|von|della|abu|the|of)$/i.test(t)) return false;
  }
  return nameTokens >= 2;
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
export function extractPartners(html, cap = 60) {
  if (!html) return [];
  const seen = new Set();
  const out = [];
  for (const m of html.matchAll(/<img\b[^>]*\balt\s*=\s*["']([^"']+)["']/gi)) {
    let alt = m[1].replace(/\s+/g, ' ').trim();
    alt = alt.replace(/\s*(logo|icon|image)\s*$/i, '').trim();
    if (alt.length < 2 || alt.length > 60) continue;
    if (PARTNER_ALT_JUNK.test(alt)) continue;
    if (!/[A-Za-z؀-ۿ]/.test(alt)) continue;
    const key = alt.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(alt);
    if (out.length >= cap) break;
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
