// Market-updates digest + welcome email — the engine BEHIND the bell.qa/market-updates list.
//
// Subscribers = every address whose LATEST consent event is 'granted' (the append-only ledger
// is the source of truth), minus anything suppressed. Two sends live here:
//   welcome — immediately after opting in: confirms the subscription, sets expectations,
//             carries the standard unsubscribe.
//   digest  — the weekly "Qatar market update": REAL numbers from Bell's data (Rule 2.1 — every
//             figure is a live query, nothing invented), valuable on its own but explicitly
//             teasing the depth that lives behind a Bell subscription. Value → conversion.
//
// Both send through the isolated go.bell.qa channel with a per-send unsubscribe token, and are
// logged (crm_emails sent_by 'optin-welcome' / 'digest') so the admin mail view shows them.

import { query } from '../db.js';
import { sendEmail } from '../lib/email.js';
import { generateOptoutToken, listUnsubscribeHeaders } from './optout.js';
import { qatarParts } from '../lib/qatar_time.js';
import { getState, setState } from './machine.js';

const APP_URL = (process.env.BELL_APP_URL || 'https://app.bell.qa').replace(/\/$/, '');
const SITE = 'https://bell.qa';
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

// ---- subscribers -----------------------------------------------------------
/** Addresses whose latest consent event is 'granted', excluding suppressed. */
export async function listSubscribers() {
  const r = await query(
    `SELECT t.email FROM (
        SELECT DISTINCT ON (lower(email)) lower(email) AS email, action
          FROM outreach_consent ORDER BY lower(email), created_at DESC, id DESC
     ) t
     WHERE t.action = 'granted'
       AND NOT EXISTS (SELECT 1 FROM email_suppressions s WHERE s.email = t.email)`);
  return r.rows.map((x) => x.email);
}

// ---- welcome ---------------------------------------------------------------
/** Send the subscription-confirmation email. Best-effort; returns { sent, error? }. */
export async function sendWelcome(email) {
  const e = String(email || '').trim().toLowerCase();
  const token = await generateOptoutToken(e, {});
  const unsubUrl = APP_URL + '/u/' + token;
  const subject = 'You are subscribed to Bell market updates';
  const text = [
    'Hello,',
    '',
    'You are now subscribed to Qatar market updates from Bell (bell.qa).',
    'Expect a short update roughly once a week: government tenders worth knowing about, companies on the move, and market signals from across Qatar.',
    '',
    'The updates give you the highlights. The full picture, live tenders with every detail, 190,000+ company profiles, contacts and buying signals, lives in the Bell platform: ' + SITE + '/get-access',
    '',
    'Not interested after all? One click and you are out: ' + unsubUrl,
    '',
    'Bell · Qatar business intelligence · bell.qa',
    'Doha, Qatar',
  ].join('\n');
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#1a2233;max-width:560px">
    <p style="margin:0 0 14px;line-height:1.6">Hello,</p>
    <p style="margin:0 0 14px;line-height:1.6">You are now subscribed to <b>Qatar market updates from Bell</b> (bell.qa).</p>
    <p style="margin:0 0 14px;line-height:1.6">Expect a short update roughly once a week: government tenders worth knowing about, companies on the move, and market signals from across Qatar.</p>
    <p style="margin:0 0 14px;line-height:1.6">The updates give you the highlights. The full picture, live tenders with every detail, 190,000+ company profiles, contacts and buying signals, lives in the Bell platform: <a href="${SITE}/get-access" style="color:#5b8cff">get access</a>.</p>
    <div style="margin-top:22px;padding-top:12px;border-top:1px solid #e2e6ee;font-size:12px;color:#8a93a6;line-height:1.7">
      <div>Bell · Qatar business intelligence · bell.qa</div><div>Doha, Qatar</div>
      <div style="margin-top:6px">Not interested after all? <a href="${esc(unsubUrl)}" style="color:#5b8cff">Unsubscribe</a>.</div>
    </div></div>`;

  const log = await query(
    `INSERT INTO crm_emails (tenant_id, record_id, direction, to_email, subject, body_text, body_html, status, sent_by, provider)
     VALUES (1, NULL, 'out', $1, $2, $3, $4, 'queued', 'optin-welcome', 'resend') RETURNING id`,
    [e, subject, text, html]).catch(() => null);
  const logId = log?.rows?.[0]?.id || null;
  try {
    const res = await sendEmail({ to: e, subject, html, text, headers: listUnsubscribeHeaders(token), channel: 'outreach', system: 'optin-welcome' });
    if (logId) await query(`UPDATE crm_emails SET status='sent', provider_message_id=$2, from_email='hello@go.bell.qa', sent_at=now() WHERE id=$1`, [logId, res?.id || null]).catch(() => {});
    return { sent: true };
  } catch (err) {
    if (logId) await query(`UPDATE crm_emails SET status='failed', error=$2 WHERE id=$1`, [logId, String(err.message).slice(0, 400)]).catch(() => {});
    console.error('[digest] welcome to ' + e + ' failed:', err.message);
    return { sent: false, error: err.message };
  }
}

// ---- the digest ------------------------------------------------------------
/** Build this week's digest from REAL data. Returns { subject, text, html, facts }. */
export async function buildDigest() {
  const closing = (await query(
    `SELECT title, buyer, source, deadline_at FROM tenders
      WHERE deadline_at > now() AND deadline_at < now() + interval '14 days'
      ORDER BY deadline_at ASC LIMIT 3`)).rows;
  const counts = (await query(
    `SELECT
       (SELECT count(*)::int FROM tenders WHERE deadline_at > now())                                        AS open_now,
       (SELECT count(*)::int FROM tenders WHERE deadline_at > now() AND deadline_at < now() + interval '7 days') AS closing_7d,
       (SELECT count(*)::int FROM tenders WHERE created_at > now() - interval '7 days')                      AS new_7d,
       (SELECT count(*)::int FROM signals WHERE created_at > now() - interval '7 days')                      AS signals_7d`)).rows[0];

  const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { timeZone: 'Asia/Qatar', day: 'numeric', month: 'short' });
  // Tender titles arrive verbatim from source pages — collapse embedded newlines/refs and clip
  // so each digest line reads cleanly.
  const cleanTitle = (t) => String(t || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  for (const t of closing) t.title = cleanTitle(t.title);
  const srcName = (s) => ({ monaqasat: 'Monaqasat', ashghal: 'Ashghal', qatarenergy: 'QatarEnergy', kahramaa: 'Kahramaa' }[s] || s || '');
  const subject = `Qatar market update — ${counts.closing_7d} tenders close this week`;

  const lines = [
    'Hello,',
    '',
    `This week in Qatar, from the Bell graph:`,
    '',
    `• ${counts.open_now} government tenders are open right now; ${counts.closing_7d} close within 7 days.`,
    `• ${counts.new_7d} new tenders were published in the last 7 days.`,
    `• ${counts.signals_7d} company signals recorded this week (expansions, hiring, leadership, announcements).`,
    '',
    'Closing soonest:',
    ...closing.map((t) => `• ${t.title} — ${t.buyer || srcName(t.source)} — closes ${fmtDate(t.deadline_at)}`),
    '',
    `That's the surface. Bell shows every open tender with full published details, plus who's buying, 190,000+ company profiles, contacts and live signals: ${SITE}/get-access`,
    '',
    'Bell · Qatar business intelligence · bell.qa',
    'Doha, Qatar',
  ];

  const htmlItems = closing.map((t) =>
    `<li style="margin-bottom:8px"><b>${esc(t.title)}</b><br><span style="color:#8a93a6;font-size:13px">${esc(t.buyer || srcName(t.source))} · closes ${esc(fmtDate(t.deadline_at))}</span></li>`).join('');
  const html = `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#1a2233;max-width:560px">
    <p style="margin:0 0 14px;line-height:1.6">Hello,</p>
    <p style="margin:0 0 10px;line-height:1.6">This week in Qatar, from the Bell graph:</p>
    <ul style="margin:0 0 16px;padding-left:18px;line-height:1.7">
      <li><b>${counts.open_now}</b> government tenders open right now; <b>${counts.closing_7d}</b> close within 7 days.</li>
      <li><b>${counts.new_7d}</b> new tenders published in the last 7 days.</li>
      <li><b>${counts.signals_7d}</b> company signals recorded this week.</li>
    </ul>
    <p style="margin:0 0 8px;font-weight:600">Closing soonest:</p>
    <ul style="margin:0 0 16px;padding-left:18px;line-height:1.6">${htmlItems}</ul>
    <p style="margin:0 0 14px;line-height:1.6;color:#4a5568">That's the surface. Bell shows every open tender with full published details, plus who's buying, 190,000+ company profiles, contacts and live signals. <a href="${SITE}/get-access" style="color:#5b8cff">Get access to Bell</a>.</p>
  </div>`;
  return { subject, text: lines.join('\n'), html, facts: counts };
}

/**
 * Send the digest to every subscriber NOW. Each recipient gets their own unsubscribe token +
 * footer. Returns { subscribers, sent, failed }.
 */
export async function sendDigestNow() {
  const subs = await listSubscribers();
  const base = await buildDigest();
  let sent = 0, failed = 0;
  for (const email of subs) {
    const token = await generateOptoutToken(email, {});
    const unsubUrl = APP_URL + '/u/' + token;
    const text = base.text + '\n\n----------\nNot interested? Unsubscribe: ' + unsubUrl;
    const html = base.html + `<div style="margin-top:22px;padding-top:12px;border-top:1px solid #e2e6ee;font-size:12px;color:#8a93a6;line-height:1.7">
      <div>Bell · Qatar business intelligence · bell.qa</div><div>Doha, Qatar</div>
      <div style="margin-top:6px">Not interested? <a href="${esc(unsubUrl)}" style="color:#5b8cff">Unsubscribe</a>.</div></div>`;
    const log = await query(
      `INSERT INTO crm_emails (tenant_id, record_id, direction, to_email, subject, body_text, body_html, status, sent_by, provider)
       VALUES (1, NULL, 'out', $1, $2, $3, $4, 'queued', 'digest', 'resend') RETURNING id`,
      [email, base.subject, text, html]).catch(() => null);
    const logId = log?.rows?.[0]?.id || null;
    try {
      const res = await sendEmail({ to: email, subject: base.subject, html, text, headers: listUnsubscribeHeaders(token), channel: 'outreach', system: 'digest' });
      if (logId) await query(`UPDATE crm_emails SET status='sent', provider_message_id=$2, from_email='hello@go.bell.qa', sent_at=now() WHERE id=$1`, [logId, res?.id || null]).catch(() => {});
      sent += 1;
    } catch (err) {
      if (logId) await query(`UPDATE crm_emails SET status='failed', error=$2 WHERE id=$1`, [logId, String(err.message).slice(0, 400)]).catch(() => {});
      failed += 1;
    }
  }
  await setState('digest_last', { at: new Date().toISOString(), subscribers: subs.length, sent, failed });
  return { subscribers: subs.length, sent, failed };
}

/**
 * Weekly auto-send: Sunday (start of the Qatar work week) from 09:00 Qatar time, at most once
 * per 5 days. Called from the outreach scheduler tick. Consented list — independent of the
 * cold-outreach BDI_OUTREACH_ENABLED gate.
 */
export async function maybeSendWeeklyDigest() {
  const p = qatarParts(new Date());
  if (p.weekday !== 0 || p.hour < 9) return { skipped: 'not_digest_window' };
  const last = await getState('digest_last');
  if (last?.at && Date.now() - new Date(last.at).getTime() < 5 * 86400_000) return { skipped: 'already_sent_recently' };
  const subs = await listSubscribers();
  if (!subs.length) { await setState('digest_last', { at: new Date().toISOString(), subscribers: 0, sent: 0, failed: 0 }); return { skipped: 'no_subscribers' }; }
  return sendDigestNow();
}
