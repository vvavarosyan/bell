// SIGNALS — the radar (Phase C, Val-approved 2026-07-02). Market movement
// derived from Bell's own data, presented as a live rotating radar: blips by
// signal type (sector) and recency (radius — newest nearest the center), with
// a stream of signal cards beside it. Two views in one section:
//   Global   — every signal across the Qatari market
//   For you  — scored against THIS workspace's ICP profile (Settings), with
//              the match reasons shown on each card.
// All hooks live at the top of each component (page-blank rule) — the loading
// and empty branches render inside the single return.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { navigateTo } from '../lib/router.js';

const KIND_META = {
  tender:         { label: 'Tenders',        color: '#eab308', sector: 0 },
  hiring:         { label: 'Hiring',         color: '#22c55e', sector: 1 },
  expansion:      { label: 'Expansion',      color: '#f97316', sector: 2 },
  newly_licensed: { label: 'Newly licensed', color: '#5b8cff', sector: 3 },
  partnership:    { label: 'Partnerships',   color: '#14b8a6', sector: 4 },
  leadership:     { label: 'Leadership',     color: '#a855f7', sector: 5 },
  news_event:     { label: 'In the news',    color: '#94a3b8', sector: 6 },
};
const KINDS = Object.keys(KIND_META);
const SECTOR_DEG = 360 / KINDS.length;   // radar sector width (adapts to kind count)
const WINDOWS = [['24h', '24h'], ['3d', '3 days'], ['7d', '7 days'], ['14d', '14 days']];
const WINDOW_MS = { '24h': 864e5, '3d': 3 * 864e5, '7d': 7 * 864e5, '14d': 14 * 864e5 };

const S = 420, C = S / 2, R_MIN = 34, R_MAX = 194;

function timeAgo(iso) {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return Math.max(1, Math.floor(s / 60)) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}

// Deterministic per-signal jitter so blips don't move between refreshes.
const hash = (n) => { let x = Number(n) || 1; x = ((x >> 16) ^ x) * 0x45d9f3b; x = ((x >> 16) ^ x) * 0x45d9f3b; return ((x >> 16) ^ x) >>> 0; };

function blipXY(sig, windowKey) {
  const meta = KIND_META[sig.kind] || KIND_META.news_event;
  const sectorStart = meta.sector * SECTOR_DEG;
  const angle = (sectorStart + 8 + (hash(sig.id) % Math.max(8, SECTOR_DEG - 16))) * Math.PI / 180;
  const age = Math.min(1, Math.max(0, (Date.now() - new Date(sig.occurred_at).getTime()) / WINDOW_MS[windowKey]));
  const r = R_MIN + age * (R_MAX - R_MIN - 8);
  return { x: C + r * Math.cos(angle - Math.PI / 2), y: C + r * Math.sin(angle - Math.PI / 2) };
}

export function SignalsTab() {
  const [rows, setRows] = useState([]);
  const [scope, setScope] = useState('global');
  const [windowKey, setWindowKey] = useState('7d');
  const [kind, setKind] = useState('');
  const [loading, setLoading] = useState(true);
  const [icpMissing, setIcpMissing] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [inMarket, setInMarket] = useState([]);
  const [inMarketIcp, setInMarketIcp] = useState(false);
  const [openTenders, setOpenTenders] = useState([]);
  const cardRefs = useRef({});
  const scoreColor = (n) => (n >= 60 ? '#6fcf97' : n >= 35 ? '#f5c84c' : '#9ca5b9');

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const params = { window: windowKey, scope };
      if (kind) params.kind = kind;
      const r = await api.signals(params);
      setRows(r.rows || []);
      setIcpMissing(!!r.icp_missing);
    } catch { /* keep last rows */ }
    finally { if (!silent) setLoading(false); }
  }, [windowKey, scope, kind]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const t = setInterval(() => load({ silent: true }), 45_000);
    return () => clearInterval(t);
  }, [load]);

  // In-market companies (Signals v2): strongest buying-intent, scored 0-100.
  useEffect(() => {
    let dead = false;
    const loadIM = () => api.signalsInMarket({ limit: 6 })
      .then((r) => { if (!dead) { setInMarket(r.companies || []); setInMarketIcp(!!r.icp_applied); } })
      .catch(() => {});
    loadIM();
    const t = setInterval(loadIM, 60_000);
    return () => { dead = true; clearInterval(t); };
  }, []);

  // Live Qatar tenders — the open, biddable set, straight from the tenders table
  // (also its own full section under "Tenders"). Shown here so Signals surfaces
  // active procurement demand alongside the radar.
  useEffect(() => {
    let dead = false;
    const loadT = () => api.tenders({ status: 'open', limit: 6 })
      .then((r) => { if (!dead) setOpenTenders(r.rows || []); })
      .catch(() => {});
    loadT();
    const t = setInterval(loadT, 120_000);
    return () => { dead = true; clearInterval(t); };
  }, []);

  const counts = useMemo(() => {
    const c = {};
    for (const r of rows) c[r.kind] = (c[r.kind] || 0) + 1;
    return c;
  }, [rows]);

  const pick = (id) => {
    setSelectedId(id);
    const el = cardRefs.current[id];
    if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const chip = (on, label, onClick, color) => html`
    <button onClick=${onClick} style=${{
      background: on ? (color ? color + '22' : 'var(--accent)') : 'var(--bg-elev-2, rgba(255,255,255,0.04))',
      border: '1px solid ' + (on ? (color || 'var(--accent)') : 'var(--border)'),
      color: on ? (color || '#fff') : 'var(--text-muted)',
      borderRadius: '999px', padding: '4px 12px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
    }}>${label}</button>`;

  return html`
    <div class="page-fill"><div class="page-scroll">
      <style>${`@keyframes bdiRadarSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '4px 0 14px' }}>
        <h2 style=${{ margin: 0, fontSize: '17px' }}>Signals</h2>
        <span class="muted small">market movement, detected by Bell</span>
        <span class="spacer" style=${{ flex: 1 }}></span>
        <div style=${{ display: 'flex', gap: '6px' }}>
          ${chip(scope === 'global', 'Global', () => setScope('global'))}
          ${chip(scope === 'icp', 'For you', () => setScope('icp'))}
        </div>
        <div style=${{ display: 'flex', gap: '6px' }}>
          ${WINDOWS.map(([k, label]) => chip(windowKey === k, label, () => setWindowKey(k)))}
        </div>
      </div>

      <div style=${{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
        ${chip(kind === '', 'All types', () => setKind(''))}
        ${KINDS.map((k) => chip(kind === k, `${KIND_META[k].label}${counts[k] ? ` · ${counts[k]}` : ''}`, () => setKind(kind === k ? '' : k), KIND_META[k].color))}
      </div>

      ${scope === 'icp' && icpMissing ? html`
        <div style=${{ border: '1px solid var(--yellow, #f5c84c)', background: 'rgba(245,200,76,.08)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: 'var(--text)' }}>
          “For you” needs your ideal-customer profile. Define it once in
          <button onClick=${() => navigateTo('account')} style=${{ background: 'transparent', border: 'none', color: 'var(--accent-bright, #a5c3ff)', cursor: 'pointer', fontSize: '13px', padding: '0 4px', textDecoration: 'underline' }}>Settings → Company & ICP</button>
          and Bell scores every signal against it.
        </div>` : null}

      <div style=${{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

        <!-- RADAR (right sidebar, compact) -->
        <div style=${{ order: 2, flex: '0 0 300px', minWidth: '250px', position: 'sticky', top: '4px', border: '1px solid var(--border)', borderRadius: '14px', background: 'var(--bg-elev)', padding: '14px' }}>
          <svg viewBox=${`0 0 ${S} ${S}`} style=${{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Signals radar">
            <defs>
              <linearGradient id="bdiSweep" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#5b8cff" stop-opacity="0.32" />
                <stop offset="100%" stop-color="#5b8cff" stop-opacity="0" />
              </linearGradient>
            </defs>
            <circle cx=${C} cy=${C} r=${R_MAX} fill="rgba(91,140,255,0.03)" stroke="var(--border, #323a54)" />
            ${[0.25, 0.5, 0.75].map((f) => html`<circle key=${f} cx=${C} cy=${C} r=${R_MIN + f * (R_MAX - R_MIN)} fill="none" stroke="var(--border, #323a54)" stroke-opacity="0.55" stroke-dasharray="3 5" />`)}
            <circle cx=${C} cy=${C} r=${R_MIN} fill="none" stroke="var(--border, #323a54)" stroke-opacity="0.7" />
            ${KINDS.map((k) => {
              const a = (KIND_META[k].sector * SECTOR_DEG - 90) * Math.PI / 180;
              return html`<line key=${k} x1=${C + R_MIN * Math.cos(a)} y1=${C + R_MIN * Math.sin(a)} x2=${C + R_MAX * Math.cos(a)} y2=${C + R_MAX * Math.sin(a)} stroke="var(--border, #323a54)" stroke-opacity="0.4" />`;
            })}
            ${KINDS.map((k) => {
              const mid = (KIND_META[k].sector * SECTOR_DEG + SECTOR_DEG / 2 - 90) * Math.PI / 180;
              const lr = R_MAX + 14;
              return html`<text key=${'lbl' + k} x=${C + lr * Math.cos(mid)} y=${C + lr * Math.sin(mid) + 3}
                text-anchor="middle" font-size="9" fill=${KIND_META[k].color} opacity="0.9">${KIND_META[k].label.toUpperCase()}</text>`;
            })}

            <!-- rotating sweep -->
            <g style=${{ transformOrigin: `${C}px ${C}px`, animation: 'bdiRadarSpin 7s linear infinite' }}>
              <path d=${`M ${C} ${C} L ${C + R_MAX} ${C} A ${R_MAX} ${R_MAX} 0 0 0 ${C + R_MAX * Math.cos(-0.6)} ${C + R_MAX * Math.sin(-0.6)} Z`} fill="url(#bdiSweep)" />
              <line x1=${C} y1=${C} x2=${C + R_MAX} y2=${C} stroke="#5b8cff" stroke-opacity="0.55" stroke-width="1.4" />
            </g>

            <!-- blips -->
            ${rows.map((s) => {
              const { x, y } = blipXY(s, windowKey);
              const meta = KIND_META[s.kind] || KIND_META.news_event;
              const sel = selectedId === s.id;
              // Val 2026-07-04: a blip lights up as the rotating sweep crosses its
              // angle, then fades — reappearing on the next rotation. The sweep is
              // 7s/rev and starts at +x, so the cross time = (angle/360)*7s.
              const thetaDeg = meta.sector * SECTOR_DEG + 8 + (hash(s.id) % Math.max(8, SECTOR_DEG - 16));
              const begin = ((thetaDeg / 360) * 7).toFixed(2) + 's';
              return html`
                <g key=${s.id} onClick=${() => pick(s.id)} style=${{ cursor: 'pointer' }}>
                  ${sel ? html`<circle cx=${x} cy=${y} r="9" fill="none" stroke=${meta.color} stroke-width="1.4" />` : null}
                  <circle cx=${x} cy=${y} r="4" fill=${meta.color} opacity="0">
                    <animate attributeName="opacity" begin=${begin} dur="7s" values="1;0.9;0.12;0" keyTimes="0;0.12;0.55;1" repeatCount="indefinite" />
                    <animate attributeName="r" begin=${begin} dur="7s" values="6.5;4;3.5;3.5" keyTimes="0;0.12;0.55;1" repeatCount="indefinite" />
                  </circle>
                </g>`;
            })}

            <circle cx=${C} cy=${C} r="4" fill="#5b8cff" />
            <text x=${C} y=${C + 16} text-anchor="middle" font-size="8.5" fill="var(--text-dim, #9ca5b9)">NOW</text>
            <text x=${C + R_MAX - 4} y=${C + 12} text-anchor="end" font-size="8" fill="var(--text-dim, #9ca5b9)">${WINDOWS.find(([k]) => k === windowKey)?.[1]} ago</text>
          </svg>
          <div class="muted small" style=${{ marginTop: '8px', textAlign: 'center' }}>
            ${loading ? 'Sweeping the market…' : rows.length
              ? `${rows.length} signals in the last ${WINDOWS.find(([k]) => k === windowKey)?.[1]} — click a blip to inspect`
              : 'The radar is warming up — signals appear as Bell detects market movement.'}
          </div>

          ${inMarket.length ? html`
            <div style=${{ marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <div style=${{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text)', marginBottom: '8px' }}>
                In-market now${inMarketIcp ? ' · your ICP' : ''}
              </div>
              ${inMarket.map((c) => html`
                <button key=${c.company_id} onClick=${() => navigateTo('companies', c.company_id)}
                  style=${{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: '8px', padding: '5px 4px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '9px' }}>
                  <span style=${{ flexShrink: 0, width: '30px', height: '30px', borderRadius: '7px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11.5px', fontWeight: 700, color: scoreColor(c.in_market_score), background: scoreColor(c.in_market_score) + '22' }}>${c.in_market_score}</span>
                  <span style=${{ minWidth: 0, flex: 1 }}>
                    <span style=${{ display: 'block', fontSize: '12.5px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${c.company_name}</span>
                    <span class="muted small" style=${{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${(c.reasons || []).slice(0, 2).join(' · ')}</span>
                  </span>
                </button>`)}
              <div class="muted small" style=${{ marginTop: '6px', textAlign: 'center' }}>buying-intent · tap to open</div>
            </div>` : null}

          ${openTenders.length ? html`
            <div style=${{ marginTop: '14px', borderTop: '1px solid var(--border)', paddingTop: '12px' }}>
              <div style=${{ fontSize: '10.5px', fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: '#eab308', marginBottom: '8px' }}>
                Live Qatar tenders
              </div>
              ${openTenders.map((t) => html`
                <button key=${t.id} onClick=${() => navigateTo('tenders')}
                  style=${{ width: '100%', textAlign: 'left', background: 'transparent', border: 'none', borderRadius: '8px', padding: '5px 4px', cursor: 'pointer', display: 'block' }}>
                  <span style=${{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${t.title}</span>
                  <span class="muted small" style=${{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${t.buyer || '—'}${t.deadline_at ? ' · closes ' + new Date(t.deadline_at).toLocaleDateString() : ''}</span>
                </button>`)}
              <button onClick=${() => navigateTo('tenders')} style=${{ marginTop: '6px', width: '100%', textAlign: 'center', background: 'transparent', border: 'none', color: 'var(--accent-bright, #a5c3ff)', fontSize: '11.5px', cursor: 'pointer' }}>All tenders →</button>
            </div>` : null}
        </div>

        <!-- STREAM (left, primary) -->
        <div style=${{ order: 1, flex: '1 1 380px', minWidth: '300px' }}>
          ${loading ? html`<div class="empty">Loading signals…</div>` :
            rows.length === 0 ? html`<div class="empty">${scope === 'icp' ? 'No signals match your ICP in this window yet — widen the window or adjust your profile.' : 'No signals in this window yet.'}</div>` :
            rows.map((s) => {
              const meta = KIND_META[s.kind] || KIND_META.news_event;
              const sel = selectedId === s.id;
              return html`
                <div key=${s.id} ref=${(el) => { cardRefs.current[s.id] = el; }}
                  onClick=${() => setSelectedId(s.id)}
                  style=${{ border: '1px solid ' + (sel ? meta.color : 'var(--border)'), borderRadius: '12px', background: 'var(--bg-elev)', padding: '12px 14px', marginBottom: '10px', cursor: 'pointer', transition: 'border-color .15s' }}>
                  <div style=${{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '5px', flexWrap: 'wrap' }}>
                    <span style=${{ width: '8px', height: '8px', borderRadius: '50%', background: meta.color, flexShrink: 0 }}></span>
                    <span style=${{ fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '.08em', color: meta.color, fontWeight: 700 }}>${meta.label}${s.subkind ? ' · ' + String(s.subkind).replace(/_/g, ' ') : ''}</span>
                    <span class="muted small">${timeAgo(s.occurred_at)} ago</span>
                    <span style=${{ flex: 1 }}></span>
                    ${s.match_score != null ? html`
                      <span title=${(s.match_reasons || []).join(' · ')}
                        style=${{ fontSize: '10.5px', fontWeight: 700, color: '#141414', background: 'var(--yellow, #f5c84c)', borderRadius: '999px', padding: '2px 8px' }}>
                        ICP ${Math.round(s.match_score * 100)}%</span>` : null}
                  </div>
                  <div style=${{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.4 }}>${s.title}</div>
                  ${s.body ? html`<div class="muted small" style=${{ marginTop: '4px', lineHeight: 1.5 }}>${String(s.body).slice(0, 220)}</div>` : null}
                  ${s.match_reasons && s.match_reasons.length ? html`
                    <div class="muted small" style=${{ marginTop: '4px', color: 'var(--text-dim)' }}>Why: ${s.match_reasons.join(' · ')}</div>` : null}
                  <div style=${{ marginTop: '7px', display: 'flex', gap: '10px' }}>
                    ${s.company_id ? html`
                      <button onClick=${(e) => { e.stopPropagation(); navigateTo('companies', s.company_id); }}
                        style=${{ background: 'transparent', border: 'none', padding: 0, color: 'var(--accent-bright, #a5c3ff)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                        ${s.company_name || 'Open company'} →</button>` : null}
                  </div>
                </div>`;
            })}
        </div>
      </div>
    </div></div>`;
}
