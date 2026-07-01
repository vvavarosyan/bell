// 0 Risk portal — full-screen experience for a tenant whose account_type is
// 'zero_risk'. Uses Bell's own design system (sys-page / settings-rail /
// sys-section / sys-grid / sys-field / sys-input / sys-btn) so it matches the
// rest of the product. Left rail nav · main body · right live-progress rail.
// Completeness updates LIVE from the form. The agreement (auto-filled with the
// company's CR/CC/QID/contact) unlocks at 100% to review, sign, upload → submit.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const page = { display: 'flex', flexDirection: 'column', height: '100vh', background: 'var(--bg)', color: 'var(--text)' };
const header = { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--bg-elev)', flexShrink: 0 };
const rightRail = { width: '300px', flexShrink: 0, borderLeft: '1px solid var(--border)', background: 'var(--bg-elev)', padding: '22px 20px', overflowY: 'auto' };
const muted = { color: 'var(--text-dim)', fontSize: '12px', lineHeight: 1.55 };

const has = (v) => !!String(v == null ? '' : v).trim();
// Field validators (mirror server ZR_VALID): QID = 11 digits, phone = valid Qatar
// number, email valid, CR/CC numeric. Empty is invalid — these gate the agreement.
const V = {
  email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v || '').trim()),
  phone: (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length === 8 || (d.length === 11 && d.startsWith('974')); },
  qid:   (v) => String(v || '').replace(/\D/g, '').length === 11,
  cr:    (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 4 && d.length <= 12; },
  cc:    (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 4 && d.length <= 15; },
};
const toArr = (s) => String(s || '').split(/[,\n]/).map((x) => x.trim()).filter(Boolean);
const arrStr = (a) => (Array.isArray(a) ? a.join(', ') : '');
const fileToBase64 = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(file); });
const DOC_LABELS = { cr: 'Commercial Registration (CR)', qid: 'Authorised signatory QID', company_doc: 'Company documentation', signed_agreement: 'Signed & stamped agreement' };

// Generate the company's agreement as a filled PDF (client-side jsPDF via the
// import map). Auto-fills the company's CR/CC/QID/contact + the revenue share.
async function downloadAgreementPdf(t = {}) {
  const mod = await import('jspdf');
  const JsPDF = mod.jsPDF || mod.default;
  const doc = new JsPDF({ unit: 'pt', format: 'a4' });
  const M = 56, PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight(), W = PW - M * 2;
  let y = M;
  const ensure = (h) => { if (y + h > PH - M) { doc.addPage(); y = M; } };
  const H = (txt, size = 12) => { ensure(size + 14); doc.setFont('helvetica', 'bold'); doc.setFontSize(size); doc.text(txt, M, y); y += size + 8; };
  const P = (txt, size = 10) => { doc.setFont('helvetica', 'normal'); doc.setFontSize(size); for (const ln of doc.splitTextToSize(txt, W)) { ensure(size + 4); doc.text(ln, M, y); y += size + 4; } y += 6; };
  const pct = t.revenue_share_pct ?? 15;
  const juris = t.jurisdiction || 'State of Qatar';
  doc.setFont('helvetica', 'bold'); doc.setFontSize(15); doc.text('BELL DATA INTELLIGENCE — 0 RISK AGREEMENT', PW / 2, y, { align: 'center' }); y += 22;
  doc.setFont('helvetica', 'italic'); doc.setFontSize(9); doc.setTextColor(150, 40, 40);
  doc.text('DRAFT — pending legal review. Final wording subject to confirmation by counsel.', PW / 2, y, { align: 'center' }); y += 20;
  doc.setTextColor(20, 20, 20);
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
  P(`This 0 Risk Agreement ("Agreement") is made on ${today} between Bell Data Intelligence ("Bell") and ${t.company_name || '[Company]'} ("the Company").`);
  H('1. Parties & details');
  P(`Company: ${t.company_name || '____'}     CR No.: ${t.cr_number || '____'}     Computer Card No.: ${t.cc_number || '____'}`);
  P(`Authorised signatory QID No.: ${t.qid_number || '____'}     Contact: ${[t.contact_number, t.contact_email].filter(Boolean).join('   ·   ') || '____'}`);
  H('2. The arrangement');
  P('Bell provides the Company with curated, deeply-researched lists of prospective customers ("Provided Companies") at no upfront cost. The Company pays Bell a share of the revenue it earns from any Provided Company, as set out below.');
  H('3. Revenue share');
  P(`The Company shall pay Bell ${pct}% of all revenue it (or any affiliate) earns from a binding sale, contract or engagement with any Provided Company, for the full duration of that engagement including renewals, whether concluded during the term or within a twelve-month tail period. Amounts are payable within 30 days of invoicing or receipt.`);
  H('4. Reporting & finalisation');
  P('The Company shall record the status of each dealing with a Provided Company in the Bell portal. A deal is a finalised, revenue-share-bearing "Closed Deal" only when Bell marks it finalised. The Company shall keep accurate records and provide statements on request; Bell may audit them.');
  H('5. Non-circumvention & confidentiality');
  P('The Company shall not avoid or reduce the revenue share by routing deals through third parties, mischaracterising revenue, or transacting off-book. The lists and research are Bell’s confidential property and may not be resold, shared or disclosed.');
  H('6. Term, breach & enforcement');
  P('This Agreement continues until terminated on 30 days’ notice; Bell may suspend or terminate immediately for breach or non-payment. Failure to report a Closed Deal, underpayment, circumvention, or misuse of the lists is a material breach entitling Bell to recover all amounts owed plus costs and to pursue all legal remedies. The Company acknowledges this signed and stamped Agreement is binding and may be relied upon as evidence in proceedings.');
  H('7. Data protection & governing law');
  P(`The Company is responsible for using any information lawfully, including under Qatar Law No. (13) of 2016 (PDPPL). This Agreement is governed by the laws of the ${juris}, and the Parties submit to its competent courts.`);
  ensure(150);
  y += 8; doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text('Signatures', M, y); y += 22;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10);
  const c2 = M + W / 2 + 10;
  doc.text('For Bell Data Intelligence', M, y); doc.text('For ' + (t.company_name || 'the Company'), c2, y); y += 34;
  doc.text('Name: __________________', M, y); doc.text('Name: __________________', c2, y); y += 26;
  doc.text('Signature: ______________', M, y); doc.text('Signature: ______________', c2, y); y += 26;
  doc.text('Date: __________________', M, y); doc.text('Date: __________________', c2, y); y += 30;
  doc.text('Company stamp:', c2, y);
  doc.save(`Bell-0Risk-Agreement-${String(t.company_name || 'company').replace(/[^a-z0-9]+/gi, '-')}.pdf`);
}

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
    ['CR number', V.cr(f.cr_number)], ['Computer Card number', V.cc(f.cc_number)], ['QID number', V.qid(f.qid_number)],
    ['Contact number', V.phone(f.contact_number)], ['Contact email', V.email(f.contact_email)],
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
    <div style=${page}>
      <div style=${header}>
        <strong style=${{ fontSize: '15px', letterSpacing: '.3px' }}>Bell <span style=${{ color: 'var(--text-dim)', fontWeight: 400 }}>/</span> <span style=${{ color: 'var(--accent-bright)' }}>0 Risk</span></strong>
        <span style=${{ ...muted, borderLeft: '1px solid var(--border)', paddingLeft: '12px' }}>Pay only when you win — ${st.revenue_share_pct ?? 15}% revenue share</span>
        <span style=${{ flex: 1 }}></span>
        ${user?.email ? html`<span style=${muted}>${user.email}</span>` : null}
        <button class="sys-btn sys-btn-secondary" onClick=${signOut}>Sign out</button>
      </div>

      ${loading ? html`<div class="sys-page"><div class="sys-body"><div class="empty">Loading…</div></div></div>` : html`
      <div class="sys-page">
        <div class="settings-rail">
          <div class="settings-rail-title">0 Risk</div>
          ${NAV.map(([id, label]) => html`<button key=${id} class=${'settings-rail-item' + (section === id ? ' active' : '')} onClick=${() => setSection(id)}>${label}</button>`)}
          <div style=${{ marginTop: 'auto', padding: '14px 10px 4px', ...muted }}>Status<br/><b style=${{ color: 'var(--text)', fontSize: '13px' }}>${phaseLabel(phase)}</b></div>
        </div>

        <div class="sys-body">
          ${section === 'overview' ? renderOverview({ phase, donePct, setSection, approved })
            : section === 'profile' ? renderProfile({ f, set, busy, saveProfile })
            : section === 'documents' ? renderDocuments({ docByKind, uploadDoc })
            : section === 'agreement' ? renderAgreement({ st, donePct, terms, docByKind, uploadDoc, signedConfirmed, setSignedConfirmed, submitApp, busy })
            : section === 'lists' ? html`<${RequestsAndDeals} canRequest=${st.can_request_list} blockReason=${st.request_block_reason} requestList=${requestList} busy=${busy} limits=${st.limits} />`
            : section === 'upgrade' ? renderUpgrade({ switchToBell })
            : null}
        </div>

        <div style=${rightRail}>
          <div style=${{ fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>Welcome to Bell 0 Risk</div>
          <div style=${muted}>Complete every item, upload your documents, and sign the agreement to get approved for your first list.</div>
          <div style=${{ margin: '16px 0 6px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style=${{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: 'var(--text-muted)', fontWeight: 600 }}>Profile</span>
            <b style=${{ fontSize: '18px', color: donePct >= 100 ? 'var(--green)' : 'var(--text)' }}>${donePct}%</b>
          </div>
          <div style=${{ height: '7px', background: 'var(--bg-elev-2)', borderRadius: '5px', overflow: 'hidden' }}>
            <div style=${{ width: donePct + '%', height: '100%', background: donePct >= 100 ? 'var(--green)' : 'var(--accent)', transition: 'width .25s' }}></div>
          </div>
          <div style=${{ marginTop: '16px', display: 'flex', flexDirection: 'column', gap: '2px' }}>
            ${checklist.map(([label, ok]) => html`<div key=${label} style=${{ display: 'flex', gap: '8px', alignItems: 'center', padding: '4px 0', fontSize: '12px', color: ok ? 'var(--text-muted)' : 'var(--text)' }}>
              <span style=${{ width: '15px', textAlign: 'center', color: ok ? 'var(--green)' : 'var(--text-dim)' }}>${ok ? '✓' : '○'}</span> ${label}</div>`)}
          </div>
        </div>
      </div>`}
    </div>
  `;
}

function phaseLabel(p) { return ({ onboarding: 'Onboarding', pending_approval: 'Under review', approved: 'Approved', suspended: 'Suspended' }[p]) || p; }

function renderOverview({ phase, donePct, setSection, approved }) {
  return html`<div class="sys-section">
    <h2>${approved ? 'You’re approved' : phase === 'pending_approval' ? 'Under review' : 'Let’s get you set up'}</h2>
    <div class="sys-hint">${approved
      ? 'Head to “My lists” to request your first 100 perfectly-matched prospects.'
      : phase === 'pending_approval'
        ? 'Your application is with the Bell team. We’ll notify you here once it’s approved — then you can request your first list.'
        : 'Complete your company profile (including CR, QID and Computer Card numbers), upload your documents, then review and sign the agreement. When you reach 100%, submit for approval.'}</div>
    <div class="sys-actions">
      ${!approved && phase !== 'pending_approval' ? html`
        <button class="sys-btn" onClick=${() => setSection('profile')}>${donePct < 100 ? `Continue profile (${donePct}%)` : 'Review agreement'}</button>
        <button class="sys-btn sys-btn-secondary" onClick=${() => setSection('agreement')}>View agreement</button>` : null}
      ${approved ? html`<button class="sys-btn" onClick=${() => setSection('lists')}>Go to my lists</button>` : null}
    </div>
  </div>`;
}

function renderProfile({ f, set, busy, saveProfile }) {
  const fld = (k, label, opts = {}) => {
    const bad = opts.validate && has(f[k]) && !opts.validate(f[k]);
    return html`<div class=${'sys-field' + (opts.full ? ' full' : '')}>
      <label>${label}</label>
      ${opts.area ? html`<textarea class="sys-textarea" value=${f[k]} onInput=${set(k)} placeholder=${opts.ph || ''}></textarea>`
        : html`<input class="sys-input" style=${bad ? { borderColor: 'var(--red)' } : {}} value=${f[k]} onInput=${set(k)} placeholder=${opts.ph || ''} />`}
      ${bad ? html`<span style=${{ fontSize: '11px', color: 'var(--red)' }}>${opts.err || 'Invalid'}</span>` : null}
    </div>`;
  };
  return html`
    <div class="sys-section">
      <h2>Company & customers</h2>
      <div class="sys-hint">Tell us everything about your business and who you sell to — the more precise, the better Bell matches you to high-fit prospects.</div>
      <div class="sys-grid">
        ${fld('company_name', 'Company name', { full: true, ph: 'Acme Trading W.L.L.' })}
        ${fld('company_overview', 'Everything about your company', { full: true, area: true, ph: 'What you do, your story, scale, strengths…' })}
        ${fld('products_services', 'Products / services you sell', { full: true, area: true })}
        ${fld('services', 'Services list (one per line)', { full: true, area: true })}
        ${fld('existing_customers', 'Existing customers', { full: true, area: true, ph: 'Who buys from you today' })}
        ${fld('pricing', 'Pricing (one item per line)', { full: true, area: true, ph: 'Monthly retainer — QAR 5,000\nProject — from QAR 20,000' })}
      </div>
    </div>
    <div class="sys-section">
      <h2>Ideal customer</h2>
      <div class="sys-hint">Comma-separated. Bell finds Qatar companies matching this profile.</div>
      <div class="sys-grid">
        ${fld('target_industries', 'Target industries', { full: true, ph: 'Construction, Hospitality, Oil & Gas' })}
        ${fld('target_sizes', 'Target company sizes', { ph: 'SME, Mid-market, Enterprise' })}
        ${fld('target_titles', 'Decision-maker titles', { ph: 'Procurement Manager, IT Director' })}
      </div>
    </div>
    <div class="sys-section">
      <h2>Legal details</h2>
      <div class="sys-hint">Required — these are auto-filled into your agreement.</div>
      <div class="sys-grid">
        ${fld('cr_number', 'CR number (Commercial Registration)', { validate: V.cr, err: 'Numbers only (4–12 digits).' })}
        ${fld('cc_number', 'Computer Card (CC) number', { validate: V.cc, err: 'Numbers only.' })}
        ${fld('qid_number', 'Authorised signatory QID number', { validate: V.qid, err: 'QID must be exactly 11 digits.' })}
        ${fld('contact_number', 'Contact number', { validate: V.phone, err: 'Valid Qatar number — 8 digits (optionally +974).' })}
        ${fld('contact_email', 'Contact email', { validate: V.email, err: 'Enter a valid email address.' })}
      </div>
      <div class="sys-actions"><button class="sys-btn" disabled=${busy} onClick=${saveProfile}>${busy ? 'Saving…' : 'Save profile'}</button></div>
    </div>`;
}

function renderDocuments({ docByKind, uploadDoc }) {
  const row = (kind) => {
    const s = (docByKind[kind] || {}).status || 'missing';
    return html`<div key=${kind} style=${{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid var(--border)' }}>
      <label class="sys-btn sys-btn-secondary" style=${{ cursor: 'pointer' }}><input type="file" accept=".pdf,image/*" style=${{ display: 'none' }} onChange=${(e) => uploadDoc(kind, e.target.files && e.target.files[0])} />Upload</label>
      <span style=${{ fontSize: '13px' }}>${DOC_LABELS[kind]}</span><span style=${{ flex: 1 }}></span>
      <span style=${{ fontSize: '12px', color: s === 'missing' ? 'var(--text-dim)' : 'var(--green)' }}>${s === 'missing' ? 'not uploaded' : s}</span>
    </div>`;
  };
  return html`<div class="sys-section">
    <h2>Documents</h2>
    <div class="sys-hint">Upload your CR, the signatory’s QID, and any company documentation. Max ~7MB each (PDF or image). The signed agreement is uploaded in the Agreement section.</div>
    <div style=${{ maxWidth: '640px' }}>${['cr', 'qid', 'company_doc'].map(row)}</div>
  </div>`;
}

function renderAgreement({ st, donePct, terms, docByKind, uploadDoc, signedConfirmed, setSignedConfirmed, submitApp, busy }) {
  if (!st.agreement_ready) {
    return html`<div class="sys-section">
      <h2>Agreement</h2>
      <div class="sys-hint">Your agreement unlocks once your profile is 100% complete (with a valid CR, Computer Card, QID, contact number and email — these fill into it automatically). You’re at <b style=${{ color: 'var(--text)' }}>${donePct}%</b>. Complete and save your profile, then come back to review and sign.</div>
    </div>`;
  }
  const crUp = (docByKind.cr || {}).status && docByKind.cr.status !== 'missing';
  const qidUp = (docByKind.qid || {}).status && docByKind.qid.status !== 'missing';
  if (!crUp || !qidUp) {
    return html`<div class="sys-section">
      <h2>Agreement</h2>
      <div class="sys-hint">Before you can download and sign the agreement, please upload your <b style=${{ color: 'var(--text)' }}>CR</b> and <b style=${{ color: 'var(--text)' }}>QID</b> in the <b style=${{ color: 'var(--text)' }}>Documents</b> section.</div>
    </div>`;
  }
  const t = terms || {};
  const line = (k, v) => html`<div style=${{ display: 'flex', gap: '10px', padding: '5px 0', fontSize: '13px', borderBottom: '1px solid var(--border)' }}><span style=${{ color: 'var(--text-muted)', minWidth: '160px' }}>${k}</span><span>${v || '—'}</span></div>`;
  const signed = (docByKind.signed_agreement || {}).status && docByKind.signed_agreement.status !== 'missing';
  return html`<div class="sys-section">
    <h2>Your 0 Risk Agreement</h2>
    <div class="sys-hint">Review the details below (auto-filled from your profile), download the agreement, sign it and affix your company stamp, then upload the signed copy.</div>
    <div style=${{ maxWidth: '620px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-elev)', padding: '16px 18px' }}>
      ${line('Company', t.company_name)} ${line('CR number', t.cr_number)} ${line('Computer Card', t.cc_number)}
      ${line('Signatory QID', t.qid_number)} ${line('Contact', [t.contact_number, t.contact_email].filter(Boolean).join(' · '))}
      ${line('Revenue share', (t.revenue_share_pct ?? 15) + '% of revenue from provided companies')}
      <div style=${{ display: 'flex', gap: '10px', padding: '5px 0', fontSize: '13px' }}><span style=${{ color: 'var(--text-muted)', minWidth: '160px' }}>Governing law</span><span>${t.jurisdiction || 'State of Qatar'}</span></div>
    </div>
    <div class="sys-actions" style=${{ marginTop: '16px' }}>
      <button class="sys-btn" onClick=${() => downloadAgreementPdf(t).catch((e) => toast('Could not build the PDF: ' + (e.message || e), 'error'))}>Download agreement (PDF)</button>
    </div>
    <div style=${{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '16px', maxWidth: '620px' }}>
      <label class="sys-btn sys-btn-secondary" style=${{ cursor: 'pointer' }}><input type="file" accept=".pdf,image/*" style=${{ display: 'none' }} onChange=${(e) => uploadDoc('signed_agreement', e.target.files && e.target.files[0])} />Upload signed & stamped agreement</label>
      <span style=${{ fontSize: '12px', color: signed ? 'var(--green)' : 'var(--text-dim)' }}>${signed ? 'uploaded' : 'not uploaded'}</span>
    </div>
    <label style=${{ display: 'flex', gap: '9px', alignItems: 'center', marginTop: '16px', fontSize: '13px', cursor: 'pointer' }}>
      <input type="checkbox" style=${{ width: '16px', height: '16px', accentColor: 'var(--accent)' }} checked=${signedConfirmed} onChange=${(e) => setSignedConfirmed(e.target.checked)} />
      I confirm I have signed and stamped the agreement and agree to its terms.
    </label>
    <div class="sys-actions"><button class="sys-btn" disabled=${busy || !signedConfirmed || !signed} onClick=${submitApp}>${busy ? 'Submitting…' : 'Submit for approval'}</button></div>
  </div>`;
}

function renderUpgrade({ switchToBell }) {
  const benefits = [
    'Search and reveal every company and decision-maker in Qatar — not just your provided lists.',
    'The full Bell platform: CRM, Map, Research, Signals, Market Feed and more.',
    'Unlimited self-serve prospecting on your own schedule, no request limits.',
    'Keep everything you’ve built in 0 Risk — your data carries over.',
  ];
  return html`<div class="sys-section">
    <h2>Explore all of Qatar with Bell</h2>
    <div class="sys-hint">0 Risk gives you targeted lists. A full Bell subscription unlocks the entire Qatari market to explore yourself, any time.</div>
    <ul style=${{ margin: '0 0 18px', paddingLeft: '18px', maxWidth: '640px' }}>${benefits.map((b) => html`<li key=${b} style=${{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px', lineHeight: 1.5 }}>${b}</li>`)}</ul>
    <div class="sys-actions"><button class="sys-btn" onClick=${switchToBell}>Switch to a Bell subscription →</button></div>
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
  const btnMini = (on) => ({ background: on ? 'var(--accent)' : 'var(--bg-elev-2)', border: '1px solid ' + (on ? 'var(--accent)' : 'var(--border)'), color: on ? '#fff' : 'var(--text-muted)', borderRadius: '6px', padding: '4px 10px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' });
  return html`
    <div class="sys-section">
      <h2>Request a list</h2>
      <div class="sys-hint">Allowance: <b style=${{ color: 'var(--text)' }}>${lim.lists_allowed ?? 0}</b> · up to <b style=${{ color: 'var(--text)' }}>${lim.companies_per_request ?? 100}</b> companies each · ${lim.finalized_won_count ?? 0} deals won.</div>
      <div class="sys-actions">
        <button class="sys-btn" disabled=${busy || !canRequest} onClick=${requestList}>${busy ? 'Requesting…' : 'Request a list'}</button>
        ${!canRequest ? html`<span style=${{ ...muted, alignSelf: 'center' }}>${({ request_outstanding: 'A list is being prepared — finish it first.', no_allowance: 'Close a deal to unlock the next request.' }[blockReason]) || ''}</span>` : null}
      </div>
    </div>
    <div class="sys-section">
      <h2>Your lists</h2>
      ${!reqs.length ? html`<div class="empty">No lists yet.</div>` : reqs.map((rq) => html`
        <div key=${rq.id} style=${{ marginBottom: '14px' }}>
          <div style=${{ fontWeight: 600, fontSize: '13px', marginBottom: '4px' }}>List #${rq.seq} · ${rq.size} companies · <span style=${{ color: rq.status === 'delivered' ? 'var(--green)' : 'var(--text-muted)' }}>${rq.status}</span></div>
          ${rq.status !== 'delivered' ? html`<div style=${muted}>Being prepared by the Bell team.</div>` : (rq.items || []).map((it) => {
            const d = dealFor(it.company_id);
            return html`<div key=${it.id} style=${{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 0', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
              <span style=${{ fontSize: '13px', minWidth: '190px' }}>${it.company_name || ('Company #' + it.company_id)}</span><span style=${{ flex: 1 }}></span>
              ${d?.admin_status && d.admin_status !== 'open' ? html`<span style=${{ fontSize: '11.5px', color: 'var(--green)' }}>${d.admin_status.replace('finalized_', '')}</span>`
                : ['contacted', 'negotiating', 'won', 'lost'].map((s) => html`<button key=${s} onClick=${() => report(it.company_id, rq.id, s)} disabled=${b2} style=${btnMini(d?.user_status === s)}>${s}</button>`)}
            </div>`;
          })}
        </div>`)}
    </div>`;
}
