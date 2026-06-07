// System → Settings. Left rail (Profile / Account & Security / Notifications /
// Preferences) + body, matching the Bell settings vibe (.settings-shell).

import { useState, useEffect, useRef } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const SECTIONS = [
  { id: 'profile',       label: 'Profile' },
  { id: 'security',      label: 'Account & Security' },
  { id: 'notifications', label: 'Notifications' },
  { id: 'preferences',   label: 'Preferences' },
];
const FUNCTION_TEAMS = ['', 'sales', 'bd', 'marketing', 'research', 'gtm'];

export function AccountTab() {
  const [data, setData] = useState(null);
  const [section, setSection] = useState('profile');
  const [saving, setSaving] = useState(false);

  useEffect(() => { (async () => {
    try { setData(await api.getAccount()); }
    catch { setData({ profile: {}, notifications: {}, preferences: {} }); }
  })(); }, []);

  if (!data) return html`<div class="settings-shell"><div class="empty">Loading account…</div></div>`;

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

  const row = (k, lbl, opts = {}) => html`
    <div class="row">
      <label>${lbl}</label>
      <input type=${opts.type || 'text'} placeholder=${opts.ph || ''} value=${p[k] || ''}
        onInput=${e => setProfile(k, e.target.value)} />
    </div>`;

  const PAGES = {
    profile: html`
      <div class="card">
        <h2>Profile</h2>
        <div class="hint">How you appear across Bell, and the details used in your outreach.</div>
        ${row('full_name', 'Full name')}
        ${row('title', 'Job title', { ph: 'e.g. Head of Sales' })}
        ${row('department', 'Department', { ph: 'e.g. Commercial' })}
        <div class="row">
          <label>Function team</label>
          <select value=${p.function_team || ''} onChange=${e => setProfile('function_team', e.target.value || null)}>
            ${FUNCTION_TEAMS.map(t => html`<option key=${t} value=${t}>${t ? t.toUpperCase() : '—'}</option>`)}
          </select>
        </div>
        ${row('phone', 'Work phone')}
        ${row('mobile', 'Mobile')}
        ${row('location', 'Location', { ph: 'City, Country' })}
        <div class="row"><label>Email</label><input value=${p.email || ''} disabled style=${{ opacity: 0.6 }} /></div>
        ${row('linkedin_url', 'LinkedIn')}
        ${row('twitter_url', 'X / Twitter')}
        ${row('website_url', 'Website')}
        ${row('booking_link', 'Booking link', { ph: 'Calendly / Cal.com' })}
        <div class="row" style=${{ alignItems: 'flex-start' }}>
          <label>Short bio</label>
          <textarea value=${p.bio || ''} onInput=${e => setProfile('bio', e.target.value)}
            style=${{ flex: 1, minHeight: '70px', resize: 'vertical' }}></textarea>
        </div>
        <div class="row" style=${{ alignItems: 'flex-start' }}>
          <label>Email signature</label>
          <textarea value=${p.email_signature || ''} onInput=${e => setProfile('email_signature', e.target.value)}
            style=${{ flex: 1, minHeight: '90px', resize: 'vertical' }}></textarea>
        </div>
        <div class="hint">Your signature is appended to emails you send from the CRM.</div>
        <div class="row"><label></label><button disabled=${saving} onClick=${() => save({ profile: data.profile }, 'Profile saved')}>${saving ? 'Saving…' : 'Save profile'}</button></div>
      </div>`,

    security: html`<${SecurityPanel} />`,

    notifications: html`
      <div class="card">
        <h2>Notifications</h2>
        <div class="hint">Choose which emails Bell sends you.</div>
        ${[
          ['sequence_replies', 'Sequence replies', 'When a prospect replies to one of your sequences'],
          ['weekly_digest', 'Weekly digest', 'A weekly summary of your activity and performance'],
          ['credit_low', 'Low credit warning', 'When your credit balance is running low'],
          ['product_updates', 'Product updates', 'New Bell features and announcements'],
        ].map(([k, t, d]) => html`
          <div class="row" key=${k}>
            <label>${t}</label>
            <input type="checkbox" style=${{ flex: 'none', width: 'auto' }}
              checked=${data.notifications?.[k] !== false} onChange=${e => setNotif(k, e.target.checked)} />
            <span class="hint" style=${{ marginTop: 0 }}>${d}</span>
          </div>`)}
        <div class="row"><label></label><button disabled=${saving} onClick=${() => save({ notifications: data.notifications }, 'Notifications saved')}>${saving ? 'Saving…' : 'Save notifications'}</button></div>
      </div>`,

    preferences: html`
      <div class="card">
        <h2>Preferences</h2>
        <div class="row"><label>Timezone</label><input placeholder="e.g. Asia/Qatar" value=${data.preferences?.timezone || ''} onInput=${e => setPref('timezone', e.target.value)} /></div>
        <div class="row">
          <label>Language</label>
          <select value=${data.preferences?.locale || 'en'} onChange=${e => setPref('locale', e.target.value)}>
            <option value="en">English</option>
            <option value="ar">العربية</option>
          </select>
        </div>
        <div class="row">
          <label>Default landing page</label>
          <select value=${data.preferences?.default_landing || 'companies'} onChange=${e => setPref('default_landing', e.target.value)}>
            ${[['companies', 'Companies'], ['market-feed', 'Market Feed'], ['crm', 'CRM'], ['people', 'People']].map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}
          </select>
        </div>
        <div class="row"><label></label><button disabled=${saving} onClick=${() => save({ preferences: data.preferences }, 'Preferences saved')}>${saving ? 'Saving…' : 'Save preferences'}</button></div>
      </div>`,
  };

  return html`
    <div class="settings-shell">
      <div class="settings-rail">
        <div class="settings-rail-title">Settings</div>
        ${SECTIONS.map(s => html`
          <button key=${s.id} class=${'settings-rail-item' + (section === s.id ? ' active' : '')}
            onClick=${() => setSection(s.id)}>${s.label}</button>`)}
      </div>
      <div class="settings-body">
        ${PAGES[section]}
      </div>
    </div>`;
}

// Account & Security — Clerk's hosted profile mounted inline.
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
    <div class="card">
      <h2>Account & Security</h2>
      ${hasClerk
        ? html`<div ref=${ref}></div>`
        : html`<div class="hint">Account security (email, password, two-factor, devices) is managed by your sign-in provider and is available on the live app.</div>`}
    </div>`;
}
