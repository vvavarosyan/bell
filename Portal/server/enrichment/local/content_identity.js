// content_identity.js — decide whether a fetched web page's CONTENT actually belongs
// to the company we attached the site to. Complements website_conflict.js, which only
// compares the DOMAIN to the company name. This catches the other failure mode:
// a RIGHT domain serving the WRONG company — e.g. foundationendowment.com (domain
// matches "Qatar Foundation Endowment") actually serving a "Smart Evolution" tech blog.
//
// Pure + deterministic, no network. Rule 2.1: only return 'content-conflict' when the
// company is clearly ABSENT from the page AND a clearly DIFFERENT brand is present.
// Anything uncertain — generic/short company name, empty/unrendered page, or the name
// IS on the page — returns 'ok' or 'skip'. We never flag on doubt (a false flag hides a
// correct company's real logo/description; a missed one is only left as-is).
//
// Verdicts:
//   ok               — the company's own distinctive name/token appears → trust the page.
//   content-conflict — name absent + a positive foreign brand in the high-signal fields.
//   skip             — can't judge (no name, page not ok, empty/shell, all-generic name,
//                      or name absent but no clear other brand).

import { significantTokens, nameSlugs, GENERIC_WORDS } from './finder.js';
import { distinctiveTokens, shareDistinctive } from './website_conflict.js';

// <title> brand separators — "Contact — Acme", "Acme | Home", "Page › Brand".
const TITLE_SPLIT = /\s*[|·•>»‹›–—:]\s*|\s-\s/;

// Brand-name candidates, most reliable first: og:site_name, then the title's end/start
// segments (the brand usually sits at one end of a "<page> — <brand>" title).
function brandCandidates(meta) {
  const out = [];
  if (meta.ogSiteName) out.push(String(meta.ogSiteName).trim());
  if (meta.title) {
    const segs = String(meta.title).split(TITLE_SPLIT).map((s) => s.trim()).filter(Boolean);
    if (segs.length > 1) { out.push(segs[segs.length - 1]); out.push(segs[0]); }
  }
  return [...new Set(out.filter((s) => s && s.length >= 3))];
}

// Distinctive tokens of a candidate brand label that are NOT the company's own and not
// generic — the positive evidence that the page is a different, specific brand.
function foreignTokens(label, companyDistinctive) {
  return significantTokens(label).filter(
    (t) => t.length >= 6 && !GENERIC_WORDS.has(t) && !companyDistinctive.has(t),
  );
}

// company: { name }. page: { meta:{title,description,keywords,ogSiteName,...}, text, ok }
export function contentIdentity(company, page) {
  const name = company && company.name;
  if (!name) return { verdict: 'skip', reason: 'no_name' };
  if (!page || page.ok === false) return { verdict: 'skip', reason: 'page_not_ok' };

  const meta = page.meta || {};
  const text = String(page.text || '');
  const parts = [meta.title, meta.ogSiteName, meta.description, meta.keywords, text.slice(0, 8000)]
    .filter(Boolean).join(' \n ');
  // Normalise to space-separated lowercase alnum so token matching is clean.
  const blob = ' ' + parts.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  const compact = blob.replace(/\s+/g, '');
  if (compact.length < 40) return { verdict: 'skip', reason: 'empty_or_shell' };

  const D = distinctiveTokens(name);                       // ≥4-char, non-generic
  if (D.size === 0) return { verdict: 'skip', reason: 'name_all_generic' };

  // Company present? any distinctive token as a word, or a ≥6-char name slug in the
  // whitespace-stripped blob (handles "docmedicalcenter" vs "doc medical center").
  const slugs = nameSlugs(name).filter((s) => s.length >= 6);
  const present = [...D].some((t) => blob.includes(' ' + t) || blob.includes(t))
    || slugs.some((s) => compact.includes(s));
  if (present) return { verdict: 'ok', reason: 'name_present' };

  // Name absent → require a positive DIFFERENT brand in the high-signal fields.
  for (const label of brandCandidates(meta)) {
    if (shareDistinctive(name, label)) continue;           // same brand family → not foreign
    const toks = foreignTokens(label, D);
    if (toks.length) {
      return {
        verdict: 'content-conflict', reason: 'name_absent_other_brand',
        brand: label, matched: toks[0],
        evidence: (meta.ogSiteName || meta.title || '').slice(0, 140),
      };
    }
  }
  return { verdict: 'skip', reason: 'name_absent_no_clear_brand' };
}
