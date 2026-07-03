// /api/public/bella — Marketing Bella's public endpoint (Phase G3).
//
// PUBLIC by design (mounted with no auth, like /api/public/news) and
// DATA-FREE by construction: the import graph here is express + the
// marketing brain (static knowledge pack) — no db module anywhere.
//
// Abuse control (in-memory, per instance): token bucket per IP — 1 message
// per 8s refill, burst 6, 120/day — plus a global concurrency cap. Resets on
// deploy; fine for a chat widget, and Cloudflare sits in front on prod.

import express from 'express';
import { runMarketingTurn } from '../bella/marketing.js';

const router = express.Router();

const REFILL_MS   = 8_000;
const BURST       = 6;
const DAILY_CAP   = 120;
const MAX_CONCURRENT = 8;

const buckets = new Map();   // ip → { tokens, last, day, dayCount }
let inFlight = 0;

// Hourly sweep so the map never grows unbounded.
setInterval(() => {
  const cutoff = Date.now() - 6 * 3600_000;
  for (const [ip, b] of buckets) if (b.last < cutoff) buckets.delete(ip);
}, 3600_000).unref?.();

function clientIp(req) {
  return String(
    req.headers['cf-connecting-ip']
    || String(req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.ip || req.socket?.remoteAddress || 'unknown'
  ).slice(0, 64);
}

export function checkRate(ip, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  let b = buckets.get(ip);
  if (!b) { b = { tokens: BURST, last: now, day, dayCount: 0 }; buckets.set(ip, b); }
  if (b.day !== day) { b.day = day; b.dayCount = 0; }
  // Refill.
  b.tokens = Math.min(BURST, b.tokens + (now - b.last) / REFILL_MS);
  b.last = now;
  if (b.dayCount >= DAILY_CAP) return { ok: false, reason: 'daily' };
  if (b.tokens < 1) return { ok: false, reason: 'rate' };
  b.tokens -= 1;
  b.dayCount += 1;
  return { ok: true };
}

// POST /api/public/bella/chat  { message, history?, context?: { path } }
router.post('/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message || message.length > 800) {
    return res.status(400).json({ error: 'message required (1–800 chars)' });
  }

  const rate = checkRate(clientIp(req));
  if (!rate.ok) {
    return res.status(429).json({
      error: 'rate_limited',
      message: rate.reason === 'daily'
        ? "You've reached today's chat limit — email support@bell.qa and a human will pick it up."
        : 'A moment please — you\'re sending messages faster than Bella can read them.',
    });
  }
  if (inFlight >= MAX_CONCURRENT) {
    return res.status(503).json({ error: 'busy', message: 'Bella is helping a lot of visitors right now — try again in a few seconds.' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* gone */ }
  };
  const heartbeat = setInterval(() => { try { res.write(':hb\n\n'); } catch { /* ignore */ } }, 15_000);

  const abort = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });

  inFlight++;
  try {
    await runMarketingTurn({
      message,
      history: req.body?.history,
      currentPath: req.body?.context?.path,
      send,
      signal: abort.signal,
    });
  } catch (err) {
    console.error('[bella-mkt] route error:', err.message);
    send('error', { message: 'Something went wrong — please try again.' });
  } finally {
    inFlight--;
    clearInterval(heartbeat);
    try { res.end(); } catch { /* ignore */ }
  }
});

export default router;
