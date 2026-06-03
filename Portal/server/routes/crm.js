// /api/crm — the per-tenant CRM action layer (Phase 1: records, notes,
// activity timeline, tasks). Every query is scoped to req.tenant.id so a tenant
// only ever sees its own CRM. Mounted under the `feature` gate (auth + active
// subscription); platform_admin / internal tenant pass through.
//
//   GET    /records           list (?entity_type=&status=&source=&q=&owner=)
//   POST   /records           manually add a company/person to the CRM
//   GET    /records/:id        full detail (record + entity + notes + activity + tasks)
//   PATCH  /records/:id        update status / owner / archived
//   POST   /records/:id/notes  add a note
//   POST   /records/:id/tasks  add a task
//   GET    /tasks              tenant task list (?status=&assignee=)
//   PATCH  /tasks/:id          update a task (status/title/due/assignee)
//   GET    /stats              header counts

import { Router } from 'express';
import { query } from '../db.js';
import { ensureCrmRecord, logActivity } from '../lib/crm.js';
import { sendEmail, getFromAddress } from '../lib/email.js';

const router = Router();

// For now, only platform_admin may SEND email (single verified bell.qa domain).
// Later, tenants add their own domains via DNS and send as themselves.
const canSendEmail = (req) => req.user?.role === 'platform_admin';

const tenantId = (req) => req.tenant?.id;
const actorEmail = (req) => req.user?.email || null;
const actorUserId = (req) => (req.user?.id && req.user.id !== 0 ? req.user.id : null);

// Join a record to its canonical company/person for display (identity only —
// contact fields are gated by the reveal system elsewhere).
const RECORD_SELECT = `
  SELECT r.*,
         c.name        AS company_name,  c.bin AS company_bin, c.industry AS company_industry,
         c.city        AS company_city,  c.website AS company_website, c.linkedin_url AS company_linkedin,
         c.archived    AS company_archived,
         p.full_name   AS person_name,   p.pin AS person_pin, p.headline AS person_headline,
         p.linkedin_url AS person_linkedin,
         u.email       AS owner_email, u.full_name AS owner_name
    FROM crm_records r
    LEFT JOIN companies c ON r.entity_type = 'company' AND c.id = r.entity_id
    LEFT JOIN people    p ON r.entity_type = 'person'  AND p.id = r.entity_id
    LEFT JOIN users     u ON u.id = r.owner_user_id
`;

// GET /api/crm/records
router.get('/records', async (req, res, next) => {
  try {
    const where = ['r.tenant_id = $1'];
    const params = [tenantId(req)];
    if (req.query.entity_type) { params.push(req.query.entity_type); where.push(`r.entity_type = $${params.length}`); }
    if (req.query.status)      { params.push(req.query.status);      where.push(`r.status = $${params.length}`); }
    if (req.query.source)      { params.push(req.query.source);      where.push(`r.source = $${params.length}`); }
    if (req.query.archived !== 'all') {
      params.push(req.query.archived === 'true');
      where.push(`r.archived = $${params.length}`);
    }
    if (req.query.q && req.query.q.trim()) {
      params.push('%' + req.query.q.trim().toLowerCase() + '%');
      where.push(`(lower(coalesce(c.name,'')) LIKE $${params.length} OR lower(coalesce(p.full_name,'')) LIKE $${params.length})`);
    }
    const limit  = Math.min(Number(req.query.limit ?? 100), 500);
    const offset = Math.max(Number(req.query.offset ?? 0), 0);
    params.push(limit, offset);

    const rows = await query(
      `${RECORD_SELECT} WHERE ${where.join(' AND ')}
       ORDER BY r.last_activity_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );
    const count = await query(
      `SELECT count(*)::int AS total FROM crm_records r
         LEFT JOIN companies c ON r.entity_type='company' AND c.id=r.entity_id
         LEFT JOIN people p ON r.entity_type='person' AND p.id=r.entity_id
        WHERE ${where.join(' AND ')}`,
      params.slice(0, params.length - 2)
    );
    res.json({ total: count.rows[0].total, rows: rows.rows, limit, offset });
  } catch (err) { next(err); }
});

// POST /api/crm/records  { entity_type, entity_id }
router.post('/records', async (req, res, next) => {
  try {
    const { entity_type, entity_id } = req.body || {};
    if (!['company','person'].includes(entity_type) || !entity_id) {
      return res.status(400).json({ error: 'bad_request', reason: 'entity_type + entity_id required' });
    }
    // Verify the canonical entity exists.
    const tbl = entity_type === 'company' ? 'companies' : 'people';
    const ex = await query(`SELECT 1 FROM ${tbl} WHERE id = $1`, [Number(entity_id)]);
    if (!ex.rows.length) return res.status(404).json({ error: 'entity_not_found' });

    const out = await ensureCrmRecord(null, tenantId(req), entity_type, entity_id, 'manual', actorEmail(req), actorUserId(req));
    res.json({ id: out.id, created: out.created });
  } catch (err) { next(err); }
});

// GET /api/crm/records/:id — detail
router.get('/records/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid_id' });
    const r = await query(`${RECORD_SELECT} WHERE r.id = $1 AND r.tenant_id = $2`, [id, tenantId(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });

    const [notes, activities, tasks, emails] = await Promise.all([
      query(`SELECT id, author_email, body, created_at FROM crm_notes WHERE record_id=$1 ORDER BY created_at DESC`, [id]),
      query(`SELECT id, type, actor_email, summary, payload, occurred_at FROM crm_activities WHERE record_id=$1 ORDER BY occurred_at DESC LIMIT 200`, [id]),
      query(`SELECT t.id, t.title, t.description, t.due_at, t.status, t.assignee_user_id, u.email AS assignee_email, t.created_by, t.created_at, t.completed_at
               FROM crm_tasks t LEFT JOIN users u ON u.id = t.assignee_user_id
              WHERE t.record_id=$1 ORDER BY t.status, t.due_at NULLS LAST, t.created_at DESC`, [id]),
      query(`SELECT id, direction, to_email, subject, status, sent_by, created_at, sent_at FROM crm_emails WHERE record_id=$1 ORDER BY created_at DESC LIMIT 100`, [id]),
    ]);
    const rec = r.rows[0];
    // Only expose the recipient email + send capability to admins (who can send).
    let suggestedTo = null;
    if (canSendEmail(req)) {
      const e = await query(
        rec.entity_type === 'company'
          ? `SELECT email FROM companies WHERE id=$1`
          : `SELECT email FROM people WHERE id=$1`,
        [rec.entity_id]);
      suggestedTo = e.rows[0]?.email || null;
    }
    res.json({
      record: rec, notes: notes.rows, activities: activities.rows, tasks: tasks.rows,
      emails: emails.rows, can_send: canSendEmail(req), suggested_to: suggestedTo,
    });
  } catch (err) { next(err); }
});

const RECORD_STATUSES = new Set(['new','contacted','engaged','won','lost']);

// PATCH /api/crm/records/:id  { status?, owner_user_id?, archived? }
router.patch('/records/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cur = await query(`SELECT status, owner_user_id, archived FROM crm_records WHERE id=$1 AND tenant_id=$2`, [id, tenantId(req)]);
    if (!cur.rows.length) return res.status(404).json({ error: 'not_found' });
    const sets = [], params = [];
    const body = req.body || {};
    if (body.status !== undefined) {
      if (!RECORD_STATUSES.has(body.status)) return res.status(400).json({ error: 'invalid_status' });
      params.push(body.status); sets.push(`status = $${params.length}`);
    }
    if (body.owner_user_id !== undefined) { params.push(body.owner_user_id || null); sets.push(`owner_user_id = $${params.length}`); }
    if (body.archived !== undefined)      { params.push(!!body.archived);            sets.push(`archived = $${params.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });
    params.push(id, tenantId(req));
    const r = await query(
      `UPDATE crm_records SET ${sets.join(', ')} WHERE id = $${params.length - 1} AND tenant_id = $${params.length} RETURNING id, status, owner_user_id, archived`,
      params
    );
    if (body.status !== undefined && body.status !== cur.rows[0].status) {
      await logActivity(null, tenantId(req), id, 'status_change', {
        actorUserId: actorUserId(req), actorEmail: actorEmail(req),
        summary: `Status → ${body.status}`, payload: { from: cur.rows[0].status, to: body.status },
      });
    }
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// POST /api/crm/records/:id/notes  { body }
router.post('/records/:id/notes', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'empty_note' });
    const owns = await query(`SELECT 1 FROM crm_records WHERE id=$1 AND tenant_id=$2`, [id, tenantId(req)]);
    if (!owns.rows.length) return res.status(404).json({ error: 'not_found' });
    const r = await query(
      `INSERT INTO crm_notes (tenant_id, record_id, author_user_id, author_email, body)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, author_email, body, created_at`,
      [tenantId(req), id, actorUserId(req), actorEmail(req), body]
    );
    await logActivity(null, tenantId(req), id, 'note', {
      actorUserId: actorUserId(req), actorEmail: actorEmail(req),
      summary: body.slice(0, 140),
    });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// POST /api/crm/records/:id/tasks  { title, description?, due_at?, assignee_user_id? }
router.post('/records/:id/tasks', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'empty_title' });
    const owns = await query(`SELECT 1 FROM crm_records WHERE id=$1 AND tenant_id=$2`, [id, tenantId(req)]);
    if (!owns.rows.length) return res.status(404).json({ error: 'not_found' });
    const b = req.body || {};
    const r = await query(
      `INSERT INTO crm_tasks (tenant_id, record_id, title, description, due_at, assignee_user_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id, title, description, due_at, status, assignee_user_id, created_at`,
      [tenantId(req), id, title, b.description || null, b.due_at || null, b.assignee_user_id || null, actorEmail(req)]
    );
    await logActivity(null, tenantId(req), id, 'task', {
      actorUserId: actorUserId(req), actorEmail: actorEmail(req), summary: 'Task: ' + title,
    });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// GET /api/crm/tasks  (?status=&assignee_user_id=)
router.get('/tasks', async (req, res, next) => {
  try {
    const where = ['t.tenant_id = $1'];
    const params = [tenantId(req)];
    if (req.query.status)           { params.push(req.query.status);           where.push(`t.status = $${params.length}`); }
    if (req.query.assignee_user_id) { params.push(req.query.assignee_user_id); where.push(`t.assignee_user_id = $${params.length}`); }
    const r = await query(
      `SELECT t.id, t.record_id, t.title, t.due_at, t.status, t.assignee_user_id, u.email AS assignee_email,
              r.entity_type, c.name AS company_name, p.full_name AS person_name
         FROM crm_tasks t
         LEFT JOIN users u ON u.id = t.assignee_user_id
         LEFT JOIN crm_records r ON r.id = t.record_id
         LEFT JOIN companies c ON r.entity_type='company' AND c.id=r.entity_id
         LEFT JOIN people p ON r.entity_type='person' AND p.id=r.entity_id
        WHERE ${where.join(' AND ')}
        ORDER BY t.status, t.due_at NULLS LAST, t.created_at DESC LIMIT 500`,
      params
    );
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});

// PATCH /api/crm/tasks/:id  { status?, title?, due_at?, assignee_user_id? }
router.patch('/tasks/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const t = await query(`SELECT record_id, status FROM crm_tasks WHERE id=$1 AND tenant_id=$2`, [id, tenantId(req)]);
    if (!t.rows.length) return res.status(404).json({ error: 'not_found' });
    const b = req.body || {};
    const sets = [], params = [];
    if (b.status !== undefined) {
      if (!['open','done','cancelled'].includes(b.status)) return res.status(400).json({ error: 'invalid_status' });
      params.push(b.status); sets.push(`status = $${params.length}`);
      params.push(b.status === 'done' ? new Date().toISOString() : null); sets.push(`completed_at = $${params.length}`);
    }
    if (b.title !== undefined)            { params.push(b.title); sets.push(`title = $${params.length}`); }
    if (b.due_at !== undefined)           { params.push(b.due_at || null); sets.push(`due_at = $${params.length}`); }
    if (b.assignee_user_id !== undefined) { params.push(b.assignee_user_id || null); sets.push(`assignee_user_id = $${params.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });
    params.push(id, tenantId(req));
    const r = await query(
      `UPDATE crm_tasks SET ${sets.join(', ')} WHERE id=$${params.length-1} AND tenant_id=$${params.length}
       RETURNING id, title, due_at, status, assignee_user_id, completed_at`,
      params
    );
    if (b.status === 'done' && t.rows[0].record_id && t.rows[0].status !== 'done') {
      await logActivity(null, tenantId(req), t.rows[0].record_id, 'task_done', {
        actorUserId: actorUserId(req), actorEmail: actorEmail(req), summary: 'Task completed',
      });
    }
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// POST /api/crm/records/:id/email  { to?, subject, body }
// Sends via Resend from the bell.qa domain; reply_to = the sender so replies
// reach their inbox. Admin-only for now. Logged to crm_emails + the timeline.
router.post('/records/:id/email', async (req, res, next) => {
  try {
    if (!canSendEmail(req)) {
      return res.status(403).json({ error: 'admin_only', reason: 'Email sending is limited to admins for now.' });
    }
    const id = Number(req.params.id);
    const rec = await query(
      `SELECT r.entity_type, r.entity_id,
              c.email AS company_email, p.email AS person_email
         FROM crm_records r
         LEFT JOIN companies c ON r.entity_type='company' AND c.id=r.entity_id
         LEFT JOIN people    p ON r.entity_type='person'  AND p.id=r.entity_id
        WHERE r.id=$1 AND r.tenant_id=$2`, [id, tenantId(req)]);
    if (!rec.rows.length) return res.status(404).json({ error: 'not_found' });
    const r0 = rec.rows[0];

    const to = String(req.body?.to || (r0.entity_type === 'company' ? r0.company_email : r0.person_email) || '').trim();
    if (!to) return res.status(400).json({ error: 'no_recipient', reason: 'No email address on file — enter one.' });
    const subject  = String(req.body?.subject || '').trim();
    const bodyText = String(req.body?.body || '').trim();
    if (!subject && !bodyText) return res.status(400).json({ error: 'empty_email' });
    const replyTo = actorEmail(req);

    const ins = await query(
      `INSERT INTO crm_emails (tenant_id, record_id, direction, to_email, reply_to, subject, body_text, status, sent_by)
       VALUES ($1,$2,'out',$3,$4,$5,$6,'queued',$7) RETURNING id`,
      [tenantId(req), id, to, replyTo, subject, bodyText, replyTo]);
    const emailId = Number(ins.rows[0].id);

    try {
      const from = await getFromAddress();
      const sent = await sendEmail({ from, to, replyTo, subject, text: bodyText });
      await query(`UPDATE crm_emails SET status='sent', provider_message_id=$2, from_email=$3, sent_at=now() WHERE id=$1`,
        [emailId, sent.id, from]);
      await logActivity(null, tenantId(req), id, 'email_out', {
        actorUserId: actorUserId(req), actorEmail: replyTo,
        summary: 'Email sent: ' + (subject || '(no subject)'), payload: { to, email_id: emailId },
      });
      res.json({ id: emailId, status: 'sent', message_id: sent.id });
    } catch (err) {
      const safe = /key_missing/i.test(err.message) ? 'Email is not configured yet (set the Resend key).' : 'Could not send the email.';
      await query(`UPDATE crm_emails SET status='failed', error=$2 WHERE id=$1`, [emailId, String(err.message).slice(0, 500)]);
      console.error('[crm] email send failed:', err.message);
      res.status(502).json({ error: 'send_failed', reason: safe });
    }
  } catch (err) { next(err); }
});

// Email templates (per tenant)
router.get('/templates', async (req, res, next) => {
  try {
    const r = await query(`SELECT id, name, subject, body, created_at FROM crm_email_templates WHERE tenant_id=$1 ORDER BY name`, [tenantId(req)]);
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});
router.post('/templates', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name_required' });
    const r = await query(
      `INSERT INTO crm_email_templates (tenant_id, name, subject, body, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id, name, subject, body, created_at`,
      [tenantId(req), name, req.body?.subject || null, req.body?.body || null, actorEmail(req)]);
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// GET /api/crm/stats — header counts for the CRM tab
router.get('/stats', async (req, res, next) => {
  try {
    const r = await query(
      `SELECT
         count(*) FILTER (WHERE entity_type='company' AND NOT archived)::int AS companies,
         count(*) FILTER (WHERE entity_type='person'  AND NOT archived)::int AS people,
         count(*) FILTER (WHERE source='reveal' AND NOT archived)::int       AS revealed
       FROM crm_records WHERE tenant_id = $1`,
      [tenantId(req)]
    );
    const tasks = await query(
      `SELECT count(*) FILTER (WHERE status='open')::int AS open_tasks FROM crm_tasks WHERE tenant_id=$1`,
      [tenantId(req)]
    );
    res.json({ ...r.rows[0], open_tasks: tasks.rows[0].open_tasks });
  } catch (err) { next(err); }
});

export default router;
