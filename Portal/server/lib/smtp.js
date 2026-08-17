// The SMTP transport — a tenant's own mail server, driven by Bell.
//
// This module knows how to open a connection and hand over a message. It knows nothing about
// suppression, contact guards, daily limits or the ledger: those live at the chokepoint in
// lib/email.js and must stay there, because a transport that could be reached around them would
// be a way to send mail Bell promised not to send (the one-guard-per-action lesson).
//
// ⚠️ VERIFICATION NEVER SENDS A MESSAGE. Proving a password works means EHLO + STARTTLS + AUTH
// and then QUIT — the same discipline the free address verifier follows (never DATA). A test
// that delivered mail to prove itself would be a test nobody dares run.
//
// ⚠️ THE SERVER'S OWN WORDS ARE THE ERROR. A rejected login must reach the operator as what the
// mail server said ("535 5.7.8 Username and Password not accepted"), not as "Could not send the
// email." — the exact blankness that sent the 2026-08-10 investigation looking in the wrong
// place. Nothing here invents a cause.

import { createRequire } from 'node:module';
import { decryptSecret } from './secrets.js';

const require = createRequire(import.meta.url);

/** Load nodemailer lazily: a deployment that never sends over SMTP never pays for the module. */
function nodemailer() {
  try { return require('nodemailer'); } catch { throw new Error('smtp_module_missing'); }
}

/**
 * Build the connection settings a tenant row describes.
 * `secure` is the ONE setting people get wrong: true means implicit TLS (port 465), false means
 * a plain connection upgraded by STARTTLS (587). requireTLS makes the 587 case refuse to fall
 * back to cleartext — a customer's password must never cross the wire unencrypted.
 */
export async function smtpConfigFromRow(row) {
  if (!row?.smtp_host || !row?.smtp_username || !row?.smtp_password_enc) return null;
  const port = Number(row.smtp_port) || (row.smtp_secure ? 465 : 587);
  return {
    host: String(row.smtp_host).trim(),
    port,
    secure: !!row.smtp_secure,
    requireTLS: !row.smtp_secure,
    auth: { user: String(row.smtp_username).trim(), pass: await decryptSecret(row.smtp_password_enc) },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  };
}

/**
 * Prove the credentials WITHOUT sending anything. nodemailer's verify() performs the connection,
 * the TLS upgrade and the AUTH exchange, then closes. Returns the server's verbatim answer on
 * failure; a caller stores that string and shows it, unedited.
 */
export async function verifySmtp(config) {
  const nm = nodemailer();
  const t = nm.createTransport(config);
  try {
    await t.verify();
    return { ok: true, error: null };
  } catch (err) {
    // nodemailer surfaces the server's reply on .response, its own classification on .code.
    const said = err?.response || err?.message || String(err);
    return { ok: false, error: String(said).slice(0, 400), code: err?.code || null };
  } finally {
    try { t.close(); } catch { /* the socket is already gone */ }
  }
}

/**
 * Send one message. Returns { messageId, response, accepted, rejected }.
 *
 * The Message-ID matters beyond bookkeeping: it is the ONLY thing that ties a bounce report,
 * delivered days later into the tenant's own mailbox, back to the row Bell stored. It is
 * recorded as provider_message_id and matched by the mailbox poller.
 */
export async function sendViaSmtp(config, { from, to, cc, replyTo, subject, html, text, headers }) {
  const nm = nodemailer();
  const t = nm.createTransport(config);
  try {
    const info = await t.sendMail({
      from, to, cc: cc?.length ? cc : undefined, replyTo: replyTo || undefined,
      subject, html: html || undefined, text: text || undefined,
      headers: headers || undefined,
    });
    return {
      messageId: stripAngles(info?.messageId),
      response: info?.response || null,
      accepted: info?.accepted || [],
      rejected: info?.rejected || [],
    };
  } finally {
    try { t.close(); } catch { /* already closed */ }
  }
}

/** "<abc@host>" → "abc@host". Bounce reports quote the id both ways; stored form is bare. */
export function stripAngles(id) {
  return String(id || '').replace(/^<|>$/g, '') || null;
}
