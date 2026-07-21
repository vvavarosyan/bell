// Address auto-decide — write only the verdicts that survived adversarial review.
//
// Two rules, both in the SAFE direction (they mark people and junk; neither one ever makes an
// address emailable). No rule for the sendable direction survived review, so promoting an
// address to "company inbox" is always Val's own click in the Address Review screen.
//
//   A1  a person Bell links to THIS company shares the mailbox's exact name token → a person.
//   A3  the domain is a website-template placeholder (mysite.com, yourwebsite.com) → not a
//       company address at all.
//
// Preview by default; writes only with --apply.

import { query } from '../db.js';
import { buildAddressQueue, applyAutoVerdicts } from '../outreach/address_evidence.js';

const apply = process.argv.includes('--apply');
const trunc = (s, n) => (String(s || '').length > n ? String(s).slice(0, n - 1) + '…' : String(s || ''));

const RULES = {
  A1: 'a person Bell links to this company has this exact name',
  A3: 'a website-template placeholder domain, not a real company address',
};

async function main() {
  console.log('');
  console.log('BELL — ADDRESS AUTO-DECIDE' + (apply ? '   (APPLYING)' : '   (PREVIEW — nothing is written)'));
  console.log('==========================================================');
  console.log('');

  const { auto, proposals } = await buildAddressQueue();
  const byRule = {};
  for (const a of auto) (byRule[a.rule_id] ||= []).push(a);

  for (const [rule, list] of Object.entries(byRule)) {
    console.log(`${rule} — ${list.length} address(es): ${RULES[rule] || ''}`);
    for (const a of list.slice(0, 10)) {
      const why = a.evidence.person ? 'person on file: ' + a.evidence.person : 'domain: ' + a.evidence.domain;
      console.log('     ' + trunc(a.email, 34).padEnd(36) + '→ ' + a.verdict.padEnd(23) + trunc(why, 44));
    }
    if (list.length > 10) console.log(`     …and ${list.length - 10} more`);
    console.log('');
  }
  if (!auto.length) console.log('Nothing to decide automatically right now.\n');

  const actionable = proposals.filter((p) => p.rule_id);
  console.log('LEFT FOR YOU (not touched here):');
  console.log(`  ${actionable.length} with evidence + a suggested answer  → local Portal → "Address Review"`);
  console.log(`  ${proposals.length - actionable.length} Bell cannot settle — they stay OUT of outreach, which is the safe default`);
  console.log('');
  console.log('None of the automatic verdicts makes an address emailable. Marking something a');
  console.log('company inbox is always your own click — no rule for that survived review.');
  console.log('');

  if (!apply) {
    console.log('PREVIEW ONLY — nothing was written.');
    console.log('Double-click "Apply Address Auto-Decide.command" to record these.');
    console.log('');
    return;
  }
  const r = await applyAutoVerdicts(auto, { dryRun: false });
  console.log(`Recorded ${r.written} verdict(s). Every one is reversible from the Address Review screen.`);
  console.log('They publish to the live site on the next data push.');
  console.log('');
}

main().then(() => process.exit(0)).catch((e) => { console.error('Stopped:', e.stack || e.message); process.exit(1); });
