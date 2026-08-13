// /api/sync — local → Bell.qa canonical-data sync.
//
//   POST /api/sync/ingest       (PRODUCTION receiver) — upsert one table batch.
//                               Auth: Bearer === process.env.BDI_SYNC_TOKEN.
//   POST /api/sync/push         (LOCAL engine) — incremental push to prod.
//   POST /api/sync/full-resync  (LOCAL engine) — full push (ignores watermark).
//   GET  /api/sync/status       (LOCAL engine) — watermark + pending counts.
//
// The push/status routes only make sense on the local engine (BDI_MODE=
// local-admin); the ingest route only makes sense on prod. Each guards itself.

import { Router } from 'express';
import { query } from '../db.js';
import { requireAuth, requireRole } from '../lib/auth.js';
import { applyBatch, applyReset, applyDeletions, collectResearchPull } from '../sync/ingest.js';
import { runPush, getSyncStatus } from '../sync/push.js';
import { MIRROR_TABLE_NAMES } from '../sync/tables.js';

const MODE = (process.env.BDI_MODE || 'local-admin').toLowerCase();
const SYNC_TOKEN = process.env.BDI_SYNC_TOKEN || null;

const router = Router();

// ---------------------------------------------------------------------------
// PRODUCTION receiver — machine-to-machine, token auth (NOT Clerk).
// ---------------------------------------------------------------------------
function requireSyncToken(req, res, next) {
  if (!SYNC_TOKEN) {
    return res.status(503).json({ error: 'sync_disabled', reason: 'BDI_SYNC_TOKEN not set on this deployment' });
  }
  const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);
  if (!m || m[1] !== SYNC_TOKEN) {
    return res.status(401).json({ error: 'unauthorized', reason: 'bad_sync_token' });
  }
  next();
}

router.post('/ingest', requireSyncToken, async (req, res, next) => {
  try {
    const { table, rows } = req.body || {};
    if (!table) return res.status(400).json({ error: 'bad_request', reason: 'missing table' });
    const result = await applyBatch(table, rows || []);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Apply deletions (PRODUCTION receiver). Mirrors hard-deletes that happened on
// the local engine so prod stays an exact row-for-row copy. Token-auth.
// POST /api/sync/reconcile-merged — re-point TENANT data at merge survivors.
//
// Called by the push after deletions are applied. Runs HERE because the tenant tables (CRM
// records, paid reveals, list members, contributed datapoints) exist only on this deployment and
// are not mirrored — no local UPDATE can repair them. The mapping duplicate→canonical arrives
// with every push in companies.canonical_id, so by the time this runs the pointer is fresh.
// Idempotent, never deletes; collisions (a tenant tracking BOTH duplicates) are reported, not
// resolved — resolving one means deleting a record carrying the tenant's own notes.
router.post('/reconcile-merged', requireSyncToken, async (req, res, next) => {
  try {
    const { reconcileMergedEntityRefs } = await import('../sync/reconcile_merged.js');
    res.json(await reconcileMergedEntityRefs());
  } catch (err) { next(err); }
});

router.post('/delete', requireSyncToken, async (req, res, next) => {
  try {
    const { table, ids } = req.body || {};
    if (!table) return res.status(400).json({ error: 'bad_request', reason: 'missing table' });
    const result = await applyDeletions(table, ids || []);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// Research pull-source (PRODUCTION). Returns companies/people that research
// created or enriched on prod since the given watermark, so the local engine
// can pull them back and keep the two databases identical. Token-auth.
router.post('/research-pull', requireSyncToken, async (req, res, next) => {
  try {
    const since = (req.body && req.body.since) || '1970-01-01T00:00:00Z';
    res.json(await collectResearchPull(since));
  } catch (err) {
    next(err);
  }
});

// Drain research candidates from PROD after the local engine has absorbed them.
// Non-displayed companies (pending/non-Qatar) must NOT accumulate in the online
// DB — they live only locally. Token-auth, machine-to-machine.
router.post('/research-candidates-drain', requireSyncToken, async (req, res, next) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(Number).filter(Number.isFinite) : [];
    if (!ids.length) return res.json({ deleted: 0 });
    // Only drain rows still awaiting a decision — never touch an 'approved' one
    // (whose promoted company is part of the mirror).
    const r = await query(
      `DELETE FROM research_candidates WHERE id = ANY($1::bigint[]) AND kind IN ('pending','non_qatar','rejected')`,
      [ids],
    );
    res.json({ deleted: r.rowCount });
  } catch (err) {
    next(err);
  }
});

// Wipe the mirror tables (prod). Token-auth, machine-to-machine. The local
// engine calls this at the start of a "Rebuild mirror" before a full push.
router.post('/reset', requireSyncToken, async (req, res, next) => {
  try {
    res.json(await applyReset());
  } catch (err) {
    next(err);
  }
});

// Row count of a mirror table (PRODUCTION). Lets the local engine confirm a
// push landed — e.g. the Tenders tab's "synced?" indicator compares this to the
// local count. Token-auth, machine-to-machine. Table name is validated against
// the mirror whitelist before interpolation (never trust request input in SQL).
router.get('/count', requireSyncToken, async (req, res, next) => {
  try {
    const table = String(req.query.table || '');
    if (!MIRROR_TABLE_NAMES.has(table)) {
      return res.status(400).json({ error: 'bad_request', reason: 'unknown_table' });
    }
    const r = await query(`SELECT count(*)::int AS n FROM ${table}`);
    res.json({ table, count: r.rows[0].n });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sync/ids?table=people&after=0&limit=50000 — the ids production holds, ascending.
 *
 * ⚠️ WHY THIS EXISTS. Production is a strict id-mirror, but a hard delete only propagates through a
 * sync_deletions tombstone, and production has ZERO delete triggers. So every bulk DELETE that
 * forgets its tombstone leaves a row alive on production forever — a company, a person, a contact
 * that Bell itself has decided is wrong, still being served to customers.
 *
 * /count could say the two sides disagreed but never WHICH rows, so a known 260-row orphan set in
 * company_tech sat unresolved for want of a list, and a 7-row gap in people turned up the same way
 * the moment anyone compared. This returns the ids, so the diff is a one-liner and the fix is a
 * normal tombstoned deletion.
 *
 * Ids only — no names, no contact details, nothing personal. This endpoint is machine-to-machine
 * under the sync token and must stay that way, because `people` is PDPPL-sensitive and an
 * id list is the least it can possibly disclose.
 */
router.get('/ids', requireSyncToken, async (req, res, next) => {
  try {
    const table = String(req.query.table || '');
    if (!MIRROR_TABLE_NAMES.has(table)) {
      return res.status(400).json({ error: 'bad_request', reason: 'unknown_table' });
    }
    const after = Number(req.query.after || 0);
    if (!Number.isFinite(after)) return res.status(400).json({ error: 'bad_request', reason: 'bad_after' });
    // Capped, and the caller pages with `after` — an unbounded list of 200k ids in one response
    // is how a diagnostic endpoint becomes an outage.
    const limit = Math.min(Math.max(Number(req.query.limit) || 50000, 1), 100000);
    const r = await query(
      `SELECT id FROM ${table} WHERE id > $1 ORDER BY id LIMIT $2`, [after, limit]);
    const ids = r.rows.map((x) => Number(x.id));
    res.json({ table, after, limit, count: ids.length, next_after: ids.length ? ids[ids.length - 1] : null, ids });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------
// LOCAL engine — trigger a push. Guarded to local-admin mode + platform_admin.
// ---------------------------------------------------------------------------
function localOnly(req, res, next) {
  if (MODE !== 'local-admin') {
    return res.status(403).json({ error: 'forbidden', reason: 'push_only_runs_on_local_engine' });
  }
  next();
}

router.post('/push', localOnly, requireAuth, requireRole('platform_admin'), async (req, res, next) => {
  try {
    const summary = await runPush({ full: false });
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

router.post('/full-resync', localOnly, requireAuth, requireRole('platform_admin'), async (req, res, next) => {
  try {
    const summary = await runPush({ full: true });
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// Rebuild: wipe prod mirror tables, then full push from local. One-time use to
// migrate to id-keying, or any time prod has drifted and you want a clean copy.
router.post('/rebuild', localOnly, requireAuth, requireRole('platform_admin'), async (req, res, next) => {
  try {
    const summary = await runPush({ full: true, reset: true });
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

router.get('/status', localOnly, requireAuth, requireRole('platform_admin'), async (req, res, next) => {
  try {
    res.json(await getSyncStatus());
  } catch (err) {
    next(err);
  }
});

export default router;
