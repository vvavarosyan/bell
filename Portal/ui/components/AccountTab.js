// System → Settings. Left rail (Profile / Email / Notifications / Preferences /
// Account & Security) + a full-bleed, modern body (.sys-body).

import { useState, useEffect, useRef } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const SECTIONS = [
  { id: 'profile',       label: 'Profile' },
  { id: 'email',         label: 'Email' },
  { id: 'domain',        label: 'Sending domain' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'preferences',   label: 'Preferences' },
  { id: 'security',      label: 'Account & Security' },
];
const FUNCTION_TEAMS = ['', 'sales', 'bd', 'marketing', 'research', 'gtm'];
const cbStyle = { width: '16px', height: '16px', accentColor: 'var(--accent)', cursor: 'pointer' };

export function AccountTab() {
  const [data, setData] = useState(null);
  const [section, setSection] = useState('profile');
  const [saving, setSaving] = useState(false);

  useEffect(() => { (async () => {
    try { setData(await api.getAccount()); } catch { setData({ profile: {}, notifications: {}, preferences: {} }); }
  })(); }, []);

  if (!data) return html`<div class="sys-page"><div class="sys-body"><div class="empty">Loading…</div></div></div>`;

  const p = data.profile || {};
  const setProfile = (k, v) => setData(d => ({ ...d, profile: { ...d.profile, [k]: v } }));
  const setNotif   = (k, v) => setData(d => ({ ...d, notifications: { ...d.notifications, [k]: v } }));
  const setPref    = (k, v) => setData(d => ({ ...d, preferences: { ...d.preferences, [k]: v } }));

  const save = async (patch, msg) => {
    setSaving(true);
    try { await api.updateAccount(patch); toast(msg || 'Saved'); }
    catch (e) { toast('Save failed: ' + (e.message || ''), 'error'); }
    finally { setSaving(false); }
  };

  // ---- Sending domain (per-tenant outreach identity) --------------------
  const [identities, setIdentities] = useState(null);
  const [domainForm, setDomainForm] = useState({ domain: '', from_email: '' });
  const [domBusy, setDomBusy] = useState('');

  const loadIdentities = async () => {
    try { const r = await api.outreachIdentities(); setIdentities(r.identities || []); }
    catch (e) { toast('Load failed: ' + (e.message || ''), 'error'); setIdentities([]); }
  };
  useEffect(() => { if (section === 'domain' && identities === null) loadIdentities(); }, [section]);

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
      <input class="sys-input" type=${opts.type || 'text'} placeholder=${opts.ph || ''}
        value=${p[k] || ''} onInput=${e => setProfile(k, e.target.value)} />
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
            <textarea class="sys-textarea" value=${p.bio || ''} onInput=${e => setProfile('bio', e.target.value)}></textarea>
          </div>
        </div>
        <div class="sys-actions"><button class="sys-btn" disabled=${saving} onClick=${() => save({ profile: data.profile }, 'Profile saved')}>${saving ? 'Saving…' : 'Save profile'}</button></div>
      </div>`,

    email: html`
      <div class="sys-section">
        <h2>Email</h2>
        <div class="sys-hint">Your sending identity and signature for emails sent from the CRM.</div>
        <div class="sys-field"><label>Display name</label>
          <input class="sys-input" placeholder="Name shown on your emails" value=${p.display_name || ''} onInput=${e => setProfile('display_name', e.target.value)} /></div>
        <div class="sys-field full">
          <label>Email signature</label>
          <textarea class="sys-textarea" style=${{ minHeight: '130px' }} value=${p.email_signature || ''} onInput=${e => setProfile('email_signature', e.target.value)}></textarea>
        </div>
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
          ['sequence_replies', 'Sequence replies', 'When a prospect replies to one of your sequences'],
          ['weekly_digest', 'Weekly digest', 'A weekly summary of your activity and performance'],
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
          <div class="sys-field"><label>Timezone</label><input class="sys-input" placeholder="e.g. Asia/Qatar" value=${data.preferences?.timezone || ''} onInput=${e => setPref('timezone', e.target.value)} /></div>
          <div class="sys-field"><label>Language</label>
            <select class="sys-select" value=${data.preferences?.locale || 'en'} onChange=${e => setPref('locale', e.target.value)}>
              <option value="en">English</option><option value="ar">العربية</option>
            </select></div>
          <div class="sys-field"><label>Default landing page</label>
            <select class="sys-select" value=${data.preferences?.default_landing || 'companies'} onChange=${e => setPref('default_landing', e.target.value)}>
              ${[['companies', 'Companies'], ['market-feed', 'Market Feed'], ['crm', 'CRM'], ['people', 'People']].map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}
            </select></div>
        </div>
        <div class="sys-actions"><button class="sys-btn" disabled=${saving} onClick=${() => save({ preferences: data.preferences }, 'Preferences saved')}>${saving ? 'Saving…' : 'Save preferences'}</button></div>
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
