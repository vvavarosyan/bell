// Datapoints panel (Import Phase 2, Layer 1) — shown inside a CRM record drawer.
// Lets the user add unlimited datapoints (phones/emails/websites/corrections/
// custom fields/notes…) to the record's entity. Each is captured for Bell's admin
// review pool AND shown back here as the user's own overlay, with a status pill
// (pending / promoted / rejected) and a junk-flag warning.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const FIELD_LABELS = {
  phone: 'Phone', email: 'Email', website: 'Website', address: 'Address',
  social: 'Social link', name: 'Name / correction', title: 'Job title',
  note: 'Note', custom: 'Custom field',
};
const STATUS_COLOR = { pending: 'var(--amber)', promoted: 'var(--green)', rejected: 'var(--red)' };

export function DatapointsPanel({ recordId }) {
  const [rows, setRows] = useState([]);
  const [field, setField] = useState('phone');
  const [value, setValue] = useState('');
  const [label, setLabel] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!recordId) return;
    setLoading(true);
    try { const r = await api.crmDatapoints(recordId); setRows(r.rows || []); }
    catch { /* record may not be loadable; render empty */ }
    finally { setLoading(false); }
  }, [recordId]);
  useEffect(() => { load(); }, [load]);

  const add = async () => {
    if (!value.trim()) { toast('Enter a value first.'); return; }
    setBusy(true);
    try {
      await api.crmAddDatapoint(recordId, field, value.trim(), field === 'custom' ? (label.trim() || null) : null);
      setValue(''); setLabel('');
      await load();
    } catch (err) { toast('Could not add: ' + err.message, 'error'); }
    finally { setBusy(false); }
  };

  const del = async (id) => {
    try { await api.crmDeleteDatapoint(id); setRows(prev => prev.filter(r => r.id !== id)); }
    catch (err) { toast('Delete failed: ' + err.message, 'error'); }
  };

  const inp = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '6px 9px', fontSize: '12.5px' };

  return html`
    <div style=${{ marginTop: '14px' }}>
      <div style=${{ fontSize: '12px', fontWeight: 600, color: 'var(--text)', marginBottom: '2px' }}>Add details</div>
      <div style=${{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '10px', lineHeight: 1.5 }}>
        Add any datapoint you know about this record. It's saved for you and reviewed by Bell before it improves the shared database.
      </div>

      <div style=${{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '10px' }}>
        <select value=${field} onChange=${e => setField(e.target.value)} style=${inp}>
          ${Object.entries(FIELD_LABELS).map(([k, lbl]) => html`<option key=${k} value=${k}>${lbl}</option>`)}
        </select>
        ${field === 'custom' ? html`<input placeholder="Label" value=${label} onInput=${e => setLabel(e.target.value)} style=${{ ...inp, width: '110px' }} />` : null}
        <input placeholder="Value" value=${value} onInput=${e => setValue(e.target.value)}
          onKeyDown=${e => e.key === 'Enter' && add()} style=${{ ...inp, flex: 1, minWidth: '140px' }} />
        <button class="accent" disabled=${busy || !value.trim()} onClick=${add}>${busy ? '…' : 'Add'}</button>
      </div>

      ${loading ? null : (rows.length === 0
        ? html`<div style=${{ fontSize: '11.5px', color: 'var(--text-dim)' }}>No added details yet.</div>`
        : html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            ${rows.map(r => html`
              <div key=${r.id} style=${{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', padding: '5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                <span style=${{ color: 'var(--text-muted)', minWidth: '92px' }}>${FIELD_LABELS[r.field] || r.field}${r.label ? ` · ${r.label}` : ''}</span>
                <span style=${{ color: 'var(--text)', flex: 1, wordBreak: 'break-word' }}>${r.value}</span>
                ${r.validation && r.validation.ok === false ? html`<span title=${'Flagged: ' + (r.validation.reason || 'check')} style=${{ color: 'var(--amber)' }}>⚠</span>` : null}
                <span style=${{ fontSize: '10.5px', color: STATUS_COLOR[r.status] || 'var(--text-dim)', border: '1px solid ' + (STATUS_COLOR[r.status] || 'var(--border)'), borderRadius: '999px', padding: '1px 7px' }}>${r.status}</span>
                <button onClick=${() => del(r.id)} title="Remove" style=${{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer' }}>✕</button>
              </div>`)}
          </div>`)}
    </div>
  `;
}
