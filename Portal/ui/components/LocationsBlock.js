// "Locations & branches" drawer block — ONE place for everything physical about a
// company: its head office, every distinct site, and its branch records. Previously
// these were two separate boxes ("Locations (6)" + "Branches & facilities (2)")
// which read as messy (Val 2026-07-21).
//
// Two things make it honest AND tidy:
//   • Sites are deduped by coordinate. The harvester copies a website's branch
//     coords onto every company row sharing that site, so the raw list repeats the
//     same physical place; we show the place once and say how many records back it.
//   • A row whose "address" is really just a coordinate pair is not shown as an
//     address — the point goes in the meta line where it belongs.
// Self-contained (fetches its own data, hooks above any return).

import { useState, useEffect } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';

const STATUS_META = {
  ok:                { label: 'On the map',        color: 'var(--green, #22c55e)' },
  'stage5-existing': { label: 'On the map',        color: 'var(--green, #22c55e)' },
  'website-maplink': { label: 'On the map',        color: 'var(--green, #22c55e)' },
  not_found:         { label: 'Not in the national locator', color: 'var(--text-dim)' },
  unparseable:       { label: 'Not on the map — address has no Zone/Street/Building', color: 'var(--text-dim)' },
};

// "25.30761, 51.49194" is a coordinate, not an address.
const isJustCoords = (s) => /^[\s\d.,+-]+$/.test(String(s || '')) && /\d/.test(String(s || ''));

export function LocationsBlock({ companyId, branches = [] }) {
  const [rows, setRows] = useState(null);
  useEffect(() => {
    let alive = true;
    setRows(null);
    api.companyLocations(companyId)
      .then((r) => { if (alive) setRows(r.locations || []); })
      .catch(() => { if (alive) setRows([]); });
    return () => { alive = false; };
  }, [companyId]);

  if (!rows) return null;
  if (!rows.length && !branches.length) return null;

  // Collapse rows that describe the SAME physical place.
  const sites = [];
  const byKey = new Map();
  for (const l of rows) {
    const hasPt = l.latitude != null && l.longitude != null;
    const key = hasPt
      ? Number(l.latitude).toFixed(5) + ',' + Number(l.longitude).toFixed(5)
      : 'a:' + String(l.address || '').trim().toLowerCase();
    if (!byKey.has(key)) {
      const site = { key, records: 0, primary: false, labels: [], addresses: [], sources: new Set(), status: l.geocode_status, lat: l.latitude, lng: l.longitude };
      byKey.set(key, site);
      sites.push(site);
    }
    const site = byKey.get(key);
    site.records += 1;
    if (l.is_primary) site.primary = true;
    const lab = String(l.label || '').trim();
    if (lab && !/^(branch|location)$/i.test(lab) && !site.labels.includes(lab)) site.labels.push(lab);
    const addr = String(l.address || '').trim();
    if (addr && !isJustCoords(addr) && !site.addresses.includes(addr)) site.addresses.push(addr);
    if (l.source) site.sources.add(l.source);
    if (l.geocode_status === 'ok' || l.geocode_status === 'stage5-existing') site.status = l.geocode_status;
  }
  sites.sort((a, b) => (b.primary ? 1 : 0) - (a.primary ? 1 : 0) || (b.lat != null ? 1 : 0) - (a.lat != null ? 1 : 0));

  const mapped = sites.filter((s) => s.lat != null).length;
  const heading = `Locations & branches (${sites.length} site${sites.length === 1 ? '' : 's'}`
    + (branches.length ? ` · ${branches.length} branch record${branches.length === 1 ? '' : 's'}` : '') + ')';

  return html`
    <section class="group" key="locations">
      <h3>${heading}</h3>
      ${sites.length ? html`<div class="muted small" style=${{ margin: '0 0 6px' }}>
        ${mapped} of ${sites.length} on the map
      </div>` : null}
      <dl>
        ${sites.map((s) => {
          const meta = STATUS_META[s.status] || { label: s.lat != null ? 'On the map' : 'Awaiting geocoding', color: s.lat != null ? 'var(--green, #22c55e)' : 'var(--text-dim)' };
          const title = s.primary ? 'Head office' : (s.labels[0] || 'Branch');
          return html`
            <div class="kv" key=${s.key}>
              <dt>${title}</dt>
              <dd>
                ${s.addresses.length ? s.addresses[0] : html`<span class="muted">Mapped point</span>`}
                <div class="muted small" style=${{ marginTop: '2px' }}>
                  <span style=${{ color: meta.color }}>${meta.label}</span>
                  ${s.lat != null ? html` · ${Number(s.lat).toFixed(5)}, ${Number(s.lng).toFixed(5)}` : null}
                  ${s.records > 1 ? html` · ${s.records} records` : null}
                  ${s.sources.size ? html` · via ${[...s.sources].join(', ')}` : null}
                </div>
              </dd>
            </div>`;
        })}
        ${branches.length ? html`
          <div class="kv" key="branch-records">
            <dt>Branch records</dt>
            <dd>
              <div style=${{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                ${branches.map((b) => html`
                  <span key=${b.id} title=${b.city || ''} style=${{ display: 'inline-block', padding: '3px 9px', borderRadius: '999px', background: 'var(--bg-elev-2)', border: '1px solid var(--border)', fontSize: '12px' }}>
                    ${b.name}
                  </span>`)}
              </div>
              <div class="muted small" style=${{ marginTop: '4px' }}>
                Separate records folded into this company. They stay searchable here rather than as duplicates.
              </div>
            </dd>
          </div>` : null}
      </dl>
    </section>`;
}
