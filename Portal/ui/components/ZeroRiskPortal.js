// 0 Risk portal — the full-screen experience for a tenant whose account_type is
// 'zero_risk'. Driven by /api/zero-risk/status. Three phases keyed off
// zero_risk_status: onboarding (profile + docs + agreement) → pending_approval
// (under review) → approved (request lists, track deals). Authenticated but NOT
// subscription-gated; app.js diverts here before the /subscribe gate.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const shell = { minHeight: '100vh', background: 'var(--bg, #0e1320)', color: 'var(--text, #e9edf5)', padding: '0' };
const bar = { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 22px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-elev-1, #141a2b)', zIndex: 10 };
const wrap = { maxWidth: '880px', margin: '0 auto', padding: '24px 20px 80px' };
const card = { background: 'var(--bg-elev-2, #1a2034)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px 22px', marginBottom: '18px' };
const field = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '9px 11px', fontSize: '13px', width: '100%', boxSizing: 'border-box' };
const label = { fontSize: '12px', fontWeight: 600, color: 'var(--text)', margin: '12px 0 5px' };
const btn = (primary) => ({ background: primary ? 'var(--accent)' : 'rgba(255,255,255,0.05)', border: '1px solid ' + (primary ? 'var(--accent)' : 'var(--border)'), color: primary ? '#fff' : 'var(--text)', borderRadius: '7px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' });
const muted = { color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.55 };

const toArr = (s) => String(s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const arrStr = (a) => (Array.isArray(a) ? a.join(', ') : '');

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

const DOC_LABELS = { cr: 'Commercial Registration (CR)', qid: 'Authorised signatory QID', company_doc: 'Company documentation (optional)', signed_agreement: 'Signed & stamped agreement' };

export function ZeroRiskPortal({ user = null, status: initialStatus = null }) {
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(!initialStatus);
  const [busy, setBusy] = useState(false);
  // profile form
  const [f, setF] = useState({ company_name: '', company_overview: '', products_services: '', existing_customers: '',
    pricing: '', services: '', target_industries: '', target_sizes: '', target_titles: '' });

  const loadStatus = useCallback(async () => {
    try { setStatus(await api.zrStatus()); } catch (e) { toast('Could not load your 0 Risk status.', 'error'); }
  }, []);

  const loadProfile = useCallback(async () => {
    try {
      const r = await api.zrProfile();
      const p = r.profile || {};
      setF({
        company_name: p.company_name || '', company_overview: p.company_overview || '',
        products_services: p.products_services || '', existing_customers: p.existing_customers || '',
        pricing: (Array.isArray(p.pricing_items) ? p.pricing_items.map((x) => (x && (x.item || x.label || x.value)) || '').filter(Boolean).join('\n') : ''),
        services: (Array.isArray(p.services_offered) ? p.services_offered.join('\n') : ''),
        target_industries: arrStr(p.target_industries), target_sizes: arrStr(p.target_sizes), target_titles: arrStr(p.target_titles),
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    (async () => { setLoading(true); await Promise.all([initialStatus ? Promise.resolve() : loadStatus(), loadProfile()]); setLoading(false); })();
  }, [loadStatus, loadProfile, initialStatus]);

  const saveProfile = async () => {
    setBusy(true);
    try {
      const r = await api.zrSaveProfile({
        company_name: f.company_name, company_overview: f.company_overview, products_services: f.products_services,
        existing_customers: f.existing_customers,
        pricing_items: toArr(f.pricing).map((item) => ({ item })),
        services_offered: toArr(f.services),
        target_industries: toArr(f.target_industries), target_sizes: toArr(f.target_sizes), target_titles: toArr(f.target_titles),
      });
      toast('Profile saved' + (r.completeness ? ` · ${r.completeness.pct}% complete` : ''));
      await loadStatus();
    } catch (e) { toast('Save failed: ' + e.message, 'error'); } finally { setBusy(false); }
  };

  const uploadDoc = async (kind, file) => {
    if (!file) return;
    setBusy(true);
    try {
      const content_base64 = await fileToBase64(file);
      await api.zrUploadDocument({ kind, filename: file.name, mime_type: file.type, content_base64 });
      toast(`${DOC_LABELS[kind] || kind} uploaded`);
      await loadStatus();
    } catch (e) {
      const m = e.message === 'file_too_large' ? 'File too large (max ~7MB).' : 'Upload failed: ' + e.message;
      toast(m, 'error');
    } finally { setBusy(false); }
  };

  const submitApp = async () => {
    setBusy(true);
    try { await api.zrSubmit(); toast('Submitted for review — we’ll notify you when approved.'); await loadStatus(); }
    catch (e) {
      if (e.message === 'profile_incomplete') toast('Complete your profile to 100% first.', 'error');
      else if (e.message === 'documents_missing') toast('Upload your CR, QID and signed agreement first.', 'error');
      else toast('Submit failed: ' + e.message, 'error');
    } finally { setBusy(false); }
  };

  const requestList = async () => {
    setBusy(true);
    try { const r = await api.zrRequestList(); toast(`List #${r.seq} requested (${r.size} companies) — our team is preparing it.`); await loadStatus(); }
    catch (e) { toast(e.message === 'cannot_request' ? 'You can’t request a list right now.' : 'Request failed: ' + e.message, 'error'); }
    finally { setBusy(false); }
  };

  const signOut = () => { try { window.__bdiAuth?.signOut?.(); } catch { window.location.href = '/sign-in'; } };

  // ---- render ----
  const st = status || {};
  const phase = st.zero_risk_status || 'onboarding';
  const pct = st.completeness?.pct ?? 0;

  return html`
    <div style=${shell}>
      <div style=${bar}>
        <strong style=${{ fontSize: '15px' }}>Bell · <span style=${{ color: 'var(--accent)' }}>0 Risk</span></strong>
        <span style=${muted}>Pay only when you win — ${st.revenue_share_pct ?? 15}% revenue share</span>
        <span style=${{ flex: 1 }}></span>
        ${user?.email ? html`<span style=${muted}>${user.email}</span>` : null}
        <button onClick=${signOut} style=${btn(false)}>Sign out</button>
      </div>
      <div style=${wrap}>
        ${loading ? html`<div style=${{ ...card, ...muted }}>Loading…</div>` : html`
          ${phase === 'approved' ? renderApproved({ st, busy, requestList })
            : phase === 'pending_approval' ? renderPending({ st })
            : renderOnboarding({ st, f, setF, busy, saveProfile, uploadDoc, submitApp, pct })}
        `}
      </div>
    </div>
  `;
}

// ---- onboarding ----
function renderOnboarding({ st, f, setF, busy, saveProfile, uploadDoc, submitApp, pct }) {
  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));
  const docs = st.documents || [];
  const docStatus = (kind) => (docs.find((d) => d.kind === kind) || {}).status || 'missing';
  const ta = { ...field, minHeight: '64px', resize: 'vertical', fontFamily: 'inherit' };
  return html`
    <div style=${card}>
      <div style=${{ fontSize: '17px', fontWeight: 700, marginBottom: '6px' }}>Welcome to Bell 0 Risk</div>
      <div style=${muted}>Tell us everything about your company and who you sell to. The more complete and precise, the better Bell can match you to high-fit prospects. Complete all of the below to 100%, upload your documents and sign the agreement — then submit for approval.</div>
      <div style=${{ marginTop: '14px', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '5px', overflow: 'hidden' }}>
        <div style=${{ width: pct + '%', height: '100%', background: pct >= 100 ? 'var(--green, #3fb950)' : 'var(--accent)', transition: 'width .3s' }}></div>
      </div>
      <div style=${{ ...muted, marginTop: '5px' }}>${pct}% complete${st.completeness?.missing?.length ? ` · still needed: ${st.completeness.missing.join(', ')}` : ''}</div>
    </div>

    <div style=${card}>
      <div style=${{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>1 · Your company & customers</div>
      <div style=${label}>Company name</div>
      <input style=${field} value=${f.company_name} onInput=${set('company_name')} placeholder="Acme Trading W.L.L." />
      <div style=${label}>Everything about your company</div>
      <textarea style=${ta} value=${f.company_overview} onInput=${set('company_overview')} placeholder="What you do, your story, scale, strengths, differentiators…"></textarea>
      <div style=${label}>Products / services you sell</div>
      <textarea style=${ta} value=${f.products_services} onInput=${set('products_services')} placeholder="Describe what you offer"></textarea>
      <div style=${label}>Services list (one per line)</div>
      <textarea style=${ta} value=${f.services} onInput=${set('services')} placeholder="e.g.\nIT support\nNetwork installation"></textarea>
      <div style=${label}>Existing customers (names / types you already serve)</div>
      <textarea style=${ta} value=${f.existing_customers} onInput=${set('existing_customers')} placeholder="Who buys from you today"></textarea>
      <div style=${label}>Pricing (one item per line)</div>
      <textarea style=${ta} value=${f.pricing} onInput=${set('pricing')} placeholder="e.g.\nMonthly retainer — QAR 5,000\nProject — from QAR 20,000"></textarea>
    </div>

    <div style=${card}>
      <div style=${{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>2 · Your ideal customer (ICP)</div>
      <div style=${muted}>Comma-separated. Bell finds Qatar companies matching this profile.</div>
      <div style=${label}>Target industries</div>
      <input style=${field} value=${f.target_industries} onInput=${set('target_industries')} placeholder="Construction, Hospitality, Oil & Gas" />
      <div style=${label}>Target company sizes</div>
      <input style=${field} value=${f.target_sizes} onInput=${set('target_sizes')} placeholder="SME, Mid-market, Enterprise" />
      <div style=${label}>Decision-maker titles to reach</div>
      <input style=${field} value=${f.target_titles} onInput=${set('target_titles')} placeholder="Procurement Manager, IT Director, CEO" />
      <div style=${{ marginTop: '14px' }}>
        <button onClick=${saveProfile} disabled=${busy} style=${btn(true)}>${busy ? 'Saving…' : 'Save profile'}</button>
      </div>
    </div>

    <div style=${card}>
      <div style=${{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>3 · Documents</div>
      <div style=${muted}>Upload your CR, the authorised signatory’s QID, and (after signing & stamping) the agreement. Max ~7MB each (PDF or image).</div>
      ${['cr', 'qid', 'company_doc', 'signed_agreement'].map((kind) => {
        const s = docStatus(kind);
        return html`<div key=${kind} style=${{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '10px', flexWrap: 'wrap' }}>
          <label style=${{ ...btn(false), cursor: 'pointer', display: 'inline-flex' }}>
            <input type="file" accept=".pdf,image/*" style=${{ display: 'none' }} onChange=${(e) => uploadDoc(kind, e.target.files && e.target.files[0])} />
            Upload
          </label>
          <span style=${{ fontSize: '12.5px', color: 'var(--text)' }}>${DOC_LABELS[kind]}</span>
          <span style=${{ flex: 1 }}></span>
          <span style=${{ fontSize: '11.5px', color: s === 'missing' ? 'var(--text-dim)' : 'var(--green, #3fb950)' }}>${s === 'missing' ? 'not uploaded' : s}</span>
        </div>`;
      })}
    </div>

    <div style=${card}>
      <div style=${{ fontSize: '14px', fontWeight: 700, marginBottom: '4px' }}>4 · The agreement</div>
      <div style=${muted}>
        0 Risk is governed by a revenue-share agreement: Bell provides deeply-researched prospect lists at no upfront cost, and you pay Bell <strong style=${{ color: 'var(--text)' }}>${st.revenue_share_pct ?? 15}%</strong> of the revenue you earn from any company Bell provides. You must sign and affix your company stamp, then upload it above as the “Signed & stamped agreement”. Your account manager will share the full agreement document for signing.
      </div>
      <div style=${{ marginTop: '14px' }}>
        <button onClick=${submitApp} disabled=${busy} style=${btn(true)}>${busy ? 'Submitting…' : 'Submit for approval'}</button>
        <span style=${{ ...muted, marginLeft: '10px' }}>Requires 100% profile + CR, QID and signed agreement uploaded.</span>
      </div>
    </div>
  `;
}

// ---- pending ----
function renderPending({ st }) {
  return html`<div style=${card}>
    <div style=${{ fontSize: '17px', fontWeight: 700, marginBottom: '8px' }}>⏳ Under review</div>
    <div style=${muted}>Thank you — your application is being reviewed by the Bell team. Once approved, you’ll be able to request your first list of 100 perfectly-matched prospects, each with a deep dossier. We’ll notify you here.</div>
  </div>`;
}

// ---- approved dashboard ----
function renderApproved({ st, busy, requestList }) {
  const lim = st.limits || {};
  return html`
    <div style=${card}>
      <div style=${{ fontSize: '17px', fontWeight: 700, marginBottom: '6px' }}>✅ You’re approved</div>
      <div style=${muted}>Request a list of up to <strong style=${{ color: 'var(--text)' }}>${lim.companies_per_request ?? 100}</strong> perfectly-matched prospects with full dossiers. You can request more as you close deals.</div>
      <div style=${{ display: 'flex', gap: '18px', margin: '14px 0', flexWrap: 'wrap' }}>
        <${Stat} k="List allowance" v=${lim.lists_allowed ?? 0} />
        <${Stat} k="Companies / list" v=${lim.companies_per_request ?? 100} />
        <${Stat} k="Deals won" v=${lim.finalized_won_count ?? 0} />
      </div>
      <button onClick=${requestList} disabled=${busy || !st.can_request_list} style=${btn(true)}>
        ${busy ? 'Requesting…' : 'Request a list'}
      </button>
      ${!st.can_request_list ? html`<span style=${{ ...muted, marginLeft: '10px' }}>${blockReason(st.request_block_reason)}</span>` : null}
    </div>
    <${RequestsAndDeals} />
  `;
}

function blockReason(r) {
  return ({ not_approved: 'Awaiting approval.', request_outstanding: 'A list is being prepared — finish it before requesting another.',
    no_allowance: 'Close a deal from your current list to unlock the next request.' }[r]) || '';
}

function Stat({ k, v }) {
  return html`<div><div style=${{ fontSize: '22px', fontWeight: 700 }}>${Number(v).toLocaleString()}</div><div style=${muted}>${k}</div></div>`;
}

// Requests (with dossiers) + deal reporting.
function RequestsAndDeals() {
  const [reqs, setReqs] = useState([]);
  const [deals, setDeals] = useState([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const [a, b] = await Promise.all([api.zrListRequests(), api.zrDeals()]); setReqs(a.rows || []); setDeals(b.rows || []); }
    catch { /* ignore */ }
  }, []);
  useEffect(() => { load(); }, [load]);

  const report = async (companyId, requestId, user_status) => {
    setBusy(true);
    try { await api.zrReportDeal({ company_id: companyId, request_id: requestId, user_status }); toast('Deal status updated'); await load(); }
    catch (e) { toast('Update failed: ' + e.message, 'error'); } finally { setBusy(false); }
  };
  const dealFor = (cid) => deals.find((d) => Number(d.company_id) === Number(cid));

  return html`
    <div style=${card}>
      <div style=${{ fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>Your lists</div>
      ${!reqs.length ? html`<div style=${muted}>No lists yet. Request your first one above.</div>` : reqs.map((rq) => html`
        <div key=${rq.id} style=${{ borderTop: '1px solid var(--border)', paddingTop: '10px', marginTop: '10px' }}>
          <div style=${{ fontWeight: 600, fontSize: '13px' }}>List #${rq.seq} · ${rq.size} companies · <span style=${{ color: rq.status === 'delivered' ? 'var(--green,#3fb950)' : 'var(--text-muted)' }}>${rq.status}</span></div>
          ${rq.status !== 'delivered' ? html`<div style=${muted}>Being prepared by the Bell team.</div>` : (rq.items || []).map((it) => {
            const d = dealFor(it.company_id);
            return html`<div key=${it.id} style=${{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', flexWrap: 'wrap' }}>
              <span style=${{ fontSize: '12.5px', color: 'var(--text)', minWidth: '180px' }}>${it.company_name || ('Company #' + it.company_id)}</span>
              <span style=${{ flex: 1 }}></span>
              ${d?.admin_status && d.admin_status !== 'open' ? html`<span style=${{ fontSize: '11.5px', color: 'var(--green,#3fb950)' }}>${d.admin_status.replace('finalized_', '')}</span>`
                : ['contacted', 'negotiating', 'won', 'lost'].map((s) => html`<button key=${s} onClick=${() => report(it.company_id, rq.id, s)} disabled=${busy}
                    style=${{ ...btn(d?.user_status === s), padding: '4px 9px', fontSize: '11px' }}>${s}</button>`)}
            </div>`;
          })}
        </div>`)}
    </div>
  `;
}
