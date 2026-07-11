// Bella — pending-approvals inbox. Fixes the lost-approval-card bug
// (2026-07-11): a voice turn proposes an action in whatever conversation is
// newest, but the chat panel may be pinned to an older one — Bella says
// "click Approve" and the user finds no card anywhere. Cards drawn only from
// live SSE events also vanish on panel reload.
//
// This inbox is the durable surface: it reads the PROPOSED rows straight from
// bella_actions (the database truth), so a pending approval is always visible
// at the top of the Bella panel — whichever surface or device proposed it.
// Everyone refreshes on the 'bdi:bella-approvals-changed' window event
// (fired by chat + voice on new proposals and after any decision).

import { useState, useEffect, useCallback } from 'react';
import { html } from '../lib/html.js';
import { api } from '../lib/api.js';
import { toast } from '../lib/toast.js';

export const APPROVALS_EVENT = 'bdi:bella-approvals-changed';
export const fireApprovalsChanged = () => {
  try { window.dispatchEvent(new CustomEvent(APPROVALS_EVENT)); } catch { /* ignore */ }
};

/** The user's proposed (still-pending) Bella actions, newest first. */
async function fetchPending() {
  const r = await api.bellaActions(50);
  return (r.actions || []).filter((a) => a.status === 'proposed');
}

export function BellaApprovals() {
  const [pending, setPending] = useState([]);
  const [busyId, setBusyId] = useState(null);

  const refresh = useCallback(async () => {
    try { setPending(await fetchPending()); } catch { /* keep current */ }
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(APPROVALS_EVENT, refresh);
    return () => window.removeEventListener(APPROVALS_EVENT, refresh);
  }, [refresh]);

  const decide = async (a, verdict) => {
    if (busyId) return;
    setBusyId(a.id);
    try {
      const r = verdict === 'approved' ? await api.bellaApprove(a.id) : await api.bellaDeny(a.id);
      toast(verdict === 'approved'
        ? ('✓ ' + (r?.summary || a.result_summary || a.tool))
        : ('Denied — ' + (a.result_summary || a.tool)), verdict === 'approved' ? undefined : 'error');
    } catch (err) {
      toast('Could not process: ' + (err?.message || 'failed'), 'error');
    } finally {
      setBusyId(null);
      fireApprovalsChanged();   // everyone (badge, inline cards) resyncs
    }
  };

  if (!pending.length) return null;

  return html`<div class="bella-approvals-inbox" style=${{ borderBottom: '1px solid var(--border)', padding: '8px 10px', background: 'rgba(245,158,11,0.06)' }}>
    <div style=${{ fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--amber, #f59e0b)', marginBottom: '6px' }}>
      Waiting for your approval (${pending.length})
    </div>
    ${pending.map((a) => html`
      <div key=${a.id} class="bella-approval" style=${{ marginBottom: '6px' }}>
        <div class="bella-approval-summary">${a.result_summary || a.tool}</div>
        <div class="bella-approval-btns">
          <button class="bella-approve" disabled=${busyId != null} onClick=${() => decide(a, 'approved')}>${busyId === a.id ? 'Working…' : 'Approve'}</button>
          <button class="bella-deny" disabled=${busyId != null} onClick=${() => decide(a, 'denied')}>Deny</button>
        </div>
      </div>`)}
  </div>`;
}

/** Small badge count for the dock orb — shares the same event + data source. */
export function usePendingApprovalCount() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      try { const p = await fetchPending(); if (alive) setCount(p.length); } catch { /* ignore */ }
    };
    refresh();
    const t = setInterval(refresh, 60_000);
    window.addEventListener(APPROVALS_EVENT, refresh);
    return () => { alive = false; clearInterval(t); window.removeEventListener(APPROVALS_EVENT, refresh); };
  }, []);
  return count;
}
