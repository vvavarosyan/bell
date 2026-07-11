// /api/open-stats — the Qatar Market Pulse: business statistics derived from
// the open-data holdings (trade flows, real estate, business licences).
// Mounted behind the `feature` gate; the bundle is process-cached for 6h.

import { Router } from 'express';
import { marketPulse } from '../openstats/stats.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const bundle = await marketPulse();
    if (!bundle) return res.status(503).json({ error: 'stats_unavailable', reason: 'first compute failed — try again shortly' });
    res.json(bundle);
  } catch (err) { next(err); }
});

export default router;
