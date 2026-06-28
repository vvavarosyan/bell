// Contributions — admin curation surface (Import Phase 2, Layer 2). Two views:
//   • Datapoints   — user-added fields on records → promote into canonical / reject
//   • New entities — companies/people Bell doesn't have → promote (link-or-create) / reject
// Junk-flagged rows surface last; person promotion is lawyer-gated. Local only.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const FIELD_LABELS = { phone: 'Phone', email: 'Email', website: 'Website', address: 'Address', social: 'Social', name: 'Name', title: 'Title', note: 'Note', custom: 'Custom' };
const STATUS_COLOR = { pending: 'var(--amber)', pending_review: 'var(--amber)', promoted: 'var(--green)', rejected: 'var(--red)' };

export function ContributionsTab() {
  const [view, setView] = useState('datapoints');     // 'datapoints' | 'entities'
  const [rows, setRows] = useState([]);
  const [counts, setCounts] = useState({});
  const [peopleEnabled, setPeopleEnabled] = useState(false);
  const [status, setStatus] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (view === 'entities') {
        const r = await api.newEntityProposals({ status: status === 'pending' ? 'pending_review' : status });
        setRows(r.rows || []); setCounts(r.counts || {}); setPeopleEnabled(!!r.people_enabled);
      } else {
        const r = await api.contributions({ status });
        setRows(r.rows || []); setCounts(r.counts || {}); setPeopleEnabled(!!r.people_enabled);
      }
    } catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, [view, status]);
  useEffect(() => { load(); }, [load]);

  const decide = async (id, action) => {
    setBusy(prev => new Set(prev).add(id));
    try {
      if (view === 'entities') await (action === 'promote' ? api.promoteNewEntity(id) : api.rejectNewEntity(id));
      else await (action === 'promote' ? api.promoteContribution(id) : api.rejectContribution(id));
      toast(action === 'promote' ? 'Promoted into Bell' : 'Rejected');
      setRows(prev => prev.filter(r => r.id !== id));
      setCounts(c => ({ ...c, pending: Math.max(0, (c.pending || 1) - 1) }));
    } catch (err) {
      toast(err.message.includes('person_gated') ? 'Person data is lawyer-gated — enable it in settings first.' : 'Failed: ' + err.message, 'error');
    } finally { setBusy(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  };

  const dpTarget = (r) => r.entity_type === 'company' ? (r.company_name || `Company #${r.entity_id}`) : (r.person_name || `Person #${r.entity_id}`);

  return html`
    <div class="dr-shell">
      <div class="grid-toolbar">
        <strong>Contributions</strong>
        <div style=${{ display: 'inline-flex', gap: '4px' }}>
          ${[['datapoints', 'Datapoints'], ['entities', 'New entities']].map(([k, lbl]) => html`
            <button key=${k} class=${'toolbar-toggle' + (view === k ? ' accent' : '')} onClick=${() => { setView(k); setStatus('pending'); }}>${lbl}</button>`)}
        </div>
        <span class="muted small">${counts.pending || 0} pending${counts.pending_flagged ? ` · ${counts.pending_flagged} flagged` : ''}</span>
        <select value=${status} onChange=${e => setStatus(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="promoted">Promoted</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
        <span class="spacer"></span>
        <button onClick=${load}>Refresh</button>
      </div>

      ${!peopleEnabled ? html`<div style=${{ fontSize: '11.5px', color: 'var(--amber)', background: 'rgba(255,196,99,0.08)', border: '1px solid rgba(255,196,99,0.3)', borderRadius: '8px', padding: '8px 12px', margin: '0 0 12px' }}>
        Person data is <strong>lawyer-gated</strong> — reviewable but not promotable into Bell until you enable person enrichment (setting <code>enrich_people_enabled</code>) after counsel signs off. Company data promotes freely.
      </div>` : null}

      ${loading
        ? html`<div class="empty">Loading…</div>`
        : (rows.length === 0
          ? html`<div class="empty">No ${status === 'all' ? '' : status} ${view === 'entities' ? 'new entities' : 'contributions'}.</div>`
          : html`<div class="dr-list">
              ${rows.map(r => {
                const isPerson = view === 'entities' ? (r.kind !== 'company') : (r.entity_type === 'person');
                const gated = isPerson && !peopleEnabled;
                const pending = view === 'entities' ? (r.enrich_status === 'pending_review') : (r.status === 'pending');
                const flagged = view === 'datapoints' && r.validation && r.validation.ok === false;
                return html`
                <div class="dr-card" key=${r.id}>
                  <div class="dr-card-head">
                    <div>
                      ${view === 'entities'
                        ? html`<strong>${r.kind === 'company' ? '🏢' : '👤'} ${r.name}</strong>
                            <div class="muted small">
                              ${[r.company_name, r.email, r.phone, r.website, r.city].filter(Boolean).join(' · ') || '—'}
                            </div>`
                        : html`<strong>${FIELD_LABELS[r.field] || r.field}${r.label ? ` · ${r.label}` : ''}:</strong>
                            <span style=${{ color: 'var(--text)' }}> ${r.value}</span>
                            ${flagged ? html`<span title=${'Flagged: ' + (r.validation.reason || '')} style=${{ color: 'var(--amber)', marginLeft: '6px' }}>⚠ ${r.validation.reason || 'check'}</span>` : null}
                            <div class="muted small">${r.entity_type === 'company' ? '🏢' : '👤'} ${dpTarget(r)}</div>`}
                      <div class="muted small">from ${r.contributor_name || ('tenant ' + r.tenant_id)} · ${new Date(r.created_at).toLocaleString()}</div>
                    </div>
                    <span class="request-pill" style=${{ color: STATUS_COLOR[r.status || r.enrich_status], borderColor: STATUS_COLOR[r.status || r.enrich_status] }}>${(r.status || r.enrich_status || '').replace('_review', '')}</span>
                  </div>
                  ${pending ? html`
                    <div class="dr-actions">
                      <button class="accent" disabled=${busy.has(r.id) || gated} title=${gated ? 'Person data is lawyer-gated' : 'Add this to Bell’s database'} onClick=${() => decide(r.id, 'promote')}>Promote to Bell</button>
                      <button class="ghost" disabled=${busy.has(r.id)} onClick=${() => decide(r.id, 'reject')}>Reject</button>
                    </div>` : (r.decided_by ? html`<div class="muted small">by ${r.decided_by}</div>` : null)}
                </div>`;
              })}
            </div>`)}
    </div>
  `;
}
