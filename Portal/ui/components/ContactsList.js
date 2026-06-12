// Renders the list of emails/phones/social URLs for either a company or a
// person, with add + remove + mark-primary controls. Used in both the
// CompanyDetail and PersonDetail drawers (Contact group).
//
// Props:
//   kind:      'company' | 'person'
//   refId:     parent row id (company.id or person.id)
//   contacts:  Array<{ id, type, value, value_display, source, source_url,
//                     source_label, is_primary, is_verified }>
//   onChange:  callback fired after a successful add/remove/promote so the
//              parent can refresh its data.

import { useState } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

// Map an internal source code to a short pretty label
const SOURCE_LABEL = {
  'backfill':              'Original',
  'manual':                'Manual',
  'stage2-linkedin':       'LinkedIn',
  'stage3-linkedin':       'LinkedIn',
  'stage3.5-harvestapi':   'LinkedIn',
  'stage5-gmaps':          'Google Maps',
  'stage6-website':        'Website',
  'qfc-ingest':            'QFC',
  'qfz-ingest':            'QFZ',
  'moci-ingest':           'MOCI',
  'qstp-ingest':           'QSTP',
};

const SOURCE_COLOR = {
  'Website':     { bg: '#173322', text: '#9fefb8' },
  'LinkedIn':    { bg: '#0e2a44', text: '#7ec8ff' },
  'Google Maps': { bg: '#3a2812', text: '#ffc594' },
  'Manual':      { bg: '#2b2f3d', text: '#cdd5e5' },
  'Original':    { bg: '#2b2f3d', text: '#8a93a6' },
  'QFC':         { bg: '#1c2c52', text: '#8bb0ff' },
  'QFZ':         { bg: '#2c1c52', text: '#c5a3ff' },
  'MOCI':        { bg: '#3a2812', text: '#ffc594' },
  'QSTP':        { bg: '#173322', text: '#9fefb8' },
};

function prettySource(code) {
  if (!code) return 'Manual';
  return SOURCE_LABEL[code] || code;
}

function SourceTag({ source }) {
  const label = prettySource(source);
  const c = SOURCE_COLOR[label] || { bg: '#2b2f3d', text: '#8a93a6' };
  return html`<span style=${{
    display:'inline-block', padding:'1px 6px', borderRadius:'3px',
    fontSize:'10px', fontWeight:600, letterSpacing:'.3px',
    background: c.bg, color: c.text,
  }}>${label}</span>`;
}

function ContactRow({ contact, kind, refId, onChange, readOnly = false }) {
  const remove = async () => {
    try {
      if (kind === 'company') await api.deleteCompanyContact(refId, contact.id);
      else                    await api.deletePersonContact(refId,  contact.id);
      toast('Removed');
      onChange?.();
    } catch (err) { toast('Remove failed: ' + err.message, 'error'); }
  };
  const promote = async () => {
    try {
      if (kind === 'company') await api.setCompanyContactPrimary(refId, contact.id, contact.type);
      else                    await api.setPersonContactPrimary(refId,  contact.id, contact.type);
      toast('Marked as primary');
      onChange?.();
    } catch (err) { toast('Update failed: ' + err.message, 'error'); }
  };

  const display = contact.value_display || contact.value;
  let href = null;
  if (contact.type === 'email') href = 'mailto:' + contact.value;
  if (contact.type === 'phone') href = 'tel:' + contact.value.replace(/\s+/g, '');
  if (contact.type === 'social') href = contact.value;

  return html`
    <div class="contact-row">
      <div class="contact-row-main">
        ${href
          ? html`<a href=${href} target=${contact.type==='social'?'_blank':'_self'} rel="noreferrer">${display}</a>`
          : html`<span>${display}</span>`}
        ${contact.is_primary ? html`<span class="contact-primary-pill" title="Primary">primary</span>` : null}
      </div>
      <div class="contact-row-meta">
        <${SourceTag} source=${contact.source} />
        ${contact.source_url ? html`<a href=${contact.source_url} target="_blank" rel="noreferrer" class="muted small" title=${contact.source_url}>↗</a>` : null}
        ${contact.source_label ? html`<span class="muted small">${contact.source_label}</span>` : null}
        ${!readOnly && !contact.is_primary ? html`<button class="linkbtn" onClick=${promote} title="Use this as the primary value">★</button>` : null}
        ${!readOnly ? html`<button class="linkbtn danger" onClick=${remove} title="Remove this contact">×</button>` : null}
      </div>
    </div>
  `;
}

function AddContactForm({ kind, refId, onChange }) {
  const [type, setType] = useState('email');
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e?.preventDefault?.();
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    try {
      const body = { type, value: v, source: 'manual' };
      if (label.trim()) body.source_label = label.trim();
      if (kind === 'company') await api.addCompanyContact(refId, body);
      else                    await api.addPersonContact(refId,  body);
      setValue(''); setLabel('');
      toast('Added');
      onChange?.();
    } catch (err) {
      toast('Add failed: ' + err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  return html`
    <form class="contact-add" onSubmit=${submit}>
      <select value=${type} onChange=${e => setType(e.target.value)}>
        <option value="email">Email</option>
        <option value="phone">Phone</option>
        <option value="social">Social URL</option>
      </select>
      <input
        type=${type==='email'?'email':(type==='phone'?'tel':'url')}
        placeholder=${type==='email'?'name@company.com':(type==='phone'?'+974 4444 5555':'https://…')}
        value=${value}
        onChange=${e => setValue(e.target.value)}
      />
      <input
        type="text" placeholder="Label (optional)"
        value=${label}
        onChange=${e => setLabel(e.target.value)}
        style=${{maxWidth:'140px'}}
      />
      <button type="submit" disabled=${busy || !value.trim()}>Add</button>
    </form>
  `;
}

export function ContactsList({ kind, refId, contacts, onChange, readOnly = false }) {
  const emails  = (contacts || []).filter(c => c.type === 'email');
  const phones  = (contacts || []).filter(c => c.type === 'phone');
  const socials = (contacts || []).filter(c => c.type === 'social');

  const renderGroup = (label, items) => html`
    <div class="contact-group">
      <div class="contact-group-h">${label} <span class="muted small">(${items.length})</span></div>
      ${items.length === 0
        ? html`<div class="muted small contact-group-empty">none on file</div>`
        : items.map(c => html`<${ContactRow} key=${c.id} contact=${c} kind=${kind} refId=${refId} onChange=${onChange} readOnly=${readOnly} />`)}
    </div>
  `;

  return html`
    <div class="contacts-list">
      ${renderGroup('Emails',  emails)}
      ${renderGroup('Phones',  phones)}
      ${socials.length > 0 ? renderGroup('Social',  socials) : null}
      ${!readOnly ? html`<${AddContactForm} kind=${kind} refId=${refId} onChange=${onChange} />` : null}
    </div>
  `;
}
