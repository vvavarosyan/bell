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
import { transcribe, ttsStream, voiceConfigured } from '../bella/voice.js';

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

// ---------------------------------------------------------------------------
// Voice for the marketing widget (Val 2026-07-03, revising his earlier D4).
// Visitors are anonymous, ElevenLabs minutes cost real money, and a public
// TTS endpoint is a free-audio magnet — so the voice buckets are much
// tighter than chat: burst 3, one per 15s, 60/day per IP, text ≤ 600 chars.
// ---------------------------------------------------------------------------

const voiceBuckets = new Map();
const V_REFILL_MS = 15_000;
const V_BURST = 3;
const V_DAILY = 60;

setInterval(() => {
  const cutoff = Date.now() - 6 * 3600_000;
  for (const [ip, b] of voiceBuckets) if (b.last < cutoff) voiceBuckets.delete(ip);
}, 3600_000).unref?.();

export function checkVoiceRate(ip, now = Date.now()) {
  const day = new Date(now).toISOString().slice(0, 10);
  let b = voiceBuckets.get(ip);
  if (!b) { b = { tokens: V_BURST, last: now, day, dayCount: 0 }; voiceBuckets.set(ip, b); }
  if (b.day !== day) { b.day = day; b.dayCount = 0; }
  b.tokens = Math.min(V_BURST, b.tokens + (now - b.last) / V_REFILL_MS);
  b.last = now;
  if (b.dayCount >= V_DAILY) return { ok: false, reason: 'daily' };
  if (b.tokens < 1) return { ok: false, reason: 'rate' };
  b.tokens -= 1;
  b.dayCount += 1;
  return { ok: true };
}

const voiceUnavailable = (res) =>
  res.status(503).json({ error: 'voice_not_configured', message: 'Voice isn\'t available right now — chat works!' });
const voiceLimited = (res) =>
  res.status(429).json({ error: 'rate_limited', message: 'Voice needs a short breather — keep chatting by text meanwhile.' });

// POST /api/public/bella/voice/transcribe — raw audio → text.
router.post('/voice/transcribe',
  express.raw({ type: ['audio/*', 'video/*', 'application/octet-stream'], limit: '10mb' }),
  async (req, res) => {
    if (!req.body || !req.body.length) return res.status(400).json({ error: 'no_audio' });
    if (!checkVoiceRate(clientIp(req)).ok) return voiceLimited(res);
    if (!(await voiceConfigured())) return voiceUnavailable(res);
    try {
      res.json(await transcribe(req.body, req.headers['content-type']));
    } catch (err) {
      console.error('[bella-mkt] transcribe failed:', err.message);
      res.status(502).json({ error: 'transcribe_failed', message: 'Couldn\'t hear that — try again.' });
    }
  });

// POST /api/public/bella/voice/tts { text ≤600 } → audio/mpeg.
router.post('/voice/tts', async (req, res) => {
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ error: 'text_required' });
  if (text.length > 600) return res.status(400).json({ error: 'too_long' });
  if (!checkVoiceRate(clientIp(req)).ok) return voiceLimited(res);
  if (!(await voiceConfigured())) return voiceUnavailable(res);
  const abort = new AbortController();
  res.on('close', () => { if (!res.writableEnded) abort.abort(); });
  try {
    const el = await ttsStream(text, abort.signal);
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' });
    for await (const chunk of el.body) {
      if (res.writableEnded) break;
      res.write(chunk);
    }
    res.end();
  } catch (err) {
    if (err?.name !== 'AbortError') console.error('[bella-mkt] tts failed:', err.message);
    if (!res.headersSent) res.status(502).json({ error: 'tts_failed' });
    else { try { res.end(); } catch { /* ignore */ } }
  }
});

// GET /api/public/bella/voice/status
router.get('/voice/status', async (_req, res) => {
  res.json({ configured: await voiceConfigured() });
});

export default router;
