// 0 Risk portal — full-screen experience for a tenant whose account_type is
// 'zero_risk'. Three-column layout: left nav · main section · right progress.
// Completeness updates LIVE (computed client-side from the form). The agreement
// (auto-filled with the company's CR/CC/QID/contact) unlocks at 100% for the
// user to review, sign & stamp, and upload — then submit for admin approval.
// Includes an "Upgrade to Bell" section to switch to a paid subscription.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const shell = { minHeight: '100vh', background: 'var(--bg, #0e1320)', color: 'var(--text, #e9edf5)' };
const topbar = { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 22px', borderBottom: '1px solid var(--border)', position: 'sticky', top: 0, background: 'var(--bg-elev-1, #141a2b)', zIndex: 10, flexWrap: 'wrap' };
const bodyRow = { display: 'flex', alignItems: 'flex-start', gap: '0', flexWrap: 'wrap' };
const leftNav = { width: '210px', flexShrink: 0, borderRight: '1px solid var(--border)', padding: '16px 10px', minHeight: 'calc(100vh - 54px)' };
const mainCol = { flex: 1, minWidth: '340px', padding: '22px 24px', maxWidth: '720px' };
const rightBar = { width: '290px', flexShrink: 0, borderLeft: '1px solid var(--border)', padding: '18px 18px' };
const card = { background: 'var(--bg-elev-2, #1a2034)', border: '1px solid var(--border)', borderRadius: '12px', padding: '18px 20px', marginBottom: '16px' };
const field = { background: 'rgba(255,255,255,0.04)', border: '1px solid var(--border)', color: 'var(--text)', borderRadius: '6px', padding: '9px 11px', fontSize: '13px', width: '100%', boxSizing: 'border-box' };
const lbl = { fontSize: '12px', fontWeight: 600, color: 'var(--text)', margin: '12px 0 5px' };
const muted = { color: 'var(--text-muted)', fontSize: '12.5px', lineHeight: 1.55 };
const btn = (p) => ({ background: p ? 'var(--accent)' : 'rgba(255,255,255,0.05)', border: '1px solid ' + (p ? 'var(--accent)' : 'var(--border)'), color: p ? '#fff' : 'var(--text)', borderRadius: '7px', padding: '9px 16px', fontSize: '13px', fontWeight: 600, cursor: 'pointer' });

const has = (v) => !!String(v == null ? '' : v).trim();
const toArr = (s) => String(s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const arrStr = (a) => (Array.isArray(a) ? a.join(', ') : '');
const fileToBase64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(file); });
const DOC_LABELS = { cr: 'Commercial Registration (CR)', qid: 'Authorised signatory QID', company_doc: 'Company documentation', signed_agreement: 'Signed & stamped agreement' };

export function ZeroRiskPortal({ user = null, status: initialStatus = null }) {
  const [status, setStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(!initialStatus);
  const [busy, setBusy] = useState(false);
  const [section, setSection] = useState('overview');
  const [terms, setTerms] = useState(null);
  const [signedConfirmed, setSignedConfirmed] = useState(false);
  const [f, setF] = useState({
    company_name: '', company_overview: '', products_services: '', existing_customers: '',
    pricing: '', services: '', target_industries: '', target_sizes: '', target_titles: '',
    cr_number: '', cc_number: '', qid_number: '', contact_number: '', contact_email: '',
  });

  const loadStatus = useCallback(async () => { try { setStatus(await api.zrStatus()); } catch { toast('Could not load your 0 Risk status.', 'error'); } }, []);
  const loadProfile = useCallback(async () => {
    try {
      const p = (await api.zrProfile()).profile || {};
      setF({
        company_name: p.company_name || '', company_overview: p.company_overview || '',
        products_services: p.products_services || '', existing_customers: p.existing_customers || '',
        pricing: Array.isArray(p.pricing_items) ? p.pricing_items.map((x) => (x && (x.item || x.label || x.value)) || '').filter(Boolean).join('\n') : '',
        services: Array.isArray(p.services_offered) ? p.services_offered.join('\n') : '',
        target_industries: arrStr(p.target_industries), target_sizes: arrStr(p.target_sizes), target_titles: arrStr(p.target_titles),
        cr_number: p.cr_number || '', cc_number: p.cc_number || '', qid_number: p.qid_number || '',
        contact_number: p.contact_number || '', contact_email: p.contact_email || '',
      });
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { (async () => { setLoading(true); await Promise.all([initialStatus ? Promise.resolve() : loadStatus(), loadProfile()]); setLoading(false); })(); }, [loadStatus, loadProfile, initialStatus]);

  // Load the auto-filled agreement terms when viewing the agreement section.
  useEffect(() => { if (section === 'agreement' && !terms) { api.zrAgreementTerms().then(setTerms).catch(() => {}); } }, [section, terms]);

  const set = (k) => (e) => setF((s) => ({ ...s, [k]: e.target.value }));

  const saveProfile = async () => {
    setBusy(true);
    try {
      await api.zrSaveProfile({
        company_name: f.company_name, company_overview: f.company_overview, products_services: f.products_services,
        existing_customers: f.existing_customers, pricing_items: toArr(f.pricing).map((item) => ({ item })), services_offered: toArr(f.services),
        target_industries: toArr(f.target_industries), target_sizes: toArr(f.target_sizes), target_titles: toArr(f.target_titles),
        cr_number: f.cr_number, cc_number: f.cc_number, qid_number: f.qid_number, contact_number: f.contact_number, contact_email: f.contact_email,
      });
      toast('Profile saved'); setTerms(null); await loadStatus();
    } catch (e) { toast('Save failed: ' + e.message, 'error'); } finally { setBusy(false); }
  };

  const uploadDoc = async (kind, file) => {
    if (!file) return; setBusy(true);
    try { await api.zrUploadDocument({ kind, filename: file.name, mime_type: file.type, content_base64: await fileToBase64(file) }); toast(`${DOC_LABELS[kind]} uploaded`); await loadStatus(); }
    catch (e) { toast(e.message === 'file_too_large' ? 'File too large (max ~7MB).' : 'Upload failed: ' + e.message, 'error'); } finally { setBusy(false); }
  };

  const submitApp = async () => {
    setBusy(true);
    try { await api.zrSubmit(); toast('Submitted for review — we’ll notify you when approved.'); await loadStatus(); setSection('overview'); }
    catch (e) {
      if (e.message === 'profile_incomplete') toast('Complete your profile to 100% first.', 'error');
      else if (e.message === 'documents_missing') toast('Upload your CR, QID and the signed agreement first.', 'error');
      else toast('Submit failed: ' + e.message, 'error');
    } finally { setBusy(false); }
  };

  const requestList = async () => {
    setBusy(true);
    try { const r = await api.zrRequestList(); toast(`List #${r.seq} requested (${r.size} companies).`); await loadStatus(); }
    catch (e) { toast(e.message === 'cannot_request' ? 'You can’t request a list right now.' : 'Request failed: ' + e.message, 'error'); } finally { setBusy(false); }
  };

  const switchToBell = async () => {
    if (!window.confirm('Switch to a paid Bell account? You’ll be taken to choose a plan. Your 0 Risk history is kept.')) return;
    try { await api.zrSwitch(); } catch { /* proceed anyway */ }
    window.location.href = '/subscribe';
  };

  const signOut = () => { try { window.__bdiAuth?.signOut?.(); } catch { window.location.href = '/sign-in'; } };

  // ---- live completeness (mirrors the server checks; updates as you type) ----
  const docByKind = {}; for (const d of (status?.documents || [])) if (!docByKind[d.kind]) docByKind[d.kind] = d;
  const checklist = [
    ['Company name', has(f.company_name)], ['Company overview', has(f.company_overview)],
    ['Products / services', has(f.products_services) || toArr(f.services).length > 0], ['Existing customers', has(f.existing_customers)],
    ['Pricing', toArr(f.pricing).length > 0], ['Target industries', toArr(f.target_industries).length > 0],
    ['Target company size', toArr(f.target_sizes).length > 0], ['Decision-maker titles', toArr(f.target_titles).length > 0],
    ['CR number', has(f.cr_number)], ['Computer Card number', has(f.cc_number)], ['QID number', has(f.qid_number)],
    ['Contact number', has(f.contact_number)], ['Contact email', has(f.contact_email)],
  ];
  const donePct = Math.round((checklist.filter((c) => c[1]).length / checklist.length) * 100);
  const st = status || {};
  const phase = st.zero_risk_status || 'onboarding';
  const approved = phase === 'approved';

  const NAV = [
    ['overview', 'Overview'], ['profile', 'Company profile'], ['documents', 'Documents'],
    ['agreement', 'Agreement'], ...(approved ? [['lists', 'My lists']] : []), ['upgrade', 'Upgrade to Bell'],
  ];

  return html`
    <div style=${shell}>
      <div style=${topbar}>
        <strong style=${{ fontSize: '15px' }}>Bell · <span style=${{ color: 'var(--accent)' }}>0 Risk</span></strong>
        <span style=${muted}>Pay only when you win — ${st.revenue_share_pct ?? 15}% revenue share</span>
        <span style=${{ flex: 1 }}></span>
        ${user?.email ? html`<span style=${muted}>${user.email}</span>` : null}
        <button onClick=${signOut} style=${btn(false)}>Sign out</button>
      </div>
      ${loading ? html`<div style=${{ padding: '30px', ...muted }}>Loading…</div>` : html`
      <div style=${bodyRow}>
        <div style=${leftNav}>
          ${NAV.map(([id, label]) => html`<button key=${id} onClick=${() => setSection(id)}
            style=${{ display: 'block', width: '100%', textAlign: 'left', padding: '9px 12px', marginBottom: '3px', borderRadius: '7px', cursor: 'pointer',
              fontSize: '13px', fontWeight: 600, border: '1px solid ' + (section === id ? 'var(--accent)' : 'transparent'),
              background: section === id ? 'rgba(96,165,250,0.12)' : 'transparent', color: section === id ? 'var(--text)' : 'var(--text-muted)' }}>${label}</button>`)}
          <div style=${{ ...muted, marginTop: '16px', padding: '0 12px' }}>Status: <b style=${{ color: 'var(--text)' }}>${phaseLabel(phase)}</b></div>
        </div>

        <div style=${mainCol}>
          ${section === 'overview' ? renderOverview({ phase, donePct, setSection, approved })
            : section === 'profile' ? renderProfile({ f, set, busy, saveProfile })
            : section === 'documents' ? renderDocuments({ docByKind, uploadDoc })
            : section === 'agreement' ? renderAgreement({ st, donePct, terms, docByKind, uploadDoc, signedConfirmed, setSignedConfirmed, submitApp, busy })
            : section === 'lists' ? html`<${RequestsAndDeals} canRequest=${st.can_request_list} blockReason=${st.request_block_reason} requestList=${requestList} busy=${busy} limits=${st.limits} />`
            : section === 'upgrade' ? renderUpgrade({ switchToBell })
            : null}
        </div>

        <div style=${rightBar}>
          <div style=${{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>Welcome to Bell 0 Risk</div>
          <div style=${muted}>Complete every item, upload your documents, and sign the agreement to get approved for your first list.</div>
          <div style=${{ margin: '14px 0 6px', height: '8px', background: 'rgba(255,255,255,0.08)', borderRadius: '5px', overflow: 'hidden' }}>
            <div style=${{ width: donePct + '%', height: '100%', background: donePct >= 100 ? 'var(--green, #3fb950)' : 'var(--accent)', transition: 'width .25s' }}></div>
          </div>
          <div style=${muted}><b style=${{ color: 'var(--text)' }}>${donePct}%</b> complete (live)</div>
          <div style=${{ marginTop: '14px' }}>
            ${checklist.map(([label, ok]) => html`<div key=${label} style=${{ display: 'flex', gap: '7px', alignItems: 'center', padding: '3px 0', fontSize: '12px', color: ok ? 'var(--text-muted)' : 'var(--text)' }}>
              <span style=${{ color: ok ? 'var(--green,#3fb950)' : 'var(--text-dim)' }}>${ok ? '✓' : '○'}</span> ${label}</div>`)}
          </div>
        </div>
      </div>`}
    </div>
  `;
}

function phaseLabel(p) { return ({ onboarding: 'Onboarding', pending_approval: 'Under review', approved: 'Approved', suspended: 'Suspended' }[p]) || p; }

function renderOverview({ phase, donePct, setSection, approved }) {
  return html`<div style=${card}>
    <div style=${{ fontSize: '17px', fontWeight: 700, marginBottom: '8px' }}>${approved ? '✅ You’re approved' : phase === 'pending_approval' ? '⏳ Under review' : 'Let’s get you set up'}</div>
    <div style=${muted}>${approved
      ? 'Head to “My lists” to request your first 100 perfectly-matched prospects.'
      : phase === 'pending_approval'
        ? 'Your application is with the Bell team. We’ll notify you here once it’s approved — then you can request your first list.'
        : 'Complete your company profile (including CR, QID and Computer Card numbers), upload your documents, then review and sign the agreement. When you’re at 100%, submit for approval.'}</div>
    <div style=${{ marginTop: '14px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
      ${!approved && phase !== 'pending_approval' ? html`
        <button onClick=${() => setSection('profile')} style=${btn(true)}>${donePct < 100 ? `Continue profile (${donePct}%)` : 'Profile complete ✓'}</button>
        <button onClick=${() => setSection('agreement')} style=${btn(false)}>Review agreement</button>` : null}
      ${approved ? html`<button onClick=${() => setSection('lists')} style=${btn(true)}>Go to my lists</button>` : null}
    </div>
  </div>`;
}

function renderProfile({ f, set, busy, saveProfile }) {
  const ta = { ...field, minHeight: '64px', resize: 'vertical', fontFamily: 'inherit' };
  return html`
    <div style=${card}>
      <div style=${{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Company & customers</div>
      <div style=${lbl}>Company name</div><input style=${field} value=${f.company_name} onInput=${set('company_name')} placeholder="Acme Trading W.L.L." />
      <div style=${lbl}>Everything about your company</div><textarea style=${ta} value=${f.company_overview} onInput=${set('company_overview')} placeholder="What you do, your story, scale, strengths…"></textarea>
      <div style=${lbl}>Products / services you sell</div><textarea style=${ta} value=${f.products_services} onInput=${set('products_services')}></textarea>
      <div style=${lbl}>Services list (one per line)</div><textarea style=${ta} value=${f.services} onInput=${set('services')}></textarea>
      <div style=${lbl}>Existing customers</div><textarea style=${ta} value=${f.existing_customers} onInput=${set('existing_customers')}></textarea>
      <div style=${lbl}>Pricing (one item per line)</div><textarea style=${ta} value=${f.pricing} onInput=${set('pricing')}></textarea>
    </div>
    <div style=${card}>
      <div style=${{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Ideal customer (comma-separated)</div>
      <div style=${lbl}>Target industries</div><input style=${field} value=${f.target_industries} onInput=${set('target_industries')} placeholder="Construction, Hospitality, Oil & Gas" />
      <div style=${lbl}>Target company sizes</div><input style=${field} value=${f.target_sizes} onInput=${set('target_sizes')} placeholder="SME, Mid-market, Enterprise" />
      <div style=${lbl}>Decision-maker titles</div><input style=${field} value=${f.target_titles} onInput=${set('target_titles')} placeholder="Procurement Manager, IT Director" />
    </div>
    <div style=${card}>
      <div style=${{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Legal details</div>
      <div style=${muted}>These are required and are auto-filled into your agreement.</div>
      <div style=${lbl}>CR number (Commercial Registration)</div><input style=${field} value=${f.cr_number} onInput=${set('cr_number')} />
      <div style=${lbl}>Computer Card (CC) number</div><input style=${field} value=${f.cc_number} onInput=${set('cc_number')} />
      <div style=${lbl}>Authorised signatory QID number</div><input style=${field} value=${f.qid_number} onInput=${set('qid_number')} />
      <div style=${lbl}>Contact number</div><input style=${field} value=${f.contact_number} onInput=${set('contact_number')} />
      <div style=${lbl}>Contact email</div><input style=${field} value=${f.contact_email} onInput=${set('contact_email')} />
      <div style=${{ marginTop: '14px' }}><button onClick=${saveProfile} disabled=${busy} style=${btn(true)}>${busy ? 'Saving…' : 'Save profile'}</button></div>
    </div>`;
}

function renderDocuments({ docByKind, uploadDoc }) {
  return html`<div style=${card}>
    <div style=${{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>Documents</div>
    <div style=${muted}>Upload your CR, the signatory’s QID, and any company documentation. Max ~7MB each (PDF or image). The signed agreement is uploaded in the Agreement section.</div>
    ${['cr', 'qid', 'company_doc'].map((kind) => {
      const s = (docByKind[kind] || {}).status || 'missing';
      return html`<div key=${kind} style=${{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '12px', flexWrap: 'wrap' }}>
        <label style=${{ ...btn(false), cursor: 'pointer', display: 'inline-flex' }}><input type="file" accept=".pdf,image/*" style=${{ display: 'none' }} onChange=${(e) => uploadDoc(kind, e.target.files && e.target.files[0])} />Upload</label>
        <span style=${{ fontSize: '12.5px' }}>${DOC_LABELS[kind]}</span><span style=${{ flex: 1 }}></span>
        <span style=${{ fontSize: '11.5px', color: s === 'missing' ? 'var(--text-dim)' : 'var(--green,#3fb950)' }}>${s === 'missing' ? 'not uploaded' : s}</span>
      </div>`;
    })}
  </div>`;
}

function renderAgreement({ st, donePct, terms, docByKind, uploadDoc, signedConfirmed, setSignedConfirmed, submitApp, busy }) {
  if (!st.agreement_ready && donePct < 100) {
    return html`<div style=${card}>
      <div style=${{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>Agreement</div>
      <div style=${muted}>Your agreement unlocks once your profile is 100% complete — including your CR, Computer Card, QID, contact number and email, which are filled into it automatically. You’re at <b style=${{ color: 'var(--text)' }}>${donePct}%</b>. Finish the profile, then come back here to review and sign.</div>
    </div>`;
  }
  const t = terms || {};
  const line = (k, v) => html`<div style=${{ display: 'flex', gap: '8px', padding: '3px 0', fontSize: '12.5px' }}><span style=${{ color: 'var(--text-dim)', minWidth: '150px' }}>${k}</span><span style=${{ color: 'var(--text)' }}>${v || '—'}</span></div>`;
  const signed = (docByKind.signed_agreement || {}).status && docByKind.signed_agreement.status !== 'missing';
  return html`
    <div style=${card}>
      <div style=${{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>Your 0 Risk Agreement</div>
      <div style=${muted}>Review the details below (auto-filled from your profile). Your account manager will provide the full agreement document containing these details; sign it, affix your company stamp, and upload it here.</div>
      <div style=${{ margin: '14px 0', padding: '12px 14px', border: '1px solid var(--border)', borderRadius: '8px', background: 'rgba(255,255,255,0.02)' }}>
        ${line('Company', t.company_name)} ${line('CR number', t.cr_number)} ${line('Computer Card', t.cc_number)}
        ${line('Signatory QID', t.qid_number)} ${line('Contact', [t.contact_number, t.contact_email].filter(Boolean).join(' · '))}
        ${line('Revenue share', (t.revenue_share_pct ?? 15) + '% of revenue from provided companies')} ${line('Governing law', t.jurisdiction || 'State of Qatar')}
      </div>
      <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', marginTop: '8px', flexWrap: 'wrap' }}>
        <label style=${{ ...btn(false), cursor: 'pointer', display: 'inline-flex' }}><input type="file" accept=".pdf,image/*" style=${{ display: 'none' }} onChange=${(e) => uploadDoc('signed_agreement', e.target.files && e.target.files[0])} />Upload signed & stamped agreement</label>
        <span style=${{ fontSize: '11.5px', color: signed ? 'var(--green,#3fb950)' : 'var(--text-dim)' }}>${signed ? 'uploaded' : 'not uploaded'}</span>
      </div>
      <label style=${{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '14px', fontSize: '12.5px', cursor: 'pointer' }}>
        <input type="checkbox" checked=${signedConfirmed} onChange=${(e) => setSignedConfirmed(e.target.checked)} />
        I confirm I have signed and stamped the agreement and agree to its terms.
      </label>
      <div style=${{ marginTop: '14px' }}>
        <button onClick=${submitApp} disabled=${busy || !signedConfirmed || !signed} style=${btn(true)}>${busy ? 'Submitting…' : 'Submit for approval'}</button>
      </div>
    </div>`;
}

function renderUpgrade({ switchToBell }) {
  const benefits = [
    'Search and reveal every company and decision-maker in Qatar — not just your provided lists.',
    'The full Bell platform: CRM, Map, Research, Signals, Market Feed and more.',
    'Unlimited self-serve prospecting on your own schedule, no request limits.',
    'Keep everything you’ve built in 0 Risk — your data carries over.',
  ];
  return html`<div style=${card}>
    <div style=${{ fontSize: '17px', fontWeight: 700, marginBottom: '6px' }}>Explore all of Qatar with Bell</div>
    <div style=${muted}>0 Risk gives you targeted lists. A full Bell subscription unlocks the entire Qatari market to explore yourself, any time.</div>
    <ul style=${{ margin: '14px 0', paddingLeft: '18px' }}>${benefits.map((b) => html`<li key=${b} style=${{ ...muted, marginBottom: '6px' }}>${b}</li>`)}</ul>
    <button onClick=${switchToBell} style=${btn(true)}>Switch to a Bell subscription →</button>
  </div>`;
}

// Approved-only: request lists + work deliveries + report deals.
function RequestsAndDeals({ canRequest, blockReason, requestList, busy, limits }) {
  const [reqs, setReqs] = useState([]);
  const [deals, setDeals] = useState([]);
  const [b2, setB2] = useState(false);
  const load = useCallback(async () => { try { const [a, b] = await Promise.all([api.zrListRequests(), api.zrDeals()]); setReqs(a.rows || []); setDeals(b.rows || []); } catch { /* ignore */ } }, []);
  useEffect(() => { load(); }, [load]);
  const report = async (companyId, requestId, user_status) => { setB2(true); try { await api.zrReportDeal({ company_id: companyId, request_id: requestId, user_status }); toast('Deal status updated'); await load(); } catch (e) { toast('Update failed: ' + e.message, 'error'); } finally { setB2(false); } };
  const dealFor = (cid) => deals.find((d) => Number(d.company_id) === Number(cid));
  const lim = limits || {};
  return html`
    <div style=${card}>
      <div style=${{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>Request a list</div>
      <div style=${muted}>Allowance: <b style=${{ color: 'var(--text)' }}>${lim.lists_allowed ?? 0}</b> · up to <b style=${{ color: 'var(--text)' }}>${lim.companies_per_request ?? 100}</b> companies each · ${lim.finalized_won_count ?? 0} deals won.</div>
      <div style=${{ marginTop: '12px' }}>
        <button onClick=${requestList} disabled=${busy || !canRequest} style=${btn(true)}>${busy ? 'Requesting…' : 'Request a list'}</button>
        ${!canRequest ? html`<span style=${{ ...muted, marginLeft: '10px' }}>${({ request_outstanding: 'A list is being prepared — finish it first.', no_allowance: 'Close a deal to unlock the next request.' }[blockReason]) || ''}</span>` : null}
      </div>
    </div>
    <div style=${card}>
      <div style=${{ fontSize: '15px', fontWeight: 700, marginBottom: '6px' }}>Your lists</div>
      ${!reqs.length ? html`<div style=${muted}>No lists yet.</div>` : reqs.map((rq) => html`
        <div key=${rq.id} style=${{ borderTop: '1px solid var(--border)', paddingTop: '10px', marginTop: '10px' }}>
          <div style=${{ fontWeight: 600, fontSize: '13px' }}>List #${rq.seq} · ${rq.size} companies · <span style=${{ color: rq.status === 'delivered' ? 'var(--green,#3fb950)' : 'var(--text-muted)' }}>${rq.status}</span></div>
          ${rq.status !== 'delivered' ? html`<div style=${muted}>Being prepared by the Bell team.</div>` : (rq.items || []).map((it) => {
            const d = dealFor(it.company_id);
            return html`<div key=${it.id} style=${{ display: 'flex', alignItems: 'center', gap: '8px', padding: '7px 0', borderBottom: '1px solid rgba(255,255,255,0.04)', flexWrap: 'wrap' }}>
              <span style=${{ fontSize: '12.5px', minWidth: '180px' }}>${it.company_name || ('Company #' + it.company_id)}</span><span style=${{ flex: 1 }}></span>
              ${d?.admin_status && d.admin_status !== 'open' ? html`<span style=${{ fontSize: '11.5px', color: 'var(--green,#3fb950)' }}>${d.admin_status.replace('finalized_', '')}</span>`
                : ['contacted', 'negotiating', 'won', 'lost'].map((s) => html`<button key=${s} onClick=${() => report(it.company_id, rq.id, s)} disabled=${b2} style=${{ ...btn(d?.user_status === s), padding: '4px 9px', fontSize: '11px' }}>${s}</button>`)}
            </div>`;
          })}
        </div>`)}
    </div>`;
}
