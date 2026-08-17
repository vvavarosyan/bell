// Bounce feedback for mail sent through a TENANT'S OWN server.
//
// When Resend carries a message, a webhook tells Bell it bounced and the address is suppressed
// within seconds. Over a customer's own SMTP there is no webhook and no provider: the receiving
// server sends a delivery-status report back to the envelope sender, which lands in the
// customer's own mailbox and is seen by nobody. Left there, a dead address would keep being
// mailed forever — the failure this whole accuracy loop exists to prevent.
//
// So Bell reads that mailbox, over IMAP, with credentials the tenant provided, and turns a
// delivery report into exactly the same end state the webhook produces: crm_emails.status =
// 'bounced', the address suppressed globally, and every stored contact carrying it downgraded.
//
// ⚠️ BELL IS A GUEST IN THAT MAILBOX AND BEHAVES LIKE ONE:
//   · it never marks anything \Seen — the customer's own unread count must not move. Progress is
//     tracked by imap_last_uid instead (the CRM poller uses \Seen because that mailbox is Bell's
//     own; this one is not).
//   · it reads only what arrived after the last cursor, never the archive.
//   · it acts ONLY on messages that are delivery reports about a message Bell itself sent.
//
// ⚠️ THE ADDRESS IS TAKEN FROM BELL'S OWN ROW, NEVER FROM THE REPORT. The Message-ID identifies
// the crm_emails row; the address suppressed is that row's stored to_email. Trusting an address
// parsed out of an inbound message would let anyone who can post mail to the tenant's mailbox
// suppress any address they like — the same hardening the Resend webhook already applies.

import { query } from '../db.js';
import { decryptSecret } from '../lib/secrets.js';
import { handleBounce } from '../lib/suppression.js';

const TICK_MS = 5 * 60_000;        // a bounce is not urgent; the mailbox is someone else's
const MAX_PER_RUN = 40;            // per tenant, per tick
let ImapFlow = null, simpleParser = null;
let timer = null, running = false;

/** A delivery report, by the shapes real mail servers actually use. */
function isDeliveryReport(parsed, envelopeFrom, subject) {
  const from = String(envelopeFrom || '').toLowerCase();
  const subj = String(subject || '').toLowerCase();
  const ct = String(parsed?.headers?.get?.('content-type')?.value || '').toLowerCase();
  return ct.includes('report-type=delivery-status')
    || /mailer-daemon|postmaster/.test(from)
    || /undeliverable|delivery status|mail delivery (failed|subsystem)|returned mail|failure notice|delivery has failed/.test(subj);
}

/**
 * The Message-ID of the ORIGINAL message, as quoted inside the report. Reports embed the
 * original headers; this is the only reliable link back to what Bell sent. Every candidate is
 * returned because a report may quote several ids (its own, the original's) and only one of
 * them will match a row Bell wrote.
 */
export function messageIdsIn(text) {
  const out = [];
  for (const m of String(text || '').matchAll(/Message-ID:\s*<([^>\s]+)>/gi)) out.push(m[1]);
  // Some servers quote the id bare in the body of the report.
  for (const m of String(text || '').matchAll(/\b(?:original|failed)[- ]message[- ]id[:\s]+<?([^>\s,;]+@[^>\s,;]+)>?/gi)) out.push(m[1]);
  return [...new Set(out)];
}

/** Permanent (5.x.x) vs temporary (4.x.x). Only a permanent failure suppresses an address. */
export function isPermanentFailure(text) {
  const s = String(text || '');
  if (/\bStatus:\s*5\.\d+\.\d+/i.test(s)) return true;
  if (/\bStatus:\s*4\.\d+\.\d+/i.test(s)) return false;
  // No machine-readable status: fall back to the wording servers use for a hard rejection.
  return /(user unknown|no such user|does not exist|mailbox unavailable|address rejected|recipient rejected|550)/i.test(s);
}

/** Record one delivery report against the message it is about. Returns what it did. */
export async function applyBounceReport(tenantId, { messageIds, permanent, detail }) {
  for (const mid of messageIds) {
    const { rows } = await query(
      `SELECT id, to_email, status FROM crm_emails
        WHERE provider_message_id = $1 AND tenant_id = $2 LIMIT 1`, [mid, Number(tenantId)]);
    const row = rows[0];
    if (!row) continue;
    // A temporary failure is not a bounce: the server will try again, and marking the address
    // dead on a full mailbox or a greylist would throw away a real contact.
    if (!permanent) return { matched: row.id, action: 'temporary_ignored' };
    // Terminal states are never downgraded, and 'complained' outranks 'bounced' — the webhook's
    // ordering rule, applied to the same table from a different source.
    await query(
      `UPDATE crm_emails SET status='bounced', error=$2
        WHERE id = $1 AND status NOT IN ('bounced','complained')`,
      [row.id, String(detail || 'delivery status notification').slice(0, 500)]);
    // The address comes from BELL'S row, never from the report.
    await handleBounce(row.to_email, 'bounced', { detail, source: 'smtp-bounce' }).catch((e) => {
      console.error('[smtp-bounce] suppression failed:', e.message);
    });
    return { matched: row.id, action: 'bounced', email: row.to_email };
  }
  return { matched: null, action: 'no_match' };
}

async function pollTenant(row) {
  const client = new ImapFlow({
    host: row.imap_host,
    port: Number(row.imap_port) || 993,
    secure: row.imap_secure !== false,
    auth: { user: row.imap_username, pass: await decryptSecret(row.imap_password_enc) },
    logger: false,
  });
  const out = { checked: 0, bounced: 0, lastUid: Number(row.imap_last_uid) || 0 };
  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      // Everything after the cursor. On the very first run start from "now" rather than
      // reading a customer's entire mail history — Bell wants the bounces it caused, and a
      // first run that trawled years of archive would be both slow and presumptuous.
      const since = out.lastUid ? { uid: `${out.lastUid + 1}:*` } : { since: new Date(Date.now() - 3 * 864e5) };
      const uids = await client.search(since, { uid: true });
      for (const uid of (uids || []).slice(-MAX_PER_RUN)) {
        if (uid <= out.lastUid) continue;
        out.checked++;
        out.lastUid = Math.max(out.lastUid, uid);
        try {
          const msg = await client.fetchOne(uid, { source: true, envelope: true }, { uid: true });
          if (!msg?.source) continue;
          const parsed = await simpleParser(msg.source);
          const from = msg.envelope?.from?.[0]?.address || parsed?.from?.value?.[0]?.address || '';
          const subject = msg.envelope?.subject || parsed?.subject || '';
          if (!isDeliveryReport(parsed, from, subject)) continue;
          const body = [parsed?.text || '', String(msg.source)].join('\n');
          const ids = messageIdsIn(body);
          if (!ids.length) continue;
          const res = await applyBounceReport(row.tenant_id, {
            messageIds: ids,
            permanent: isPermanentFailure(body),
            detail: String(subject).slice(0, 300),
          });
          if (res.action === 'bounced') out.bounced++;
        } catch (err) {
          console.warn('[smtp-bounce] message', uid, 'skipped:', err.message);
        }
      }
    } finally { lock.release(); }
  } finally {
    await client.logout().catch(() => {});
  }
  return out;
}

/** One pass over every tenant that has given Bell a mailbox to watch. */
export async function pollTenantBounces({ log = () => {} } = {}) {
  const { rows } = await query(
    `SELECT id, tenant_id, imap_host, imap_port, imap_secure, imap_username,
            imap_password_enc, imap_last_uid
       FROM tenant_email_domains
      WHERE transport = 'smtp' AND imap_host IS NOT NULL
        AND imap_username IS NOT NULL AND imap_password_enc IS NOT NULL`);
  const totals = { mailboxes: rows.length, checked: 0, bounced: 0, failed: 0 };
  for (const row of rows) {
    try {
      const r = await pollTenant(row);
      totals.checked += r.checked; totals.bounced += r.bounced;
      await query(
        `UPDATE tenant_email_domains
            SET imap_last_uid = $2, imap_last_polled_at = now(), imap_last_error = NULL
          WHERE id = $1`, [row.id, r.lastUid || null]);
      if (r.bounced) log(`  mailbox ${row.imap_host}: ${r.bounced} bounce(s) recorded of ${r.checked} message(s) read`);
    } catch (err) {
      totals.failed++;
      // A mailbox Bell cannot read is a REPORTED state, not a silent one: without it, bounces
      // stop arriving and everything downstream looks healthy.
      await query(
        `UPDATE tenant_email_domains SET imap_last_polled_at = now(), imap_last_error = $2 WHERE id = $1`,
        [row.id, String(err.message).slice(0, 400)]).catch(() => {});
      console.error('[smtp-bounce] mailbox', row.imap_host, 'unreadable:', err.message);
    }
  }
  return totals;
}

/**
 * Start the poller. Gated by BDI_SMTP_BOUNCE_POLLER=1 — one service only.
 * ⚠️ admin.bell.qa shares production's database, so an ungated poller would run twice against
 * the same mailboxes and the same cursor (the open-data lesson: not mirrored is not "not there").
 */
export function startSmtpBouncePoller() {
  if (process.env.BDI_SMTP_BOUNCE_POLLER !== '1') return;
  if (timer) return;
  const safeRun = async () => {
    if (running) return;
    running = true;
    try {
      if (!ImapFlow) ({ ImapFlow } = await import('imapflow'));
      if (!simpleParser) ({ simpleParser } = await import('mailparser'));
      const r = await pollTenantBounces({ log: (m) => console.log(m) });
      if (r.mailboxes) console.log(`[smtp-bounce] ${r.mailboxes} mailbox(es) · ${r.checked} read · ${r.bounced} bounced · ${r.failed} unreadable`);
    } catch (err) {
      console.error('[smtp-bounce] poll failed:', err.message);
    } finally { running = false; }
  };
  setTimeout(safeRun, 20_000);
  timer = setInterval(safeRun, TICK_MS);
  console.log('[smtp-bounce] watching tenant mailboxes for delivery reports every 5 min');
}
