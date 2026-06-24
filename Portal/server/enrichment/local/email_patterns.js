// Email pattern helpers — PURE, no I/O. The Stage 10 Email Finder uses these to
// (a) DECODE a real, observed email local-part against a known employee's name to
// learn a company's email FORMAT, and (b) GENERATE the address for another
// employee from that learned format. Pure functions → unit-testable, no network.
//
// We compare against the local-part WITH its separators preserved (so we can tell
// "first.last" from "firstlast"), while names are reduced to bare alnum tokens.

// Combining diacritic marks (U+0300–U+036F) to strip after NFD. Built from a
// string escape so there is no literal combining char in this source file.
const COMBINING = new RegExp('[\\u0300-\\u036f]', 'g');

/** Bare token: strip diacritics, lower-case, keep a–z0–9 only. */
export function normToken(s) {
  if (!s) return '';
  return String(s).normalize('NFD').replace(COMBINING, '')
    .toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Local-part normaliser: keep the separators . _ - that distinguish formats. */
export function normLocal(s) {
  if (!s) return '';
  return String(s).normalize('NFD').replace(COMBINING, '')
    .toLowerCase().trim().replace(/[^a-z0-9._-]/g, '');
}

/** Reduce a person record to { first, last } bare tokens. */
export function splitName(person) {
  let first = person && person.first_name;
  let last  = person && person.last_name;
  if ((!first || !last) && person && person.full_name) {
    const parts = String(person.full_name).trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) { first = first || parts[0]; last = last || parts[parts.length - 1]; }
    else if (parts.length === 1) { first = first || parts[0]; }
  }
  return { first: normToken(first), last: normToken(last) };
}

/** Mailbox local-parts that are roles, never a person — never decode/learn these. */
export const GENERIC_LOCALS = new Set([
  'info', 'sales', 'contact', 'contactus', 'admin', 'office', 'hello', 'support',
  'enquiry', 'enquiries', 'inquiry', 'inquiries', 'marketing', 'hr', 'careers',
  'career', 'jobs', 'finance', 'accounts', 'account', 'accounting', 'billing',
  'team', 'mail', 'email', 'general', 'reception', 'service', 'services', 'help',
  'helpdesk', 'noreply', 'no-reply', 'donotreply', 'newsletter', 'press', 'media',
  'procurement', 'booking', 'bookings', 'reservation', 'reservations', 'order',
  'orders', 'web', 'webmaster', 'postmaster', 'it', 'pr', 'ceo', 'md', 'gm',
]);

// Recognised formats, in priority order. Initials-only formats are deliberately
// excluded — too weak to confirm a company pattern or to generate safely.
const FORMATS = [
  'first.last', 'first_last', 'first-last', 'firstlast',
  'flast', 'f.last', 'first.l', 'firstl',
  'last.first', 'lastfirst', 'last.f', 'lastf',
  'first', 'last',
];

function buildLocal(fmt, first, last) {
  const f = first ? first[0] : '';
  const l = last ? last[0] : '';
  switch (fmt) {
    case 'first.last': return first && last ? `${first}.${last}` : '';
    case 'first_last': return first && last ? `${first}_${last}` : '';
    case 'first-last': return first && last ? `${first}-${last}` : '';
    case 'firstlast':  return first && last ? `${first}${last}`  : '';
    case 'flast':      return f && last ? `${f}${last}` : '';
    case 'f.last':     return f && last ? `${f}.${last}` : '';
    case 'first.l':    return first && l ? `${first}.${l}` : '';
    case 'firstl':     return first && l ? `${first}${l}` : '';
    case 'last.first': return first && last ? `${last}.${first}` : '';
    case 'lastfirst':  return first && last ? `${last}${first}` : '';
    case 'last.f':     return last && f ? `${last}.${f}` : '';
    case 'lastf':      return last && f ? `${last}${f}` : '';
    case 'first':      return first || '';
    case 'last':       return last || '';
    default:           return '';
  }
}

/**
 * If `localPart` matches `person` under one of the known formats, return that
 * format token; else null. Single-token formats (first / last) only count when
 * the token is distinctive (≥ 4 chars) to avoid coincidental matches.
 */
export function decodeFormat(localPart, person) {
  const local = normLocal(localPart);
  if (!local) return null;
  if (GENERIC_LOCALS.has(local)) return null;
  const { first, last } = splitName(person);
  if (!first && !last) return null;
  for (const fmt of FORMATS) {
    const cand = buildLocal(fmt, first, last);
    if (!cand) continue;
    if (cand === local) {
      if ((fmt === 'first' || fmt === 'last') && cand.length < 4) continue;
      return fmt;
    }
  }
  return null;
}

/** Generate the email for `person` from a learned `fmt` + `domain`. Null if N/A. */
export function emailFromFormat(fmt, person, domain) {
  const { first, last } = splitName(person);
  const local = buildLocal(fmt, first, last);
  if (!local || !domain) return null;
  return `${local}@${String(domain).toLowerCase()}`;
}

/**
 * Weaker signal: does a local-part STRUCTURALLY look like a person (two alpha
 * tokens, e.g. "first.last")? Returns a format token or null. Conservative — only
 * the two most common separated shapes, never bare concatenations.
 */
export function inferStructuralFormat(localPart) {
  const lp = normLocal(localPart);
  if (!lp || GENERIC_LOCALS.has(lp)) return null;
  if (/^[a-z]{2,}\.[a-z]{2,}$/.test(lp)) return 'first.last';
  if (/^[a-z]{2,}_[a-z]{2,}$/.test(lp)) return 'first_last';
  return null;
}
