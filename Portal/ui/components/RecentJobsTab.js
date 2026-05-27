// Recent Jobs — browse persisted job_runs (migration 007).
// Each row is a past background job (ingest / scrape / enrichment / assembly).
// Click any row to re-open its full log in the JobLogPanel.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { JobLogPanel } from './JobLogPanel.js';

const KIND_OPTIONS = [
  { value: '',           label: 'All kinds' },
  { value: 'assembly',   label: 'Assembly' },
  { value: 'enrichment', label: 'Enrichment' },
  { value: 'ingest',     label: 'Ingest' },
  { value: 'scrape',     label: 'Scrape' },
];

function statusPill(status) {
  const color =
    status === 'completed' ? 'var(--green, #6fcf97)' :
    status === 'failed'    ? 'var(--red, #ff6b6b)'   :
    'var(--accent, #5b8cff)';
  return html`<span class="pill" style=${{borderColor:color, color}}>${status}</span>`;
}

function formatDuration(start, end) {
  if (!start) return '—';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const ms = Math.max(0, e - s);
  if (ms < 1000)        return ms + 'ms';
  if (ms < 60_000)      return (ms / 1000).toFixed(1) + 's';
  if (ms < 3_600_000)   return Math.floor(ms / 60_000) + 'm ' + Math.floor((ms % 60_000) / 1000) + 's';
  return Math.floor(ms / 3_600_000) + 'h ' + Math.floor((ms % 3_600_000) / 60_000) + 'm';
}

function summarizeResult(r) {
  if (!r) return '';
  if (typeof r !== 'object') return String(r);
  const bits = [];
  if (typeof r.done       === 'number') bits.push(`done ${r.done}`);
  if (typeof r.no_data    === 'number' && r.no_data    > 0) bits.push(`no_data ${r.no_data}`);
  if (typeof r.failed     === 'number' && r.failed     > 0) bits.push(`failed ${r.failed}`);
  if (typeof r.queued     === 'number') bits.push(`queued ${r.queued}`);
  if (typeof r.auto_merged === 'number') bits.push(`auto-merged ${r.auto_merged}`);
  if (r.cluster_pre_merge?.rows_absorbed) bits.push(`absorbed ${r.cluster_pre_merge.rows_absorbed}`);
  if (typeof r.inserted   === 'number') bits.push(`inserted ${r.inserted}`);
  if (typeof r.updated    === 'number') bits.push(`updated ${r.updated}`);
  if (typeof r.usd        === 'number' && r.usd > 0) bits.push('$' + r.usd.toFixed(4));
  return bits.join(' · ');
}

export function RecentJobsTab() {
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [kind, setKind]       = useState('');
  const [openJob, setOpenJob] = useState(null);     // { id, title } for the JobLogPanel

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.jobRuns({ kind, limit: 100 });
      setRows(r.rows || []);
    } catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, [kind]);

  useEffect(() => { load(); }, [load]);

  const openLog = (row) => {
    const title = `${row.kind} · ${row.source || '—'}`;
    // 'jobRun' kind tells JobLogPanel to use the unified /api/job-runs/:id
    // endpoint which auto-falls-back to the persisted row.
    setOpenJob({ id: row.id, title, kind: 'jobRun' });
  };

  return html`
    <div class="dedup-shell">
      <div class="dedup-header">
        <div class="dedup-header-stats">
          <span><strong>${rows.length.toLocaleString()}</strong> recent</span>
          <span class="muted small"> · click any row to re-open its full log</span>
        </div>
        <div class="dedup-header-actions">
          <select value=${kind} onChange=${(e) => setKind(e.target.value)} style=${{padding:'5px 8px', borderRadius:'5px', background:'var(--bg-elev-2)', color:'var(--text)', border:'1px solid var(--border)', fontSize:'12px'}}>
            ${KIND_OPTIONS.map(o => html`<option key=${o.value} value=${o.value}>${o.label}</option>`)}
          </select>
          <button onClick=${load} disabled=${loading}>Refresh</button>
        </div>
      </div>

      <div class="dedup-list-wrap">
        ${loading ? html`<div class="dedup-list-empty">Loading…</div>` : null}
        ${!loading && rows.length === 0 ? html`
          <div class="dedup-list-empty">
            No persisted job runs yet.<br/>
            <span class="muted small">Anything you Run from a button (Assembly, Enrichment, Scrape, Ingest) will appear here when it finishes.</span>
          </div>
        ` : null}
        ${rows.length > 0 ? html`
          <table class="grid" style=${{margin:0}}>
            <colgroup>
              <col style=${{width:'120px'}}/>
              <col style=${{width:'90px'}}/>
              <col />
              <col style=${{width:'140px'}}/>
              <col style=${{width:'80px'}}/>
              <col style=${{width:'80px'}}/>
              <col />
            </colgroup>
            <thead>
              <tr>
                <th>Kind</th>
                <th>Source</th>
                <th>Started</th>
                <th>Duration</th>
                <th>Status</th>
                <th>Lines</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              ${rows.map(r => html`
                <tr key=${r.id} class="person-row" onClick=${() => openLog(r)} title="Open the full log for this run">
                  <td>${r.kind}</td>
                  <td>${r.source || '—'}</td>
                  <td class="muted small">${r.started_at ? new Date(r.started_at).toLocaleString() : '—'}</td>
                  <td class="muted small">${formatDuration(r.started_at, r.completed_at)}</td>
                  <td>${statusPill(r.status)}</td>
                  <td class="muted small">${(r.total_messages ?? 0).toLocaleString()}</td>
                  <td class="muted small">${r.error ? html`<span style=${{color:'var(--red)'}}>${r.error}</span>` : summarizeResult(r.result)}</td>
                </tr>
              `)}
            </tbody>
          </table>
        ` : null}
      </div>

      ${openJob ? html`<${JobLogPanel}
        title=${openJob.title}
        jobId=${openJob.id}
        kind=${openJob.kind}
        onClose=${() => setOpenJob(null)}
        onComplete=${() => { /* persisted jobs are already complete */ }}
      />` : null}
    </div>
  `;
}
