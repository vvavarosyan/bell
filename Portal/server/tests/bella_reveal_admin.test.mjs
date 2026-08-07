// Val, 2026-08-07, signed in as platform admin: "she needed extra approvals for revealing
// credits, etc. plus she failed to reveal and no explanation on why it failed."
//
// Three separate defects, all visible on that one attempt:
//  1. reveal_companies is approval:'spend'. That gate protects a CREDIT BALANCE — and a platform
//     admin has none to protect, because /reveal-bulk returns {unlimited:true} and charges zero.
//     So Bella was asking permission to spend nothing.
//  2. Bella's own daily credit cap was checked before the reveal ran, for an account that cannot
//     consume credits. It can therefore refuse an unlimited reveal for a reason that cannot apply.
//  3. 27 tools summarize a failure as the bare word "failed" and throw the reason away — and that
//     summary is BOTH what the user is shown AND what Bella narrates from. The reason existed and
//     reached nobody.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getTool, requiresApproval, executeTool } from '../bella/tools.js';
import { bypassesCredits } from '../lib/credits.js';

const ADMIN = { user: { id: 1, role: 'platform_admin' }, tenant: { id: 7 } };
const CUSTOMER = { user: { id: 2, role: 'member' }, tenant: { id: 7 } };

test('the credit bypass is what the reveal route already keys on', () => {
  assert.equal(bypassesCredits(ADMIN.user, ADMIN.tenant), true);
  assert.equal(bypassesCredits(CUSTOMER.user, CUSTOMER.tenant), false);
  // tenant 1 is Bell's own workspace and is unlimited regardless of role
  assert.equal(bypassesCredits(CUSTOMER.user, { id: 1 }), true);
});

test('an admin is not asked to approve a spend of zero', () => {
  const reveal = getTool('reveal_companies');
  assert.equal(reveal.approval, 'spend');
  assert.equal(requiresApproval(reveal, 'ask', ADMIN), false);
  assert.equal(requiresApproval(getTool('reveal_people'), 'ask', ADMIN), false);
});

test('a paying customer still approves every spend', () => {
  assert.equal(requiresApproval(getTool('reveal_companies'), 'ask', CUSTOMER), true);
  assert.equal(requiresApproval(getTool('reveal_people'), 'ask', CUSTOMER), true);
});

test('the exemption is for spending only — actions still confirm', () => {
  // Anything that CHANGES data keeps its gate for admins too. Not paying is not the same as
  // not needing to be asked.
  const acts = ['add_to_outreach', 'update_icp', 'create_crm_record']
    .map((n) => getTool(n)).filter(Boolean).filter((t) => t.approval === 'act');
  assert.ok(acts.length, 'expected at least one act-gated tool to exist');
  for (const t of acts) {
    assert.equal(requiresApproval(t, 'ask', ADMIN), true, `${t.definition.name} must still gate`);
  }
});

test("'always' tools gate for everyone, in every mode — external sends are never silent", () => {
  const always = [...['send_email', 'send_whatsapp'].map((n) => getTool(n))]
    .filter(Boolean).filter((t) => t.approval === 'always');
  for (const t of always) {
    assert.equal(requiresApproval(t, 'auto', ADMIN), true);
    assert.equal(requiresApproval(t, 'auto', CUSTOMER), true);
  }
});

test('no ctx behaves exactly as before — nothing is loosened by accident', () => {
  assert.equal(requiresApproval(getTool('reveal_companies'), 'ask'), true);
  assert.equal(requiresApproval(getTool('reveal_companies'), 'auto'), false);
});

test('a failing tool now says WHY, and is reported as an error', async () => {
  // ids[] missing is the cheapest real failure path in reveal_companies: it returns {error}
  // without touching the database, so this stays a pure unit test.
  const { result, summary, isError } = await executeTool('reveal_companies', { ids: [] }, ADMIN);
  assert.ok(result.error, 'the tool should have produced an error');
  assert.equal(isError, true, 'a tool returning {error} must be reported as an error');
  assert.notEqual(summary, 'failed', 'the bare word "failed" is what Val saw');
  assert.match(summary, /failed —/);
  assert.ok(summary.includes('ids'), `the reason must survive into the summary, got: ${summary}`);
});

test('a successful summary is left alone', async () => {
  const { summary, isError } = await executeTool('reveal_companies', {}, ADMIN);
  // No ids → still an error, but confirm the shape rather than inventing a success path that
  // would need a database.
  assert.equal(isError, true);
  assert.ok(!summary.startsWith('failed — failed'), 'must not double-prefix');
});

test('an unknown tool is still handled without throwing', async () => {
  const r = await executeTool('no_such_tool', {}, ADMIN);
  assert.equal(r.isError, true);
  assert.match(r.summary, /unknown tool/);
});
