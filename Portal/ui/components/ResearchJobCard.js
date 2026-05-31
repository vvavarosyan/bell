// One card in the Research Console grid. Matches the visual language of the
// marketing-site research page (rounded panel, type chip, status pill, sources
// classes, counters strip) but reads from local research_jobs rows.

import { html } from '../lib/html.js';

const TYPE_META = {
  company:    { label: 'Company deep-dive',     tint: 'rgb(91 140 255)',  glyph: '⌂' },
  person:     { label: 'Person profile',        tint: 'rgb(111 207 151)', glyph: '◉' },
  sector:     { label: 'Sector landscape',      tint: 'rgb(255 196 99)',  glyph: '▦' },
  theme:      { label: 'Thematic deep-dive',    tint: 'rgb(196 154 255)', glyph: '◈' },
  region:     { label: 'Regional cluster',      tint: 'rgb(165 195 255)', glyph: '◯' },
  regulation: { label: 'Regulatory tracking',   tint: 'rgb(232 142 168)', glyph: '◇' },
};

const STATUS_META = {
  queued:        { label: 'Queued',       color: 'rgb(165 195 255)', dot: 'rgb(165 195 255)' },
  gathering:     { label: 'Gathering',    color: 'rgb(165 195 255)', dot: 'rgb(165 195 255)' },
  synthesizing: { label: 'Synthesizing', color: 'rgb(255 196 99)',  dot: 'rgb(255 196 99)'  },
  ready:         { label: 'Ready',        color: 'rgb(111 207 151)', dot: 'rgb(111 207 151)' },
  failed:        { label: 'Failed',       color: 'rgb(232 142 168)', dot: 'rgb(232 142 168)' },
  cancelled:     { label: 'Cancelled',    color: 'rgb(140 140 140)', dot: 'rgb(140 140 140)' },
};

function relTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60)    return `${s}s ago`;
  if (s < 3600)  return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

function targetLine(job) {
  if (job.target_company_name) {
    return `${job.target_company_name}${job.target_company_bin ? ` · ${job.target_company_bin}` : ''}`;
  }
  if (job.target_person_name) {
    return `${job.target_person_name}${job.target_person_pin ? ` · ${job.target_person_pin}` : ''}`;
  }
  return job.target_label || '—';
}

export function ResearchJobCard({ job, onOpen, onDelete, isAdmin }) {
  const t = TYPE_META[job.type]   || TYPE_META.company;
  const s = STATUS_META[job.status] || STATUS_META.queued;

  const tintBg     = t.tint.replace('rgb', 'rgba').replace(')', ' / 0.14)');
  const sStyle = {
    color: s.color,
    background: s.color.replace('rgb', 'rgba').replace(')', ' / 0.12)'),
    borderColor: s.color.replace('rgb', 'rgba').replace(')', ' / 0.32)'),
  };

  return html`
    <div
      class="research-card"
      onClick=${() => onOpen && onOpen(job)}
      style=${{
        padding: '16px',
        background: 'linear-gradient(180deg, rgba(19,24,41,.94) 0%, rgba(13,18,35,.94) 100%)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'border-color .15s ease, transform .15s ease',
        minHeight: '215px',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <!-- header: type glyph + status pill -->
      <div style=${{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px', gap: '8px' }}>
        <span style=${{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: '32px', height: '32px',
          borderRadius: '8px',
          background: tintBg, color: t.tint,
          fontSize: '14px', fontWeight: 700,
        }}>${t.glyph}</span>
        <span style=${{
          display: 'inline-flex', alignItems: 'center', gap: '5px',
          padding: '3px 8px',
          fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
          borderRadius: '999px',
          border: '1px solid', ...sStyle,
        }}>
          <span style=${{ width: '5px', height: '5px', borderRadius: '50%', background: s.dot }}></span>
          ${s.label}
        </span>
        ${onDelete ? html`<button
          title="Delete this research"
          onClick=${(e) => { e.stopPropagation(); if (window.confirm('Delete this research permanently?')) onDelete(job); }}
          style=${{ background: 'transparent', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: '15px', lineHeight: 1, padding: '2px 4px' }}
        >✕</button>` : null}
      </div>

      <!-- type label -->
      <div style=${{
        fontSize: '9.5px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
        color: t.tint, marginBottom: '6px',
      }}>${t.label}</div>

      <!-- brief (capped) -->
      <div style=${{
        fontSize: '12.5px', color: 'var(--text)', lineHeight: '1.4',
        fontStyle: 'italic',
        display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical',
        overflow: 'hidden', marginBottom: '10px',
      }}>"${job.brief}"</div>

      <!-- target -->
      <div style=${{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '12px' }}>
        ${targetLine(job)}
      </div>

      <!-- requester (admin-only) -->
      ${isAdmin && job.created_by ? html`
        <div style=${{
          display: 'flex', alignItems: 'center', gap: '5px',
          fontSize: '10px', color: 'var(--text-dim)', marginBottom: '12px',
          marginTop: '-4px',
        }}>
          <span style=${{ opacity: 0.7 }}>requested by</span>
          <span style=${{ color: 'var(--text-muted)', fontWeight: 600 }}>${job.created_by}</span>
        </div>
      ` : null}

      <!-- counter strip -->
      <div style=${{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: 'auto' }}>
        ${[
          { label: 'Sources',   value: job.source_count   ?? 0 },
          { label: 'Sections',  value: job.section_count  ?? 0 },
          { label: 'Citations', value: job.citation_count ?? 0 },
        ].map(m => html`
          <div key=${m.label} style=${{
            border: '1px solid rgba(255,255,255,.06)',
            borderRadius: '6px',
            padding: '6px 4px',
            textAlign: 'center',
          }}>
            <div style=${{ fontSize: '8.5px', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text-dim)', fontWeight: 700 }}>
              ${m.label}
            </div>
            <div style=${{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', marginTop: '2px', fontVariantNumeric: 'tabular-nums' }}>
              ${m.value > 0 ? m.value.toLocaleString() : '—'}
            </div>
          </div>
        `)}
      </div>

      <!-- footer -->
      <div style=${{
        marginTop: '12px', paddingTop: '10px',
        borderTop: '1px solid rgba(255,255,255,.06)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        fontSize: '10.5px', color: 'var(--text-dim)',
      }}>
        <span>${job.agent_count} ${job.agent_count === 1 ? 'agent' : 'agents'}</span>
        <span>${footerStatus(job)}</span>
      </div>
    </div>
  `;
}

// Footer line for a job card. Truthful about ETA overrun — past the
// estimate we switch to elapsed-time-based language ("running 12m") instead
// of lying with a stuck "4 min left".
function footerStatus(job) {
  if (job.status === 'ready' && job.ready_at) return `Delivered ${relTime(job.ready_at)}`;
  if (job.status === 'failed')                return `Failed ${relTime(job.ready_at || job.created_at)}`;
  if (job.status === 'queued')                return `Created ${relTime(job.created_at)}`;
  // In-flight (gathering / synthesizing)
  if (job.started_at) {
    const elapsed = Math.max(0, Math.round((Date.now() - new Date(job.started_at).getTime()) / 1000));
    if (job.eta_seconds && elapsed < job.eta_seconds) {
      return `~${Math.max(1, Math.round((job.eta_seconds - elapsed) / 60))} min left`;
    }
    // Past the estimate — be honest
    const m = Math.floor(elapsed / 60);
    return m > 0 ? `Running ${m}m` : `Running ${elapsed}s`;
  }
  return relTime(job.created_at);
}
