// Admin API for Bell's self-marketing outreach. Mounted at /api/marketing with ...adminOnly
// (admin.bell.qa + local engine only; blocked on the user portal). This is Bell marketing
// ITSELF to Qatar — never a customer feature. (The existing /api/outreach router is a
// different thing: per-tenant CUSTOMER sending identities.)
//
// Nothing here sends on its own. The only path that can send is the scheduler tick, and only
// when BDI_OUTREACH_ENABLED is set. These endpoints let Val see the addressable market,
// draft-preview real emails, build/plan/pause campaigns, and read the queue.

import express from 'express';
import { query } from '../db.js';
import { targetingSummary } from '../outreach/targeting.js';
import {
  OUTREACH_ENABLED, listCampaigns, getCampaign, createCampaign, setCampaignStatus,
  planCampaign, previewBatch, remainingAllowance, addTarget, recordOutreachReply, sendTestNow,
} from '../outreach/engine.js';
import {
  breakerStatus, resetBreaker, preflight, isQatarHolidayToday, getState,
} from '../outreach/machine.js';
import { isQatarWorkingHour, formatQatar } from '../lib/qatar_time.js';

const router = express.Router();

async function campaignCounts(id) {
  const r = await query(
    `SELECT status, count(*)::int AS n FROM outreach_targets WHERE campaign_id=$1 GROUP BY status`, [id]);
  const out = {};
  for (const row of r.rows) out[row.status] = row.n;
  return out;
}

// GET /api/marketing/summary — the dashboard header: engine state + addressable market.
router.get('/summary', async (_req, res) => {
  try {
    const [tiers, sentToday, eng] = await Promise.all([
      targetingSummary(),
      query(`SELECT count(*)::int AS n FROM outreach_targets WHERE status='sent'
                AND sent_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Qatar') AT TIME ZONE 'Asia/Qatar')`),
      // Engagement totals — match what the mail log shows (every outreach send / reply), plus
      // the real opt-out count (across ALL addresses, not just the company list).
      query(`SELECT
                (SELECT count(*)::int FROM crm_emails WHERE direction='out'
                   AND sent_by IN ('outreach-engine','outreach-test') AND status='sent') AS emailed,
                (SELECT count(*)::int FROM crm_emails WHERE direction='in'
                   AND sent_by='outreach-inbound')                                        AS replied,
                (SELECT count(*)::int FROM email_suppressions WHERE reason='unsubscribe')  AS unsubscribed`),
    ]);
    const e0 = eng.rows[0] || {};
    res.json({
      engine: {
        send_enabled: OUTREACH_ENABLED(),
        scheduler_on: process.env.BDI_OUTREACH_SCHEDULER === '1',
        within_qatar_hours: isQatarWorkingHour(),
        global_daily_cap: Math.max(0, parseInt(process.env.BDI_OUTREACH_GLOBAL_CAP || '60', 10) || 0),
        sent_today: sentToday.rows[0]?.n || 0,
        qatar_time: formatQatar(new Date()),
        channel: 'go.bell.qa (isolated)',
      },
      engagement: { emailed: e0.emailed || 0, replied: e0.replied || 0, unsubscribed: e0.unsubscribed || 0 },
      addressable: tiers,
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/marketing/machine — the autonomous layer's own state: circuit breaker, last
// pre-flight self-test, holiday status. The admin sees WHY the machine is or isn't sending.
router.get('/machine', async (_req, res) => {
  try {
    const [breaker, pf, hol] = await Promise.all([breakerStatus(), getState('preflight'), isQatarHolidayToday()]);
    res.json({ breaker, preflight: pf, holiday: hol });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/marketing/machine/reset-breaker — admin investigated, resume sending.
router.post('/machine/reset-breaker', async (_req, res) => {
  try { await resetBreaker(); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/marketing/machine/preflight — run the self-test on demand (shows in the panel).
router.post('/machine/preflight', async (_req, res) => {
  try { res.json(await preflight()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// Qatar holidays (movable feasts — admin adds them when announced; fixed civic days are code).
router.get('/holidays', async (_req, res) => {
  try { res.json({ holidays: (await query(`SELECT day, name FROM qatar_holidays ORDER BY day`)).rows }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
router.post('/holidays', async (req, res) => {
  try {
    const { day, name } = req.body || {};
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(day || '')) || !name) return res.status(400).json({ error: 'need day (YYYY-MM-DD) and name' });
    await query(`INSERT INTO qatar_holidays (day, name) VALUES ($1,$2) ON CONFLICT (day) DO UPDATE SET name=EXCLUDED.name`, [day, name]);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
router.delete('/holidays/:day', async (req, res) => {
  try { await query(`DELETE FROM qatar_holidays WHERE day=$1`, [req.params.day]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/marketing/hot-leads — every INTERESTED reply across campaigns: who, what they said,
// whether they've since converted. The machine's output tray.
router.get('/hot-leads', async (_req, res) => {
  try {
    const r = await query(
      `SELECT t.id, t.company_id, t.company_name, t.email, t.replied_at, t.reply_text,
              t.converted_at, t.converted_tenant_id, c.name AS campaign_name
         FROM outreach_targets t JOIN outreach_campaigns c ON c.id = t.campaign_id
        WHERE t.reply_class = 'interested'
        ORDER BY t.replied_at DESC NULLS LAST LIMIT 200`);
    res.json({ leads: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/marketing/campaigns/:id/stats — the funnel + per-arm performance.
router.get('/campaigns/:id/stats', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const funnel = (await query(
      `SELECT
         count(*)::int                                                        AS targets,
         count(*) FILTER (WHERE t.status IN ('sent','replied','bounced','unsubscribed'))::int AS emailed,
         count(*) FILTER (WHERE ce.status IN ('delivered','opened'))::int     AS delivered,
         count(*) FILTER (WHERE ce.status = 'opened')::int                    AS opened,
         count(*) FILTER (WHERE ce.clicked_at IS NOT NULL)::int               AS clicked,
         count(*) FILTER (WHERE t.status = 'replied')::int                    AS replied,
         count(*) FILTER (WHERE t.reply_class = 'interested')::int            AS interested,
         count(*) FILTER (WHERE t.status = 'unsubscribed')::int               AS unsubscribed,
         count(*) FILTER (WHERE t.status = 'bounced')::int                    AS bounced,
         count(*) FILTER (WHERE t.converted_at IS NOT NULL)::int              AS converted,
         count(*) FILTER (WHERE t.touch_count > 1)::int                       AS followups_sent
       FROM outreach_targets t LEFT JOIN crm_emails ce ON ce.id = t.crm_email_id
       WHERE t.campaign_id = $1`, [id])).rows[0];
    const arms = (await query(
      `SELECT id, key, angle, is_active, sent, replied, positive, unsubscribed, bounced
         FROM outreach_arms WHERE campaign_id=$1 ORDER BY id`, [id])).rows;
    res.json({ funnel, arms });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/marketing/clear-tests — wipe TEST artifacts so real outreach starts on a clean
// slate: manual test sends (sent_by='outreach-test'), manually-added targets, and test replies.
// NEVER touches the consent ledger (append-only, legally required) or real engine sends.
router.post('/clear-tests', async (_req, res) => {
  try {
    const a = await query(`DELETE FROM crm_emails WHERE direction='out' AND sent_by='outreach-test'`);
    const b = await query(`DELETE FROM crm_emails WHERE direction='in' AND sent_by='outreach-inbound'
                            AND from_email NOT IN (SELECT lower(email) FROM outreach_targets WHERE address_class <> 'manual')`);
    const c = await query(`DELETE FROM outreach_targets WHERE address_class='manual'`);
    res.json({ ok: true, removed: { test_sends: a.rowCount, test_replies: b.rowCount, manual_targets: c.rowCount } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/marketing/campaigns — list, each with queue counts.
router.get('/campaigns', async (_req, res) => {
  try {
    const rows = await listCampaigns();
    const withCounts = await Promise.all(rows.map(async (c) => ({ ...c, counts: await campaignCounts(c.id) })));
    res.json({ campaigns: withCounts });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/marketing/campaigns — create a (draft) campaign.
router.post('/campaigns', async (req, res) => {
  try { res.json({ campaign: await createCampaign(req.body || {}) }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/marketing/campaigns/:id — one campaign + counts + current allowance.
router.get('/campaigns/:id', async (req, res) => {
  try {
    const c = await getCampaign(Number(req.params.id));
    if (!c) return res.status(404).json({ error: 'not_found' });
    res.json({ campaign: c, counts: await campaignCounts(c.id), allowance: await remainingAllowance(c) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/marketing/campaigns/:id/plan — materialize the target queue from the DB.
router.post('/campaigns/:id/plan', async (req, res) => {
  try { res.json(await planCampaign(Number(req.params.id))); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/marketing/campaigns/:id/preview?n=5 — DRY RUN. Draft real emails, send nothing.
router.get('/campaigns/:id/preview', async (req, res) => {
  try {
    const n = Math.min(20, Math.max(1, parseInt(req.query.n, 10) || 5));
    res.json({ drafts: await previewBatch({ campaignId: Number(req.params.id), n }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/marketing/preview?tier=role_mailbox&lang=en&n=5 — ad-hoc dry run, no campaign needed.
router.get('/preview', async (req, res) => {
  try {
    const n = Math.min(20, Math.max(1, parseInt(req.query.n, 10) || 5));
    const tier = ['role_mailbox', 'named_person', 'unclassified', 'all'].includes(req.query.tier) ? req.query.tier : 'role_mailbox';
    const lang = ['en', 'ar', 'bilingual'].includes(req.query.lang) ? req.query.lang : 'en';
    res.json({ drafts: await previewBatch({ tier, lang, n }) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/marketing/campaigns/:id/add-target { email, companyName } — add ONE recipient
// (for a controlled test send). Respects suppression + opt-out.
router.post('/campaigns/:id/add-target', async (req, res) => {
  try {
    const out = await addTarget(Number(req.params.id), { email: req.body?.email, companyName: req.body?.companyName });
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/marketing/campaigns/:id/send-now — send NOW to explicitly-added test recipients
// only (never the bulk tier). For the end-to-end test session on prod.
router.post('/campaigns/:id/send-now', async (req, res) => {
  try { res.json(await sendTestNow(Number(req.params.id), { max: 5 })); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/marketing/log-reply { fromEmail, subject, text } — manually record a reply (test
// the Incoming flow + reply-stop without the inbound webhook wired yet).
router.post('/log-reply', async (req, res) => {
  try {
    const out = await recordOutreachReply({ fromEmail: req.body?.fromEmail, subject: req.body?.subject, text: req.body?.text });
    res.json(out);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

// POST /api/marketing/campaigns/:id/status { status } — draft|active|paused|done.
router.post('/campaigns/:id/status', async (req, res) => {
  try {
    const status = req.body?.status;
    if (!['draft', 'active', 'paused', 'done'].includes(status)) return res.status(400).json({ error: 'bad_status' });
    const c = await setCampaignStatus(Number(req.params.id), status);
    res.json({ campaign: c });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/marketing/mail?direction=out|in&limit= — the outreach mail log (admin sees ALL
// outgoing sends AND incoming replies).
router.get('/mail', async (req, res) => {
  try {
    const dir = req.query.direction === 'in' ? 'in' : 'out';
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const where = dir === 'out'
      ? `ce.direction='out' AND ce.sent_by IN ('outreach-engine','outreach-test')`
      : `ce.direction='in' AND ce.sent_by='outreach-inbound'`;
    // For each row, resolve the company behind the address (who they are) so the admin sees
    // WHO — not just an email. Match the outreach address (to_email out, from_email in).
    const addrCol = dir === 'out' ? 'ce.to_email' : 'ce.from_email';
    const r = await query(
      `SELECT ce.id, ce.to_email, ce.from_email, ce.subject, ce.status, ce.sent_by, ce.sent_at, ce.created_at, ce.error,
              (SELECT c.name FROM company_contacts cc JOIN companies c ON c.id=cc.company_id
                WHERE cc.type='email' AND lower(cc.value)=lower(${addrCol}) LIMIT 1) AS company_name
         FROM crm_emails ce WHERE ${where}
        ORDER BY COALESCE(ce.sent_at, ce.created_at) DESC LIMIT $1`, [limit]);
    res.json({ direction: dir, mail: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/marketing/mail/:id — one message with its full body (for the reader panel).
router.get('/mail/:id', async (req, res) => {
  try {
    const r = await query(
      `SELECT id, direction, to_email, from_email, subject, body_text, body_html, status, sent_by,
              provider_message_id, sent_at, created_at, error
         FROM crm_emails WHERE id=$1`, [Number(req.params.id)]);
    if (!r.rows[0]) return res.status(404).json({ error: 'not_found' });
    res.json({ email: r.rows[0] });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// GET /api/marketing/campaigns/:id/targets?status=&limit= — read the queue.
router.get('/campaigns/:id/targets', async (req, res) => {
  try {
    const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 100));
    const status = req.query.status;
    const params = [Number(req.params.id)];
    let where = 'campaign_id=$1';
    if (status) { params.push(status); where += ` AND status=$${params.length}`; }
    params.push(limit);
    const r = await query(
      `SELECT id, company_id, company_name, email, address_class, lang, status, skip_reason,
              subject, sent_at, replied_at, created_at
         FROM outreach_targets WHERE ${where} ORDER BY id DESC LIMIT $${params.length}`, params);
    res.json({ targets: r.rows });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

export default router;
