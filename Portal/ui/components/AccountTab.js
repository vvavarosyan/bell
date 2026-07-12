// System → Settings. Left rail (Profile / Email / Notifications / Preferences /
// Account & Security) + a full-bleed, modern body (.sys-body).

import { useState, useEffect, useRef } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { BELLA_ACTION_EVENT, takePending } from '../lib/bellaBus.js';

const SECTIONS = [
  { id: 'profile',       label: 'Profile' },
  { id: 'email',         label: 'Email' },
  { id: 'domain',        label: 'Sending domain' },
  { id: 'whatsapp',      label: 'WhatsApp' },
  { id: 'icp',           label: 'Company & ICP' },
  { id: 'bella',         label: 'Bella' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'preferences',   label: 'Preferences' },
  { id: 'security',      label: 'Account & Security' },
];
const FUNCTION_TEAMS = ['', 'sales', 'bd', 'marketing', 'research', 'gtm'];
const cbStyle = { width: '16px', height: '16px', accentColor: 'var(--accent)', cursor: 'pointer' };

// ICP picker suggestions (users can also type their own).
const ICP_GROUP = { fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700, color: 'var(--text-dim)', margin: '20px 0 8px' };
const ICP_INDUSTRIES = ['Construction', 'Real Estate', 'Oil & Gas', 'Energy', 'Healthcare', 'Education', 'Hospitality', 'Retail', 'Finance & Banking', 'Insurance', 'Logistics & Transport', 'Manufacturing', 'Technology', 'Telecommunications', 'Professional Services', 'Government', 'Food & Beverage', 'Automotive', 'Media', 'Engineering'];
const ICP_SIZES = ['1–10', '11–50', '51–200', '201–500', '501–1000', '1000+'];
const ICP_TITLES = ['CEO', 'Managing Director', 'General Manager', 'Founder / Owner', 'COO', 'CFO', 'CTO', 'CMO', 'Head of Procurement', 'Procurement Manager', 'Operations Manager', 'Sales Director', 'Marketing Manager', 'IT Manager', 'HR Manager', 'Finance Manager', 'Business Development Manager', 'Purchasing Manager', 'Project Manager'];
const ICP_TECH = ['WordPress', 'Shopify', 'Wix', 'Squarespace', 'WooCommerce', 'Magento', 'Salesforce', 'HubSpot', 'Zoho', 'SAP', 'Oracle', 'Microsoft 365', 'Google Workspace'];
const ICP_SIGNALS = ['Hiring / expanding team', 'Opening a new branch', 'Recently funded', 'New product launch', 'Leadership change', 'Office relocation', 'Active tender / RFP', 'Digital transformation', 'Website redesign', 'Entering a new market', 'Newly licensed', 'Won a government contract'];
const ICP_WEBSITE = [['any', 'Any'], ['has', 'Has a website'], ['none', 'No website']];

export function AccountTab() {
  const [data, setData] = useState(null);
  const [section, setSection] = useState('profile');
  const [saving, setSaving] = useState(false);

  useEffect(() => { (async () => {
    try { setData(await api.getAccount()); } catch { setData({ profile: {}, notifications: {}, preferences: {} }); }
  })(); }, []);

  // Bella integration (all hooks above the early return — Rules of Hooks):
  //  • 'settings_section' ui-action switches the visible sub-page (live when
  //    mounted; stashed by app.js + picked up here on mount otherwise).
  //  • When Bella WRITES the ICP / account prefs through her tools, the cached
  //    form state here went stale — and clicking Save then silently REVERTED
  //    her write. Refetch on her change events instead.
  useEffect(() => {
    const applySection = (a) => {
      if (a?.type === 'settings_section' && SECTIONS.some((s) => s.id === a.id)) setSection(a.id);
    };
    applySection(takePending('settings_section'));
    const onAction = (e) => applySection(e.detail);
    const onIcpChanged = () => setIcp(null);   // loader effect refetches (guarded on icp === null)
    const onAccountChanged = async () => {
      try { setData(await api.getAccount()); } catch { /* keep current */ }
    };
    window.addEventListener(BELLA_ACTION_EVENT, onAction);
    window.addEventListener('bdi:icp-changed', onIcpChanged);
    window.addEventListener('bdi:account-changed', onAccountChanged);
    return () => {
      window.removeEventListener(BELLA_ACTION_EVENT, onAction);
      window.removeEventListener('bdi:icp-changed', onIcpChanged);
      window.removeEventListener('bdi:account-changed', onAccountChanged);
    };
  }, []);

  // Sending-identity hooks MUST be declared above the early return (Rules of Hooks).
  const [identities, setIdentities] = useState(null);
  const [domainForm, setDomainForm] = useState({ domain: '', from_email: '' });
  const [domBusy, setDomBusy] = useState('');
  useEffect(() => {
    if (section !== 'domain' || identities !== null) return;
    (async () => {
      try { const r = await api.outreachIdentities(); setIdentities(r.identities || []); }
      catch (e) { toast('Load failed: ' + (e.message || ''), 'error'); setIdentities([]); }
    })();
  }, [section, identities]);

  // WhatsApp connection hooks — above the early return (Rules of Hooks).
  const [wa, setWa] = useState(null);            // status
  const [waForm, setWaForm] = useState({ phone_number_id: '', business_account_id: '', access_token: '', verify_token: '', display_number: '' });
  const [waBusy, setWaBusy] = useState(false);
  useEffect(() => {
    if (section !== 'whatsapp' || wa !== null) return;
    (async () => { try { setWa(await api.waConfig()); } catch { setWa({ connected: false }); } })();
  }, [section, wa]);

  // ICP / company-profile hooks — above the early return (Rules of Hooks).
  const [icp, setIcp] = useState(null);
  const [icpSaving, setIcpSaving] = useState(false);
  const [chipDraft, setChipDraft] = useState({});
  useEffect(() => {
    if (section !== 'icp' || icp !== null) return;
    (async () => {
      try {
        const r = await api.getIcp();
        const pr = r.profile || {};
        setIcp({
          company_name: pr.company_name || '', company_about: pr.company_about || '',
          products_services: pr.products_services || '',
          pricing_items: Array.isArray(pr.pricing_items) ? pr.pricing_items : [],
          current_customers: pr.current_customers || '',
          target_industries: pr.target_industries || [], target_sizes: pr.target_sizes || [],
          target_titles: pr.target_titles || [], target_tech_stack: pr.target_tech_stack || [],
          target_has_website: pr.target_has_website || 'any',
          target_keywords: pr.target_keywords || [], icp_notes: pr.icp_notes || '',
        });
      } catch (e) {
        toast('Load failed: ' + (e.message || ''), 'error');
        setIcp({ pricing_items: [], target_industries: [], target_sizes: [], target_titles: [], target_tech_stack: [], target_keywords: [], target_has_website: 'any' });
      }
    })();
  }, [section, icp]);

  // Bella section hooks — above the early return (Rules of Hooks).
  const [bellaInfo, setBellaInfo] = useState(null);   // { usage, actions, tasks }
  useEffect(() => {
    if (section !== 'bella' || bellaInfo !== null) return;
    (async () => {
      try {
        const [usage, acts, tasks] = await Promise.all([api.bellaUsage(), api.bellaActions(20), api.bellaTasks()]);
        setBellaInfo({ usage, actions: acts.actions || [], tasks: tasks.tasks || [] });
      } catch { setBellaInfo({ usage: null, actions: [], tasks: [] }); }
    })();
  }, [section, bellaInfo]);
  const cancelBellaTask = async (id) => {
    try { await api.bellaCancelTask(id); toast('Task cancelled'); setBellaInfo(null); /* refetch */ }
    catch (e) { toast('Cancel failed: ' + (e.message || ''), 'error'); }
  };

  if (!data) return html`<div class="sys-page"><div class="sys-body"><div class="empty">Loading…</div></div></div>`;

  const p = data.profile || {};
  const setProfile = (k, v) => setData(d => ({ ...d, profile: { ...d.profile, [k]: v } }));
  const setNotif   = (k, v) => setData(d => ({ ...d, notifications: { ...d.notifications, [k]: v } }));
  const setPref    = (k, v) => setData(d => ({ ...d, preferences: { ...d.preferences, [k]: v } }));
  const setBella   = (k, v) => setData(d => ({ ...d, preferences: { ...d.preferences, bella: { ...(d.preferences?.bella || {}), [k]: v } } }));

  const save = async (patch, msg) => {
    setSaving(true);
    try { await api.updateAccount(patch); toast(msg || 'Saved'); }
    catch (e) { toast('Save failed: ' + (e.message || ''), 'error'); }
    finally { setSaving(false); }
  };

  const setIcpField = (k, v) => setIcp(c => ({ ...(c || {}), [k]: v }));
  const icpArr = (k) => (icp && Array.isArray(icp[k])) ? icp[k] : [];
  const addChip = (k, val) => {
    const v = String(val || '').trim(); if (!v) return;
    setIcp(c => { const cur = Array.isArray(c?.[k]) ? c[k] : []; return cur.some(x => x.toLowerCase() === v.toLowerCase()) ? c : { ...c, [k]: [...cur, v] }; });
  };
  const removeChip = (k, val) => setIcp(c => ({ ...c, [k]: (Array.isArray(c?.[k]) ? c[k] : []).filter(x => x !== val) }));
  const commitDraft = (k) => { addChip(k, chipDraft[k]); setChipDraft(d => ({ ...d, [k]: '' })); };
  const addPrice = () => setIcp(c => ({ ...c, pricing_items: [...(Array.isArray(c?.pricing_items) ? c.pricing_items : []), { title: '', price: '' }] }));
  const setPrice = (i, k, v) => setIcp(c => ({ ...c, pricing_items: (c.pricing_items || []).map((it, j) => j === i ? { ...it, [k]: v } : it) }));
  const removePrice = (i) => setIcp(c => ({ ...c, pricing_items: (c.pricing_items || []).filter((_, j) => j !== i) }));

  const CHIP = { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11.5px', background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', borderRadius: '999px', padding: '3px 6px 3px 11px', color: 'var(--text)' };
  const CHIP_X = { background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '14px', lineHeight: 1, padding: 0 };
  const CHIP_SUGGEST = { fontSize: '11px', background: 'transparent', border: '1px dashed var(--border)', borderRadius: '999px', padding: '3px 10px', color: 'var(--text-muted)', cursor: 'pointer' };
  const chipField = (k, opts, placeholder) => html`
    <div>
      ${icpArr(k).length ? html`<div style=${{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '7px' }}>
        ${icpArr(k).map(v => html`<span key=${v} style=${CHIP}>${v}<button type="button" onClick=${() => removeChip(k, v)} title="Remove" style=${CHIP_X}>×</button></span>`)}
      </div>` : null}
      ${(opts || []).filter(o => !icpArr(k).some(x => x.toLowerCase() === o.toLowerCase())).length ? html`
        <div style=${{ display: 'flex', flexWrap: 'wrap', gap: '5px', marginBottom: '7px' }}>
          ${(opts || []).filter(o => !icpArr(k).some(x => x.toLowerCase() === o.toLowerCase())).map(o => html`<button key=${o} type="button" onClick=${() => addChip(k, o)} style=${CHIP_SUGGEST}>+ ${o}</button>`)}
        </div>` : null}
      <input class="sys-input" placeholder=${placeholder || 'Type your own and press Enter…'} value=${chipDraft[k] || ''}
        data-bella-fill=${k.replace(/_/g, ' ')} data-bella-commit="enter"
        onInput=${e => setChipDraft(d => ({ ...d, [k]: e.target.value }))}
        onKeyDown=${e => { if (e.key === 'Enter') { e.preventDefault(); commitDraft(k); } }} />
    </div>`;

  const submitIcp = async () => {
    if (!icp) return;
    setIcpSaving(true);
    try {
      await api.saveIcp({
        company_name: icp.company_name, company_about: icp.company_about, products_services: icp.products_services,
        pricing_items: (icp.pricing_items || []).filter(it => (it.title || '').trim() || (it.price || '').trim()),
        current_customers: icp.current_customers,
        target_industries: icpArr('target_industries'), target_sizes: icpArr('target_sizes'),
        target_titles: icpArr('target_titles'), target_tech_stack: icpArr('target_tech_stack'),
        target_has_website: icp.target_has_website || 'any', target_keywords: icpArr('target_keywords'),
        icp_notes: icp.icp_notes,
      });
      toast('Company profile saved');
    } catch (e) { toast('Save failed: ' + (e.message || ''), 'error'); }
    finally { setIcpSaving(false); }
  };

  // ---- Sending domain (per-tenant outreach identity) --------------------
  // (state + load effect are declared above, with the other hooks)
  const loadIdentities = async () => {
    try { const r = await api.outreachIdentities(); setIdentities(r.identities || []); }
    catch (e) { toast('Load failed: ' + (e.message || ''), 'error'); setIdentities([]); }
  };

  const connectDomain = async () => {
    const d = (domainForm.domain || '').trim();
    if (!d) return;
    setDomBusy('connect');
    try {
      await api.outreachConnectDomain(d, (domainForm.from_email || '').trim() || undefined);
      setDomainForm({ domain: '', from_email: '' });
      await loadIdentities();
      toast('Domain added — add the DNS records below, then Verify.');
    } catch (e) {
      const m = e.message || '';
      toast(m.includes('not_configured') ? 'Email sending isn’t set up yet — please contact support.'
        : m.includes('invalid_domain') ? 'That doesn’t look like a valid domain.' : 'Failed: ' + m, 'error');
    } finally { setDomBusy(''); }
  };
  const verifyDomain = async (id) => {
    setDomBusy('verify' + id);
    try {
      const r = await api.outreachVerifyDomain(id);
      await loadIdentities();
      const ok = r.domain?.status === 'verified';
      toast(ok ? 'Verified! You can now make it your default sender.' : 'Not verified yet — DNS can take up to 48h to propagate.', ok ? 'success' : 'info');
    } catch (e) { toast('Verify failed: ' + (e.message || ''), 'error'); } finally { setDomBusy(''); }
  };
  const removeDomain = async (id) => {
    if (!confirm('Remove this domain?')) return;
    try { await api.outreachRemoveDomain(id); await loadIdentities(); toast('Domain removed'); }
    catch (e) { toast('Remove failed: ' + (e.message || ''), 'error'); }
  };
  const makeDefault = async (id) => {
    try { await api.outreachUpdateIdentity(id, { make_default: true }); await loadIdentities(); toast('Default sender updated'); }
    catch (e) { toast('Failed: ' + (e.message || ''), 'error'); }
  };

  const domBadge = { fontSize: '11px', padding: '2px 7px', border: '1px solid var(--border)', marginLeft: '6px', color: 'var(--text-muted)' };
  const statusColor = (st) => st === 'verified' ? '#3fb950' : st === 'failed' ? '#e5534b' : st === 'active' ? 'var(--accent)' : 'var(--text-muted)';
  const statusLabel = { active: 'Active', verified: 'Verified', pending: 'Pending verification', failed: 'Verification failed' };

  const renderIdentity = (idn) => html`
    <div key=${idn.id} style=${{ border: '1px solid var(--border)', background: 'var(--bg-elev)', padding: '12px 14px', marginBottom: '10px' }}>
      <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
        <div>
          <span style=${{ fontWeight: 600 }}>${idn.from_email}</span>
          <span style=${domBadge}>${idn.kind === 'bell' ? 'Bell' : 'Custom'}</span>
          ${idn.is_default ? html`<span style=${{ ...domBadge, color: 'var(--accent)', borderColor: 'var(--accent)' }}>Default</span>` : null}
        </div>
        <div style=${{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <span style=${{ fontSize: '12px', color: statusColor(idn.status) }}>${statusLabel[idn.status] || idn.status}</span>
          ${!idn.is_default && (idn.kind === 'bell' || idn.status === 'verified') ? html`<button class="sys-btn" onClick=${() => makeDefault(idn.id)}>Make default</button>` : null}
          ${idn.kind === 'custom' ? html`<button class="sys-btn" style=${{ color: '#e5534b' }} onClick=${() => removeDomain(idn.id)}>Remove</button>` : null}
        </div>
      </div>
      ${idn.kind === 'custom' && idn.status !== 'verified' ? html`
        <div style=${{ marginTop: '10px', borderTop: '1px solid var(--border)', paddingTop: '10px' }}>
          <div class="sys-hint">Add these records at your DNS provider, then click Verify:</div>
          <table style=${{ width: '100%', fontSize: '12px', borderCollapse: 'collapse', margin: '6px 0' }}>
            <thead><tr>${['Type', 'Name', 'Value'].map(h => html`<th key=${h} style=${{ textAlign: 'left', padding: '4px 6px', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>${h}</th>`)}</tr></thead>
            <tbody>
              ${(idn.dns_records || []).map((r, i) => html`<tr key=${i}>
                <td style=${{ padding: '4px 6px', verticalAlign: 'top' }}>${r.type || r.record}</td>
                <td style=${{ padding: '4px 6px', fontFamily: 'monospace', wordBreak: 'break-all', verticalAlign: 'top' }}>${r.name}</td>
                <td style=${{ padding: '4px 6px', fontFamily: 'monospace', wordBreak: 'break-all', verticalAlign: 'top' }}>${r.value}</td>
              </tr>`)}
            </tbody>
          </table>
          <button class="sys-btn" disabled=${domBusy === 'verify' + idn.id} onClick=${() => verifyDomain(idn.id)}>${domBusy === 'verify' + idn.id ? 'Checking…' : 'Verify'}</button>
        </div>` : null}
    </div>`;

  const field = (k, lbl, opts = {}) => html`
    <div class=${'sys-field' + (opts.full ? ' full' : '')}>
      <label>${lbl}</label>
      <input class="sys-input" type=${opts.type || 'text'} placeholder=${opts.ph || ''} data-bella-fill=${lbl}
        value=${p[k] || ''} onInput=${e => setProfile(k, e.target.value)} />
    </div>`;

  // ── WhatsApp connect handlers ──
  const WEBHOOK_URL = (typeof window !== 'undefined' ? window.location.origin : 'https://app.bell.qa') + '/api/whatsapp-webhook';
  const saveWa = async () => {
    setWaBusy(true);
    try { const r = await api.waSaveConfig({ ...waForm, active: true }); setWa(r); setWaForm(f => ({ ...f, access_token: '' })); toast('WhatsApp connected'); }
    catch (e) { toast(e.body?.error === 'admin_only' ? 'Only an owner/admin can connect WhatsApp.' : (e.message || 'Save failed'), 'error'); }
    finally { setWaBusy(false); }
  };
  const disconnectWa = async () => {
    if (!window.confirm('Disconnect WhatsApp? Message history is kept; sending stops until you reconnect.')) return;
    setWaBusy(true);
    try { await api.waDisconnect(); setWa({ connected: false }); toast('WhatsApp disconnected'); }
    catch (e) { toast(e.message || 'Failed', 'error'); }
    finally { setWaBusy(false); }
  };
  const waField = (k, lbl, ph, opts = {}) => html`
    <div class="sys-field ${opts.full ? 'full' : ''}">
      <label>${lbl}</label>
      <input class="sys-input" type=${opts.type || 'text'} placeholder=${ph || ''} data-bella-fill=${lbl} value=${waForm[k] || ''}
        onInput=${e => setWaForm(f => ({ ...f, [k]: e.target.value }))} />
    </div>`;

  const PAGES = {
    profile: html`
      <div class="sys-section">
        <h2>Profile</h2>
        <div class="sys-hint">How you appear across Bell, and the details used in your outreach.</div>
        <div class="sys-grid">
          ${field('full_name', 'Full name')}
          ${field('title', 'Job title', { ph: 'e.g. Head of Sales' })}
          ${field('department', 'Department', { ph: 'e.g. Commercial' })}
          <div class="sys-field">
            <label>Function team</label>
            <select class="sys-select" value=${p.function_team || ''} onChange=${e => setProfile('function_team', e.target.value || null)}>
              ${FUNCTION_TEAMS.map(t => html`<option key=${t} value=${t}>${t ? t.toUpperCase() : '—'}</option>`)}
            </select>
          </div>
          ${field('phone', 'Work phone')}
          ${field('mobile', 'Mobile')}
          ${field('location', 'Location', { ph: 'City, Country' })}
          <div class="sys-field"><label>Email</label><input class="sys-input" value=${p.email || ''} disabled /></div>
          ${field('linkedin_url', 'LinkedIn')}
          ${field('twitter_url', 'X / Twitter')}
          ${field('website_url', 'Website')}
          ${field('booking_link', 'Booking link', { ph: 'Calendly / Cal.com' })}
          <div class="sys-field full">
            <label>Short bio</label>
            <textarea class="sys-textarea" data-bella-fill="Short bio" value=${p.bio || ''} onInput=${e => setProfile('bio', e.target.value)}></textarea>
          </div>
        </div>
        <div class="sys-actions"><button class="sys-btn" disabled=${saving} onClick=${() => save({ profile: data.profile }, 'Profile saved')}>${saving ? 'Saving…' : 'Save profile'}</button></div>
      </div>`,

    whatsapp: html`
      <div class="sys-section">
        <h2>WhatsApp</h2>
        <div class="sys-hint">Connect your WhatsApp Business number (Meta Cloud API) to message CRM contacts and see their replies right on each record — shared with your whole team.</div>
        ${wa === null ? html`<div class="empty">Loading…</div>` : wa.connected ? html`
          <div style=${{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', padding: '12px 14px', border: '1px solid var(--green, #22c55e)', background: 'rgba(34,197,94,0.08)', borderRadius: '10px' }}>
            <span style=${{ fontSize: '20px' }}>✓</span>
            <div style=${{ flex: 1, minWidth: '200px' }}>
              <div style=${{ fontWeight: 600, fontSize: '13px' }}>Connected${wa.display_number ? ' · ' + wa.display_number : ''}</div>
              <div class="sys-hint" style=${{ margin: '2px 0 0' }}>Phone number ID ${wa.phone_number_id}. Team members can now WhatsApp contacts from the CRM.</div>
            </div>
            <button class="sys-btn sys-btn-secondary" style=${{ color: 'var(--red)' }} disabled=${waBusy} onClick=${disconnectWa}>Disconnect</button>
          </div>
          <div class="sys-hint" style=${{ marginTop: '14px' }}>Webhook URL (already set if it’s working): <code>${WEBHOOK_URL}</code></div>
        ` : html`
          <div style=${{ padding: '12px 14px', border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-elev)', marginBottom: '14px' }}>
            <div style=${{ fontWeight: 600, fontSize: '13px', marginBottom: '6px' }}>Setup steps (one-time, in Meta)</div>
            <ol style=${{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.7 }}>
              <li>At <a href="https://business.facebook.com" target="_blank" rel="noopener" style=${{ color: 'var(--accent-bright)' }}>business.facebook.com</a> → WhatsApp → add/verify your business number.</li>
              <li>Copy the <b>Phone number ID</b>, <b>WhatsApp Business Account ID</b>, and a <b>long-lived access token</b> (System User token recommended).</li>
              <li>Pick any secret word as your <b>Verify token</b> and paste it below.</li>
              <li>In Meta → WhatsApp → Configuration → Webhook, set the callback URL to <code>${WEBHOOK_URL}</code> with that same verify token, and subscribe to <b>messages</b>.</li>
            </ol>
          </div>
          <div class="sys-grid">
            ${waField('display_number', 'Display number', '+974 5555 5555')}
            ${waField('phone_number_id', 'Phone number ID', 'from Meta')}
            ${waField('business_account_id', 'WhatsApp Business Account ID', 'from Meta')}
            ${waField('verify_token', 'Verify token', 'any secret word you choose')}
            ${waField('access_token', 'Access token', 'long-lived / system-user token', { full: true, type: 'password' })}
          </div>
          <div class="sys-actions"><button class="sys-btn" disabled=${waBusy || !waForm.phone_number_id || !waForm.access_token} onClick=${saveWa}>${waBusy ? 'Connecting…' : 'Connect WhatsApp'}</button></div>
          <div class="sys-hint" style=${{ marginTop: '8px' }}>Your token is stored securely to send on your behalf and is never shown again. Free-form replies work within WhatsApp’s 24-hour window; cold-outreach templates come next.</div>
        `}
      </div>`,

    icp: html`
      <div class="sys-section">
        <h2>Company & ICP</h2>
        <div class="sys-hint">Describe your business and exactly who you sell to. Bell uses this to personalize your Signals and to guide Bella. (Bella will be able to fill this in for you later.)</div>
        ${icp === null ? html`<div class="empty">Loading…</div>` : html`
          <div style=${ICP_GROUP}>About your company</div>
          <div class="sys-grid">
            <div class="sys-field full"><label>Company name</label><input class="sys-input" data-bella-fill="Company name" value=${icp.company_name || ''} onInput=${e => setIcpField('company_name', e.target.value)} /></div>
            <div class="sys-field full"><label>What your company does</label><textarea class="sys-textarea" data-bella-fill="What your company does" value=${icp.company_about || ''} onInput=${e => setIcpField('company_about', e.target.value)}></textarea></div>
            <div class="sys-field full"><label>Products & services</label><textarea class="sys-textarea" data-bella-fill="Products and services" value=${icp.products_services || ''} onInput=${e => setIcpField('products_services', e.target.value)}></textarea></div>
            <div class="sys-field full"><label>Current customers</label><textarea class="sys-textarea" data-bella-fill="Current customers" value=${icp.current_customers || ''} onInput=${e => setIcpField('current_customers', e.target.value)}></textarea></div>
          </div>
          <div class="sys-field full" style=${{ marginTop: '12px' }}>
            <label>Pricing — one row per product / service</label>
            ${(icp.pricing_items || []).map((it, i) => html`
              <div key=${'pr' + i} style=${{ display: 'flex', gap: '8px', marginBottom: '6px' }}>
                <input class="sys-input" style=${{ flex: 2 }} placeholder="Service / product" value=${it.title || ''} onInput=${e => setPrice(i, 'title', e.target.value)} />
                <input class="sys-input" style=${{ flex: 1 }} placeholder="Price (e.g. QAR 5,000 / mo)" value=${it.price || ''} onInput=${e => setPrice(i, 'price', e.target.value)} />
                <button type="button" title="Remove" onClick=${() => removePrice(i)} style=${{ flexShrink: 0, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '0 11px', cursor: 'pointer' }}>×</button>
              </div>`)}
            <button type="button" onClick=${addPrice} style=${{ marginTop: '2px', background: 'transparent', border: '1px dashed var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '6px 12px', fontSize: '12px', cursor: 'pointer' }}>+ Add pricing</button>
          </div>

          <div style=${ICP_GROUP}>Ideal customer — who to target</div>
          <div class="sys-grid">
            <div class="sys-field full"><label>Target industries</label>${chipField('target_industries', ICP_INDUSTRIES, 'Add an industry…')}</div>
            <div class="sys-field full"><label>Target company sizes (employees)</label>${chipField('target_sizes', ICP_SIZES, 'Add a size band…')}</div>
            <div class="sys-field full"><label>Decision-maker titles to reach</label>${chipField('target_titles', ICP_TITLES, 'Add a job title…')}</div>
            <div class="sys-field full"><label>Tech stack they use</label>${chipField('target_tech_stack', ICP_TECH, 'e.g. WordPress, Shopify…')}</div>
            <div class="sys-field"><label>Website</label>
              <select class="sys-input" value=${icp.target_has_website || 'any'} onChange=${e => setIcpField('target_has_website', e.target.value)}>
                ${ICP_WEBSITE.map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}
              </select>
            </div>
            <div class="sys-field full"><label>Buying signals to watch for</label>${chipField('target_keywords', ICP_SIGNALS, 'Add a buying signal…')}</div>
            <div class="sys-field full"><label>Notes</label><textarea class="sys-textarea" data-bella-fill="ICP notes" value=${icp.icp_notes || ''} onInput=${e => setIcpField('icp_notes', e.target.value)}></textarea></div>
          </div>
          <div class="sys-hint" style=${{ marginTop: '8px' }}>Pick from the suggestions or type your own and press Enter. The website filter also lives in Companies → Filters.</div>
          <div class="sys-actions"><button class="sys-btn" disabled=${icpSaving} onClick=${submitIcp}>${icpSaving ? 'Saving…' : 'Save company profile'}</button></div>
        `}
      </div>`,

    email: html`
      <div class="sys-section">
        <h2>Email</h2>
        <div class="sys-hint">Your sending identity and branding for emails sent from the CRM. The header sits at the top of every email and the footer at the bottom — so your outreach looks designed, not plain. Not sure what to write? Ask Bella to create a professional one for you.</div>
        <div class="sys-field"><label>Display name</label>
          <input class="sys-input" placeholder="Name shown on your emails" data-bella-fill="Display name" value=${p.display_name || ''} onInput=${e => setProfile('display_name', e.target.value)} /></div>
        <div class="sys-field full">
          <label>Email header (HTML)</label>
          <textarea class="sys-textarea" style=${{ minHeight: '90px', fontFamily: 'ui-monospace, monospace', fontSize: '12px' }} placeholder="e.g. <div style='font-size:18px;font-weight:700'>Acme Trading</div>" data-bella-fill="Email header" value=${p.email_header_html || ''} onInput=${e => setProfile('email_header_html', e.target.value)}></textarea>
          <div class="sys-hint">Shown at the TOP of every email — a logo, your company name, or a colored banner.</div>
        </div>
        <div class="sys-field full">
          <label>Email signature</label>
          <textarea class="sys-textarea" style=${{ minHeight: '110px' }} data-bella-fill="Email signature" value=${p.email_signature || ''} onInput=${e => setProfile('email_signature', e.target.value)}></textarea>
          <div class="sys-hint">Signs off your message — your name, title, and contact details.</div>
        </div>
        <div class="sys-field full">
          <label>Email footer (HTML)</label>
          <textarea class="sys-textarea" style=${{ minHeight: '90px', fontFamily: 'ui-monospace, monospace', fontSize: '12px' }} placeholder="e.g. <div style='color:#888;font-size:12px'>Acme Trading · Doha, Qatar · acme.qa</div>" data-bella-fill="Email footer" value=${p.email_footer_html || ''} onInput=${e => setProfile('email_footer_html', e.target.value)}></textarea>
          <div class="sys-hint">Shown at the BOTTOM of every email — company address, website, or a legal line.</div>
        </div>
        ${(p.email_header_html || p.email_footer_html || p.email_signature) ? html`
          <div class="sys-field full">
            <label>Preview</label>
            <div style=${{ border: '1px solid var(--border)', borderRadius: '10px', overflow: 'hidden', background: '#ffffff', color: '#1a1a1a', maxWidth: '520px' }}>
              ${p.email_header_html ? html`<div style=${{ padding: '14px 18px', borderBottom: '1px solid #eee' }} dangerouslySetInnerHTML=${{ __html: p.email_header_html }}></div>` : null}
              <div style=${{ padding: '16px 18px', fontSize: '14px', lineHeight: 1.6 }}>
                <div style=${{ color: '#555' }}>Hi Sara,</div>
                <div style=${{ color: '#555', marginTop: '8px' }}>…your message to the prospect appears here…</div>
                ${p.email_signature ? html`<div style=${{ marginTop: '14px', whiteSpace: 'pre-wrap', color: '#333' }} dangerouslySetInnerHTML=${{ __html: String(p.email_signature).replace(/\n/g, '<br>') }}></div>` : null}
              </div>
              ${p.email_footer_html ? html`<div style=${{ padding: '12px 18px', borderTop: '1px solid #eee' }} dangerouslySetInnerHTML=${{ __html: p.email_footer_html }}></div>` : null}
            </div>
          </div>` : null}
        <label class="sys-toggle" style=${{ borderTop: '1px solid var(--border)', borderBottom: 0 }}>
          <input type="checkbox" style=${cbStyle} checked=${data.preferences?.append_signature !== false} onChange=${e => setPref('append_signature', e.target.checked)} />
          <span><div class="t-title">Append signature to CRM emails</div><div class="t-desc">Automatically add your signature to messages you send.</div></span>
        </label>
        <div class="sys-actions"><button class="sys-btn" disabled=${saving} onClick=${() => save({ profile: data.profile, preferences: data.preferences }, 'Email settings saved')}>${saving ? 'Saving…' : 'Save email settings'}</button></div>
      </div>`,

    domain: html`
      <div class="sys-section">
        <h2>Sending domain</h2>
        <div class="sys-hint">Where your outreach emails are sent from. You start on a free Bell address — connect your own domain for the best deliverability and to send as your own brand.</div>
        ${identities === null
          ? html`<div class="empty">Loading…</div>`
          : html`
            <div style=${{ marginTop: '8px' }}>${identities.map(renderIdentity)}</div>
            <div class="sys-field full" style=${{ marginTop: '18px', borderTop: '1px solid var(--border)', paddingTop: '16px' }}>
              <label>Connect your own domain</label>
              <div style=${{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <input class="sys-input" style=${{ flex: '1 1 200px' }} placeholder="yourcompany.com"
                  value=${domainForm.domain} onInput=${e => setDomainForm(f => ({ ...f, domain: e.target.value }))} />
                <input class="sys-input" style=${{ flex: '1 1 220px' }} placeholder="from address (optional) — e.g. sales@yourcompany.com"
                  value=${domainForm.from_email} onInput=${e => setDomainForm(f => ({ ...f, from_email: e.target.value }))} />
                <button class="sys-btn" disabled=${domBusy === 'connect' || !domainForm.domain.trim()} onClick=${connectDomain}>${domBusy === 'connect' ? 'Adding…' : 'Connect domain'}</button>
              </div>
              <div class="sys-hint" style=${{ marginTop: '6px' }}>We'll give you DNS records to add at your domain registrar, then you verify — usually a few minutes, up to 48h.</div>
            </div>`}
      </div>`,

    notifications: html`
      <div class="sys-section">
        <h2>Notifications</h2>
        <div class="sys-hint">Choose which emails Bell sends you.</div>
        ${[
          // NOTE: the weekly-digest toggle was REMOVED (A4, Val-approved
          // 2026-07-02) — the digest feature doesn't exist yet; the toggle
          // returns together with the digest itself. No placeholders.
          ['sequence_replies', 'Sequence replies', 'When a prospect replies to one of your sequences'],
          ['credit_low', 'Low credit warning', 'When your credit balance is running low'],
          ['product_updates', 'Product updates', 'New Bell features and announcements'],
        ].map(([k, t, d]) => html`
          <label class="sys-toggle" key=${k}>
            <input type="checkbox" class="sw" style=${cbStyle} checked=${data.notifications?.[k] !== false} onChange=${e => setNotif(k, e.target.checked)} />
            <span><div class="t-title">${t}</div><div class="t-desc">${d}</div></span>
          </label>`)}
        <div class="sys-actions"><button class="sys-btn" disabled=${saving} onClick=${() => save({ notifications: data.notifications }, 'Notifications saved')}>${saving ? 'Saving…' : 'Save notifications'}</button></div>
      </div>`,

    preferences: html`
      <div class="sys-section">
        <h2>Preferences</h2>
        <div class="sys-grid">
          <div class="sys-field"><label>Timezone</label><input class="sys-input" placeholder="e.g. Asia/Qatar" value=${data.preferences?.timezone || ''} onInput=${e => setPref('timezone', e.target.value)} />
            <span style=${{ fontSize: '11px', color: 'var(--text-dim)' }}>Used by scheduling features (digests, send windows) as they roll out.</span></div>
          ${/* Language selector removed (A4): Arabic ships with the Arabic
              phase on the roadmap — no dropdowns that do nothing. */ null}
          <div class="sys-field"><label>Default landing page</label>
            <select class="sys-select" value=${data.preferences?.default_landing || 'companies'} onChange=${e => setPref('default_landing', e.target.value)}>
              ${[['companies', 'Companies'], ['market-feed', 'Market Feed'], ['crm', 'CRM'], ['map', 'Map']].map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}
            </select></div>
        </div>
        <div class="sys-actions"><button class="sys-btn" disabled=${saving} onClick=${() => save({ preferences: data.preferences }, 'Preferences saved')}>${saving ? 'Saving…' : 'Save preferences'}</button></div>
      </div>`,

    bella: html`
      <div class="sys-section">
        <h2>Bella</h2>
        <div class="sys-hint" style=${{ marginBottom: '14px' }}>
          Bella is your Bell assistant — the orb at the top of every page. Today she answers from your
          workspace's data and navigates for you; her acting powers (reveals, CRM, email drafting,
          sequences) arrive in her next upgrade and will follow the permission you set here.
        </div>
        <div class="sys-grid">
          <div class="sys-field"><label>When Bella wants to act</label>
            <select class="sys-select" value=${data.preferences?.bella?.approval_mode || 'ask'} onChange=${e => setBella('approval_mode', e.target.value)}>
              <option value="ask">Always ask me first (recommended)</option>
              <option value="auto">Act without asking — sends & deletions still confirm</option>
            </select>
            <span style=${{ fontSize: '11px', color: 'var(--text-dim)' }}>Reading data never needs approval. Credit spend is always shown before it happens.</span></div>
          <div class="sys-field"><label>How she should communicate</label>
            <textarea class="sys-input" rows="3" placeholder="e.g. Short and direct. No emojis. Address me by first name."
              value=${data.preferences?.bella?.style || ''} onInput=${e => setBella('style', e.target.value)}></textarea></div>
          <div class="sys-field"><label>How she should write emails</label>
            <textarea class="sys-input" rows="3" placeholder="Tone, length, sign-off… used when Bella starts drafting outreach for you."
              value=${data.preferences?.bella?.email_style || ''} onInput=${e => setBella('email_style', e.target.value)}></textarea></div>
        </div>
        <div class="sys-actions"><button class="sys-btn" disabled=${saving} onClick=${() => save({ preferences: data.preferences }, 'Bella preferences saved')}>${saving ? 'Saving…' : 'Save Bella preferences'}</button></div>

        <h2 style=${{ marginTop: '26px' }}>Usage today</h2>
        <div class="sys-hint">
          ${bellaInfo?.usage
            ? `${bellaInfo.usage.turns || 0} of ${bellaInfo.usage.turns_cap} chats used today.`
            : 'Loading…'}
          ${' '}Daily limits are workspace defaults for now — per-plan limits arrive with the Billing integration.
        </div>

        <h2 style=${{ marginTop: '26px' }}>Scheduled tasks</h2>
        <div class="sys-hint" style=${{ marginBottom: '10px' }}>
          Approving a schedule is the approval — queued tasks run fully autonomously at their time.
          Cancel anything here before it runs.
        </div>
        ${(bellaInfo?.tasks || []).length === 0
          ? html`<div class="sys-hint">Nothing scheduled. Ask Bella e.g. "tomorrow at 8am, summarize new signals for me".</div>`
          : html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              ${(bellaInfo.tasks).map(t => html`
                <div key=${t.id} style=${{ display: 'flex', gap: '10px', fontSize: '12px', alignItems: 'baseline' }}>
                  <span style=${{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>${new Date(t.run_at).toLocaleString()}</span>
                  <span style=${{ color: t.status === 'queued' ? 'var(--accent-bright)' : t.status === 'done' ? 'var(--green)' : t.status === 'failed' ? 'var(--red)' : 'var(--text-dim)', textTransform: 'uppercase', fontSize: '10px', fontWeight: 700, whiteSpace: 'nowrap' }}>${t.status}</span>
                  <span style=${{ color: 'var(--text-muted)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title=${t.instruction}>${t.instruction}</span>
                  ${t.status === 'queued' ? html`
                    <button style=${{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', borderRadius: '6px', padding: '2px 9px', fontSize: '11px', cursor: 'pointer' }}
                      onClick=${() => cancelBellaTask(t.id)}>Cancel</button>` : null}
                </div>`)}
            </div>`}

        <h2 style=${{ marginTop: '26px' }}>Recent activity</h2>
        ${(bellaInfo?.actions || []).length === 0
          ? html`<div class="sys-hint">No Bella actions yet. Everything she does is recorded here.</div>`
          : html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              ${(bellaInfo.actions).map(a => html`
                <div key=${a.id} style=${{ display: 'flex', gap: '10px', fontSize: '12px', alignItems: 'baseline' }}>
                  <span style=${{ color: 'var(--text-dim)', whiteSpace: 'nowrap' }}>${new Date(a.created_at).toLocaleString()}</span>
                  <span style=${{ color: 'var(--accent-bright)' }}>${a.tool}</span>
                  <span style=${{ color: 'var(--text-muted)' }}>${a.result_summary || a.status}</span>
                </div>`)}
            </div>`}
      </div>`,

    security: html`<${SecurityPanel} />`,
  };

  return html`
    <div class="sys-page">
      <div class="settings-rail">
        <div class="settings-rail-title">Settings</div>
        ${SECTIONS.map(s => html`
          <button key=${s.id} class=${'settings-rail-item' + (section === s.id ? ' active' : '')}
            onClick=${() => setSection(s.id)}>${s.label}</button>`)}
      </div>
      <div class="sys-body">${PAGES[section]}</div>
    </div>`;
}

function SecurityPanel() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && typeof window !== 'undefined' && window.Clerk?.mountUserProfile) {
      try { window.Clerk.mountUserProfile(el); } catch { /* ignore */ }
      return () => { try { window.Clerk.unmountUserProfile(el); } catch { /* ignore */ } };
    }
  }, []);
  const hasClerk = typeof window !== 'undefined' && window.Clerk?.mountUserProfile;
  return html`
    <div class="sys-section">
      <h2>Account & Security</h2>
      ${hasClerk
        ? html`<div ref=${ref}></div>`
        : html`<div class="sys-hint">Account security (email, password, two-factor, devices) is managed by your sign-in provider and is available on the live app.</div>`}
    </div>`;
}
