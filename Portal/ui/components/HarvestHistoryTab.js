// Harvest History — browse every past local-engine run (the automatic Harvest
// Sweep, the manual "Engines 1–3 on selected" run, and individual engine
// stages) with at-a-glance results. Reads persisted job_runs, so history
// survives Portal restarts. Click any run to re-open its full log.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { JobLogPanel } from './JobLogPanel.js';

// Friendly label for each job_runs.source we surface here.
const SOURCE_LABEL = {
  harvest_sweep: 'Harvest Sweep (auto)',
  local_engines: 'Engines 1–3 (selected)',
  manual_lookup: 'Manual Lookup',
  stage8: 'Engine 1 · Find Website',
  stage7: 'Engine 2 · Harvest Site',
  stage9: 'Engine 3 · Map Network',
};

function statusPill(status) {
  const color =
    status === 'completed' ? 'var(--green, #6fcf97)' :
    status === 'failed'    ? 'var(--red, #ff6b6b)'   :
    'var(--accent, #5b8cff)';
  return html`<span class="pill" style=${{ borderColor: color, color }}>${status}</span>`;
}

function formatDuration(start, end) {
  if (!start) return '—';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = Math.max(0, e - s);
  if (ms < 1000)      return ms + 'ms';
  if (ms < 60_000)    return (ms / 1000).toFixed(1) + 's';
  if (ms < 3_600_000) return Math.floor(ms / 60_000) + 'm ' + Math.floor((ms % 60_000) / 1000) + 's';
  return Math.floor(ms / 3_600_000) + 'h ' + Math.floor((ms % 3_600_000) / 60_000) + 'm';
}

// Pull the headline numbers out of a run's stored result, shaped per source.
function resultChips(source, r) {
  if (!r || typeof r !== 'object') return [];
  const chips = [];
  const add = (label, val, tone) => { if (val != null) chips.push({ label, val, tone }); };

  if (source === 'harvest_sweep' || source === 'local_engines') {
    add('found', r.found, 'good');
    add('harvested', r.harvested, 'good');
    add('mapped', r.mapped, 'good');
    if (source === 'local_engines') add('selected', r.selected);
    if (r.find_left != null)    add('to find', r.find_left, 'dim');
    if (r.harvest_left != null) add('to harvest', r.harvest_left, 'dim');
    if (r.map_left != null)     add('to map', r.map_left, 'dim');
  } else {
    // individual engine stage run
    add('done', r.done, 'good');
    if (r.no_data) add('no data', r.no_data, 'dim');
    if (r.failed)  add('failed', r.failed, 'bad');
    add('total', r.total, 'dim');
  }
  return chips;
}

const TONE_COLOR = {
  good: 'var(--green, #6fcf97)',
  bad:  'var(--red, #ff6b6b)',
  dim:  'var(--text-dim)',
};

export function HarvestHistoryTab() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [openJob, setOpenJob] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.harvestHistory(80); setRows(r.rows || []); }
    catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const openLog = (row) => setOpenJob({
    id: row.id,
    title: (SOURCE_LABEL[row.source] || row.source) + ' · ' + (row.started_at ? new Date(row.started_at).toLocaleString() : ''),
    kind: 'jobRun',
  });

  return html`
    <div class="dr-shell">
      <div class="grid-toolbar">
        <strong>Harvest History</strong>
        <span class="muted small">every local-engine run · results survive restarts · click a run to open its log</span>
        <span class="spacer"></span>
        <button onClick=${load} disabled=${loading}>Refresh</button>
      </div>

      ${loading
        ? html`<div class="empty">Loading…</div>`
        : (rows.length === 0
            ? html`<div class="empty">No harvest runs yet. Run a Harvest Sweep or "Engines 1–3" on some companies and they'll show up here.</div>`
            : html`<div class="dr-list">
                ${rows.map(r => {
                  const chips = resultChips(r.source, r.result);
                  return html`
                    <div class="dr-card" key=${r.id} onClick=${() => openLog(r)} style=${{ cursor: 'pointer' }} title="Open the full log for this run">
                      <div class="dr-card-head">
                        <div>
                          <strong>${SOURCE_LABEL[r.source] || r.source}</strong>
                          <div class="muted small">
                            ${r.started_at ? new Date(r.started_at).toLocaleString() : '—'}
                            · ${formatDuration(r.started_at, r.completed_at)}
                            · ${(r.total_messages ?? 0).toLocaleString()} log lines
                            ${r.triggered_by ? ' · ' + r.triggered_by : ''}
                          </div>
                        </div>
                        ${statusPill(r.status)}
                      </div>
                      <div class="dr-note" style=${{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
                        ${r.error
                          ? html`<span style=${{ color: 'var(--red)' }}>${r.error}</span>`
                          : (chips.length
                              ? chips.map(c => html`
                                  <span key=${c.label} class="request-pill" style=${{ borderColor: TONE_COLOR[c.tone] || 'var(--border)', color: TONE_COLOR[c.tone] || 'var(--text)' }}>
                                    ${c.label}: <strong>${Number(c.val).toLocaleString()}</strong>
                                  </span>`)
                              : html`<span class="muted small">no summary recorded</span>`)}
                      </div>
                    </div>
                  `;
                })}
              </div>`)}

      ${openJob ? html`<${JobLogPanel}
        title=${openJob.title}
        jobId=${openJob.id}
        kind=${openJob.kind}
        onClose=${() => setOpenJob(null)}
        onComplete=${() => {}}
      />` : null}
    </div>
  `;
}
