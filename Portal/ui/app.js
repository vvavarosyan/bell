// Bell Data Intelligence — Portal entry. Mounts the React tree at #root.

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

function App() {
  const parseHash = () => {
    const raw = (window.location.hash || '').replace(/^#/, '').split(':')[0];
    return NAV_IDS.includes(raw) ? raw : 'companies';
  };
  const [tab, setTab] = useState(parseHash);
  const [stats, setStats] = useState(null);
  const [dbStatus, setDbStatus] = useState('unknown');
  const [settings, setSettings] = useState({});

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

createRoot(document.getElementById('root')).render(createElement(App));
