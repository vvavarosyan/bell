// Small logo cell — uses linkedin_logo_url or extra_fields.qstp_logo_url,
// otherwise renders a colored circle with the company's first letter.

import { html } from '../lib/html.js';
import { useState } from 'react';

function logoUrl(company) {
  return company?.linkedin_logo_url
      || company?.extra_fields?.qstp_logo_url
      || null;
}

// Deterministic hue from company name so each company keeps the same color.
function hueFor(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % 360;
}

export function CompanyLogo({ company, size = 24 }) {
  const url = logoUrl(company);
  const [broken, setBroken] = useState(false);

  if (url && !broken) {
    return html`<img
      src=${url}
      class="company-logo"
      alt="logo"
      style=${{ width: size + 'px', height: size + 'px' }}
      onError=${() => setBroken(true)}
      loading="lazy"
    />`;
  }
  const initial = (company?.name || '?').trim().charAt(0).toUpperCase() || '?';
  const hue = hueFor(company?.name);
  return html`<span
    class="company-logo placeholder"
    style=${{
      width: size + 'px',
      height: size + 'px',
      background: `hsl(${hue}, 45%, 35%)`,
      fontSize: Math.round(size * 0.5) + 'px',
    }}
    title=${company?.name || ''}
  >${initial}</span>`;
}
