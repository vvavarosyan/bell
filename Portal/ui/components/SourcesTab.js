import { useState, useEffect, useCallback, useRef } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

const SOURCE_DESCRIPTIONS = {
  QFZ:  { label: 'Qatar Free Zones',         url: 'https://qfz.gov.qa/investors/featured-investors/' },
  QFC:  { label: 'Qatar Financial Centre',   url: 'https://eservices.qfc.qa/QFCPublicRegister/PublicRegister.aspx' },
  MOCI: { label: 'Ministry of Commerce',     url: 'https://businessmap.moci.gov.qa' },
  QSTP: { label: 'Qatar Science & Tech Park',url: 'https://qstp.qa/directory/' },
  QSE:  { label: 'Qatar Stock Exchange',     url: 'https://www.qe.com.qa/listed-companies' },
  QCCI: { label: 'Qatar Chamber Directory',  url: 'https://www.qatarcid.com/' },
  MoPH: { label: 'Ministry of Public Health',url: 'https://www.moph.gov.qa/' },
  Tasmu: { label: 'TASMU Smart Qatar',       url: 'https://tasmu.gov.qa/' },
  CRA:  { label: 'CRA — ICT Companies',      url: 'https://www.cra.gov.qa/en/Services/ICT-Business/ICT-Business-List/ICT-Business-Directory' },
  MadeInQatar: { label: 'Made in Qatar',     url: 'https://www.madeinqatar.com.qa/exhibitor-directory-2023/' },
  QFCRA: { label: 'QFC Regulatory Authority',url: 'https://www.qfcra.com/public_registers/search-authorised-firms/' },
};

export function SourcesTab() {
  const [sources, setSources] = useState([]);
  const [activeJob, setActiveJob] = useState(null);   // { source, job }
  const pollRef = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api.sources();
      setSources(r.sources || []);
    } catch (err) {
      toast('Load failed: ' + err.message, 'error');
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 4000);
    return () => clearInterval(t);
  }, [refresh]);

  // Poll the active job (live log streaming)
  useEffect(() => {
    if (!activeJob) return;
    let cancelled = false;
    let lastIndex = 0;

    const tick = async () => {
      try {
        const j = await api.sourceJob(activeJob.job.id, lastIndex);
        if (cancelled) return;
        lastIndex = j.total_messages;
        setActiveJob(prev => prev ? {
          ...prev,
          job: {
            ...prev.job,
            status: j.status,
            completed_at: j.completed_at,
            result: j.result,
            error: j.error,
            messages: [...(prev.job.messages || []), ...j.messages],
          },
        } : null);
        if (j.status !== 'running') {
          refresh();
          return; // stop polling
        }
      } catch (err) {
        if (!cancelled) console.error(err);
      }
      if (!cancelled) pollRef.current = setTimeout(tick, 800);
    };
    tick();
    return () => { cancelled = true; clearTimeout(pollRef.current); };
  }, [activeJob?.job?.id, refresh]);

  const runIngest = async (source) => {
    try {
      const r = await api.startIngest(source);
      setActiveJob({ source, job: { id: r.job_id, status: 'running', messages: [] } });
      toast(`${source} ingest started`);
    } catch (err) { toast(err.message, 'error'); }
  };

  const runScrape = async (source) => {
    try {
      const r = await api.startScrape(source);
      setActiveJob({ source, job: { id: r.job_id, status: 'running', messages: [] } });
      toast(`${source} scrape started`);
    } catch (err) { toast(err.message, 'error'); }
  };

  return html`
    <div class="sources-wrap">
      <div class="sources-grid">
        ${sources.map(s => html`<${SourceCard}
          key=${s.source}
          state=${s}
          onIngest=${() => runIngest(s.source)}
          onScrape=${() => runScrape(s.source)}
          activeJob=${activeJob?.source === s.source ? activeJob.job : null}
        />`)}
      </div>

      ${activeJob ? html`<${JobLogPanel}
        source=${activeJob.source}
        job=${activeJob.job}
        onClose=${() => setActiveJob(null)}
      />` : null}
    </div>
  `;
}

function SourceCard({ state, onIngest, onScrape, activeJob }) {
  const desc = SOURCE_DESCRIPTIONS[state.source] || { label: state.source, url: '' };
  const sizeMB = state.latest_file ? (state.latest_file.size_bytes / 1048576).toFixed(2) : null;
  const lastFile = state.latest_file ? new Date(state.latest_file.mtime) : null;
  const lastIngest = state.db_last_ingest_at ? new Date(state.db_last_ingest_at) : null;
  const running = state.running_job;

  return html`
    <div class=${'source-card ' + (running ? 'is-running' : '')}>
      <div class="source-card-head">
        <div class="source-card-title">
          <strong>${state.source}</strong>
          <span class="muted">${desc.label}</span>
        </div>
        <a class="muted small" href=${desc.url} target="_blank" rel="noreferrer">source ↗</a>
      </div>

      <div class="source-card-body">
        <div class="source-stat">
          <div class="label">In database</div>
          <div class="value">${state.db_rows.toLocaleString()}</div>
          <div class="sub">${lastIngest ? 'last ingested ' + lastIngest.toLocaleString() : 'never ingested'}</div>
        </div>
        <div class="source-stat">
          <div class="label">Latest JSON</div>
          <div class="value">${sizeMB ? sizeMB + ' MB' : '—'}</div>
          <div class="sub">${lastFile ? 'scraped ' + lastFile.toLocaleString() : 'no scrape on disk'}</div>
        </div>
      </div>

      <div class="source-card-actions">
        <button onClick=${onScrape} disabled=${!!running}>
          ${running?.kind === 'scrape' ? 'Scraping…' : 'Run Scrape'}
        </button>
        <button onClick=${onIngest} disabled=${!!running || !state.latest_file}>
          ${running?.kind === 'ingest' ? 'Ingesting…' : 'Ingest Latest JSON →'}
        </button>
      </div>

      ${state.recent_jobs.length > 0 ? html`
        <div class="source-card-recent">
          ${state.recent_jobs.map(j => html`
            <div class=${'recent-job ' + j.status} key=${j.id}>
              <span class="kind">${j.kind}</span>
              <span class="status">${j.status}</span>
              <span class="summary">${j.summary || ''}</span>
              <span class="time muted">${new Date(j.started_at).toLocaleTimeString()}</span>
            </div>
          `)}
        </div>
      ` : null}
    </div>
  `;
}

function JobLogPanel({ source, job, onClose }) {
  const logRef = useRef(null);
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [job.messages?.length]);

  return html`
    <div class="job-log">
      <div class="job-log-head">
        <strong>${source}</strong>
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
    return `inserted ${r.inserted.toLocaleString()} · updated ${r.updated.toLocaleString()} · normalized ${r.normalized.toLocaleString()}/${r.raw_rows.toLocaleString()}`;
  }
  return JSON.stringify(r);
}
