// IMAP poller for outreach REPLIES. Reads a DEDICATED replies mailbox (e.g. replies@bell.qa on
// cPanel) every minute. Every human message there is a reply to Bell's outreach, so each is
// handed to recordOutreachReply → logged in the admin mail view + reply-stop + (if
// BDI_OUTREACH_REPLY_FORWARD_TO is set) forwarded to Val's inbox. This is the "both" path:
// admin log AND inbox, with no DNS/MX changes (the mailbox uses bell.qa's existing mail).
//
// Enabled only when IMAP env vars are present — set them on ONE service (app.bell.qa):
//   BDI_OUTREACH_IMAP_HOST, BDI_OUTREACH_IMAP_PORT(=993), BDI_OUTREACH_IMAP_USER,
//   BDI_OUTREACH_IMAP_PASSWORD
// imapflow + mailparser are imported lazily so the Portal still boots where they aren't wanted.

import { recordOutreachReply } from './engine.js';

let ImapFlow = null;
let simpleParser = null;
const TICK_MS = 60_000;
let timer = null;
let running = false;

// Bounces / auto-responders should NOT count as a human reply (they'd wrongly reply-stop and add
// noise). Bounces are already handled by the Resend bounce webhook → suppression.
const AUTO_FROM_RX = /(mailer-daemon|postmaster|no-?reply|do-?not-?reply|bounce|notifications?@)/i;
const AUTO_SUBJECT_RX = /(out of office|automatic reply|auto[-\s]?reply|undeliverable|delivery status|mail delivery failed|returned mail)/i;

function cfg() {
  return {
    host: process.env.BDI_OUTREACH_IMAP_HOST,
    port: Number(process.env.BDI_OUTREACH_IMAP_PORT || 993),
    user: process.env.BDI_OUTREACH_IMAP_USER,
    pass: process.env.BDI_OUTREACH_IMAP_PASSWORD,
  };
}

export async function startOutreachReplyPoller() {
  const c = cfg();
  if (!c.host || !c.user || !c.pass) {
    console.log('[outreach-inbound] IMAP reply poller disabled (set BDI_OUTREACH_IMAP_HOST/USER/PASSWORD on one service)');
    return;
  }
  try {
    ({ ImapFlow } = await import('imapflow'));
    ({ simpleParser } = await import('mailparser'));
  } catch (e) {
    console.warn('[outreach-inbound] reply poller not started — imapflow/mailparser not installed here:', e.message);
    return;
  }
  setTimeout(safeRun, 14_000);
  timer = setInterval(safeRun, TICK_MS);
  console.log('[outreach-inbound] IMAP reply poller online (every ' + TICK_MS / 1000 + 's)');
}

async function safeRun() {
  if (running) return;
  running = true;
  try { await poll(); }
  catch (e) { console.error('[outreach-inbound] poll error:', e.message); }
  finally { running = false; }
}

async function poll() {
  const c = cfg();
  const client = new ImapFlow({
    host: c.host, port: c.port, secure: c.port !== 143,
    auth: { user: c.user, pass: c.pass }, logger: false,
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = await client.search({ seen: false }, { uid: true });
      for (const uid of (uids || [])) {
        try {
          const msg = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
          if (msg) {
            let fromAddr = msg.envelope?.from?.[0]?.address || null;
            let subject = msg.envelope?.subject || '';
            let text = '';
            try {
              const parsed = await simpleParser(msg.source);
              text = parsed.text || parsed.html || '';
              if (!fromAddr) fromAddr = parsed.from?.value?.[0]?.address || null;
              if (!subject) subject = parsed.subject || '';
            } catch { /* envelope is enough */ }
            const isAuto = (fromAddr && AUTO_FROM_RX.test(fromAddr)) || (subject && AUTO_SUBJECT_RX.test(subject));
            if (fromAddr && !isAuto) {
              await recordOutreachReply({ fromEmail: fromAddr, subject, text });
            }
          }
        } catch (e) { console.warn('[outreach-inbound] message', uid, 'failed:', e.message); }
        try { await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true }); } catch { /* ignore */ }
      }
    } finally { lock.release(); }
  } finally { await client.logout().catch(() => {}); }
}
