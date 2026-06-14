// Persistent side detail panel for People — mirrors CompanyDetail's layout.
// Two tabs: Profile, Companies (work history + current link to source orgs).

import { useState, useEffect } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { navigateTo } from '../lib/router.js';
import { ContactsList } from './ContactsList.js';
import { EditableKv } from './EditableKv.js';

const PERSON_FIELD_META = {
  pin:                 { editable: false },
  linkedin_url:        { type: 'url' },
  profile_picture_url: { type: 'url' },
  is_revealed:         { editable: false, type: 'boolean' },
  revealed_at:         { editable: false, type: 'date' },
  created_at:          { editable: false, type: 'date' },
  updated_at:          { editable: false, type: 'date' },
  assembled_at:        { editable: false, type: 'date' },
};

const PROFILE_GROUPS = [
  {
    label: 'Identity',
    fields: [
      ['pin', 'PIN'],
      ['full_name', 'Full name'],
      ['first_name', 'First name'],
      ['last_name', 'Last name'],
      ['headline', 'Headline'],
    ],
  },
  {
    label: 'Contact',
    fields: [
      ['linkedin_url', 'LinkedIn URL'],
      ['linkedin_public_id', 'LinkedIn public ID'],
    ],
    // Note: emails + phones now live in their own multi-row Contacts panel
    // rendered separately, below this group.
  },
  {
    label: 'Location',
    fields: [
      ['location_text', 'Location'],
      ['country', 'Country'],
      ['city', 'City'],
    ],
  },
  {
    label: 'Bio',
    fields: [
      ['summary', 'Summary'],
    ],
  },
  {
    label: 'Bookkeeping',
    fields: [
      ['created_at', 'Created at'],
      ['updated_at', 'Updated at'],
      ['assembled_at', 'PIN assigned at'],
    ],
  },
];

function logoCircle(person, size = 44) {
  const url = person?.profile_picture_url;
  const initial = (person?.full_name || '?').trim().charAt(0).toUpperCase() || '?';
  let h = 0;
  for (const ch of String(person?.full_name || '')) h = (h * 31 + ch.charCodeAt(0)) | 0;
  const hue = Math.abs(h) % 360;
  if (url) {
    return html`<img src=${url} class="company-logo" style=${{width:size+'px',height:size+'px'}} alt="photo" loading="lazy" referrerpolicy="no-referrer" onError=${(e) => { e.currentTarget.style.display = 'none'; }} />`;
  }
  return html`<span class="company-logo placeholder"
    style=${{width:size+'px', height:size+'px', background:`hsl(${hue}, 45%, 35%)`, fontSize:Math.round(size*0.5)+'px'}}
  >${initial}</span>`;
}

export function PersonDetail({ personId, onMutated, isUser = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('profile');

  const reload = async () => {
    if (!personId) return;
    try {
      const r = await api.person(personId);
      setData(r);
    } catch (err) { toast('Reload failed: ' + err.message, 'error'); }
  };

  useEffect(() => {
    if (!personId) { setData(null); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await api.person(personId);
        if (!cancelled) setData(r);
      } catch (err) {
        if (!cancelled) toast('Load failed: ' + err.message, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [personId]);

  if (!personId) {
    return html`
      <aside class="detail-side empty-state">
        <div class="muted small">Select a person on the left to load the dossier here.</div>
      </aside>
    `;
  }
  if (loading || !data) {
    return html`<aside class="detail-side"><div class="empty">Loading person dossier…</div></aside>`;
  }

  const p = data.person;
  const companies = data.companies || [];
  const needsReveal = isUser && p.revealed_by_tenant === false;

  const revealContacts = async () => {
    try {
      await api.revealPerson(p.id);
      window.dispatchEvent(new Event('bdi:credits-changed'));
      toast('Contact details revealed');
      reload();
      onMutated?.();
    } catch (err) {
      toast(/insufficient/i.test(err.message) ? 'Not enough credits to reveal' : 'Reveal failed: ' + err.message, 'error');
    }
  };

  return html`
    <aside class="detail-side">
      <div class="detail-head">
        ${logoCircle(p, 44)}
        <div class="detail-title">
          <span class="bin">${p.pin || '— (unassembled)'}</span>
          <strong>${p.full_name}</strong>
          <div class="detail-status-row">
            ${p.headline ? html`<span class="muted small">${p.headline}</span>` : null}
            ${p.archived ? html`<span class="pill" style=${{borderColor:'var(--amber)',color:'var(--amber)'}}>archived</span>` : null}
          </div>
        </div>
        ${!isUser ? html`<button
          class="linkbtn"
          style=${{alignSelf:'flex-start', padding:'4px 10px', borderRadius:'5px',
                  background: p.archived ? 'var(--bg-elev-2)' : 'transparent',
                  border:'1px solid var(--border)', color:'var(--text-muted)', fontSize:'11px'}}
          title=${p.archived ? 'Unarchive this person' : 'Archive this person'}
          onClick=${async () => {
            try {
              await api.archivePerson(p.id, !p.archived);
              toast(p.archived ? 'Unarchived' : 'Archived');
              reload(); onMutated?.();
            } catch (err) { toast(err.message, 'error'); }
          }}
        >${p.archived ? 'Unarchive' : 'Archive'}</button>` : null}
      </div>

      <div class="detail-tabs">
        <button class=${tab==='profile'?'active':''}   onClick=${()=>setTab('profile')}>Profile</button>
        <button class=${tab==='companies'?'active':''} onClick=${()=>setTab('companies')}>Companies (${companies.length})</button>
        <button class=${tab==='experience'?'active':''}onClick=${()=>setTab('experience')}>Career</button>
      </div>

      <div class="detail-body">
        ${tab === 'profile'    ? html`<${ProfileTab}    person=${p} contacts=${data.contacts || []} onReload=${reload} needsReveal=${needsReveal} onReveal=${revealContacts} isUser=${isUser} />` : null}
        ${tab === 'companies'  ? html`<${CompaniesView} companies=${companies} />` : null}
        ${tab === 'experience' ? html`<${ExperienceView} person=${p} />` : null}
      </div>
    </aside>
  `;
}

function ProfileTab({ person, contacts, onReload, needsReveal = false, onReveal, isUser = false }) {
  const saveField = async (field, value) => {
    try {
      await api.updatePerson(person.id, { [field]: value });
      toast('Saved');
      onReload?.();
    } catch (err) { toast('Save failed: ' + err.message, 'error'); throw err; }
  };

  return html`
    <div class="overview">
      ${PROFILE_GROUPS.map(g => html`
        <section class="group" key=${g.label}>
          <h3>${g.label}</h3>
          <dl>
            ${g.fields.map(([k, lbl]) => {
              const meta = PERSON_FIELD_META[k] || {};
              return html`<${EditableKv}
                key=${k}
                label=${lbl}
                field=${k}
                value=${person[k]}
                type=${meta.type || 'text'}
                editable=${meta.editable !== false && !isUser}
                onSave=${saveField}
              />`;
            })}
          </dl>
          ${g.label === 'Contact' && needsReveal ? html`
            <div class="reveal-banner">
              <span>🔒 Email & phone are hidden. Reveal to view this person's contact details.</span>
              <button class="reveal-btn" onClick=${onReveal}>Reveal · 1 credit</button>
            </div>
          ` : null}
          ${g.label === 'Contact' && !needsReveal ? html`
            <div style=${{marginTop:'10px'}}>
              <${ContactsList} kind="person" refId=${person.id} contacts=${contacts} onChange=${onReload} />
            </div>
          ` : null}
        </section>
      `)}
      ${person.skills && person.skills.length > 0 ? html`
        <section class="group" key="skills">
          <h3>Skills</h3>
          <div class="muted small" style=${{display:'flex', flexWrap:'wrap', gap:'4px'}}>
            ${person.skills.map((s, i) => html`<span class="pill" key=${i}>${typeof s === 'string' ? s : (s?.name || JSON.stringify(s))}</span>`)}
          </div>
        </section>
      ` : null}
      ${person.languages && person.languages.length > 0 ? html`
        <section class="group" key="languages">
          <h3>Languages</h3>
          <div class="muted small">${person.languages.map(l => typeof l === 'string' ? l : (l?.name || '')).filter(Boolean).join(' · ')}</div>
        </section>
      ` : null}
      ${person.certifications && person.certifications.length > 0 ? html`
        <section class="group" key="certifications">
          <h3>Certifications (${person.certifications.length})</h3>
          ${person.certifications.map((cert, i) => html`
            <div class="kv-block" key=${i} style=${{paddingBottom:'6px'}}>
              <div><strong>${cert.name || cert.title || cert.certificationName || '—'}</strong></div>
              ${cert.authority || cert.issuingOrganization || cert.issuer ? html`
                <div class="muted small">${cert.authority || cert.issuingOrganization || cert.issuer}</div>
              ` : null}
              ${cert.issuedAt || cert.startDate || cert.licenseNumber ? html`
                <div class="muted small">
                  ${cert.issuedAt?.text || cert.startDate?.text || cert.issuedAt || cert.startDate || ''}
                  ${cert.licenseNumber ? ' · #' + cert.licenseNumber : ''}
                </div>
              ` : null}
              ${cert.url || cert.credentialUrl ? html`
                <div class="small"><a href=${cert.url || cert.credentialUrl} target="_blank" rel="noreferrer">view credential ↗</a></div>
              ` : null}
            </div>
          `)}
        </section>
      ` : null}
    </div>
  `;
}

function CompaniesView({ companies }) {
  if (!companies || companies.length === 0) {
    return html`<div class="empty">No company links yet.</div>`;
  }
  const current = companies.filter(c => c.is_current);
  const past    = companies.filter(c => !c.is_current);
  const openCompany = (companyId) => { navigateTo('companies', companyId); };

  const renderRow = (c) => html`
    <tr key=${c.id} class="person-row" onClick=${() => openCompany(c.company_id)} title="Open this company in the Companies tab">
      <td class="person-name">${c.company_name}</td>
      <td class="person-title">${c.title || '—'}</td>
      <td>${c.seniority_level || '—'}</td>
    </tr>
  `;

  return html`
    <div class="overview">
      ${current.length > 0 ? html`
        <section class="group" key="current">
          <h3>Current (${current.length})</h3>
          <table class="grid org-grid" style=${{margin:0}}>
            <colgroup><col/><col style=${{width:'40%'}}/><col style=${{width:'20%'}}/></colgroup>
            <thead><tr><th>Company</th><th>Title</th><th>Level</th></tr></thead>
            <tbody>${current.map(renderRow)}</tbody>
          </table>
        </section>
      ` : null}
      ${past.length > 0 ? html`
        <section class="group" key="past">
          <h3>Past (${past.length})</h3>
          <table class="grid org-grid" style=${{margin:0}}>
            <colgroup><col/><col style=${{width:'40%'}}/><col style=${{width:'20%'}}/></colgroup>
            <thead><tr><th>Company</th><th>Title</th><th>Level</th></tr></thead>
            <tbody>${past.map(renderRow)}</tbody>
          </table>
        </section>
      ` : null}
    </div>
  `;
}

function ExperienceView({ person }) {
  const exp = Array.isArray(person.experience) ? person.experience : [];
  const edu = Array.isArray(person.education)  ? person.education  : [];
  if (exp.length === 0 && edu.length === 0) {
    return html`<div class="empty">No work history or education recorded yet.</div>`;
  }
  return html`
    <div class="overview">
      ${exp.length > 0 ? html`
        <section class="group" key="exp">
          <h3>Work history</h3>
          ${exp.map((e, i) => html`
            <div class="kv-block" key=${i}>
              <div><strong>${e.position || e.title || '—'}</strong> <span class="muted">@ ${e.companyName || e.company?.name || '—'}</span></div>
              ${e.location ? html`<div class="muted small">${e.location}</div>` : null}
              ${(e.startDate || e.endDate) ? html`<div class="muted small">${e.startDate?.text || ''} — ${e.endDate?.text || 'Present'}</div>` : null}
              ${e.description ? html`<div class="small" style=${{marginTop:'4px'}}>${e.description}</div>` : null}
            </div>
          `)}
        </section>
      ` : null}
      ${edu.length > 0 ? html`
        <section class="group" key="edu">
          <h3>Education</h3>
          ${edu.map((e, i) => html`
            <div class="kv-block" key=${i}>
              <div><strong>${e.schoolName || '—'}</strong></div>
              <div class="muted small">${e.degree || ''} ${e.fieldOfStudy ? ' · ' + e.fieldOfStudy : ''}</div>
              ${(e.startDate || e.endDate) ? html`<div class="muted small">${e.startDate?.text || ''} — ${e.endDate?.text || ''}</div>` : null}
            </div>
          `)}
        </section>
      ` : null}
    </div>
  `;
}

function renderValue(v) {
  if (v === null || v === undefined) return html`<span class="muted">—</span>`;
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number')  return v.toLocaleString();
  if (typeof v === 'string') {
    if (/^https?:\/\//.test(v)) return html`<a href=${v} target="_blank" rel="noreferrer">${v}</a>`;
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) { try { return new Date(v).toLocaleString(); } catch { return v; } }
    return v;
  }
  if (Array.isArray(v)) return html`<pre style=${{margin:0}}>${JSON.stringify(v, null, 2)}</pre>`;
  if (typeof v === 'object') return html`<pre style=${{margin:0}}>${JSON.stringify(v, null, 2)}</pre>`;
  return String(v);
}
