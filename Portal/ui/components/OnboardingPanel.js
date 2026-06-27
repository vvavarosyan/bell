// OnboardingPanel — a dismissible "Getting Started" checklist for NEW portal
// users (mode === 'user' only). Reads live setup progress from /api/onboarding
// and guides the user through the core loop: set up their ICP → reveal a
// contact → add to CRM → send outreach. Auto-hides once every step is done or
// the user dismisses it. Fully fail-safe: any error → render nothing (never
// blocks the app), and it never mounts for admins/local-engine.

import { useState, useEffect } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { navigateTo } from '../lib/router.js';

const STEPS = [
  { key: 'icp',      tab: 'account',   label: 'Set up your Company & ICP profile',
    hint: 'Tell Bell who you sell to — it powers your matches, signals and Bella.' },
  { key: 'revealed', tab: 'companies', label: 'Reveal your first contact',
    hint: 'Filter to your target market, then reveal a company or person’s details.' },
  { key: 'crm',      tab: 'crm',       label: 'Add a lead to your CRM',
    hint: 'Track the companies and people you want to pursue.' },
  { key: 'outreach', tab: 'crm',       label: 'Send your first outreach email',
    hint: 'Reach out from your CRM using your own sending domain.' },
];

const CARD = {
  margin: '14px 18px 0', padding: '14px 16px',
  background: 'var(--panel-bg, rgba(255,255,255,0.035))',
  border: '1px solid var(--border, rgba(255,255,255,0.09))',
  borderRadius: '10px',
};
const DISMISS = {
  background: 'transparent', border: '1px solid var(--border, rgba(255,255,255,0.15))',
  color: 'var(--text-muted, #9aa)', borderRadius: '6px', padding: '4px 9px',
  fontSize: '11.5px', cursor: 'pointer',
};
const GO = {
  background: 'var(--accent-bright, #57b894)', border: 'none', color: '#0d130f',
  borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: 600,
  cursor: 'pointer', flex: '0 0 auto',
};
const dot = (ok) => ({
  width: '20px', height: '20px', borderRadius: '50%', flex: '0 0 auto',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px',
  background: ok ? 'var(--accent-bright, #57b894)' : 'transparent',
  color: ok ? '#0d130f' : 'var(--text-muted, #9aa)',
  border: ok ? 'none' : '1.5px solid var(--border, rgba(255,255,255,0.2))',
});

export function OnboardingPanel({ mode = 'local-admin' } = {}) {
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if (mode !== 'user') { setHidden(true); return undefined; }
    let dead = false;
    (async () => {
      try {
        const r = await api.onboarding();
        if (dead) return;
        if (!r || r.dismissed || r.complete) { setHidden(true); return; }
        setData(r);
      } catch { setHidden(true); }   // fail-safe — never block the portal
    })();
    return () => { dead = true; };
  }, [mode]);

  if (hidden || mode !== 'user' || !data) return null;

  const steps = data.steps || {};
  const done = STEPS.filter((s) => steps[s.key]).length;

  const dismiss = async () => {
    setHidden(true);
    try { await api.dismissOnboarding(); } catch { /* ignore */ }
  };

  return html`
    <div class="onboarding-card" style=${CARD}>
      <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
        <div style=${{ fontWeight: 700, fontSize: '14px', color: 'var(--text, #eee)' }}>👋 Getting started</div>
        <div style=${{ fontSize: '12px', color: 'var(--text-muted, #9aa)' }}>${done} of ${STEPS.length} complete</div>
        <div style=${{ flex: 1 }}></div>
        <button onClick=${dismiss} style=${DISMISS} title="Hide this checklist">Dismiss ✕</button>
      </div>
      <div style=${{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
        ${STEPS.map((s) => {
          const ok = !!steps[s.key];
          return html`
            <div key=${s.key} style=${{ display: 'flex', alignItems: 'center', gap: '11px' }}>
              <span style=${dot(ok)}>${ok ? '✓' : ''}</span>
              <div style=${{ flex: 1, minWidth: 0 }}>
                <div style=${{ fontSize: '13px', color: ok ? 'var(--text-muted, #9aa)' : 'var(--text, #eee)', textDecoration: ok ? 'line-through' : 'none' }}>${s.label}</div>
                ${!ok ? html`<div style=${{ fontSize: '11.5px', color: 'var(--text-muted, #9aa)', marginTop: '1px' }}>${s.hint}</div>` : null}
              </div>
              ${!ok ? html`<button onClick=${() => navigateTo(s.tab)} style=${GO}>Go →</button>` : null}
            </div>`;
        })}
      </div>
    </div>
  `;
}
