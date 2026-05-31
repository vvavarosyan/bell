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
import { requireAuth, requireRole } from '../lib/auth.js';
import { applyBatch, applyReset, applyDeletions, collectResearchPull } from '../sync/ingest.js';
import { runPush, getSyncStatus } from '../sync/push.js';

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

// Wipe the mirror tables (prod). Token-auth, machine-to-machine. The local
// engine calls this at the start of a "Rebuild mirror" before a full push.
router.post('/reset', requireSyncToken, async (req, res, next) => {
  try {
    res.json(await applyReset());
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
