// Discovery Review queue (local engine only, admin).
//
// The enrichment engines DISCOVER new companies that are never auto-added
// (Rule 2.1 + PDPPL). They wait here for a decision:
//   • Maps candidates    — Google-Maps businesses that matched no existing company
//   • Spark (Qatar)      — companies Spark found while researching; promotable
//   • Spark (foreign)    — non-Qatar; admin-only expansion pool, never promoted
//
// Approve → creates (or links to) a real Qatar company on the local engine, which
// mirrors up to bell.qa on the next push. Reject → remembered, not re-queued.
//
// Rule 2.6: all hooks precede any early return.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { navigateTo } from '../lib/router.js';

const TABS = [
  { key: 'gmaps',   label: 'Maps candidates',  blurb: 'New businesses Google Maps found that matched no company. Approve → a Qatar company with its rating, phone and map pin.' },
  { key: 'osm',     label: 'OSM places',       blurb: 'Named Qatar businesses OpenStreetMap knows that Bell doesn\'t have yet. Approve → a real Qatar company with its location (and contact where the site states one). Dedup-guarded: a match links to the existing company instead of duplicating. Use the category buttons to approve in bulk.' },
  { key: 'qatar',   label: 'Spark · Qatar',    blurb: 'Qatar companies Spark discovered while researching others. Approve → a real Qatar company.' },
  { key: 'foreign', label: 'Spark · foreign',  blurb: 'Non-Qatar companies — kept admin-only for future Middle-East expansion. Never enter Bell.' },
];

export function ReviewQueueTab() {
  const [tab, setTab] = useState('gmaps');
  const [counts, setCounts] = useState({ gmaps_candidates: 0, spark_qatar: 0, spark_foreign: 0, osm_candidates: 0 });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [groups, setGroups] = useState([]);      // OSM: candidates per category
  const [bulkBusy, setBulkBusy] = useState('');   // category currently being approved

  const loadCounts = useCallback(async () => {
    try { setCounts(await api.discoverySummary()); } catch { /* non-fatal */ }
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const r = tab === 'gmaps' ? await api.discoveryGmaps(200)
        : tab === 'osm' ? await api.discoveryOsm(200)
        : await api.discoverySpark(tab, 200);
      setRows(r.rows || []);
    } catch (err) { if (!silent) toast('Load failed: ' + err.message, 'error'); }
    finally { if (!silent) setLoading(false); }
  }, [tab]);

  useEffect(() => { load(); loadCounts(); }, [load, loadCounts]);

  // OSM only: how many candidates sit in each category (drives Approve-all).
  const loadGroups = useCallback(async () => {
    if (tab !== 'osm') { setGroups([]); return; }
    try { const r = await api.discoveryOsmGroups(); setGroups(r.groups || []); }
    catch { setGroups([]); }
  }, [tab]);
  useEffect(() => { loadGroups(); }, [loadGroups]);

  // Approve a whole category. Runs in capped batches server-side; press again to
  // continue. Each row still goes through the same dedup guard as the single
  // Approve button, so an existing company is LINKED, never duplicated.
  const approveGroup = async (g) => {
    setBulkBusy(g.group);
    try {
      const r = await api.approveOsmGroup(g.group, 300);
      toast(`${g.group}: ${r.created} added, ${r.linked} linked to existing` + (r.remaining ? ` · ${r.remaining} left` : ' · done'), 'success');
      await Promise.all([load({ silent: true }), loadCounts(), loadGroups()]);
    } catch (err) { toast('Approve all failed: ' + err.message, 'error'); }
    finally { setBulkBusy(''); }
  };

  const act = async (kind, id, fn, verb) => {
    setBusyId(id);
    try {
      const r = await fn(id);
      setRows((rs) => rs.filter((x) => x.id !== id));
      loadCounts();
      if (verb === 'approve') {
        toast(r.linked_to_existing ? 'Linked to an existing company.' : 'Approved — new company added.', 'success');
      } else { toast('Removed from the queue.'); }
    } catch (err) { toast(verb + ' failed: ' + err.message, 'error'); }
    finally { setBusyId(null); }
  };

  const promoteFn = tab === 'gmaps' ? api.promoteGmaps : tab === 'osm' ? api.promoteOsm : api.promoteSpark;
  const ignoreFn  = tab === 'gmaps' ? api.ignoreGmaps  : tab === 'osm' ? api.ignoreOsm  : api.ignoreSpark;
  const promote = (id) => act('promote', id, promoteFn, 'approve');
  const ignore  = (id) => act('ignore', id, ignoreFn, 'reject');

  const chip = (t) => {
    const n = t.key === 'gmaps' ? counts.gmaps_candidates : t.key === 'osm' ? counts.osm_candidates : t.key === 'qatar' ? counts.spark_qatar : counts.spark_foreign;
    return html`<button key=${t.key} class=${'toolbar-toggle' + (tab === t.key ? ' accent' : '')}
      onClick=${() => setTab(t.key)} style=${{ whiteSpace: 'nowrap' }}>${t.label}${n ? ` · ${Number(n).toLocaleString()}` : ''}</button>`;
  };

  const blurb = TABS.find((t) => t.key === tab)?.blurb;
  const foreign = tab === 'foreign';

  return html`
    <div style=${{ padding: '0 4px' }}>
      <div class="grid-toolbar" style=${{ gap: '6px', flexWrap: 'wrap' }}>
        ${TABS.map(chip)}
        <span class="spacer" style=${{ flex: 1 }}></span>
        <button onClick=${() => { load(); loadCounts(); }}>Refresh</button>
      </div>
      <div class="muted small" style=${{ margin: '8px 4px 12px' }}>${blurb}</div>

      ${tab === 'osm' && groups.length ? html`
        <div style=${{ border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', margin: '0 0 12px' }}>
          <div style=${{ fontWeight: 700, fontSize: '13px' }}>Approve a whole category</div>
          <div class="muted small" style=${{ margin: '2px 0 8px' }}>
            Adds them as real Qatar companies with their location — 300 at a time, press again to continue.
            Anything that matches an existing company is linked to it, never duplicated.
          </div>
          <div style=${{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            ${groups.map((g) => html`
              <button key=${g.group} class="btn btn-sm" disabled=${!!bulkBusy}
                onClick=${() => approveGroup(g)}
                title=${`${g.with_contact} of ${g.n} have a phone or website`}>
                ${bulkBusy === g.group ? 'Approving…' : `Approve all ${Number(g.n).toLocaleString()} · ${g.group}`}
              </button>`)}
          </div>
        </div>` : null}

      ${loading ? html`<div class="muted" style=${{ padding: '20px' }}>Loading…</div>`
        : rows.length === 0 ? html`<div class="muted" style=${{ padding: '20px' }}>Nothing waiting here. 🎉</div>`
        : html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: 'calc(100vh - 230px)', overflowY: 'auto', paddingRight: '4px' }}>
            ${rows.map((r) => html`
              <div key=${r.id} style=${{ border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px', display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <div style=${{ flex: '1 1 320px', minWidth: 0 }}>
                  <div style=${{ fontWeight: 700 }}>${tab === 'gmaps' ? r.title : r.name}</div>
                  <div class="muted small" style=${{ marginTop: '3px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    ${(tab === 'gmaps' || tab === 'osm') ? html`
                      ${r.category ? html`<span>🏷 ${r.category}${r.category_group ? ` · ${r.category_group}` : ''}</span>` : null}
                      ${r.address ? html`<span>📍 ${r.address}</span>` : null}
                      ${r.phone ? html`<span>📞 ${r.phone}</span>` : null}
                      ${r.rating ? html`<span>⭐ ${r.rating} · ${r.reviews_count || 0} reviews</span>` : null}
                      ${r.website ? html`<a href=${r.website} target="_blank" rel="noreferrer">🔗 website</a>` : null}
                    ` : html`
                      ${r.country ? html`<span>🌍 ${r.country}</span>` : null}
                      ${r.relation ? html`<span>🔗 ${r.relation}</span>` : null}
                      ${r.website ? html`<a href=${r.website} target="_blank" rel="noreferrer">🔗 website</a>` : null}
                      ${r.source_company_name ? html`<span>found via ${r.source_company_name}</span>` : null}
                    `}
                  </div>
                  ${(r.maybe_existing || r.possible_match) ? html`<div class="small" style=${{ marginTop: '4px', color: 'var(--amber, #b7791f)' }}>
                    ⚠ May already exist: <a href="#" onClick=${(e) => { e.preventDefault(); navigateTo('companies', (r.maybe_existing || r.possible_match).id); }}>${(r.maybe_existing || r.possible_match).name}</a> — approving will link to it, not duplicate.
                  </div>` : null}
                </div>
                <div style=${{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                  ${foreign ? html`<span class="muted small">admin-only</span>`
                    : html`<button class="btn btn-sm btn-primary" disabled=${busyId === r.id} onClick=${() => promote(r.id)}>${busyId === r.id ? '…' : 'Approve'}</button>`}
                  <button class="btn btn-sm" disabled=${busyId === r.id} onClick=${() => ignore(r.id)}>${foreign ? 'Dismiss' : 'Reject'}</button>
                </div>
              </div>`)}
          </div>`}
    </div>`;
}
