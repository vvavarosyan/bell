// System → Settings. Left rail (Profile / Email / Notifications / Preferences /
// Account & Security) + a full-bleed, modern body (.sys-body).

import { useState, useEffect, useRef } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const SECTIONS = [
  { id: 'profile',       label: 'Profile' },
  { id: 'email',         label: 'Email' },
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
