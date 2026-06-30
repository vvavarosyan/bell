// 0 Risk admin tab (admin.bell.qa / local engine). Review pending accounts +
// their documents, approve/reject, prepare & deliver list requests, finalize
// deals (a finalized win unlocks the company's next request), and set limits.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const card = { background: 'var(--bg-elev-2, #1a2034)', border: '1px solid var(--border)', borderRadius: '10px', padding: '16px 18px', marginBottom: '16px' };
const btn = (p) => ({ background: p ? 'var(--accent)' : 'rgba(255,255,255,0.05)', border: '1px solid ' + (p ? 'var(--accent)' : 'var(--border)'), color: p ? '#fff' : 'var(--text)', borderRadius: '6px', padding: '5px 11px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' });
const muted = { color: 'var(--text-muted)', fontSize: '12.5px' };
const inp = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '5px 8px', fontSize: '12px', width: '90px' };

export function ZeroRiskAdmin() {
  const [accounts, setAccounts] = useState([]);
  const [lists, setLists] = useState([]);
  const [deals, setDeals] = useState([]);
  const [busy, setBusy] = useState(false);
  const [deliverIds, setDeliverIds] = useState({});   // requestId -> "id,id,id"

  const load = useCallback(async () => {
    try {
      const [a, l, d] = await Promise.all([api.zrAdminAccounts(), api.zrAdminLists(), api.zrAdminDeals()]);
      setAccounts(a.rows || []); setLists(l.rows || []); setDeals(d.rows || []);
    } catch (e) { toast('Could not load 0 Risk admin data: ' + e.message, 'error'); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const act = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); if (okMsg) toast(okMsg); await load(); }
    catch (e) { toast('Failed: ' + e.message, 'error'); } finally { setBusy(false); }
  };

  const deliver = (rq) => {
    const ids = String(deliverIds[rq.id] || '').split(/[,\s]+/).map((x) => Number(x)).filter(Number.isFinite);
    if (!ids.length) { toast('Enter company IDs to deliver (comma-separated).', 'error'); return; }
    return act(() => api.zrAdminDeliver(rq.id, ids.map((company_id) => ({ company_id, dossier: {} }))), `Delivered ${ids.length} companies to list #${rq.seq}`);
  };

  return html`
    <div style=${{ padding: '18px 22px', maxWidth: '1000px' }}>
      <div style=${{ ...muted, marginBottom: '14px' }}>Review 0 Risk applications, prepare prospect lists, and finalize deals. A finalized <b>won</b> deal grants the company +1 list request.</div>

      <div style=${card}>
        <div style=${{ fontWeight: 700, marginBottom: '8px' }}>Pending approvals ${accounts.length ? `(${accounts.length})` : ''}</div>
        ${!accounts.length ? html`<div style=${muted}>No applications awaiting approval.</div>` : accounts.map((a) => html`
          <div key=${a.tenant_id} style=${{ borderTop: '1px solid var(--border)', paddingTop: '10px', marginTop: '10px' }}>
            <div style=${{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              <strong style=${{ fontSize: '13px' }}>${a.name}</strong>
              <span style=${muted}>tenant #${a.tenant_id} · ${a.doc_count} docs · agreement: ${a.agreement_status || '—'}</span>
              <span style=${{ flex: 1 }}></span>
              ${a.signed_document_id ? html`<button style=${btn(false)} onClick=${() => api.zrAdminOpenDocument(a.signed_document_id).catch((e) => toast(e.message, 'error'))}>View signed agreement</button>` : null}
              <button style=${btn(true)} disabled=${busy} onClick=${() => act(() => api.zrAdminApprove(a.tenant_id), 'Approved — green light sent')}>Approve</button>
              <button style=${btn(false)} disabled=${busy} onClick=${() => act(() => api.zrAdminReject(a.tenant_id, 'Needs changes'), 'Sent back to onboarding')}>Reject</button>
            </div>
          </div>`)}
      </div>

      <div style=${card}>
        <div style=${{ fontWeight: 700, marginBottom: '8px' }}>List requests to prepare ${lists.length ? `(${lists.length})` : ''}</div>
        ${!lists.length ? html`<div style=${muted}>No pending list requests.</div>` : lists.map((rq) => html`
          <div key=${rq.id} style=${{ borderTop: '1px solid var(--border)', paddingTop: '10px', marginTop: '10px', display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <strong style=${{ fontSize: '13px' }}>${rq.tenant_name}</strong>
            <span style=${muted}>list #${rq.seq} · ${rq.size} companies · ${rq.status}</span>
            <span style=${{ flex: 1 }}></span>
            <input style=${{ ...inp, width: '260px' }} placeholder="Company IDs to deliver: 12, 45, 88…"
              value=${deliverIds[rq.id] || ''} onInput=${(e) => setDeliverIds((s) => ({ ...s, [rq.id]: e.target.value }))} />
            <button style=${btn(true)} disabled=${busy} onClick=${() => deliver(rq)}>Deliver</button>
          </div>`)}
        <div style=${{ ...muted, marginTop: '10px' }}>v1: deliver by company IDs (dossiers attach minimally). Richer dossier-building comes later.</div>
      </div>

      <div style=${card}>
        <div style=${{ fontWeight: 700, marginBottom: '8px' }}>Deals</div>
        ${!deals.length ? html`<div style=${muted}>No deals reported yet.</div>` : deals.map((d) => html`
          <div key=${d.id} style=${{ display: 'flex', gap: '8px', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', flexWrap: 'wrap' }}>
            <span style=${{ fontSize: '12.5px' }}>${d.tenant_name} → ${d.company_name || ('#' + d.company_id)}</span>
            <span style=${muted}>reported: ${d.user_status}${d.revenue_amount ? ` · ${Number(d.revenue_amount).toLocaleString()} ${d.currency || ''}` : ''}</span>
            <span style=${{ flex: 1 }}></span>
            ${d.admin_status !== 'open' ? html`<span style=${{ fontSize: '11.5px', color: 'var(--green,#3fb950)' }}>${d.admin_status.replace('finalized_', '✓ ')}</span>` : html`
              <button style=${btn(true)} disabled=${busy} onClick=${() => act(() => api.zrAdminFinalize(d.id, 'finalized_won'), 'Marked won (+1 list granted)')}>Mark won</button>
              <button style=${btn(false)} disabled=${busy} onClick=${() => act(() => api.zrAdminFinalize(d.id, 'finalized_lost'), 'Marked lost')}>Mark lost</button>`}
          </div>`)}
      </div>
    </div>
  `;
}
