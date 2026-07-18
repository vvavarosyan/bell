// IMAP inbound-reply poller. Reads a dedicated reply mailbox (e.g. reply@bell.qa
// on your cPanel server) every minute, finds unseen messages, extracts the
// reply+<id> recipient + sender + body, and hands them to processInboundReply
// (thread into the record, stop the sequence, forward to the sender).
//
// Enabled only when IMAP env vars are present — set them on ONE service
// (app.bell.qa) so a single poller reads the mailbox:
//   BDI_CRM_IMAP_HOST, BDI_CRM_IMAP_PORT(=993), BDI_CRM_IMAP_USER, BDI_CRM_IMAP_PASSWORD

// NOTE: imapflow + mailparser are imported lazily (inside startInboundPoller),
// so the Portal still boots on machines/deployments where those packages aren't
// installed and IMAP isn't configured (e.g. the local engine).
import { processInboundReply, parseReplyId } from './inbound.js';

let ImapFlow = null;
let simpleParser = null;

const TICK_MS = 60_000;
let timer = null;
let running = false;
const failCounts = new Map();   // uid -> failed attempts (poison-message guard)

function cfg() {
  return {
    host: process.env.BDI_CRM_IMAP_HOST,
    port: Number(process.env.BDI_CRM_IMAP_PORT || 993),
    user: process.env.BDI_CRM_IMAP_USER,
    pass: process.env.BDI_CRM_IMAP_PASSWORD,
  };
}

export async function startInboundPoller() {
  const c = cfg();
  if (!c.host || !c.user || !c.pass) {
    console.log('[crm-inbound] IMAP poller disabled (set BDI_CRM_IMAP_HOST/USER/PASSWORD on one service)');
    return;
  }
  // Load the IMAP/parse libs only now that we know the poller is wanted.
  try {
    ({ ImapFlow } = await import('imapflow'));
    ({ simpleParser } = await import('mailparser'));
  } catch (e) {
    console.warn('[crm-inbound] IMAP poller not started — imapflow/mailparser not installed here:', e.message);
    return;
  }
  setTimeout(safeRun, 10_000);
  timer = setInterval(safeRun, TICK_MS);
  console.log('[crm-inbound] IMAP poller online (every ' + TICK_MS / 1000 + 's)');
}

async function safeRun() {
  if (running) return;
  running = true;
  try { await poll(); }
  catch (e) { console.error('[crm-inbound] poll error:', e.message); }
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
        let ok = false;
        try {
          const msg = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
          if (msg) {
            let emailId = null;
            for (const a of (msg.envelope?.to || [])) { emailId = parseReplyId(a.address); if (emailId) break; }
            let fromAddr = msg.envelope?.from?.[0]?.address || null;
            let subject = msg.envelope?.subject || '';
            let text = '';
            try {
              const parsed = await simpleParser(msg.source);
              text = parsed.text || parsed.html || '';
              if (!fromAddr) fromAddr = parsed.from?.value?.[0]?.address || null;
              if (!subject) subject = parsed.subject || '';
              if (!emailId) for (const a of (parsed.to?.value || [])) { emailId = parseReplyId(a.address); if (emailId) break; }
            } catch (e) { /* envelope-only is enough to match */ }
            if (emailId) await processInboundReply({ emailId, fromAddr, subject, text });
          }
          ok = true;
        } catch (e) {
          console.warn('[crm-inbound] message', uid, 'failed:', e.message);
        }
        // Mark Seen only when processing SUCCEEDED — a transient DB/network error must not
        // permanently lose the reply (it stays unseen and retries next tick). Poison guard:
        // after 3 failed attempts, mark Seen anyway and log loudly.
        if (ok) {
          try { await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true }); } catch { /* ignore */ }
          failCounts.delete(uid);
        } else {
          const n = (failCounts.get(uid) || 0) + 1;
          failCounts.set(uid, n);
          if (n >= 3) {
            console.error('[crm-inbound] message', uid, 'failed', n, 'times — marking Seen (dead-letter). CHECK THE MAILBOX MANUALLY.');
            try { await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true }); } catch { /* ignore */ }
            failCounts.delete(uid);
          }
        }
      }
      if (failCounts.size > 500) failCounts.clear();
    } finally { lock.release(); }
  } finally { await client.logout().catch(() => {}); }
}
