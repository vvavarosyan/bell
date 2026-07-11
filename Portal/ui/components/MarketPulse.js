// Qatar Market Pulse — the open-data statistics panel (Phase 2 C2). Renders in
// the Market Feed aside under "Data Statistics": trade flows, real-estate
// transactions, and business-licence dynamics, derived from official datasets
// Bell holds. Self-contained hooks (mounted as a child — never reorders the
// host's hook block).

import { useState, useEffect } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';

const qarB = (n) => (n == null ? '—' : (Number(n) / 1e9).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'B');
const monthName = (y, m) => new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(undefined, { month: 'short', year: 'numeric' });

export function MarketPulse() {
  const [pulse, setPulse] = useState(null);
  useEffect(() => {
    let alive = true;
    api.openStats().then((r) => { if (alive) setPulse(r); }).catch(() => { /* panel stays hidden */ });
    return () => { alive = false; };
  }, []);

  if (!pulse) return null;

  const imp = pulse.trade?.imports_monthly?.[0];
  const exp = pulse.trade?.exports_monthly?.[0];
  const re = pulse.real_estate?.monthly?.[0];
  const iss = pulse.business_licenses?.issued_monthly?.[0];
  const can = pulse.business_licenses?.canceled_monthly?.[0];
  const origins = (pulse.trade?.top_import_origins || []).slice(0, 3).map((r) => r.country).join(', ');

  const ROW = { display: 'flex', justifyContent: 'space-between', gap: '8px', fontSize: '12px', padding: '3px 0' };
  const SUB = { fontSize: '10.5px', color: 'var(--text-dim)' };

  return html`
    <div class="feed-aside-title" title="Derived from official Qatar open-data — sums of published figures">Qatar Market Pulse</div>
    <div style=${{ marginBottom: '10px' }}>
      ${imp ? html`<div style=${ROW}><span class="muted">Imports · ${monthName(imp.year, imp.month)}</span><b>QAR ${qarB(imp.value_qr)}</b></div>` : null}
      ${exp ? html`<div style=${ROW}><span class="muted">Exports · ${monthName(exp.year, exp.month)}</span><b>QAR ${qarB(exp.value_qr)}</b></div>` : null}
      ${origins ? html`<div style=${SUB}>Top import origins: ${origins}</div>` : null}
      ${re ? html`<div style=${ROW}><span class="muted">Property sales · ${re.month}</span><b>${Number(re.transactions).toLocaleString()} · QAR ${qarB(re.total_value_qr)}</b></div>` : null}
      ${iss ? html`<div style=${ROW}><span class="muted">Licences issued · ${monthName(iss.year, iss.month)}</span><b>${Number(iss.licenses).toLocaleString()}</b></div>` : null}
      ${can ? html`<div style=${ROW}><span class="muted">Licences canceled · ${monthName(can.year, can.month)}</span><b>${Number(can.licenses).toLocaleString()}</b></div>` : null}
      <div style=${SUB}>Source: official Qatar open data held by Bell · ask Bella for the full series</div>
    </div>`;
}
