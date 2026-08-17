// The open-tracking pixel. Public and unauthenticated — the person fetching it is a mail
// client, not a logged-in user. Mounted at /t.
//
//   GET /t/o/:token.gif  → record the open, return a 1×1 transparent GIF.
//
// ⚠️ ALWAYS RETURNS THE IMAGE. An unknown token, a database hiccup, a token someone typed by
// hand — all get the same pixel and a 200. A tracking pixel that ever returns an error draws a
// broken-image icon in a customer's email, which would make Bell's own instrumentation visible
// to the recipient. Recording is best-effort; showing nothing is not optional.
//
// ⚠️ WHAT THIS PROVES IS LIMITED, AND THE UI SAYS SO. Mail clients that block remote images
// never fetch it (a real read goes unrecorded), and Gmail/Apple proxies fetch it before a human
// looks (a fetch is not proof of a human). Bell records "the image was fetched" and calls it
// that. It never upgrades the word to "read".

import express from 'express';
import { query } from '../db.js';
import { PIXEL } from '../lib/open_tracking.js';

const router = express.Router();

router.get('/o/:token.gif', async (req, res) => {
  const token = String(req.params.token || '').slice(0, 64);
  // Answer first: the image must not wait on a database write.
  res.set({
    'Content-Type': 'image/gif',
    'Content-Length': String(PIXEL.length),
    // Every fetch must reach the server: a cached pixel would report one open forever.
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    Pragma: 'no-cache',
    Expires: '0',
  });
  res.status(200).end(PIXEL);

  if (!/^[0-9a-f]{8,64}$/i.test(token)) return;
  try {
    // opened_at keeps the FIRST open (when it reached them); open_count counts every fetch.
    // status only ever moves forward: a 'bounced' or 'complained' row is not downgraded to
    // 'opened' because a proxy fetched an image afterwards.
    // (crm_emails has no updated_at column — checked, not assumed.)
    await query(
      `UPDATE crm_emails
          SET opened_at = COALESCE(opened_at, now()),
              open_count = open_count + 1,
              status = CASE WHEN status IN ('sent','delivered') THEN 'opened' ELSE status END
        WHERE open_token = $1`, [token]);
  } catch (err) {
    console.warn('[open-pixel] could not record open:', err.message);
  }
});

export default router;
