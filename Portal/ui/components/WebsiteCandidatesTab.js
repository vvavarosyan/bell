// Website Candidates — admin review queue for SEARCH-found websites.
// The Finder auto-saves high-confidence domain guesses, but routes fuzzier
// search results here. Approve → sets the company's website (the harvester then
// picks it up). Reject → records the host so the Finder won't re-propose it.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const STATUS_COLOR = {
  pending:  'var(--amber)',
  approved: 'var(--green)',
  rejected: 'var(--red)',
};

export function WebsiteCandidatesTab() {
  const [rows, setRows]       = useState([]);
  const [status, setStatus]   = useState('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.websiteCandidates(status); setRows(r.rows || []); }
    catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const decide = async (id, action) => {
    setBusy(prev => new Set(prev).add(id));
    try {
      await api.decideWebsiteCandidate(id, action);
      toast(action === 'approve' ? 'Approved — website set' : 'Rejected');
      window.dispatchEvent(new Event('bdi:website-candidates-changed'));
      setRows(prev => prev.filter(r => r.id !== id));   // drop from pending view
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    finally { setBusy(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  };

  return html`
    <div class="dr-shell">
      <div class="grid-toolbar">
        <strong>Website Candidates</strong>
        <span class="muted small">search-found sites awaiting approval</span>
        <select value=${status} onChange=${e => setStatus(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
        <span class="spacer"></span>
        <button onClick=${load}>Refresh</button>
      </div>

      ${loading
        ? html`<div class="empty">Loading…</div>`
        : (rows.length === 0
            ? html`<div class="empty">No ${status === 'all' ? '' : status} candidates.</div>`
            : html`<div class="dr-list">
                ${rows.map(r => html`
                  <div class="dr-card" key=${r.id}>
                    <div class="dr-card-head">
                      <div>
                        <strong>${r.company_name}</strong> ${r.company_bin ? html`<span class="muted small">${r.company_bin}</span>` : null}
                        <div class="muted small">${r.reason || ''} · ${new Date(r.created_at).toLocaleString()}</div>
                      </div>
                      <span class="request-pill" style=${{ color: STATUS_COLOR[r.status], borderColor: STATUS_COLOR[r.status] }}>${r.status}</span>
                    </div>
                    <div class="dr-note">
                      <a href=${r.candidate_url} target="_blank" rel="noreferrer">${r.candidate_url} ↗</a>
                    </div>
                    ${r.status === 'pending' ? html`
                      <div class="dr-actions">
                        <button class="accent" disabled=${busy.has(r.id)} onClick=${() => decide(r.id, 'approve')}>Approve</button>
                        <button class="ghost"  disabled=${busy.has(r.id)} onClick=${() => decide(r.id, 'reject')}>Reject</button>
                      </div>` : (r.decided_by ? html`<div class="muted small">by ${r.decided_by}</div>` : null)}
                  </div>
                `)}
              </div>`)}
    </div>
  `;
}
