// Address Review — the human half of "who owns this mailbox?".
//
// Bell auto-decides only what survived adversarial review. Everything else comes here with
// the evidence Bell actually holds, and Val decides. His verdict is final: no later auto pass
// may overwrite a row whose decided_by = 'val'.
//
// Local engine only (like Discovery Review) — it writes canonical data, and prod is a mirror.

import express from 'express';
import { query } from '../db.js';
import { buildAddressQueue, applyAutoVerdicts, recordVerdict } from '../outreach/address_evidence.js';

const router = express.Router();

// The queue is a full-pool scan (~4s). Cache it briefly so paging and refreshes are instant,
// and drop the cache the moment a decision lands.
let cache = null;
const CACHE_MS = 120_000;
const invalidate = () => { cache = null; };
async function getQueue() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.data;
  const data = await buildAddressQueue();
  cache = { at: Date.now(), data };
  return data;
}

/** Counts for the tab header. */
router.get('/summary', async (req, res, next) => {
  try {
    const { auto, proposals } = await getQueue();
    const actionable = proposals.filter((p) => p.rule_id);
    const decided = (await query(
      `SELECT verdict, count(*)::int n FROM address_verdicts GROUP BY 1`).catch(() => ({ rows: [] }))).rows;
    res.json({
      auto_pending: auto.length,
      proposals: actionable.length,
      undecidable: proposals.length - actionable.length,
      decided: decided.reduce((m, r) => ({ ...m, [r.verdict]: r.n }), {}),
      decided_total: decided.reduce((n, r) => n + r.n, 0),
    });
  } catch (e) { next(e); }
});

/**
 * The review rows. `bucket`:
 *   'suggested'   — Bell proposes a verdict and shows why (default; this is the real work)
 *   'undecidable' — nothing in Bell settles it; excluded from outreach either way
 *   'auto'        — what the auto rules would write, shown for transparency before applying
 */
router.get('/queue', async (req, res, next) => {
  try {
    const bucket = String(req.query.bucket || 'suggested');
    const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
    const { auto, proposals } = await getQueue();
    let rows = bucket === 'auto' ? auto
      : bucket === 'undecidable' ? proposals.filter((p) => !p.rule_id)
      : proposals.filter((p) => p.rule_id);
    // Strongest evidence first, then the ones that unlock sends (role_mailbox), then the rest.
    const order = { strong: 0, good: 1, review: 2, unknown: 3 };
    rows = [...rows].sort((a, b) =>
      (order[a.confidence] ?? 9) - (order[b.confidence] ?? 9) ||
      String(a.rule_id || '').localeCompare(String(b.rule_id || '')));
    res.json({ total: rows.length, rows: rows.slice(0, limit) });
  } catch (e) { next(e); }
});

/** Val decides one address. */
router.post('/decide', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const verdict = String(req.body?.verdict || '');
    const ALLOWED = ['role_mailbox', 'named_person', 'not_a_company_address', 'left_unresolved'];
    if (!email.includes('@')) return res.status(400).json({ error: 'bad_email' });
    if (!ALLOWED.includes(verdict)) return res.status(400).json({ error: 'bad_verdict', allowed: ALLOWED });
    await recordVerdict({
      email, verdict,
      suggested: req.body?.suggested || null,
      rule_id: req.body?.rule_id || null,
      evidence: req.body?.evidence || {},
      note: req.body?.note || null,
    });
    invalidate();
    res.json({ ok: true, email, verdict });
  } catch (e) { next(e); }
});

/**
 * Accept a whole rule's proposals at once (e.g. "all 134 P1 given-name rows are people").
 * Scoped to ONE rule id, never "everything", and each row still records the evidence it was
 * decided on. Only offered in the UI for rules whose direction is safe.
 */
router.post('/decide-rule', async (req, res, next) => {
  try {
    const ruleId = String(req.body?.rule_id || '');
    const verdict = String(req.body?.verdict || '');
    if (!ruleId) return res.status(400).json({ error: 'rule_id_required' });
    if (!['named_person', 'not_a_company_address', 'left_unresolved'].includes(verdict)) {
      // role_mailbox is deliberately NOT bulk-appliable: it is the tier that ENABLES cold email,
      // and no rule for it survived adversarial review. Those stay one click at a time.
      return res.status(400).json({ error: 'verdict_not_bulk_appliable', reason: 'Only person / not-a-company / unresolved can be applied in bulk.' });
    }
    const { proposals } = await getQueue();
    const rows = proposals.filter((p) => p.rule_id === ruleId);
    let n = 0;
    for (const r of rows) {
      await recordVerdict({ email: r.email, verdict, suggested: r.suggested, rule_id: r.rule_id, evidence: r.evidence });
      n += 1;
    }
    invalidate();
    res.json({ ok: true, decided: n, rule_id: ruleId, verdict });
  } catch (e) { next(e); }
});

/** Run the auto rules (A1 + A3). dryRun by default. */
router.post('/auto-run', async (req, res, next) => {
  try {
    const dryRun = req.body?.apply !== true;
    const { auto } = await getQueue();
    const r = await applyAutoVerdicts(auto, { dryRun });
    if (!dryRun) invalidate();
    res.json({ ok: true, dryRun, ...r });
  } catch (e) { next(e); }
});

/** Undo — reverts to no recorded verdict, so the address returns to the queue. */
router.post('/undo', async (req, res, next) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const r = await query(`DELETE FROM address_verdicts WHERE lower(email)=$1`, [email]);
    invalidate();
    res.json({ ok: true, removed: r.rowCount });
  } catch (e) { next(e); }
});

export default router;
