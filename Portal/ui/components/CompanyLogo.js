// Small logo cell. Tries, in order: the LinkedIn/QSTP logo, then a
// domain-based logo (Clearbit), then the domain favicon (Google) — each falls
// through to the next if it fails to load (LinkedIn CDN URLs expire over time).
// Final fallback: a colored circle with the company's first letter.

import { html } from '../lib/html.js';
import { useState, useEffect } from 'react';

function domainOf(company) {
  const w = company?.website || company?.extra_fields?.website;
  if (!w) return null;
  try { return new URL(/^https?:\/\//i.test(w) ? w : 'https://' + w).hostname.replace(/^www\./, ''); }
  catch { return null; }
}

function candidates(company) {
  const out = [];
  const primary = company?.linkedin_logo_url || company?.extra_fields?.qstp_logo_url;
  if (primary) out.push(primary);
  const dom = domainOf(company);
  if (dom) {
    out.push('https://logo.clearbit.com/' + dom);
    out.push('https://www.google.com/s2/favicons?sz=64&domain=' + dom);
  }
  return out;
}

function hueFor(name) {
  let h = 0;
  for (const ch of String(name || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h) % 360;
}

export function CompanyLogo({ company, size = 24 }) {
  const urls = candidates(company);
  const [idx, setIdx] = useState(0);
  // Reset to the first candidate whenever the company changes.
  useEffect(() => { setIdx(0); }, [company?.id, urls[0]]);

  const url = urls[idx];
  if (url) {
    return html`<img
      src=${url}
      class="company-logo"
      alt="logo"
      style=${{ width: size + 'px', height: size + 'px' }}
      onError=${() => setIdx(i => i + 1)}
      loading="lazy"
      referrerpolicy="no-referrer"
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
