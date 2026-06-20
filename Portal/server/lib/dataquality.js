// ============================================================================
// Data-quality engine — shared validators / normalizers
// ----------------------------------------------------------------------------
// One source of truth for "is this a real phone / social / person / email /
// website, and what is its clean canonical form". Used in TWO places:
//
//   1. Ingestion (server/enrichment/local/extract.js + harvester) so every
//      FUTURE harvest is clean at the source.
//   2. The cleanup pass (scripts/cleanup_data_quality.js) so EXISTING rows get
//      the same treatment.
//
// Design rules:
//   • Pure functions, no DB, no I/O — trivially testable.
//   • Conservative: drop only what is provably junk. For genuinely AMBIGUOUS
//     data (e.g. several valid emails) we KEEP everything and just pick a
//     primary — never silently lose a real signal.
//   • Qatar-first. The directory is Qatar businesses; an 8-digit local number
//     is assumed Qatari, and well-formed international (+CC) numbers are kept.
// ============================================================================

// ===========================================================================
// Phones — strict validation (replaces the old "9 digits + a dash = phone")
// ===========================================================================
//
// Qatar national numbers are exactly 8 digits, leading 3-9 (mobile 3/5/6/7,
// fixed 4, service 8/9). Country code +974. Anything that is neither a valid
// Qatar number nor a well-formed international (+CC, 8-15 digits) number is
// rejected — which is exactly what kills "320-2446-483", "(40778730) 17",
// "89-9150996", etc.

const QA_NSN = /^[3-9]\d{7}$/;            // 8-digit Qatar national number

function groupQatar(nsn) {
  return `+974 ${nsn.slice(0, 4)} ${nsn.slice(4)}`;
}

// Light international grouping for display (no per-country metadata): "+CC rest".
function groupIntl(digits) {
  // crude but readable: + then space-separated 3/3/rest
  if (digits.length <= 7) return '+' + digits;
  const head = digits.slice(0, digits.length - 7);
  const mid = digits.slice(digits.length - 7, digits.length - 4);
  const tail = digits.slice(digits.length - 4);
  return `+${head} ${mid} ${tail}`;
}

/**
 * Validate + normalize a phone string.
 * @param {string} raw        the candidate (any format)
 * @param {string} region     default region for bare numbers (only 'QA' is special-cased)
 * @returns {{e164:string, display:string, country:string|null}|null}
 */
export function normalizePhone(raw, region = 'QA') {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  const hadPlus = /^\s*\+/.test(s);
  let digits = s.replace(/[^\d]/g, '');
  if (!digits) return null;

  // 00 international prefix → treat like '+'
  let intl = hadPlus;
  if (digits.startsWith('00') && digits.length >= 10) { digits = digits.slice(2); intl = true; }

  if (/^(\d)\1+$/.test(digits)) return null;          // 1111111 etc
  if (digits.length < 8 || digits.length > 15) return null;

  // Explicit Qatar country code
  if (digits.startsWith('974')) {
    const nsn = digits.slice(3);
    if (QA_NSN.test(nsn)) return { e164: '+974' + nsn, display: groupQatar(nsn), country: 'QA' };
    return null;
  }

  // Explicit international (has + or 00), non-Qatar — keep if plausibly E.164.
  if (intl) {
    if (digits.length >= 8 && digits.length <= 15) {
      return { e164: '+' + digits, display: groupIntl(digits), country: null };
    }
    return null;
  }

  // No country code. In Qatar mode, the only trustworthy bare number is a valid
  // 8-digit Qatar NSN. A bare 9/10-digit string is almost always scraping junk.
  if (region === 'QA') {
    if (QA_NSN.test(digits)) return { e164: '+974' + digits, display: groupQatar(digits), country: 'QA' };
    return null;
  }

  // Other default region: accept any plausible 8-15 digit number as-is.
  return { e164: '+' + digits, display: groupIntl(digits), country: null };
}

/** Convenience boolean. */
export function isValidPhone(raw, region = 'QA') {
  return normalizePhone(raw, region) != null;
}

// ===========================================================================
// Socials — canonicalize, classify, dedup, drop third-party & personal
// ===========================================================================

// Website builders / theme authors / marketplaces whose handles leak into
// footers ("designed by …") and embedded widgets. Matched against the handle.
const THIRD_PARTY_SOCIAL = new Set([
  'teepublic', 'teepubliccom', 'zozothemes', 'zozothemesofficial', 'envato', 'envatomarket',
  'themeforest', 'codecanyon', 'wordpress', 'wordpressdotcom', 'wix', 'wixcom', 'wixsite',
  'shopify', 'squarespace', 'godaddy', 'weebly', 'webflow', 'elementor', 'woocommerce',
  'joomla', 'drupal', 'bootstrap', 'redbubble', 'society6', 'printful', 'spreadshirt',
  'fiverr', 'upwork', 'behance', 'dribbble', 'canva', 'mailchimp', 'hubspot',
]);

// Strong "this handle is a theme/template/web-agency credit" hint.
const THIRD_PARTY_HINT = /(themes?|templates?|webdesign|web-?solutions?|digitalagency)$/i;

// "site designed/developed/powered by" context that precedes a credit link.
const CREDIT_CONTEXT = /\b(designed|developed|powered|built|created|template|theme|crafted)\s+(by|with|using)\b/i;

function alnum(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
function isNumericHandle(h) { return /^\d+$/.test(String(h || '')); }

/**
 * Parse a social URL into { network, handle, kind, canonical } or null.
 * - twitter / x / tweeter all normalize to network 'twitter', canonical x.com.
 * - linkedin /in/ and /pub/ are kind 'personal'; /company/ /school/ are 'company'.
 */
export function parseSocialUrl(raw) {
  let s = String(raw || '').trim().replace(/[)\].,'"]+$/, '');
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  let u;
  try { u = new URL(s); } catch { return null; }

  const host = u.hostname.toLowerCase().replace(/^(www|m|mobile|[a-z]{2}-[a-z]{2})\./, '');
  const path = u.pathname.replace(/\/+$/, '');
  const seg = path.split('/').filter(Boolean);

  const firstReal = (i = 0) => (seg[i] || '').toLowerCase();
  let network = null, handle = null, kind = 'company';

  if (host === 'linkedin.com') {
    const m = path.match(/^\/(in|pub|company|school|showcase)\/([^/]+)/i);
    if (!m) return null;
    network = 'linkedin';
    kind = /^(in|pub)$/i.test(m[1]) ? 'personal' : 'company';
    handle = decodeURIComponent(m[2]).toLowerCase();
  } else if (host === 'instagram.com') {
    network = 'instagram'; handle = firstReal();
  } else if (host === 'facebook.com' || host === 'fb.com') {
    network = 'facebook';
    // profile.php?id=123 → use the numeric id; people/Name/123 → use id; else first seg
    if (firstReal() === 'profile.php') handle = (u.searchParams.get('id') || '').toLowerCase();
    else if (firstReal() === 'people' && seg[2]) handle = seg[2].toLowerCase();
    else handle = firstReal();
  } else if (host === 'twitter.com' || host === 'x.com' || host === 'tweeter.com') {
    network = 'twitter'; handle = firstReal().replace(/^@/, '');
  } else if (host === 'youtube.com' || host === 'youtu.be') {
    network = 'youtube';
    if (firstReal().startsWith('@')) handle = firstReal();
    else if (['c', 'channel', 'user'].includes(firstReal())) handle = (seg[1] || '').toLowerCase();
    else handle = firstReal();
  } else if (host === 'tiktok.com') {
    network = 'tiktok'; handle = firstReal().replace(/^@/, '');
  } else {
    return null;
  }

  if (!handle) return null;

  // Platform chrome / nav roots are not profiles.
  const JUNK = new Set([
    'sharer', 'share', 'intent', 'home', 'login', 'signup', 'hashtag', 'explore',
    'policies', 'help', 'about', 'privacy', 'terms', 'pages', 'groups', 'watch',
    'marketplace', 'events', 'pg', 'tr', 'reel', 'reels', 'p', 'post',
  ]);
  if (JUNK.has(handle)) return null;

  const canonical = canonicalSocialUrl(network, handle, kind);
  return { network, handle, kind, canonical };
}

function canonicalSocialUrl(network, handle, kind) {
  switch (network) {
    case 'linkedin': return `https://www.linkedin.com/${kind === 'personal' ? 'in' : 'company'}/${handle}`;
    case 'instagram': return `https://www.instagram.com/${handle}`;
    case 'facebook': return `https://www.facebook.com/${handle}`;
    case 'twitter': return `https://x.com/${handle}`;             // twitter+x+tweeter → x.com
    case 'youtube': return handle.startsWith('@') ? `https://www.youtube.com/${handle}` : `https://www.youtube.com/channel/${handle}`;
    case 'tiktok': return `https://www.tiktok.com/@${handle}`;
    default: return null;
  }
}

/** True when a handle belongs to a known third-party (builder/marketplace/theme). */
export function isThirdPartySocial(handle) {
  const a = alnum(handle);
  if (!a) return false;
  if (THIRD_PARTY_SOCIAL.has(a)) return true;
  if (THIRD_PARTY_HINT.test(handle)) return true;
  return false;
}

/** Does a social handle plausibly belong to this company (by name or domain)? */
export function socialMatchesCompany(handle, companyName, siteDomain) {
  const h = alnum(handle);
  if (!h) return false;
  const dom = alnum(String(siteDomain || '').replace(/^www\./, '').split('.')[0]);
  if (dom && (h.includes(dom) || dom.includes(h))) return true;
  const name = alnum(companyName);
  if (!name) return false;
  if (h.includes(name) || name.includes(h)) return true;
  // token overlap: any 4+ char name token contained in the handle
  for (const tok of String(companyName || '').toLowerCase().split(/[^a-z0-9]+/)) {
    if (tok.length >= 4 && h.includes(tok)) return true;
  }
  return false;
}

/**
 * Clean a company's social links.
 * @param {Array<string|{url?:string,network?:string,value?:string}>} items
 * @param {object} opts { companyName, siteDomain, strictAffinity }
 *   strictAffinity=true also drops links with no affinity to the company
 *   (catches orphan widget links like a random youtube channel id) — OFF by
 *   default so we never remove a legit-but-unrecognised profile.
 * @returns {{kept:Array<{network,url,handle,kind}>, dropped:Array<{url,reason}>}}
 */
export function cleanCompanySocials(items, { companyName = '', siteDomain = '', strictAffinity = false } = {}) {
  const kept = [];
  const dropped = [];
  const byKey = new Map();           // network+handle → index in kept
  const linkedinCompany = [];        // track to resolve numeric-vs-slug dups

  for (const it of items || []) {
    const rawUrl = typeof it === 'string' ? it : (it.url || it.value || '');
    const parsed = parseSocialUrl(rawUrl);
    if (!parsed) { dropped.push({ url: rawUrl, reason: 'unparseable' }); continue; }
    const { network, handle, kind, canonical } = parsed;

    if (network === 'linkedin' && kind === 'personal') {
      dropped.push({ url: rawUrl, reason: 'personal_linkedin_on_company' });
      continue;
    }
    if (isThirdPartySocial(handle) && !socialMatchesCompany(handle, companyName, siteDomain)) {
      dropped.push({ url: rawUrl, reason: 'third_party_credit' });
      continue;
    }
    if (strictAffinity && !socialMatchesCompany(handle, companyName, siteDomain)) {
      dropped.push({ url: rawUrl, reason: 'no_company_affinity' });
      continue;
    }

    const key = network + '|' + handle;
    if (byKey.has(key)) { dropped.push({ url: rawUrl, reason: 'duplicate' }); continue; }

    const entry = { network, url: canonical, handle, kind };
    byKey.set(key, kept.length);
    kept.push(entry);
    if (network === 'linkedin' && kind === 'company') linkedinCompany.push(entry);
  }

  // LinkedIn numeric-id vs vanity-slug for the SAME company page: if a slug
  // exists, drop the pure-numeric duplicates (e.g. /company/10834 vs
  // /company/qatar-airways).
  if (linkedinCompany.length > 1) {
    const hasSlug = linkedinCompany.some((e) => !isNumericHandle(e.handle));
    if (hasSlug) {
      for (const e of linkedinCompany) {
        if (isNumericHandle(e.handle)) {
          const i = kept.indexOf(e);
          if (i >= 0) { kept.splice(i, 1); dropped.push({ url: e.url, reason: 'linkedin_numeric_dup' }); }
        }
      }
    }
  }

  // Per-platform cap (real companies rarely exceed 3 profiles per network).
  const PER = 3;
  const counts = {};
  const capped = [];
  for (const e of kept) {
    counts[e.network] = (counts[e.network] || 0) + 1;
    if (counts[e.network] > PER) { dropped.push({ url: e.url, reason: 'over_platform_cap' }); continue; }
    capped.push(e);
  }
  return { kept: capped, dropped };
}

/** True if the text immediately around a link reads "designed/built by …". */
export function isCreditContext(contextText) {
  return CREDIT_CONTEXT.test(String(contextText || ''));
}

// ===========================================================================
// People — reject page headings masquerading as names / titles
// ===========================================================================

const ROLE_RX = /\b(c[efo]o|cto|cmo|coo|chief|founder|co-?founder|owner|president|vice president|vp|director|managing director|general manager|head of|partner|principal|manager|lead|chairman|chairwoman|board member|ceo|cfo)\b/i;
const NAME_TOKEN = /^[A-Z][a-zA-Z'’.-]+$/;

// Generic page navigation / boilerplate that is never a person's name.
const NAME_JUNK = /\b(home|about|contact|services?|products?|news|blog|careers?|team|menu|copyright|all rights|privacy|terms|cookie|subscribe|newsletter|read more|learn more|view|click|email|phone|company|history|story|mission|vision|overview|profile|message|statement|welcome|board|management|leadership|department|gallery|portfolio|testimonial|faq|sitemap|login|register)\b/i;

// Words that, when they LEAD a candidate, mark it as a section heading.
const HEADING_LEAD = /^(our|the|about|welcome|meet|why|who|what|how|view|read|learn|contact|home|message|message\s+from)\b/i;

/** Strict "this looks like a real human name" check. */
export function looksLikeName(s) {
  if (!s || NAME_JUNK.test(s)) return false;
  if (HEADING_LEAD.test(s.trim())) return false;     // "Our Company", "Our History", "Meet The Team"…
  if (ROLE_RX.test(s)) return false;                 // a job title is not a name
  const toks = s.trim().split(/\s+/);
  if (toks.length < 2 || toks.length > 5) return false;
  let nameTokens = 0;
  for (const t of toks) {
    const bare = t.replace(/[.,]$/, '');
    if (NAME_TOKEN.test(bare)) nameTokens++;
    else if (/^[A-Z]\.?$/.test(t)) continue;          // middle initial e.g. "W" / "W."
    else if (!/^(bin|al|el|de|van|von|della|abu|the|of|du|le|la)$/i.test(t)) return false;
  }
  return nameTokens >= 2;
}

/** True for "Chairman's Message", "President's Message", "CEO Profile" — section headings, not job titles. */
export function isHeadingTitle(title) {
  const t = String(title || '');
  if (/\b(message|statement|profile|biography|bio|welcome|overview|history|story)\b/i.test(t)
      && !/\b(officer|manager|director|head|lead|engineer|consultant|analyst|executive|specialist|coordinator|supervisor|administrator)\b/i.test(t)) {
    return true;
  }
  return false;
}

/**
 * Singular C-suite titles. When 3+ people at one company carry the IDENTICAL
 * such title, it is an extraction artifact (e.g. a testimonial layout) — the
 * shared title should be cleared, not trusted.
 */
const SINGULAR_EXEC = /^(founder & )?(president & ceo|chief executive officer|ceo|president|chairman|chairwoman|managing director|chief financial officer|cfo|chief operating officer|coo|chief technology officer|cto|owner|general manager)$/i;
export function isSingularExecTitle(title) {
  return SINGULAR_EXEC.test(String(title || '').trim());
}

// ── Fake / website-template "people" ───────────────────────────────────────
// Qatar company sites are often built from themes that ship with DEMO staff —
// e.g. eight "people" all titled "CEO @ Google" at a media firm, or non-people
// like "Platform Certified" / "Google Marketing". These poison the People data.
// We detect them three ways: (1) the name isn't a real person, (2) the title /
// bio claims they work at a big EXTERNAL brand, (3) classic placeholder text.

// Big external brands a Qatar company's own staff would not be an executive of.
const EXTERNAL_BRANDS =
  'google|alphabet|meta|facebook|instagram|whatsapp|microsoft|apple|amazon|aws|' +
  'twitter|linkedin|netflix|tesla|spacex|youtube|spotify|uber|lyft|airbnb|' +
  'samsung|huawei|ibm|oracle|sap|adobe|salesforce|tiktok|bytedance|snapchat|' +
  'pinterest|paypal|stripe|shopify|wordpress|envato|themeforest|fiverr|upwork|' +
  'alibaba|tencent|nvidia|intel|cisco|nike|adidas|disney|harvard|stanford|mit';

// A title/bio that claims employment AT a big external brand — "CEO @ Google",
// "Director of Google Services", "Head at Meta". A skill mention like "Google
// Ads", "of Google Analytics", "with Google Cloud" is NOT matched: "@ brand" is
// always an employer claim, while "at/of brand" only counts when the brand is
// NOT followed by one of its product names. ("with"/"across"/"using" aren't
// employer connectors, so skill bios pass.)
const _BRAND = `(?:${EXTERNAL_BRANDS})`;
const _PRODUCT = '(?:ads|adwords|analytics|cloud|workspace|maps|drive|suite|sheets|docs|search|console|tag|azure|office|365|teams|dynamics|business|developer|partner|certified|api|merchant)';
const FAKE_EMPLOYER_RX = new RegExp(`@\\s*${_BRAND}\\b|(?:\\bat\\s+|\\bof\\s+)${_BRAND}\\b(?!\\s+${_PRODUCT})`, 'i');

// Business / service words that mean a "name" field isn't a real person.
const NON_PERSON_NAME_RX = /\b(google|meta|facebook|microsoft|apple|amazon|marketing|certified|platform|solutions?|services?|digital|agency|adwords|seo|technolog\w*|software|consult\w*|advertis\w*|holding|enterprises?)\b/i;

const PLACEHOLDER_NAME = /\b(john|jane)\s+doe\b|lorem\s+ipsum|your\s+name\b|first\s*name|last\s*name|team\s+member\b|full\s+name\b|sample\s+(name|person)/i;
export function isPlaceholderName(name) { return PLACEHOLDER_NAME.test(String(name || '')); }

/** True for a website-template / placeholder "person" that isn't a real employee. */
export function isFakePerson({ name = '', title = '', headline = '' } = {}) {
  if (isPlaceholderName(name)) return true;
  if (NON_PERSON_NAME_RX.test(name)) return true;                       // "Google Marketing", "Platform Certified"
  if (FAKE_EMPLOYER_RX.test(`${title}  ${headline}`)) return true;      // "CEO @ Google", "Director of Google Services"
  return false;
}

/** Back-compat: a title that claims employment at a big external brand. */
export function isTemplatePersonTitle(title) { return FAKE_EMPLOYER_RX.test(String(title || '')); }

// ===========================================================================
// Website — strip markdown / junk, return a clean URL
// ===========================================================================

/** Normalize a website value into a bare clickable URL, or null. */
export function cleanWebsiteUrl(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  // Markdown link: [label](https://real.url) → keep the URL.
  const md = s.match(/\[[^\]]*\]\((https?:\/\/[^)\s]+|www\.[^)\s]+|[^)\s]+\.[a-z]{2,}[^)\s]*)\)/i);
  if (md) s = md[1];
  // Angle-bracketed or quoted.
  s = s.replace(/^[<"'\s]+|[>"'\s]+$/g, '');
  // Strip a trailing markdown remnant or stray bracket/paren.
  s = s.replace(/[)\]]+$/, '').trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  let u;
  try { u = new URL(s); } catch { return null; }
  if (!/\./.test(u.hostname)) return null;            // must have a dot (a real host)
  u.hostname = u.hostname.toLowerCase();
  let out = u.toString().replace(/\/$/, '');
  return out;
}

// ===========================================================================
// Emails — keep all, but rank for a sensible "primary"
// ===========================================================================

const FREEMAIL = new Set([
  'gmail.com', 'googlemail.com', 'hotmail.com', 'hotmail.co.uk', 'outlook.com',
  'live.com', 'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'icloud.com', 'me.com',
  'aol.com', 'protonmail.com', 'proton.me', 'mail.com', 'gmx.com', 'zoho.com',
]);
// Qatar ISP / legacy business webmail — legit but not the company's own domain.
const ISP_DOMAINS = new Set(['qatar.net.qa', 'qatar.com.qa', 'qatari.net', 'qtel.net.qa']);

export function emailDomain(email) {
  const m = String(email || '').toLowerCase().match(/@([^@\s]+)$/);
  return m ? m[1] : '';
}

/** Lower rank = better candidate for the primary email. */
export function emailPrimaryRank(email, siteDomain = '') {
  const d = emailDomain(email);
  const sd = String(siteDomain || '').toLowerCase().replace(/^www\./, '');
  const own = sd && (d === sd || d.endsWith('.' + sd) || sd.endsWith('.' + d));
  if (own) return 0;
  if (ISP_DOMAINS.has(d)) return 1;
  if (FREEMAIL.has(d)) return 2;
  return 3;
}

/**
 * Keep every plausible company email (own-domain, ISP, or free webmail) and
 * return them ordered best-first, so the caller can mark index 0 as primary.
 * Emails on a DIFFERENT company's domain are dropped (footer/client pollution).
 */
export function rankCompanyEmails(emails, siteDomain = '') {
  const list = [...new Set((emails || []).map((e) => String(e).toLowerCase().trim()).filter(Boolean))];
  const sd = String(siteDomain || '').toLowerCase().replace(/^www\./, '');
  const out = [];
  for (const e of list) {
    const r = emailPrimaryRank(e, sd);
    if (sd && r === 3) continue;        // other-company domain → drop
    out.push({ email: e, rank: r });
  }
  out.sort((a, b) => a.rank - b.rank);
  return out.map((x) => x.email);
}

export const _internals = { FREEMAIL, ISP_DOMAINS, THIRD_PARTY_SOCIAL, QA_NSN };
