// /api/notifications — in-app notifications for the signed-in user, plus the
// admin announcement broadcast. Mounted behind requireAuth, so req.user is set.

import { Router } from 'express';
import {
  listForUser, unreadCount, markRead, markAllRead, broadcast,
  createAnnouncement, setAnnouncementSent, listAnnouncements, recallAnnouncement,
} from '../lib/notifications.js';

const router = Router();

// GET /api/notifications?limit=&offset=  → { rows, unread }
router.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(Number(req.query.limit ?? 30), 100);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    const [rows, unread] = await Promise.all([
      listForUser(req.user.id, { limit, offset }),
      unreadCount(req.user.id),
    ]);
    res.json({ rows, unread });
  } catch (err) { next(err); }
});

// GET /api/notifications/unread-count → { unread }  (cheap, for header polling)
router.get('/unread-count', async (req, res, next) => {
  try { res.json({ unread: await unreadCount(req.user.id) }); }
  catch (err) { next(err); }
});

// POST /api/notifications/:id/read
router.post('/:id/read', async (req, res, next) => {
  try { await markRead(req.user.id, Number(req.params.id)); res.json({ ok: true }); }
  catch (err) { next(err); }
});

// POST /api/notifications/read-all
router.post('/read-all', async (req, res, next) => {
  try { res.json({ ok: true, marked: await markAllRead(req.user.id) }); }
  catch (err) { next(err); }
});

// POST /api/notifications/announce { title, body?, link?, all_tenants? }
// Platform-admin only — broadcast an announcement to users. Defaults to all
// tenants (the whole platform); pass all_tenants:false to limit to the admin's
// own tenant.
router.post('/announce', async (req, res, next) => {
  try {
    if (req.user.role !== 'platform_admin') {
      return res.status(403).json({ error: 'forbidden', reason: 'platform admin only' });
    }
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'title required' });
    const body = req.body?.body ? String(req.body.body) : null;
    const link = req.body?.link ? String(req.body.link) : null;
    const platform = req.body?.all_tenants !== false;   // default: whole platform
    const emailToo = req.body?.email === true;
    const tenantId = platform ? null : req.user.tenant_id;
    const announcementId = await createAnnouncement({
      scope: platform ? 'platform' : 'tenant', tenantId, title, body, link, createdBy: req.user.email,
    });
    const sent = await broadcast({ tenantId, title, body, link, announcementId, email: emailToo });
    await setAnnouncementSent(announcementId, sent);
    res.json({ ok: true, announcement_id: announcementId, sent });
  } catch (err) { next(err); }
});

// GET /api/notifications/announcements — list sent announcements (admin).
router.get('/announcements', async (req, res, next) => {
  try {
    if (req.user.role !== 'platform_admin') return res.status(403).json({ error: 'forbidden' });
    res.json({ rows: await listAnnouncements({ limit: 50 }) });
  } catch (err) { next(err); }
});

// POST /api/notifications/announcements/:id/recall — remove an announcement's
// notifications from every recipient (admin).
router.post('/announcements/:id/recall', async (req, res, next) => {
  try {
    if (req.user.role !== 'platform_admin') return res.status(403).json({ error: 'forbidden' });
    const removed = await recallAnnouncement(Number(req.params.id));
    res.json({ ok: true, removed });
  } catch (err) { next(err); }
});

export default router;
