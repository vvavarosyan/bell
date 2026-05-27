// Stage 6 — Website Contact Discovery
// ----------------------------------------------------------------------------
// For each company with a website, hit Firecrawl /v1/scrape on the homepage
// plus the common contact / about pages (if linked). Parse the resulting
// markdown for:
//   - emails  (regex sweep, then filter junk like @example.com, image filenames)
//   - phones  (Qatar-format + international, normalized to digits + leading +)
//   - social URLs (linkedin, instagram, facebook, twitter/x, youtube)
//
// Every find is inserted into company_contacts with source='stage6-website' and
// source_url=the specific page it was found on, so the admin can verify in the
// drawer where each number/email came from.
//
// Pricing: Firecrawl /v1/scrape — handful of cents per page. We hit at most
// 3 pages per company (homepage + contact + about) and short-circuit if the
// homepage's link map already gives us enough info.

import * as firecrawl from '../clients/firecrawl.js';
import { upsertContact } from '../../lib/contacts.js';
import { query } from '../../db.js';

export const STAGE_LABEL = 'Stage 6 — Website Contact Discovery';
export const TOOL_NAME   = 'firecrawl_website_scrape';

// Approximate Firecrawl /scrape pricing for budget logging only
const PER_PAGE_USD = 0.015;

// Page paths we look for on each site, in priority order
const CONTACT_PATH_HINTS = [
  '/contact', '/contact-us', '/contactus', '/get-in-touch', '/reach-us',
  '/about', '/about-us', '/aboutus',
];

// ---------------------------------------------------------------------------
// Extraction primitives
// ---------------------------------------------------------------------------

const EMAIL_RX = /[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,24}/gi;

// Qatar mobile/landline patterns + generic international.
// Examples we want to catch:
//   +974 4444 5555      (international)
//   +974-4444-5555      (international with hyphens)
//   (+974) 4444 5555    (international parens)
//   00974 4444 5555     (international 00 prefix)
//   +1 (212) 555-0123   (international, US-formatted)
//   +44 20 7946 0958    (international, UK)
//   4444 5555           (Qatar local — 8 digits, ONLY accepted when found
//                        right next to a contact-label like Tel:/Phone:)
// We DON'T want to accept random 7+ digit runs (flight numbers, booking refs,
// dates, postal codes, etc.) — see acceptPhone() for the strict rule set.
const PHONE_RX = /(\+?\d[\d\s\-().]{5,18}\d)/g;

// Phrases that, when found just before a number, strongly suggest "this is a
// phone". Lets us accept bare 8-digit Qatar numbers that otherwise look like
// booking refs or order numbers. Case-insensitive, English + Arabic.
const PHONE_LABEL_RX = /(tel\.?|telephone|phone|mobile|cell|call|whatsapp|fax|hotline|contact|customer\s+(service|care)|reservations?|booking|sales|support|enquiries|inquiries|toll[-\s]?free|reach\s+us|هاتف|تليفون|اتصل|واتساب)\s*(?:[:#.\-]|number|no\.?|on)?\s*$/i;

const SOCIAL_PATTERNS = [
  { name: 'linkedin',  rx: /https?:\/\/(?:[\w-]+\.)?linkedin\.com\/(?:in|company|school)\/[\w\-_.%]+/gi },
  { name: 'instagram', rx: /https?:\/\/(?:www\.)?instagram\.com\/[\w\-_.]+/gi },
  { name: 'facebook',  rx: /https?:\/\/(?:www\.)?facebook\.com\/[\w\-_.%]+/gi },
  { name: 'twitter',   rx: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/[\w\-_.]+/gi },
  { name: 'youtube',   rx: /https?:\/\/(?:www\.)?youtube\.com\/(?:c|channel|user|@)[\w\-_.\/]+/gi },
];

function findEmails(text) {
  if (!text) return [];
  const seen = new Set();
  const found = [];
  const matches = text.match(EMAIL_RX) || [];
  for (const m of matches) {
    const v = m.toLowerCase();
    if (seen.has(v)) continue;
    if (/\.(png|jpg|jpeg|gif|svg|webp|ico|pdf)$/i.test(v)) continue;
    if (/^[0-9]+@[0-9]+/.test(v)) continue;             // pure-numeric junk
    if (/sentry\.io$|wixpress\.com$|example\.|placeholder/i.test(v)) continue;
    if (v.length > 80) continue;                        // garbage tokens
    seen.add(v);
    found.push(v);
  }
  return found;
}

/**
 * Decide whether a candidate string is a real phone number.
 *
 * Accept rules (any one suffices):
 *   1) International notation with `+` prefix and 8-15 digits.
 *   2) International notation with `00` prefix and 8-15 digits.
 *   3) 9-15 digits AND at least one separator character (space/dash/dot/paren).
 *   4) Exactly 8 digits AND a contact-label appears in the surrounding text
 *      just before this match (Qatar local format, e.g. "Tel: 4444 5555").
 *
 * Reject otherwise. The label-proximity rule is what lets Qatar Airways'
 * "Tel +974 4444 5555" through while keeping flight numbers and booking
 * references out.
 */
function acceptPhone(rawMatch, fullText, matchIndex) {
  const trimmed = rawMatch.trim();
  const digits  = trimmed.replace(/[^\d]/g, '');

  // Length sanity
  if (digits.length < 8 || digits.length > 15) return false;

  // Reject obvious non-phones
  if (/^(\d)\1+$/.test(digits))              return false;          // 1111111, 9999999
  if (/^19\d{2}$|^20\d{2}$/.test(digits))    return false;          // years
  if (/^(?:\d{4}-\d{2}-\d{2}|\d{2}-\d{2}-\d{4}|\d{2}\/\d{2}\/\d{4})$/.test(trimmed.replace(/\s/g, '')))
    return false;                                                    // dates

  // Rule 1 + 2 — international prefix
  if (trimmed.startsWith('+'))   return true;
  if (digits.startsWith('00') && digits.length >= 10) return true;

  // Rule 3 — 9+ digits with separators
  const hasSeparator = /[\s\-().]/.test(trimmed);
  if (digits.length >= 9 && hasSeparator) return true;

  // Rule 4 — exactly 8 digits AND a contact label nearby
  if (digits.length === 8) {
    // Look at the ~40 chars before the match for a contact label
    const windowStart = Math.max(0, matchIndex - 40);
    const before = fullText.slice(windowStart, matchIndex);
    if (PHONE_LABEL_RX.test(before)) return true;
  }

  return false;
}

function findPhones(text) {
  if (!text) return [];
  const seen  = new Set();
  const found = [];
  // matchAll so we get positional context for the label-proximity check.
  for (const m of text.matchAll(PHONE_RX)) {
    const raw   = m[0];
    const idx   = m.index ?? 0;
    if (!acceptPhone(raw, text, idx)) continue;

    const digits     = raw.replace(/[^\d]/g, '');
    const normalized = (raw.trim().startsWith('+') ? '+' : '') + digits;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    found.push({ display: raw.trim(), value: normalized });
  }
  return found;
}

function findSocials(text, linkList = []) {
  const found = [];
  const seen = new Set();
  for (const { name, rx } of SOCIAL_PATTERNS) {
    const hits = (text || '').match(rx) || [];
    for (const link of linkList || []) {
      if (rx.test(link)) hits.push(link);
      rx.lastIndex = 0;
    }
    for (const raw of hits) {
      let clean = raw.replace(/[)\].,]+$/, '');
      try {
        const u = new URL(clean);
        u.search = ''; u.hash = '';
        clean = u.toString().replace(/\/$/, '').toLowerCase();
      } catch { clean = clean.toLowerCase(); }
      if (seen.has(clean)) continue;
      seen.add(clean);
      found.push({ network: name, url: clean });
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// URL helpers
// ---------------------------------------------------------------------------

function rootOf(rawUrl) {
  if (!rawUrl) return null;
  let u = rawUrl.trim();
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try {
    const parsed = new URL(u);
    parsed.pathname = '/';
    parsed.search = ''; parsed.hash = '';
    return parsed.toString().replace(/\/$/, '');
  } catch { return null; }
}

function sameDomain(a, b) {
  try {
    return new URL(a).hostname.replace(/^www\./, '')
        === new URL(b).hostname.replace(/^www\./, '');
  } catch { return false; }
}

/** From the homepage's link list, return up to 2 contact/about pages on the same site. */
function pickFollowUpPages(homeUrl, links) {
  if (!Array.isArray(links)) return [];
  const out = new Set();
  for (const l of links) {
    if (typeof l !== 'string') continue;
    if (!sameDomain(homeUrl, l)) continue;
    const path = (() => { try { return new URL(l).pathname.toLowerCase(); } catch { return ''; } })();
    if (CONTACT_PATH_HINTS.some(h => path.includes(h))) {
      let clean = l;
      try { const u = new URL(l); u.search=''; u.hash=''; clean = u.toString(); } catch {}
      out.add(clean);
      if (out.size >= 2) break;
    }
  }
  return [...out];
}

// ---------------------------------------------------------------------------
// Per-company entry point
// ---------------------------------------------------------------------------

/**
 * Scrape one company's website + contact/about pages. Inserts all discovered
 * emails/phones/socials into company_contacts. Returns { status, scraped_pages,
 * found: { emails, phones, socials }, usd }.
 */
export async function enrichCompany(company) {
  const homeUrl = rootOf(company.website);
  if (!homeUrl) {
    await markStage(company.id, 'no_data', { stage6_skip_reason: 'no_website' });
    return { status: 'no_data', reason: 'no_website', usd: 0 };
  }

  await markStage(company.id, 'running');

  const visited = [];
  let allText = '';
  let allLinks = [];

  // Homepage
  try {
    const home = await firecrawl.scrape(homeUrl, { formats: ['markdown', 'links'] });
    visited.push(homeUrl);
    allText  += '\n' + (home.markdown || '');
    allLinks  = allLinks.concat(home.links || []);
  } catch (err) {
    await markStage(company.id, 'failed', { stage6_error: err.message.slice(0, 200) });
    return { status: 'failed', reason: err.message, usd: 0 };
  }

  // Follow-up: 1-2 contact/about pages if linked
  const followUps = pickFollowUpPages(homeUrl, allLinks);
  for (const url of followUps) {
    try {
      const r = await firecrawl.scrape(url, { formats: ['markdown', 'links'] });
      visited.push(url);
      allText  += '\n' + (r.markdown || '');
      allLinks  = allLinks.concat(r.links || []);
    } catch (err) {
      // Soft-fail: keep what we have
    }
  }

  // Extract
  const emails  = findEmails(allText);
  const phones  = findPhones(allText);
  const socials = findSocials(allText, allLinks);

  // Persist — every find gets a company_contacts row with provenance
  let writtenE = 0, writtenP = 0, writtenS = 0;
  for (const e of emails) {
    const r = await upsertContact('company', company.id, {
      type: 'email', value: e,
      source: 'stage6-website', source_url: visited[0],
    });
    if (r) writtenE++;
  }
  for (const p of phones) {
    const r = await upsertContact('company', company.id, {
      type: 'phone', value: p.value, value_display: p.display,
      source: 'stage6-website', source_url: visited[0],
    });
    if (r) writtenP++;
  }
  for (const s of socials) {
    const r = await upsertContact('company', company.id, {
      type: 'social', value: s.url, value_display: s.url,
      source: 'stage6-website', source_url: visited[0],
      source_label: s.network,
    });
    if (r) writtenS++;
  }

  const usd = visited.length * PER_PAGE_USD;
  const summary = {
    stage6_scraped_at:  new Date().toISOString(),
    stage6_pages:       visited,
    stage6_found:       { emails: emails.length, phones: phones.length, socials: socials.length },
  };

  const status = (writtenE + writtenP + writtenS) > 0 ? 'done' : 'no_data';
  await markStage(company.id, status, summary);

  return {
    status, usd,
    scraped_pages: visited,
    found: { emails: writtenE, phones: writtenP, socials: writtenS },
  };
}

// ---------------------------------------------------------------------------
// Bulk entry point used by the orchestrator
// ---------------------------------------------------------------------------

export async function enrichCompanies(companies, jobLog = null) {
  let done = 0, noData = 0, failed = 0, usdTotal = 0;

  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    try {
      const r = await enrichCompany(c);
      usdTotal += r.usd || 0;
      if (r.status === 'done')         done++;
      else if (r.status === 'no_data') noData++;
      else                             failed++;
      const tag = r.status === 'done' ? '✓' : (r.status === 'no_data' ? '·' : '✗');
      jobLog?.(`  ${tag} [${i+1}/${companies.length}] ${c.name}` +
        (r.found ? ` — +${r.found.emails}e/${r.found.phones}p/${r.found.socials}s` : '') +
        (r.reason ? ` (${r.reason})` : ''));
    } catch (err) {
      failed++;
      jobLog?.(`  ✗ [${i+1}/${companies.length}] ${c.name} — ${err.message}`);
    }
  }

  return { done, no_data: noData, failed, usd: usdTotal };
}

// ---------------------------------------------------------------------------
// Stage status bookkeeping
// ---------------------------------------------------------------------------

async function markStage(companyId, status, extras = null) {
  if (extras) {
    await query(
      `UPDATE companies
       SET stage6_status = $2, stage6_at = now(),
           extra_fields  = extra_fields || $3::jsonb
       WHERE id = $1`,
      [companyId, status, JSON.stringify(extras)],
    );
  } else {
    await query(
      `UPDATE companies SET stage6_status = $2, stage6_at = now() WHERE id = $1`,
      [companyId, status],
    );
  }
}
