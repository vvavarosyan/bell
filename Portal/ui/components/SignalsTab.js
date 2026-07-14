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
  tender:         { label: 'Tenders',        short: 'Tenders',     color: '#eab308', sector: 0 },
  hiring:         { label: 'Hiring',         short: 'Hiring',      color: '#22c55e', sector: 1 },
  expansion:      { label: 'Expansion',      short: 'Expansion',   color: '#f97316', sector: 2 },
  newly_licensed: { label: 'Newly licensed', short: 'Licensed',    color: '#5b8cff', sector: 3 },
  partnership:    { label: 'Partnerships',   short: 'Partners',    color: '#14b8a6', sector: 4 },
  leadership:     { label: 'Leadership',     short: 'Leadership',  color: '#a855f7', sector: 5 },
  disclosure:     { label: 'Disclosures',    short: 'Disclosures', color: '#06b6d4', sector: 6 },
  news_event:     { label: 'In the news',    short: 'News',        color: '#94a3b8', sector: 7 },
};
const KINDS = Object.keys(KIND_META);
const SECTOR_DEG = 360 / KINDS.length;   // radar sector width (adapts to kind count)
const WINDOWS = [['24h', '24h'], ['3d', '3 days'], ['7d', '7 days'], ['14d', '14 days']];
const WINDOW_MS = { '24h': 864e5, '3d': 3 * 864e5, '7d': 7 * 864e5, '14d': 14 * 864e5 };

const S = 480, C = S / 2, R_MIN = 32, R_MAX = 168;   // bigger margin (S−R_MAX) so rim labels never clip

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
  const [openTenders, setOpenTenders] = useState([]);  // recent OPEN tenders → plotted as radar blips
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
    // Recent OPEN tenders → radar blips. Sourced from the tenders table (mirrored
    // to prod + present locally), so tender points show on BOTH environments —
    // unlike tender *signals*, which are prod-only and dated by publish date so
    // they fall outside the tight radar window.
    const loadOpen = () => api.tenders({ status: 'open', limit: 30 })
      .then((r) => { if (!dead) setOpenTenders((r.rows || []).map((t) => ({ id: t.id, kind: 'tender', occurred_at: t.published_at || t.deadline_at || t.created_at, title: t.title, buyer: t.buyer, _tender: true }))); })
      .catch(() => {});
    loadT(); loadOpen();
    const t = setInterval(() => { loadT(); loadOpen(); }, 300_000);
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
  // Radar blips: in "All types", plot recent OPEN tenders (from the tenders table)
  // as their own yellow points alongside the other signal kinds, so tenders are
  // actually visible on the radar. A specific-kind view shows only that kind.
  const radarBlips = kind === '' ? [...rows.filter((s) => s.kind !== 'tender'), ...openTenders] : displayRows;

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
          <button class=${'pilltab pilltab-db' + (kind === 'buyers' ? ' active' : '')}
            title="Who is actively procuring in your line of business, ranked by ICP fit and urgency"
            onClick=${() => setKind(kind === 'buyers' ? '' : 'buyers')}>Who’s buying</button>
          <button class=${'pilltab pilltab-db' + (kind === 'awards' ? ' active' : '')}
            title="Who won which Qatar contracts — winner, value, ICV score and the full bidder list"
            onClick=${() => setKind(kind === 'awards' ? '' : 'awards')}>Who won</button>
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

      ${kind === 'buyers' ? html`<${BuyersView} scope=${scope} />`
        : kind === 'awards' ? html`<${AwardsView} scope=${scope} />`
        : kind === 'tender' ? html`<${TendersTab} embedded=${true} />` : html`
      <div style=${{ display: 'flex', gap: '20px', alignItems: 'flex-start', flexWrap: 'wrap' }}>

        <!-- RADAR (right sidebar, compact) -->
        <div style=${{ order: 2, flex: '0 0 330px', minWidth: '280px', position: 'sticky', top: '4px', border: '1px solid var(--border)', borderRadius: '14px', background: 'var(--bg-elev)', padding: '14px' }}>
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
              const lr = R_MAX + 22;
              return html`<text key=${'lbl' + k} x=${C + lr * Math.cos(mid)} y=${C + lr * Math.sin(mid) + 5}
                text-anchor="middle" font-size="16" font-weight="700" letter-spacing="0.3"
                fill=${KIND_META[k].color}>${(KIND_META[k].short || KIND_META[k].label).toUpperCase()}</text>`;
            })}

            <!-- rotating sweep -->
            <g style=${{ transformOrigin: `${C}px ${C}px`, animation: 'bdiRadarSpin 7s linear infinite' }}>
              <path d=${`M ${C} ${C} L ${C + R_MAX} ${C} A ${R_MAX} ${R_MAX} 0 0 0 ${C + R_MAX * Math.cos(-0.6)} ${C + R_MAX * Math.sin(-0.6)} Z`} fill="url(#bdiSweep)" />
              <line x1=${C} y1=${C} x2=${C + R_MAX} y2=${C} stroke="#5b8cff" stroke-opacity="0.55" stroke-width="1.4" />
            </g>

            <!-- blips -->
            ${radarBlips.map((s) => {
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
                <g key=${(s._tender ? 't' : 's') + s.id} style=${{ pointerEvents: 'none' }}>
                  ${sel ? html`<circle cx=${x} cy=${y} r="9" fill="none" stroke=${meta.color} stroke-width="1.4" />` : null}
                  <circle cx=${x} cy=${y} r="4" fill=${meta.color} opacity="0">
                    <animate attributeName="opacity" begin=${begin} dur="7s" values="1;0.9;0.12;0" keyTimes="0;0.12;0.55;1" repeatCount="indefinite" />
                    <animate attributeName="r" begin=${begin} dur="7s" values="6.5;4;3.5;3.5" keyTimes="0;0.12;0.55;1" repeatCount="indefinite" />
                  </circle>
                </g>`;
            })}

            <circle cx=${C} cy=${C} r="4" fill="#5b8cff" />
            <text x=${C} y=${C + 20} text-anchor="middle" font-size="12" font-weight="600" fill="var(--text-dim, #9ca5b9)">NOW</text>
            <text x=${C + R_MAX - 4} y=${C + 15} text-anchor="end" font-size="12" fill="var(--text-dim, #9ca5b9)">${WINDOWS.find(([k]) => k === windowKey)?.[1]} ago</text>
          </svg>
          <div class="muted small" style=${{ marginTop: '8px', textAlign: 'center' }}>
            ${loading ? 'Sweeping the market…' : total
              ? `${total.toLocaleString()} signal${total === 1 ? '' : 's'} in the last ${WINDOWS.find(([k]) => k === windowKey)?.[1]} — see the stream below to inspect`
              : kind === '' && openTenders.length
                ? `${openTenders.length} open tender${openTenders.length === 1 ? '' : 's'} on the radar — other signals appear as Bell detects market movement.`
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

// "Who's buying" — the buyer-intent wedge. Qatar entities actively procuring, ranked
// by ICP fit × urgency × open-tender count (server aggregates over tenders.industries[]
// + buyer). Turns tenders from a bid list into "who is buying in YOUR space — act."
// Hooks precede any return (hook-order rule).
function BuyersView({ scope }) {
  const [rows, setRows] = useState([]);
  const [icpList, setIcpList] = useState([]);
  const [icpMissing, setIcpMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openBuyer, setOpenBuyer] = useState(null);

  useEffect(() => {
    let dead = false;
    setLoading(true);
    api.tenderBuyers({ icp: scope === 'icp' ? 1 : 0, limit: 80 })
      .then((r) => { if (!dead) { setRows(r.rows || []); setIcpList(r.icp || []); setIcpMissing(!!r.icp_missing); setLoading(false); } })
      .catch(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [scope]);

  const daysTo = (d) => { if (!d) return null; return Math.ceil((new Date(d) - Date.now()) / 86400000); };
  const urgency = (d) => {
    const n = daysTo(d);
    if (n == null) return { t: 'no deadline', c: 'var(--text-muted)' };
    if (n <= 0) return { t: 'closing today', c: 'var(--red, #e8776b)' };
    if (n <= 2) return { t: `closes in ${n}d`, c: 'var(--red, #e8776b)' };
    if (n <= 7) return { t: `closes in ${n}d`, c: 'var(--amber, #d9ab54)' };
    return { t: `closes in ${n}d`, c: 'var(--text-muted)' };
  };

  if (scope === 'icp' && icpMissing) {
    return html`<div class="empty" style=${{ lineHeight: 1.6 }}>“For you” needs your ideal-customer profile. Set your target industries in <b>Settings → Company & ICP</b> and Bell ranks every buyer by fit.</div>`;
  }
  if (loading) return html`<div class="empty">Finding who’s buying…</div>`;
  if (!rows.length) return html`<div class="empty">No active buyers${scope === 'icp' ? ' in your line of business' : ''} right now.</div>`;

  return html`<div>
    <div class="muted small" style=${{ margin: '0 0 12px' }}>
      ${scope === 'icp'
        ? html`Qatar entities with open tenders in <b>your line of business</b> — ranked by fit and urgency. Act before the deadline.`
        : html`Qatar entities actively procuring right now — most urgent first. Switch to <b>For you</b> to rank by your ICP.`}
    </div>
    <div style=${{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
      ${rows.map((b) => {
        const u = urgency(b.soonest_deadline);
        const matched = b.matched_industries || [];
        const inds = matched.length ? matched : (b.industries || []).slice(0, 3);
        return html`<div key=${b.buyer} onClick=${() => setOpenBuyer(b)}
          style=${{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-elev)', padding: '13px 15px', cursor: 'pointer', display: 'flex', gap: '12px', alignItems: 'center' }}>
          <div style=${{ flex: 1, minWidth: 0 }}>
            <div style=${{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <span style=${{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text)' }}>${b.buyer}</span>
              ${b.icp_match ? html`<span style=${{ fontSize: '10px', fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: '#fff', background: 'var(--accent)', borderRadius: '4px', padding: '1px 7px' }}>ICP match</span>` : null}
            </div>
            <div class="muted small" style=${{ marginTop: '4px' }}>
              Procuring in ${inds.length ? inds.map((i, k) => html`<span key=${i} style=${{ color: matched.includes(i) ? 'var(--accent-bright, #a5c3ff)' : 'var(--text-muted)' }}>${i}${k < inds.length - 1 ? ', ' : ''}</span>`) : '—'}
            </div>
          </div>
          <div style=${{ textAlign: 'right', flexShrink: 0 }}>
            <div style=${{ fontSize: '18px', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>${b.open_count}</div>
            <div class="muted small">open tender${b.open_count === 1 ? '' : 's'}</div>
            <div style=${{ fontSize: '11.5px', fontWeight: 600, color: u.c, marginTop: '2px' }}>${u.t}</div>
          </div>
        </div>`;
      })}
    </div>
    ${openBuyer ? html`<${BuyerDrawer} buyer=${openBuyer} icpList=${icpList} onClose=${() => setOpenBuyer(null)} />` : null}
  </div>`;
}

// Drill-in: a buyer's open tenders (what they're actually buying), ICP-highlighted.
function BuyerDrawer({ buyer, icpList, onClose }) {
  const [tenders, setTenders] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let dead = false;
    api.tenders({ buyer: buyer.buyer, status: 'open', limit: 60 })
      .then((r) => { if (!dead) { setTenders(r.rows || []); setLoading(false); } })
      .catch(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [buyer]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const fmt = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
  const icpSet = new Set((icpList || []).map((x) => String(x).toLowerCase()));
  return html`<div onClick=${onClose} style=${{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60 }}>
    <div onClick=${(e) => e.stopPropagation()} style=${{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(560px, 94vw)', background: 'var(--bg)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 30px rgba(0,0,0,0.35)' }}>
      <div style=${{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <div style=${{ flex: 1, minWidth: 0 }}>
          <div class="muted small" style=${{ textTransform: 'uppercase', letterSpacing: '.06em' }}>Who’s buying</div>
          <div style=${{ fontSize: '17px', fontWeight: 700, color: 'var(--text)', marginTop: '3px' }}>${buyer.buyer}</div>
          <div class="muted small" style=${{ marginTop: '3px' }}>${buyer.open_count} open tender${buyer.open_count === 1 ? '' : 's'} · what they’re buying now</div>
        </div>
        <button class="btn btn-ghost" onClick=${onClose} style=${{ flex: '0 0 auto' }}>✕</button>
      </div>
      <div style=${{ flex: 1, overflowY: 'auto', padding: '14px 18px' }}>
        ${loading ? html`<div class="empty">Loading tenders…</div>`
          : !tenders.length ? html`<div class="empty">No open tenders right now.</div>`
          : html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            ${tenders.map((t) => html`<div key=${t.id} style=${{ border: '1px solid var(--border)', borderRadius: '10px', background: 'var(--bg-elev)', padding: '10px 13px' }}>
              <div style=${{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)', lineHeight: 1.35 }}>${t.title}</div>
              <div style=${{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '6px', alignItems: 'center' }}>
                ${(t.industries || []).slice(0, 4).map((i) => html`<span key=${i} style=${{ fontSize: '10.5px', color: icpSet.has(String(i).toLowerCase()) ? 'var(--accent-bright, #a5c3ff)' : 'var(--text-muted)', border: '1px solid var(--border)', borderRadius: '5px', padding: '1px 7px' }}>${i}</span>`)}
                <span style=${{ flex: 1 }}></span>
                ${t.deadline_at ? html`<span class="muted small" style=${{ whiteSpace: 'nowrap' }}>closes ${fmt(t.deadline_at)}</span>` : null}
              </div>
            </div>`)}
          </div>`}
      </div>
    </div>
  </div>`;
}

// "Who won" — award / winner intelligence. Recent Qatar contract awards with the
// winning company, value, ICV score and (Ashghal) the full bidder table — data rivals
// charge for and don't link to a company. A recent winner is an active vendor with
// fresh budget: buyer intent for their own supply chain. Hooks precede any return.
function AwardsView({ scope }) {
  const [rows, setRows] = useState([]);
  const [icpMissing, setIcpMissing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState(null);
  useEffect(() => {
    let dead = false;
    setLoading(true);
    api.tenderAwards({ icp: scope === 'icp' ? 1 : 0, limit: 60 })
      .then((r) => { if (!dead) { setRows(r.rows || []); setIcpMissing(!!r.icp_missing); setLoading(false); } })
      .catch(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [scope]);
  const fmtQar = (v) => {
    const n = Number(v); if (!Number.isFinite(n) || n <= 0) return null;
    if (n >= 1e9) return 'QAR ' + (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return 'QAR ' + (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return 'QAR ' + Math.round(n / 1e3) + 'K';
    return 'QAR ' + n.toLocaleString();
  };
  const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '');
  const SRC = { ashghal: 'Ashghal', qatarenergy: 'QatarEnergy', kahramaa: 'Kahramaa' };

  if (scope === 'icp' && icpMissing) return html`<div class="empty" style=${{ lineHeight: 1.6 }}>“For you” needs your ICP. Set your target industries in <b>Settings → Company & ICP</b> to see awards in your line of business.</div>`;
  if (loading) return html`<div class="empty">Loading contract awards…</div>`;
  if (!rows.length) return html`<div class="empty">No contract awards${scope === 'icp' ? ' in your line of business' : ''} yet.</div>`;

  return html`<div>
    <div class="muted small" style=${{ margin: '0 0 12px' }}>
      Who won which Qatar contracts — winner, value and (Ashghal) the full bidder list with ICV scores. A recent winner has fresh budget: an active vendor to sell into.
    </div>
    <div style=${{ display: 'flex', flexDirection: 'column', gap: '9px' }}>
      ${rows.map((a) => {
        const amt = fmtQar(a.value_amount);
        return html`<div key=${a.id} onClick=${() => setOpenId(a.id)}
          style=${{ border: '1px solid var(--border)', borderRadius: '12px', background: 'var(--bg-elev)', padding: '13px 15px', cursor: 'pointer' }}>
          <div style=${{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
            <span style=${{ fontSize: '14.5px', fontWeight: 700, color: 'var(--text)' }}>${a.award_company_name}</span>
            ${amt ? html`<span style=${{ fontSize: '13px', fontWeight: 700, color: 'var(--accent-bright, #a5c3ff)', fontVariantNumeric: 'tabular-nums' }}>${amt}</span>` : null}
            ${a.winner_icv ? html`<span style=${{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text)', border: '1px solid var(--border)', borderRadius: '5px', padding: '1px 7px' }}>ICV ${a.winner_icv}</span>` : null}
          </div>
          <div class="muted small" style=${{ marginTop: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>${a.title}</div>
          <div class="muted small" style=${{ marginTop: '5px' }}>
            🏛 ${a.buyer || SRC[a.source] || a.source} · awarded ${fmtDate(a.awarded_at)}${a.bidder_count ? ` · ${a.bidder_count} bidders` : ''}
          </div>
        </div>`;
      })}
    </div>
    ${openId ? html`<${AwardDrawer} id=${openId} onClose=${() => setOpenId(null)} />` : null}
  </div>`;
}

// Drill-in: the full bidder table (rank · company · ICV · price · winner) — Ashghal's
// unique competitive intel. Winner links to the company record.
function AwardDrawer({ id, onClose }) {
  const [t, setT] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let dead = false;
    api.tenderItem(id).then((d) => { if (!dead) { setT((d && d.tender) ? d.tender : d); setLoading(false); } }).catch(() => { if (!dead) setLoading(false); });
    return () => { dead = true; };
  }, [id]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  const fmtQar = (v) => { const n = Number(v); if (!Number.isFinite(n) || n <= 0) return '—'; return 'QAR ' + n.toLocaleString(); };
  const raw = (t && t.raw) || {};
  const bidders = Array.isArray(raw.bidders) ? raw.bidders : [];
  return html`<div onClick=${onClose} style=${{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60 }}>
    <div onClick=${(e) => e.stopPropagation()} style=${{ position: 'absolute', top: 0, right: 0, bottom: 0, width: 'min(600px, 95vw)', background: 'var(--bg)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', boxShadow: '-8px 0 30px rgba(0,0,0,0.35)' }}>
      <div style=${{ padding: '16px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: '10px', alignItems: 'flex-start' }}>
        <div style=${{ flex: 1, minWidth: 0 }}>
          <div class="muted small" style=${{ textTransform: 'uppercase', letterSpacing: '.06em' }}>Contract award</div>
          <div style=${{ fontSize: '15.5px', fontWeight: 700, color: 'var(--text)', marginTop: '3px', lineHeight: 1.35 }}>${t ? t.title : 'Loading…'}</div>
          ${t ? html`<div class="muted small" style=${{ marginTop: '4px' }}>🏛 ${t.buyer || t.source}${t.awarded_at ? ' · awarded ' + new Date(t.awarded_at).toLocaleDateString() : ''}</div>` : null}
        </div>
        <button class="btn btn-ghost" onClick=${onClose} style=${{ flex: '0 0 auto' }}>✕</button>
      </div>
      <div style=${{ flex: 1, overflowY: 'auto', padding: '16px 18px' }}>
        ${loading ? html`<div class="empty">Loading…</div>` : !t ? html`<div class="empty">Could not load this award.</div>` : html`
          <div style=${{ border: '1px solid var(--accent)', borderRadius: '10px', background: 'rgba(91,140,255,0.08)', padding: '12px 14px', marginBottom: '16px' }}>
            <div class="muted small" style=${{ textTransform: 'uppercase', letterSpacing: '.05em' }}>Winner</div>
            <div style=${{ display: 'flex', alignItems: 'baseline', gap: '10px', flexWrap: 'wrap', marginTop: '3px' }}>
              ${t.award_company_id
                ? html`<a onClick=${() => navigateTo('companies', t.award_company_id)} style=${{ fontSize: '16px', fontWeight: 700, color: 'var(--accent-bright, #a5c3ff)', cursor: 'pointer', textDecoration: 'none' }}>${t.award_company_name} ↗</a>`
                : html`<span style=${{ fontSize: '16px', fontWeight: 700, color: 'var(--text)' }}>${t.award_company_name}</span>`}
              ${t.value_amount ? html`<span style=${{ fontSize: '14px', fontWeight: 700, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>${fmtQar(t.value_amount)}</span>` : null}
            </div>
            ${t.award_company_id ? html`<div class="muted small" style=${{ marginTop: '4px' }}>In Bell’s graph — click to open the company and ☆ Save it.</div>` : null}
          </div>
          ${bidders.length ? html`
            <div class="filt-label" style=${{ marginBottom: '8px' }}>All bidders · ${bidders.length}</div>
            <div style=${{ overflowX: 'auto' }}>
              <table style=${{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
                <thead><tr style=${{ textAlign: 'left', color: 'var(--text-muted)' }}>
                  <th style=${{ padding: '6px 8px', fontWeight: 600 }}>#</th>
                  <th style=${{ padding: '6px 8px', fontWeight: 600 }}>Company</th>
                  <th style=${{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>ICV</th>
                  <th style=${{ padding: '6px 8px', fontWeight: 600, textAlign: 'right' }}>Price</th>
                </tr></thead>
                <tbody>
                  ${bidders.map((b, i) => html`<tr key=${i} style=${{ borderTop: '1px solid var(--border)', background: b.winner ? 'rgba(91,140,255,0.06)' : 'transparent' }}>
                    <td style=${{ padding: '7px 8px', color: 'var(--text-muted)' }}>${b.rank || (i + 1)}</td>
                    <td style=${{ padding: '7px 8px', color: 'var(--text)', fontWeight: b.winner ? 700 : 400 }}>${b.name}${b.winner ? ' ✓' : ''}</td>
                    <td style=${{ padding: '7px 8px', textAlign: 'right', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>${b.icv || '—'}</td>
                    <td style=${{ padding: '7px 8px', textAlign: 'right', color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>${(b.winner_price || b.accepted_price) ? fmtQar(b.winner_price || b.accepted_price) : '—'}</td>
                  </tr>`)}
                </tbody>
              </table>
            </div>`
            : html`<div class="muted small">This source publishes the winner + value only (no bidder breakdown).</div>`}
        `}
      </div>
    </div>
  </div>`;
}
