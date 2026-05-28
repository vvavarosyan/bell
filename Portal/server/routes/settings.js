// /api/settings — non-secret settings (in Postgres) + API key presence (Keychain).
//
// Keys themselves never leave the Keychain. The Portal can only ask "is the
// firecrawl key set?" or "set/replace the firecrawl key" — it cannot read the
// raw value from the server's HTTP response.

import { Router } from 'express';
import { query } from '../db.js';
import { setKey, deleteKey, hasKey, listKeyNames, getKey } from '../keychain.js';

const router = Router();

router.get('/', async (req, res, next) => {
  try {
    const dbRows = await query(
      `SELECT key, value FROM settings ORDER BY key`
    );
    const settings = {};
    for (const r of dbRows.rows) settings[r.key] = r.value;

    const installedKeys = await listKeyNames();
    const apiKeyStatus = { firecrawl: false, apify: false, mapbox: false };
    for (const name of installedKeys) {
      if (name in apiKeyStatus) apiKeyStatus[name] = true;
    }

    res.json({ settings, api_keys: apiKeyStatus });
  } catch (err) { next(err); }
});

router.patch('/', async (req, res, next) => {
  try {
    const updates = req.body || {};
    const updated = [];
    for (const [key, value] of Object.entries(updates)) {
      if (!/^[a-z][a-z0-9_]+$/.test(key)) {
        return res.status(400).json({ error: 'bad_key_name', key });
      }
      await query(
        `INSERT INTO settings (key, value) VALUES ($1, $2::jsonb)
         ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
        [key, JSON.stringify(value)]
      );
      updated.push(key);
    }
    res.json({ updated });
  } catch (err) { next(err); }
});

// POST /api/settings/api-keys/:name { value }
router.post('/api-keys/:name', async (req, res, next) => {
  try {
    const name = req.params.name;
    const value = req.body?.value;
    if (typeof value !== 'string' || !value.trim()) {
      return res.status(400).json({ error: 'value_required' });
    }
    if (!['firecrawl', 'apify', 'mapbox', 'sync-token'].includes(name)) {
      return res.status(400).json({ error: 'unknown_key_name', name });
    }
    await setKey(name, value.trim());
    res.json({ name, stored: true });
  } catch (err) { next(err); }
});

// DELETE /api/settings/api-keys/:name
router.delete('/api-keys/:name', async (req, res, next) => {
  try {
    const name = req.params.name;
    if (!['firecrawl', 'apify', 'mapbox', 'sync-token'].includes(name)) {
      return res.status(400).json({ error: 'unknown_key_name', name });
    }
    const removed = await deleteKey(name);
    res.json({ name, removed });
  } catch (err) { next(err); }
});

// GET /api/settings/public-token/:name
// Returns a public-tier API token to the browser. Used by Mapbox GL JS, which
// requires the pk.* access token in JS. We never expose secret keys via this
// route — only ones whitelisted as safe-to-publish.
const PUBLIC_TOKEN_WHITELIST = new Set(['mapbox']);
router.get('/public-token/:name', async (req, res, next) => {
  try {
    const name = req.params.name;
    if (!PUBLIC_TOKEN_WHITELIST.has(name)) {
      return res.status(403).json({ error: 'not_a_public_token' });
    }
    const value = await getKey(name);
    if (!value) return res.status(404).json({ error: 'not_set' });
    res.json({ name, value });
  } catch (err) { next(err); }
});

export default router;
