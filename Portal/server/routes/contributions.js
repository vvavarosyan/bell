// /api/contributions — admin curation of user-contributed data (Import Phase 2).
//
// Mounted under `adminOnly` (admin deployment + local), NOT localTools — because
// the contributions (datapoints, imports, new entities) are CUSTOMER STATE created
// on the live app, so the admin must review them where they live. Two streams:
//   • datapoints   — fields users added to records
//   • new-entities — companies/people users added + imported rows
// Promote writes the value/entity into the canonical companies/people tables.

import { Router } from 'express';
import {
  listPool, poolCounts, promoteDatapoint, rejectDatapoint, peopleEnrichEnabled, setPeopleEnrichEnabled,
  listNewEntities, newEntityCounts, promoteNewEntity, rejectNewEntity,
} from '../lib/contributions.js';

const router = Router();
const by = (req) => req.user?.email || 'admin';

// Toggle the lawyer-gate that lets the admin promote PERSON data into Bell.
router.post('/people-gate', async (req, res, next) => {
  try { res.json({ people_enabled: await setPeopleEnrichEnabled(req.body?.enabled === true) }); }
  catch (err) { next(err); }
});

// ── Datapoints ──────────────────────────────────────────────────────────────
router.get('/datapoints', async (req, res, next) => {
  try {
    const status = req.query.status || 'pending';
    const entityType = req.query.entity_type || null;
    const [pool, counts, peopleGate] = await Promise.all([
      listPool({ status, entityType, limit: Math.min(Number(req.query.limit ?? 200), 500), offset: Math.max(Number(req.query.offset ?? 0), 0) }),
      poolCounts(),
      peopleEnrichEnabled(),
    ]);
    res.json({ ...pool, counts, people_enabled: peopleGate });
  } catch (err) { next(err); }
});

router.post('/datapoints/:id/promote', async (req, res, next) => {
  try { res.json(await promoteDatapoint({ id: req.params.id, decidedBy: by(req) })); }
  catch (err) {
    if (/person_gated/.test(String(err.message))) return res.status(403).json({ error: 'person_gated' });
    if (/not_found/.test(String(err.message))) return res.status(404).json({ error: 'not_found' });
    next(err);
  }
});

router.post('/datapoints/:id/reject', async (req, res, next) => {
  try { res.json(await rejectDatapoint({ id: req.params.id, decidedBy: by(req) })); }
  catch (err) { if (/not_found/.test(String(err.message))) return res.status(404).json({ error: 'not_found' }); next(err); }
});

// ── New entities ──────────────────────────────────────────────────────────────
router.get('/new-entities', async (req, res, next) => {
  try {
    const status = req.query.status || 'pending_review';
    const kind = req.query.kind || null;
    const [pool, counts, peopleGate] = await Promise.all([
      listNewEntities({ status, kind, limit: Math.min(Number(req.query.limit ?? 200), 500), offset: Math.max(Number(req.query.offset ?? 0), 0) }),
      newEntityCounts(),
      peopleEnrichEnabled(),
    ]);
    res.json({ ...pool, counts, people_enabled: peopleGate });
  } catch (err) { next(err); }
});

router.post('/new-entities/:id/promote', async (req, res, next) => {
  try { res.json(await promoteNewEntity({ id: req.params.id, decidedBy: by(req) })); }
  catch (err) {
    if (/person_gated/.test(String(err.message))) return res.status(403).json({ error: 'person_gated' });
    if (/not_found/.test(String(err.message))) return res.status(404).json({ error: 'not_found' });
    next(err);
  }
});

router.post('/new-entities/:id/reject', async (req, res, next) => {
  try { res.json(await rejectNewEntity({ id: req.params.id, decidedBy: by(req) })); }
  catch (err) { if (/not_found/.test(String(err.message))) return res.status(404).json({ error: 'not_found' }); next(err); }
});

export default router;
