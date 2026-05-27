// Bell Data Intelligence — Portal entry. Mounts the React tree at #root.
//
// Auth bootstrap (before any React work):
//   1. Fetch /api/auth/mode to learn whether auth is required
//   2. local-admin mode → skip Clerk, mount Portal as platform_admin
//   3. user/admin mode → load Clerk SDK, require a session
//      • no session → redirect to /sign-in
//      • session → fetch /api/auth/me, mount Portal with that user's role

import { createElement, useState, useEffect, useCallback } from 'react';
import { createRoot } from 'react-dom';
import { html } from './lib/html.js';
import { api } from './lib/api.js';
import { Sidebar, NAV_IDS } from './components/Sidebar.js';
import { ComingSoon } from './components/ComingSoon.js';
import { CompaniesTab, ArchivedCompaniesTab } from './components/CompaniesTab.js';
import { PeopleTab }    from './components/PeopleTab.js';
import { JobsTab }      from './components/JobsTab.js';
import { SettingsTab }  from './components/SettingsTab.js';
import { SourcesTab }   from './components/SourcesTab.js';
import { MapTab }       from './components/MapTab.js';
import { DedupQueueTab } from './components/DedupQueueTab.js';
import { RecentJobsTab } from './components/RecentJobsTab.js';
import { ResearchTab }   from './components/ResearchTab.js';
import { DeepDataTab }   from './components/DeepDataTab.js';

// Maps a sidebar nav id to a renderable view. Items not listed here fall back
// to a ComingSoon placeholder with the item's label.
const VIEWS = {
  'companies':   { Component: CompaniesTab },
  'people':      { Component: PeopleTab },
  'jobs':        { Component: JobsTab },
  'sources':     { Component: SourcesTab },
  'settings':    { Component: SettingsTab },
  'map':         { Component: MapTab },
  'dedup-queue': { Component: DedupQueueTab },
  'recent-jobs': { Component: RecentJobsTab },
  'research':    { Component: ResearchTab },
  'deep-data':   { Component: DeepDataTab },
  // Archived is reachable via deep-link/sidebar too
  'archived':    { Component: ArchivedCompaniesTab },
};

const LABELS = {
  'companies': 'Companies', 'people': 'People', 'jobs': 'Jobs',
  'sources': 'Sources', 'settings': 'Settings', 'archived': 'Archived',
  'market-feed': 'Market Feed',
  'signals': 'Signals',
  'map': 'Map',
  'dedup-queue': 'Dedup Queue',
  'recent-jobs': 'Recent Jobs',
  'deep-data': 'Deep Data',
  'crm': 'CRM',
  'research': 'Research',
  'team': 'Team',
};

function App({ initialUser, initialTenant, mode }) {
  const parseHash = () => {
    const raw = (window.location.hash || '').replace(/^#/, '').split(':')[0];
    return NAV_IDS.includes(raw) ? raw : 'companies';
  };
  const [tab, setTab] = useState(parseHash);
  const [stats, setStats] = useState(null);
  const [dbStatus, setDbStatus] = useState('unknown');
  const [settings, setSettings] = useState({});
  const currentRole = initialUser?.role || 'platform_admin';

  useEffect(() => {
    if (!window.location.hash.includes(':')) window.location.hash = tab;
  }, [tab]);

  useEffect(() => {
    const onHash = () => {
      const next = parseHash();
      if (next !== tab) setTab(next);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [tab]);

  const refreshHeader = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([api.stats(), api.health()]);
      setStats(s);
      setDbStatus(h.ok ? 'up' : 'down');
    } catch (err) {
      setDbStatus('down');
    }
  }, []);

  useEffect(() => {
    refreshHeader();
    const t = setInterval(refreshHeader, 30_000);
    return () => clearInterval(t);
  }, [refreshHeader]);

  // Load settings once so we can show admin name in the sidebar footer
  useEffect(() => {
    (async () => {
      try { const r = await api.settings(); setSettings(r.settings || {}); } catch { /* ignore */ }
    })();
  }, []);

  const view = VIEWS[tab];
  const Active = view?.Component;

  return html`
    <div class="app-shell">
      <${Sidebar}
        activeId=${tab}
        onSelect=${(id) => setTab(id)}
        dbStatus=${dbStatus}
        settings=${settings}
        stats=${stats}
        currentRole=${currentRole}
      />
      <main class="app-main">
        <div class="page-header">
          <div class="page-title">${LABELS[tab] || tab}</div>
          ${stats ? html`
            <div class="page-stats-inline">
              <span><b>${stats.companies_total.toLocaleString()}</b> companies</span>
              <span><b>${stats.people_total.toLocaleString()}</b> people</span>
              <span><b>${stats.jobs_total.toLocaleString()}</b> jobs</span>
              <span><b>$${stats.usd_total.toFixed(2)}</b> spent</span>
            </div>
          ` : null}
        </div>

        ${Active
          ? html`<${Active} />`
          : html`<${ComingSoon} label=${LABELS[tab] || tab} />`}
      </main>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Auth bootstrap — runs before mounting the React tree.
// ---------------------------------------------------------------------------

const rootEl = document.getElementById('root');
const renderBootMessage = (msg) => {
  rootEl.innerHTML = `<div class="boot-loader">${msg}</div>`;
};

async function bootstrap() {
  // 1. Ask the server what mode we're in
  let mode;
  try {
    const r = await fetch('/api/auth/mode');
    mode = await r.json();
  } catch {
    renderBootMessage('Could not reach the server. Please refresh.');
    return;
  }

  // 2. local-admin mode — no auth, mount immediately
  if (mode.mode === 'local-admin' || !mode.auth_required) {
    window.__bdiAuth = { getToken: async () => null, required: false };
    createRoot(rootEl).render(
      createElement(App, { initialUser: null, initialTenant: null, mode })
    );
    return;
  }

  // 3. user/admin mode — load Clerk SDK + require a session
  if (!mode.publishable_key) {
    renderBootMessage('Authentication is not configured on this deployment.<br/>(CLERK_PUBLISHABLE_KEY missing.)');
    return;
  }

  renderBootMessage('Signing you in…');

  // Load Clerk JS SDK from CDN
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-clerk-publishable-key', mode.publishable_key);
    script.src = 'https://cdn.jsdelivr.net/npm/@clerk/clerk-js@5/dist/clerk.browser.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });

  try {
    await window.Clerk.load();
  } catch (err) {
    renderBootMessage('Failed to load authentication: ' + (err.message || err));
    return;
  }

  if (!window.Clerk.user) {
    // Not signed in → bounce to sign-in
    window.location.replace('/sign-in');
    return;
  }

  // 4. Hook up token-getter for api.js
  window.__bdiAuth = {
    required: true,
    getToken: async () => {
      if (!window.Clerk.session) return null;
      return await window.Clerk.session.getToken();
    },
    signOut: async () => {
      await window.Clerk.signOut();
      window.location.replace('/sign-in');
    },
  };

  // 5. Fetch our DB-side user + tenant. May return 401 'user_not_provisioned'
  //    briefly between sign-up and webhook delivery; retry a few times.
  let me;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      me = await api.authMe();
      break;
    } catch (err) {
      if (attempt === 4) {
        renderBootMessage('Account is still being set up — please try again in a moment.');
        return;
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // 6. Subscription gate: non-platform_admin users with no active sub get
  //    bounced to /subscribe. Bell has no free tier.
  if (me.user.role !== 'platform_admin') {
    try {
      const sub = await api.billingSubscription();
      if (!sub.is_active) {
        window.location.replace('/subscribe');
        return;
      }
    } catch {
      // If subscription endpoint fails, default to /subscribe (fail safe)
      window.location.replace('/subscribe');
      return;
    }
  }

  createRoot(rootEl).render(
    createElement(App, { initialUser: me.user, initialTenant: me.tenant, mode })
  );
}

bootstrap();
