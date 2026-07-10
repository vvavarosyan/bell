// Proof-of-search UI (Phase 2 A3) — two self-contained blocks, both fed by the
// search_ledger table (local engine only; the ledger never syncs to prod):
//
//   SearchProofBlock      per-company block for the CompanyDetail drawer —
//                         latest outcome per engine, so "no data" is visibly
//                         PROVEN (verified empty) vs merely attempted.
//   SearchProofStatsCard  rollup card for the Local Engines dashboard.
//
// Both keep every hook above any early return (page-blank rule) and are
// mounted as children, so the host components' hook order never changes.

import { useState, useEffect } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';

const ENGINE_LABEL = {
  finder: 'Website Finder', harvester: 'Website Harvester', network: 'Network Mapper',
  email: 'Email Finder', facts: 'Company Facts', tech: 'Tech Stack',
};
const OUTCOME_META = {
  found:          { label: 'Found data',     color: 'var(--green, #22c55e)', mark: '✓' },
  candidate:      { label: 'Needs review',   color: 'var(--amber, #f59e0b)', mark: '⊕' },
  verified_empty: { label: 'Verified empty', color: '#5b8cff',               mark: '∅' },
  degraded_empty: { label: 'Unproven — retry', color: 'var(--amber, #f59e0b)', mark: '~' },
  skipped:        { label: 'Skipped',        color: 'var(--text-dim)',       mark: '·' },
  error:          { label: 'Error',          color: 'var(--red, #ff5d5d)',   mark: '✗' },
};

function timeShort(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function SearchProofBlock({ companyId }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    setData(null);
    api.searchProof(companyId).then((r) => { if (alive) setData(r); }).catch(() => { if (alive) setData({ rows: [], attempts: 0 }); });
    return () => { alive = false; };
  }, [companyId]);

  if (!data || !data.rows || data.rows.length === 0) return null;   // nothing recorded yet → say nothing

  return html`<div style=${{ marginTop: '14px' }}>
    <div style=${{ fontWeight: 700, fontSize: '12.5px', marginBottom: '6px' }}>
      Search proof
      <span class="muted" style=${{ fontWeight: 400, fontSize: '11px', marginLeft: '6px' }}>${data.attempts} recorded attempt${data.attempts === 1 ? '' : 's'}</span>
    </div>
    <div style=${{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
      ${data.rows.map((r) => {
        const m = OUTCOME_META[r.outcome] || OUTCOME_META.skipped;
        return html`<div key=${r.stage} style=${{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
          <span style=${{ color: m.color, width: '14px', textAlign: 'center' }}>${m.mark}</span>
          <span style=${{ width: '128px' }} class="muted">${ENGINE_LABEL[r.engine] || r.engine}</span>
          <span style=${{ color: m.color, fontWeight: 600 }}>${m.label}</span>
          <span class="muted" style=${{ fontSize: '11px', marginLeft: 'auto' }}>${timeShort(r.at)}</span>
        </div>`;
      })}
    </div>
  </div>`;
}

export function SearchProofStatsCard({ cardStyle = {} }) {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    let alive = true;
    api.searchProofStats().then((r) => { if (alive) setStats(r); }).catch(() => { if (alive) setStats(null); });
    return () => { alive = false; };
  }, []);

  if (!stats || !stats.totals || !stats.totals.attempts) return null;

  const sum = (outcome) => stats.by_engine.filter((r) => r.outcome === outcome).reduce((a, r) => a + r.n, 0);
  const tiles = [
    ['Found data', sum('found'), OUTCOME_META.found.color],
    ['Verified empty', sum('verified_empty'), OUTCOME_META.verified_empty.color],
    ['Unproven (tier was down)', sum('degraded_empty'), OUTCOME_META.degraded_empty.color],
    ['Skipped (no input)', sum('skipped'), OUTCOME_META.skipped.color],
    ['Errors', sum('error'), OUTCOME_META.error.color],
  ];
  return html`<div style=${cardStyle}>
    <div style=${{ fontWeight: 700, fontSize: '14px', marginBottom: '4px' }}>Proof of search</div>
    <div class="muted" style=${{ fontSize: '12px', marginBottom: '12px' }}>
      Latest outcome per company + engine, from ${Number(stats.totals.attempts).toLocaleString()} recorded attempts across
      ${' '}${Number(stats.totals.companies).toLocaleString()} companies. "Verified empty" is proof the search ran and found nothing;
      "unproven" means a search tier was disabled — those deserve a re-run before Bell claims no data exists.
    </div>
    <div style=${{ display: 'flex', gap: '26px', flexWrap: 'wrap', fontSize: '12.5px' }}>
      ${tiles.map(([label, n, color]) => html`<div key=${label}>
        <div class="muted" style=${{ fontSize: '11px' }}>${label}</div>
        <b style=${{ color }}>${Number(n).toLocaleString()}</b>
      </div>`)}
    </div>
  </div>`;
}
