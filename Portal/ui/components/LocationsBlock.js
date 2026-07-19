// "Locations (N)" drawer block (Track B) — every physical site Bell holds for a company:
// head office + branches, with geocode provenance. Self-contained (fetches its own data,
// hooks above any return) and mounted as a child, so the host's hook order never changes.
// Renders nothing when the company has no location rows.

import { useState, useEffect } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';

const STATUS_META = {
  ok:                { label: 'On the map',        color: 'var(--green, #22c55e)' },
  'stage5-existing': { label: 'On the map',        color: 'var(--green, #22c55e)' },
  not_found:         { label: 'Address not in the national locator', color: 'var(--text-dim)' },
  unparseable:       { label: 'No Zone/Street/Building in the address', color: 'var(--text-dim)' },
};

export function LocationsBlock({ companyId }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    setRows(null);
    api.companyLocations(companyId)
      .then((r) => { if (alive) setRows(r.locations || []); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [companyId]);

  if (!rows || !rows.length) return null;

  return html`
    <section class="group" key="locations">
      <h3>Locations (${rows.length})</h3>
      <dl>
        ${rows.map((l) => {
          const meta = STATUS_META[l.geocode_status] || { label: l.geocode_status ? l.geocode_status : 'Awaiting geocoding', color: 'var(--text-dim)' };
          return html`
            <div class="kv" key=${l.id}>
              <dt>${l.is_primary ? 'Head office' : (l.label || 'Branch')}</dt>
              <dd>
                ${l.address}
                <div class="muted small" style=${{ marginTop: '2px' }}>
                  <span style=${{ color: meta.color }}>${meta.label}</span>
                  ${l.latitude != null ? html` · ${Number(l.latitude).toFixed(5)}, ${Number(l.longitude).toFixed(5)}` : null}
                  ${l.source ? html` · via ${l.source}` : null}
                </div>
              </dd>
            </div>`;
        })}
      </dl>
    </section>`;
}
