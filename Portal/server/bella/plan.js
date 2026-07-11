// Bella — plan bundles (Phase 3: multi-action autonomy with ONE up-front
// approval). Val's spec (2026-07-08): a single request like "filter the top 3
// Interior Design companies, add them to my CRM, send personalized emails,
// enroll them in follow-ups, and set my title to CEO" must run END TO END:
// Bella asks anything unclear first, then proposes the WHOLE plan on one
// approval card; the user approves once; she executes every step with no
// further cards. Precedent: scheduled tasks ("approving the schedule IS the
// approval").
//
// The mechanics: propose_plan (tools.js) is an 'always'-gated tool, so it
// produces exactly one approval card listing the steps. When the user approves
// it, the continuation turn (brain.js) builds a GRANT from the plan's steps —
// a per-tool budget ({ send_email: 3, add_to_crm: 3, … }) — and every gated
// tool call in that turn consumes from the grant instead of raising a card.
// A tool NOT named in the plan still gates normally, the grant dies with the
// turn (never persisted), and every execution is still logged to the audit
// trail. PURE module (no db.js) so the grant semantics are unit-testable.

export const PLAN_MAX_STEPS = 20;

/** Normalize + bound the model-provided steps. Junk shapes are dropped. */
export function planSteps(args) {
  const raw = Array.isArray(args?.steps) ? args.steps : [];
  return raw
    .filter((s) => s && typeof s === 'object')
    .map((s) => ({
      tool: String(s.tool || '').trim().slice(0, 60),
      what: String(s.what || '').trim().slice(0, 200),
    }))
    .filter((s) => s.tool && s.what)
    .slice(0, PLAN_MAX_STEPS);
}

/**
 * The per-tool budget an approved plan grants — counted from its own steps.
 * `isKnownTool` keeps hallucinated tool names out of the grant (they'd never
 * execute anyway, but a grant must never contain what the card didn't show).
 */
export function buildPlanGrant(args, isKnownTool = () => true) {
  const grant = {};
  for (const s of planSteps(args)) {
    if (!isKnownTool(s.tool)) continue;
    if (s.tool === 'propose_plan') continue;   // a plan may never pre-approve another plan
    grant[s.tool] = (grant[s.tool] || 0) + 1;
  }
  return grant;
}

/** Consume one allowance. Returns true when the call is covered by the plan. */
export function takeGrant(grant, toolName) {
  if (!grant || !(grant[toolName] > 0)) return false;
  grant[toolName]--;
  return true;
}

/** Human summary for the approval card — the user must see EVERY step. */
export function planSummary(args) {
  const steps = planSteps(args);
  const title = String(args?.title || '').trim().slice(0, 80);
  const head = `Plan${title ? ' — ' + title : ''} (${steps.length} step${steps.length === 1 ? '' : 's'}): `;
  return head + steps.map((s, i) => `${i + 1}) ${s.what}`).join(' · ');
}

/** The continuation note the model narrates + executes from after approval. */
export function planApprovedNote(actionId, args) {
  const steps = planSteps(args);
  return `[System note: the user APPROVED your plan (action #${actionId}) on one card. Execute EVERY step now, in order — these exact actions are pre-approved for THIS turn and will not raise more approval cards. Do not re-propose the plan and do not stop between steps. If a step fails, say so and continue with the rest. The steps:\n`
    + steps.map((s, i) => `${i + 1}. [${s.tool}] ${s.what}`).join('\n')
    + '\nWhen done, summarize what happened in 2-3 sentences.]';
}
