// Admin Users — manage customer accounts (platform_admin). A searchable list of
// tenants → a detail drawer with plan / status / credits + ledger + audit, and
// actions: add/deduct credits, suspend/reactivate, change plan, message a user.

import { useState, useEffect } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString());
const when = (d) => (d ? new Date(d).toLocaleDateString() : '—');
const STATUS_COLOR = { active: 'rgb(111 207 151)', trialing: 'rgb(91 140 255)', past_due: 'var(--amber,#e0a93f)', suspended: 'rgb(232 142 168)', canceled: 'var(--text-dim)' };

function StatusBadge({ tenant }) {
  const s = !tenant.is_active ? 'suspended' : (tenant.subscription_status || 'active');
  return html`<span style=${{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.04em', color: STATUS_COLOR[s] || 'var(--text-dim)' }}>${s}</span>`;
}

export function AdminUsersTab() {
  const [rows, setRows] = useState([]);
  const [plans, setPlans] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    setLoading(true);
    try { const r = await api.adminUsers(q.trim()); setRows(r.rows || []); setPlans(r.plans || []); }
    catch (err) { toast(/admin/i.test(err.message) ? 'Admin only' : 'Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  return html`
    <div class="overview" style=${{ padding: '18px 22px 40px', flex: '1 1 auto', minHeight: 0, overflowY: 'auto' }}>
      <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <h2 style=${{ margin: 0, fontSize: '18px' }}>Users</h2>
        <span class="muted small">${rows.length} account${rows.length === 1 ? '' : 's'}</span>
        <span style=${{ flex: 1 }}></span>
        <input type="text" placeholder="Search name or email…" value=${q}
          onChange=${(e) => setQ(e.target.value)} onKeyDown=${(e) => { if (e.key === 'Enter') load(); }}
          style=${{ background: 'var(--bg-elev-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 10px', borderRadius: '6px', fontSize: '12.5px', minWidth: '220px' }} />
        <button onClick=${load} style=${{ background: 'var(--bg-elev-2)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '7px 12px', fontSize: '12px', cursor: 'pointer' }}>Search</button>
      </div>

      <table class="grid">
        <thead><tr><th>Account</th><th>Primary user</th><th>Plan</th><th>Status</th><th>Credits</th><th>Since</th></tr></thead>
        <tbody>
          ${rows.length === 0 && !loading ? html`<tr><td colSpan="6" class="empty">No customer accounts yet.</td></tr>` : null}
          ${rows.map((t) => html`<tr key=${t.id} style=${{ cursor: 'pointer' }} onClick=${() => setOpenId(t.id)}>
            <td><div style=${{ fontWeight: 500 }}>${t.name}</div><div class="muted small">${t.slug}</div></td>
            <td>${t.primary_name ? html`<div>${t.primary_name}</div>` : null}<div class="muted small">${t.primary_email || '—'}</div></td>
            <td style=${{ textTransform: 'capitalize' }}>${t.plan}</td>
            <td><${StatusBadge} tenant=${t} /></td>
            <td>${fmt(t.credit_balance)}</td>
            <td class="muted small">${when(t.created_at)}</td>
          </tr>`)}
        </tbody>
      </table>

      ${openId ? html`<${UserDrawer} tenantId=${openId} plans=${plans} onClose=${() => setOpenId(null)} onChanged=${load} />` : null}
    </div>`;
}

function UserDrawer({ tenantId, plans, onClose, onChanged }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [delta, setDelta] = useState('');
  const [note, setNote] = useState('');
  const [plan, setPlan] = useState('');
  const [msgT, setMsgT] = useState('');
  const [msgB, setMsgB] = useState('');
  const [msgEmail, setMsgEmail] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try { const d = await api.adminUser(tenantId); setData(d); setPlan(d.tenant.plan); }
    catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [tenantId]);

  const act = async (fn, okMsg) => {
    setBusy(true);
    try { await fn(); toast(okMsg); await load(); onChanged?.(); }
    catch (err) { toast(err.message || 'Action failed', 'error'); }
    finally { setBusy(false); }
  };
  const adjust = (sign) => {
    const n = Math.abs(Math.trunc(Number(delta)));
    if (!n) { toast('Enter a credit amount', 'error'); return; }
    act(() => api.adminUserCredits(tenantId, sign * n, note), `${sign > 0 ? 'Added' : 'Deducted'} ${n} credits`).then(() => { setDelta(''); setNote(''); });
  };

  const t = data?.tenant;
  const lbl = { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '.08em', fontWeight: 700, color: 'var(--text-dim)', margin: '18px 0 8px' };
  const fld = { background: 'var(--bg-elev-2)', border: '1px solid var(--border)', color: 'var(--text)', padding: '7px 9px', borderRadius: '6px', fontSize: '12.5px' };
  const btn = { background: 'var(--accent)', border: '1px solid var(--accent)', color: '#fff', borderRadius: '6px', padding: '7px 14px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' };
  const btnGhost = { background: 'var(--bg-elev-2)', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '7px 14px', fontSize: '12px', cursor: 'pointer' };

  return html`
    <div onClick=${onClose} style=${{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(6,9,17,0.55)', display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick=${(e) => e.stopPropagation()} style=${{ width: 'min(560px, 96vw)', height: '100%', overflowY: 'auto', background: 'linear-gradient(180deg,#131826,#0e1322)', borderLeft: '1px solid var(--border)' }}>
        ${loading || !t ? html`<div style=${{ padding: '24px', color: 'var(--text-dim)' }}>Loading…</div>` : html`
          <div style=${{ padding: '18px 22px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: '#131826', zIndex: 2 }}>
            <div style=${{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
              <div style=${{ flex: 1, minWidth: 0 }}>
                <div style=${{ fontSize: '17px', fontWeight: 700 }}>${t.name}</div>
                <div class="muted small">${t.slug} · since ${when(t.created_at)}</div>
              </div>
              <button onClick=${onClose} style=${{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', width: '28px', height: '28px', borderRadius: '6px', cursor: 'pointer' }}>✕</button>
            </div>
            <div style=${{ display: 'flex', gap: '16px', marginTop: '12px', flexWrap: 'wrap' }}>
              <div><div class="muted small">Plan</div><div style=${{ textTransform: 'capitalize', fontWeight: 600 }}>${t.plan}</div></div>
              <div><div class="muted small">Status</div><${StatusBadge} tenant=${t} /></div>
              <div><div class="muted small">Credits</div><div style=${{ fontWeight: 600 }}>${fmt(t.credit_balance)}</div></div>
              <div><div class="muted small">Reveals</div><div>${fmt(data.reveals)}</div></div>
            </div>
          </div>

          <div style=${{ padding: '6px 22px 28px' }}>
            <div style=${lbl}>Credits</div>
            <div style=${{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
              <input type="number" placeholder="amount" value=${delta} onChange=${(e) => setDelta(e.target.value)} style=${{ ...fld, width: '110px' }} />
              <input type="text" placeholder="note (optional)" value=${note} onChange=${(e) => setNote(e.target.value)} style=${{ ...fld, flex: 1, minWidth: '120px' }} />
              <button disabled=${busy} onClick=${() => adjust(1)} style=${btn}>Add</button>
              <button disabled=${busy} onClick=${() => adjust(-1)} style=${{ ...btnGhost, borderColor: 'rgba(232,142,168,0.5)', color: 'rgb(232 142 168)' }}>Deduct</button>
            </div>

            <div style=${lbl}>Plan</div>
            <div style=${{ display: 'flex', gap: '8px' }}>
              <select value=${plan} onChange=${(e) => setPlan(e.target.value)} style=${{ ...fld, flex: 1 }}>
                ${plans.map((p) => html`<option key=${p.id} value=${p.id}>${p.name}${p.credits ? ` · ${p.credits.toLocaleString()} cr` : ''}</option>`)}
              </select>
              <button disabled=${busy || plan === t.plan} onClick=${() => act(() => api.adminUserPlan(tenantId, plan), 'Plan changed')} style=${plan === t.plan ? btnGhost : btn}>Change plan</button>
            </div>

            <div style=${lbl}>Account</div>
            ${t.is_active
              ? html`<button disabled=${busy} onClick=${() => act(() => api.adminUserSuspend(tenantId, true), 'Account suspended')} style=${{ ...btnGhost, borderColor: 'rgba(232,142,168,0.5)', color: 'rgb(232 142 168)' }}>Suspend account</button>`
              : html`<button disabled=${busy} onClick=${() => act(() => api.adminUserSuspend(tenantId, false), 'Account reactivated')} style=${btn}>Reactivate account</button>`}

            <div style=${lbl}>Send a message / warning</div>
            <input type="text" placeholder="Title" value=${msgT} onChange=${(e) => setMsgT(e.target.value)} style=${{ ...fld, width: '100%', boxSizing: 'border-box', marginBottom: '8px' }} />
            <textarea placeholder="Message…" value=${msgB} onChange=${(e) => setMsgB(e.target.value)} style=${{ ...fld, width: '100%', minHeight: '64px', boxSizing: 'border-box', resize: 'vertical', fontFamily: 'inherit' }}></textarea>
            <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px' }}>
              <label style=${{ fontSize: '12px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <input type="checkbox" checked=${msgEmail} onChange=${(e) => setMsgEmail(e.target.checked)} /> also email</label>
              <span style=${{ flex: 1 }}></span>
              <button disabled=${busy || !msgT.trim()} onClick=${() => act(() => api.adminUserNotify(tenantId, { title: msgT, body: msgB, email: msgEmail }), 'Message sent').then(() => { setMsgT(''); setMsgB(''); })} style=${btn}>Send</button>
            </div>

            <div style=${lbl}>Users (${data.users.length})</div>
            ${data.users.map((u) => html`<div key=${u.id} style=${{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <span style=${{ flex: 1, fontSize: '12.5px' }}>${u.full_name || u.email}<span class="muted small"> · ${u.email}</span></span>
              <span class="muted small">${u.role}</span>${!u.is_active ? html`<span style=${{ color: 'rgb(232 142 168)', fontSize: '10.5px' }}>suspended</span>` : null}
            </div>`)}

            <div style=${lbl}>Credit ledger</div>
            ${data.ledger.length === 0 ? html`<div class="muted small">No credit activity.</div>`
              : data.ledger.map((l, i) => html`<div key=${i} style=${{ display: 'flex', gap: '8px', padding: '4px 0', fontSize: '12px', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style=${{ width: '56px', textAlign: 'right', color: l.delta > 0 ? 'rgb(111 207 151)' : 'rgb(232 142 168)' }}>${l.delta > 0 ? '+' : ''}${l.delta}</span>
                  <span style=${{ flex: 1, color: 'var(--text-muted)' }}>${String(l.reason).replace(/_/g, ' ')}</span>
                  <span class="muted small">${when(l.created_at)}</span>
                </div>`)}

            ${data.audit.length ? html`<div style=${lbl}>Admin actions</div>
              ${data.audit.map((a, i) => html`<div key=${i} style=${{ fontSize: '11.5px', color: 'var(--text-dim)', padding: '3px 0' }}>
                ${String(a.action).replace(/_/g, ' ')} · ${a.actor_email || 'admin'} · ${when(a.created_at)}</div>`)}` : null}
          </div>
        `}
      </div>
    </div>`;
}
