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
  { key: 'locpairs', label: 'Location pairs',  blurb: 'A map pin with no written address, next to a surveyed government building whose name appears in one of the company\'s own addresses. Confirm → the pin gets the company\'s real address; Not the same place → never asked again.' },
  { key: 'loctwins', label: 'Address twins',  blurb: 'The same site written twice — two of a company\'s own addresses that clearly describe one place. Pick which written form survives; it inherits the other\'s map pin. Different sites → never asked again.' },
  { key: 'chains', label: 'Chains',  blurb: 'One brand, many branch records sharing the operator\'s website — Yateem-style. Link → every branch keeps its own record and registration, but the profile, drawer and map show ONE family. Not a chain → never asked again.' },
  { key: 'qatar',   label: 'Spark · Qatar',    blurb: 'Qatar companies Spark discovered while researching others. Approve → a real Qatar company.' },
  { key: 'foreign', label: 'Spark · foreign',  blurb: 'Non-Qatar companies — kept admin-only for future Middle-East expansion. Never enter Bell.' },
];

export function ReviewQueueTab() {
  const [tab, setTab] = useState('gmaps');
  const [counts, setCounts] = useState({ gmaps_candidates: 0, spark_qatar: 0, spark_foreign: 0, osm_candidates: 0, loc_pairs: 0, loc_twins: 0, chain_groups: 0 });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);
  const [groups, setGroups] = useState([]);      // OSM: candidates per category
  const [bulkBusy, setBulkBusy] = useState('');   // category currently being approved

  const loadCounts = useCallback(async () => {
    try {
      const [d, lp, ch] = await Promise.all([api.discoverySummary(),
        api.locPairsSummary().catch(() => ({ pairs: 0, twins: 0 })),
        api.chainsSummary().catch(() => ({ groups: 0 }))]);
      setCounts({ ...d, loc_pairs: lp.pairs || 0, loc_twins: lp.twins || 0, chain_groups: ch.groups || 0 });
    } catch { /* non-fatal */ }
  }, []);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const r = tab === 'gmaps' ? await api.discoveryGmaps(200)
        : tab === 'osm' ? await api.discoveryOsm(200)
        : tab === 'locpairs' ? await api.locPairs(100)
        : tab === 'loctwins' ? await api.locTwins(100)
        : tab === 'chains' ? await api.chainsGroups(50)
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

  // Location pairs: confirm puts the company's own written address onto the pin;
  // reject is remembered on the pin row so the pair is never proposed again.
  const pairAct = async (pair, keepId, approve) => {
    setBusyId(pair.drop_id);
    try {
      if (approve) { await api.locPairApprove(pair.drop_id, keepId); toast('Confirmed — the pin now carries the written address.', 'success'); }
      else { await api.locPairReject(pair.drop_id, keepId); toast('Noted — this pair will not be asked again.'); }
      setRows((rs) => rs.filter((x) => x.drop_id !== pair.drop_id));
      loadCounts();
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    finally { setBusyId(null); }
  };

  // Address twins: keep one written form; it inherits the other's pin. Both actions
  // remove the card; reject is remembered on both rows.
  const twinKey = (t) => t.rows.map((r) => r.id).join('-');
  const twinAct = async (t, keepId, approve) => {
    const [a, b] = t.rows;
    setBusyId(twinKey(t));
    try {
      if (approve) { await api.locTwinApprove(keepId, keepId === a.id ? b.id : a.id); toast('Merged — one address, the pin kept.', 'success'); }
      else { await api.locTwinReject(a.id, b.id); toast('Noted — kept as two separate sites.'); }
      setRows((rs) => rs.filter((x) => !Array.isArray(x.rows) || twinKey(x) !== twinKey(t)));
      loadCounts();
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    finally { setBusyId(null); }
  };

  // Chains: link the whole family or single branches; reject remembers per member.
  const chainAct = async (g, memberIds, approve) => {
    setBusyId('chain:' + g.head.id);
    try {
      if (approve) { const r = await api.chainsApprove(g.head.id, memberIds); toast(`${r.linked} branch(es) linked under ${g.head.name}.`, 'success'); }
      else { await api.chainsReject(g.head.id, memberIds); toast('Noted — not a chain; will not be asked again.'); }
      setRows((rs) => rs.filter((x) => !x.head || x.head.id !== g.head.id));
      loadCounts();
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    finally { setBusyId(null); }
  };

  const chip = (t) => {
    const n = t.key === 'gmaps' ? counts.gmaps_candidates : t.key === 'osm' ? counts.osm_candidates : t.key === 'locpairs' ? counts.loc_pairs : t.key === 'loctwins' ? counts.loc_twins : t.key === 'chains' ? counts.chain_groups : t.key === 'qatar' ? counts.spark_qatar : counts.spark_foreign;
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
        : tab === 'locpairs' ? html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: 'calc(100vh - 230px)', overflowY: 'auto', paddingRight: '4px' }}>
            ${rows.filter((p) => Array.isArray(p.candidates)).map((p) => html`
              <div key=${p.drop_id} style=${{ border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px' }}>
                <div style=${{ fontWeight: 700 }}>${p.company_name}</div>
                <div class="muted small" style=${{ marginTop: '3px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <span>📍 pin at ${Number(p.latitude).toFixed(5)}, ${Number(p.longitude).toFixed(5)} — no written address</span>
                  <span style=${{ color: 'var(--accent, #7dd3fc)' }}>🏛 the surveyed building here is “${p.landmark}” (${p.landmark_m} m away${p.zone_no ? `, zone ${p.zone_no}` : ''})</span>
                </div>
                <div class="muted small" style=${{ margin: '8px 0 4px' }}>
                  This company's own written address${p.candidates.length > 1 ? 'es mention' : ' mentions'} that building — is it the same place?
                </div>
                <div style=${{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  ${p.candidates.map((c) => html`
                    <div key=${c.id} style=${{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px' }}>
                      <div style=${{ flex: '1 1 300px', minWidth: 0 }}>
                        <span style=${{ fontWeight: 600 }}>${c.address}</span>
                        <span class="muted small">  (${c.source}${c.label && c.label !== 'Branch' ? ` · “${c.label}”` : ''})</span>
                      </div>
                      <button class="btn btn-sm btn-primary" disabled=${busyId === p.drop_id}
                        onClick=${() => pairAct(p, c.id, true)}>Same place — use this address</button>
                      <button class="btn btn-sm" disabled=${busyId === p.drop_id}
                        onClick=${() => pairAct(p, c.id, false)}>Not the same</button>
                    </div>`)}
                </div>
              </div>`)}
          </div>`
        : tab === 'chains' ? html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: 'calc(100vh - 230px)', overflowY: 'auto', paddingRight: '4px' }}>
            ${rows.filter((g) => g.head && Array.isArray(g.branches)).map((g) => html`
              <div key=${g.head.id} style=${{ border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px' }}>
                <div style=${{ fontWeight: 700 }}>${g.head.name}
                  <span class="muted small">  ${g.head.reg ? `CR ${g.head.reg} · ` : ''}${g.label}${g.clean ? '' : ' · ⚠ mixed group'}</span>
                </div>
                <div class="muted small" style=${{ margin: '4px 0 6px' }}>
                  ${g.branches.length} record(s) share this website and extend the brand name — link them as branches?
                  Every record keeps its own registration; this only draws the family tie.
                </div>
                <div style=${{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  ${g.branches.slice(0, 8).map((b) => html`
                    <div key=${b.id} class="small" style=${{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <span style=${{ flex: '1 1 auto' }}>${b.name}${b.reg ? html`<span class="muted">  (${b.reg})</span>` : ''}${b.city ? html`<span class="muted"> · ${b.city}</span>` : ''}</span>
                      <button class="btn btn-sm" disabled=${busyId === 'chain:' + g.head.id}
                        onClick=${() => chainAct(g, [b.id], true)}>Link</button>
                    </div>`)}
                  ${g.branches.length > 8 ? html`<div class="muted small">…and ${g.branches.length - 8} more</div>` : null}
                </div>
                ${g.strangers?.length ? html`<div class="small" style=${{ marginTop: '6px', color: 'var(--amber, #b7791f)' }}>
                  ⚠ Not offered (own registration or different name): ${g.strangers.slice(0, 3).map((x) => x.name).join(' · ')}${g.strangers.length > 3 ? ` +${g.strangers.length - 3}` : ''}
                </div>` : null}
                <div style=${{ display: 'flex', gap: '6px', marginTop: '8px' }}>
                  <button class="btn btn-sm btn-primary" disabled=${busyId === 'chain:' + g.head.id}
                    onClick=${() => chainAct(g, g.branches.map((b) => b.id), true)}>
                    ${busyId === 'chain:' + g.head.id ? 'Linking…' : `Link all ${g.branches.length} as branches`}</button>
                  <button class="btn btn-sm" disabled=${busyId === 'chain:' + g.head.id}
                    onClick=${() => chainAct(g, g.branches.map((b) => b.id), false)}>Not a chain</button>
                </div>
              </div>`)}
          </div>`
        : tab === 'loctwins' ? html`<div style=${{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: 'calc(100vh - 230px)', overflowY: 'auto', paddingRight: '4px' }}>
            ${rows.filter((t) => Array.isArray(t.rows)).map((t) => html`
              <div key=${twinKey(t)} style=${{ border: '1px solid var(--border)', borderRadius: '10px', padding: '10px 12px' }}>
                <div style=${{ fontWeight: 700 }}>${t.company_name}</div>
                <div class="muted small" style=${{ marginTop: '3px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  <span>evidence: ${t.strength}${t.shared_tokens?.length ? ` — “${t.shared_tokens.join('”, “')}”` : ''}</span>
                  ${t.distance_m != null ? html`<span>pins ${t.distance_m} m apart</span>` : null}
                </div>
                <div class="muted small" style=${{ margin: '8px 0 4px' }}>Two written addresses for what looks like one place — keep which?</div>
                <div style=${{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  ${t.rows.map((r) => html`
                    <div key=${r.id} style=${{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: '8px', padding: '6px 10px' }}>
                      <div style=${{ flex: '1 1 300px', minWidth: 0 }}>
                        <span style=${{ fontWeight: 600 }}>${r.address}</span>
                        <span class="muted small">  (${r.source}${r.pinned ? ' · on the map' : ''}${r.label && r.label !== 'Branch' ? ` · “${r.label}”` : ''})</span>
                      </div>
                      <button class="btn btn-sm btn-primary" disabled=${busyId === twinKey(t)}
                        onClick=${() => twinAct(t, r.id, true)}>Keep this one</button>
                    </div>`)}
                  <div><button class="btn btn-sm" disabled=${busyId === twinKey(t)}
                    onClick=${() => twinAct(t, null, false)}>These are different sites</button></div>
                </div>
              </div>`)}
          </div>`
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
