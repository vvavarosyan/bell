// Local Engines — live control + health dashboard for the always-on Continuous
// Enrichment Engine (Finder → Harvester → Network Mapper). Local-admin only.
// Wrapper is a plain padded <div> (the dr-shell / page-fill containers collapse
// to invisible in this admin slot). Render is wrapped in try/catch so any data
// hiccup shows a readable error instead of a blank page.

import { useState, useEffect } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const STATE_META = {
  sweeping: { label: 'Live · sweeping', color: '#22c55e' },
  idle:     { label: 'Live · idle (caught up)', color: '#22c55e' },
  starting: { label: 'Starting…', color: '#22c55e' },
  paused:   { label: 'Paused', color: '#f59e0b' },
  error:    { label: 'Live · recovering', color: '#f59e0b' },
  stopped:  { label: 'Stopped (no recent heartbeat)', color: '#e5534b' },
  off:      { label: 'Not running', color: '#64748b' },
};
function agoFn(ms) { if (ms == null) return '—'; const s = Math.round(ms / 1000); if (s < 60) return s + 's ago'; if (s < 3600) return Math.round(s / 60) + 'm ago'; return Math.round(s / 3600) + 'h ago'; }
function uptimeFn(iso) { if (!iso) return '—'; let s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000); const d = Math.floor(s / 86400); s -= d * 86400; const h = Math.floor(s / 3600); s -= h * 3600; const m = Math.floor(s / 60); return (d ? d + 'd ' : '') + (h ? h + 'h ' : '') + m + 'm'; }
function nf(x) { return Number(x || 0).toLocaleString(); }
// Coerce any value to a safe string — a JSON/object field rendered as a child
// throws "Objects are not valid as a React child" and blanks the view.
function txt(x) { if (x == null) return ''; return typeof x === 'object' ? JSON.stringify(x) : String(x); }

const ENGINES = [
  { key: 'find_left',    name: 'Engine 1 · Website Finder',   left: 'Companies still needing a website', desc: 'Finds an official website for companies that have none — domain guessing first, then verified search.' },
  { key: 'harvest_left', name: 'Engine 2 · Website Harvester', left: 'Sites still to harvest',             desc: 'Crawls each site for emails, phones, socials, address, logo, team people and partner companies.' },
  { key: 'map_left',     name: 'Engine 3 · Network Mapper',    left: 'Companies still to map',             desc: 'Maps partners, clients, affiliates and competitors into the business graph.' },
];
const CARD = { border: '1px solid var(--border)', borderRadius: '12px', padding: '16px', background: 'var(--bg-elev, rgba(255,255,255,0.02))', marginBottom: '16px' };

export function EngineTab() {
  const [s, setS] = useState(null);
  const [runs, setRuns] = useState([]);
  const [busy, setBusy] = useState(false);
  const [pace, setPace] = useState({ night_chunk: '', day_chunk: '', touched: false });
  const [savingPace, setSavingPace] = useState(false);

  const load = async () => {
    try {
      const st = await api.enrichmentEngineStatus();
      setS(st || {});
      setPace((p) => p.touched ? p : { night_chunk: st && st.control ? (st.control.night_chunk ?? '') : '', day_chunk: st && st.control ? (st.control.day_chunk ?? '') : '', touched: false });
    } catch { setS((cur) => cur || {}); }
  };
  useEffect(() => {
    load();
    (async () => { try { const r = await api.enrichmentRuns(12); setRuns((r && r.rows) || []); } catch { /* ignore */ } })();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, []);

  const toggle = async () => {
    if (!s) return;
    setBusy(true);
    try { const r = await api.engineControl({ paused: !s.paused }); toast(r && r.control && r.control.paused ? 'Engine paused.' : 'Engine resumed.'); await load(); }
    catch (e) { toast((e && e.message) || 'Failed', 'error'); }
    finally { setBusy(false); }
  };
  const savePace = async () => {
    setSavingPace(true);
    try { await api.engineControl({ night_chunk: pace.night_chunk, day_chunk: pace.day_chunk }); toast('Pacing saved.'); setPace((p) => ({ ...p, touched: false })); await load(); }
    catch (e) { toast((e && e.message) || 'Failed', 'error'); }
    finally { setSavingPace(false); }
  };
  const setPaceField = (k, v) => setPace((p) => ({ ...p, [k]: v, touched: true }));

  if (!s) return html`<div style=${{ padding: '24px' }}><div class="muted">Loading engine status…</div></div>`;

  try {
    const meta = STATE_META[s.state] || STATE_META.off;
    const hb = s.heartbeat || {};
    const fr = s.frontier || {};
    const total = Number(fr.total || 0);
    const pct = (left) => total ? Math.max(0, Math.min(100, Math.round(((total - Number(left || 0)) / total) * 100))) : 0;

    return html`
      <div style=${{ padding: '24px', maxWidth: '1000px' }}>
        <div style=${{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <h2 style=${{ margin: 0 }}>Local Engines</h2>
          <span style=${{ flex: 1 }}></span>
          ${s.installed ? html`<button class="sys-btn ${s.paused ? '' : 'sys-btn-secondary'}" disabled=${busy} onClick=${toggle}>${busy ? '…' : (s.paused ? '▶ Resume' : '⏸ Pause')}</button>` : null}
          <button class="sys-btn sys-btn-secondary" onClick=${load}>Refresh</button>
        </div>
        <div class="muted" style=${{ margin: '4px 0 18px', fontSize: '13px' }}>Bell's own enrichment engines — local, $0, always-on.</div>

        ${!s.installed ? html`<div style=${{ ...CARD, border: '1px solid var(--amber)', background: 'rgba(245,158,11,0.08)' }}>
          <b>The always-on engine isn't running.</b> On your Mac, double-click <code>Install Always-On Engine.command</code> to start it 24/7.
        </div>` : null}

        <div style=${CARD}>
          <div style=${{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <span style=${{ width: '12px', height: '12px', borderRadius: '50%', background: meta.color, animation: (s.alive && !s.paused) ? 'feedpulse 1.8s infinite' : 'none' }}></span>
            <span style=${{ fontSize: '16px', fontWeight: 700 }}>${meta.label}</span>
          </div>
          <div style=${{ display: 'flex', gap: '28px', flexWrap: 'wrap', marginTop: '14px', fontSize: '13px' }}>
            <div><div class="muted" style=${{ fontSize: '11px' }}>Last activity</div>${agoFn(s.beat_age_ms)}</div>
            <div><div class="muted" style=${{ fontSize: '11px' }}>Uptime</div>${uptimeFn(hb.started_at)}</div>
            <div><div class="muted" style=${{ fontSize: '11px' }}>Rounds this run</div>${nf(hb.round_no)}</div>
            <div><div class="muted" style=${{ fontSize: '11px' }}>Found · Harvested · Mapped</div><b>${nf(hb.found_total)}</b> · <b>${nf(hb.harvested_total)}</b> · <b>${nf(hb.mapped_total)}</b></div>
          </div>
        </div>

        <div style=${{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          ${ENGINES.map((e) => html`
            <div key=${e.key} style=${{ ...CARD, marginBottom: 0 }}>
              <div style=${{ fontWeight: 700, fontSize: '14px' }}>${e.name}</div>
              <div class="muted" style=${{ fontSize: '12px', margin: '4px 0 10px', lineHeight: 1.5 }}>${e.desc}</div>
              <div style=${{ display: 'flex', justifyContent: 'space-between', fontSize: '12.5px', marginBottom: '4px' }}>
                <span class="muted">${e.left}</span><b>${nf(fr[e.key])} left</b>
              </div>
              <div class="sys-bar"><span style=${{ width: pct(fr[e.key]) + '%' }}></span></div>
              <div class="muted" style=${{ fontSize: '11px', marginTop: '4px' }}>${pct(fr[e.key])}% of ${nf(total)} companies processed</div>
            </div>`)}
        </div>

        <div style=${CARD}>
          <div style=${{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>Pacing</div>
          <div class="muted" style=${{ fontSize: '12px', marginBottom: '10px' }}>Companies processed per round. Blank = defaults (120 night / 30 day).</div>
          <div style=${{ display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div><div style=${{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>Night chunk</div><input class="sys-input" type="number" min="1" max="2000" value=${pace.night_chunk} onInput=${(e) => setPaceField('night_chunk', e.target.value)} style=${{ width: '120px' }} /></div>
            <div><div style=${{ fontSize: '11px', color: 'var(--text-dim)', marginBottom: '4px' }}>Day chunk</div><input class="sys-input" type="number" min="1" max="2000" value=${pace.day_chunk} onInput=${(e) => setPaceField('day_chunk', e.target.value)} style=${{ width: '120px' }} /></div>
            <button class="sys-btn sys-btn-secondary" disabled=${savingPace} onClick=${savePace}>${savingPace ? 'Saving…' : 'Save pacing'}</button>
          </div>
        </div>

        ${total > 0 && fr.find_left === 0 && fr.harvest_left === 0 && fr.map_left === 0 ? html`<div style=${{ ...CARD, border: '1px solid rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.06)' }}>
          <b>All ${nf(total)} companies have been processed by Engines 1–3.</b> The engine is caught up and idles until new companies arrive. To gather <i>more</i> per company (decision-maker emails, financials), that's the next engines we build — not this sweep.
        </div>` : null}

        ${runs && runs.length ? html`<div style=${CARD}>
          <div style=${{ fontWeight: 700, fontSize: '14px', marginBottom: '10px' }}>Recent engine runs</div>
          ${runs.map((r, i) => html`
            <div key=${i} style=${{ display: 'grid', gridTemplateColumns: '120px 1fr auto', gap: '10px', alignItems: 'center', padding: '6px 0', borderTop: i ? '1px solid var(--border)' : 'none', fontSize: '12.5px' }}>
              <span class="muted">${r.stage != null ? 'Stage ' + r.stage : (txt(r.tool) || '—')}</span>
              <span style=${{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${txt(r.output_summary) || txt(r.status)}</span>
              <span class="muted">${r.completed_at ? new Date(r.completed_at).toLocaleString() : txt(r.status)}</span>
            </div>`)}
        </div>` : null}
      </div>`;
  } catch (e) {
    return html`<div style=${{ padding: '24px' }}>
      <b style=${{ color: 'var(--red)' }}>The Local Engines view hit an error while rendering.</b>
      <pre style=${{ marginTop: '10px', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: 'var(--text-muted)' }}>${String((e && e.stack) || (e && e.message) || e)}</pre>
    </div>`;
  }
}
