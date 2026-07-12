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
import { TendersTab } from './TendersTab.js';
import { Pagination } from './Pagination.js';
import { BELLA_ACTION_EVENT, takePending, stashPending } from '../lib/bellaBus.js';

const KIND_META = {
  tender:         { label: 'Tenders',        color: '#eab308', sector: 0 },
  hiring:         { label: 'Hiring',         color: '#22c55e', sector: 1 },
  expansion:      { label: 'Expansion',      color: '#f97316', sector: 2 },
  newly_licensed: { label: 'Newly licensed', color: '#5b8cff', sector: 3 },
  partnership:    { label: 'Partnerships',   color: '#14b8a6', sector: 4 },
  leadership:     { label: 'Leadership',     color: '#a855f7', sector: 5 },
  disclosure:     { label: 'Disclosures',    color: '#06b6d4', sector: 6 },
  news_event:     { label: 'In the news',    color: '#94a3b8', sector: 7 },
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
  const [total, setTotal] = useState(0);   // true windowed signal count (server) — honest "page N of M"
  const [scope, setScope] = useState('global');
  const [windowKey, setWindowKey] = useState('7d');
  const [kind, setKind] = useState('');
  const [loading, setLoading] = useState(true);
  const [icpMissing, setIcpMissing] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [streamPage, setStreamPage] = useState(0);   // server-paginated 30/page (Val 2026-07-12)
  const [inMarket, setInMarket] = useState([]);
  const [inMarketIcp, setInMarketIcp] = useState(false);
  const [tenderTotal, setTenderTotal] = useState(0);   // true total tenders Bell tracks (for the Tenders chip)
  const scoreColor = (n) => (n >= 60 ? '#6fcf97' : n >= 35 ? '#f5c84c' : '#9ca5b9');

  const STREAM = 30;
  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const params = { window: windowKey, scope, limit: STREAM, offset: streamPage * STREAM };
      if (kind) params.kind = kind;
      const r = await api.signals(params);
      setRows(r.rows || []);
      if (typeof r.total === 'number') setTotal(r.total);
      setIcpMissing(!!r.icp_missing);
    } catch { /* keep last rows */ }
    finally { if (!silent) setLoading(false); }
  }, [windowKey, scope, kind, streamPage]);

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

  // True tender count for the "Tenders" pill — that pill opens the FULL tender
  // browser (all 27k+); the radar/stream below is recent *signals* only.
  useEffect(() => {
    let dead = false;
    const loadT = () => api.tenders({ limit: 1 })
      .then((r) => { if (!dead) setTenderTotal(r.total || 0); })
      .catch(() => {});
    loadT();
    const t = setInterval(loadT, 300_000);
    return () => { dead = true; clearInterval(t); };
  }, []);

  // Bella drives this section (show_signals / show_tenders ui-actions).
  // window.__bellaPending is a single consuming slot, so a pending
  // show_tenders is re-stashed for the embedded TendersTab, which mounts on
  // the next render and consumes it itself. While TendersTab IS mounted its
  // own live listener applies filters — we only switch the sub-view.
  const kindRef = useRef(kind);
  useEffect(() => { kindRef.current = kind; }, [kind]);
  useEffect(() => {
    const applySignals = (a) => {
      if (!a || a.type !== 'show_signals') return false;
      setKind(a.kind && KIND_META[a.kind] ? a.kind : '');
      if (a.window && WINDOW_MS[a.window]) setWindowKey(a.window);
      if (a.scope === 'global' || a.scope === 'icp') setScope(a.scope);
      return true;
    };
    const p = takePending('show_signals');
    if (p) applySignals(p);
    const pt = takePending('show_tenders');
    if (pt) { stashPending(pt); setKind('tender'); }
    const onAction = (e) => {
      const a = e.detail;
      if (!a) return;
      if (a.type === 'show_signals') { applySignals(a); return; }
      if (a.type === 'show_tenders' && kindRef.current !== 'tender') {
        stashPending(a);
        setKind('tender');
      }
    };
    window.addEventListener(BELLA_ACTION_EVENT, onAction);
    return () => window.removeEventListener(BELLA_ACTION_EVENT, onAction);
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  // The Tenders pill shows the full tender-database count; other pills show their
  // in-window signal count (from the /stats endpoint, loaded below).
  const [kindCounts, setKindCounts] = useState({});
  useEffect(() => {
    let dead = false;
    api.signalStats().then((r) => {
      if (dead) return;
      const c = {};
      for (const row of (r.kinds || [])) c[row.kind] = row.c7d;
      setKindCounts(c);
    }).catch(() => {});
    return () => { dead = true; };
  }, []);
  const counts = useMemo(() => {
    const c = { ...kindCounts };
    if (tenderTotal) c.tender = tenderTotal;   // full browser, not a windowed bucket
    return c;
  }, [kindCounts, tenderTotal]);

  // The radar + stream render the server page directly. kind='tender' hands off
  // to the embedded full Tenders browser; every other view is recent *signals*,
  // server-paginated and windowed. Tenders themselves are reachable in full via
  // the Tenders pill (they also surface here as 'tender' opportunity signals).
  const displayRows = kind === 'tender' ? [] : rows;

  // Snap to page 1 whenever the filters change (server re-paginates).
  useEffect(() => { setStreamPage(0); }, [kind, scope, windowKey]);
  const streamTotal = total;
  const streamRows = displayRows;

  return html`
    <div class="page-fill"><div class="page-scroll">
      <style>${`@keyframes bdiRadarSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

      <div style=${{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', padding: '4px 0 14px' }}>
        <h2 style=${{ margin: 0, fontSize: '17px' }}>Signals</h2>
        <span class="muted small">market movement, detected by Bell</span>
        <span class="spacer" style=${{ flex: 1 }}></span>
        ${kind !== 'tender' ? html`
        <div class="filt-group">
          <span class="filt-label">Show</span>
          <div class="seg">
            <button class=${'seg-btn' + (scope === 'global' ? ' active' : '')} onClick=${() => setScope('global')}>Global</button>
            <button class=${'seg-btn' + (scope === 'icp' ? ' active' : '')} onClick=${() => setScope('icp')}>For you</button>
          </div>
        </div>
        <div class="filt-group">
          <span class="filt-label">Last</span>
          <div class="seg">
            ${WINDOWS.map(([k, label]) => html`<button key=${k} class=${'seg-btn' + (windowKey === k ? ' active' : '')} onClick=${() => setWindowKey(k)}>${label}</button>`)}
          </div>
        </div>` : null}
      </div>

      <div class="filt-bar">
        <span class="filt-label">Type</span>
        <div class="pilltabs">
          <button class=${'pilltab' + (kind === '' ? ' active' : '')} onClick=${() => setKind('')}>All types</button>
          ${KINDS.map((k) => html`<button key=${k}
            class=${'pilltab' + (k === 'tender' ? ' pilltab-db' : '') + (kind === k ? ' active' : '')}
            onClick=${() => setKind(kind === k ? '' : k)}>${KIND_META[k].label}${counts[k] ? html`<span class="ct">${counts[k].toLocaleString()}</span>` : ''}</button>`)}
        </div>
      </div>
      <div class="filt-help">
        Tap a type to filter. <b>All types</b> shows recent market signals from the last ${WINDOWS.find(([k]) => k === windowKey)?.[1]}${total ? ` (${total.toLocaleString()})` : ''}.
        <b>Tenders${tenderTotal ? ` (${tenderTotal.toLocaleString()})` : ''}</b> opens Bell’s full procurement database — the complete archive, searchable and filterable, not just this window.
      </div>

      ${scope === 'icp' && icpMissing ? html`
        <div style=${{ border: '1px solid var(--yellow, #f5c84c)', background: 'rgba(245,200,76,.08)', borderRadius: '10px', padding: '12px 16px', marginBottom: '16px', fontSize: '13px', color: 'var(--text)' }}>
          “For you” needs your ideal-customer profile. Define it once in
          <button onClick=${() => navigateTo('account')} style=${{ background: 'transparent', border: 'none', color: 'var(--accent-bright, #a5c3ff)', cursor: 'pointer', fontSize: '13px', padding: '0 4px', textDecoration: 'underline' }}>Settings → Company & ICP</button>
          and Bell scores every signal against it.
        </div>` : null}

      ${kind === 'tender' ? html`<${TendersTab} embedded=${true} />` : html`
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
            ${displayRows.map((s) => {
              const { x, y } = blipXY(s, windowKey);
              const meta = KIND_META[s.kind] || KIND_META.news_event;
              const sel = selectedId === s.id;
              // Val 2026-07-04: a blip lights up as the rotating sweep crosses its
              // angle, then fades — reappearing on the next rotation. The sweep is
              // 7s/rev and its bright edge starts along +x (screen angle 0).
              // The blip sits at screen angle (thetaDeg − 90°) — blipXY places it
              // with cos/sin of (angle − π/2). So the sweep's edge reaches it at
              // ((thetaDeg − 90) mod 360)/360 × 7s. Using thetaDeg alone lit the
              // blip 90° (1.75s) LATE — the lag Val reported 2026-07-12; the −90
              // offset lands the flash exactly on the crossing.
              const thetaDeg = meta.sector * SECTOR_DEG + 8 + (hash(s.id) % Math.max(8, SECTOR_DEG - 16));
              const begin = ((((thetaDeg - 90) % 360 + 360) % 360) / 360 * 7).toFixed(2) + 's';
              // Blips are display-only (Val 2026-07-12: "unlink them on the UI") —
              // no click target; the stream list below is where signals are opened.
              return html`
                <g key=${s.id} style=${{ pointerEvents: 'none' }}>
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
            ${loading ? 'Sweeping the market…' : total
              ? `${total.toLocaleString()} signal${total === 1 ? '' : 's'} in the last ${WINDOWS.find(([k]) => k === windowKey)?.[1]} — see the stream below to inspect`
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
        </div>

        <!-- STREAM (left, primary) -->
        <div style=${{ order: 1, flex: '1 1 380px', minWidth: '300px' }}>
          ${loading ? html`<div class="empty">Loading signals…</div>` :
            displayRows.length === 0 ? html`<div class="empty">${scope === 'icp' ? 'No signals match your ICP in this window yet — widen the window or adjust your profile.' : 'No signals in this window yet.'}</div>` :
            streamRows.map((s) => {
              const meta = KIND_META[s.kind] || KIND_META.news_event;
              const sel = selectedId === s.id;
              return html`
                <div key=${s.id}
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
                    ${s._tender || (s.kind === 'tender' && s.ref_table === 'tenders') ? html`
                      <button onClick=${(e) => { e.stopPropagation(); setKind('tender'); }}
                        style=${{ background: 'transparent', border: 'none', padding: 0, color: 'var(--accent-bright, #a5c3ff)', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
                        Open in Tenders →</button>` : null}
                  </div>
                </div>`;
            })}
          ${!loading && streamTotal > STREAM ? html`
            <div class="feed-pager">
              <${Pagination} total=${streamTotal} limit=${STREAM} offset=${streamPage * STREAM}
                onChange=${(o) => setStreamPage(Math.floor(o / STREAM))} />
              <span class="muted small" style=${{ flexBasis: '100%', textAlign: 'center' }}>recent signals · last ${WINDOWS.find(([k]) => k === windowKey)?.[1]}</span>
            </div>` : null}
        </div>
      </div>`}
    </div></div>`;
}
