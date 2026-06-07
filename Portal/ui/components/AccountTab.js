// System → Settings. The signed-in user's own account: Profile, Account &
// Security (Clerk's hosted profile mounted inline), Notifications, Preferences.

import { useState, useEffect, useRef } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const card = { background: 'var(--bg-elev)', border: '1px solid var(--border)', borderRadius: '12px', padding: '20px', marginBottom: '16px', maxWidth: '720px' };
const label = { display: 'block', color: 'var(--text-muted)', fontSize: '12px', marginBottom: '4px' };
const input = { width: '100%', padding: '8px 10px', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text)', fontSize: '14px', boxSizing: 'border-box' };
const btnPrimary = { background: 'var(--accent-bright)', color: '#fff', border: 'none', padding: '9px 18px', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 };
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' };
const TABS = [['profile', 'Profile'], ['security', 'Account & Security'], ['notifications', 'Notifications'], ['preferences', 'Preferences']];
const FUNCTION_TEAMS = ['', 'sales', 'bd', 'marketing', 'research', 'gtm'];

export function AccountTab() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('profile');
  const [saving, setSaving] = useState(false);

  useEffect(() => { (async () => { try { setData(await api.getAccount()); } catch { setData({ profile: {}, notifications: {}, preferences: {} }); } })(); }, []);

  if (!data) return html`<div style=${{ padding: '24px', color: 'var(--text-muted)' }}>Loading account…</div>`;

  const setProfile = (k, v) => setData(d => ({ ...d, profile: { ...d.profile, [k]: v } }));
  const setNotif = (k, v) => setData(d => ({ ...d, notifications: { ...d.notifications, [k]: v } }));
  const setPref = (k, v) => setData(d => ({ ...d, preferences: { ...d.preferences, [k]: v } }));

  const save = async (patch, msg) => {
    setSaving(true);
    try { await api.updateAccount(patch); toast(msg || 'Saved', 'success'); }
    catch (e) { toast('Save failed: ' + (e.message || ''), 'error'); }
    finally { setSaving(false); }
  };

  const p = data.profile || {};
  const field = (k, lbl, opts = {}) => html`
    <div>
      <label style=${label}>${lbl}</label>
      <input style=${input} type=${opts.type || 'text'} placeholder=${opts.ph || ''}
        value=${p[k] || ''} onInput=${e => setProfile(k, e.target.value)} />
    </div>`;

  return html`
    <div style=${{ padding: '8px 4px' }}>
      <div style=${{ display: 'flex', gap: '4px', marginBottom: '18px', borderBottom: '1px solid var(--border)' }}>
        ${TABS.map(([id, lbl]) => html`
          <button key=${id} onClick=${() => setTab(id)} style=${{
            padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer',
            color: tab === id ? 'var(--text)' : 'var(--text-muted)', fontWeight: tab === id ? 600 : 400,
            borderBottom: tab === id ? '2px solid var(--accent-bright)' : '2px solid transparent',
          }}>${lbl}</button>`)}
      </div>

      ${tab === 'profile' ? html`
        <div style=${card}>
          <div style=${{ ...grid2, marginBottom: '14px' }}>
            ${field('full_name', 'Full name')}
            ${field('title', 'Job title', { ph: 'e.g. Head of Sales' })}
            ${field('department', 'Department', { ph: 'e.g. Commercial' })}
            <div>
              <label style=${label}>Function team</label>
              <select style=${input} value=${p.function_team || ''} onChange=${e => setProfile('function_team', e.target.value || null)}>
                ${FUNCTION_TEAMS.map(t => html`<option key=${t} value=${t}>${t ? t.toUpperCase() : '—'}</option>`)}
              </select>
            </div>
            ${field('phone', 'Work phone')}
            ${field('mobile', 'Mobile')}
            ${field('location', 'Location', { ph: 'City, Country' })}
            <div>
              <label style=${label}>Email</label>
              <input style=${{ ...input, opacity: 0.6 }} value=${p.email || ''} disabled />
            </div>
            ${field('linkedin_url', 'LinkedIn')}
            ${field('twitter_url', 'X / Twitter')}
            ${field('website_url', 'Website')}
            ${field('booking_link', 'Booking link', { ph: 'Calendly / Cal.com' })}
          </div>
          <div style=${{ marginBottom: '14px' }}>
            <label style=${label}>Short bio</label>
            <textarea style=${{ ...input, minHeight: '70px', resize: 'vertical' }} value=${p.bio || ''} onInput=${e => setProfile('bio', e.target.value)}></textarea>
          </div>
          <div style=${{ marginBottom: '16px' }}>
            <label style=${label}>Email signature <span style=${{ color: 'var(--text-muted)' }}>— appended to your CRM emails</span></label>
            <textarea style=${{ ...input, minHeight: '90px', resize: 'vertical', fontFamily: 'inherit' }} value=${p.email_signature || ''} onInput=${e => setProfile('email_signature', e.target.value)}></textarea>
          </div>
          <button style=${btnPrimary} disabled=${saving} onClick=${() => save({ profile: data.profile }, 'Profile saved')}>${saving ? 'Saving…' : 'Save profile'}</button>
        </div>` : null}

      ${tab === 'security' ? html`<${SecurityPanel} />` : null}

      ${tab === 'notifications' ? html`
        <div style=${card}>
          ${[
            ['sequence_replies', 'Sequence replies', 'When a prospect replies to one of your sequences'],
            ['weekly_digest', 'Weekly digest', 'A summary of your activity and performance each week'],
            ['credit_low', 'Low credit warning', 'When your credit balance is running low'],
            ['product_updates', 'Product updates', 'New Bell features and announcements'],
          ].map(([k, t, d]) => html`
            <label key=${k} style=${{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
              <input type="checkbox" checked=${data.notifications?.[k] !== false} onChange=${e => setNotif(k, e.target.checked)} />
              <span><div style=${{ fontWeight: 600 }}>${t}</div><div style=${{ color: 'var(--text-muted)', fontSize: '12px' }}>${d}</div></span>
            </label>`)}
          <button style=${{ ...btnPrimary, marginTop: '16px' }} disabled=${saving} onClick=${() => save({ notifications: data.notifications }, 'Notifications saved')}>${saving ? 'Saving…' : 'Save notifications'}</button>
        </div>` : null}

      ${tab === 'preferences' ? html`
        <div style=${card}>
          <div style=${{ ...grid2, marginBottom: '16px' }}>
            <div>
              <label style=${label}>Timezone</label>
              <input style=${input} placeholder="e.g. Asia/Qatar" value=${data.preferences?.timezone || ''} onInput=${e => setPref('timezone', e.target.value)} />
            </div>
            <div>
              <label style=${label}>Language</label>
              <select style=${input} value=${data.preferences?.locale || 'en'} onChange=${e => setPref('locale', e.target.value)}>
                <option value="en">English</option>
                <option value="ar">العربية</option>
              </select>
            </div>
            <div>
              <label style=${label}>Default landing page</label>
              <select style=${input} value=${data.preferences?.default_landing || 'companies'} onChange=${e => setPref('default_landing', e.target.value)}>
                ${[['companies', 'Companies'], ['market-feed', 'Market Feed'], ['crm', 'CRM'], ['people', 'People']].map(([v, l]) => html`<option key=${v} value=${v}>${l}</option>`)}
              </select>
            </div>
          </div>
          <button style=${btnPrimary} disabled=${saving} onClick=${() => save({ preferences: data.preferences }, 'Preferences saved')}>${saving ? 'Saving…' : 'Save preferences'}</button>
        </div>` : null}
    </div>`;
}

// Account & Security — mount Clerk's hosted UserProfile (email, password, 2FA,
// devices, delete account). Falls back to a note on the local engine (no Clerk).
function SecurityPanel() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el && typeof window !== 'undefined' && window.Clerk?.mountUserProfile) {
      try { window.Clerk.mountUserProfile(el, { appearance: { baseTheme: undefined } }); } catch { /* ignore */ }
      return () => { try { window.Clerk.unmountUserProfile(el); } catch { /* ignore */ } };
    }
  }, []);
  return html`
    <div style=${{ ...card, maxWidth: '100%' }}>
      ${(typeof window !== 'undefined' && window.Clerk?.mountUserProfile)
        ? html`<div ref=${ref}></div>`
        : html`<div style=${{ color: 'var(--text-muted)', fontSize: '14px' }}>Account security (password, two-factor, devices) is managed by your sign-in provider and is available on the live app.</div>`}
    </div>`;
}
