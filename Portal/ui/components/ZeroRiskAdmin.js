// 0 Risk admin tab (admin.bell.qa / local engine). Review pending accounts +
// their documents, approve/reject, prepare & deliver list requests, finalize
// deals (a finalized win unlocks the company's next request), and set limits.
// Uses Bell's design system (sys-section / sys-btn / sys-input) to match the app.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const wrap = { padding: '24px 30px', maxWidth: '1040px' };
const rowBase = { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--border)' };
const muted = { color: 'var(--text-dim)', fontSize: '12px' };
const numInput = { width: '78px', flex: 'none' };   // narrow sys-input override

export function ZeroRiskAdmin() {
  const [accounts, setAccounts] = useState([]);
  const [all, setAll] = useState([]);
  const [lists, setLists] = useState([]);
  const [deals, setDeals] = useState([]);
  const [busy, setBusy] = useState(false);
  const [deliverIds, setDeliverIds] = useState({});
  const [limEdits, setLimEdits] = useState({});

  const load = useCallback(async () => {
    try {
      const [a, ac, l, d] = await Promise.all([api.zrAdminAccounts(), api.zrAdminAllAccounts(), api.zrAdminLists(), api.zrAdminDeals()]);
      setAccounts(a.rows || []); setAll(ac.rows || []); setLists(l.rows || []); setDeals(d.rows || []);
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
    <div style=${wrap}>
      <div class="sys-hint" style=${{ marginBottom: '20px' }}>Review 0 Risk applications, prepare prospect lists, and finalize deals. A finalized <b style=${{ color: 'var(--text)' }}>won</b> deal grants the company +1 list request.</div>

      <div class="sys-section">
        <h2>All 0 Risk users ${all.length ? `(${all.length})` : ''}</h2>
        ${!all.length ? html`<div class="empty">No 0 Risk accounts yet.</div>` : all.map((a) => {
          const e = limEdits[a.tenant_id] || {};
          return html`<div key=${a.tenant_id} style=${rowBase}>
            <strong style=${{ fontSize: '13px', minWidth: '160px' }}>${a.name}</strong>
            <span style=${muted}>#${a.tenant_id} · ${a.zero_risk_status || '—'} · ${a.list_count} lists · ${a.wins} wins</span>
            <span style=${{ flex: 1 }}></span>
            <label style=${muted}>per-list <input class="sys-input" style=${numInput} value=${e.cpr ?? a.companies_per_request} onInput=${(ev) => setLimEdits((s) => ({ ...s, [a.tenant_id]: { ...s[a.tenant_id], cpr: ev.target.value } }))} /></label>
            <label style=${muted}>allowance <input class="sys-input" style=${{ width: '62px', flex: 'none' }} value=${e.la ?? a.lists_allowed} onInput=${(ev) => setLimEdits((s) => ({ ...s, [a.tenant_id]: { ...s[a.tenant_id], la: ev.target.value } }))} /></label>
            <button class="sys-btn sys-btn-secondary" disabled=${busy} onClick=${() => act(() => api.zrAdminSetLimits(a.tenant_id, { companies_per_request: Number((limEdits[a.tenant_id] || {}).cpr ?? a.companies_per_request), lists_allowed: Number((limEdits[a.tenant_id] || {}).la ?? a.lists_allowed) }), 'Limits updated')}>Save</button>
          </div>`;
        })}
      </div>

      <div class="sys-section">
        <h2>Pending approvals ${accounts.length ? `(${accounts.length})` : ''}</h2>
        ${!accounts.length ? html`<div class="empty">No applications awaiting approval.</div>` : accounts.map((a) => html`
          <div key=${a.tenant_id} style=${rowBase}>
            <strong style=${{ fontSize: '13px' }}>${a.name}</strong>
            <span style=${muted}>#${a.tenant_id} · ${a.doc_count} docs · agreement: ${a.agreement_status || '—'}</span>
            <span style=${{ flex: 1 }}></span>
            ${a.signed_document_id ? html`<button class="sys-btn sys-btn-secondary" onClick=${() => api.zrAdminOpenDocument(a.signed_document_id).catch((e) => toast(e.message, 'error'))}>View signed agreement</button>` : null}
            <button class="sys-btn" disabled=${busy} onClick=${() => act(() => api.zrAdminApprove(a.tenant_id), 'Approved — green light sent')}>Approve</button>
            <button class="sys-btn sys-btn-secondary" disabled=${busy} onClick=${() => act(() => api.zrAdminReject(a.tenant_id, 'Needs changes'), 'Sent back to onboarding')}>Reject</button>
          </div>`)}
      </div>

      <div class="sys-section">
        <h2>List requests to prepare ${lists.length ? `(${lists.length})` : ''}</h2>
        ${!lists.length ? html`<div class="empty">No pending list requests.</div>` : lists.map((rq) => html`
          <div key=${rq.id} style=${rowBase}>
            <strong style=${{ fontSize: '13px' }}>${rq.tenant_name}</strong>
            <span style=${muted}>list #${rq.seq} · ${rq.size} companies · ${rq.status}</span>
            <span style=${{ flex: 1 }}></span>
            <input class="sys-input" style=${{ width: '260px', flex: 'none' }} placeholder="Company IDs: 12, 45, 88…"
              value=${deliverIds[rq.id] || ''} onInput=${(ev) => setDeliverIds((s) => ({ ...s, [rq.id]: ev.target.value }))} />
            <button class="sys-btn" disabled=${busy} onClick=${() => deliver(rq)}>Deliver</button>
          </div>`)}
        <div class="sys-hint" style=${{ marginTop: '12px' }}>v1: deliver by company IDs (dossiers attach minimally). Richer dossier-building comes later.</div>
      </div>

      <div class="sys-section">
        <h2>Deals</h2>
        ${!deals.length ? html`<div class="empty">No deals reported yet.</div>` : deals.map((d) => html`
          <div key=${d.id} style=${rowBase}>
            <span style=${{ fontSize: '13px' }}>${d.tenant_name} → ${d.company_name || ('#' + d.company_id)}</span>
            <span style=${muted}>reported: ${d.user_status}${d.revenue_amount ? ` · ${Number(d.revenue_amount).toLocaleString()} ${d.currency || ''}` : ''}</span>
            <span style=${{ flex: 1 }}></span>
            ${d.admin_status !== 'open' ? html`<span style=${{ fontSize: '12px', color: 'var(--green)' }}>${d.admin_status.replace('finalized_', '✓ ')}</span>` : html`
              <button class="sys-btn" disabled=${busy} onClick=${() => act(() => api.zrAdminFinalize(d.id, 'finalized_won'), 'Marked won (+1 list granted)')}>Mark won</button>
              <button class="sys-btn sys-btn-secondary" disabled=${busy} onClick=${() => act(() => api.zrAdminFinalize(d.id, 'finalized_lost'), 'Marked lost')}>Mark lost</button>`}
          </div>`)}
      </div>
    </div>
  `;
}
