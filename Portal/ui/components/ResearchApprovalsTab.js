// Research approval queue (local engine only).
//
// Companies that research discovered wait here for a decision:
//   • Pending       — new Qatar companies; Approve → live in Bell, Reject → kept-but-out
//   • International  — non-Qatar; kept for future expansion; never enters Bell
//   • Rejected       — remembered so research won't re-queue them
//
// Approving promotes the candidate into the live companies table on the local
// engine; it then mirrors up to bell.qa on the next push.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { navigateTo } from '../lib/router.js';

const KINDS = [
  { key: 'pending',   label: 'Pending',       blurb: 'New Qatar companies awaiting your approval.' },
  { key: 'non_qatar', label: 'International',  blurb: 'Non-Qatar companies, kept for future expansion. Never shown in Bell.' },
  { key: 'rejected',  label: 'Rejected',      blurb: 'Companies you turned down. Kept so research won’t re-queue them.' },
];

export function ResearchApprovalsTab() {
  const [kind, setKind] = useState('pending');
  const [counts, setCounts] = useState({ pending: 0, non_qatar: 0, rejected: 0, approved: 0 });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const r = await api.researchCandidates({ kind });
      setRows(r.rows || []);
      setCounts(r.counts || {});
    } catch (err) { if (!silent) toast('Load failed: ' + err.message, 'error'); }
    finally { if (!silent) setLoading(false); }
  }, [kind]);

  useEffect(() => { load(); }, [load]);

  const act = async (id, fn, okMsg) => {
    setBusyId(id);
    try {
      await fn(id);
      toast(okMsg);
      await load({ silent: true });
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    finally { setBusyId(null); }
  };

  const meta = KINDS.find(k => k.key === kind);

  return html`
    <div style=${{ padding: '20px 24px', overflowY: 'auto', height: '100%' }}>
      <div style=${{ marginBottom: '16px' }}>
        <div style=${{ fontSize: '18px', fontWeight: 600, color: 'var(--text)', marginBottom: '4px' }}>
          Research approvals
        </div>
        <div style=${{ fontSize: '12.5px', color: 'var(--text-muted)', lineHeight: 1.5, maxWidth: '760px' }}>
          Companies discovered by research are held here. Only companies you <strong>approve</strong> become
          visible in Bell. Non-Qatar companies are kept for future expansion and never enter Bell. People
          are added automatically and don’t appear here.
        </div>
      </div>

      <div style=${{ display: 'flex', gap: '6px', marginBottom: '14px', flexWrap: 'wrap' }}>
        ${KINDS.map(k => html`
          <button
            key=${k.key}
            class=${'toolbar-toggle' + (kind === k.key ? ' accent' : '')}
            onClick=${() => setKind(k.key)}
          >${k.label}${counts[k.key] ? ` (${counts[k.key].toLocaleString()})` : ''}</button>
        `)}
        <span style=${{ flex: 1 }}></span>
        <button class="toolbar-toggle" onClick=${() => load()}>Refresh</button>
      </div>

      <div style=${{ fontSize: '11.5px', color: 'var(--text-dim)', marginBottom: '10px' }}>${meta?.blurb}</div>

      ${loading ? html`
        <div style=${{ color: 'var(--text-dim)', textAlign: 'center', padding: '50px 0', fontSize: '12px' }}>Loading…</div>
      ` : rows.length === 0 ? html`
        <div style=${{ color: 'var(--text-dim)', textAlign: 'center', padding: '50px 0', fontSize: '12px' }}>
          ${kind === 'pending' ? 'Nothing waiting for approval.' : kind === 'non_qatar' ? 'No international companies stored yet.' : 'No rejected companies.'}
        </div>
      ` : html`
        <div style=${{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          ${rows.map(r => html`<${CandidateRow}
            key=${r.id}
            row=${r}
            kind=${kind}
            busy=${busyId === r.id}
            onApprove=${() => act(r.id, api.approveCandidate, `Approved "${r.name}" — now live in Bell`)}
            onReject=${() => act(r.id, api.rejectCandidate, `Rejected "${r.name}" — kept on record`)}
            onRestore=${() => act(r.id, api.restoreCandidate, `Moved "${r.name}" back to Pending`)}
          />`)}
        </div>
      `}
    </div>
  `;
}

function CandidateRow({ row, kind, busy, onApprove, onReject, onRestore }) {
  return html`
    <div style=${{
      display: 'flex', alignItems: 'center', gap: '12px',
      padding: '12px 14px',
      background: 'linear-gradient(180deg, rgba(19,24,41,.6) 0%, rgba(13,18,35,.6) 100%)',
      border: '1px solid var(--border)', borderRadius: '10px',
      opacity: busy ? 0.55 : 1,
    }}>
      <div style=${{ minWidth: 0, flex: 1 }}>
        <div style=${{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)', marginBottom: '3px' }}>
          ${row.name}
          ${row.country && row.country.toLowerCase() !== 'qatar'
            ? html`<span style=${{ marginLeft: '8px', fontSize: '10px', color: 'rgb(255 196 99)', border: '1px solid rgba(255,196,99,0.4)', borderRadius: '4px', padding: '1px 5px' }}>${row.country}</span>`
            : null}
        </div>
        <div style=${{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          ${row.industry ? html`<span>${row.industry}</span>` : null}
          ${row.city ? html`<span>${row.city}</span>` : null}
          ${row.primary_registration_no ? html`<span>Reg ${row.primary_registration_no}</span>` : null}
          ${row.linkedin_url ? html`<a href=${row.linkedin_url} target="_blank" rel="noopener noreferrer" style=${{ color: 'var(--accent-bright)' }}>LinkedIn</a>` : null}
          ${row.relation_to_target ? html`<span style=${{ color: 'var(--text-dim)' }}>· ${row.relation_to_target}</span>` : null}
        </div>
        ${row.discovered_from_job_id ? html`<div style=${{ fontSize: '10px', color: 'var(--text-dim)', marginTop: '3px' }}>
          from research job #${row.discovered_from_job_id}${row.decided_by ? ` · decided by ${row.decided_by}` : ''}
        </div>` : null}
      </div>
      <div style=${{ display: 'flex', gap: '6px', flexShrink: 0 }}>
        ${kind === 'pending' ? html`
          <button class="toolbar-toggle accent" disabled=${busy} onClick=${onApprove}>Approve</button>
          <button class="toolbar-toggle" disabled=${busy} onClick=${onReject}>Reject</button>
        ` : kind === 'non_qatar' ? html`
          <button class="toolbar-toggle" disabled=${busy} onClick=${onRestore} title="Reclassify as Qatar and move to Pending">Move to Pending</button>
          <button class="toolbar-toggle" disabled=${busy} onClick=${onReject}>Reject</button>
        ` : html`
          <button class="toolbar-toggle" disabled=${busy} onClick=${onRestore} title="Reconsider — move back to Pending">Restore</button>
        `}
      </div>
    </div>
  `;
}
