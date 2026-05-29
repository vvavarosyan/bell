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
import { SyncTab }       from './components/SyncTab.js';

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
  'sync':        { Component: SyncTab },
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
  'sync': 'Sync to Bell.qa',
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

  const [credits, setCredits] = useState(null);

  const refreshHeader = useCallback(async () => {
    try {
      const [s, h] = await Promise.all([api.stats(), api.health()]);
      setStats(s);
      setDbStatus(h.ok ? 'up' : 'down');
    } catch (err) {
      setDbStatus('down');
    }
  }, []);

  const refreshCredits = useCallback(async () => {
    try { setCredits(await api.creditBalance()); } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refreshHeader();
    refreshCredits();
    const t = setInterval(() => { refreshHeader(); refreshCredits(); }, 30_000);
    // Any reveal dispatches this so the pill updates immediately.
    const onCredits = () => refreshCredits();
    window.addEventListener('bdi:credits-changed', onCredits);
    return () => { clearInterval(t); window.removeEventListener('bdi:credits-changed', onCredits); };
  }, [refreshHeader, refreshCredits]);

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
        currentUser=${initialUser}
        mode=${mode?.mode || 'local-admin'}
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
          ${credits ? html`
            <div class="credit-pill" title=${credits.unlimited ? 'Internal / admin — unlimited credits' : `${credits.plan || ''} plan · ${(credits.monthly_allotment ?? 0).toLocaleString()} credits/month`}>
              <span class="credit-dot"></span>
              ${credits.unlimited
                ? html`<b>Unlimited</b> credits`
                : html`<b>${(credits.balance ?? 0).toLocaleString()}</b> credits`}
            </div>
          ` : null}
        </div>

        ${Active
          ? html`<${Active} mode=${mode?.mode || 'local-admin'} />`
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
  //    On a final 401 with a different reason (e.g. invalid_token), surface
  //    the actual reason so the user/operator can see what's wrong instead
  //    of being redirect-looped.
  let me, lastErr;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      me = await api.authMe();
      break;
    } catch (err) {
      lastErr = err;
      if (attempt === 4) {
        const reason = err?.body?.reason || err?.message || 'unknown';
        const detail = err?.body?.detail ? ' — ' + err.body.detail : '';
        renderBootMessage(`Could not verify your session: ${reason}${detail}<br/><br/><a href="/sign-in" style="color: var(--accent-bright)">Try sign in again</a>`);
        return;
      }
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  // 6. Subscription gate: non-platform_admin users with no active sub get
  //    bounced to /subscribe. Bell has no free tier.
  //
  // Special case: if returning from Stripe payment (?stripe=success), the
  // checkout.session.completed webhook may take a few seconds to fire and
  // flip subscription_status to 'active'. Poll for ~15 seconds before
  // giving up and sending the user back to /subscribe.
  if (me.user.role !== 'platform_admin') {
    const fromStripe = new URLSearchParams(window.location.search).get('stripe') === 'success';
    const maxAttempts = fromStripe ? 8 : 1;
    let activated = false;

    if (fromStripe) renderBootMessage('Activating your subscription…');

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const sub = await api.billingSubscription();
        if (sub.is_active) { activated = true; break; }
      } catch { /* keep trying */ }
      if (attempt < maxAttempts - 1) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    if (!activated) {
      window.location.replace('/subscribe');
      return;
    }

    // Clean the ?stripe=success param so it's not preserved in the URL bar
    if (fromStripe) {
      const url = new URL(window.location.href);
      url.searchParams.delete('stripe');
      url.searchParams.delete('session_id');
      window.history.replaceState({}, '', url.toString());
    }
  }

  createRoot(rootEl).render(
    createElement(App, { initialUser: me.user, initialTenant: me.tenant, mode })
  );
}

bootstrap();
