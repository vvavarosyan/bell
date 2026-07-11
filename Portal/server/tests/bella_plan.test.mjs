// Bella plan bundles (Phase 3 — one up-front approval) — grant semantics tests.
//
// The safety contract under test: a grant covers EXACTLY what the approval
// card showed — same tools, same counts, nothing hallucinated, and never
// another plan. Run:  node server/tests/bella_plan.test.mjs

import assert from 'node:assert/strict';
import { planSteps, buildPlanGrant, takeGrant, planSummary, planApprovedNote, PLAN_MAX_STEPS } from '../bella/plan.js';

let pass = 0;
const t = (name, fn) => { fn(); pass++; console.log(`  ✓ ${name}`); };

const VAL_SCENARIO = { title: 'Interior Design outreach', steps: [
  { tool: 'reveal_companies', what: 'Reveal the top 3 Interior Design companies (3 credits)' },
  { tool: 'add_to_crm', what: 'Add Al Waab Design to the CRM' },
  { tool: 'add_to_crm', what: 'Add Doha Interiors to the CRM' },
  { tool: 'add_to_crm', what: 'Add Studio Q to the CRM' },
  { tool: 'send_email', what: 'Send personalized email to Al Waab Design (info@alwaab.qa)' },
  { tool: 'send_email', what: 'Send personalized email to Doha Interiors (hello@dohainteriors.qa)' },
  { tool: 'send_email', what: 'Send personalized email to Studio Q (contact@studioq.qa)' },
  { tool: 'enroll_in_sequence', what: 'Enroll all three in the follow-up sequence' },
  { tool: 'update_account_prefs', what: 'Change your title in Settings to CEO' },
] };

console.log('\nnormalization:');
t('valid steps pass through; junk shapes are dropped', () => {
  assert.equal(planSteps(VAL_SCENARIO).length, 9);
  assert.equal(planSteps({ steps: [null, 'x', {}, { tool: 'a' }, { what: 'b' }, { tool: 'send_email', what: 'ok' }] }).length, 1);
  assert.deepEqual(planSteps(null), []);
});
t('a runaway plan is bounded to ' + PLAN_MAX_STEPS + ' steps', () => {
  const big = { steps: Array.from({ length: 99 }, (_, i) => ({ tool: 'add_to_crm', what: 'step ' + i })) };
  assert.equal(planSteps(big).length, PLAN_MAX_STEPS);
});

console.log('\ngrant building (the card IS the contract):');
t("Val's scenario grants exactly its own counts", () => {
  const g = buildPlanGrant(VAL_SCENARIO);
  assert.deepEqual(g, { reveal_companies: 1, add_to_crm: 3, send_email: 3, enroll_in_sequence: 1, update_account_prefs: 1 });
});
t('hallucinated tool names never enter the grant', () => {
  const g = buildPlanGrant({ steps: [{ tool: 'launch_rocket', what: 'x' }, { tool: 'send_email', what: 'y' }] },
    (name) => name === 'send_email');
  assert.deepEqual(g, { send_email: 1 });
});
t('a plan can NEVER pre-approve another plan', () => {
  const g = buildPlanGrant({ steps: [{ tool: 'propose_plan', what: 'sneaky nested plan' }, { tool: 'add_to_crm', what: 'ok' }] });
  assert.deepEqual(g, { add_to_crm: 1 });
});

console.log('\ngrant consumption:');
t('each allowance is consumed exactly once, then the gate returns', () => {
  const g = buildPlanGrant({ steps: [{ tool: 'send_email', what: 'a' }, { tool: 'send_email', what: 'b' }] });
  assert.equal(takeGrant(g, 'send_email'), true);
  assert.equal(takeGrant(g, 'send_email'), true);
  assert.equal(takeGrant(g, 'send_email'), false);   // third send was NOT on the card
  assert.equal(takeGrant(g, 'delete_deal'), false);  // never named → never covered
  assert.equal(takeGrant(null, 'send_email'), false); // no plan → normal gating
});

console.log('\nhuman surfaces:');
t('the card summary lists every step, numbered', () => {
  const s = planSummary(VAL_SCENARIO);
  assert.ok(s.startsWith('Plan — Interior Design outreach (9 steps): 1) Reveal the top 3'));
  assert.ok(s.includes('9) Change your title in Settings to CEO'));
});
t('the approved note tells Bella to execute every step without stopping', () => {
  const n = planApprovedNote(42, VAL_SCENARIO);
  assert.ok(n.includes('action #42'));
  assert.ok(n.includes('will not raise more approval cards'));
  assert.ok(n.includes('9. [update_account_prefs]'));
});

console.log(`\n${pass}/${pass} PASS\n`);
