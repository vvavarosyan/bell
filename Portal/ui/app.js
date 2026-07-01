// Bell Data Intelligence — Portal entry. Mounts the React tree at #root.
//
// Auth bootstrap (before any React work):
//   1. Fetch /api/auth/mode to learn whether auth is required
//   2. local-admin mode → skip Clerk, mount Portal as platform_admin
//   3. user/admin mode → load Clerk SDK, require a session
//      • no session → redirect to /sign-in
//      • session → fetch /api/auth/me, mount Portal with that user's role

import { createElement, useState, useEffect, useCallback, Component } from 'react';
import { createRoot } from 'react-dom';
import { html } from './lib/html.js';
import { api } from './lib/api.js';
import { Sidebar, NAV_IDS } from './components/Sidebar.js';
import { currentRoute, navigateTo } from './lib/router.js';
import { ComingSoon } from './components/ComingSoon.js';
import { CompaniesTab, ArchivedCompaniesTab } from './components/CompaniesTab.js';
import { PeopleTab }    from './components/PeopleTab.js';
import { JobsTab }      from './components/JobsTab.js';
import { SettingsTab }  from './components/SettingsTab.js';
import { SourcesTab }   from './components/SourcesTab.js';
import { MapTab }       from './components/MapTab.js';
import { DedupQueueTab } from './components/DedupQueueTab.js';
import { RecentJobsTab } from './components/RecentJobsTab.js';
import { StatsTab }      from './components/StatsTab.js';
import { AdminUsersTab } from './components/AdminUsersTab.js';
import { ResearchTab }   from './components/ResearchTab.js';
import { ResearchApprovalsTab } from './components/ResearchApprovalsTab.js';
import { DeepDataTab }   from './components/DeepDataTab.js';
import { SyncTab }       from './components/SyncTab.js';
import { MarketFeedTab } from './components/MarketFeedTab.js';
import { CrmTab }        from './components/CrmTab.js';
import { BillingTab }    from './components/BillingTab.js';
import { AccountTab }    from './components/AccountTab.js';
import { DetailRequestsTab } from './components/DetailRequestsTab.js';
import { WebsiteCandidatesTab } from './components/WebsiteCandidatesTab.js';
import { ContributionsTab } from './components/ContributionsTab.js';
import { HarvestHistoryTab } from './components/HarvestHistoryTab.js';
import { EngineTab } from './components/EngineTab.js';
import { ManualLookupTab } from './components/ManualLookupTab.js';
import { NotificationBell } from './components/NotificationBell.js';
import { OnboardingPanel } from './components/OnboardingPanel.js';
import { AnnouncementsTab } from './components/AnnouncementsTab.js';
import { EmailTemplatesTab } from './components/EmailTemplatesTab.js';
import { ZeroRiskPortal } from './components/ZeroRiskPortal.js';
import { ZeroRiskAdmin } from './components/ZeroRiskAdmin.js';

// Error boundary so a crash in ONE view shows a readable message instead of
// blanking the whole app. Reset per-view via a `key` on the active tab.
class ViewErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  componentDidCatch(error) { try { console.error('[view crashed]', error); } catch {} this.setState({ error }); }
  render() {
    const e = this.state.error;
    if (e) return html`<div style=${{ padding: '24px' }}>
      <b style=${{ color: 'var(--red, #e5534b)' }}>This view hit an error and couldn't render.</b>
      <pre style=${{ marginTop: '10px', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-muted)' }}>${String((e && e.stack) || (e && e.message) || e)}</pre>
      <div class="muted" style=${{ marginTop: '10px' }}>The rest of the app is fine — pick another section. If it persists, copy this message to support.</div>
    </div>`;
    return this.props.children;
  }
}

// Maps a sidebar nav id to a renderable view. Items not listed here fall back
// to a ComingSoon placeholder with the item's label.
const VIEWS = {
  'market-feed': { Component: MarketFeedTab },
  'crm':         { Component: CrmTab },
  'companies':   { Component: CompaniesTab },
  'people':      { Component: PeopleTab },
  'jobs':        { Component: JobsTab },
  'sources':     { Component: SourcesTab },
  'db-stats':    { Component: StatsTab },
  'admin-users': { Component: AdminUsersTab },
  'settings':    { Component: SettingsTab },
  'billing':     { Component: BillingTab },
  'account':     { Component: AccountTab },
  'map':         { Component: MapTab },
  'dedup-queue': { Component: DedupQueueTab },
  'recent-jobs': { Component: RecentJobsTab },
  'research':    { Component: ResearchTab },
  'approvals':   { Component: ResearchApprovalsTab },
  'detail-requests': { Component: DetailRequestsTab },
  'website-candidates': { Component: WebsiteCandidatesTab },
  'contributions': { Component: ContributionsTab },
  'zero-risk-admin': { Component: ZeroRiskAdmin },
  'manual-lookup': { Component: ManualLookupTab },
  'engine': { Component: EngineTab },
  'harvest-history': { Component: HarvestHistoryTab },
  'announcements': { Component: AnnouncementsTab },
  'email-templates': { Component: EmailTemplatesTab },
  'deep-data':   { Component: DeepDataTab },
  'sync':        { Component: SyncTab },
  // Archived is reachable via deep-link/sidebar too
  'archived':    { Component: ArchivedCompaniesTab },
};

const LABELS = {
  'companies': 'Companies', 'people': 'People', 'jobs': 'Jobs',
  'sources': 'Sources', 'settings': 'System Config', 'archived': 'Archived',
  'billing': 'Billing', 'account': 'Settings',
  'market-feed': 'Market Feed',
  'signals': 'Signals',
  'map': 'Map',
  'dedup-queue': 'Dedup Queue',
  'recent-jobs': 'Recent Jobs',
  'db-stats': 'Database',
  'admin-users': 'Users',
  'deep-data': 'Deep Data',
  'sync': 'Sync to Bell.qa',
  'crm': 'CRM',
  'research': 'Research',
  'approvals': 'Research Approvals',
  'detail-requests': 'Detail Requests',
  'website-candidates': 'Website Review',
  'contributions': 'Contributions',
  'zero-risk-admin': '0 Risk Agreements',
  'manual-lookup': 'Manual Lookup',
  'engine': 'Local Engines',
  'harvest-history': 'Harvest History',
  'announcements': 'Announcements',
  'email-templates': 'Email Templates',
  'team': 'Team',
};

function App({ initialUser, initialTenant, mode }) {
  const resolveTab = () => {
    const { tab } = currentRoute();
    return NAV_IDS.includes(tab) ? tab : 'market-feed';
  };
  const [tab, setTab] = useState(resolveTab);
  const [stats, setStats] = useState(null);
  const [dbStatus, setDbStatus] = useState('unknown');
  const [settings, setSettings] = useState({});
  const currentRole = initialUser?.role || 'platform_admin';

  // Normalize the URL on first load (e.g. '/' or an unknown path → /companies).
  useEffect(() => {
    const { tab: raw } = currentRoute();
    if (!NAV_IDS.includes(raw)) navigateTo(tab);
  }, []);

  // Re-sync the active tab on SPA navigation + browser back/forward.
  useEffect(() => {
    const onNav = () => {
      const next = resolveTab();
      setTab(prev => (prev !== next ? next : prev));
    };
    window.addEventListener('bdi:navigate', onNav);
    window.addEventListener('popstate', onNav);
    return () => {
      window.removeEventListener('bdi:navigate', onNav);
      window.removeEventListener('popstate', onNav);
    };
  }, []);

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
        onSelect=${(id) => navigateTo(id)}
        dbStatus=${dbStatus}
        settings=${settings}
        stats=${stats}
        currentRole=${currentRole}
        currentUser=${initialUser}
        credits=${credits}
        mode=${mode?.mode || 'local-admin'}
      />
      <main class="app-main">
        ${(() => { const imp = api.getImpersonation?.(); return imp ? html`
          <div style=${{ display: 'flex', alignItems: 'center', gap: '12px', padding: '7px 18px', background: 'rgba(232,142,168,0.16)', borderBottom: '1px solid rgba(232,142,168,0.5)', fontSize: '12.5px', color: 'var(--text)' }}>
            <span>👁 Viewing as <strong>${imp.name}</strong> — impersonating</span>
            <span style=${{ flex: 1 }}></span>
            <button onClick=${() => { api.clearImpersonation(); window.location.href = '/'; }}
              style=${{ background: 'rgb(232 142 168)', border: 'none', color: '#1a1010', borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>Exit impersonation</button>
          </div>` : null; })()}
        <div class="page-header">
          <div class="page-title">${LABELS[tab] || tab}</div>
          ${stats && mode?.mode !== 'user' ? html`
            <div class="page-stats-inline">
              <span><b>${stats.companies_total.toLocaleString()}</b> companies</span>
              <span><b>${stats.people_total.toLocaleString()}</b> people</span>
              <span><b>${stats.jobs_total.toLocaleString()}</b> jobs</span>
              <span><b>$${stats.usd_total.toFixed(2)}</b> spent</span>
            </div>
          ` : null}
          <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', marginLeft: 'auto' }}>
            ${credits && mode?.mode !== 'user' ? html`
              <div class="credit-pill" title=${credits.unlimited ? 'Internal / admin — unlimited credits' : `${credits.plan || ''} plan · ${(credits.monthly_allotment ?? 0).toLocaleString()} credits/month`}>
                <span class="credit-dot"></span>
                ${credits.unlimited
                  ? html`<b>Unlimited</b> credits`
                  : html`<b>${(credits.balance ?? 0).toLocaleString()}</b> credits`}
              </div>
            ` : null}
            <${NotificationBell} />
          </div>
        </div>

        ${(mode?.mode || 'local-admin') === 'user' ? html`<${OnboardingPanel} mode="user" />` : null}

        ${Active
          ? html`<${ViewErrorBoundary} key=${tab}><${Active} mode=${mode?.mode || 'local-admin'} /></${ViewErrorBoundary}>`
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
  // 0. Capture a 0 Risk "join" intent NOW, before any auth redirect can drop the
  //    ?zero-risk=join query param (sign-in bounces to /sign-in and Clerk returns
  //    to "/" without the query). We persist it and read it back in step 5b.
  try {
    if (new URLSearchParams(window.location.search).get('zero-risk') === 'join') {
      localStorage.setItem('bdi_zr_join', '1');
    }
  } catch { /* ignore */ }

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

  // 5b. 0 Risk accounts get a dedicated portal and pay via revenue-share, so they
  //     must skip the subscription gate below. A fresh joiner arriving from the
  //     marketing CTA (?zero-risk=join) is enrolled into 0 Risk mode here.
  try {
    let zr = await api.zrStatus();
    let wantsJoin = new URLSearchParams(window.location.search).get('zero-risk') === 'join';
    // On the dedicated 0 Risk surface (0risk.bell.qa) EVERY visitor is a 0 Risk
    // user — enrol + show the portal with a clean URL, no ?zero-risk=join needed.
    const zrHost = /^0risk\b/i.test(location.hostname);
    if (zrHost) wantsJoin = true;
    try { if (!wantsJoin && localStorage.getItem('bdi_zr_join') === '1') wantsJoin = true; } catch { /* ignore */ }
    if (zr.account_type !== 'zero_risk' && wantsJoin && me.user.role !== 'platform_admin') {
      try { await api.zrEnroll(); zr = await api.zrStatus(); } catch { /* fall through to normal flow */ }
    }
    // Intent consumed (whether or not enrolment succeeded) — don't re-trigger later.
    if (wantsJoin) { try { localStorage.removeItem('bdi_zr_join'); } catch { /* ignore */ } }
    if (zr.account_type === 'zero_risk') {
      createRoot(rootEl).render(createElement(ZeroRiskPortal, { user: me.user, status: zr }));
      return;
    }
    // On the 0risk.bell.qa surface but NOT a 0 Risk account (a paid customer or
    // admin) — the 0risk host is 0-Risk-only, so send them to the equivalent
    // page on the main app domain (0risk.bell.qa → app.bell.qa, staging too).
    if (zrHost) {
      const appHost = location.hostname.replace(/^0risk/i, 'app');
      window.location.replace(`${location.protocol}//${appHost}${location.pathname}${location.search}`);
      return;
    }
  } catch { /* not a 0 Risk account or endpoint unavailable — continue normally */ }

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
