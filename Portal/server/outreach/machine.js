// The autonomous layer of the outreach machine — everything that lets it run WITHOUT a human
// watching, safely:
//
//   circuit breaker — if bounces or a spam complaint spike, the machine pauses ITSELF and
//                     records why; the admin resumes it with a button after investigating.
//   pre-flight      — before any sending round, the machine self-tests: is the isolated send
//                     channel configured, is the public unsubscribe endpoint actually
//                     reachable? A dead unsubscribe link must block sending (it's the legal
//                     spine), not be discovered after 500 sends.
//   holidays        — fixed civic days computed (National Day Dec 18; Sport Day = 2nd Tuesday
//                     of February); movable feasts (Eids — moon-dependent, announced yearly)
//                     come from the qatar_holidays table. Rule 2.1: we do not guess Eid dates.
//   bandit          — Thompson sampling over campaign arms on REPLY rate (opens are inflated
//                     by Apple MPP; replies are the honest signal). The machine self-improves:
//                     angles that get replies get sent more.
//   conversions     — the snowball proof: outreach target whose company later signed up.

import { query } from '../db.js';
import { getKey } from '../keychain.js';
import { qatarParts } from '../lib/qatar_time.js';

const APP_URL = (process.env.BELL_APP_URL || 'https://app.bell.qa').replace(/\/$/, '');

// ---- state -----------------------------------------------------------------
export async function getState(key) {
  const r = await query(`SELECT value FROM outreach_state WHERE key=$1`, [key]);
  return r.rows[0]?.value || null;
}
export async function setState(key, value) {
  await query(
    `INSERT INTO outreach_state (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [key, JSON.stringify(value)]);
}

// ---- circuit breaker -------------------------------------------------------
// Window: the last 100 outreach sends. Trip on: bounce rate > 5% (once >= 20 sends exist), or
// ANY spam complaint (at our volumes a single complaint is a red alert — 0.1% of 100 is one).
export async function breakerStatus() {
  const s = await getState('breaker');
  return { tripped: !!s?.tripped, reason: s?.reason || null, at: s?.at || null };
}
export async function tripBreaker(reason) {
  await setState('breaker', { tripped: true, reason, at: new Date().toISOString() });
  console.error('[outreach] CIRCUIT BREAKER TRIPPED: ' + reason);
}
export async function resetBreaker() {
  await setState('breaker', { tripped: false, reason: null, at: null });
}
export async function checkBreaker() {
  const cur = await breakerStatus();
  if (cur.tripped) return cur;
  const r = await query(
    `SELECT status FROM crm_emails
      WHERE direction='out' AND sent_by IN ('outreach-engine','outreach-test')
        AND status IN ('sent','delivered','opened','bounced','complained')
      ORDER BY COALESCE(sent_at, created_at) DESC LIMIT 100`);
  const rows = r.rows;
  const complaints = rows.filter((x) => x.status === 'complained').length;
  const bounces = rows.filter((x) => x.status === 'bounced').length;
  if (complaints >= 1) { await tripBreaker(`spam complaint received (${complaints} in last ${rows.length} sends)`); return breakerStatus(); }
  if (rows.length >= 20 && bounces / rows.length > 0.05) {
    await tripBreaker(`bounce rate ${(100 * bounces / rows.length).toFixed(1)}% over last ${rows.length} sends (limit 5%)`);
    return breakerStatus();
  }
  return { tripped: false, reason: null, at: null };
}

// ---- pre-flight self-test --------------------------------------------------
// Runs before each sending round. ANY failed check blocks the round (and is shown in admin).
export async function preflight() {
  const checks = [];
  // 1. The isolated channel key resolves.
  let keyOk = false;
  try { keyOk = !!(await getKey('resend-outreach')); } catch { keyOk = false; }
  checks.push({ name: 'outreach_channel_key', ok: keyOk, detail: keyOk ? 'resend-outreach key present' : 'BDI_KEY_RESEND_OUTREACH missing' });
  // 2. The PUBLIC unsubscribe endpoint answers (a dead opt-out link must block sending).
  let unsubOk = false, unsubDetail = '';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(APP_URL + '/u/preflight-check', { signal: ctrl.signal });
    clearTimeout(t);
    unsubOk = res.status === 200;
    unsubDetail = 'GET ' + APP_URL + '/u/* -> ' + res.status;
  } catch (e) { unsubDetail = 'unreachable: ' + e.message; }
  checks.push({ name: 'unsubscribe_endpoint', ok: unsubOk, detail: unsubDetail });
  // 3. The suppression table answers (the do-not-send list must be readable).
  let suppOk = false;
  try { await query(`SELECT 1 FROM email_suppressions LIMIT 1`); suppOk = true; } catch { suppOk = false; }
  checks.push({ name: 'suppression_list', ok: suppOk, detail: suppOk ? 'readable' : 'query failed' });

  const ok = checks.every((c) => c.ok);
  await setState('preflight', { ok, checks, at: new Date().toISOString() });
  return { ok, checks };
}

// ---- Qatar holidays --------------------------------------------------------
// Fixed civic days are COMPUTED (no table needed): National Day = 18 Dec; National Sport Day =
// second Tuesday of February. Movable feasts (Eid al-Fitr, Eid al-Adha) are moon-dependent and
// announced yearly — the admin adds those to qatar_holidays; we never guess them (Rule 2.1).
export async function isQatarHolidayToday() {
  const p = qatarParts(new Date());          // { year, month (1-12), day, weekday (0=Sun) }
  if (p.month === 12 && p.day === 18) return { holiday: true, name: 'Qatar National Day' };
  if (p.month === 2 && p.weekday === 2 && p.day >= 8 && p.day <= 14) return { holiday: true, name: 'National Sport Day' };
  const ymd = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  const r = await query(`SELECT name FROM qatar_holidays WHERE day = $1`, [ymd]);
  if (r.rows[0]) return { holiday: true, name: r.rows[0].name };
  return { holiday: false, name: null };
}

// ---- bandit (Thompson sampling on reply rate) ------------------------------
// Beta(replied+1, sent-replied+1) sampled per active arm; highest sample wins. With no data all
// arms are uniform; as replies arrive the machine leans toward what works while still exploring.
function sampleGamma(shape) {
  // Marsaglia & Tsang; shape >= 1 here (we add +1 priors).
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x, v;
    do { x = gaussian(); v = 1 + c * x; } while (v <= 0);
    v = v * v * v;
    const u = Math.random();
    if (u < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}
function gaussian() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function sampleBeta(a, b) { const x = sampleGamma(a); return x / (x + sampleGamma(b)); }

export async function pickArm(campaignId) {
  const r = await query(
    `SELECT id, key, angle, sent, replied FROM outreach_arms WHERE campaign_id=$1 AND is_active=true`, [campaignId]);
  if (!r.rows.length) return null;
  let best = null, bestScore = -1;
  for (const arm of r.rows) {
    const score = sampleBeta(arm.replied + 1, Math.max(0, arm.sent - arm.replied) + 1);
    if (score > bestScore) { bestScore = score; best = arm; }
  }
  return best;
}

// ---- per-recipient-domain throttle -----------------------------------------
// Never hammer one company: max N outreach emails per recipient DOMAIN per Qatar day.
export async function domainSentToday(domain, cap = 2) {
  if (!domain) return { count: 0, capped: false };
  const r = await query(
    `SELECT count(*)::int AS n FROM crm_emails
      WHERE direction='out' AND sent_by IN ('outreach-engine','outreach-test')
        AND status IN ('sent','delivered','opened')
        AND lower(to_email) LIKE '%@' || $1
        AND sent_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Qatar') AT TIME ZONE 'Asia/Qatar')`,
    [domain.toLowerCase()]);
  return { count: r.rows[0]?.n || 0, capped: (r.rows[0]?.n || 0) >= cap };
}

// ---- conversion attribution ------------------------------------------------
// The snowball proof. A target "converted" when a user signed up AFTER we emailed, with the
// exact same address, or the same company domain (free-mail domains excluded — a gmail signup
// proves nothing about a company we emailed at gmail).
const FREEMAIL = new Set(['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'aol.com', 'protonmail.com', 'mail.com', 'ymail.com', 'msn.com', 'me.com']);

export async function markConversions() {
  // Exact-address matches.
  const exact = await query(
    `UPDATE outreach_targets t
        SET converted_at = u.created_at, converted_tenant_id = u.tenant_id, updated_at = now()
       FROM users u
      WHERE t.converted_at IS NULL AND t.status IN ('sent','replied')
        AND lower(u.email) = lower(t.email) AND u.created_at > t.sent_at
      RETURNING t.id`);
  // Same-company-domain matches (corporate domains only).
  const dom = await query(
    `UPDATE outreach_targets t
        SET converted_at = u.created_at, converted_tenant_id = u.tenant_id, updated_at = now()
       FROM users u
      WHERE t.converted_at IS NULL AND t.status IN ('sent','replied')
        AND u.created_at > t.sent_at
        AND split_part(lower(u.email), '@', 2) = split_part(lower(t.email), '@', 2)
        AND split_part(lower(t.email), '@', 2) <> ALL($1)
      RETURNING t.id`,
    [[...FREEMAIL]]);
  return { exact: exact.rowCount || 0, domain: dom.rowCount || 0 };
}
