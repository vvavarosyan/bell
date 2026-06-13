// Inline 5-icon contact panel. Each icon highlights when the company has
// data for that channel; muted when missing. Email/Phone/LinkedIn come from
// columns; Instagram + Facebook live in extra_fields (will populate from
// future enrichment).

import { html } from '../lib/html.js';

function pickInstagram(c) {
  const ef = c.extra_fields || {};
  if (Array.isArray(c.contacts)) {
    const hit = c.contacts.find(x => x.type === 'social' && /instagram\.com/i.test(x.value));
    if (hit) return hit.value;
  }
  return ef.instagram_url || ef.social_instagram || ef.linkedin_instagram || null;
}
function pickFacebook(c) {
  const ef = c.extra_fields || {};
  if (Array.isArray(c.contacts)) {
    const hit = c.contacts.find(x => x.type === 'social' && /facebook\.com/i.test(x.value));
    if (hit) return hit.value;
  }
  return ef.facebook_url || ef.social_facebook || ef.linkedin_facebook || null;
}
// Returns the primary email for display (or first if no primary).
function pickEmail(c) {
  if (Array.isArray(c.contacts)) {
    const emails = c.contacts.filter(x => x.type === 'email');
    const primary = emails.find(x => x.is_primary);
    if (primary) return primary.value_display || primary.value;
    if (emails[0]) return emails[0].value_display || emails[0].value;
  }
  return c.email || null;
}
function pickPhone(c) {
  if (Array.isArray(c.contacts)) {
    const phones = c.contacts.filter(x => x.type === 'phone');
    const primary = phones.find(x => x.is_primary);
    if (primary) return primary.value_display || primary.value;
    if (phones[0]) return phones[0].value_display || phones[0].value;
  }
  return c.phone || null;
}
function countByType(c, type) {
  if (!Array.isArray(c.contacts)) return 0;
  return c.contacts.filter(x => x.type === type).length;
}

// SVG inline icons (16x16). Each receives a `data-on` attribute for color.
const ICONS = {
  email: html`
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="2"/>
      <path d="M3 7l9 6 9-6"/>
    </svg>
  `,
  phone: html`
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
    </svg>
  `,
  linkedin: html`
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.36V9h3.41v1.56h.05c.47-.9 1.63-1.85 3.36-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z"/>
    </svg>
  `,
  instagram: html`
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5"/>
      <circle cx="12" cy="12" r="4"/>
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor"/>
    </svg>
  `,
  facebook: html`
    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
      <path d="M22 12.06C22 6.55 17.52 2 12 2S2 6.55 2 12.06c0 4.99 3.66 9.13 8.44 9.88v-6.99H7.9v-2.89h2.54v-2.2c0-2.5 1.49-3.89 3.77-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56v1.87h2.77l-.44 2.89h-2.33V22c4.78-.75 8.44-4.89 8.44-9.94z"/>
    </svg>
  `,
  website: html`
    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="12" cy="12" r="9"/>
      <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>
    </svg>
  `,
};

// Normalize a website value to a clickable absolute URL (or null).
function websiteUrl(c) {
  const w = c.website || c.extra_fields?.website;
  if (!w) return null;
  const s = String(w).trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : 'https://' + s;
}

export function ContactIcons({ company }) {
  const email     = pickEmail(company);
  const phone     = pickPhone(company);
  const emailCt   = countByType(company, 'email') || (company.email ? 1 : 0);
  const phoneCt   = countByType(company, 'phone') || (company.phone ? 1 : 0);
  const instagram = pickInstagram(company);
  const facebook  = pickFacebook(company);
  const website   = websiteUrl(company);

  // Credit-gated channels can be "available but locked": the data exists for
  // this record, but the tenant must reveal (spend a credit) to see the value.
  const emailLocked = !email && (!!company.email_locked || emailCt > 0);
  const phoneLocked = !phone && (!!company.phone_locked || phoneCt > 0);

  const items = [
    { key: 'website',   label: 'Website',   href: website,
      has: !!website, count: 0, tooltipExtra: website },
    { key: 'email',     label: 'Email',     href: email ? 'mailto:' + email : null,
      has: !!email || emailLocked, locked: emailLocked, count: emailCt, tooltipExtra: email },
    { key: 'phone',     label: 'Phone',     href: phone ? 'tel:' + String(phone).replace(/\s+/g, '') : null,
      has: !!phone || phoneLocked, locked: phoneLocked, count: phoneCt, tooltipExtra: phone },
    { key: 'linkedin',  label: 'LinkedIn',  href: company.linkedin_url || null,
      has: !!company.linkedin_url, count: 0, tooltipExtra: company.linkedin_url },
    { key: 'instagram', label: 'Instagram', href: instagram,
      has: !!instagram, count: 0, tooltipExtra: instagram },
    { key: 'facebook',  label: 'Facebook',  href: facebook,
      has: !!facebook, count: 0, tooltipExtra: facebook },
  ];
  return html`<span class="contact-icons">
    ${items.map(it => {
      const icon = ICONS[it.key];
      const cls = 'contact-icon ' + (it.has ? 'on' : 'off') + (it.locked ? ' locked' : '');
      const title = it.locked
        ? `${it.label} available — reveal to view`
        : it.has
          ? `${it.label}${it.count > 1 ? ` (${it.count})` : ''}: ${it.tooltipExtra || ''}`
          : `${it.label}: not available`;
      const badge = it.count > 1 ? html`<span class="contact-count">${it.count}</span>` : null;
      if (it.has && it.href && !it.locked) {
        return html`<a class=${cls} href=${it.href} target=${it.key==='email'||it.key==='phone'?'_self':'_blank'} rel="noreferrer" title=${title} onClick=${e => e.stopPropagation()}>${icon}${badge}</a>`;
      }
      return html`<span class=${cls} title=${title}>${icon}</span>`;
    })}
  </span>`;
}
