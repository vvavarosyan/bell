// Left-rail navigation. Sections + items configured here.
// Items map to existing tab routes; placeholders show ComingSoon.

import { useState, useEffect, useRef } from 'react';
import { html } from '../lib/html.js';

// Role-based visibility per sidebar item.
//   'all' = visible to every signed-in user (including viewers)
//   array = visible only to listed roles
// platform_admin sees EVERYTHING regardless of declared visibility.
//
// In local-admin mode (Val's Mac), every item is shown — local user is
// always treated as platform_admin.
export const NAV_SECTIONS = [
  {
    label: 'Overview',
    items: [
      { id: 'market-feed',           label: 'Market Feed',          icon: 'feed',       placeholder: true,  visibility: 'all' },
      { id: 'signals',               label: 'Signals',              icon: 'insights', placeholder: true,  visibility: 'all' },
      { id: 'map',                   label: 'Map',                  icon: 'map',        placeholder: false, visibility: 'all' },
    ],
  },
  {
    label: 'Data',
    items: [
      { id: 'companies',  label: 'Companies', icon: 'building',  placeholder: false, visibility: 'all' },
      { id: 'people',     label: 'People',    icon: 'people',    placeholder: false, visibility: 'all' },
      { id: 'jobs',       label: 'Jobs',      icon: 'briefcase', placeholder: false, visibility: 'all' },
      { id: 'deep-data',  label: 'Deep Data', icon: 'database',  placeholder: false, visibility: 'all' },
    ],
  },
  {
    label: 'Workspace',
    items: [
      // Operational surfaces — visible to tenant members + above
      { id: 'crm',         label: 'CRM',         icon: 'crm',      placeholder: true,  visibility: ['platform_admin','owner','admin','lead','member','viewer'] },
      { id: 'research',    label: 'Research',    icon: 'research', placeholder: false, visibility: ['platform_admin','owner','admin','lead','member','viewer'] },
      { id: 'team',        label: 'Team',        icon: 'team',     placeholder: true,  visibility: ['platform_admin','owner','admin','lead','member','viewer'] },
      // Admin-only ops within a tenant
      { id: 'dedup-queue', label: 'Dedup Queue', icon: 'merge',    placeholder: false, visibility: ['platform_admin','owner','admin'] },
    ],
  },
  {
    label: 'System',
    items: [
      // Platform-admin-only (Bell.qa internal staff). Hidden on app.bell.qa
      // for every customer; visible on admin.bell.qa.
      { id: 'sources',     label: 'Sources',     icon: 'sources',  placeholder: false, visibility: ['platform_admin'] },
      { id: 'recent-jobs', label: 'Recent Jobs', icon: 'history',  placeholder: false, visibility: ['platform_admin'] },
      { id: 'sync',        label: 'Sync to Bell.qa', icon: 'sync', placeholder: false, visibility: ['platform_admin'] },
      { id: 'settings',    label: 'Settings',    icon: 'gear',     placeholder: false, visibility: 'all' },
    ],
  },
];

// Admin tools live only on the admin deployment (admin.bell.qa) and the local
// engine. On the user portal (BDI_MODE=user) these are blocked server-side, so
// we also hide them from the nav to avoid dead 403 links — even for a
// platform_admin who happens to be on app.bell.qa.
export const ADMIN_ONLY_NAV_IDS = new Set([
  'sources', 'recent-jobs', 'sync', 'settings', 'dedup-queue',
]);

/** True if an item should be shown to a user with the given role, in this mode. */
export function itemVisibleTo(item, role, mode = 'local-admin') {
  if (!role) return false;
  // On the user portal, admin tools are unavailable to everyone.
  if (mode === 'user' && ADMIN_ONLY_NAV_IDS.has(item.id)) return false;
  if (role === 'platform_admin') return true;            // sees everything (else)
  if (item.visibility === 'all' || item.visibility === undefined) return true;
  return Array.isArray(item.visibility) && item.visibility.includes(role);
}

// All nav ids in a flat lookup
export const NAV_IDS = NAV_SECTIONS.flatMap(s => s.items.map(i => i.id));

const ICONS = {
  feed:      html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11a9 9 0 0 1 9 9"/><path d="M4 4a16 16 0 0 1 16 16"/><circle cx="5" cy="19" r="1" fill="currentColor"/></svg>`,
  insights:  html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 17 9 11 13 15 21 7"/><polyline points="14 7 21 7 21 14"/></svg>`,
  map:       html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4l-6 2v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14"/><path d="M15 6v14"/></svg>`,
  merge:     html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3v6a6 6 0 0 0 6 6h0a6 6 0 0 0 6-6V3"/><path d="M12 15v6"/></svg>`,
  building:  html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/></svg>`,
  people:    html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2"/><circle cx="17" cy="9" r="2.5"/><path d="M21 21v-1.5a3.5 3.5 0 0 0-3.5-3.5"/></svg>`,
  briefcase: html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>`,
  database:  html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>`,
  crm:       html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0z"/><path d="M12 7v5l3 2"/></svg>`,
  research:  html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5"/></svg>`,
  team:      html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3"/><circle cx="5" cy="12" r="2"/><circle cx="19" cy="12" r="2"/><path d="M3 19a3 3 0 0 1 4-2.8"/><path d="M21 19a3 3 0 0 0-4-2.8"/><path d="M6 21v-1a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v1"/></svg>`,
  sources:   html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>`,
  gear:      html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8L4.2 7a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>`,
  history:   html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 7v5l3 2"/></svg>`,
  sync:      html`<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M3 21v-5h5"/></svg>`,
};

// Compact "k/m" formatter. 33845 → "33.8K", 117 → "117", 1500000 → "1.5M".
function compactCount(n) {
  if (n === null || n === undefined || isNaN(n)) return null;
  const v = Number(n);
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(v < 10_000_000 ? 1 : 0).replace(/\.0$/, '') + 'M';
  if (v >= 10_000)    return (v / 1_000).toFixed(0) + 'K';
  if (v >= 1_000)     return (v / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(v);
}

export function Sidebar({ activeId, onSelect, dbStatus, settings, stats, currentRole = 'platform_admin', mode = 'local-admin' }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef(null);

  // Which nav items get live counts, and which stats field to read.
  const COUNT_KEY = {
    companies:   stats?.companies_total,
    people:      stats?.people_total,
    jobs:        stats?.jobs_total,
    'deep-data': stats?.deep_data_total,
  };

  // Close 3-dots menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setMenuOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [menuOpen]);

  const adminEmail = settings?.admin_email || 'admin@local';
  const adminName  = adminEmail.split('@')[0]
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

  return html`
    <aside class="sidebar">
      <div class="sidebar-brand">
        <div class="brand-mark">BDI</div>
        <div class="brand-text">
          <div class="brand-name">Bell Data Intelligence</div>
          <div class="brand-tagline">Intelligence Command</div>
        </div>
      </div>

      <nav class="sidebar-nav">
        ${NAV_SECTIONS.map(section => {
          const visibleItems = section.items.filter(i => itemVisibleTo(i, currentRole, mode));
          if (visibleItems.length === 0) return null;
          return html`
          <div class="nav-section" key=${section.label}>
            <div class="nav-section-label">${section.label}</div>
            ${visibleItems.map(item => {
              const count = COUNT_KEY[item.id];
              const compact = count != null ? compactCount(count) : null;
              return html`
                <button
                  key=${item.id}
                  class=${'nav-item ' + (activeId === item.id ? 'active' : '') + (item.placeholder ? ' placeholder' : '')}
                  onClick=${() => onSelect(item.id)}
                  title=${item.placeholder ? item.label + ' — coming soon' : (compact != null ? item.label + ' (' + (count ?? 0).toLocaleString() + ')' : item.label)}
                >
                  <span class="nav-icon">${ICONS[item.icon] || null}</span>
                  <span class="nav-label">${item.label}</span>
                  ${compact != null ? html`<span class="nav-count">${compact}</span>` : null}
                  ${item.placeholder ? html`<span class="nav-soon">soon</span>` : null}
                </button>
              `;
            })}
          </div>
        `;
        })}
      </nav>

      <div class="sidebar-foot">
        <div class="db-status">
          <span class=${'dot ' + (dbStatus === 'up' ? '' : 'down')}></span>
          <span class="muted small">${dbStatus === 'up' ? 'bell_intel · localhost' : 'database offline'}</span>
        </div>
        <div class="user-tile" ref=${menuRef}>
          <div class="user-avatar">${adminName.charAt(0) || 'A'}</div>
          <div class="user-meta">
            <div class="user-name">${adminName}</div>
            <div class="user-plan">Admin · Pro</div>
          </div>
          <button class="user-dots" onClick=${() => setMenuOpen(o => !o)} title="Account menu">⋯</button>
          ${menuOpen ? html`
            <div class="user-menu">
              <button class="user-menu-item" onClick=${async () => {
                setMenuOpen(false);
                // Use the Clerk-backed signOut bridge if it exists (user/admin
                // mode). In local-admin mode there's no auth; show a hint.
                if (window.__bdiAuth?.signOut) {
                  try { await window.__bdiAuth.signOut(); }
                  catch (err) { alert('Sign-out failed: ' + err.message); }
                } else {
                  alert('Local-admin mode — no sign-in to sign out of.');
                }
              }}>
                Sign out
              </button>
            </div>
          ` : null}
        </div>
      </div>
    </aside>
  `;
}
