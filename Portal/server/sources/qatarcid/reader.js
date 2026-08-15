// Read one qatarcid.com listing page — the QCCI directory — into the June scan-record shape.
//
// Val, 2026-08-15, on refreshing QCCI without Firecrawl: "can we use ROG to do this process?"
// Yes, and this is it. The site sits behind Cloudflare, which rejects plain fetch (403, proven)
// but serves a REAL browser the full page (proven in the browser pane the same day). The ROG
// already runs a browser engine for the tender scans; renderPage() uses it there and Playwright
// on the Mac, so this reader runs on either machine.
//
// ── THE "CLICK TO SEE" THEATRE ───────────────────────────────────────────────────────────────
// Contacts look gated behind a reveal button. They are not: the full value is split across two
// HTML attributes and the click just concatenates them —
//     <a data-mxe="4442063" data-mx="4" data-mxt="tel">      → 44420634
//     <a data-mxe="hassank" data-mx="ousa@live.com" ...>     → hassankousa@live.com
// Verified live by clicking and diffing the DOM: no network call is made. So the reader needs no
// clicking at all — the page as rendered already states everything.
//
// ── WHAT IS PARSED, AND HOW HONESTLY ─────────────────────────────────────────────────────────
// The details block prints exact labels ("CR Number :", "QCCI Membership Number :", …) each on
// its own line with the value on the next. Only that fixed label list is read — nothing is
// inferred from position beyond label→next-line, and an absent label stays null (Rule 2.1).
// The output shape matches Data/…/Qatar Chamber/scans/qatarcid_companies_latest.json exactly,
// so the ONE existing ingest path (ingestSource('QCCI')) consumes it unchanged — no second
// ingest implementation, per the one-guard-per-action lesson.

// Labels exactly as the page prints them (suffix " :" stripped by the splitter).
const DETAIL_LABELS = {
  'CR Number': 'cr_number',
  'QCCI Membership Number': 'qcci_membership_number',
  'Company Type': 'company_type',
  'PO Box': 'po_box',
  'Phone': 'phone',
  'Fax': 'fax',
  'Contact Person': 'contact_person',
  'Owner Name': 'owner_name',
  'Location': 'location',
};

/** Join the two halves of a theatre-split value. tel keeps digits only; the rest concatenate. */
function unsplit(mxe, mx, kind) {
  const whole = String(mxe || '') + String(mx || '');
  if (kind === 'tel') { const d = whole.replace(/\D/g, ''); return d.length >= 7 ? d : null; }
  return whole.trim() || null;
}

function decodeEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#0?39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;/g, ' ').trim();
}

/**
 * Parse one rendered listing page.
 * @param {{html:string, text:string, finalUrl:string}} page   renderPage() output
 * @param {string} listingUrl                                  the URL Bell asked for
 * @returns {object|null}  a scan record, or null when the page is not a listing (404 shell,
 *                         challenge page, category page) — absent, never guessed.
 */
export function parseListing(page, listingUrl) {
  const html = String(page?.html || '');
  const text = String(page?.text || '');

  // Validity: a listing page has an entry-title h1 and the details vocabulary. A Cloudflare
  // challenge, a 404 shell or a category index has neither — those return null and the caller
  // counts them, because a page Bell could not READ is not a company that disappeared.
  const h1 = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  const name = h1 ? decodeEntities(h1[1].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim() : null;
  if (!name || /just a moment|attention required|page not found/i.test(name)) return null;
  // ⚠️ A CLOUDFLARE CHALLENGE IS NOT A COMPANY. The challenge page's h1 is the bare hostname
  // ("www.qatarcid.com"), which sails past the phrase check above — the first proving run
  // emitted it as a company NAMED "www.qatarcid.com", and a blocked night would have fed 2,000
  // of those into the ingest. A real listing always carries the directory's own vocabulary;
  // a page with none of it is unreadable, not a company.
  if (/challenge-platform|cf-chl|__cf_chl/i.test(html)) return null;
  const looksLikeListing = /data-mxe="/.test(html) || /CR Number/i.test(text) || /qatarcid\.com\/listings\//i.test(html);
  if (!looksLikeListing) return null;

  // Category + sub-category from the breadcrumb links — the page's own taxonomy, not a guess.
  // Shape: /listings/<category>/ and /listings/<category>/<sub-category>/
  const crumbs = [...html.matchAll(/href="https?:\/\/www\.qatarcid\.com\/listings\/([a-z0-9-]+)\/(?:([a-z0-9-]+)\/)?"/gi)];
  const pretty = (slug) => slug ? slug.split('-').map((w) => w[0]?.toUpperCase() + w.slice(1)).join(' ') : null;
  const category = pretty(crumbs[0]?.[1] || null);
  const sub = crumbs.find((c) => c[2]);
  const sub_category = pretty(sub?.[2] || null);

  // The theatre-split contacts. Attribute order varies, so each attribute is pulled from the tag
  // independently rather than by one rigid pattern.
  const contacts = { tels: [], emails: [], urls: [] };
  for (const tag of html.matchAll(/<a\b[^>]*\bdata-mxe="[^"]*"[^>]*>/gi)) {
    const t = tag[0];
    const attr = (n) => (t.match(new RegExp(`\\b${n}="([^"]*)"`, 'i')) || [])[1];
    const kind = String(attr('data-mxt') || '').toLowerCase();
    const v = unsplit(attr('data-mxe'), attr('data-mx'), kind === 'tel' ? 'tel' : 'other');
    if (!v) continue;
    if (kind === 'tel') {
      // The icon says which number this is — fa-mobile-alt is the mobile line.
      contacts.tels.push({ value: v, mobile: /mobile/i.test(attr('data-mxi') || '') });
    } else if (kind === 'mailto') {
      if (v.includes('@') && v.includes('.')) contacts.emails.push(v);
    } else if (kind === 'url') contacts.urls.push(v);
  }

  // The details block: exact label on one line, value on the next. Fixed vocabulary only.
  const fields = {};
  const lines = text.split('\n').map((l) => l.trim());
  for (let i = 0; i < lines.length - 1; i++) {
    const label = lines[i].replace(/\s*:\s*$/, '');
    const key = DETAIL_LABELS[label];
    if (!key || fields[key]) continue;
    const value = lines[i + 1];
    // The next line must be a value, not another label or a section heading.
    if (!value || DETAIL_LABELS[value.replace(/\s*:\s*$/, '')] || /^Opening Hours$/i.test(value)) continue;
    fields[key] = value.slice(0, 300);
  }

  // The company's own website comes ONLY from the sidebar's theatre-split url entry
  // (data-mxt="url"). The first proving run scanned generic target="_blank" links as a fallback
  // and captured https://www.ashghal.gov.qa/ — a SPONSOR BANNER — as KBE Gulf's website. An ad
  // on the page is not a statement about the company; no sidebar entry means no website, and the
  // ingest's COALESCE keeps whatever Bell already holds.
  const site = contacts.urls.find((u) => /^https?:\/\//i.test(u)) || null;

  const slug = (String(listingUrl).match(/\/listing\/([^/]+)\/?/) || [])[1] || null;
  return {
    name,
    listing_url: listingUrl,
    slug,
    cr_number: fields.cr_number || null,
    qcci_membership_number: fields.qcci_membership_number || null,
    company_type: fields.company_type || null,
    category, sub_category,
    listing_type: sub_category || category || null,
    location: fields.location || null,
    address: null,                    // the header address is a plus-code/short line; the June
                                      // records carried the full street address from the same
                                      // details block only when stated — null stays null.
    po_box: fields.po_box || null,
    email: contacts.emails[0] || null,
    website: site,
    phone: fields.phone || contacts.tels.find((t) => !t.mobile)?.value || null,
    mobile: contacts.tels.find((t) => t.mobile)?.value || null,
    fax: fields.fax || null,
    contact_person: fields.contact_person || null,
    owner_name: fields.owner_name || null,
  };
}
