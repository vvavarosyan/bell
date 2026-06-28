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
import { ensureCrmRecord, logActivity, markContacted, buildMergeVars, applyMerge } from '../lib/crm.js';
import { sendEmail, getFromAddress, inboundReplyTo } from '../lib/email.js';
import { resolveSendIdentity, formatFrom } from '../lib/email_domains.js';
import { checkDailyLimit } from '../lib/sendlimits.js';
import { getRevealedSet } from '../lib/credits.js';
import { addDatapoint, listDatapoints, deleteDatapoint, addNewEntity, DATAPOINT_FIELDS } from '../lib/contributions.js';

const router = Router();

// Any authenticated tenant may send — every tenant gets a default Bell sending
// identity (and may connect their own domain). The `feature` mount already
// requires auth + an active subscription; daily limits cap volume.
const canSendEmail = (req) => !!req.tenant?.id;

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

    const [notes, activities, tasks, emails, enrollments, deals] = await Promise.all([
      query(`SELECT id, author_email, body, created_at FROM crm_notes WHERE record_id=$1 ORDER BY created_at DESC`, [id]),
      query(`SELECT id, type, actor_email, summary, payload, occurred_at FROM crm_activities WHERE record_id=$1 ORDER BY occurred_at DESC LIMIT 200`, [id]),
      query(`SELECT t.id, t.title, t.description, t.due_at, t.status, t.assignee_user_id, u.email AS assignee_email, t.created_by, t.created_at, t.completed_at
               FROM crm_tasks t LEFT JOIN users u ON u.id = t.assignee_user_id
              WHERE t.record_id=$1 ORDER BY t.status, t.due_at NULLS LAST, t.created_at DESC`, [id]),
      query(`SELECT id, direction, from_email, to_email, subject, body_text, status, sent_by, created_at, sent_at FROM crm_emails WHERE record_id=$1 ORDER BY created_at DESC LIMIT 100`, [id]),
      query(`SELECT e.id, e.sequence_id, e.current_step, e.status, e.next_run_at, s.name AS sequence_name,
                    (SELECT count(*)::int FROM crm_sequence_steps st WHERE st.sequence_id=e.sequence_id) AS total_steps
               FROM crm_sequence_enrollments e JOIN crm_sequences s ON s.id=e.sequence_id
              WHERE e.record_id=$1 ORDER BY e.enrolled_at DESC`, [id]),
      query(`SELECT d.id, d.title, d.value_num, d.currency, d.status, d.stage_id, st.name AS stage_name
               FROM crm_deals d LEFT JOIN crm_stages st ON st.id=d.stage_id
              WHERE d.record_id=$1 ORDER BY d.created_at DESC`, [id]),
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
      emails: emails.rows, enrollments: enrollments.rows, deals: deals.rows,
      can_send: canSendEmail(req), suggested_to: suggestedTo,
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

// --- Contributed datapoints (Import Phase 2, Layer 1) -----------------------
// Users add datapoints to a CRM record's entity; captured into the admin pool +
// shown back as the user's own overlay. Tenant-scoped via the record.
async function recordEntity(req, recordId) {
  const r = await query(`SELECT entity_type, entity_id FROM crm_records WHERE id=$1 AND tenant_id=$2`, [Number(recordId), tenantId(req)]);
  return r.rows[0] || null;
}

// GET /api/crm/records/:id/datapoints — this tenant's datapoints for the record.
router.get('/records/:id/datapoints', async (req, res, next) => {
  try {
    const ent = await recordEntity(req, req.params.id);
    if (!ent) return res.status(404).json({ error: 'not_found' });
    res.json({ rows: await listDatapoints({ tenantId: tenantId(req), entityType: ent.entity_type, entityId: ent.entity_id }), fields: DATAPOINT_FIELDS });
  } catch (err) { next(err); }
});

// POST /api/crm/records/:id/datapoints  { field, value, label? }
router.post('/records/:id/datapoints', async (req, res, next) => {
  try {
    const ent = await recordEntity(req, req.params.id);
    if (!ent) return res.status(404).json({ error: 'not_found' });
    const { field, value, label } = req.body || {};
    const row = await addDatapoint({
      tenantId: tenantId(req), entityType: ent.entity_type, entityId: ent.entity_id,
      field, value, label: label || null, createdBy: actorEmail(req),
    });
    await logActivity(null, tenantId(req), Number(req.params.id), 'datapoint_added', {
      actorUserId: actorUserId(req), actorEmail: actorEmail(req),
      summary: `Added ${field}${label ? ` (${label})` : ''}: ${String(value).slice(0, 80)}`,
      payload: { field, label: label || null },
    }).catch(() => {});
    res.json(row);
  } catch (err) {
    if (/missing_fields|bad_field|bad_entity_type|empty_value/.test(String(err.message))) {
      return res.status(400).json({ error: err.message });
    }
    next(err);
  }
});

// DELETE /api/crm/datapoints/:dpId — remove the tenant's own datapoint.
router.delete('/datapoints/:dpId', async (req, res, next) => {
  try {
    const ok = await deleteDatapoint({ tenantId: tenantId(req), id: req.params.dpId });
    if (!ok) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// POST /api/crm/new-entity { kind:'company'|'person', name, company?, email?, phone?, website?, city?, title?, notes? }
// Capture a brand-new company/person Bell doesn't have yet — stored as a private,
// pending-review proposal (no canonical write). Enters the admin curation pool.
router.post('/new-entity', async (req, res, next) => {
  try {
    const b = req.body || {};
    const row = await addNewEntity({
      tenantId: tenantId(req), kind: b.kind === 'company' ? 'company' : 'person',
      name: b.name, company: b.company || null, email: b.email || null, phone: b.phone || null,
      website: b.website || null, city: b.city || null, title: b.title || null, notes: b.notes || null,
      createdBy: actorEmail(req),
    });
    res.json(row);
  } catch (err) {
    if (/name_required|no_tenant/.test(String(err.message))) return res.status(400).json({ error: err.message });
    next(err);
  }
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

// PATCH /api/crm/notes/:id  { body }  — edit a note's text
router.patch('/notes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const body = String(req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'empty_note' });
    const r = await query(
      `UPDATE crm_notes SET body=$1, updated_at=now() WHERE id=$2 AND tenant_id=$3
       RETURNING id, record_id, author_email, body, created_at, updated_at`,
      [body, id, tenantId(req)]
    );
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    if (r.rows[0].record_id) await logActivity(null, tenantId(req), r.rows[0].record_id, 'note', {
      actorUserId: actorUserId(req), actorEmail: actorEmail(req), summary: 'Note edited',
    });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/crm/notes/:id
router.delete('/notes/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const r = await query(`DELETE FROM crm_notes WHERE id=$1 AND tenant_id=$2 RETURNING record_id`, [id, tenantId(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    if (r.rows[0].record_id) await logActivity(null, tenantId(req), r.rows[0].record_id, 'note', {
      actorUserId: actorUserId(req), actorEmail: actorEmail(req), summary: 'Note deleted',
    });
    res.json({ ok: true });
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

// DELETE /api/crm/tasks/:id
router.delete('/tasks/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const r = await query(`DELETE FROM crm_tasks WHERE id=$1 AND tenant_id=$2 RETURNING record_id, title`, [id, tenantId(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    if (r.rows[0].record_id) await logActivity(null, tenantId(req), r.rows[0].record_id, 'task', {
      actorUserId: actorUserId(req), actorEmail: actorEmail(req), summary: 'Task deleted: ' + (r.rows[0].title || ''),
    });
    res.json({ ok: true });
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
              c.email AS company_email, p.email AS person_email,
              c.name AS company_name, c.industry AS company_industry, c.city AS company_city, c.website AS company_website,
              p.full_name AS person_name, p.headline AS person_headline
         FROM crm_records r
         LEFT JOIN companies c ON r.entity_type='company' AND c.id=r.entity_id
         LEFT JOIN people    p ON r.entity_type='person'  AND p.id=r.entity_id
        WHERE r.id=$1 AND r.tenant_id=$2`, [id, tenantId(req)]);
    if (!rec.rows.length) return res.status(404).json({ error: 'not_found' });
    const r0 = rec.rows[0];

    const to = String(req.body?.to || (r0.entity_type === 'company' ? r0.company_email : r0.person_email) || '').trim();
    if (!to) return res.status(400).json({ error: 'no_recipient', reason: 'No email address on file — enter one.' });
    const limit = await checkDailyLimit(tenantId(req), req.tenant?.plan);
    if (!limit.allowed) return res.status(429).json({ error: 'daily_limit', reason: `You've hit today's sending limit (${limit.limit}/day). It resets tomorrow — or upgrade your plan for more.` });
    const cc = Array.isArray(req.body?.cc) ? req.body.cc.map((s) => String(s).trim()).filter((s) => s.includes('@')).slice(0, 25) : [];
    // Personalize {tokens} for this recipient.
    const vars = buildMergeVars(r0);
    const subject  = applyMerge(String(req.body?.subject || '').trim(), vars);
    const bodyText = applyMerge(String(req.body?.body || '').trim(), vars);
    if (!subject && !bodyText) return res.status(400).json({ error: 'empty_email' });
    const replyTo = actorEmail(req);

    const ins = await query(
      `INSERT INTO crm_emails (tenant_id, record_id, direction, to_email, cc_email, reply_to, subject, body_text, status, sent_by)
       VALUES ($1,$2,'out',$3,$4,$5,$6,$7,'queued',$8) RETURNING id`,
      [tenantId(req), id, to, cc.length ? cc.join(', ') : null, replyTo, subject, bodyText, replyTo]);
    const emailId = Number(ins.rows[0].id);
    // If inbound is configured, route replies through Bell (so they thread + stop
    // sequences); otherwise replies go straight to the human sender.
    const effReplyTo = inboundReplyTo(emailId) || replyTo;

    try {
      let from;
      try { from = formatFrom(await resolveSendIdentity(tenantId(req))); } catch (e) { console.error('[crm] identity resolve failed:', e.message); }
      from = from || await getFromAddress();
      const sent = await sendEmail({ from, to, cc: cc.length ? cc : undefined, replyTo: effReplyTo, subject, text: bodyText });
      await query(`UPDATE crm_emails SET status='sent', provider_message_id=$2, from_email=$3, reply_to=$4, sent_at=now() WHERE id=$1`,
        [emailId, sent.id, from, effReplyTo]);
      await logActivity(null, tenantId(req), id, 'email_out', {
        actorUserId: actorUserId(req), actorEmail: replyTo,
        summary: 'Email sent: ' + (subject || '(no subject)'), payload: { to, email_id: emailId },
      });
      await markContacted(null, tenantId(req), id, replyTo);
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
router.put('/templates/:id', async (req, res, next) => {
  try {
    const r = await query(
      `UPDATE crm_email_templates SET name = COALESCE($3, name), subject = $4, body = $5
        WHERE id=$1 AND tenant_id=$2 RETURNING id, name, subject, body, created_at`,
      [Number(req.params.id), tenantId(req), (req.body?.name || '').trim() || null, req.body?.subject ?? null, req.body?.body ?? null]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});
router.delete('/templates/:id', async (req, res, next) => {
  try {
    const r = await query(`DELETE FROM crm_email_templates WHERE id=$1 AND tenant_id=$2 RETURNING id`, [Number(req.params.id), tenantId(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// Outreach metrics: sent / opened / replied + rates for this tenant.
router.get('/email-metrics', async (req, res, next) => {
  try {
    const r = await query(`
      SELECT
        count(*) FILTER (WHERE direction='out' AND status IN ('sent','delivered','opened'))::int      AS sent,
        count(*) FILTER (WHERE direction='out' AND (status='opened' OR opened_at IS NOT NULL))::int    AS opened,
        count(*) FILTER (WHERE direction='in')::int                                                    AS replies,
        count(DISTINCT record_id) FILTER (WHERE direction='in')::int                                   AS replied_records
      FROM crm_emails WHERE tenant_id=$1`, [tenantId(req)]);
    const m = r.rows[0] || {};
    const sent = m.sent || 0;
    res.json({
      sent, opened: m.opened || 0, replies: m.replies || 0, replied_records: m.replied_records || 0,
      open_rate:  sent ? Math.round((m.opened / sent) * 1000) / 10 : 0,
      reply_rate: sent ? Math.round((m.replied_records / sent) * 1000) / 10 : 0,
    });
  } catch (err) { next(err); }
});

// Outreach recipient suggestions for a company record:
//  • cc      = revealed people (with email) + the company's other emails
//  • reveal  = UNREVEALED decision-makers (reveal them to reach the right person)
const DECISION_MAKER_RX = /\b(ceo|chief|cfo|coo|cto|cmo|founder|co-?founder|owner|president|managing\s*director|director|head\s*of|head\b|vp|vice\s*president|partner|general\s*manager|\bgm\b|manager|principal)\b/i;
router.get('/records/:id/recipients', async (req, res, next) => {
  try {
    const tid = tenantId(req);
    const rec = await query(`SELECT entity_type, entity_id FROM crm_records WHERE id=$1 AND tenant_id=$2`, [Number(req.params.id), tid]);
    if (!rec.rows.length) return res.status(404).json({ error: 'not_found' });
    if (rec.rows[0].entity_type !== 'company') return res.json({ cc: [], reveal: [] });
    const companyId = Number(rec.rows[0].entity_id);
    const ppl = await query(
      `SELECT p.id, p.full_name, p.email, pc.title
         FROM person_companies pc JOIN people p ON p.id = pc.person_id
        WHERE pc.company_id = $1 AND COALESCE(pc.is_current, true) = true
        ORDER BY pc.org_chart_level NULLS LAST, p.full_name LIMIT 100`, [companyId]);
    const revealed = await getRevealedSet(tid, 'person', ppl.rows.map((x) => Number(x.id)));
    const cc = [], reveal = [], seen = new Set();
    for (const p of ppl.rows) {
      const email = String(p.email || '').trim();
      const validEmail = email.includes('@');
      const label = p.full_name + (p.title ? ' · ' + p.title : '');
      if (revealed.has(Number(p.id))) {
        if (validEmail && !seen.has(email.toLowerCase())) {
          seen.add(email.toLowerCase());
          cc.push({ type: 'person', person_id: Number(p.id), email, name: p.full_name, title: p.title || '', label });
        } else if (!validEmail) {
          // Revealed, but Bell has no email on file yet — surface it so the user
          // can see the reveal worked (otherwise it looks like nothing happened).
          cc.push({ type: 'person', person_id: Number(p.id), email: '', name: p.full_name, title: p.title || '', label, no_email: true });
        }
      } else if (DECISION_MAKER_RX.test(String(p.title || ''))) {
        reveal.push({ person_id: Number(p.id), name: p.full_name, title: p.title || '' });   // email NOT exposed (unrevealed)
      }
    }
    const cont = await query(`SELECT value FROM company_contacts WHERE company_id=$1 AND type='email' LIMIT 20`, [companyId]).catch(() => ({ rows: [] }));
    for (const c of cont.rows) {
      const email = String(c.value || '').trim();
      if (email.includes('@') && !seen.has(email.toLowerCase())) { seen.add(email.toLowerCase()); cc.push({ type: 'company', email, label: 'Company' }); }
    }
    res.json({ cc, reveal });
  } catch (err) { next(err); }
});

// ── Deal pipeline ───────────────────────────────────────────────────────────

// Ensure the tenant has a default pipeline with stages; return its id.
async function ensurePipeline(tid) {
  const ex = await query(`SELECT id FROM crm_pipelines WHERE tenant_id=$1 ORDER BY is_default DESC, id LIMIT 1`, [tid]);
  if (ex.rows.length) return Number(ex.rows[0].id);
  const p = await query(`INSERT INTO crm_pipelines (tenant_id, name, is_default) VALUES ($1,'Sales Pipeline',true) RETURNING id`, [tid]);
  const pid = Number(p.rows[0].id);
  const stages = [['Lead', 0, false, false], ['Qualified', 1, false, false], ['Proposal', 2, false, false], ['Negotiation', 3, false, false], ['Won', 4, true, false], ['Lost', 5, false, true]];
  for (const [name, pos, won, lost] of stages) {
    await query(`INSERT INTO crm_stages (tenant_id, pipeline_id, name, position, is_won, is_lost) VALUES ($1,$2,$3,$4,$5,$6)`, [tid, pid, name, pos, won, lost]);
  }
  return pid;
}

// GET /api/crm/pipeline — default pipeline with its stages + deals
router.get('/pipeline', async (req, res, next) => {
  try {
    const pid = await ensurePipeline(tenantId(req));
    const [stages, deals] = await Promise.all([
      query(`SELECT id, name, position, is_won, is_lost FROM crm_stages WHERE pipeline_id=$1 ORDER BY position`, [pid]),
      query(`SELECT d.id, d.title, d.value_num, d.currency, d.stage_id, d.status, d.record_id, d.expected_close,
                    r.entity_type, c.name AS company_name, p.full_name AS person_name
               FROM crm_deals d
               LEFT JOIN crm_records r ON r.id = d.record_id
               LEFT JOIN companies c ON r.entity_type='company' AND c.id=r.entity_id
               LEFT JOIN people    p ON r.entity_type='person'  AND p.id=r.entity_id
              WHERE d.tenant_id=$1 AND d.pipeline_id=$2 ORDER BY d.created_at DESC`, [tenantId(req), pid]),
    ]);
    res.json({ pipeline_id: pid, stages: stages.rows, deals: deals.rows });
  } catch (err) { next(err); }
});

// POST /api/crm/deals  { title, value_num?, currency?, stage_id?, record_id?, expected_close? }
router.post('/deals', async (req, res, next) => {
  try {
    const title = String(req.body?.title || '').trim();
    if (!title) return res.status(400).json({ error: 'title_required' });
    const pid = await ensurePipeline(tenantId(req));
    let stageId = req.body?.stage_id ? Number(req.body.stage_id) : null;
    if (!stageId) {
      const f = await query(`SELECT id FROM crm_stages WHERE pipeline_id=$1 ORDER BY position LIMIT 1`, [pid]);
      stageId = f.rows[0]?.id || null;
    }
    const r = await query(
      `INSERT INTO crm_deals (tenant_id, record_id, pipeline_id, stage_id, title, value_num, currency, expected_close, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,COALESCE($7,'QAR'),$8,$9) RETURNING id`,
      [tenantId(req), req.body?.record_id || null, pid, stageId, title,
       req.body?.value_num != null ? Number(req.body.value_num) : null, req.body?.currency || null,
       req.body?.expected_close || null, actorEmail(req)]);
    if (req.body?.record_id) {
      await logActivity(null, tenantId(req), Number(req.body.record_id), 'deal', {
        actorUserId: actorUserId(req), actorEmail: actorEmail(req), summary: 'Deal created: ' + title,
      });
    }
    res.json({ id: r.rows[0].id });
  } catch (err) { next(err); }
});

// PATCH /api/crm/deals/:id  { stage_id?, title?, value_num?, currency?, expected_close?, owner_user_id? }
// Moving to a won/lost stage sets the deal status accordingly.
router.patch('/deals/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const cur = await query(`SELECT record_id FROM crm_deals WHERE id=$1 AND tenant_id=$2`, [id, tenantId(req)]);
    if (!cur.rows.length) return res.status(404).json({ error: 'not_found' });
    const b = req.body || {};
    const sets = [], params = [];
    if (b.stage_id !== undefined) {
      params.push(Number(b.stage_id)); sets.push(`stage_id = $${params.length}`);
      const st = await query(`SELECT is_won, is_lost FROM crm_stages WHERE id=$1`, [Number(b.stage_id)]);
      const status = st.rows[0]?.is_won ? 'won' : st.rows[0]?.is_lost ? 'lost' : 'open';
      params.push(status); sets.push(`status = $${params.length}`);
    }
    if (b.title !== undefined)          { params.push(b.title); sets.push(`title = $${params.length}`); }
    if (b.value_num !== undefined)      { params.push(b.value_num === null ? null : Number(b.value_num)); sets.push(`value_num = $${params.length}`); }
    if (b.currency !== undefined)       { params.push(b.currency); sets.push(`currency = $${params.length}`); }
    if (b.expected_close !== undefined) { params.push(b.expected_close || null); sets.push(`expected_close = $${params.length}`); }
    if (b.owner_user_id !== undefined)  { params.push(b.owner_user_id || null); sets.push(`owner_user_id = $${params.length}`); }
    if (!sets.length) return res.status(400).json({ error: 'nothing_to_update' });
    sets.push(`updated_at = now()`);
    params.push(id, tenantId(req));
    const r = await query(
      `UPDATE crm_deals SET ${sets.join(', ')} WHERE id=$${params.length-1} AND tenant_id=$${params.length}
       RETURNING id, stage_id, status, value_num`, params);
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});

// DELETE /api/crm/deals/:id
router.delete('/deals/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const r = await query(`DELETE FROM crm_deals WHERE id=$1 AND tenant_id=$2 RETURNING record_id, title`, [id, tenantId(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    if (r.rows[0].record_id) await logActivity(null, tenantId(req), r.rows[0].record_id, 'deal', {
      actorUserId: actorUserId(req), actorEmail: actorEmail(req), summary: 'Deal deleted: ' + (r.rows[0].title || ''),
    });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ── Sequences ───────────────────────────────────────────────────────────────

// GET /api/crm/sequences — list with step + active-enrollment counts
router.get('/sequences', async (req, res, next) => {
  try {
    const r = await query(
      `SELECT s.id, s.name, s.status, s.created_at,
              (SELECT count(*)::int FROM crm_sequence_steps st WHERE st.sequence_id = s.id) AS step_count,
              (SELECT count(*)::int FROM crm_sequence_enrollments e WHERE e.sequence_id = s.id AND e.status='active') AS active_enrollments
         FROM crm_sequences s WHERE s.tenant_id = $1 ORDER BY s.created_at DESC`,
      [tenantId(req)]);
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});

// GET /api/crm/sequences/:id — sequence + steps
router.get('/sequences/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const s = await query(`SELECT * FROM crm_sequences WHERE id=$1 AND tenant_id=$2`, [id, tenantId(req)]);
    if (!s.rows.length) return res.status(404).json({ error: 'not_found' });
    const steps = await query(`SELECT id, step_no, delay_days, subject, body FROM crm_sequence_steps WHERE sequence_id=$1 ORDER BY step_no`, [id]);
    res.json({ sequence: s.rows[0], steps: steps.rows });
  } catch (err) { next(err); }
});

// POST /api/crm/sequences  { name, steps:[{delay_days, subject, body}, ...] }
router.post('/sequences', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const steps = Array.isArray(req.body?.steps) ? req.body.steps : [];
    if (!name) return res.status(400).json({ error: 'name_required' });
    if (!steps.length) return res.status(400).json({ error: 'steps_required' });
    const s = await query(
      `INSERT INTO crm_sequences (tenant_id, name, created_by) VALUES ($1,$2,$3) RETURNING id`,
      [tenantId(req), name, actorEmail(req)]);
    const seqId = Number(s.rows[0].id);
    let n = 0;
    for (const st of steps) {
      n++;
      await query(
        `INSERT INTO crm_sequence_steps (tenant_id, sequence_id, step_no, delay_days, subject, body)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [tenantId(req), seqId, n, Math.max(0, Number(st.delay_days) || 0), st.subject || null, st.body || null]);
    }
    res.json({ id: seqId, steps: n });
  } catch (err) { next(err); }
});

// POST /api/crm/records/:id/enroll  { sequence_id }  (admin-only while sending is single-domain)
router.post('/records/:id/enroll', async (req, res, next) => {
  try {
    if (!canSendEmail(req)) {
      return res.status(403).json({ error: 'admin_only', reason: 'Running sequences is limited to admins for now.' });
    }
    const recordId = Number(req.params.id);
    const sequenceId = Number(req.body?.sequence_id);
    if (!Number.isFinite(sequenceId)) return res.status(400).json({ error: 'sequence_id_required' });
    const owns = await query(`SELECT 1 FROM crm_records WHERE id=$1 AND tenant_id=$2`, [recordId, tenantId(req)]);
    if (!owns.rows.length) return res.status(404).json({ error: 'not_found' });
    const seq = await query(`SELECT 1 FROM crm_sequences WHERE id=$1 AND tenant_id=$2`, [sequenceId, tenantId(req)]);
    if (!seq.rows.length) return res.status(404).json({ error: 'sequence_not_found' });
    const step1 = await query(`SELECT delay_days FROM crm_sequence_steps WHERE sequence_id=$1 AND step_no=1`, [sequenceId]);
    if (!step1.rows.length) return res.status(400).json({ error: 'sequence_has_no_steps' });
    const delay = Math.max(0, Number(step1.rows[0].delay_days) || 0);

    const r = await query(
      `INSERT INTO crm_sequence_enrollments (tenant_id, sequence_id, record_id, current_step, status, enrolled_by, next_run_at)
       VALUES ($1,$2,$3,1,'active',$4, now() + ($5 || ' days')::interval)
       ON CONFLICT (tenant_id, sequence_id, record_id) DO NOTHING
       RETURNING id`,
      [tenantId(req), sequenceId, recordId, actorEmail(req), String(delay)]);
    if (!r.rows.length) return res.status(409).json({ error: 'already_enrolled' });
    await logActivity(null, tenantId(req), recordId, 'sequence', {
      actorUserId: actorUserId(req), actorEmail: actorEmail(req), summary: 'Enrolled in a sequence',
      payload: { sequence_id: sequenceId, enrollment_id: r.rows[0].id },
    });
    res.json({ enrollment_id: r.rows[0].id, status: 'active' });
  } catch (err) { next(err); }
});

// POST /api/crm/enrollments/:id/stop
router.post('/enrollments/:id/stop', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const r = await query(
      `UPDATE crm_sequence_enrollments SET status='stopped'
        WHERE id=$1 AND tenant_id=$2 AND status='active' RETURNING id, record_id`,
      [id, tenantId(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found_or_not_active' });
    await logActivity(null, tenantId(req), r.rows[0].record_id, 'sequence', {
      actorEmail: actorEmail(req), summary: 'Sequence stopped',
    });
    res.json({ stopped: id });
  } catch (err) { next(err); }
});

// ── Bulk actions ────────────────────────────────────────────────────────────
// POST /api/crm/records/bulk  { ids:[], action, status?|archived?|sequence_id? }
router.post('/records/bulk', async (req, res, next) => {
  try {
    const ids = (Array.isArray(req.body?.ids) ? req.body.ids : []).map(Number).filter(Number.isFinite);
    if (!ids.length) return res.status(400).json({ error: 'no_ids' });
    const action = req.body?.action;
    const tid = tenantId(req);

    if (action === 'status') {
      const status = req.body?.status;
      if (!RECORD_STATUSES.has(status)) return res.status(400).json({ error: 'invalid_status' });
      const r = await query(`UPDATE crm_records SET status=$1 WHERE tenant_id=$2 AND id = ANY($3::bigint[]) RETURNING id`, [status, tid, ids]);
      for (const row of r.rows) {
        await logActivity(null, tid, row.id, 'status_change', { actorUserId: actorUserId(req), actorEmail: actorEmail(req), summary: 'Status → ' + status, payload: { to: status, bulk: true } });
      }
      return res.json({ updated: r.rowCount });
    }
    if (action === 'archive') {
      const archived = req.body?.archived !== false;
      const r = await query(`UPDATE crm_records SET archived=$1 WHERE tenant_id=$2 AND id = ANY($3::bigint[]) RETURNING id`, [archived, tid, ids]);
      return res.json({ updated: r.rowCount });
    }
    if (action === 'enroll') {
      if (!canSendEmail(req)) return res.status(403).json({ error: 'admin_only', reason: 'Running sequences is limited to admins for now.' });
      const sequenceId = Number(req.body?.sequence_id);
      if (!Number.isFinite(sequenceId)) return res.status(400).json({ error: 'sequence_id_required' });
      const seq = await query(`SELECT 1 FROM crm_sequences WHERE id=$1 AND tenant_id=$2`, [sequenceId, tid]);
      if (!seq.rows.length) return res.status(404).json({ error: 'sequence_not_found' });
      const step1 = await query(`SELECT delay_days FROM crm_sequence_steps WHERE sequence_id=$1 AND step_no=1`, [sequenceId]);
      if (!step1.rows.length) return res.status(400).json({ error: 'sequence_has_no_steps' });
      const delay = String(Math.max(0, Number(step1.rows[0].delay_days) || 0));
      // Only enroll records that actually belong to this tenant.
      const own = await query(`SELECT id FROM crm_records WHERE tenant_id=$1 AND id = ANY($2::bigint[])`, [tid, ids]);
      let enrolled = 0;
      for (const row of own.rows) {
        const r = await query(
          `INSERT INTO crm_sequence_enrollments (tenant_id, sequence_id, record_id, current_step, status, enrolled_by, next_run_at)
           VALUES ($1,$2,$3,1,'active',$4, now() + ($5 || ' days')::interval)
           ON CONFLICT (tenant_id, sequence_id, record_id) DO NOTHING RETURNING id`,
          [tid, sequenceId, row.id, actorEmail(req), delay]);
        if (r.rows.length) {
          enrolled++;
          await logActivity(null, tid, row.id, 'sequence', { actorEmail: actorEmail(req), summary: 'Enrolled in a sequence', payload: { sequence_id: sequenceId, bulk: true } });
        }
      }
      return res.json({ enrolled, requested: own.rows.length });
    }
    if (action === 'send') {
      if (!canSendEmail(req)) return res.status(403).json({ error: 'cannot_send' });
      const subjTpl = String(req.body?.subject || '');
      const bodyTpl = String(req.body?.body || '');
      if (!subjTpl.trim() && !bodyTpl.trim()) return res.status(400).json({ error: 'empty_email' });
      const recs = await query(
        `SELECT r.id, r.entity_type, r.entity_id,
                c.email AS company_email, p.email AS person_email,
                c.name AS company_name, c.industry AS company_industry, c.city AS company_city, c.website AS company_website,
                p.full_name AS person_name, p.headline AS person_headline
           FROM crm_records r
           LEFT JOIN companies c ON r.entity_type='company' AND c.id=r.entity_id
           LEFT JOIN people    p ON r.entity_type='person'  AND p.id=r.entity_id
          WHERE r.tenant_id=$1 AND r.id = ANY($2::bigint[])`, [tid, ids]);
      let from;
      try { from = formatFrom(await resolveSendIdentity(tid)); } catch (e) { console.error('[crm] identity resolve failed:', e.message); }
      from = from || await getFromAddress();
      const replyTo = actorEmail(req);
      const lim0 = await checkDailyLimit(tid, req.tenant?.plan);
      let remaining = lim0.remaining;
      let sent = 0, noEmail = 0, capped = 0, failed = 0;
      for (const r0 of recs.rows) {
        const to = String((r0.entity_type === 'company' ? r0.company_email : r0.person_email) || '').trim();
        if (!to) { noEmail++; continue; }
        if (remaining <= 0) { capped++; continue; }
        const vars = buildMergeVars(r0);
        const subject = applyMerge(subjTpl, vars);
        const bodyText = applyMerge(bodyTpl, vars);
        const insB = await query(
          `INSERT INTO crm_emails (tenant_id, record_id, direction, to_email, reply_to, subject, body_text, status, sent_by)
           VALUES ($1,$2,'out',$3,$4,$5,$6,'queued',$7) RETURNING id`,
          [tid, r0.id, to, replyTo, subject, bodyText, replyTo]);
        const emailId = Number(insB.rows[0].id);
        const effReplyTo = inboundReplyTo(emailId) || replyTo;
        try {
          const s = await sendEmail({ from, to, replyTo: effReplyTo, subject, text: bodyText });
          await query(`UPDATE crm_emails SET status='sent', provider_message_id=$2, from_email=$3, reply_to=$4, sent_at=now() WHERE id=$1`, [emailId, s.id, from, effReplyTo]);
          await logActivity(null, tid, r0.id, 'email_out', { actorUserId: actorUserId(req), actorEmail: replyTo, summary: 'Email sent: ' + (subject || '(no subject)'), payload: { to, email_id: emailId, bulk: true } });
          await markContacted(null, tid, r0.id, replyTo);
          sent++; remaining--;
        } catch (e) {
          await query(`UPDATE crm_emails SET status='failed', error=$2 WHERE id=$1`, [emailId, String(e.message).slice(0, 400)]);
          failed++;
        }
      }
      return res.json({ action: 'send', requested: ids.length, sent, no_email: noEmail, capped, failed });
    }
    return res.status(400).json({ error: 'unknown_action' });
  } catch (err) { next(err); }
});

// ── Saved segments ──────────────────────────────────────────────────────────
router.get('/segments', async (req, res, next) => {
  try {
    const r = await query(`SELECT id, name, filters, created_at FROM crm_segments WHERE tenant_id=$1 ORDER BY name`, [tenantId(req)]);
    res.json({ rows: r.rows });
  } catch (err) { next(err); }
});
router.post('/segments', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name_required' });
    const filters = req.body?.filters && typeof req.body.filters === 'object' ? req.body.filters : {};
    const r = await query(
      `INSERT INTO crm_segments (tenant_id, name, filters, created_by) VALUES ($1,$2,$3::jsonb,$4) RETURNING id, name, filters, created_at`,
      [tenantId(req), name, JSON.stringify(filters), actorEmail(req)]);
    res.json(r.rows[0]);
  } catch (err) { next(err); }
});
router.delete('/segments/:id', async (req, res, next) => {
  try {
    const r = await query(`DELETE FROM crm_segments WHERE id=$1 AND tenant_id=$2 RETURNING id`, [Number(req.params.id), tenantId(req)]);
    if (!r.rows.length) return res.status(404).json({ error: 'not_found' });
    res.json({ deleted: r.rows[0].id });
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
