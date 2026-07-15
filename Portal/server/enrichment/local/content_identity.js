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
import { distinctiveTokens, shareDistinctive, hostSlug } from './website_conflict.js';

// <title> brand separators — "Contact — Acme", "Acme | Home", "Page › Brand".
const TITLE_SPLIT = /\s*[|·•>»‹›–—:]\s*|\s-\s/;

// A page whose TITLE/site-name IS a hosting provider, or whose content is a parking /
// coming-soon / server-default placeholder, has NO real company content. That proves
// nothing about whether Bell's stored data is wrong — it's usually a transient outage or
// a not-yet-launched domain of an otherwise-correct site (e.g. globalpuretrading.com
// briefly serving OVHcloud's default). We SKIP these — never quarantine on a placeholder.
const HOSTING_BRAND_RX = /\b(ovhcloud|ovh|godaddy|namecheap|bluehost|hostgator|siteground|hostinger|ionos|dreamhost|hostpapa|inmotion|namesilo|register\.com|domain\.com|cpanel|plesk|litespeed)\b/i;
const PARKING_RX = /\b(domain (?:is |may be )?(?:for sale|parked)|parked (?:free )?domain|buy this domain|this (?:web ?site|domain) (?:is|may be)? ?(?:for sale|coming soon|under construction|under maintenance)|(?:website|site|store|page) coming soon|coming soon\b|under construction|default (?:web ?)?page|welcome to nginx|apache2? (?:ubuntu )?default|it works!|account (?:has been )?suspended|future home of|error 404|404 not found)\b/i;
function isPlaceholderPage(meta, blob) {
  const hi = ((meta.title || '') + ' ' + (meta.ogSiteName || '')).toLowerCase().trim();
  if (hi && HOSTING_BRAND_RX.test(hi)) return true;   // the page's own title IS a host → default page
  return PARKING_RX.test(blob);
}

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

  // Hosting/parking/placeholder page (e.g. an OVHcloud default) → can't judge; leave the
  // stored data alone. Must come BEFORE the brand logic so "OVHcloud" isn't read as a
  // rival brand.
  if (isPlaceholderPage(meta, blob)) return { verdict: 'skip', reason: 'placeholder_or_parked' };

  const D = distinctiveTokens(name);                       // ≥4-char, non-generic
  if (D.size === 0) return { verdict: 'skip', reason: 'name_all_generic' };

  // Company present? any distinctive token as a word, or a ≥6-char name slug in the
  // whitespace-stripped blob (handles "docmedicalcenter" vs "doc medical center").
  const slugs = nameSlugs(name).filter((s) => s.length >= 6);
  const present = [...D].some((t) => blob.includes(' ' + t) || blob.includes(t))
    || slugs.some((s) => compact.includes(s));
  if (present) return { verdict: 'ok', reason: 'name_present' };

  // Company legal name absent — but is the page coherently branded to ITS OWN DOMAIN?
  // A company often runs its site under a PRODUCT/TRADING name, not its legal name:
  // "Rimads QSTP-LLC" operates avey.ai, branded "Avey" (domain = content). That is a
  // real own-brand site, NOT foreign content. We only treat the page as wrong when the
  // content brand disagrees with the DOMAIN too (parked/hijacked/rebranded — e.g.
  // foundationendowment.com serving "Smart Evolution", where the domain slug never
  // appears in its own content). website_conflict.js separately handles a domain that
  // belongs to a DIFFERENT registered company.
  const domainSlug = hostSlug(page.url || page.finalUrl || '');
  if (domainSlug && domainSlug.length >= 4 && compact.includes(domainSlug)) {
    return { verdict: 'ok', reason: 'domain_brand_present' };
  }

  // Name absent AND the domain-brand is absent from its own content → require a positive
  // DIFFERENT brand in the high-signal fields to call it a conflict.
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
