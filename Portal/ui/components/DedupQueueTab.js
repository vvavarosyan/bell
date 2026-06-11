// Dedup Queue — Phase 5 review UI. Lists candidate pairs awaiting admin
// decision with side-by-side comparison + Merge / Keep Separate buttons.

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';
import { JobLogPanel } from './JobLogPanel.js';
import { DedupAuditPanel } from './DedupAuditPanel.js';

const REASON_LABELS = {
  linkedin_url_match:    { label: 'LinkedIn URL',      color: '#8bb0ff' },
  registration_no_match: { label: 'Registration #',    color: '#9fefb8' },
  name_exact_match:      { label: 'Exact name',        color: '#ff9fb4' },
  website_domain_match:  { label: 'Website domain',    color: '#c5a3ff' },
  fuzzy_name_high:       { label: 'Name match (≥80%)', color: '#fbbf24' },
  fuzzy_name_med:        { label: 'Name match (≥65%)', color: '#a8c0ff' },

  // Deprecated 2026-05-23 (kept so any historical rows still render a label).
  gmaps_place_id_match:  { label: 'Google Maps ID (deprecated)', color: '#8a93a6' },
  same_city:             { label: 'Same city (deprecated)',      color: '#8a93a6' },
  same_country:          { label: 'Same country (deprecated)',   color: '#8a93a6' },
};

function ReasonBadge({ reason }) {
  const meta = REASON_LABELS[reason] || { label: reason, color: '#8a93a6' };
  return html`<span style=${{
    display: 'inline-block', padding: '2px 7px', borderRadius: 3,
    fontSize: 10, fontWeight: 700, letterSpacing: '.3px',
    background: meta.color + '22', color: meta.color,
    border: '1px solid ' + meta.color + '55',
    marginRight: 4,
  }}>${meta.label}</span>`;
}

function Side({ company, label }) {
  if (!company) return html`<div class="dedup-side empty">no company</div>`;
  const rows = [
    ['BIN',              company.bin],
    ['Name',             company.name],
    ['Legal name',       company.legal_name],
    ['Registration #',   company.primary_registration_no],
    ['Industry',         company.industry],
    ['City',             company.city],
    ['Website',          company.website],
    ['LinkedIn',         company.linkedin_url],
    ['Employees',        company.employee_count?.toLocaleString?.()],
    ['Sources',          (company.sources || []).join(' · ')],
  ];
  return html`
    <div class="dedup-side">
      <div class="dedup-side-label">${label}</div>
      <table class="dedup-side-table">
        ${rows.map(([k, v]) => html`
          <tr key=${k}>
            <th>${k}</th>
            <td>${v || html`<span class="muted">—</span>`}</td>
          </tr>
        `)}
      </table>
    </div>
  `;
}

// How many pairs to fetch per page from the API.
const PAGE_SIZE = 200;

export function DedupQueueTab() {
  const [stats, setStats]     = useState(null);
  const [rows, setRows]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy]       = useState(false);
  const [activeJob, setActiveJob] = useState(null);
  const [decidingIds, setDecidingIds] = useState(() => new Set());

  // Which pair IDs are currently expanded (showing side-by-side + actions).
  const [expandedIds, setExpandedIds] = useState(() => new Set());
  const [showAudit, setShowAudit] = useState(false);

  const toggleExpanded = useCallback((id) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else              next.add(id);
      return next;
    });
  }, []);
  const expandAll   = useCallback(() => setExpandedIds(new Set(rows.map(r => r.id))), [rows]);
  const collapseAll = useCallback(() => setExpandedIds(new Set()),                    []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [s, q] = await Promise.all([api.assemblyStats(), api.dedupQueue(PAGE_SIZE)]);
      setStats(s);
      setRows(q.rows || []);
    } catch (err) { toast('Load failed: ' + err.message, 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Background refresh while an assembly job is running
  useEffect(() => {
    if (!activeJob) return;
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [activeJob, load]);

  const runAssembly = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api.assemblyRun();
      setActiveJob({ id: r.job_id, title: 'Bell Assembly' });
      toast('Assembly started');
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  const runBulkApprove = async () => {
    if (busy || activeJob) return;
    if (!window.confirm('Auto-merge every pending pair that shares an EXACT name and has no conflicting website/LinkedIn?\n\nRegistration-only and different-name pairs are NOT touched — they stay here for manual approval.')) return;
    setBusy(true);
    try {
      const r = await api.dedupBulkApprove();
      setActiveJob({ id: r.job_id, title: 'Bulk-approve exact-name pairs' });
      toast('Bulk-approve started');
    } catch (err) { toast(err.message, 'error'); }
    finally { setBusy(false); }
  };

  const decide = async (candId, action) => {
    setDecidingIds(prev => new Set(prev).add(candId));
    try {
      await api.dedupDecide(candId, action);
      toast(action === 'keep_separate' ? 'Kept separate' : 'Merged');
      // Drop the row from the list locally for immediate feedback
      setRows(prev => prev.filter(r => r.id !== candId));
      setExpandedIds(prev => {
        if (!prev.has(candId)) return prev;
        const next = new Set(prev);
        next.delete(candId);
        return next;
      });
      // Refresh stats in the background
      api.assemblyStats().then(s => setStats(s)).catch(() => {});
    } catch (err) { toast('Decision failed: ' + err.message, 'error'); }
    finally {
      setDecidingIds(prev => { const next = new Set(prev); next.delete(candId); return next; });
    }
  };

  const totalShown = rows.length;
  const totalPending = stats?.pending_review ?? 0;
  const hasMore = totalPending > totalShown;

  return html`
    <div class="dedup-shell">
      <div class="dedup-header">
        <div class="dedup-header-stats">
          ${stats ? html`
            <span><strong>${stats.pending_review.toLocaleString()}</strong> pending</span>
            <span class="muted small"> · ${stats.auto_merged_count.toLocaleString()} auto-merged · ${stats.kept_separate_count.toLocaleString()} kept separate · ${stats.canonical_companies.toLocaleString()} canonical · ${stats.merged_companies.toLocaleString()} merged</span>
            <span class="muted small"> · ${stats.companies_with_bin.toLocaleString()} BINs · ${stats.people_with_pin.toLocaleString()} PINs · ${stats.jobs_with_jin.toLocaleString()} JINs</span>
          ` : html`<span class="muted small">Loading stats…</span>`}
        </div>
        <div class="dedup-header-actions">
          <button onClick=${expandAll}   disabled=${loading || rows.length === 0}>Expand all</button>
          <button onClick=${collapseAll} disabled=${loading || expandedIds.size === 0}>Collapse all</button>
          <button onClick=${load}        disabled=${loading}>Refresh</button>
          <button onClick=${() => setShowAudit(true)} title="Run a full integrity + quality audit of the merge">🔍 Audit</button>
          <button onClick=${runBulkApprove} disabled=${busy || !!activeJob} title="Auto-merge exact-name pairs with no conflicting website/LinkedIn. Registration-only / different-name pairs stay for manual approval.">✓ Bulk-approve same-name</button>
          <button class="accent" onClick=${runAssembly} disabled=${busy || !!activeJob}>
            ${activeJob ? 'Assembly running…' : '▶ Run Assembly'}
          </button>
        </div>
      </div>

      <div class="dedup-list-wrap">
        ${loading ? html`<div class="dedup-list-empty">Loading queue…</div>` : null}
        ${!loading && rows.length === 0 ? html`
          <div class="dedup-list-empty">
            No candidates pending review.<br/>
            <span class="muted small">Click <strong>Run Assembly</strong> above to detect duplicates and assign BIN / PIN / JIN identifiers.</span>
          </div>
        ` : null}

        ${rows.length > 0 ? html`
          <div class="dedup-listing">
            <div class="dedup-listing-head">
              <span class="dl-col-score">Score</span>
              <span class="dl-col-names">Company A &nbsp;⇆&nbsp; Company B</span>
              <span class="dl-col-reasons">Reasons</span>
              <span class="dl-col-toggle"></span>
            </div>

            ${rows.map(r => {
              const isOpen   = expandedIds.has(r.id);
              const deciding = decidingIds.has(r.id);
              const score    = Math.round(Number(r.similarity_score) * 100);
              const scoreCls = score >= 95 ? 'high' : score >= 80 ? 'med' : 'low';
              const a = r.company_a || {};
              const b = r.company_b || {};

              return html`
                <div class=${'dedup-line ' + (isOpen ? 'open' : '')} key=${r.id}>
                  <button
                    class="dedup-line-summary"
                    onClick=${() => toggleExpanded(r.id)}
                    title=${isOpen ? 'Collapse' : 'Expand for side-by-side + actions'}
                  >
                    <span class=${'dl-col-score score-' + scoreCls}>${score}%</span>
                    <span class="dl-col-names">
                      <span class="dl-name">${a.name || html`<span class="muted">—</span>`}</span>
                      <span class="dl-arrow muted">⇆</span>
                      <span class="dl-name">${b.name || html`<span class="muted">—</span>`}</span>
                    </span>
                    <span class="dl-col-reasons">
                      ${(r.similarity_reasons || []).map(reason => html`<${ReasonBadge} key=${reason} reason=${reason} />`)}
                    </span>
                    <span class="dl-col-toggle">${isOpen ? '▾' : '▸'}</span>
                  </button>

                  ${isOpen ? html`
                    <div class="dedup-line-body">
                      <div class="dedup-pair-body">
                        <${Side} company=${a} label="Option A" />
                        <${Side} company=${b} label="Option B" />
                      </div>
                      <div class="dedup-pair-actions">
                        <button
                          disabled=${deciding}
                          onClick=${() => decide(r.id, 'merge_b_to_a')}
                          title="Keep A as canonical, merge B into it"
                        >← Merge B into A</button>
                        <button
                          disabled=${deciding}
                          onClick=${() => decide(r.id, 'merge_a_to_b')}
                          title="Keep B as canonical, merge A into it"
                        >Merge A into B →</button>
                        <span class="spacer"></span>
                        <button
                          class="ghost"
                          disabled=${deciding}
                          onClick=${() => decide(r.id, 'keep_separate')}
                          title="These are different companies"
                        >Keep separate</button>
                      </div>
                    </div>
                  ` : null}
                </div>
              `;
            })}

            <div class="dedup-listing-foot muted small">
              Showing ${totalShown.toLocaleString()} of ${totalPending.toLocaleString()} pending
              ${hasMore ? html` · decide on some above to reveal more` : ''}
            </div>
          </div>
        ` : null}
      </div>

      ${activeJob ? html`<${JobLogPanel}
        title=${activeJob.title}
        jobId=${activeJob.id}
        kind="enrichment"
        onClose=${() => setActiveJob(null)}
        onComplete=${() => { load(); setActiveJob(null); }}
      />` : null}

      ${showAudit ? html`<${DedupAuditPanel} onClose=${() => setShowAudit(false)} />` : null}
    </div>
  `;
}
