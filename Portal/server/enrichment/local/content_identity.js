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

// Decode the HTML entities that survive in <title>/<meta>. Without this "Engier&#39;s"
// never matches "Engieers" and the company's OWN name reads as a foreign brand (a real
// false positive on 2026-07-16).
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (_, d) => { try { return String.fromCodePoint(Number(d)); } catch { return ' '; } })
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch { return ' '; } })
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&apos;/gi, "'");
}

// Fold accents so "Stratèze" === "Strateze" and "Wärtsilä" === "Wartsila". Our matcher
// strips non-[a-z0-9], which turned "stratèze" into "strat ze" — so a company whose own
// name was right there in the title got flagged as a different brand (real false
// positives on 2026-07-16: Stratèze LLC, Wärtsilä).
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

// A page with NO real company content — parked, expired, blocked, a host/template default,
// an error shell. It proves NOTHING about whether Bell's stored data is wrong (usually a
// transient outage of an otherwise-correct site), so we SKIP; never quarantine on it.
// Widened 2026-07-16 after a live run flagged: "Website Expired", "ConnectYourDomain
// Error", "My Website", "ThemeForest", "Web server received an invalid…", "Not Acceptable!".
const HOSTING_BRAND_RX = /\b(ovhcloud|ovh|godaddy|namecheap|bluehost|hostgator|siteground|hostinger|ionos|dreamhost|hostpapa|inmotion|namesilo|register\.com|domain\.com|cpanel|plesk|litespeed|themeforest|wordpress|squarespace|wix|weebly|connectyourdomain)\b/i;
const PARKING_RX = /\b(domain (?:is |may be )?(?:for sale|parked)|parked (?:free )?domain|buy this domain|this (?:web ?site|domain) (?:is|may be)? ?(?:for sale|coming soon|under construction|under maintenance)|(?:website|site|store|page) (?:coming soon|expired)|website expired|coming soon\b|under construction|default (?:web ?)?page|welcome to nginx|apache2? (?:ubuntu )?default|it works!|account (?:has been )?suspended|future home of|error 404|404 not found|not acceptable|403 forbidden|access denied|bad request|web server received an invalid|invalid response|site can'?t be reached|my website|untitled|index of \/)\b/i;
function isPlaceholderPage(meta, blob) {
  const hi = fold(((meta.title || '') + ' ' + (meta.ogSiteName || ''))).toLowerCase().trim();
  if (!hi) return true;                                // no identity at all → can't judge
  if (HOSTING_BRAND_RX.test(hi)) return true;          // the page's own title IS a host/template
  if (PARKING_RX.test(hi) || PARKING_RX.test(blob)) return true;
  return false;
}

// The ONLY thing we accept as "this page claims to be brand X": og:site_name.
//
// We used to also mine <title> SEGMENTS, and that was the biggest source of false
// positives (2026-07-16): a title is usually "<Company> — <tagline>", so when the company
// name failed to match for ANY reason (an accent, an HTML entity, a spelling variant) the
// TAGLINE became the "rival brand" — and Bell hid the data of companies whose sites were
// perfectly correct: Gannett Fleming → "Ingenuity That Shapes Lives", Consolidated
// Contractors → "Building Legacies…", Servicio → "- We delivered the excellence",
// Wärtsilä → "The global leader in innovative…". A slogan is NOT a claim of identity.
// og:site_name IS an explicit, machine-readable identity claim — that is the bar.
// This trades recall for precision on purpose: a missed wrong-site is recoverable, hiding
// a correct company's data is not (Rule 2.1).
function brandCandidates(meta) {
  const site = decodeEntities(meta.ogSiteName || '').trim();
  return site && site.length >= 3 ? [site] : [];
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
  // Decode entities and FOLD ACCENTS *before* stripping non-[a-z0-9]. Order matters: fold
  // first or "stratèze" loses the è and becomes "strat ze", never matching "strateze"
  // (that exact bug hid Stratèze's and Wärtsilä's real data on 2026-07-16).
  const blob = ' ' + fold(decodeEntities(parts)).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() + ' ';
  const compact = blob.replace(/\s+/g, '');
  if (compact.length < 40) return { verdict: 'skip', reason: 'empty_or_shell' };

  // Hosting/parking/placeholder page (e.g. an OVHcloud default) → can't judge; leave the
  // stored data alone. Must come BEFORE the brand logic so "OVHcloud" isn't read as a
  // rival brand.
  if (isPlaceholderPage(meta, blob)) return { verdict: 'skip', reason: 'placeholder_or_parked' };

  // Fold the company name too, so an accented legal name still matches its own site.
  const foldedName = fold(name);
  const D = distinctiveTokens(foldedName);                 // ≥4-char, non-generic
  if (D.size === 0) return { verdict: 'skip', reason: 'name_all_generic' };

  // Company present? any distinctive token as a word, or a ≥6-char name slug in the
  // whitespace-stripped blob (handles "docmedicalcenter" vs "doc medical center").
  const slugs = nameSlugs(foldedName).filter((s) => s.length >= 6);
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

  // Name absent AND the domain-brand is absent from its own content → require an explicit
  // og:site_name naming a DIFFERENT brand to call it a conflict.
  for (const label of brandCandidates(meta)) {
    const foldedLabel = fold(label);
    if (shareDistinctive(foldedName, foldedLabel)) continue;      // same brand family → not foreign
    // The site-name must also disagree with the DOMAIN — "Avey" on avey.ai is the site's
    // own brand, not a takeover.
    if (domainSlug && domainSlug.length >= 4) {
      const labelCompact = foldedLabel.toLowerCase().replace(/[^a-z0-9]+/g, '');
      if (labelCompact.includes(domainSlug) || domainSlug.includes(labelCompact)) continue;
    }
    const toks = foreignTokens(foldedLabel, D);
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
