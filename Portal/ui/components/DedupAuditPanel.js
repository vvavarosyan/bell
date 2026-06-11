// Dedup Audit — read-only report answering "is the merge 100% correct?".
// Fetches /api/assembly/audit and renders: hard integrity checks (must be zero),
// coverage wins, and under-/over-merge review lists. Surfaced from DedupQueueTab.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const n = (v) => (v ?? 0).toLocaleString();

// One hard-integrity row: green when count is 0, red otherwise.
const INTEGRITY_CHECKS = [
  ['merged_without_canonical',      'Merged rows with no canonical'],
  ['unflattened_chains',            'Unflattened merge chains (A→B→C)'],
  ['nonmerged_with_canonical',      'Live rows mislabeled as merged'],
  ['merged_not_archived',           'Merged duplicates still un-archived'],
  ['sources_stranded_on_merged',    'Source tags stranded on a dead row'],
  ['contacts_stranded_on_merged',   'Contacts stranded on a dead row'],
];

function Stat({ label, value, accent }) {
  return html`<div class="audit-stat">
    <div class="audit-stat-val" style=${accent ? { color: accent } : null}>${n(value)}</div>
    <div class="audit-stat-label">${label}</div>
  </div>`;
}

function Section({ title, sub, children }) {
  return html`<div class="audit-section">
    <div class="audit-section-head">
      <span class="audit-section-title">${title}</span>
      ${sub ? html`<span class="audit-section-sub muted small">${sub}</span>` : null}
    </div>
    ${children}
  </div>`;
}

export function DedupAuditPanel({ onClose }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try { setData(await api.assemblyAudit()); }
    catch (err) { toast('Audit failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const integrity = data?.integrity || {};
  const failures  = INTEGRITY_CHECKS.filter(([k]) => (integrity[k] || 0) > 0).length;
  const allClean  = data && failures === 0;

  return html`
    <div class="audit-overlay" onClick=${onClose}>
      <div class="audit-modal" onClick=${(e) => e.stopPropagation()}>
        <div class="audit-modal-head">
          <div>
            <div class="audit-modal-title">Dedup Audit</div>
            ${data ? html`<div class="muted small">Generated ${new Date(data.generated_at).toLocaleString()}</div>` : null}
          </div>
          <div class="audit-modal-actions">
            <button onClick=${load} disabled=${loading}>${loading ? 'Running…' : 'Re-run'}</button>
            <button class="ghost" onClick=${onClose}>Close</button>
          </div>
        </div>

        <div class="audit-modal-body">
          ${loading && !data ? html`<div class="audit-loading">Running audit over the full dataset…</div>` : null}

          ${data ? html`
            <!-- Verdict banner -->
            <div class=${'audit-verdict ' + (allClean ? 'ok' : 'fail')}>
              ${allClean
                ? html`<span class="audit-verdict-icon">✓</span> All ${INTEGRITY_CHECKS.length} integrity checks pass — no data loss, no broken merges.`
                : html`<span class="audit-verdict-icon">!</span> ${failures} integrity check${failures === 1 ? '' : 's'} failing — see below.`}
            </div>

            <!-- 1. Integrity -->
            <${Section} title="Integrity checks" sub="every count must be zero">
              <div class="audit-checks">
                ${INTEGRITY_CHECKS.map(([k, label]) => {
                  const v = integrity[k] || 0;
                  const ok = v === 0;
                  return html`<div class=${'audit-check ' + (ok ? 'ok' : 'fail')} key=${k}>
                    <span class="audit-check-dot">${ok ? '✓' : '✕'}</span>
                    <span class="audit-check-label">${label}</span>
                    <span class="audit-check-val">${n(v)}</span>
                  </div>`;
                })}
              </div>
            </${Section}>

            <!-- 2. Coverage -->
            <${Section} title="Coverage" sub="the merge result">
              <div class="audit-stats">
                <${Stat} label="Live companies" value=${data.coverage?.live_companies} />
                <${Stat} label="Canonical (merged groups)" value=${data.coverage?.canonical} accent="#9fefb8" />
                <${Stat} label="Merged away" value=${data.coverage?.merged_away} accent="#fbbf24" />
                <${Stat} label="Standalone" value=${data.coverage?.standalone} />
                <${Stat} label="Multi-source (≥2)" value=${data.coverage?.multi_source_companies} accent="#8bb0ff" />
                <${Stat} label="3+ sources" value=${data.coverage?.three_plus_source_companies} accent="#c5a3ff" />
              </div>
              <div class="audit-persource">
                ${(data.per_source || []).map(s => html`<span class="audit-chip" key=${s.source}><strong>${s.source}</strong> ${n(s.companies)}</span>`)}
              </div>
            </${Section}>

            <!-- 3. Spot check: Ezdan -->
            <${Section} title="Spot check — “Ezdan”" sub="should be one canonical carrying every source tag">
              ${(data.spot_check?.ezdan || []).length === 0
                ? html`<div class="muted small">No companies match “ezdan”.</div>`
                : html`<table class="audit-table">
                    <thead><tr><th>Name</th><th>Status</th><th>Sources</th><th>→ canonical</th></tr></thead>
                    <tbody>
                      ${data.spot_check.ezdan.map(r => html`<tr key=${r.id}>
                        <td>${r.name}</td>
                        <td><span class=${'audit-status ' + r.merge_status}>${r.merge_status}</span></td>
                        <td>${(r.sources || []).join(' · ') || html`<span class="muted">—</span>`}</td>
                        <td class="muted small">${r.canonical_id ?? '—'}</td>
                      </tr>`)}
                    </tbody>
                  </table>`}
            </${Section}>

            <!-- 4. Under-merge -->
            <${Section} title="Held for review — same name, different identity"
                        sub=${`${n(data.under_merge?.duplicate_names?.group_count)} groups · share the engine's name key but have differing LinkedIn/website, so auto-merge was held back for your approval (Dedup Queue)`}>
              ${renderGroups(data.under_merge?.duplicate_names?.samples, false)}
            </${Section}>

            <${Section} title="Held for review — same registration # (within one source)"
                        sub=${`${n(data.under_merge?.duplicate_registrations?.group_count)} groups · same registry, different names → admin approval (Dedup Queue), per policy`}>
              ${renderGroups(data.under_merge?.duplicate_registrations?.samples, true)}
            </${Section}>

            <!-- 5. Over-merge -->
            <${Section} title="Possible over-merges — same source twice"
                        sub=${`${n(data.over_merge?.same_source_multiplicity?.canonical_count)} canonicals hold ≥2 records from one source (could be branches)`}>
              ${(data.over_merge?.same_source_multiplicity?.samples || []).length === 0
                ? html`<div class="muted small">None.</div>`
                : html`<table class="audit-table">
                    <thead><tr><th>Canonical</th><th>Source</th><th># records</th></tr></thead>
                    <tbody>
                      ${data.over_merge.same_source_multiplicity.samples.map((r, i) => html`<tr key=${i}>
                        <td>${r.name}</td><td><strong>${r.source}</strong></td><td>${r.records}</td>
                      </tr>`)}
                    </tbody>
                  </table>`}
            </${Section}>

            <${Section} title="Largest merge clusters" sub="eyeball for a generic name that swallowed too much">
              ${(data.over_merge?.biggest_clusters || []).length === 0
                ? html`<div class="muted small">No merges yet.</div>`
                : html`<table class="audit-table">
                    <thead><tr><th>Canonical</th><th>Members merged</th><th>Sources</th></tr></thead>
                    <tbody>
                      ${data.over_merge.biggest_clusters.map(r => html`<tr key=${r.id}>
                        <td>${r.name || html`<span class="muted">—</span>`}</td>
                        <td>${n(r.merged_members)}</td>
                        <td>${(r.sources || []).join(' · ')}</td>
                      </tr>`)}
                    </tbody>
                  </table>`}
            </${Section}>
          ` : null}
        </div>
      </div>
    </div>
  `;
}

// Render a list of "same key" groups (name or reg). withRegs shows source + reg.
function renderGroups(samples, withRegs) {
  if (!samples || samples.length === 0) return html`<div class="muted small">None found — clean.</div>`;
  return html`<table class="audit-table">
    <thead><tr><th>#</th>${withRegs ? html`<th>Source</th>` : null}<th>Names sharing this ${withRegs ? 'registration' : 'name'}</th>${withRegs ? html`<th>Reg values</th>` : null}</tr></thead>
    <tbody>
      ${samples.map((g, i) => html`<tr key=${i}>
        <td>${g.c}</td>
        ${withRegs ? html`<td><strong>${g.source}</strong></td>` : null}
        <td>${(g.names || []).join('  ·  ')}</td>
        ${withRegs ? html`<td class="muted small">${[...new Set(g.regs || [])].join(', ')}</td>` : null}
      </tr>`)}
    </tbody>
  </table>`;
}
