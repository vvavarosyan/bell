'use strict';
/**
 * Qatar Chamber listing parser — shared by the Firecrawl harvester (now) and the
 * future local proxy scraper. Turns one listing page's markdown (or rendered
 * page text) into a clean company record.
 *
 * The listing pages render their detail as plain "Label : Value" lines plus a
 * breadcrumb (Home > Category > Sub-category > Company) and a description, e.g.:
 *
 *   # Huawei Technologies LLC
 *   Listing Type : Communication Equipments
 *   QCCI Membership Number : 65-485
 *   CR Number : 00090275
 *   Company Type : private
 *   Address : 11th Floor, Burj Al Gassar ...
 *   PO Box : PO BOX 20968
 *   Email : [mohamed.saber@huawei.com](mailto:mohamed.saber@huawei.com)
 *   Website : [www.huawei.com](http://www.huawei.com/)
 *   Contact Person Mobile : 0097455485640
 *   Contact Person : Mohamed Saber
 *   Owner Name : Huawei Technologies Cooperatief U.A
 */

const nz = (v) => { const s = (v === null || v === undefined) ? '' : String(v).trim(); return s === '' ? null : s; };

function slugFromUrl(url) {
  const m = String(url || '').match(/\/listing\/([^/?#]+)/);
  return m ? m[1] : null;
}

// Pull a clean value out of a markdown value.
//  - mailto links → the email address
//  - other [text](url) links → the readable text (e.g. "Communication
//    Equipments", "www.huawei.com") rather than the raw URL
function cleanValue(raw) {
  let v = String(raw).trim();
  const mail = v.match(/\[[^\]]*\]\(mailto:([^)]+)\)/i);
  if (mail) return mail[1].trim();
  // resolve [text](url) → text
  v = v.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  // strip leftover markdown emphasis
  v = v.replace(/[*_`]/g, '').trim();
  return v;
}

/** Parse one listing page. Returns a company record or null if no name. */
function parseListing(markdown, url) {
  if (!markdown) return null;
  const rawLines = String(markdown).split('\n');
  const lines = rawLines.map((l) => l.trim());

  // --- breadcrumb (category / sub-category) ---
  const crumbs = [];
  for (const l of lines) {
    const m = l.match(/^-\s*\[([^\]]+)\]\((https:\/\/www\.qatarcid\.com\/listings?\/[^)\s]+)/i);
    if (m) crumbs.push({ label: m[1].trim(), url: m[2] });
    if (crumbs.length && !m && l !== '') {
      // breadcrumb block is contiguous at the top; stop once it ends
      if (!/^-\s*\[/.test(l)) break;
    }
  }
  // crumbs typically: [Home, Category, Sub-category, CompanyName]
  let category = null, sub_category = null;
  const nonHome = crumbs.filter((c) => !/qatarcid\.com\/?$/.test(c.url) && c.label.toLowerCase() !== 'home');
  if (nonHome.length >= 1) category = nonHome[0].label;
  if (nonHome.length >= 2) sub_category = nonHome[1].label;

  // --- title ---
  const titleLine = lines.find((l) => /^#\s+\S/.test(l));
  const name = titleLine ? titleLine.replace(/^#+\s*/, '').trim() : null;
  if (!name) return null;

  // --- Label : Value pairs ---
  const fields = {};
  for (const l of lines) {
    // Label = letters/spaces/.()/' up to ~45 chars, then " : ", then value.
    const m = l.match(/^([A-Za-z][A-Za-z .\/()'&-]{1,44}?)\s*:\s*(.+)$/);
    if (!m) continue;
    const key = m[1].trim();
    const val = cleanValue(m[2]);
    if (val && !(key in fields)) fields[key] = val;
  }
  const f = (k) => nz(fields[k]);

  // --- opening hours: a "Opening Hours" header followed by "- Day :time" lines ---
  let opening_hours = null;
  const ohIdx = lines.findIndex((l) => /^opening hours\b/i.test(l.replace(/[*_#]/g, '').trim()));
  if (ohIdx !== -1) {
    const oh = {};
    for (let i = ohIdx + 1; i < lines.length; i++) {
      const m = lines[i].match(/^-\s*([A-Za-z]+)\s*:\s*(.+)$/);
      if (!m) { if (lines[i] === '') continue; else break; }
      oh[m[1].trim()] = m[2].trim();
    }
    if (Object.keys(oh).length) opening_hours = oh;
  }

  // --- catch-all: keep EVERY label:value we found, so no detail is ever lost ---
  const MAPPED = new Set([
    'CR Number', 'QCCI Membership Number', 'Company Type', 'Address', 'PO Box',
    'Email', 'Website', 'Phone', 'Telephone', 'Mobile', 'Contact Person Mobile',
    'Fax', 'Contact Person', 'Owner Name', 'Listing Type', 'Location',
  ]);
  const other_details = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!MAPPED.has(k)) other_details[k] = v;
  }

  // --- description: longest prose paragraph(s) that aren't lists/links/labels ---
  let description = null;
  const proseCandidates = lines.filter((l) =>
    l.split(/\s+/).filter(Boolean).length >= 8 &&   // a real sentence (any length)
    !/^[#\-*!>]/.test(l) &&
    !/^\[/.test(l) &&
    !/\]\(/.test(l) &&
    !/^[A-Za-z][A-Za-z .\/()'&-]{1,44}?\s*:\s/.test(l));
  if (proseCandidates.length) {
    description = proseCandidates.join(' ')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')   // [text](url) → text
      .replace(/[*_`]/g, '')                       // drop emphasis
      .replace(/\s+/g, ' ').trim();
  }

  return {
    name,
    listing_url: nz(url) || null,
    slug: slugFromUrl(url),
    cr_number: f('CR Number'),
    qcci_membership_number: f('QCCI Membership Number'),
    company_type: f('Company Type'),
    category,
    sub_category: sub_category || f('Listing Type'),
    listing_type: f('Listing Type'),
    location: f('Location'),
    address: f('Address'),
    po_box: f('PO Box'),
    email: f('Email'),
    website: f('Website'),
    phone: f('Phone') || f('Telephone'),
    mobile: f('Mobile') || f('Contact Person Mobile'),
    fax: f('Fax'),
    contact_person: f('Contact Person'),
    owner_name: f('Owner Name'),
    opening_hours,
    other_details: Object.keys(other_details).length ? other_details : null,
    all_fields: fields,   // EVERY Label:Value found on the page (completeness backstop)
    description,
  };
}

module.exports = { parseListing, slugFromUrl, cleanValue };
