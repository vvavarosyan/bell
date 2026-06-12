// "Request more details" box shown in a revealed company's drawer (customer
// view). Lets the user ask the Bell team to enrich specific data, and shows the
// status of any existing request.

import { useState, useEffect } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const STATUS_LABEL = {
  pending:   'Pending review',
  approved:  'Approved — being prepared',
  rejected:  'Declined',
  fulfilled: 'Fulfilled',
};
const STATUS_COLOR = {
  pending:   'var(--amber)',
  approved:  'var(--accent-bright)',
  rejected:  'var(--red)',
  fulfilled: 'var(--green)',
};

export function RequestDetailsBox({ companyId }) {
  const [req, setReq]   = useState(undefined);   // undefined = loading, null = none
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setReq(undefined); setOpen(false); setNote('');
    api.myDetailRequest(companyId)
      .then(r => { if (!cancelled) setReq(r.request || null); })
      .catch(() => { if (!cancelled) setReq(null); });
    return () => { cancelled = true; };
  }, [companyId]);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await api.requestDetails(companyId, note.trim());
      setReq(r.request); setOpen(false); setNote('');
      toast(r.already ? 'You already have an open request for this company' : 'Request sent to the Bell team');
    } catch (err) {
      toast(/reveal_required/.test(err.message) ? 'Reveal this company first' : 'Request failed: ' + err.message, 'error');
    } finally { setBusy(false); }
  };

  if (req === undefined) return null;

  return html`
    <section class="group request-box">
      <h3>Need more details?</h3>
      ${req
        ? html`<div class="request-status">
            <span class="request-pill" style=${{ color: STATUS_COLOR[req.status] || 'var(--text)', borderColor: STATUS_COLOR[req.status] || 'var(--border)' }}>
              ${STATUS_LABEL[req.status] || req.status}
            </span>
            ${req.note ? html`<div class="muted small" style=${{ marginTop: '6px' }}>Your request: ${req.note}</div>` : null}
            ${req.admin_note ? html`<div class="small" style=${{ marginTop: '4px' }}>Bell: ${req.admin_note}</div>` : null}
            ${(req.status === 'rejected' || req.status === 'fulfilled')
              ? html`<button class="linkbtn" style=${{ marginTop: '8px' }} onClick=${() => setReq(null)}>Request again</button>` : null}
          </div>`
        : (open
            ? html`<div>
                <textarea class="sys-input" rows="3" style=${{ width: '100%' }}
                  placeholder="What details do you need? (e.g. decision-maker emails, financials, exact address…)"
                  value=${note} onChange=${e => setNote(e.target.value)}></textarea>
                <div style=${{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                  <button class="accent" disabled=${busy || !note.trim()} onClick=${submit}>Send request</button>
                  <button class="ghost" disabled=${busy} onClick=${() => setOpen(false)}>Cancel</button>
                </div>
              </div>`
            : html`<button class="accent" onClick=${() => setOpen(true)}>Request more details</button>
                   <div class="muted small" style=${{ marginTop: '6px' }}>Ask the Bell team to enrich this company with specific data you need.</div>`)}
    </section>
  `;
}
