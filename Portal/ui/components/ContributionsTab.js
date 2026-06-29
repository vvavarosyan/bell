// Contributions — admin curation (Import Phase 2). Grouped, record-first:
//   • New entities — one card per company/person a user added/imported, with its
//     details underneath → Promote (add to Bell / link) or Reject the whole record.
//   • Datapoints   — fields users added to EXISTING Bell records, grouped under
//     the record they belong to, each promotable/rejectable.
// Person promotion is lawyer-gated. Reads prod data on the admin deployment.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const FIELD_LABELS = { phone: 'Phone', email: 'Email', website: 'Website', address: 'Address', social: 'Social', name: 'Name', title: 'Title', note: 'Note', custom: 'Custom' };
const PILL = { color: 'var(--amber)', borderColor: 'var(--amber)' };

export function ContributionsTab() {
  const [view, setView] = useState('entities');     // 'entities' | 'datapoints'
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [peopleEnabled, setPeopleEnabled] = useState(false);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = view === 'entities'
        ? await api.newEntityProposals({ status: status === 'pending' ? 'pending_review' : status })
        : await api.contributions({ status });
      setRows(r.rows || []); setCounts(r.counts || {}); setPeopleEnabled(!!r.people_enabled);
    } catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, [view, status]);
  useEffect(() => { load(); }, [load]);

  const decide = async (id, action) => {
    setBusy(prev => new Set(prev).add(id));
    try {
      if (view === 'entities') await (action === 'promote' ? api.promoteNewEntity(id) : api.rejectNewEntity(id));
      else await (action === 'promote' ? api.promoteContribution(id) : api.rejectContribution(id));
      toast(action === 'promote' ? 'Added to Bell' : 'Rejected');
      setRows(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      toast(err.message.includes('person_gated') ? 'Person data is lawyer-gated — enable it in settings first.' : 'Failed: ' + err.message, 'error');
    } finally { setBusy(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  };

  const togglePeopleGate = async () => {
    if (!peopleEnabled && !window.confirm('Enable adding PERSON records into Bell\'s shared database?\n\nOnly turn this on once your lawyer has cleared person data under Qatar PDPPL. Company data is unaffected.')) return;
    try { const r = await api.setPeopleGate(!peopleEnabled); setPeopleEnabled(!!r.people_enabled); }
    catch (err) { toast('Failed: ' + err.message, 'error'); }
  };

  // Group datapoints under the record they belong to.
  const groups = view === 'datapoints'
    ? Object.values(rows.reduce((acc, r) => {
        const key = `${r.entity_type}:${r.entity_id}`;
        (acc[key] = acc[key] || { key, entity_type: r.entity_type, entity_id: r.entity_id, name: r.entity_type === 'company' ? r.company_name : r.person_name, contributor: r.contributor_name, items: [] }).items.push(r);
        return acc;
      }, {}))
    : [];

  const dpDetail = (r) => html`
    <div style=${{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '5px 0', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <span style=${{ color: 'var(--text-muted)', minWidth: '90px' }}>${FIELD_LABELS[r.field] || r.field}${r.label ? ` · ${r.label}` : ''}</span>
      <span style=${{ color: 'var(--text)', flex: 1, wordBreak: 'break-word' }}>${r.value}</span>
      ${r.validation && r.validation.ok === false ? html`<span title=${r.validation.reason} style=${{ color: 'var(--amber)' }}>⚠</span>` : null}
      <button class="accent" disabled=${busy.has(r.id) || (r.entity_type === 'person' && !peopleEnabled)} onClick=${() => decide(r.id, 'promote')}
        style=${{ fontSize: '11px', padding: '3px 9px' }}>Add</button>
      <button class="ghost" disabled=${busy.has(r.id)} onClick=${() => decide(r.id, 'reject')} style=${{ fontSize: '11px', padding: '3px 9px' }}>Reject</button>
    </div>`;

  return html`
    <div class="dr-shell">
      <div class="grid-toolbar">
        <strong>Contributions</strong>
        <div style=${{ display: 'inline-flex', gap: '4px' }}>
          ${[['entities', 'New companies / people'], ['datapoints', 'Added details']].map(([k, lbl]) => html`
            <button key=${k} class=${'toolbar-toggle' + (view === k ? ' accent' : '')} onClick=${() => { setView(k); setStatus('pending'); }}>${lbl}</button>`)}
        </div>
        <span class="muted small">${counts.pending || 0} pending</span>
        <select value=${status} onChange=${e => setStatus(e.target.value)}>
          <option value="pending">Pending</option><option value="promoted">Approved</option>
          <option value="rejected">Rejected</option><option value="all">All</option>
        </select>
        <span class="spacer"></span>
        <button onClick=${load}>Refresh</button>
      </div>

      <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11.5px', color: peopleEnabled ? 'var(--green)' : 'var(--amber)', background: peopleEnabled ? 'rgba(111,207,151,0.08)' : 'rgba(255,196,99,0.08)', border: '1px solid ' + (peopleEnabled ? 'rgba(111,207,151,0.3)' : 'rgba(255,196,99,0.3)'), borderRadius: '8px', padding: '8px 12px', margin: '0 0 12px' }}>
        <span style=${{ flex: 1 }}>Adding <strong>person</strong> records to Bell is currently <strong>${peopleEnabled ? 'ON' : 'OFF (lawyer-gated)'}</strong>. ${peopleEnabled ? '' : 'Company data is always free to add. Only enable person data once your lawyer has cleared it (Qatar PDPPL).'}</span>
        <button class=${peopleEnabled ? 'ghost' : 'accent'} onClick=${togglePeopleGate}>${peopleEnabled ? 'Turn off' : 'Enable person data'}</button>
      </div>`}

      ${loading ? html`<div class="empty">Loading…</div>`
        : (rows.length === 0
          ? html`<div class="empty">No ${status === 'all' ? '' : status} ${view === 'entities' ? 'new records' : 'added details'}.</div>`

          : view === 'entities'
            ? html`<div class="dr-list" style=${{ overflowY: 'auto', maxHeight: 'calc(100vh - 240px)', paddingBottom: '40px' }}>
                ${rows.map(r => {
                  const isPerson = r.kind !== 'company';
                  const gated = isPerson && !peopleEnabled;
                  const pending = r.enrich_status === 'pending_review';
                  const details = [['Company', r.company_name], ['Email', r.email], ['Phone', r.phone], ['Website', r.website], ['City', r.city], ['Title', r.title]].filter(([, v]) => v);
                  return html`
                  <div class="dr-card" key=${r.id}>
                    <div class="dr-card-head">
                      <div>
                        <strong>${isPerson ? '👤' : '🏢'} ${r.name}</strong>
                        <span class="muted small" style=${{ marginLeft: '6px' }}>new ${isPerson ? 'person' : 'company'}</span>
                        <div class="muted small">from ${r.contributor_name || ('tenant ' + r.tenant_id)} · ${new Date(r.created_at).toLocaleString()}</div>
                      </div>
                      <span class="request-pill" style=${PILL}>${(r.enrich_status || '').replace('_review', '')}</span>
                    </div>
                    ${details.length ? html`<div style=${{ margin: '6px 0' }}>
                      ${details.map(([k, v]) => html`<div style=${{ display: 'flex', gap: '8px', fontSize: '12px', padding: '3px 0' }}>
                        <span style=${{ color: 'var(--text-muted)', minWidth: '70px' }}>${k}</span><span style=${{ color: 'var(--text)' }}>${v}</span></div>`)}
                    </div>` : null}
                    ${pending ? html`<div class="dr-actions">
                      <button class="accent" disabled=${busy.has(r.id) || gated} title=${gated ? 'Lawyer-gated' : 'Add this record to Bell'} onClick=${() => decide(r.id, 'promote')}>Add to Bell</button>
                      <button class="ghost" disabled=${busy.has(r.id)} onClick=${() => decide(r.id, 'reject')}>Reject</button>
                    </div>` : null}
                  </div>`;
                })}
              </div>`

            : html`<div class="dr-list" style=${{ overflowY: 'auto', maxHeight: 'calc(100vh - 240px)', paddingBottom: '40px' }}>
                ${groups.map(g => html`
                  <div class="dr-card" key=${g.key}>
                    <div class="dr-card-head">
                      <div>
                        <strong>${g.entity_type === 'company' ? '🏢' : '👤'} ${g.name || (g.entity_type + ' #' + g.entity_id)}</strong>
                        <span class="muted small" style=${{ marginLeft: '6px' }}>${g.items.length} added detail${g.items.length === 1 ? '' : 's'}</span>
                        <div class="muted small">from ${g.contributor || '—'}</div>
                      </div>
                    </div>
                    ${g.items.map(dpDetail)}
                  </div>`)}
              </div>`)}
    </div>
  `;
}
