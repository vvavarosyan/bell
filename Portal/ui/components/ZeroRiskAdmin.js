// 0 Risk admin tab (admin.bell.qa / local engine). Review pending accounts +
// their documents; APPROVE, REQUEST RESUBMISSION (yellow — reopens the form) or
// REJECT (red, terminal) with one-or-many reasons + a comment; prepare & deliver
// list requests by SEARCHING companies by name/ID (multi-select chips); finalize
// deals; set limits. Allowance is MANUAL-ONLY — a won deal records the win but
// grants nothing automatically (Val 2026-07-02).
// Uses Bell's design system (sys-section / sys-btn / sys-input) to match the app.

import { useState, useEffect, useCallback, useRef } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const wrap = { padding: '24px 30px', maxWidth: '1040px' };
const rowBase = { display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '10px 0', borderTop: '1px solid var(--border)' };
const muted = { color: 'var(--text-dim)', fontSize: '12px' };
const numInput = { width: '78px', flex: 'none' };   // narrow sys-input override

// Preset review reasons (admin can tick several + add a free-text comment).
const REVIEW_REASONS = [
  'Expired document',
  'Unreadable scan',
  'Missing company stamp',
  'Wrong authorised signatory',
  'Details mismatch (CR / QID / agreement)',
];

export function ZeroRiskAdmin() {
  const [accounts, setAccounts] = useState([]);
  const [all, setAll] = useState([]);
  const [lists, setLists] = useState([]);
  const [deals, setDeals] = useState([]);
  const [busy, setBusy] = useState(false);
  const [limEdits, setLimEdits] = useState({});
  // Review panel state per pending account: { open, note, reasons:Set }
  const [review, setReview] = useState({});
  // List-prep picker state per request: query, results, picked chips.
  const [pickQ, setPickQ] = useState({});
  const [pickResults, setPickResults] = useState({});
  const [picked, setPicked] = useState({});
  const searchTimers = useRef({});

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

  // ---- review panel helpers -------------------------------------------------
  const rv = (tid) => review[tid] || { open: false, note: '', reasons: [] };
  const setRv = (tid, patch) => setReview((s) => ({ ...s, [tid]: { ...rv(tid), ...patch } }));
  const toggleReason = (tid, r) => {
    const cur = rv(tid).reasons;
    setRv(tid, { reasons: cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r] });
  };
  const decide = (tid, kind) => {
    const { note, reasons } = rv(tid);
    if (kind !== 'approve' && !reasons.length && !String(note).trim()) {
      toast('Pick at least one reason (or write a comment) so the company knows what to fix.', 'error'); return;
    }
    const body = { note: String(note).trim() || null, reasons };
    if (kind === 'resubmit') return act(() => api.zrAdminResubmit(tid, body), 'Sent back for resubmission — the company was notified');
    return act(() => api.zrAdminReject(tid, body), 'Application rejected — the company was notified');
  };

  // ---- list-prep picker -----------------------------------------------------
  const searchCompanies = (rqId, q) => {
    setPickQ((s) => ({ ...s, [rqId]: q }));
    clearTimeout(searchTimers.current[rqId]);
    if (!String(q).trim()) { setPickResults((s) => ({ ...s, [rqId]: [] })); return; }
    searchTimers.current[rqId] = setTimeout(async () => {
      try {
        const r = await api.zrAdminSearchCompanies(q);
        setPickResults((s) => ({ ...s, [rqId]: r.rows || [] }));
      } catch { /* ignore */ }
    }, 300);
  };
  const addPick = (rqId, c) => {
    setPicked((s) => {
      const cur = s[rqId] || [];
      if (cur.some((x) => Number(x.id) === Number(c.id))) return s;
      return { ...s, [rqId]: [...cur, { id: Number(c.id), name: c.name }] };
    });
    setPickQ((s) => ({ ...s, [rqId]: '' }));
    setPickResults((s) => ({ ...s, [rqId]: [] }));
  };
  const rmPick = (rqId, id) => setPicked((s) => ({ ...s, [rqId]: (s[rqId] || []).filter((x) => Number(x.id) !== Number(id)) }));
  const deliver = (rq) => {
    const chips = picked[rq.id] || [];
    if (!chips.length) { toast('Search and add at least one company first.', 'error'); return; }
    return act(
      () => api.zrAdminDeliver(rq.id, chips.map((c) => ({ company_id: c.id, dossier: {} }))).then(() => setPicked((s) => ({ ...s, [rq.id]: [] }))),
      `Delivered ${chips.length} companies to list #${rq.seq}`,
    );
  };

  const openDeals = deals.filter((d) => d.admin_status === 'open' && d.user_status === 'won').length;

  return html`
    <div style=${wrap}>
      <div class="sys-hint" style=${{ marginBottom: '20px' }}>Review 0 Risk applications, prepare prospect lists, and finalize deals. Wins are recorded but allowance is <b style=${{ color: 'var(--text)' }}>granted manually</b> — edit a company’s allowance below when you decide they’ve earned the next list.</div>

      <div class="sys-section">
        <h2>All 0 Risk users ${all.length ? `(${all.length})` : ''}</h2>
        ${!all.length ? html`<div class="empty">No 0 Risk accounts yet.</div>` : all.map((a) => {
          const e = limEdits[a.tenant_id] || {};
          return html`<div key=${a.tenant_id} style=${rowBase}>
            <strong style=${{ fontSize: '13px', minWidth: '160px' }}>${a.name}</strong>
            <span style=${muted}>#${a.tenant_id} · ${a.zero_risk_status || '—'} · ${a.list_count} lists · ${a.worked_count ?? 0}/${a.items_total ?? 0} worked · ${a.wins} wins</span>
            <span style=${{ flex: 1 }}></span>
            <label style=${muted}>per-list <input class="sys-input" style=${numInput} value=${e.cpr ?? a.companies_per_request} onInput=${(ev) => setLimEdits((s) => ({ ...s, [a.tenant_id]: { ...s[a.tenant_id], cpr: ev.target.value } }))} /></label>
            <label style=${muted}>allowance <input class="sys-input" style=${{ width: '62px', flex: 'none' }} value=${e.la ?? a.lists_allowed} onInput=${(ev) => setLimEdits((s) => ({ ...s, [a.tenant_id]: { ...s[a.tenant_id], la: ev.target.value } }))} /></label>
            <button class="sys-btn sys-btn-secondary" disabled=${busy} onClick=${() => act(() => api.zrAdminSetLimits(a.tenant_id, { companies_per_request: Number((limEdits[a.tenant_id] || {}).cpr ?? a.companies_per_request), lists_allowed: Number((limEdits[a.tenant_id] || {}).la ?? a.lists_allowed) }), 'Limits updated')}>Save</button>
          </div>`;
        })}
      </div>

      <div class="sys-section">
        <h2>Pending approvals ${accounts.length ? `(${accounts.length})` : ''}</h2>
        ${!accounts.length ? html`<div class="empty">No applications awaiting approval.</div>` : accounts.map((a) => {
          const r = rv(a.tenant_id);
          return html`<div key=${a.tenant_id}>
            <div style=${rowBase}>
              <strong style=${{ fontSize: '13px' }}>${a.name}</strong>
              <span style=${muted}>#${a.tenant_id} · ${a.doc_count} docs · agreement: ${a.agreement_status || '—'}</span>
              <span style=${{ flex: 1 }}></span>
              ${a.signed_document_id ? html`<button class="sys-btn sys-btn-secondary" onClick=${() => api.zrAdminOpenDocument(a.signed_document_id).catch((e) => toast(e.message, 'error'))}>View signed agreement</button>` : null}
              <button class="sys-btn" disabled=${busy} onClick=${() => act(() => api.zrAdminApprove(a.tenant_id), 'Approved — green light sent')}>Approve</button>
              <button class="sys-btn sys-btn-secondary" disabled=${busy} onClick=${() => setRv(a.tenant_id, { open: !r.open })}>${r.open ? 'Cancel' : 'Reject / request changes'}</button>
            </div>
            ${r.open ? html`
              <div style=${{ margin: '2px 0 12px', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-elev)' }}>
                <div style=${{ ...muted, marginBottom: '8px' }}>Tick every reason that applies (the company sees these) and add a comment if needed:</div>
                <div style=${{ display: 'flex', flexWrap: 'wrap', gap: '8px 16px', marginBottom: '10px' }}>
                  ${REVIEW_REASONS.map((reason) => html`
                    <label key=${reason} style=${{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12.5px', cursor: 'pointer' }}>
                      <input type="checkbox" style=${{ accentColor: 'var(--accent)' }} checked=${r.reasons.includes(reason)} onChange=${() => toggleReason(a.tenant_id, reason)} />
                      ${reason}
                    </label>`)}
                </div>
                <input class="sys-input" style=${{ width: '100%', marginBottom: '10px' }} placeholder="Comment (e.g. “CR expired on 12 May — please renew and re-upload”)"
                  value=${r.note} onInput=${(ev) => setRv(a.tenant_id, { note: ev.target.value })} />
                <div style=${{ display: 'flex', gap: '8px' }}>
                  <button class="sys-btn" style=${{ background: 'var(--yellow, #f5c84c)', borderColor: 'var(--yellow, #f5c84c)', color: '#141414' }} disabled=${busy} onClick=${() => decide(a.tenant_id, 'resubmit')}>Request resubmission</button>
                  <button class="sys-btn" style=${{ background: 'var(--red, #ff5d5d)', borderColor: 'var(--red, #ff5d5d)' }} disabled=${busy} onClick=${() => decide(a.tenant_id, 'reject')}>Reject application</button>
                  <span style=${{ ...muted, alignSelf: 'center' }}>Resubmission reopens their form · rejection is final.</span>
                </div>
              </div>` : null}
          </div>`;
        })}
      </div>

      <div class="sys-section">
        <h2>List requests to prepare ${lists.length ? `(${lists.length})` : ''}</h2>
        ${!lists.length ? html`<div class="empty">No pending list requests.</div>` : lists.map((rq) => html`
          <div key=${rq.id} style=${{ padding: '10px 0', borderTop: '1px solid var(--border)' }}>
            <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <strong style=${{ fontSize: '13px' }}>${rq.tenant_name}</strong>
              <span style=${muted}>list #${rq.seq} · up to ${rq.size} companies · ${rq.status}</span>
              <span style=${{ flex: 1 }}></span>
              <span style=${muted}>${(picked[rq.id] || []).length} selected</span>
              <button class="sys-btn" disabled=${busy} onClick=${() => deliver(rq)}>Deliver ${(picked[rq.id] || []).length ? `(${(picked[rq.id] || []).length})` : ''}</button>
            </div>
            <div style=${{ position: 'relative', marginTop: '8px', maxWidth: '520px' }}>
              <input class="sys-input" style=${{ width: '100%' }} placeholder="Search companies by name or ID — click a result to add it"
                value=${pickQ[rq.id] || ''} onInput=${(ev) => searchCompanies(rq.id, ev.target.value)} />
              ${(pickResults[rq.id] || []).length ? html`
                <div style=${{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: '8px', marginTop: '4px', maxHeight: '260px', overflow: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.35)' }}>
                  ${(pickResults[rq.id] || []).map((c) => html`
                    <button key=${c.id} onClick=${() => addPick(rq.id, c)}
                      style=${{ display: 'flex', gap: '8px', alignItems: 'baseline', width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderBottom: '1px solid var(--border)', padding: '8px 10px', cursor: 'pointer', color: 'var(--text)' }}>
                      <span style=${{ fontSize: '12.5px', fontWeight: 600 }}>${c.name}</span>
                      <span style=${muted}>#${c.id}${c.industry ? ' · ' + c.industry : ''}${c.city ? ' · ' + c.city : ''}</span>
                    </button>`)}
                </div>` : null}
            </div>
            ${(picked[rq.id] || []).length ? html`
              <div style=${{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                ${(picked[rq.id] || []).map((c) => html`
                  <span key=${c.id} style=${{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', border: '1px solid var(--border)', borderRadius: '14px', padding: '3px 10px', background: 'var(--bg-elev)' }}>
                    ${c.name} <span style=${muted}>#${c.id}</span>
                    <button onClick=${() => rmPick(rq.id, c.id)} style=${{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: 0 }}>✕</button>
                  </span>`)}
              </div>` : null}
          </div>`)}
        <div class="sys-hint" style=${{ marginTop: '12px' }}>Search by company name or paste a Bell ID. Delivered companies open as FULL dossiers (contacts included) in the customer’s portal.</div>
      </div>

      <div class="sys-section">
        <h2>Deals ${openDeals ? `(${openDeals} to finalize)` : ''}</h2>
        ${!deals.length ? html`<div class="empty">No deals reported yet.</div>` : deals.map((d) => html`
          <div key=${d.id} style=${rowBase}>
            <span style=${{ fontSize: '13px' }}>${d.tenant_name} → ${d.company_name || ('#' + d.company_id)}</span>
            <span style=${muted}>reported: ${d.user_status}${d.revenue_amount ? ` · ${Number(d.revenue_amount).toLocaleString()} ${d.currency || ''}` : ''}</span>
            <span style=${{ flex: 1 }}></span>
            ${d.admin_status !== 'open' ? html`<span style=${{ fontSize: '12px', color: 'var(--green)' }}>${d.admin_status.replace('finalized_', '✓ ')}</span>` : html`
              <button class="sys-btn" disabled=${busy} onClick=${() => act(() => api.zrAdminFinalize(d.id, 'finalized_won'), 'Marked won — win recorded (allowance stays manual)')}>Mark won</button>
              <button class="sys-btn sys-btn-secondary" disabled=${busy} onClick=${() => act(() => api.zrAdminFinalize(d.id, 'finalized_lost'), 'Marked lost')}>Mark lost</button>`}
          </div>`)}
      </div>
    </div>
  `;
}
