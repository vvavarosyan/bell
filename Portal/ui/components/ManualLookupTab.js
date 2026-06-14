// Manual Company Lookup — type a company name, the local engines (Find Website
// → Harvest Site → Map Network) go find everything about it, and the result is
// staged here for you to approve or reject. Approving creates a real company
// (and enriches it); rejecting discards the preview — nothing is created.
//
// (Single name for now; the input is built to accept a pasted list later.)

import { useState, useEffect, useCallback, useRef } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { JobLogPanel } from './JobLogPanel.js';

const STATUS_COLOR = {
  running:  'var(--accent, #5b8cff)',
  pending:  'var(--amber, #e0a32e)',
  matched:  'var(--accent, #5b8cff)',
  approved: 'var(--green, #6fcf97)',
  rejected: 'var(--red, #ff6b6b)',
  error:    'var(--red, #ff6b6b)',
};

const STATUS_LABEL = {
  running:  'searching…',
  pending:  'needs review',
  matched:  'matched + enriched',
  approved: 'approved',
  rejected: 'rejected',
  error:    'error',
};

function countryBadge(country) {
  if (!country || !country.status) return null;
  const map = {
    qatar:     { color: 'var(--green)', text: 'Qatar' },
    non_qatar: { color: 'var(--amber)', text: country.country || 'International' },
    uncertain: { color: 'var(--text-dim)', text: 'country uncertain' },
  };
  const c = map[country.status] || map.uncertain;
  return html`<span class="request-pill" style=${{ borderColor: c.color, color: c.color }}>${c.text}</span>`;
}

function chip(label, val) {
  if (!val) return null;
  return html`<span class="request-pill" style=${{ borderColor: 'var(--border)', color: 'var(--text-muted)' }}>${label}: <strong>${val}</strong></span>`;
}

// The preview block shown for a pending lookup.
function Preview({ r }) {
  if (!r) return null;
  if (!r.website && r.ok === false) {
    return html`<div class="muted small">No website or online details found for this name. You can still add it by name only (and enrich it later), or reject.</div>`;
  }
  const emails = r.emails || [], phones = r.phones || [], people = r.people || [], partners = r.partners || [], socials = r.socials || [];
  return html`
    <div style=${{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div style=${{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
        ${r.website ? html`<a href=${r.website} target="_blank" rel="noreferrer">${r.website} ↗</a>` : html`<span class="muted small">no website</span>`}
        ${r.website_method && r.website_method !== 'search_unverified' ? html`<span class="muted small">(${r.website_method})</span>` : null}
        ${countryBadge(r.country)}
      </div>
      ${r.website_method === 'search_unverified' ? html`<div class="small" style=${{ color: 'var(--amber)' }}>⚠ Unverified guess — confirm this is the right website before approving.</div>` : null}
      ${r.industry ? html`<div class="muted small">🏭 ${r.industry}${r.founded_year ? ` · est. ${r.founded_year}` : ''}</div>` : (r.founded_year ? html`<div class="muted small">est. ${r.founded_year}</div>` : null)}
      ${r.description ? html`<div class="small" style=${{ color: 'var(--text-muted)' }}>${r.description}</div>` : null}
      <div style=${{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
        ${chip('emails', emails.length)}
        ${chip('phones', phones.length)}
        ${chip('socials', socials.length)}
        ${chip('people', people.length)}
        ${chip('partners', partners.length)}
      </div>
      ${emails.length ? html`<div class="muted small">✉ ${emails.slice(0, 4).join(', ')}${emails.length > 4 ? ` +${emails.length - 4}` : ''}</div>` : null}
      ${phones.length ? html`<div class="muted small">☎ ${phones.slice(0, 4).join(', ')}${phones.length > 4 ? ` +${phones.length - 4}` : ''}</div>` : null}
      ${people.length ? html`<div class="muted small">👤 ${people.slice(0, 5).map(p => p.name + (p.title ? ` (${p.title})` : '')).join(' · ')}${people.length > 5 ? ` +${people.length - 5}` : ''}</div>` : null}
      ${partners.length ? html`<div class="muted small">🤝 ${partners.slice(0, 6).join(', ')}${partners.length > 6 ? ` +${partners.length - 6}` : ''}</div>` : null}
      ${r.address ? html`<div class="muted small">📍 ${r.address}</div>` : null}
    </div>
  `;
}

export function ManualLookupTab() {
  const [name, setName]       = useState('');
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [busy, setBusy]       = useState(() => new Set());
  const [activeJob, setActiveJob] = useState(null);
  const inputRef = useRef(null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try { const r = await api.manualLookups('all'); setRows(r.rows || []); }
    catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { if (!silent) setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Poll while any lookup is still running.
  useEffect(() => {
    if (!rows.some(r => r.status === 'running')) return;
    const t = setTimeout(() => load(true), 4000);
    return () => clearTimeout(t);
  }, [rows, load]);

  const start = async () => {
    const q = name.trim();
    if (q.length < 2) { toast('Type a company name', 'error'); return; }
    setStarting(true);
    try {
      const r = await api.startManualLookup(q);
      setName('');
      setActiveJob({ id: r.job_id, title: `Lookup · ${q}` });
      toast(`Looking up "${q}"…`);
      load(true);
    } catch (err) { toast(err.message, 'error'); }
    finally { setStarting(false); inputRef.current?.focus(); }
  };

  const decide = async (id, action, label) => {
    setBusy(prev => new Set(prev).add(id));
    try {
      const r = await api.decideManualLookup(id, action);
      if (r.job_id) {
        const verb = action === 'enrich_match' ? 'Enrich' : 'Approve';
        setActiveJob({ id: r.job_id, title: `${verb} · ${label}` });
        toast(action === 'enrich_match' ? 'Enriching the matched company…' : 'Approving — creating + enriching…');
      } else {
        toast('Rejected');
      }
      load(true);
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    finally { setBusy(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  };

  const onKey = (e) => { if (e.key === 'Enter') start(); };

  return html`
    <div class="dr-shell">
      <div class="grid-toolbar" style=${{ gap: '8px' }}>
        <strong>Manual Lookup</strong>
        <input
          ref=${inputRef}
          type="text"
          placeholder="Type a company name…"
          value=${name}
          onInput=${e => setName(e.target.value)}
          onKeyDown=${onKey}
          style=${{ flex: '1', minWidth: '220px', padding: '6px 10px', borderRadius: '6px', background: 'var(--bg-elev-2)', color: 'var(--text)', border: '1px solid var(--border)' }}
        />
        <button class="accent" onClick=${start} disabled=${starting}>${starting ? 'Starting…' : 'Find ▶'}</button>
        <span class="spacer"></span>
        <button onClick=${() => load()} disabled=${loading}>Refresh</button>
      </div>
      <div class="muted small" style=${{ padding: '0 4px 8px' }}>
        Runs Engine 1 (Find Website) → Engine 2 (Harvest Site) → Engine 3 (Map Network) on the name you type.
        If it already exists in Bell, the existing record is enriched instead of duplicated.
      </div>

      ${loading
        ? html`<div class="empty">Loading…</div>`
        : (rows.length === 0
            ? html`<div class="empty">No lookups yet. Type a company name above and click Find.</div>`
            : html`<div class="dr-list">
                ${rows.map(r => html`
                  <div class="dr-card" key=${r.id}>
                    <div class="dr-card-head">
                      <div>
                        <strong>${r.query_name}</strong>
                        <div class="muted small">${new Date(r.created_at).toLocaleString()}${r.decided_by ? ' · by ' + r.decided_by : ''}</div>
                      </div>
                      <span class="request-pill" style=${{ color: STATUS_COLOR[r.status], borderColor: STATUS_COLOR[r.status] }}>${STATUS_LABEL[r.status] || r.status}</span>
                    </div>

                    <div class="dr-note">
                      ${r.status === 'running' ? html`<span class="muted small">Searching the web and crawling… this can take a few seconds.</span>` : null}
                      ${r.status === 'error' ? html`<span style=${{ color: 'var(--red)' }}>${r.result?.error || 'lookup failed'}</span>` : null}
                      ${(r.status === 'matched' || (r.status === 'approved' && r.result?.matched)) ? html`
                        <div>
                          Matched existing company <strong>${r.matched_company_name || r.result?.matched?.name || ('#' + r.matched_company_id)}</strong>
                          ${r.matched_company_bin ? html`<span class="muted small"> ${r.matched_company_bin}</span>` : null}
                          ${r.result?.enriched ? html`<div class="muted small">enriched: +${r.result.enriched.added_contacts} contact(s), +${r.result.enriched.added_people} people, +${r.result.enriched.added_edges} edge(s)</div>` : null}
                        </div>` : null}
                      ${r.status === 'approved' && !r.result?.matched ? html`
                        <div>Approved — created company <strong>${r.matched_company_name || ('#' + r.matched_company_id)}</strong>${r.matched_company_bin ? html`<span class="muted small"> ${r.matched_company_bin}</span>` : null}. It will sync to Bell.qa on the next push.</div>` : null}
                      ${r.status === 'pending' ? (r.result?.exact ? html`
                        <div style=${{ borderLeft: '3px solid var(--green)', paddingLeft: '8px' }}>
                          ✓ Already in Bell: <strong>${r.result.suggested_match.name}</strong>
                          <div class="muted small">This company already exists. Enrich it with all engines, or reject.</div>
                        </div>
                      ` : html`
                        ${r.result?.suggested_match ? html`
                          <div style=${{ borderLeft: '3px solid var(--amber)', paddingLeft: '8px', marginBottom: '8px' }}>
                            ⚠ Possible existing match: <strong>${r.result.suggested_match.name}</strong>
                            ${r.result.suggested_match.similarity ? html`<span class="muted small"> (${Math.round(r.result.suggested_match.similarity * 100)}% similar)</span>` : null}
                            <div class="muted small">If that's the same company, enrich it. Otherwise add "${r.query_name}" as a new company.</div>
                          </div>` : null}
                        <${Preview} r=${r.result} />
                      `) : null}
                    </div>

                    ${r.status === 'pending' ? html`
                      <div class="dr-actions">
                        ${r.result?.suggested_match ? html`<button class="accent" disabled=${busy.has(r.id)} onClick=${() => decide(r.id, 'enrich_match', r.result.suggested_match.name)}>Enrich: ${r.result.suggested_match.name}</button>` : null}
                        ${!r.result?.exact ? html`<button class="accent" disabled=${busy.has(r.id)} onClick=${() => decide(r.id, 'approve', r.query_name)}>${r.result?.suggested_match ? `Add "${r.query_name}" as new` : 'Approve → add to Bell'}</button>` : null}
                        <button class="ghost"  disabled=${busy.has(r.id)} onClick=${() => decide(r.id, 'reject', r.query_name)}>Reject</button>
                      </div>` : null}
                  </div>
                `)}
              </div>`)}

      ${activeJob ? html`<${JobLogPanel}
        title=${activeJob.title}
        jobId=${activeJob.id}
        kind="enrichment"
        onClose=${() => { setActiveJob(null); load(true); }}
        onComplete=${() => load(true)}
      />` : null}
    </div>
  `;
}
