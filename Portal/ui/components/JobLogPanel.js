// Shared floating log panel for ingest + scrape + enrichment jobs.
// Polls the job endpoint, streams new messages, calls onClose when dismissed.

import { useEffect, useRef, useState } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';

export function JobLogPanel({ title, jobId, kind = 'enrichment', onClose, onComplete }) {
  const [job, setJob] = useState({ id: jobId, status: 'running', messages: [], result: null, error: null });
  const logRef = useRef(null);
  const cancelRef = useRef(false);

  useEffect(() => {
    cancelRef.current = false;
    let lastIndex = 0;
    let timer = null;

    // `jobRun` → unified /api/job-runs/:id (auto-falls-back to persisted row).
    // `enrichment` / `sources` (default) → live in-memory job routes.
    const fetcher =
      kind === 'jobRun'     ? api.jobRun       :
      kind === 'enrichment' ? api.enrichmentJob :
                              api.sourceJob;

    const tick = async () => {
      try {
        const j = await fetcher(jobId, lastIndex);
        if (cancelRef.current) return;
        lastIndex = j.total_messages;
        setJob(prev => ({
          ...prev,
          status: j.status,
          completed_at: j.completed_at,
          result: j.result,
          error: j.error,
          messages: [...prev.messages, ...j.messages],
        }));
        if (j.status !== 'running') {
          onComplete?.(j);
          return;
        }
      } catch (err) {
        // keep polling — server may be busy
      }
      if (!cancelRef.current) timer = setTimeout(tick, 800);
    };
    tick();

    return () => {
      cancelRef.current = true;
      clearTimeout(timer);
    };
  }, [jobId, kind]);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [job.messages?.length]);

  return html`
    <div class="job-log">
      <div class="job-log-head">
        <strong>${title}</strong>
        <span class="muted">· ${job.status}</span>
        <span class="spacer"></span>
        ${job.result ? html`<span class="muted">${formatResult(job.result)}</span>` : null}
        ${job.error ? html`<span style=${{color:'var(--red)'}}>${job.error}</span>` : null}
        <button class="linkbtn" onClick=${onClose}>close</button>
      </div>
      <div class="job-log-body" ref=${logRef}>
        ${(job.messages || []).map((m, i) => html`
          <div class="log-line" key=${i}>
            <span class="ts">${new Date(m.ts).toLocaleTimeString()}</span>
            <span>${m.message}</span>
          </div>
        `)}
        ${(job.messages || []).length === 0 ? html`<div class="log-line muted">waiting for output…</div>` : null}
      </div>
    </div>
  `;
}

function formatResult(r) {
  if (r.inserted !== undefined) {
    return `inserted ${(r.inserted ?? 0).toLocaleString()} · updated ${(r.updated ?? 0).toLocaleString()}`;
  }
  if (r.done !== undefined || r.no_data !== undefined || r.failed !== undefined) {
    const parts = [];
    if (r.done) parts.push(`✓ ${r.done}`);
    if (r.no_data) parts.push(`· ${r.no_data}`);
    if (r.failed) parts.push(`✗ ${r.failed}`);
    if (r.usd) parts.push(`$${Number(r.usd).toFixed(4)}`);
    return parts.join(' · ');
  }
  // Full enrichment shape
  if (r.stage1 || r.stage5) {
    const totals = ['stage1','stage2','stage3','stage4','stage5']
      .map(k => r[k]?.done || 0).reduce((a,b)=>a+b,0);
    return totals + ' enrichments done';
  }
  return '';
}
