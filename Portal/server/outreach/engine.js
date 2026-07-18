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
import { composeEmail, withFooter, classifyReply } from './compose.js';
import { buildTargets } from './targeting.js';
import { generateOptoutToken, listUnsubscribeHeaders, isOptedOut, recordConsent } from './optout.js';
import { isQatarWorkingHour } from '../lib/qatar_time.js';
import { sendEmail, OUTREACH_FROM } from '../lib/email.js';
import { isSuppressed, addSuppression } from '../lib/suppression.js';
import {
  checkBreaker, breakerStatus, preflight, isQatarHolidayToday, pickArm,
  domainSentToday, markConversions,
} from './machine.js';

export const OUTREACH_ENABLED = () => {
  const v = String(process.env.BDI_OUTREACH_ENABLED || '').toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
};
const GLOBAL_DAILY_CAP = () => Math.max(0, parseInt(process.env.BDI_OUTREACH_GLOBAL_CAP || '60', 10) || 0);
// Where outreach replies land: replies@bell.qa — the DEDICATED mailbox the IMAP reply poller
// watches (created 2026-07-18). The default MUST be the watched mailbox: Val's live test proved
// that when the admin service lacks BDI_OUTREACH_REPLY_TO, a send from the admin console fell
// back to hello@bell.qa and the reply never reached the poller. DMARC ignores Reply-To, so the
// parent domain is safe. Override per-campaign (campaign.reply_to) or via BDI_OUTREACH_REPLY_TO.
const OUTREACH_REPLY_TO = () => process.env.BDI_OUTREACH_REPLY_TO || 'replies@bell.qa';

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
  const campaign = r.rows[0];
  // Seed two default A/B arms so the bandit has angles to learn over from send #1. The admin
  // can add/disable arms later; the machine leans toward whichever gets replies.
  const DEFAULT_ARMS = [
    { key: 'tenders-first', angle: 'Lead with the tenders pain: winning Qatar government work means seeing tenders the moment they publish. Bell shows them first.' },
    { key: 'signals-first', angle: 'Lead with market awareness: knowing which Qatar companies are buying, hiring, and announcing before competitors do. Bell surfaces those signals.' },
  ];
  for (const a of DEFAULT_ARMS) {
    await query(
      `INSERT INTO outreach_arms (campaign_id, key, angle) VALUES ($1,$2,$3)
       ON CONFLICT (campaign_id, key) DO NOTHING`, [campaign.id, a.key, a.angle]);
  }
  return campaign;
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

/**
 * Add ONE specific recipient to a campaign (for a controlled test send — e.g. MyWeb Systems,
 * or your own address — without materializing the whole tier). Respects suppression + opt-out.
 * Returns { added, id, company, reason }.
 */
export async function addTarget(campaignId, { email, companyName = null } = {}) {
  const c = await getCampaign(campaignId);
  if (!c) throw new Error('campaign_not_found');
  const e = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('invalid_email');
  if (await isSuppressed(e)) return { added: false, reason: 'suppressed' };
  if (await isOptedOut(e)) return { added: false, reason: 'opted_out' };
  const co = (await query(
      `SELECT c.id, c.name FROM company_contacts cc JOIN companies c ON c.id=cc.company_id
        WHERE cc.type='email' AND lower(cc.value)=$1 LIMIT 1`, [e])).rows[0]
    || (await query(`SELECT id, name FROM companies WHERE lower(email)=$1 LIMIT 1`, [e])).rows[0] || null;
  const lang = c.lang_mode === 'ar' ? 'ar' : c.lang_mode === 'bilingual' ? 'bilingual' : 'en';
  const r = await query(
    `INSERT INTO outreach_targets (campaign_id, company_id, company_name, email, address_class, lang)
     VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (campaign_id, email) DO NOTHING RETURNING id`,
    [campaignId, co?.id || null, companyName || co?.name || null, e, 'manual', lang]);
  return { added: !!r.rows[0], id: r.rows[0]?.id || null, company: companyName || co?.name || null };
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
// Today's counts key on sent_at (only ever stamped by a successful send) — NOT on status,
// which is mutable: a same-day reply/bounce/unsubscribe used to flip the row out of the count
// and silently refund quota (adversarial review 2026-07-18). A send that got a reply still
// spent today's reputation budget.
async function sentTodayGlobal() {
  const r = await query(
    `SELECT count(*)::int AS n FROM outreach_targets
      WHERE sent_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Qatar') AT TIME ZONE 'Asia/Qatar')`);
  return r.rows[0]?.n || 0;
}
async function sentTodayCampaign(campaignId) {
  const r = await query(
    `SELECT count(*)::int AS n FROM outreach_targets
      WHERE campaign_id=$1 AND sent_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Qatar') AT TIME ZONE 'Asia/Qatar')`, [campaignId]);
  return r.rows[0]?.n || 0;
}
// Warmup allowance ramps on ACTIVE SENDING DAYS, not calendar days: a week of downtime
// (breaker tripped, engine off) must not silently ramp a cold domain to full volume. dayIndex =
// number of distinct Qatar days this campaign actually sent on.
async function warmupAllowance(c) {
  const r = await query(
    `SELECT count(DISTINCT (sent_at AT TIME ZONE 'Asia/Qatar')::date)::int AS days
       FROM outreach_targets WHERE campaign_id=$1 AND sent_at IS NOT NULL
        AND sent_at < (date_trunc('day', now() AT TIME ZONE 'Asia/Qatar') AT TIME ZONE 'Asia/Qatar')`, [c.id]);
  const dayIndex = r.rows[0]?.days || 0;
  return Math.min(c.daily_cap, c.warmup_start + c.warmup_step * dayIndex);
}

/** How many this campaign may still send right now (0 if outside hours / disabled / capped). */
export async function remainingAllowance(c) {
  if (!OUTREACH_ENABLED()) return { allowed: 0, reason: 'engine_disabled' };
  if (c.status !== 'active') return { allowed: 0, reason: 'campaign_' + c.status };
  if (!isQatarWorkingHour()) return { allowed: 0, reason: 'outside_qatar_hours' };
  const campaignAllow = Math.max(0, (await warmupAllowance(c)) - await sentTodayCampaign(c.id));
  const globalAllow = Math.max(0, GLOBAL_DAILY_CAP() - await sentTodayGlobal());
  const allowed = Math.min(campaignAllow, globalAllow);
  return { allowed, reason: allowed > 0 ? 'ok' : (globalAllow === 0 ? 'global_cap_reached' : 'campaign_cap_reached') };
}

// --- the send tick (gated) --------------------------------------------------
/**
 * Send one target now (initial touch or a follow-up). Re-checks suppression/consent at the last
 * moment, throttles per recipient domain, picks the bandit arm, and books the touch.
 */
async function sendOne(c, t, { followUp = false } = {}) {
  const email = String(t.email || '').toLowerCase();

  // ATOMIC CLAIM (adversarial review 2026-07-18): compare-and-set before anything else, so two
  // concurrent dispatchers (tick + tick, tick + Send-now) can never double-send one target.
  //   fresh:     pending  -> sending          (claim = the status flip)
  //   follow-up: sent + next_touch_at != NULL -> next_touch_at = NULL  (claim = clearing it)
  // Losing the race returns 'raced' — the winner is already handling this target.
  if (followUp) {
    const claim = await query(
      `UPDATE outreach_targets SET updated_at=now(), next_touch_at=NULL
        WHERE id=$1 AND status='sent' AND next_touch_at IS NOT NULL RETURNING id`, [t.id]);
    if (!claim.rows.length) return 'raced';
  } else {
    const claim = await query(
      `UPDATE outreach_targets SET status='sending', updated_at=now()
        WHERE id=$1 AND status='pending' RETURNING id`, [t.id]);
    if (!claim.rows.length) return 'raced';
  }
  // Helper to release a claim without sending.
  const release = async (status, reason) => {
    if (followUp) {
      // Touch 1 already went out — keep the 'sent' history, just record why the follow-up stopped.
      await query(`UPDATE outreach_targets SET skip_reason=$2, updated_at=now() WHERE id=$1`, [t.id, reason]);
    } else {
      await query(`UPDATE outreach_targets SET status=$2, skip_reason=$3, updated_at=now() WHERE id=$1`, [t.id, status, reason]);
    }
  };

  // Last-moment safety re-checks (state may have changed since planning).
  if (await isSuppressed(email)) { await release('skipped', 'suppressed'); return 'skipped'; }
  // Consent-withdrawal gate — independent of suppression. (isOptedOut = latest event is a
  // withdrawal; "no consent row" is NOT opted out — cold outreach runs on founder-instruction.)
  if (await isOptedOut(email)) { await release('skipped', 'opted_out'); return 'skipped'; }

  // Per-domain throttle: never hammer one company in a day. Deferred, not skipped — the claim
  // is released back to eligible and the next tick retries.
  const domain = email.split('@')[1];
  const throttle = await domainSentToday(domain);
  if (throttle.capped) {
    if (followUp) await query(`UPDATE outreach_targets SET next_touch_at = now() + interval '2 hours', updated_at=now() WHERE id=$1`, [t.id]);
    else await query(`UPDATE outreach_targets SET status='pending', updated_at=now() WHERE id=$1`, [t.id]);
    return 'deferred';
  }

  // Bandit: assign an arm on first touch (sticky per target so follow-ups keep the same angle).
  let arm = null;
  if (t.arm_id) {
    arm = (await query(`SELECT id, key, angle FROM outreach_arms WHERE id=$1`, [t.arm_id])).rows[0] || null;
  }
  if (!arm) {
    arm = await pickArm(c.id);
    if (arm) await query(`UPDATE outreach_targets SET arm_id=$2 WHERE id=$1`, [t.id, arm.id]);
  }

  const meta = t.company_id ? (await query(`SELECT industry, industries, city, website FROM companies WHERE id=$1`, [t.company_id])).rows[0] : null;
  const angle = followUp
    ? 'This is a SHORT polite follow-up to a note you sent them days ago that got no reply. Reference that you wrote before, keep it under 70 words, one gentle nudge, no guilt-tripping, and offer to stop if it is not relevant.' + (arm ? ' Original angle: ' + arm.angle : '')
    : (arm ? arm.angle : null);
  const composed = await composeEmail({
    companyName: t.company_name, industry: meta ? firstIndustry(meta) : null,
    city: meta?.city, website: meta?.website, lang: t.lang || 'en',
    fromName: c.from_name || 'The Bell team', angle,
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
    // Log the REAL wire From (BDI_OUTREACH_FROM override included), not a hardcoded literal.
    const fromAddr = (OUTREACH_FROM.match(/<([^>]+)>/) || [null, OUTREACH_FROM])[1];
    await query(`UPDATE crm_emails SET status='sent', provider_message_id=$2, from_email=$3, sent_at=now() WHERE id=$1`,
      [crmId, res?.id || null, fromAddr]);
    // Touch bookkeeping: schedule the next follow-up unless this was the last allowed touch.
    const touches = (t.touch_count || 0) + 1;
    const maxTouches = Math.max(1, c.max_touches || 1);
    const gapDays = Math.max(1, c.touch_gap_days || 4);
    await query(
      `UPDATE outreach_targets
          SET status='sent', crm_email_id=$2, optout_token=$3, subject=$4, body_text=$5, body_html=$6,
              sent_at=now(), touch_count=$7,
              next_touch_at = CASE WHEN $7 >= $8 THEN NULL ELSE now() + ($9 || ' days')::interval END,
              updated_at=now()
        WHERE id=$1`,
      [t.id, crmId, token, composed.subject, final.text, final.html, touches, maxTouches, String(gapDays)]);
    if (arm) await query(`UPDATE outreach_arms SET sent = sent + 1 WHERE id = $1`, [arm.id]).catch(() => {});
    return 'sent';
  } catch (e) {
    await query(`UPDATE crm_emails SET status='failed', error=$2 WHERE id=$1`, [crmId, String(e.message).slice(0, 400)]);
    await query(`UPDATE outreach_targets SET status='failed', skip_reason=$2, next_touch_at=NULL, updated_at=now() WHERE id=$1`, [t.id, String(e.message).slice(0, 200)]);
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
 * One dispatcher tick — the machine's heartbeat. In order:
 *   gates (enabled? Qatar hours? holiday?) → circuit breaker → pre-flight self-test →
 *   per-campaign: follow-ups due first (time-sensitive), then fresh targets, under warmup +
 *   daily + global caps → conversion attribution sweep.
 * A NO-OP unless BDI_OUTREACH_ENABLED is set. Returns a report of exactly what happened.
 */
export async function runOutreachTick() {
  if (!OUTREACH_ENABLED()) return { skipped: 'engine_disabled' };
  if (!isQatarWorkingHour()) return { skipped: 'outside_qatar_hours' };
  const hol = await isQatarHolidayToday();
  if (hol.holiday) return { skipped: 'qatar_holiday', holiday: hol.name };

  // Circuit breaker: if bounces/complaints spiked, the machine stays paused until the admin
  // investigates and resumes.
  const breaker = await checkBreaker();
  if (breaker.tripped) return { skipped: 'circuit_breaker', reason: breaker.reason };

  // Pre-flight: a dead unsubscribe endpoint or missing channel key BLOCKS the round.
  const pf = await preflight();
  if (!pf.ok) return { skipped: 'preflight_failed', checks: pf.checks.filter((c) => !c.ok) };

  // Recover stale claims: a crash mid-send leaves 'sending' rows behind. They are surfaced as
  // 'failed' (NOT silently retried — the provider may have accepted the send before the crash,
  // and retrying could double-email a real company).
  await query(
    `UPDATE outreach_targets SET status='failed', skip_reason='interrupted mid-send (crash recovery)', updated_at=now()
      WHERE status='sending' AND updated_at < now() - interval '15 minutes'`).catch(() => {});

  const campaigns = (await query(`SELECT * FROM outreach_campaigns WHERE status='active' ORDER BY created_at`)).rows;
  const report = [];
  for (const c of campaigns) {
    const { allowed, reason } = await remainingAllowance(c);
    if (allowed <= 0) { report.push({ campaign: c.id, sent: 0, reason }); continue; }
    // Follow-ups due first (their timing matters), then fresh pending targets.
    const followUps = (await query(
      `SELECT * FROM outreach_targets
        WHERE campaign_id=$1 AND status='sent' AND next_touch_at IS NOT NULL AND next_touch_at <= now()
          AND touch_count < $2
        ORDER BY next_touch_at LIMIT $3`, [c.id, Math.max(1, c.max_touches || 1), allowed])).rows;
    const fresh = followUps.length >= allowed ? [] : (await query(
      `SELECT * FROM outreach_targets WHERE campaign_id=$1 AND status='pending' ORDER BY id LIMIT $2`,
      [c.id, allowed - followUps.length])).rows;
    let sent = 0, skipped = 0, failed = 0, deferred = 0;
    for (const t of followUps) {
      const r = await sendOne(c, t, { followUp: true });
      if (r === 'sent') sent += 1; else if (r === 'skipped') skipped += 1; else if (r === 'deferred') deferred += 1; else failed += 1;
      if (sent >= allowed) break;
    }
    for (const t of fresh) {
      if (sent >= allowed) break;
      const r = await sendOne(c, t);
      if (r === 'sent') sent += 1; else if (r === 'skipped') skipped += 1; else if (r === 'deferred') deferred += 1; else failed += 1;
    }
    report.push({ campaign: c.id, sent, followups: followUps.length, skipped, deferred, failed });
  }

  // The snowball ledger: stamp targets whose companies have since signed up.
  const conv = await markConversions().catch(() => ({ exact: 0, domain: 0 }));
  return { ran: true, report, conversions: conv };
}

/**
 * Send NOW to explicitly-added test recipients only (address_class='manual'), on demand,
 * bypassing the hours/scheduler/enabled gates — for the end-to-end test session. It can NEVER
 * touch the bulk-planned tier (role_mailbox/named_person/unclassified), so it cannot cause an
 * unsolicited mass send; that path stays behind the full gates. Admin-triggered, hard-capped,
 * and still respects suppression + opt-out (via sendOne). Returns { sent, skipped, failed }.
 */
export async function sendTestNow(campaignId, { max = 5 } = {}) {
  const c = await getCampaign(campaignId);
  if (!c) throw new Error('campaign_not_found');
  const due = (await query(
    `SELECT * FROM outreach_targets
      WHERE campaign_id=$1 AND status='pending' AND address_class='manual'
      ORDER BY id LIMIT $2`, [campaignId, Math.min(Math.max(1, max), 10)])).rows;
  let sent = 0, skipped = 0, failed = 0;
  for (const t of due) {
    const r = await sendOne(c, t);
    if (r === 'sent') sent += 1; else if (r === 'skipped') skipped += 1; else failed += 1;
  }
  return { sent, skipped, failed, considered: due.length };
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

  // What did the reply MEAN? Rules first (remove_me / auto_reply are deterministic), then Haiku
  // for interested / not_interested. Never guessed: unknown stays 'unclassified'.
  const cls = await classifyReply({ subject, text }).catch(() => ({ class: 'unclassified' }));

  // Log the incoming message for the admin mail view.
  await query(
    `INSERT INTO crm_emails (tenant_id, record_id, direction, to_email, from_email, subject, body_text, status, sent_by, provider, sent_at)
     VALUES (1, NULL, 'in', $1, $2, $3, $4, 'delivered', 'outreach-inbound', 'inbound', now())`,
    [toEmail || OUTREACH_REPLY_TO(), from, subject, text]);

  let t = null;
  if (cls.class === 'auto_reply') {
    // An autoresponder is NOT a human reply: log it (above) but do NOT reply-stop — the
    // follow-up sequence continues, and no forward (nothing for Val to answer).
    const m = await query(
      `UPDATE outreach_targets SET reply_class='auto_reply', updated_at=now()
        WHERE id = (SELECT id FROM outreach_targets WHERE lower(email)=$1 AND status='sent'
                     ORDER BY sent_at DESC NULLS LAST LIMIT 1)
        RETURNING id, campaign_id`, [from]);
    return { matched: !!m.rows[0], targetId: m.rows[0]?.id || null, campaignId: m.rows[0]?.campaign_id || null, reply_class: 'auto_reply' };
  }

  // A human replied → reply-stop: their most recent 'sent' target leaves the queue for good.
  // Stale-guard: only match sends from the last 60 days, so an unrelated email from a company
  // we contacted long ago is not miscredited as a campaign reply.
  const r = await query(
    `UPDATE outreach_targets
        SET status='replied', replied_at=now(), reply_class=$2, reply_text=$3, next_touch_at=NULL, updated_at=now()
      WHERE id = (SELECT id FROM outreach_targets WHERE lower(email)=$1 AND status IN ('sent','replied')
                   AND sent_at > now() - interval '60 days'
                   ORDER BY sent_at DESC NULLS LAST LIMIT 1)
      RETURNING id, campaign_id, arm_id, replied_at`, [from, cls.class, String(text || '').slice(0, 2000)]);
  t = r.rows[0];
  if (t?.arm_id) await query(`UPDATE outreach_arms SET replied = replied + 1 WHERE id=$1`, [t.arm_id]).catch(() => {});
  if (t?.arm_id && cls.class === 'interested') await query(`UPDATE outreach_arms SET positive = positive + 1 WHERE id=$1`, [t.arm_id]).catch(() => {});

  // MANDATORY: "remove me" in any wording IS an unsubscribe — suppress + record the withdrawal
  // in the consent ledger, exactly as if they had clicked the link.
  if (cls.class === 'remove_me') {
    await addSuppression(from, 'unsubscribe', 'reply asked to stop ("remove me")', 'outreach-reply').catch(() => {});
    await recordConsent(from, {
      action: 'withdrawn', basis: 'reply_optin',
      evidence: { via: 'reply_text_remove_request', subject: String(subject || '').slice(0, 300) },
    }).catch(() => {});
    await query(`UPDATE outreach_targets SET status='unsubscribed', updated_at=now() WHERE id=$1`, [t?.id]).catch(() => {});
  }

  // "Both": forward the reply to a human inbox so Val sees it where he works — Reply-To is the
  // prospect, so he can answer directly. Hot leads are flagged in the subject.
  const forwardTo = process.env.BDI_OUTREACH_REPLY_FORWARD_TO || null;
  if (forwardTo && cls.class !== 'remove_me') {
    const tag = cls.class === 'interested' ? '🔥 INTERESTED — ' : '';
    const body = `New reply to Bell outreach${cls.class !== 'unclassified' ? ' (' + cls.class + ')' : ''}.\n\nFrom: ${from}${t ? '' : '  (no matching sent email found)'}\nSubject: ${subject || '(none)'}\n\n${text || '(no text)'}\n\nReply to this email to answer ${from} directly.`;
    sendEmail({ to: forwardTo, subject: tag + 'Outreach reply from ' + from, text: body, replyTo: from }).catch(() => {});
  }
  return { matched: !!t, targetId: t?.id || null, campaignId: t?.campaign_id || null, reply_class: cls.class };
}
