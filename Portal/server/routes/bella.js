// /api/bella — Bella's chat + conversation endpoints (Phase G1).
//
// Mounted with the `feature` gate (signed in + active subscription), so
// req.user/req.tenant are the same server-derived identity every other
// feature route trusts. Each user only ever sees their own conversations
// and actions (locked isolation commitment #3).
//
// POST /chat answers over Server-Sent Events — the first SSE endpoint in the
// app. Headers below matter: no-transform keeps proxies (Cloudflare/Railway)
// from buffering the stream; the heartbeat comment keeps idle connections
// alive through them.

import express from 'express';
import { runBellaTurn } from '../bella/brain.js';
import * as store from '../bella/store.js';

const router = express.Router();

// POST /api/bella/chat  { conversation_id?, message, context?: { section } }
router.post('/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim();
  if (!message || message.length > 4000) {
    return res.status(400).json({ error: 'message required (1–4000 chars)' });
  }
  const conversationId = req.body?.conversation_id ? Number(req.body.conversation_id) : null;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders?.();

  const send = (event, data) => {
    try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch { /* client gone */ }
  };
  const heartbeat = setInterval(() => { try { res.write(':hb\n\n'); } catch { /* ignore */ } }, 15_000);

  const abort = new AbortController();
  req.on('close', () => abort.abort());

  try {
    await runBellaTurn({
      ctx: { user: req.user, tenant: req.tenant },
      conversationId,
      userText: message,
      clientContext: req.body?.context || {},
      send,
      signal: abort.signal,
    });
  } catch (err) {
    // runBellaTurn reports its own errors; this catches anything above it.
    console.error('[bella] chat route error:', err.message);
    send('error', { message: 'Something went wrong on Bella\'s side.' });
  } finally {
    clearInterval(heartbeat);
    try { res.end(); } catch { /* ignore */ }
  }
});

// GET /api/bella/conversations
router.get('/conversations', async (req, res, next) => {
  try {
    const rows = await store.listConversations(req.tenant.id, req.user?.id ?? 0, req.query.limit);
    res.json({ conversations: rows });
  } catch (err) { next(err); }
});

// GET /api/bella/conversations/:id/messages
router.get('/conversations/:id/messages', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const owned = await store.getOwnedConversation(req.tenant.id, req.user?.id ?? 0, id);
    if (!owned) return res.status(404).json({ error: 'not_found' });
    const rows = await store.listMessagesForUi(id);
    // Pure tool-result rows carry no display text — the UI has nothing to render.
    res.json({ conversation: owned, messages: rows.filter((m) => m.content || m.meta) });
  } catch (err) { next(err); }
});

// DELETE /api/bella/conversations/:id
router.delete('/conversations/:id', async (req, res, next) => {
  try {
    const gone = await store.deleteConversation(req.tenant.id, req.user?.id ?? 0, Number(req.params.id));
    if (!gone) return res.status(404).json({ error: 'not_found' });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

// GET /api/bella/actions — the user's own Bella action log (audit trail).
router.get('/actions', async (req, res, next) => {
  try {
    const rows = await store.listActions(req.tenant.id, req.user?.id ?? 0, req.query.limit);
    res.json({ actions: rows });
  } catch (err) { next(err); }
});

// GET /api/bella/usage — today's turns/tokens + the caps (Settings section).
router.get('/usage', async (req, res, next) => {
  try {
    const usage = await store.getTodayUsage(req.tenant.id, req.user?.id ?? 0);
    res.json({ ...usage, turns_cap: store.DAILY_TURNS_CAP, credits_cap: store.DAILY_CREDITS_CAP });
  } catch (err) { next(err); }
});

export default router;
