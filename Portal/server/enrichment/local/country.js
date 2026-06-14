// Country classifier — precision-first Qatar detection for Engine 3.
// ----------------------------------------------------------------------------
// When Engine 3 discovers a related company that isn't already in Bell, we must
// decide where it goes:
//
//   CONFIRMED QATAR   → auto-enters the live `companies` table (Bell customers
//                       see it). This bar is DELIBERATELY STRICT — we never want
//                       a non-Qatar company to leak into Bell.
//   CONFIRMED FOREIGN → International holding pen (research_candidates,non_qatar).
//   UNCERTAIN         → pending admin approval (research_candidates,pending).
//
// Signals come from the company's own website (TLD + page text) and, optionally,
// from a cheap web-search corroboration (does a .qa domain show up?). All local.

import { hostOf } from './http.js';

// A .qa / .com.qa host is the single strongest Qatar signal.
const QATAR_TLD_RX = /\.qa$/i;

// Qatari phone country code, written +974 / 00974 / (974).
const QATAR_PHONE_RX = /(?:\+|00)\s?974\b|\(974\)/;

// The country / capital / demonym — one signal.
const QATAR_COUNTRY_RX = /\b(qatar|qatari|doha)\b/i;
// Distinctive Qatari districts / landmarks / zones — a second, independent
// signal (these rarely appear on an unrelated foreign site by accident).
const QATAR_PLACE_RX =
  /\b(lusail|al[-\s]?rayyan|west\s?bay|msheireb|al[-\s]?wakrah|umm\s?salal|al[-\s]?khor|al[-\s]?daayen|education\s?city|ras\s?laffan|mesaieed|qstp|qfc|qfz|katara|hamad\s?(?:international|airport|port))\b/i;

// Foreign country / city tokens → country code, used as NEGATIVE evidence. Kept
// to the markets a Qatar-region company is most likely to be confused with.
const FOREIGN_TOKENS = [
  [/\b(united arab emirates|u\.?a\.?e\.?|dubai|abu\s?dhabi|sharjah|ajman)\b/i, 'AE'],
  [/\b(saudi arabia|ksa|riyadh|jeddah|dammam|khobar|mecca|medina)\b/i, 'SA'],
  [/\b(kuwait city|state of kuwait)\b/i, 'KW'],
  [/\b(kingdom of bahrain|manama)\b/i, 'BH'],
  [/\b(sultanate of oman|muscat|salalah)\b/i, 'OM'],
  [/\b(united kingdom|london|manchester)\b/i, 'GB'],
  [/\b(united states|u\.?s\.?a\.?|new york|california|texas)\b/i, 'US'],
  [/\b(india|mumbai|delhi|bangalore|bengaluru|chennai)\b/i, 'IN'],
];

// Foreign TLDs (and the country they imply). .com/.net/.org are neutral.
const FOREIGN_TLD = [
  [/\.ae$/i, 'AE'], [/\.sa$/i, 'SA'], [/\.kw$/i, 'KW'], [/\.bh$/i, 'BH'],
  [/\.om$/i, 'OM'], [/\.uk$/i, 'GB'], [/\.us$/i, 'US'], [/\.in$/i, 'IN'],
  [/\.pk$/i, 'PK'], [/\.eg$/i, 'EG'], [/\.de$/i, 'DE'], [/\.fr$/i, 'FR'],
];

/** All Qatar signals present given a host + page (page may be null). */
export function qatarSignals(host, page, searchHosts = []) {
  const sig = [];
  if (host && QATAR_TLD_RX.test(host)) sig.push('tld_qa');
  const blob = page ? ((page.title || '') + ' ' + (page.text || '')).slice(0, 8000) : '';
  if (blob) {
    if (QATAR_PHONE_RX.test(blob)) sig.push('phone_974');
    const c = blob.match(QATAR_COUNTRY_RX);
    if (c) sig.push('text:' + c[1].toLowerCase());
    const pl = blob.match(QATAR_PLACE_RX);
    if (pl) sig.push('place:' + pl[1].toLowerCase().replace(/\s+/g, ''));
  }
  if (Array.isArray(searchHosts) && searchHosts.some(h => QATAR_TLD_RX.test(h || ''))) {
    sig.push('search_qa');
  }
  return [...new Set(sig)];
}

/** Foreign signals (country codes) present. */
export function foreignSignals(host, page) {
  const out = new Set();
  if (host) for (const [rx, cc] of FOREIGN_TLD) if (rx.test(host)) out.add('tld:' + cc);
  const blob = page ? ((page.title || '') + ' ' + (page.text || '')).slice(0, 8000) : '';
  if (blob) for (const [rx, cc] of FOREIGN_TOKENS) if (rx.test(blob)) out.add('text:' + cc);
  return [...out];
}

/**
 * Classify a discovered entity.
 *   { domain, page, searchHosts }  →  { status, country, confidence, signals }
 *
 *   status ∈ 'qatar' | 'non_qatar' | 'uncertain'
 *
 * CONFIRMED QATAR (→ auto-enter Bell) requires either ONE very strong signal
 * (a .qa TLD, or a +974 phone) OR TWO independent weaker signals (e.g. "Doha"
 * on the page AND a .qa domain surfacing in search), AND no contradicting
 * foreign TLD. The bar is intentionally high: a false "qatar" pollutes Bell,
 * whereas a false "uncertain" only costs one admin click.
 */
export function classifyCountry({ domain, page, searchHosts = [] } = {}) {
  const host = (domain && hostOf(domain.startsWith('http') ? domain : 'http://' + domain)) || domain || '';
  const qSig = qatarSignals(host, page, searchHosts);
  const fSig = foreignSignals(host, page);

  const hasStrongQatar = qSig.includes('tld_qa') || qSig.includes('phone_974');
  const qatarCount     = qSig.length;
  const foreignTld     = fSig.some(s => s.startsWith('tld:'));
  const foreignCount   = fSig.length;

  // Confirmed Qatar — strong single signal, or ≥2 signals, and not on a foreign
  // ccTLD (a .ae/.sa domain is rarely a Qatar company even if it mentions Doha).
  if (!foreignTld && (hasStrongQatar || qatarCount >= 2)) {
    return { status: 'qatar', country: 'QA', confidence: hasStrongQatar ? 'high' : 'medium', signals: qSig };
  }

  // Confirmed foreign — a foreign ccTLD with no Qatar signal, or ≥2 foreign
  // signals with no Qatar signal. (Only matters for routing to International;
  // it never enters Bell either way, so a looser bar here is safe.)
  if (qatarCount === 0 && (foreignTld || foreignCount >= 2)) {
    const cc = (fSig.find(s => s.startsWith('tld:')) || fSig[0] || ':').split(':')[1] || null;
    return { status: 'non_qatar', country: cc, confidence: foreignTld ? 'high' : 'medium', signals: fSig };
  }

  // Everything else → uncertain (admin approval).
  return { status: 'uncertain', country: null, confidence: 'low', signals: [...qSig, ...fSig] };
}
