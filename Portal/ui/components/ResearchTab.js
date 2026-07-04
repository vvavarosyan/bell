// Research tab — the "Console" surface.
// Phase R1: lists existing jobs as a card grid + empty-state CTA + New Research
// modal. Background-polls every 5s so when R2 wires Firecrawl Agent calls, this
// UI immediately reflects status transitions.

import { useCallback, useEffect, useState } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { navigateTo } from '../lib/router.js';
import { ResearchJobCard } from './ResearchJobCard.js';
import { NewResearchModal } from './NewResearchModal.js';

export function ResearchTab({ mode } = {}) {
  // Admin surfaces (admin.bell.qa + local) may see who requested each job.
  // The user portal must never see other tenants' jobs anyway, so the
  // requester line is only meaningful (and only shown) for admins.
  const isAdmin = mode !== 'user';
  const [jobs,        setJobs]        = useState([]);
  const [stats,       setStats]       = useState(null);
  const [loading,     setLoading]     = useState(true);
  const [showModal,   setShowModal]   = useState(false);
  const [openedJobId, setOpenedJobId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('');

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const params = {};
      if (statusFilter) params.status = statusFilter;
      const [j, s] = await Promise.all([
        api.researchJobs(params),
        api.researchStats(),
      ]);
      setJobs(j.rows || []);
      setStats(s);
    } catch (err) { if (!silent) toast('Load failed: ' + err.message, 'error'); }
    finally { if (!silent) setLoading(false); }
  }, [statusFilter]);

  useEffect(() => { load(); }, [load]);

  // Background poll so live status transitions surface without manual refresh.
  // 5s is generous — Firecrawl Agent runs take minutes; UI nudges are enough.
  useEffect(() => {
    const t = setInterval(() => load({ silent: true }), 5000);
    return () => clearInterval(t);
  }, [load]);

  const onCreated = ({ id }) => {
    load();
    if (id) setOpenedJobId(id);
  };

  const activeJobs = jobs.filter(j => ['queued','gathering','synthesizing'].includes(j.status));
  const sourcesToday   = stats?.sources_total || 0;
  const citationsToday = stats?.citations_total || 0;

  return html`
    <div class="page-fill">

      <!-- Console toolbar (flush) -->
      <div class="page-bar">
        <span style=${{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
          <span style=${{ position: 'relative', width: '10px', height: '10px' }}>
            <span style=${{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'rgba(91,140,255,0.5)',
              animation: 'pulse 1.6s infinite',
            }}></span>
            <span style=${{
              position: 'absolute', inset: '2px', borderRadius: '50%',
              background: 'var(--accent-bright)',
            }}></span>
          </span>
          <span style=${{
            fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.12em',
            color: 'var(--text-dim)', fontWeight: 700,
          }}>Research console · live</span>
        </span>
        <span style=${{ color: 'var(--text-dim)', fontSize: '11px' }}>·</span>
        <span style=${{ fontSize: '11.5px', color: 'var(--text-muted)' }}>
          <strong style=${{ color: 'var(--text)' }}>${activeJobs.length}</strong> active ·
          <strong style=${{ color: 'var(--text)' }}>${(stats?.jobs_total || 0).toLocaleString()}</strong> total ·
          <strong style=${{ color: 'var(--text)' }}>${sourcesToday.toLocaleString()}</strong> sources synthesized
        </span>
        <div style=${{ flex: 1 }}></div>

        <select
          value=${statusFilter}
          onChange=${(e) => setStatusFilter(e.target.value)}
          style=${{
            background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)',
            color: 'var(--text)', padding: '6px 10px', borderRadius: '6px',
            fontSize: '12px',
          }}
        >
          <option value="">All statuses</option>
          <option value="queued">Queued</option>
          <option value="gathering">Gathering</option>
          <option value="synthesizing">Synthesizing</option>
          <option value="ready">Ready</option>
          <option value="failed">Failed</option>
        </select>

        <button
          onClick=${() => setShowModal(true)}
          style=${{
            background: 'var(--accent)',
            border: '1px solid var(--accent)',
            color: '#fff',
            padding: '8px 16px', borderRadius: '8px',
            cursor: 'pointer', fontSize: '12.5px', fontWeight: 600,
            boxShadow: '0 4px 14px rgba(91,140,255,0.35)',
          }}
        >+ Start a deep research</button>
      </div>

      <div class="page-scroll">
      <!-- Body: grid or empty state -->
      ${loading ? html`
        <div style=${{ color: 'var(--text-dim)', textAlign: 'center', padding: '60px 0', fontSize: '12px' }}>
          Loading research jobs…
        </div>
      ` : jobs.length === 0 ? html`<${EmptyState} onStart=${() => setShowModal(true)} />` : html`
        <div style=${{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(310px, 1fr))',
          gap: '14px',
        }}>
          ${jobs.map(j => html`
            <${ResearchJobCard}
              key=${j.id}
              job=${j}
              isAdmin=${isAdmin}
              onOpen=${(job) => setOpenedJobId(job.id)}
              onDelete=${async (job) => {
                try {
                  await api.deleteResearchJob(job.id);
                  if (openedJobId === job.id) setOpenedJobId(null);
                  toast('Research deleted');
                  load({ silent: true });
                } catch (err) { toast('Delete failed: ' + err.message, 'error'); }
              }}
            />
          `)}
        </div>
      `}

      <!-- Job detail drawer (R1 placeholder — R2 will fill in) -->
      ${openedJobId ? html`<${JobDetailDrawer}
        jobId=${openedJobId}
        isAdmin=${isAdmin}
        onClose=${() => setOpenedJobId(null)}
      />` : null}

      ${showModal ? html`<${NewResearchModal}
        onClose=${() => setShowModal(false)}
        onCreated=${onCreated}
      />` : null}
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Empty state — the visitor sees the product promise even before any job exists
// ---------------------------------------------------------------------------
function EmptyState({ onStart }) {
  return html`
    <div style=${{
      maxWidth: '720px', margin: '40px auto 0',
      background: 'linear-gradient(180deg, rgba(19,24,41,.96) 0%, rgba(13,18,35,.96) 100%)',
      border: '1px solid var(--border)',
      borderRadius: '16px',
      padding: '40px 36px',
      textAlign: 'center',
    }}>
      <div style=${{
        width: '64px', height: '64px',
        margin: '0 auto 18px',
        borderRadius: '14px',
        background: 'linear-gradient(135deg, rgb(91 140 255) 0%, rgb(165 195 255) 100%)',
        boxShadow: '0 12px 32px -8px rgba(91,140,255,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '28px',
      }}>◎</div>
      <div style=${{
        fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.14em',
        color: 'var(--text-dim)', fontWeight: 700, marginBottom: '10px',
      }}>Research console</div>
      <div style=${{ fontSize: '22px', fontWeight: 600, color: 'var(--text)', marginBottom: '14px', lineHeight: 1.2 }}>
        Deep research, on demand. Cited.
      </div>
      <p style=${{ color: 'var(--text-muted)', fontSize: '13.5px', lineHeight: '1.55', maxWidth: '520px', margin: '0 auto 22px' }}>
        Pick a company, write a one-sentence brief, click Run. Bella deploys research
        agents in parallel and ships a structured, fully-cited report in about
        15 minutes — with every new fact folded back into Bell.
      </p>
      <button
        onClick=${onStart}
        style=${{
          background: 'var(--accent)', border: '1px solid var(--accent)',
          color: '#fff', padding: '10px 22px', borderRadius: '8px',
          cursor: 'pointer', fontSize: '13px', fontWeight: 600,
          boxShadow: '0 6px 20px rgba(91,140,255,0.4)',
        }}
      >Start a deep research →</button>

      <div style=${{
        marginTop: '32px', paddingTop: '22px',
        borderTop: '1px solid rgba(255,255,255,0.06)',
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px',
        fontSize: '11.5px', color: 'var(--text-muted)', textAlign: 'left',
      }}>
        <div>
          <div style=${{ color: 'var(--accent-bright)', fontWeight: 700, marginBottom: '4px' }}>Six types</div>
          Company, person, sector, theme, region, regulation.
        </div>
        <div>
          <div style=${{ color: 'var(--accent-bright)', fontWeight: 700, marginBottom: '4px' }}>Every claim cited</div>
          Sources preserved end-to-end. Provenance through to export.
        </div>
        <div>
          <div style=${{ color: 'var(--accent-bright)', fontWeight: 700, marginBottom: '4px' }}>Snowball</div>
          Every new Qatari company or person found gets added to Bell.
        </div>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Job detail drawer — R2 live report viewer. Polls while in flight and
// renders the structured report + sources + derived entities once ready.
// ---------------------------------------------------------------------------
function JobDetailDrawer({ jobId, isAdmin, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const r = await api.researchJob(jobId);
      setData(r);
    } catch (err) { if (!silent) toast('Could not load job: ' + err.message, 'error'); }
    finally { if (!silent) setLoading(false); }
  }, [jobId]);

  useEffect(() => { load(); }, [load]);

  // While in flight, refresh more aggressively (every 4s) so users see the
  // sections/sources/citations counts climb and the report appear.
  useEffect(() => {
    const status = data?.job?.status;
    if (!status || ['ready','failed','cancelled'].includes(status)) return;
    const t = setInterval(() => load({ silent: true }), 4000);
    return () => clearInterval(t);
  }, [data?.job?.status, load]);

  const job     = data?.job;
  const report  = data?.report;
  const sources = data?.sources || [];
  const derived = data?.derived || [];

  return html`
    <div onClick=${onClose} style=${{
      position: 'fixed', inset: 0, zIndex: 90,
      background: 'rgba(6,9,17,0.55)',
      display: 'flex', justifyContent: 'flex-end',
    }}>
      <div onClick=${(e) => e.stopPropagation()} style=${{
        width: 'min(820px, 96vw)',
        height: '100%',
        background: 'linear-gradient(180deg, #131826 0%, #0e1322 100%)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-24px 0 64px rgba(0,0,0,0.5)',
        overflowY: 'auto',
      }}>
        <!-- Header -->
        <div style=${{
          padding: '16px 22px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          position: 'sticky', top: 0, zIndex: 2,
          background: 'linear-gradient(180deg, #131826 0%, rgba(19,24,38,0.94) 100%)',
          backdropFilter: 'blur(6px)',
        }}>
          <div style=${{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0 }}>
            <div style=${{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap' }}>
              Research job ${'#' + jobId}
            </div>
            ${job ? html`<${StatusPill} status=${job.status} eta=${job.eta_seconds} />` : null}
          </div>
          <button onClick=${onClose} style=${{
            background: 'transparent', border: '1px solid var(--border)',
            color: 'var(--text-muted)', width: '28px', height: '28px',
            borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
          }}>✕</button>
        </div>

        <div style=${{ padding: '20px 24px' }}>
          ${loading ? html`<div style=${{ color: 'var(--text-dim)', fontSize: '12px' }}>Loading…</div>` :
            !job ? html`<div style=${{ color: 'var(--text-dim)', fontSize: '12px' }}>Not found.</div>` : html`

            <!-- Brief + target panel -->
            <${BriefPanel} job=${job} isAdmin=${isAdmin} />

            <!-- Live counters strip -->
            <${CountersStrip} job=${job} sourcesLen=${sources.length} />

            <!-- Failure surface -->
            ${job.status === 'failed' && job.error_message ? html`
              <div style=${{
                marginTop: '18px',
                padding: '14px',
                background: 'rgba(232,142,168,0.08)',
                border: '1px solid rgba(232,142,168,0.32)',
                borderRadius: '10px',
                fontSize: '12.5px', color: 'rgb(232 142 168)',
              }}>
                <div style=${{ fontWeight: 700, marginBottom: '4px' }}>Research failed</div>
                <div style=${{ color: 'var(--text-muted)' }}>${job.error_message}</div>
                ${job.error_detail ? html`<div style=${{ marginTop: '6px', fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--mono, monospace)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>admin · ${job.error_detail}</div>` : null}
                <button
                  onClick=${() => retryJob(job.id, load)}
                  style=${{
                    marginTop: '10px',
                    background: 'transparent', border: '1px solid rgba(232,142,168,0.45)',
                    color: 'rgb(232 142 168)', padding: '6px 12px', borderRadius: '6px',
                    fontSize: '11.5px', cursor: 'pointer',
                  }}
                >Retry</button>
              </div>
            ` : null}

            <!-- In-flight: the live multi-agent panel -->
            ${['queued','gathering','synthesizing'].includes(job.status) ? html`<${LiveAgentsPanel}
              status=${job.status}
              sourcesLen=${sources.length}
              started=${job.started_at}
              eta=${job.eta_seconds}
            />` : null}

            <!-- Sources discovered so far (live) -->
            ${sources.length > 0 ? html`<${SourcesPanel} sources=${sources} />` : null}

            <!-- The report itself -->
            ${report && Array.isArray(report.sections) && report.sections.length > 0
              ? html`<${ReportViewer} report=${report} sources=${sources} />`
              : (job.status === 'ready' ? html`<${EmptyReportDebug} job=${job} report=${report} onRetry=${() => retryJob(job.id, load)} />` : null)}

            <!-- Publish status (ready jobs). Research auto-publishes for
                 everyone — anonymized — to Market Feed + bell.qa/research. -->
            ${job.status === 'ready' ? html`<${FeedReleasePanel} job=${job} />` : null}

            <!-- Snowball: what got fed back into Bell -->
            ${derived.length > 0 ? html`<${DerivedEntitiesPanel} derived=${derived} />` : null}
          `}
        </div>
      </div>
    </div>
  `;
}

// ── Subcomponents ─────────────────────────────────────────────────────────

function StatusPill({ status, eta }) {
  const META = {
    queued:        { label: 'Queued',       color: 'rgb(165 195 255)' },
    gathering:     { label: 'Gathering',    color: 'rgb(165 195 255)' },
    synthesizing: { label: 'Synthesizing', color: 'rgb(255 196 99)'  },
    ready:         { label: 'Ready',        color: 'rgb(111 207 151)' },
    failed:        { label: 'Failed',       color: 'rgb(232 142 168)' },
    cancelled:     { label: 'Cancelled',    color: 'rgb(140 140 140)' },
  };
  const m = META[status] || META.queued;
  const etaTxt = (['gathering','synthesizing'].includes(status) && eta)
    ? ` · ~${Math.round(eta / 60)} min left` : '';
  return html`<span style=${{
    display: 'inline-flex', alignItems: 'center', gap: '6px',
    padding: '3px 9px',
    fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
    borderRadius: '999px',
    color: m.color,
    background: m.color.replace('rgb', 'rgba').replace(')', ' / 0.12)'),
    border: '1px solid ' + m.color.replace('rgb', 'rgba').replace(')', ' / 0.32)'),
  }}>
    <span style=${{ width: '5px', height: '5px', borderRadius: '50%', background: m.color }}></span>
    ${m.label}${etaTxt}
  </span>`;
}

function BriefPanel({ job, isAdmin }) {
  return html`<div style=${{ marginBottom: '18px' }}>
    <div style=${{
      fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em',
      color: 'var(--text-dim)', fontWeight: 700, marginBottom: '6px',
    }}>${job.type} · target</div>
    ${isAdmin && job.created_by ? html`<div style=${{
      fontSize: '11px', color: 'var(--text-dim)', marginBottom: '8px',
    }}>requested by <span style=${{ color: 'var(--text-muted)', fontWeight: 600 }}>${job.created_by}</span></div>` : null}
    <div style=${{ fontSize: '14px', color: 'var(--text)', marginBottom: '12px' }}>
      ${job.target_company_name || job.target_person_name || job.target_label || '—'}
      ${job.target_company_bin ? html` <span style=${{ color: 'var(--text-dim)', fontSize: '11.5px', marginLeft: '6px' }}>${job.target_company_bin}</span>` : null}
    </div>
    <div style=${{
      fontSize: '13px', color: 'var(--text)',
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      padding: '12px 14px',
      fontStyle: 'italic',
      lineHeight: 1.55,
    }}>"${job.brief}"</div>
  </div>`;
}

function CountersStrip({ job, sourcesLen }) {
  const items = [
    { label: 'Sources',   value: Math.max(job.source_count || 0, sourcesLen) },
    { label: 'Sections',  value: job.section_count  || 0 },
    { label: 'Citations', value: job.citation_count || 0 },
    { label: 'Agent(s)',  value: job.agent_count    || 1 },
  ];
  return html`<div style=${{
    display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '8px',
    marginBottom: '18px',
  }}>
    ${items.map(m => html`<div key=${m.label} style=${{
      padding: '10px 12px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      textAlign: 'center',
    }}>
      <div style=${{
        fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.08em',
        color: 'var(--text-dim)', fontWeight: 700,
      }}>${m.label}</div>
      <div style=${{ fontSize: '16px', fontWeight: 600, color: 'var(--text)', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
        ${m.value > 0 ? m.value.toLocaleString() : '—'}
      </div>
    </div>`)}
  </div>`;
}

// ---------------------------------------------------------------------------
// LiveAgentsPanel — console-style status board, deliberately quiet.
// Five agent rows show their working state in monospace; one slow pulse on
// the header dot is the only animation. No shimmers, no scan grids, no
// color cycling. Reads like a build log — fits BDI's information-density
// aesthetic.
// ---------------------------------------------------------------------------
function LiveAgentsPanel({ status, sourcesLen, started, eta }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!started) return;
    const t0 = new Date(started).getTime();
    const id = setInterval(() => setElapsed(Math.floor((Date.now() - t0) / 1000)), 1000);
    setElapsed(Math.floor((Date.now() - t0) / 1000));
    return () => clearInterval(id);
  }, [started]);

  const phaseMsg = status === 'queued'
    ? 'Queued · agents about to deploy'
    : status === 'gathering'
      ? 'Five agents are working in parallel — scanning, extracting, and cross-checking the evidence.'
      : 'Sources gathered. Synthesizing into the structured, cited report.';

  // ETA overrun handling: only show the countdown while still credible
  // (elapsed < estimate). Past that, switch to a neutral "running longer
  // than estimated" message and stop pretending to know when it'll finish.
  const overrun = eta && elapsed > eta;
  const etaText = !eta
    ? '—'
    : overrun
      ? 'longer than expected'
      : `~${Math.max(1, Math.round((eta - elapsed) / 60))} min left`;

  const AGENT_LANES = [
    { id: 'scan',      label: 'General scan',        detail: 'Discovery · entities · footprint' },
    { id: 'financial', label: 'Financials',          detail: 'Revenue · funding · ownership' },
    { id: 'people',    label: 'Leadership & people', detail: 'Executives · board · key roles' },
    { id: 'network',   label: 'Relationships',       detail: 'Partners · subsidiaries · deals' },
    { id: 'signals',   label: 'News & signals',      detail: 'Press · events · recent moves' },
  ];

  // Synthesize per-agent state from elapsed time + actual source count.
  // States: pending → scanning → indexing → done.
  // While gathering: agents rotate through scanning/indexing in a stable
  // (deterministic-from-elapsed) way so the panel feels alive without
  // pretending to know more than it does.
  // While synthesizing: all agents flip to 'done'.
  const agentStates = AGENT_LANES.map((lane, i) => {
    if (status === 'synthesizing') return { state: 'done',     text: 'Indexed' };
    if (status === 'queued')       return { state: 'pending',  text: 'Queued'  };
    // Stagger so each agent appears slightly out of phase
    const phase = (elapsed + i * 7) % 12;
    if (phase < 4) return { state: 'scanning', text: 'Scanning' };
    if (phase < 8) return { state: 'reading',  text: 'Reading'  };
    return            { state: 'indexed',  text: 'Indexed'  };
  });

  return html`
    <style>
      @keyframes bdiSoftPulse {
        0%, 100% { opacity: .55; }
        50%      { opacity: 1;   }
      }
    </style>

    <div style=${{
      marginBottom: '20px',
      padding: '14px 16px 12px',
      background: '#0f1422',
      border: '1px solid var(--border)',
      borderRadius: '10px',
    }}>
      <!-- header -->
      <div style=${{
        display: 'flex', alignItems: 'center', gap: '10px',
        paddingBottom: '12px', marginBottom: '12px',
        borderBottom: '1px solid var(--border)',
      }}>
        <span style=${{
          width: '7px', height: '7px', borderRadius: '50%',
          background: status === 'synthesizing' ? 'var(--amber)' : 'var(--accent-bright)',
          animation: 'bdiSoftPulse 2.4s ease-in-out infinite',
          flexShrink: 0,
        }}></span>
        <span style=${{
          fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.14em',
          color: 'var(--text-dim)', fontWeight: 700,
        }}>Bella · ${status === 'synthesizing' ? 'synthesizing' : status === 'queued' ? 'queued' : 'researching'}</span>
        <span style=${{ flex: 1 }}></span>
        <span style=${{
          fontFamily: 'ui-monospace, SFMono-Regular, monospace',
          fontSize: '10.5px', color: 'var(--text-muted)',
        }}>${formatDuration(elapsed)} elapsed</span>
      </div>

      <!-- phase line -->
      <div style=${{
        fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.5,
        marginBottom: '12px',
      }}>${phaseMsg}</div>

      <!-- agent rows -->
      <div style=${{ display: 'flex', flexDirection: 'column' }}>
        ${AGENT_LANES.map((lane, i) => html`<${AgentRow}
          key=${lane.id}
          lane=${lane}
          index=${i}
          state=${agentStates[i]}
          first=${i === 0}
        />`)}
      </div>

      <!-- footer counters -->
      <div style=${{
        marginTop: '12px',
        paddingTop: '10px',
        borderTop: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '8px',
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: '10.5px', color: 'var(--text-muted)',
      }}>
        <span>Sources <strong style=${{ color: 'var(--text)' }}>${sourcesLen.toLocaleString()}</strong></span>
        <span>Elapsed <strong style=${{ color: 'var(--text)' }}>${formatDuration(elapsed)}</strong></span>
        <span style=${{ color: overrun ? 'var(--amber)' : 'var(--text-muted)' }}>
          ${overrun ? 'Running ' : 'Estimated '}<strong style=${{ color: overrun ? 'var(--amber)' : 'var(--text)' }}>${etaText}</strong>
        </span>
      </div>
    </div>
  `;
}

function AgentRow({ lane, index, state, first }) {
  // Single muted dot color. State conveyed by the status text + dot opacity.
  const stateColor = state.state === 'done'     ? 'var(--green)' :
                     state.state === 'pending'  ? 'var(--text-dim)' :
                     'var(--accent-bright)';
  const stateOpacity = state.state === 'pending' ? 0.4 :
                       state.state === 'scanning' ? 0.6 :
                       state.state === 'reading'  ? 0.85 :
                       1;
  return html`<div style=${{
    display: 'grid',
    gridTemplateColumns: '14px 1fr auto',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 0',
    borderTop: first ? 'none' : '1px solid rgba(255,255,255,0.04)',
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    fontSize: '11px',
  }}>
    <span style=${{
      width: '6px', height: '6px', borderRadius: '50%',
      background: stateColor,
      opacity: stateOpacity,
      animation: state.state === 'scanning' || state.state === 'reading' ? 'bdiSoftPulse 1.8s ease-in-out infinite' : 'none',
      animationDelay: (index * 0.25) + 's',
      justifySelf: 'center',
    }}></span>
    <span style=${{ color: 'var(--text)', fontSize: '11.5px' }}>
      <span style=${{ color: 'var(--text-dim)' }}>${'A' + String(index + 1).padStart(2, '0')}</span>
      <span style=${{ margin: '0 8px', color: 'var(--text-dim)' }}>·</span>
      ${lane.label}
      <span style=${{ marginLeft: '8px', color: 'var(--text-dim)', fontSize: '10.5px' }}>${lane.detail}</span>
    </span>
    <span style=${{
      fontSize: '10px', color: stateColor, opacity: stateOpacity,
      textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 700,
      minWidth: '64px', textAlign: 'right',
    }}>${state.text}</span>
  </div>`;
}

function formatDuration(seconds) {
  if (!seconds || seconds <= 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}m` : `${m}m ${String(s).padStart(2, '0')}s`;
}

function SourcesPanel({ sources }) {
  // Group by class for readability
  const byClass = {};
  for (const s of sources) {
    if (!byClass[s.class]) byClass[s.class] = [];
    byClass[s.class].push(s);
  }
  const CLASS_LABEL = {
    filing:   'Regulatory filings',
    press:    'News & press',
    graph:    'Bell.qa graph',
    industry: 'Industry reports',
    academic: 'Academic literature',
    court:    'Court & tribunal',
    web:      'Web',
    other:    'Other',
  };
  const CLASS_TINT = {
    filing: 'rgb(91 140 255)',  press: 'rgb(255 196 99)',
    graph:  'rgb(111 207 151)', industry: 'rgb(196 154 255)',
    academic: 'rgb(165 195 255)', court: 'rgb(232 142 168)',
    web: 'rgb(140 168 200)', other: 'rgb(140 140 140)',
  };
  return html`<div style=${{ marginBottom: '22px' }}>
    <div style=${{
      fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.08em',
      color: 'var(--text-dim)', fontWeight: 700, marginBottom: '10px',
    }}>Sources synthesized · ${sources.length}</div>
    <div style=${{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      ${Object.entries(byClass).map(([cls, list]) => html`
        <div key=${cls} style=${{
          display: 'flex', alignItems: 'center', gap: '10px',
          padding: '8px 10px',
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid var(--border)',
          borderRadius: '6px',
        }}>
          <span style=${{
            display: 'inline-block', width: '8px', height: '8px',
            borderRadius: '50%', background: CLASS_TINT[cls] || '#888',
            flexShrink: 0,
          }}></span>
          <span style=${{ fontSize: '12px', color: 'var(--text)', flex: 1 }}>
            ${CLASS_LABEL[cls] || cls}
          </span>
          <span style=${{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', fontVariantNumeric: 'tabular-nums' }}>
            ${list.length}
          </span>
        </div>
      `)}
    </div>
  </div>`;
}

function ReportViewer({ report, sources }) {
  const sectionList = Array.isArray(report.sections) ? report.sections : [];
  // 1-based index → source (the parser preserved this ordering)
  const sourceByIdx = new Map();
  sources.forEach((s, i) => sourceByIdx.set(i + 1, s));

  return html`<div style=${{
    marginBottom: '22px',
    padding: '20px 22px',
    background: 'rgba(255,255,255,0.015)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
  }}>
    <div style=${{
      fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.1em',
      color: 'var(--accent-bright)', fontWeight: 700, marginBottom: '8px',
    }}>The report</div>
    <h2 style=${{
      margin: '0 0 12px', fontSize: '20px', fontWeight: 600, color: 'var(--text)',
      lineHeight: 1.3,
    }}>${report.title}</h2>
    ${report.summary ? html`
      <p style=${{ fontSize: '13.5px', color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 22px' }}>
        ${report.summary}
      </p>
    ` : null}

    ${sectionList.map(sec => html`
      <div key=${sec.number} style=${{ marginBottom: '20px' }}>
        <div style=${{
          fontSize: '9.5px', textTransform: 'uppercase', letterSpacing: '0.1em',
          color: 'var(--text-dim)', fontWeight: 700, marginBottom: '4px',
        }}>Section ${String(sec.number).padStart(2, '0')}</div>
        <h3 style=${{ margin: '0 0 10px', fontSize: '15px', fontWeight: 600, color: 'var(--text)' }}>
          ${sec.title}
        </h3>
        <${RenderedBody} body=${sec.body_markdown} sourceByIdx=${sourceByIdx} />
      </div>
    `)}
  </div>`;
}

// Lightweight markdown-ish renderer. Handles paragraphs, [N] citations into
// clickable chips, **bold**, and simple - bullet lists. Resists JSX-style
// HTML in inputs by escaping then re-stringing.
function RenderedBody({ body, sourceByIdx }) {
  if (!body) return null;
  const blocks = splitBlocks(body);
  return html`<div style=${{ fontSize: '13px', color: 'var(--text)', lineHeight: 1.65 }}>
    ${blocks.map((b, i) => {
      if (b.kind === 'ul') {
        return html`<ul key=${i} style=${{ margin: '0 0 12px', paddingLeft: '20px' }}>
          ${b.items.map((line, j) => html`<li key=${j} style=${{ marginBottom: '4px' }}>${renderInline(line, sourceByIdx)}</li>`)}
        </ul>`;
      }
      return html`<p key=${i} style=${{ margin: '0 0 12px' }}>${renderInline(b.text, sourceByIdx)}</p>`;
    })}
  </div>`;
}

function splitBlocks(body) {
  const lines = String(body).split(/\r?\n/);
  const out = [];
  let para = [];
  let bullets = null;
  const flushPara = () => { if (para.length) { out.push({ kind: 'p', text: para.join(' ') }); para = []; } };
  const flushBullets = () => { if (bullets) { out.push({ kind: 'ul', items: bullets }); bullets = null; } };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushPara(); flushBullets(); continue; }
    if (/^[-*]\s+/.test(line)) {
      flushPara();
      if (!bullets) bullets = [];
      bullets.push(line.replace(/^[-*]\s+/, ''));
    } else {
      flushBullets();
      para.push(line);
    }
  }
  flushPara(); flushBullets();
  return out;
}

// Inline: **bold** + [N] citations
function renderInline(text, sourceByIdx) {
  const tokens = [];
  let i = 0;
  // Match [N] or **bold**
  const re = /(\*\*([^*]+)\*\*)|(\[(\d{1,3})\])/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > i) tokens.push({ kind: 'text', value: text.slice(i, m.index) });
    if (m[1]) {
      tokens.push({ kind: 'bold', value: m[2] });
    } else if (m[3]) {
      tokens.push({ kind: 'cite', n: Number(m[4]) });
    }
    i = re.lastIndex;
  }
  if (i < text.length) tokens.push({ kind: 'text', value: text.slice(i) });
  return tokens.map((t, k) => {
    if (t.kind === 'bold') return html`<strong key=${k}>${t.value}</strong>`;
    if (t.kind === 'cite') {
      const src = sourceByIdx.get(t.n);
      const title = src ? `${src.label || src.url || ''}` : `Source #${t.n}`;
      const onClick = (e) => { e.preventDefault(); if (src?.url) window.open(src.url, '_blank', 'noopener,noreferrer'); };
      return html`<a key=${k}
        href=${src?.url || '#'}
        onClick=${onClick}
        title=${title}
        style=${{
          display: 'inline-flex', alignItems: 'center',
          padding: '0 5px',
          marginLeft: '2px',
          fontSize: '10.5px', fontWeight: 700,
          color: 'var(--accent-bright)',
          background: 'rgba(91,140,255,0.12)',
          border: '1px solid rgba(91,140,255,0.32)',
          borderRadius: '3px',
          textDecoration: 'none',
          cursor: src?.url ? 'pointer' : 'help',
          verticalAlign: 'baseline',
        }}>[${t.n}]</a>`;
    }
    return html`<span key=${k}>${t.value}</span>`;
  });
}

// Shared retry helper used by the failed-banner and EmptyReportDebug retry
// buttons. Re-fires the agent and refreshes the drawer so the user sees the
// status flip back to gathering and the LiveAgentsPanel kicks in.
async function retryJob(jobId, reload) {
  try {
    const r = await api.runResearchJob(jobId);
    if (r && r.skipped) {
      toast(`Cannot retry — job is ${r.status}` + (r.reason ? ` (${r.reason})` : ''), 'error');
      return;
    }
    toast('Re-running through the agent — give it a moment');
    // Small delay so the orchestrator has time to flip status → gathering
    setTimeout(() => { try { reload && reload(); } catch {} }, 600);
  } catch (err) {
    toast('Retry failed: ' + (err.message || err), 'error');
  }
}

// Shown when a job reached 'ready' but the parser couldn't extract a usable
// report (zero sections). Surfaces the raw Firecrawl shape so we can fix
// the parser/schema. Also offers a Retry that re-fires the agent.
function EmptyReportDebug({ job, report, onRetry }) {
  const shape = job?.firecrawl_payload?.completion_data_shape;
  const rawSample = job?.firecrawl_payload?.completion_raw;
  return html`<div style=${{
    marginBottom: '22px',
    padding: '18px',
    background: 'rgba(255,196,99,0.05)',
    border: '1px solid rgba(255,196,99,0.32)',
    borderRadius: '12px',
  }}>
    <div style=${{
      fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.1em',
      color: 'rgb(255 196 99)', fontWeight: 700, marginBottom: '8px',
    }}>Report parsing — needs a tweak</div>
    <div style=${{ fontSize: '13px', color: 'var(--text)', marginBottom: '6px' }}>
      Firecrawl Agent returned data, but our parser couldn't find the report shape inside it.
    </div>
    <div style=${{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.55, marginBottom: '12px' }}>
      This usually means the agent returned a different schema than we asked for. We've saved the raw response so we can inspect it and adjust the parser. Click <strong>Retry</strong> to re-run the job through the agent with the updated parser.
    </div>

    ${shape ? html`<details style=${{ marginBottom: '12px' }}>
      <summary style=${{
        fontSize: '11px', color: 'var(--text-dim)', fontWeight: 700,
        cursor: 'pointer', marginBottom: '8px',
      }}>What Firecrawl returned (shape)</summary>
      <pre style=${{
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: '11px', color: 'var(--text-muted)',
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '10px', margin: '6px 0 0', overflow: 'auto',
        maxHeight: '240px',
      }}>${JSON.stringify(shape, null, 2)}</pre>
    </details>` : null}

    ${rawSample ? html`<details style=${{ marginBottom: '12px' }}>
      <summary style=${{
        fontSize: '11px', color: 'var(--text-dim)', fontWeight: 700,
        cursor: 'pointer', marginBottom: '8px',
      }}>Raw Firecrawl response (first 8 KB)</summary>
      <pre style=${{
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: '10.5px', color: 'var(--text-muted)',
        background: 'rgba(0,0,0,0.25)',
        border: '1px solid var(--border)',
        borderRadius: '6px',
        padding: '10px', margin: '6px 0 0', overflow: 'auto',
        maxHeight: '320px',
      }}>${JSON.stringify(rawSample, null, 2).slice(0, 8000)}</pre>
    </details>` : null}

    <button
      onClick=${() => onRetry && onRetry()}
      style=${{
        marginTop: '4px',
        background: 'var(--accent)', border: '1px solid var(--accent)',
        color: '#fff', padding: '7px 14px', borderRadius: '6px',
        fontSize: '12px', fontWeight: 600, cursor: 'pointer',
        boxShadow: '0 4px 12px rgba(91,140,255,0.32)',
      }}
    >Retry research</button>
  </div>`;
}

// Read-only publish status. Research ALWAYS publishes on completion (Val
// 2026-07-04: no keep-private, no exclusivity) — anonymized — to the Market
// Feed and bell.qa/research. Shown to everyone so they know it's live.
function FeedReleasePanel({ job }) {
  const released = !!job.feed_released_at;
  return html`<div style=${{
    marginBottom: '22px', padding: '14px 16px',
    background: 'rgba(111,207,151,0.06)',
    border: '1px solid rgba(111,207,151,0.28)',
    borderRadius: '10px',
  }}>
    <div style=${{
      fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.1em',
      color: 'rgb(111 207 151)', fontWeight: 700, marginBottom: '8px',
    }}>Published</div>
    <div style=${{ fontSize: '12.5px', color: 'var(--text)', lineHeight: 1.5 }}>
      ${released
        ? html`Live in the Market Feed and on <span style=${{ color: 'rgb(111 207 151)' }}>bell.qa/research</span> — anonymized, no identities shown${job.feed_released_at ? ` · ${new Date(job.feed_released_at).toLocaleDateString()}` : ''}.`
        : 'Publishing to the Market Feed and bell.qa/research…'}
    </div>
  </div>`;
}

function btn(accent = false) {
  return {
    padding: '7px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
    border: '1px solid ' + (accent ? 'var(--accent)' : 'var(--border)'),
    background: accent ? 'var(--accent)' : 'transparent',
    color: accent ? '#fff' : 'var(--text-muted)',
  };
}

function DerivedEntitiesPanel({ derived }) {
  const created  = derived.filter(d => d.action === 'created');
  const enriched = derived.filter(d => d.action === 'enriched');
  const skipped  = derived.filter(d => d.action === 'skipped');
  if (created.length + enriched.length + skipped.length === 0) return null;

  const gotoEntity = (d) => {
    if (d.entity_type === 'company' && d.entity_id) {
      navigateTo('companies', d.entity_id);
    }
    if (d.entity_type === 'person' && d.entity_id) {
      navigateTo('people', d.entity_id);
    }
  };

  const row = (d) => html`<div
    key=${d.id}
    onClick=${() => gotoEntity(d)}
    style=${{
      display: 'flex', alignItems: 'center', gap: '10px',
      padding: '7px 10px',
      background: 'rgba(255,255,255,0.02)',
      border: '1px solid var(--border)',
      borderRadius: '6px',
      cursor: d.entity_id ? 'pointer' : 'default',
    }}>
    <span style=${{
      fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.06em',
      padding: '2px 6px', borderRadius: '3px',
      color: d.entity_type === 'company' ? 'rgb(91 140 255)' : 'rgb(111 207 151)',
      background: (d.entity_type === 'company' ? 'rgba(91,140,255,0.12)' : 'rgba(111,207,151,0.12)'),
    }}>${d.entity_type}</span>
    <span style=${{ flex: 1, fontSize: '12px', color: 'var(--text)' }}>
      ${d.fields_changed?.name || d.fields_changed?.full_name || d.fields_changed?.research_derived?.name || d.fields_changed?.research_derived?.full_name || `#${d.entity_id || '?'}`}
    </span>
    ${d.notes ? html`<span style=${{ fontSize: '10.5px', color: 'var(--text-dim)' }}>${d.notes}</span>` : null}
  </div>`;

  return html`<div style=${{ marginBottom: '22px' }}>
    <div style=${{
      fontSize: '10.5px', textTransform: 'uppercase', letterSpacing: '0.08em',
      color: 'var(--text-dim)', fontWeight: 700, marginBottom: '10px',
    }}>Snowball · Bell database changes</div>
    ${created.length > 0 ? html`<div style=${{ marginBottom: '12px' }}>
      <div style=${{ fontSize: '11px', color: 'rgb(111 207 151)', fontWeight: 700, marginBottom: '6px' }}>
        Created · ${created.length}
      </div>
      <div style=${{ display: 'flex', flexDirection: 'column', gap: '4px' }}>${created.map(row)}</div>
    </div>` : null}
    ${enriched.length > 0 ? html`<div style=${{ marginBottom: '12px' }}>
      <div style=${{ fontSize: '11px', color: 'rgb(255 196 99)', fontWeight: 700, marginBottom: '6px' }}>
        Enriched · ${enriched.length}
      </div>
      <div style=${{ display: 'flex', flexDirection: 'column', gap: '4px' }}>${enriched.map(row)}</div>
    </div>` : null}
    ${skipped.length > 0 ? html`<details style=${{ marginBottom: '12px' }}>
      <summary style=${{ fontSize: '11px', color: 'var(--text-dim)', fontWeight: 700, marginBottom: '6px', cursor: 'pointer' }}>
        Skipped · ${skipped.length}
      </summary>
      <div style=${{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '6px' }}>${skipped.map(row)}</div>
    </details>` : null}
  </div>`;
}
