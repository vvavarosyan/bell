// Admin queue for customer "Request more details" submissions. Approve / decline
// / mark fulfilled. After approving, the admin enriches the company (via the
// normal enrichment or manual edits) then marks it fulfilled; the requester sees
// the status update in their company drawer.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const STATUS_COLOR = {
  pending:   'var(--amber)',
  approved:  'var(--accent-bright)',
  rejected:  'var(--red)',
  fulfilled: 'var(--green)',
};

export function DetailRequestsTab() {
  const [rows, setRows]       = useState([]);
  const [status, setStatus]   = useState('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(() => new Set());

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.detailRequests(status); setRows(r.rows || []); }
    catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const decide = async (id, action) => {
    let adminNote = '';
    if (action === 'reject')  adminNote = window.prompt('Reason for declining (optional):') || '';
    if (action === 'fulfill') adminNote = window.prompt('Note to the requester (what you added):') || '';
    setBusy(prev => new Set(prev).add(id));
    try {
      await api.decideDetailRequest(id, action, adminNote);
      toast(action === 'approve' ? 'Approved' : action === 'reject' ? 'Declined' : 'Marked fulfilled');
      window.dispatchEvent(new Event('bdi:detail-requests-changed'));
      load();
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    finally { setBusy(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  };

  return html`
    <div class="dr-shell">
      <div class="grid-toolbar">
        <strong>Detail Requests</strong>
        <select value=${status} onChange=${e => setStatus(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="fulfilled">Fulfilled</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
        <span class="spacer"></span>
        <button onClick=${load}>Refresh</button>
      </div>

      ${loading
        ? html`<div class="empty">Loading…</div>`
        : (rows.length === 0
            ? html`<div class="empty">No ${status === 'all' ? '' : status} requests.</div>`
            : html`<div class="dr-list">
                ${rows.map(r => html`
                  <div class="dr-card" key=${r.id}>
                    <div class="dr-card-head">
                      <div>
                        <strong>${r.company_name}</strong> ${r.company_bin ? html`<span class="muted small">${r.company_bin}</span>` : null}
                        <div class="muted small">requested by ${r.requested_by || 'unknown'} · ${new Date(r.created_at).toLocaleString()}</div>
                      </div>
                      <span class="request-pill" style=${{ color: STATUS_COLOR[r.status], borderColor: STATUS_COLOR[r.status] }}>${r.status}</span>
                    </div>
                    ${r.note ? html`<div class="dr-note">“${r.note}”</div>` : html`<div class="muted small">No note provided.</div>`}
                    ${r.admin_note ? html`<div class="muted small" style=${{ marginTop: '4px' }}>Admin note: ${r.admin_note}</div>` : null}
                    <div class="dr-actions">
                      ${r.status === 'pending' ? html`<button class="accent" disabled=${busy.has(r.id)} onClick=${() => decide(r.id, 'approve')}>Approve</button>` : null}
                      ${(r.status === 'pending' || r.status === 'approved') ? html`<button disabled=${busy.has(r.id)} onClick=${() => decide(r.id, 'fulfill')}>Mark fulfilled</button>` : null}
                      ${r.status === 'pending' ? html`<button class="ghost" disabled=${busy.has(r.id)} onClick=${() => decide(r.id, 'reject')}>Decline</button>` : null}
                    </div>
                  </div>
                `)}
              </div>`)}
    </div>
  `;
}
