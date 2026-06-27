// Website Candidates — admin review queue for SEARCH-found websites.
// The Finder auto-saves high-confidence domain guesses, but routes fuzzier
// search results here. Approve → sets the company's website (the harvester then
// picks it up). Reject → records the host so the Finder won't re-propose it.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { JobLogPanel } from './JobLogPanel.js';

const STATUS_COLOR = {
  pending:  'var(--amber)',
  approved: 'var(--green)',
  rejected: 'var(--red)',
};

export function WebsiteCandidatesTab() {
  const [rows, setRows]       = useState([]);
  const [status, setStatus]   = useState('pending');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(() => new Set());
  const [job, setJob]         = useState(null);   // { id } while the bulk auto-approve runs

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await api.websiteCandidates(status); setRows(r.rows || []); }
    catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, [status]);
  useEffect(() => { load(); }, [load]);

  const decide = async (id, action) => {
    setBusy(prev => new Set(prev).add(id));
    try {
      await api.decideWebsiteCandidate(id, action);
      toast(action === 'approve' ? 'Approved — website set' : 'Rejected');
      window.dispatchEvent(new Event('bdi:website-candidates-changed'));
      setRows(prev => prev.filter(r => r.id !== id));   // drop from pending view
    } catch (err) { toast('Failed: ' + err.message, 'error'); }
    finally { setBusy(prev => { const n = new Set(prev); n.delete(id); return n; }); }
  };

  // Free bulk approval — runs as a BACKGROUND JOB (re-fetching the whole queue
  // takes minutes). Cheap count → confirm → start job → stream live progress in
  // the log panel. No Apify / paid search. Approvals land inline as it runs.
  const autoApprove = async () => {
    let n = rows.length;
    try { const c = await api.websiteCandidatesCount(); if (typeof c.count === 'number') n = c.count; } catch { /* use loaded count */ }
    if (!n) { toast('No pending candidates to check.'); return; }
    if (!window.confirm(
      `Re-check ${n.toLocaleString()} pending candidate${n === 1 ? '' : 's'} over plain HTTP (free, no Apify) and auto-approve the near-certain ones?\n\n` +
      `Weaker matches and dead links stay pending for review. This runs in the background — you'll see live progress.`,
    )) return;
    try {
      const r = await api.autoApproveWebsiteCandidates();
      setJob({ id: r.job_id, title: 'Auto-approving website candidates (free)' });
    } catch (err) { toast('Could not start: ' + err.message, 'error'); }
  };

  // Reverse every website set by the auto-approve pass (recovery from the bad
  // single-word matches). Returns those candidates to the review queue.
  const undoAuto = async () => {
    if (!window.confirm(
      'Reverse ALL websites set by auto-approve?\n\n' +
      'This clears those (often wrong) websites and returns the candidates to the review queue. ' +
      'Websites you have since changed by hand are left untouched. Runs in the background.',
    )) return;
    try {
      const r = await api.undoAutoApproveWebsiteCandidates();
      setJob({ id: r.job_id, title: 'Reversing auto-approved websites' });
    } catch (err) { toast('Could not start: ' + err.message, 'error'); }
  };

  // Remove the people + guessed emails harvested from the reversed wrong sites.
  const cleanPeople = async () => {
    if (!window.confirm(
      'Remove the decision-makers + guessed emails that were harvested from the reversed wrong websites?\n\n' +
      'Only people at now-website-less companies that the harvester created are removed; anyone with another role or a registry/LinkedIn origin is kept. Runs in the background.',
    )) return;
    try {
      const r = await api.cleanHarvestedPeople();
      setJob({ id: r.job_id, title: 'Cleaning harvested people from reversed sites' });
    } catch (err) { toast('Could not start: ' + err.message, 'error'); }
  };

  return html`
    <div class="dr-shell">
      <div class="grid-toolbar">
        <strong>Website Candidates</strong>
        <span class="muted small">search-found sites awaiting approval</span>
        <select value=${status} onChange=${e => setStatus(e.target.value)}>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
          <option value="all">All</option>
        </select>
        <span class="spacer"></span>
        <button disabled=${!!job} onClick=${cleanPeople}
          title="Remove the people + guessed emails harvested from the reversed wrong websites.">
          ${job ? 'Running…' : 'Clean harvested residue'}
        </button>
        <button disabled=${!!job} onClick=${undoAuto}
          title="Reverse every website set by the auto-approve pass and return those candidates to review.">
          ${job ? 'Running…' : 'Undo auto-approvals'}
        </button>
        ${status === 'pending' ? html`
          <button class="accent" disabled=${!!job} onClick=${autoApprove}
            title="Re-check every pending candidate over plain HTTP (free, no Apify) and approve only the near-certain matches.">
            ${job ? 'Running…' : 'Auto-approve strong matches (free)'}
          </button>` : null}
        <button onClick=${load}>Refresh</button>
      </div>

      ${job ? html`
        <${JobLogPanel}
          title=${job.title || 'Working…'}
          jobId=${job.id}
          kind="enrichment"
          onClose=${() => { setJob(null); load(); }}
          onComplete=${() => { window.dispatchEvent(new Event('bdi:website-candidates-changed')); load(); }} />` : null}

      ${loading
        ? html`<div class="empty">Loading…</div>`
        : (rows.length === 0
            ? html`<div class="empty">No ${status === 'all' ? '' : status} candidates.</div>`
            : html`<div class="dr-list">
                ${rows.map(r => html`
                  <div class="dr-card" key=${r.id}>
                    <div class="dr-card-head">
                      <div>
                        <strong>${r.company_name}</strong> ${r.company_bin ? html`<span class="muted small">${r.company_bin}</span>` : null}
                        <div class="muted small">${r.reason || ''} · ${new Date(r.created_at).toLocaleString()}</div>
                      </div>
                      <span class="request-pill" style=${{ color: STATUS_COLOR[r.status], borderColor: STATUS_COLOR[r.status] }}>${r.status}</span>
                    </div>
                    <div class="dr-note">
                      <a href=${r.candidate_url} target="_blank" rel="noreferrer">${r.candidate_url} ↗</a>
                    </div>
                    ${r.status === 'pending' ? html`
                      <div class="dr-actions">
                        <button class="accent" disabled=${busy.has(r.id)} onClick=${() => decide(r.id, 'approve')}>Approve</button>
                        <button class="ghost"  disabled=${busy.has(r.id)} onClick=${() => decide(r.id, 'reject')}>Reject</button>
                      </div>` : (r.decided_by ? html`<div class="muted small">by ${r.decided_by}</div>` : null)}
                  </div>
                `)}
              </div>`)}
    </div>
  `;
}
