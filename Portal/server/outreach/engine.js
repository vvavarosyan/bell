// Outreach engine — plans a campaign, drafts emails for review (dry-run), and (only when
// explicitly enabled) sends them under a warmup ramp within Qatar working hours.
//
// THREE HARD GATES stand between this code and a real send:
//   1. BDI_OUTREACH_ENABLED must be truthy. Default OFF. Nothing sends otherwise.
//   2. The send goes through channel:'outreach' → the isolated go.bell.qa Resend account. It
//      can NEVER fall back to the transactional key (lib/email.js enforces this). Outreach
//      cannot take down bell.qa's real mail.
//   3. Every send is inside Qatar working hours, under the campaign's warmup+daily cap AND a
//      global daily ceiling, carries a working one-click unsubscribe, and re-checks
//      suppression + consent-withdrawal at send time.
//
// preview*() NEVER sends — it composes drafts so Val can read exactly what would go out.

import { query } from '../db.js';
import { composeEmail, withFooter } from './compose.js';
import { buildTargets } from './targeting.js';
import { generateOptoutToken, listUnsubscribeHeaders, isOptedOut } from './optout.js';
import { isQatarWorkingHour } from '../lib/qatar_time.js';
import { sendEmail } from '../lib/email.js';
import { isSuppressed } from '../lib/suppression.js';

export const OUTREACH_ENABLED = () => {
  const v = String(process.env.BDI_OUTREACH_ENABLED || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
};
const GLOBAL_DAILY_CAP = () => Math.max(0, parseInt(process.env.BDI_OUTREACH_GLOBAL_CAP || '60', 10) || 0);
// Where outreach replies land. DMARC ignores Reply-To, so bell.qa (parent of the go.bell.qa
// sending domain) is safe and, unlike an isolated go.bell.qa inbox, is a mailbox Val already
// reads. Override per-campaign (campaign.reply_to) or globally (BDI_OUTREACH_REPLY_TO).
const OUTREACH_REPLY_TO = () => process.env.BDI_OUTREACH_REPLY_TO || 'hello@bell.qa';

const firstIndustry = (t) => (t.industry || (Array.isArray(t.industries) ? t.industries[0] : null) || '').toString().trim() || null;

// --- campaign helpers -------------------------------------------------------
export async function getCampaign(id) {
  const r = await query(`SELECT * FROM outreach_campaigns WHERE id=$1`, [id]);
  return r.rows[0] || null;
}
export async function listCampaigns() {
  const r = await query(`SELECT * FROM outreach_campaigns ORDER BY created_at DESC`);
  return r.rows;
}
export async function createCampaign(fields = {}) {
  const f = {
    name: fields.name || 'Untitled campaign',
    goal: fields.goal || null,
    audience_tier: fields.audience_tier || 'role_mailbox',
    lang_mode: fields.lang_mode || 'en',
    daily_cap: Number.isFinite(+fields.daily_cap) ? +fields.daily_cap : 30,
    warmup_start: Number.isFinite(+fields.warmup_start) ? +fields.warmup_start : 8,
    warmup_step: Number.isFinite(+fields.warmup_step) ? +fields.warmup_step : 6,
    from_name: fields.from_name || 'Bell',
    reply_to: fields.reply_to || null,
    notes: fields.notes || null,
  };
  const r = await query(
    `INSERT INTO outreach_campaigns (name, goal, audience_tier, lang_mode, daily_cap, warmup_start, warmup_step, from_name, reply_to, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
    [f.name, f.goal, f.audience_tier, f.lang_mode, f.daily_cap, f.warmup_start, f.warmup_step, f.from_name, f.reply_to, f.notes]);
  return r.rows[0];
}
export async function setCampaignStatus(id, status) {
  const activated = status === 'active' ? ', activated_at = COALESCE(activated_at, now())' : '';
  const r = await query(`UPDATE outreach_campaigns SET status=$2, updated_at=now()${activated} WHERE id=$1 RETURNING *`, [id, status]);
  return r.rows[0] || null;
}

// --- planning: materialize the queue ---------------------------------------
/** Fill outreach_targets for a campaign from the targeting query. Idempotent (UNIQUE guard). */
export async function planCampaign(campaignId, { max = 100000 } = {}) {
  const c = await getCampaign(campaignId);
  if (!c) throw new Error('campaign_not_found');
  const langForMode = c.lang_mode === 'ar' ? 'ar' : c.lang_mode === 'bilingual' ? 'bilingual' : 'en';
  const { targets, counts } = await buildTargets({ tier: c.audience_tier, lang: langForMode, campaignId, max });
  // Batch-insert (500/query) — a role-mailbox campaign is ~12k targets; one-at-a-time would
  // hang the Plan button for a minute.
  let inserted = 0;
  const CHUNK = 500;
  for (let i = 0; i < targets.length; i += CHUNK) {
    const slice = targets.slice(i, i + CHUNK);
    const vals = []; const params = [];
    slice.forEach((t, j) => {
      const b = j * 6;
      vals.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`);
      params.push(campaignId, t.company_id, t.company_name, t.email, t.address_class, t.lang);
    });
    const r = await query(
      `INSERT INTO outreach_targets (campaign_id, company_id, company_name, email, address_class, lang)
       VALUES ${vals.join(',')}
       ON CONFLICT (campaign_id, email) DO NOTHING`, params);
    inserted += r.rowCount || 0;
  }
  return { inserted, counts };
}

// --- dry-run preview: draft, never send ------------------------------------
/**
 * Compose N sample emails WITHOUT sending. Works with or without a campaign:
 *  - by campaignId: drafts for the next N pending targets.
 *  - by {tier, lang}: builds targets on the fly and drafts the first N.
 * Returns [{ company_name, email, address_class, lang, subject, text, html, source }].
 */
export async function previewBatch({ campaignId = null, tier = 'role_mailbox', lang = 'en', fromName = 'The Bell team', n = 5 } = {}) {
  let rows = [];
  if (campaignId) {
    const c = await getCampaign(campaignId);
    if (c) { lang = c.lang_mode === 'ar' ? 'ar' : c.lang_mode === 'bilingual' ? 'bilingual' : 'en'; fromName = c.from_name || fromName; }
    const r = await query(
      `SELECT company_id, company_name, email, address_class, lang FROM outreach_targets
        WHERE campaign_id=$1 AND status='pending' ORDER BY id LIMIT $2`, [campaignId, n]);
    // enrich with industry/city for the composer
    const ids = r.rows.map((x) => x.company_id).filter(Boolean);
    const meta = ids.length ? (await query(`SELECT id, industry, industries, city, website FROM companies WHERE id = ANY($1)`, [ids])).rows : [];
    const mById = new Map(meta.map((m) => [Number(m.id), m]));
    rows = r.rows.map((x) => ({ ...x, ...(mById.get(Number(x.company_id)) || {}) }));
  } else {
    const { targets } = await buildTargets({ tier, lang, max: 20000 });
    rows = targets.slice(0, n);
  }

  const out = [];
  for (const t of rows) {
    const email = await composeEmail({
      companyName: t.company_name, industry: firstIndustry(t), city: t.city, website: t.website,
      lang: t.lang || lang, fromName,
    });
    out.push({
      company_id: t.company_id, company_name: t.company_name, email: t.email,
      address_class: t.address_class, lang: t.lang || lang,
      subject: email.subject, text: email.text, html: email.html, source: email.source,
    });
  }
  return out;
}

// --- warmup / cap math ------------------------------------------------------
async function sentTodayGlobal() {
  const r = await query(
    `SELECT count(*)::int AS n FROM outreach_targets
      WHERE status='sent' AND sent_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Qatar') AT TIME ZONE 'Asia/Qatar')`);
  return r.rows[0]?.n || 0;
}
async function sentTodayCampaign(campaignId) {
  const r = await query(
    `SELECT count(*)::int AS n FROM outreach_targets
      WHERE campaign_id=$1 AND status='sent' AND sent_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Qatar') AT TIME ZONE 'Asia/Qatar')`, [campaignId]);
  return r.rows[0]?.n || 0;
}
// Warmup allowance for a campaign today = min(daily_cap, warmup_start + warmup_step*dayIndex).
function warmupAllowance(c) {
  if (!c.activated_at) return c.warmup_start;
  const day0 = new Date(c.activated_at);
  const dayIndex = Math.max(0, Math.floor((Date.now() - day0.getTime()) / 86400000));
  return Math.min(c.daily_cap, c.warmup_start + c.warmup_step * dayIndex);
}

/** How many this campaign may still send right now (0 if outside hours / disabled / capped). */
export async function remainingAllowance(c) {
  if (!OUTREACH_ENABLED()) return { allowed: 0, reason: 'engine_disabled' };
  if (c.status !== 'active') return { allowed: 0, reason: 'campaign_' + c.status };
  if (!isQatarWorkingHour()) return { allowed: 0, reason: 'outside_qatar_hours' };
  const campaignAllow = Math.max(0, warmupAllowance(c) - await sentTodayCampaign(c.id));
  const globalAllow = Math.max(0, GLOBAL_DAILY_CAP() - await sentTodayGlobal());
  const allowed = Math.min(campaignAllow, globalAllow);
  return { allowed, reason: allowed > 0 ? 'ok' : (globalAllow === 0 ? 'global_cap_reached' : 'campaign_cap_reached') };
}

// --- the send tick (gated) --------------------------------------------------
/** Send one target now. Re-checks suppression/consent at the last moment. */
async function sendOne(c, t) {
  const email = String(t.email || '').toLowerCase();
  // Last-moment safety re-checks (state may have changed since planning).
  if (await isSuppressed(email)) {
    await query(`UPDATE outreach_targets SET status='skipped', skip_reason='suppressed', updated_at=now() WHERE id=$1`, [t.id]);
    return 'skipped';
  }
  // Consent-withdrawal gate — independent of suppression. An unsubscribe writes BOTH a
  // withdrawn-consent row and a suppression row, but any withdrawal recorded via a path that
  // doesn't also suppress would still be honoured here. (isOptedOut = latest event is a
  // withdrawal; "no consent row" is NOT opted out — cold outreach runs on founder-instruction.)
  if (await isOptedOut(email)) {
    await query(`UPDATE outreach_targets SET status='skipped', skip_reason='opted_out', updated_at=now() WHERE id=$1`, [t.id]);
    return 'skipped';
  }
  const meta = t.company_id ? (await query(`SELECT industry, industries, city, website FROM companies WHERE id=$1`, [t.company_id])).rows[0] : null;
  const composed = await composeEmail({
    companyName: t.company_name, industry: meta ? firstIndustry(meta) : null,
    city: meta?.city, website: meta?.website, lang: t.lang || 'en', fromName: c.from_name || 'The Bell team',
  });
  const token = await generateOptoutToken(email, { companyId: t.company_id, campaignId: c.id });
  const headers = listUnsubscribeHeaders(token);
  const unsubUrl = (process.env.BELL_APP_URL || 'https://app.bell.qa').replace(/\/$/, '') + '/u/' + token;
  const final = withFooter({ text: composed.text, html: composed.html, unsubUrl, lang: t.lang || 'en' });

  const ins = await query(
    `INSERT INTO crm_emails (tenant_id, record_id, direction, to_email, subject, body_text, body_html, status, sent_by, provider)
     VALUES (1, NULL, 'out', $1, $2, $3, $4, 'queued', 'outreach-engine', 'resend') RETURNING id`,
    [email, composed.subject, final.text, final.html]);
  const crmId = Number(ins.rows[0].id);

  try {
    const res = await sendEmail({
      to: email, subject: composed.subject, html: final.html, text: final.text,
      replyTo: c.reply_to || OUTREACH_REPLY_TO(), headers, channel: 'outreach',
    });
    await query(`UPDATE crm_emails SET status='sent', provider_message_id=$2, from_email=$3, sent_at=now() WHERE id=$1`,
      [crmId, res?.id || null, 'hello@go.bell.qa']);
    await query(
      `UPDATE outreach_targets SET status='sent', crm_email_id=$2, optout_token=$3, subject=$4, body_text=$5, body_html=$6, sent_at=now(), updated_at=now() WHERE id=$1`,
      [t.id, crmId, token, composed.subject, final.text, final.html]);
    await query(`UPDATE outreach_arms SET sent = sent + 1 WHERE id = $1`, [t.arm_id]).catch(() => {});
    return 'sent';
  } catch (e) {
    await query(`UPDATE crm_emails SET status='failed', error=$2 WHERE id=$1`, [crmId, String(e.message).slice(0, 400)]);
    await query(`UPDATE outreach_targets SET status='failed', skip_reason=$2, updated_at=now() WHERE id=$1`, [t.id, String(e.message).slice(0, 200)]);
    return 'failed';
  }
}

// --- scheduler --------------------------------------------------------------
let _timer = null;
let _running = false;
async function _safeTick() {
  if (_running) return;                 // single-flight
  _running = true;
  try {
    const r = await runOutreachTick();
    if (r?.ran && r.report?.some((x) => x.sent > 0)) {
      console.log('[outreach] tick:', JSON.stringify(r.report));
    }
  } catch (e) {
    console.error('[outreach] tick failed:', e.message);
  } finally { _running = false; }
}
/**
 * Start the outreach dispatcher on ONE service. Gated by BDI_OUTREACH_SCHEDULER=1 (which
 * service ticks) — and even when it ticks, runOutreachTick is a no-op until BDI_OUTREACH_ENABLED
 * is also set. Two separate switches on purpose: you can schedule the loop long before you ever
 * arm the send.
 */
export function startOutreachScheduler() {
  if (process.env.BDI_OUTREACH_SCHEDULER !== '1') {
    console.log('[outreach] scheduler disabled (set BDI_OUTREACH_SCHEDULER=1 on ONE service to enable)');
    return;
  }
  setTimeout(() => _safeTick(), 12_000);
  _timer = setInterval(_safeTick, 60_000);
  console.log('[outreach] scheduler online (60s tick; send-gate BDI_OUTREACH_ENABLED=' + OUTREACH_ENABLED() + ')');
}

/**
 * One dispatcher tick. Walks active campaigns, sends up to each one's remaining allowance.
 * A NO-OP unless BDI_OUTREACH_ENABLED is set. Returns a per-campaign report.
 */
export async function runOutreachTick() {
  if (!OUTREACH_ENABLED()) return { skipped: 'engine_disabled' };
  if (!isQatarWorkingHour()) return { skipped: 'outside_qatar_hours' };
  const campaigns = (await query(`SELECT * FROM outreach_campaigns WHERE status='active' ORDER BY created_at`)).rows;
  const report = [];
  for (const c of campaigns) {
    const { allowed, reason } = await remainingAllowance(c);
    if (allowed <= 0) { report.push({ campaign: c.id, sent: 0, reason }); continue; }
    const due = (await query(
      `SELECT * FROM outreach_targets WHERE campaign_id=$1 AND status='pending' ORDER BY id LIMIT $2`, [c.id, allowed])).rows;
    let sent = 0, skipped = 0, failed = 0;
    for (const t of due) {
      const r = await sendOne(c, t);
      if (r === 'sent') sent += 1; else if (r === 'skipped') skipped += 1; else failed += 1;
      if (sent >= allowed) break;
    }
    report.push({ campaign: c.id, sent, skipped, failed });
  }
  return { ran: true, report };
}

// --- inbound replies (reply capture + reply-stop) ---------------------------
/**
 * Record an inbound reply to an outreach email: log it (so the admin mail view shows it) and
 * mark the most recent sent target for that address as 'replied' — which takes them out of the
 * pending queue (reply-stop: a human is now in the loop, the automation must not keep emailing).
 * Fed by the /api/marketing-inbound webhook. Returns { matched, targetId, campaignId }.
 */
export async function recordOutreachReply({ fromEmail, subject = null, text = null, toEmail = null } = {}) {
  const from = String(fromEmail || '').trim().toLowerCase();
  if (!from) return { matched: false, reason: 'no_from' };
  // Log the incoming message for the admin mail view.
  await query(
    `INSERT INTO crm_emails (tenant_id, record_id, direction, to_email, from_email, subject, body_text, status, sent_by, provider, sent_at)
     VALUES (1, NULL, 'in', $1, $2, $3, $4, 'delivered', 'outreach-inbound', 'inbound', now())`,
    [toEmail || OUTREACH_REPLY_TO(), from, subject, text]);
  // Reply-stop: the most recent 'sent' target for this address becomes 'replied'.
  const r = await query(
    `UPDATE outreach_targets SET status='replied', replied_at=now(), updated_at=now()
      WHERE id = (SELECT id FROM outreach_targets WHERE lower(email)=$1 AND status='sent'
                   ORDER BY sent_at DESC NULLS LAST LIMIT 1)
      RETURNING id, campaign_id, arm_id`, [from]);
  const t = r.rows[0];
  if (t?.arm_id) await query(`UPDATE outreach_arms SET replied = replied + 1 WHERE id=$1`, [t.arm_id]).catch(() => {});
  return { matched: !!t, targetId: t?.id || null, campaignId: t?.campaign_id || null };
}
