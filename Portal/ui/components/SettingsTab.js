import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

// Each entry is a separate "page" inside settings — clicking a rail item
// swaps the body to that section's content. No emoji icons.
const SECTIONS = [
  { id: 'api-keys',    label: 'API Keys' },
  { id: 'mapbox',      label: 'Mapbox' },
  { id: 'stage4',      label: 'Stage 4 — Jobs' },
  { id: 'assembly',    label: 'Assembly' },
  { id: 'maintenance', label: 'Maintenance' },
  { id: 'general',     label: 'General' },
];

export function SettingsTab() {
  const [settings, setSettings] = useState({});
  const [apiKeys, setApiKeys] = useState({ firecrawl: false, apify: false, mapbox: false });
  const [drafts, setDrafts] = useState({ firecrawl: '', apify: '', mapbox: '' });
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('api-keys');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.settings();
      setSettings(r.settings || {});
      setApiKeys(r.api_keys || {});
    } catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saveKey = async (name) => {
    const v = drafts[name].trim();
    if (!v) return;
    try {
      await api.setApiKey(name, v);
      setApiKeys(prev => ({ ...prev, [name]: true }));
      setDrafts(prev => ({ ...prev, [name]: '' }));
      toast(`${name} key saved to Keychain`);
    } catch (err) { toast('Save failed: ' + err.message, 'error'); }
  };

  const removeKey = async (name) => {
    if (!confirm(`Remove the ${name} key from Keychain?`)) return;
    try {
      await api.deleteApiKey(name);
      setApiKeys(prev => ({ ...prev, [name]: false }));
      toast(`${name} key removed`);
    } catch (err) { toast('Remove failed: ' + err.message, 'error'); }
  };

  const updateSetting = async (key, value) => {
    try {
      await api.updateSettings({ [key]: value });
      setSettings(prev => ({ ...prev, [key]: value }));
      toast('Saved');
    } catch (err) { toast('Save failed: ' + err.message, 'error'); }
  };

  if (loading) return html`<div class="settings-shell"><div class="empty">Loading settings…</div></div>`;

  // -----------------------------------------------------------------------
  // Section renderers — each one is a self-contained "page"
  // -----------------------------------------------------------------------

  const renderKeyRow = ({ name, label, placeholder }) => html`
    <div class="row" key=${name}>
      <label>${label}</label>
      <input
        type="password"
        placeholder=${apiKeys[name] ? '••••••••  (currently stored)' : (placeholder || 'Paste API key…')}
        value=${drafts[name] || ''}
        onChange=${e => setDrafts(prev => ({ ...prev, [name]: e.target.value }))}
        onKeyDown=${e => { if (e.key === 'Enter') saveKey(name); }}
      />
      <span class=${'key-status ' + (apiKeys[name] ? 'set' : '')}>
        ${apiKeys[name] ? '✓ stored' : 'not set'}
      </span>
      <div class="actions">
        <button onClick=${() => saveKey(name)} disabled=${!(drafts[name] || '').trim()}>
          ${apiKeys[name] ? 'Replace' : 'Save'}
        </button>
        ${apiKeys[name] ? html`<button class="danger" onClick=${() => removeKey(name)}>Remove</button>` : null}
      </div>
    </div>
  `;

  const PAGES = {
    'api-keys': html`
      <div class="card">
        <h2>API Keys</h2>
        <div class="hint">
          Stored in your macOS Keychain (service prefix <code>bdi-</code>).
          Never written to disk in plain text. The Portal can write or replace a key,
          but the raw value is never returned to the browser.
        </div>
        ${renderKeyRow({ name: 'firecrawl', label: 'Firecrawl' })}
        ${renderKeyRow({ name: 'apify',     label: 'Apify' })}
      </div>
    `,

    'mapbox': html`
      <div class="card">
        <h2>Mapbox</h2>
        <div class="hint">
          Mapbox GL JS powers the interactive Map view. Free for the first 50,000 map loads per month,
          then $0.50 per 1,000 loads. Get a public access token at
          <a href="https://account.mapbox.com/access-tokens/" target="_blank" rel="noreferrer">account.mapbox.com → Access tokens</a>.
        </div>
        ${renderKeyRow({ name: 'mapbox', label: 'Mapbox token', placeholder: 'Starts with pk.…' })}
        <div class="row">
          <label>Default map style</label>
          <input
            type="text"
            placeholder="mapbox://styles/mapbox/standard"
            value=${settings.mapbox_style || ''}
            onChange=${e => setSettings(prev => ({ ...prev, mapbox_style: e.target.value }))}
            onBlur=${e => updateSetting('mapbox_style', e.target.value.trim() || null)}
          />
        </div>
        <div class="hint" style=${{marginTop:'4px'}}>
          Default <code>mapbox://styles/mapbox/standard</code> — Mapbox's flagship style with free 3D buildings + dynamic time-of-day lighting.
          Other built-ins: <code>mapbox://styles/mapbox/dark-v11</code>, <code>streets-v12</code>, <code>satellite-streets-v12</code>, <code>navigation-night-v1</code>.
          Or paste a custom style from <a href="https://studio.mapbox.com" target="_blank" rel="noreferrer">Mapbox Studio</a>.
        </div>
      </div>
    `,

    'stage4': html`
      <div class="card">
        <h2>Stage 4 — LinkedIn Jobs</h2>
        <div class="hint">Tweak the actor + budget for the LinkedIn Jobs scraper. Changes apply on the next Stage 4 run; no restart needed.</div>
        <div class="row">
          <label>Stage 4 actor</label>
          <div class="actions" style=${{flex:1, flexDirection:'column', alignItems:'stretch', gap:'4px'}}>
            <input
              type="text"
              placeholder="curious_coder/linkedin-jobs-scraper"
              value=${settings.stage4_actor_id || ''}
              onChange=${e => setSettings(prev => ({ ...prev, stage4_actor_id: e.target.value }))}
              onBlur=${e => updateSetting('stage4_actor_id', e.target.value.trim() || null)}
            />
            <span class="muted small">
              Default <code>curious_coder/linkedin-jobs-scraper</code> ($1 per 1,000 results, no rental, 29K users).
              Alternative: <code>apimaestro/linkedin-jobs-scraper-no-cookies</code>.
              Avoid <code>bebity/linkedin-jobs-scraper</code> — requires paid rental after free trial.
            </span>
          </div>
        </div>
        <div class="row">
          <label>$ per result</label>
          <div class="actions" style=${{flex:1}}>
            <input
              type="number" step="0.001" min="0"
              style=${{maxWidth:'120px'}}
              value=${settings.stage4_per_result_usd ?? 0.001}
              onChange=${e => setSettings(prev => ({ ...prev, stage4_per_result_usd: Number(e.target.value) }))}
              onBlur=${e => updateSetting('stage4_per_result_usd', Number(e.target.value))}
            />
            <span class="muted small">Approximate cost per job returned (budget logging only).</span>
          </div>
        </div>
        <div class="row">
          <label>Location filter</label>
          <div class="actions" style=${{flex:1}}>
            <input
              type="text"
              style=${{maxWidth:'240px'}}
              placeholder="Qatar"
              value=${settings.stage4_location || ''}
              onChange=${e => setSettings(prev => ({ ...prev, stage4_location: e.target.value }))}
              onBlur=${e => updateSetting('stage4_location', e.target.value.trim() || null)}
            />
            <span class="muted small">Location passed to LinkedIn job search. Default Qatar.</span>
          </div>
        </div>
        <div class="row">
          <label>Cap per company</label>
          <div class="actions" style=${{flex:1}}>
            <input
              type="number" step="10" min="10" max="500"
              style=${{maxWidth:'120px'}}
              value=${settings.stage4_per_company_limit ?? 100}
              onChange=${e => setSettings(prev => ({ ...prev, stage4_per_company_limit: Number(e.target.value) }))}
              onBlur=${e => updateSetting('stage4_per_company_limit', Number(e.target.value))}
            />
            <span class="muted small">Max jobs to scrape per company per run.</span>
          </div>
        </div>
      </div>
    `,

    'assembly': html`
      <div class="card">
        <h2>Assembly</h2>
        <div class="hint">
          Phase 5 — dedup companies across sources and assign Bell identifiers (BIN / PIN / JIN).
          Auto-merges high-confidence duplicates; queues medium-confidence pairs for review in the
          <a href="#dedup-queue">Dedup Queue</a> tab.
        </div>
        <div class="row">
          <label>Run full assembly</label>
          <div class="actions" style=${{flex:1}}>
            <button onClick=${async () => {
              try {
                await api.assemblyRun();
                toast('Assembly started — open the Dedup Queue tab to follow along.');
              } catch (err) { toast('Assembly failed: ' + err.message, 'error'); }
            }}>Run dedup + assign IDs</button>
            <span class="muted small">Scans every company for duplicates, merges the obvious ones, queues uncertain matches, then assigns BIN / PIN / JIN.</span>
          </div>
        </div>
        <div class="row">
          <label>Assign IDs only</label>
          <div class="actions" style=${{flex:1}}>
            <button onClick=${async () => {
              try {
                const r = await api.assemblyAssignIds();
                toast(`Assigned ${r.bins.assigned} BINs · ${r.pins.assigned} PINs · ${r.jins.assigned} JINs`);
              } catch (err) { toast('Failed: ' + err.message, 'error'); }
            }}>Assign IDs</button>
            <span class="muted small">Skips the dedup pass — just gives BIN / PIN / JIN to anything missing one. Cheap, safe to re-run.</span>
          </div>
        </div>
      </div>
    `,

    'maintenance': html`
      <div class="card">
        <h2>Maintenance</h2>
        <div class="hint">One-click admin actions that re-run derived logic on the existing database. Safe to re-run.</div>
        <div class="row">
          <label>Recompute seniority</label>
          <div class="actions" style=${{flex:1}}>
            <button onClick=${async () => {
              try {
                const r = await api.recomputeSeniority();
                toast(`Recomputed seniority — updated ${r.updated} of ${r.scanned} links`);
              } catch (err) { toast('Recompute failed: ' + err.message, 'error'); }
            }}>Run recompute</button>
            <span class="muted small">Re-evaluates every person's org-chart level using the latest rule set.</span>
          </div>
        </div>
        <div class="row">
          <label>Reclassify statuses</label>
          <div class="actions" style=${{flex:1}}>
            <button onClick=${async () => {
              try {
                const r = await api.reclassifyStatuses();
                toast(`Reclassified statuses on ${r.scanned} companies`);
              } catch (err) { toast('Reclassify failed: ' + err.message, 'error'); }
            }}>Run reclassify</button>
            <span class="muted small">Recomputes is_active + archived per company using the multi-source OR rule.</span>
          </div>
        </div>
      </div>
    `,

    'general': html`
      <div class="card">
        <h2>General</h2>
        <div class="row">
          <label>Admin email</label>
          <input
            type="email"
            value=${settings.admin_email || ''}
            onChange=${e => setSettings(prev => ({ ...prev, admin_email: e.target.value }))}
            onBlur=${e => updateSetting('admin_email', e.target.value)}
          />
        </div>
        <div class="row">
          <label>Dedup fuzzy threshold</label>
          <input
            type="number" step="0.01" min="0" max="1"
            value=${settings.dedup_fuzzy_threshold ?? 0.85}
            onChange=${e => setSettings(prev => ({ ...prev, dedup_fuzzy_threshold: Number(e.target.value) }))}
            onBlur=${e => updateSetting('dedup_fuzzy_threshold', Number(e.target.value))}
          />
        </div>
        <div class="hint">Schema version: ${settings.schema_version || '—'}</div>
      </div>
    `,
  };

  return html`
    <div class="settings-shell">
      <aside class="settings-rail">
        <div class="settings-rail-title">Settings</div>
        ${SECTIONS.map(s => html`
          <button
            key=${s.id}
            class=${'settings-rail-item ' + (activeSection === s.id ? 'active' : '')}
            onClick=${() => setActiveSection(s.id)}
          >${s.label}</button>
        `)}
      </aside>
      <div class="settings-body">
        ${PAGES[activeSection] || null}
      </div>
    </div>
  `;
}
