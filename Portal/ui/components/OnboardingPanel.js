// OnboardingPanel — the guided "Getting Started" setup card for NEW portal
// users (mode === 'user' only). Reads a WEIGHTED completion state from
// /api/onboarding and shows a % progress ring plus each step with two ways to
// finish it: "Do it →" (jumps you to the right screen) or "✨ Bella does it"
// (hands the whole step to Bella). Auto-hides once everything is done or the
// user dismisses it. Fully fail-safe: any error → render nothing (never blocks
// the app), and it never mounts for admins / the local engine.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { currentRoute, navigateTo } from '../lib/router.js';
import { emitBellaAction, stashPending, openBella } from '../lib/bellaBus.js';

const CARD = {
  margin: '14px 18px 0', padding: '14px 16px',
  background: 'var(--panel-bg, rgba(255,255,255,0.035))',
  border: '1px solid var(--border, rgba(255,255,255,0.09))',
  borderRadius: '10px',
};
const DISMISS = {
  background: 'transparent', border: '1px solid var(--border, rgba(255,255,255,0.15))',
  color: 'var(--text-muted, #9aa)', borderRadius: '6px', padding: '4px 9px',
  fontSize: '11.5px', cursor: 'pointer', flex: '0 0 auto',
};
const GO = {
  background: 'var(--accent-bright, #57b894)', border: 'none', color: '#0d130f',
  borderRadius: '6px', padding: '5px 12px', fontSize: '12px', fontWeight: 600,
  cursor: 'pointer', flex: '0 0 auto',
};
const BELLA_BTN = {
  background: 'transparent', border: '1px solid var(--accent, #5b8cff)',
  color: 'var(--accent-bright, #a5c3ff)', borderRadius: '6px', padding: '5px 10px',
  fontSize: '12px', fontWeight: 600, cursor: 'pointer', flex: '0 0 auto', whiteSpace: 'nowrap',
};
const dot = (ok) => ({
  width: '22px', height: '22px', borderRadius: '50%', flex: '0 0 auto',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700,
  background: ok ? 'var(--accent-bright, #57b894)' : 'transparent',
  color: ok ? '#0d130f' : 'var(--text-muted, #9aa)',
  border: ok ? 'none' : '1.5px solid var(--border, rgba(255,255,255,0.2))',
});

export function OnboardingPanel({ mode = 'local-admin' } = {}) {
  const [data, setData] = useState(null);
  const [hidden, setHidden] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await api.onboarding();
      if (!r || r.dismissed || r.complete) { setHidden(true); return; }
      setData(r);
    } catch { setHidden(true); }   // fail-safe — never block the portal
  }, []);

  useEffect(() => {
    if (mode !== 'user') { setHidden(true); return undefined; }
    load();
    // Progress changes when Bella or Settings write, or when the user comes
    // back to the tab after doing a step elsewhere — refetch on those signals.
    const on = () => load();
    window.addEventListener('bdi:icp-changed', on);
    window.addEventListener('bdi:account-changed', on);
    window.addEventListener('bdi:crm-changed', on);
    window.addEventListener('focus', on);
    return () => {
      window.removeEventListener('bdi:icp-changed', on);
      window.removeEventListener('bdi:account-changed', on);
      window.removeEventListener('bdi:crm-changed', on);
      window.removeEventListener('focus', on);
    };
  }, [mode, load]);

  if (hidden || mode !== 'user' || !data) return null;

  const items = data.items || [];
  const percent = data.percent || 0;
  const doneN = items.filter((i) => i.done).length;

  const dismiss = async () => {
    setHidden(true);
    try { await api.dismissOnboarding(); } catch { /* ignore */ }
  };

  // "Do it →": jump to the step's screen. For a Settings sub-page, tell
  // AccountTab which section to open (live if it's already the tab, else stash
  // so it applies on mount) — the same mechanism Bella's navigate uses.
  const goTo = (action) => {
    if (!action) return;
    if (action.subsection) {
      const act = { type: 'settings_section', id: action.subsection };
      if (currentRoute().tab === action.tab) emitBellaAction(act); else stashPending(act);
    }
    navigateTo(action.tab);
  };

  const R = 18, CIRC = 2 * Math.PI * R, off = CIRC * (1 - Math.max(0, Math.min(100, percent)) / 100);

  return html`
    <div class="onboarding-card" style=${CARD}>
      <div style=${{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
        <svg width="48" height="48" viewBox="0 0 48 48" style=${{ flex: '0 0 auto' }} aria-label=${percent + '% set up'}>
          <circle cx="24" cy="24" r=${R} fill="none" stroke="var(--border, rgba(255,255,255,0.14))" stroke-width="4" />
          <circle cx="24" cy="24" r=${R} fill="none" stroke="var(--accent-bright, #57b894)" stroke-width="4"
            stroke-dasharray=${CIRC} stroke-dashoffset=${off} stroke-linecap="round"
            transform="rotate(-90 24 24)" style=${{ transition: 'stroke-dashoffset .5s ease' }} />
          <text x="24" y="28" text-anchor="middle" font-size="12" font-weight="700" fill="var(--text, #eee)">${percent}%</text>
        </svg>
        <div style=${{ flex: 1, minWidth: 0 }}>
          <div style=${{ fontWeight: 700, fontSize: '14px', color: 'var(--text, #eee)' }}>👋 Let’s get you set up</div>
          <div style=${{ fontSize: '12px', color: 'var(--text-muted, #9aa)' }}>${doneN} of ${items.length} done — finish these to get the most out of Bell. Bella can do any of them for you.</div>
        </div>
        <button onClick=${dismiss} style=${DISMISS} title="Hide this guide">Dismiss ✕</button>
      </div>
      <div style=${{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        ${items.map((s, i) => {
          const ok = !!s.done;
          return html`
            <div key=${s.key} style=${{ display: 'flex', alignItems: 'center', gap: '11px' }}>
              <span style=${dot(ok)}>${ok ? '✓' : (i + 1)}</span>
              <div style=${{ flex: 1, minWidth: 0 }}>
                <div style=${{ fontSize: '13px', color: ok ? 'var(--text-muted, #9aa)' : 'var(--text, #eee)', textDecoration: ok ? 'line-through' : 'none' }}>${s.label}</div>
                ${!ok ? html`<div style=${{ fontSize: '11.5px', color: 'var(--text-muted, #9aa)', marginTop: '1px' }}>${s.hint}</div>` : null}
              </div>
              ${!ok ? html`
                <button onClick=${() => openBella(s.bella)} style=${BELLA_BTN} title="Let Bella do this for you">✨ Bella does it</button>
                <button onClick=${() => goTo(s.action)} style=${GO}>Do it →</button>` : null}
            </div>`;
        })}
      </div>
    </div>
  `;
}
