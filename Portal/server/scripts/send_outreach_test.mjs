// Send ONE real outreach email, for end-to-end proof. Exercises the whole pipe: compose (the
// real Bella-quality English email) -> the isolated go.bell.qa channel -> a working one-click
// unsubscribe -> logged in crm_emails. This is a MANUAL, one-at-a-time test you trigger — it is
// NOT the automated engine and does NOT need BDI_OUTREACH_ENABLED.
//
// Usage (the .command prompts you): node send_outreach_test.mjs <recipient@email> [company name]
// Send it to YOURSELF first, look at how it lands (inbox vs spam), click the unsubscribe link,
// then a second send to yourself should be BLOCKED — that proves the opt-out works.

import { query } from '../db.js';
import { composeEmail, withFooter } from '../outreach/compose.js';
import { generateOptoutToken, listUnsubscribeHeaders, isOptedOut } from '../outreach/optout.js';
import { sendEmail } from '../lib/email.js';
import { isSuppressed } from '../lib/suppression.js';

const REPLY_TO = process.env.BDI_OUTREACH_REPLY_TO || 'replies@bell.qa';

async function lookupCompany(email) {
  const e = String(email || '').toLowerCase();
  const r = await query(
    `SELECT c.id, c.name, c.industry, c.industries, c.city, c.website
       FROM company_contacts cc JOIN companies c ON c.id = cc.company_id
      WHERE cc.type='email' AND lower(cc.value)=$1 LIMIT 1`, [e]);
  if (r.rows[0]) return r.rows[0];
  const r2 = await query(`SELECT id, name, industry, industries, city, website FROM companies WHERE lower(email)=$1 LIMIT 1`, [e]);
  return r2.rows[0] || null;
}

async function main() {
  const to = String(process.argv[2] || '').trim().toLowerCase();
  const nameArg = (process.argv[3] || '').trim();
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
    console.error('No valid recipient. Pass an email address.');
    process.exit(2);
  }

  // Honour the same guards a real send uses.
  if (await isSuppressed(to)) {
    console.log('BLOCKED: ' + to + ' is on the suppression list (already unsubscribed or bounced). This is correct — the opt-out is working.');
    process.exit(0);
  }
  if (await isOptedOut(to)) {
    console.log('BLOCKED: ' + to + ' has unsubscribed. This is correct — the opt-out is working.');
    process.exit(0);
  }

  const co = await lookupCompany(to);
  const companyName = nameArg || co?.name || null;
  const industry = co ? (co.industry || (Array.isArray(co.industries) ? co.industries[0] : null)) : null;

  console.log('Composing an English outreach email' + (companyName ? ' for ' + companyName : '') + '…');
  const composed = await composeEmail({
    companyName, industry, city: co?.city, website: co?.website, lang: 'en', fromName: 'The Bell team',
  });

  const token = await generateOptoutToken(to, { companyId: co?.id || null });
  const headers = listUnsubscribeHeaders(token);
  const unsubUrl = (process.env.BELL_APP_URL || 'https://app.bell.qa').replace(/\/$/, '') + '/u/' + token;
  const final = withFooter({ text: composed.text, html: composed.html, unsubUrl, lang: 'en' });

  const ins = await query(
    `INSERT INTO crm_emails (tenant_id, record_id, direction, to_email, subject, body_text, body_html, status, sent_by, provider)
     VALUES (1, NULL, 'out', $1, $2, $3, $4, 'queued', 'outreach-test', 'resend') RETURNING id`,
    [to, composed.subject, final.text, final.html]);
  const crmId = Number(ins.rows[0].id);

  console.log('Sending through the go.bell.qa channel…');
  try {
    const res = await sendEmail({
      to, subject: composed.subject, html: final.html, text: final.text,
      replyTo: REPLY_TO, headers, channel: 'outreach', system: 'outreach-test',
    });
    await query(`UPDATE crm_emails SET status='sent', provider_message_id=$2, from_email=$3, sent_at=now() WHERE id=$1`,
      [crmId, res?.id || null, 'hello@go.bell.qa']);
    console.log('');
    console.log('SENT ✓');
    console.log('  To:        ' + to);
    console.log('  From:      Bell <hello@go.bell.qa>   (isolated outreach channel)');
    console.log('  Reply-To:  ' + REPLY_TO);
    console.log('  Subject:   ' + composed.subject);
    console.log('  Message ID:' + (res?.id || '(none)'));
    console.log('  Written by:' + composed.source);
    console.log('');
    console.log('  Unsubscribe link in the email: ' + unsubUrl);
    console.log('');
    console.log('NEXT: open the email (check inbox AND spam). Then click Unsubscribe (or Gmail\'s');
    console.log('own Unsubscribe button next to the sender). Run this command to the SAME address');
    console.log('again — it should say BLOCKED. That proves the whole opt-out chain.');
  } catch (e) {
    await query(`UPDATE crm_emails SET status='failed', error=$2 WHERE id=$1`, [crmId, String(e.message).slice(0, 400)]);
    console.error('');
    console.error('FAILED to send: ' + e.message);
    if (/outreach_channel_not_configured/.test(e.message)) {
      console.error('→ The outreach Resend key is not set locally. Double-click "Set Outreach Email Key.command" first.');
    }
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => { console.error('ERROR:', e.stack || e.message); process.exit(1); });
