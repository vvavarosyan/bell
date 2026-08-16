// Free email verification — DNS and the mail server's own answers, no paid service.
//
// Val, 2026-08-17: "I don't want to spend anything right now. Let's find a solution which is
// going to be free of charge. We can use the ROG for that." This is that solution. What the
// paid verifiers sell is three checks Bell can run itself:
//
//   TIER 1 — SYNTAX.  isSendableAddress (already shipped). Not an address → 'invalid'.
//   TIER 2 — DNS.     Does the domain exist, and does it publish mail servers? A domain that
//                     DOES NOT RESOLVE cannot host a mailbox — that is a conclusive 'invalid',
//                     stated by the DNS system itself. A domain that resolves says NOTHING
//                     about the mailbox; nothing is claimed (Rule 2.1).
//   TIER 3 — SMTP.    Ask the domain's own mail server: EHLO → MAIL FROM → RCPT TO → QUIT,
//                     never DATA — no email is ever sent. A 250 for the mailbox PLUS a 5xx for
//                     a random probe mailbox is the server stating "this box exists and I do
//                     reject nonsense" → 'verified'. A 250 for the random probe too means the
//                     server accepts anything → 'catch_all', which proves NOTHING about the
//                     real mailbox and is never stored as verified. A 550 for the target →
//                     'invalid', the server's own words. 4xx/greylist/timeout → no claim.
//
// ⚠️ TIER 3 REQUIRES OUTBOUND PORT 25, which consumer ISPs commonly block. The tier PROBES
// FIRST (a TCP connect to a well-known MX): blocked = the tier reports exactly that and stops —
// a blocked night must never read as "checked fine, all unknown" (the Kahramaa lesson). Tier 2
// needs only DNS and runs anywhere.
//
// Politeness: one connection per domain per run, domains processed once (a verdict on the
// domain's MX applies to every address on it), small nightly limits, 1s spacing.
//
// Storage: company_contacts.email_status ('invalid' | 'verified' | 'catch_all') +
// last_verified_at, is_verified=true only on 'verified'. The table is MIRRORED, so every write
// stamps updated_at — the sync watermark — or production never hears the verdict.

import net from 'node:net';
import dns from 'node:dns/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { query, pool } from '../db.js';
import { isSendableAddress } from '../lib/email.js';

const SMTP_TIMEOUT = 12_000;
const HELO_HOST = 'mail.bell.qa';
const MAIL_FROM = 'verify@bell.qa';

// ── TIER 2: the domain itself ────────────────────────────────────────────────────────────────
/** @returns {'dead'|'mx'|'implicit_mx'|'unknown'} */
export async function domainMailability(domain) {
  try {
    const mx = await dns.resolveMx(domain);
    if (mx && mx.length) return 'mx';
  } catch (e) {
    if (e.code === 'ENOTFOUND') {
      // No MX — but RFC 5321 falls back to the A record. Only NO DOMAIN AT ALL is conclusive.
      try { await dns.resolve4(domain); return 'implicit_mx'; }
      catch (e2) {
        if (e2.code === 'ENOTFOUND' || e2.code === 'ENODATA') {
          try { await dns.resolve6(domain); return 'implicit_mx'; } catch { return 'dead'; }
        }
        return 'unknown';                       // SERVFAIL etc — the resolver failed, not the domain
      }
    }
    if (e.code === 'ENODATA') {
      try { await dns.resolve4(domain); return 'implicit_mx'; } catch { return 'dead'; }
    }
    return 'unknown';
  }
  return 'unknown';
}

/**
 * Mark every stored email whose DOMAIN does not exist as invalid. DNS-only — runs anywhere.
 */
export async function verifyDnsTier({ limit = 3000, log = () => {} } = {}) {
  const rows = (await query(`
    SELECT DISTINCT lower(split_part(COALESCE(value_display, value), '@', 2)) AS domain
      FROM company_contacts
     WHERE type = 'email' AND COALESCE(email_status, 'unknown') NOT IN ('invalid', 'verified', 'bounced')
     ORDER BY 1 LIMIT $1`, [limit])).rows.map((r) => r.domain).filter(Boolean);
  let dead = 0, alive = 0, unknown = 0, marked = 0;
  for (const domain of rows) {
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) { unknown++; continue; }
    const v = await domainMailability(domain);
    if (v === 'dead') {
      dead++;
      // The DNS system states the domain does not exist; no mailbox can exist on it.
      const u = await query(`
        UPDATE company_contacts SET email_status = 'invalid', is_verified = false,
               last_verified_at = now(), updated_at = now()
         WHERE type = 'email' AND lower(split_part(COALESCE(value_display, value), '@', 2)) = $1
           AND COALESCE(email_status,'') <> 'invalid'`, [domain]);
      marked += u.rowCount;
    } else if (v === 'unknown') unknown++;
    else alive++;
  }
  log(`  DNS tier: ${rows.length} domains — ${dead} dead (${marked} addresses marked invalid) · ${alive} alive · ${unknown} resolver-unclear (no claim)`);
  return { domains: rows.length, dead, alive, unknown, marked };
}

// ── TIER 3: the mail server's own answer ─────────────────────────────────────────────────────
/** One SMTP conversation. Returns per-line reply codes; never sends DATA. */
export function smtpDialogue(host, commands, { port = 25 } = {}) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host, port, timeout: SMTP_TIMEOUT });
    const replies = [];
    let buf = '', step = -1, settled = false;
    const finish = (err) => { if (!settled) { settled = true; try { sock.destroy(); } catch { /* */ } resolve({ replies, err: err || null }); } };
    sock.on('timeout', () => finish('timeout'));
    sock.on('error', (e) => finish(e.code || e.message));
    sock.on('data', (d) => {
      buf += d.toString('utf8');
      // A reply is complete at "NNN " (space, not dash) at a line start — multiline-safe.
      const m = buf.match(/(^|\n)(\d{3}) [^\n]*\r?\n?$/);
      if (!m) return;
      replies.push(Number(m[2]));
      buf = '';
      step++;
      if (step >= commands.length) return finish(null);
      sock.write(commands[step] + '\r\n');
    });
  });
}

/** Can this machine speak SMTP to the world at all? Consumer ISPs commonly block port 25. */
export async function smtpEgressWorks() {
  const probe = await new Promise((resolve) => {
    const sock = net.createConnection({ host: 'gmail-smtp-in.l.google.com', port: 25, timeout: 8000 });
    sock.on('connect', () => { sock.destroy(); resolve(true); });
    sock.on('timeout', () => { sock.destroy(); resolve(false); });
    sock.on('error', () => resolve(false));
  });
  return probe;
}

/**
 * Verify one mailbox against its domain's own MX. @returns {'verified'|'invalid'|'catch_all'|'unknown'}
 */
export async function smtpVerdict(email, { mxHost = null } = {}) {
  const domain = String(email).split('@')[1]?.toLowerCase();
  if (!domain) return 'unknown';
  let host = mxHost;
  if (!host) {
    try { host = (await dns.resolveMx(domain)).sort((a, b) => a.priority - b.priority)[0]?.exchange; }
    catch { return 'unknown'; }
  }
  if (!host) return 'unknown';

  // Random probe FIRST in the same session: a server that accepts a mailbox that cannot exist
  // accepts everything, and its 250 for the real address would state nothing.
  const nonsense = `zx${Date.now().toString(36)}vq${Math.floor(1e6 * (Date.now() % 1) + process.pid) % 999983}@${domain}`;
  const r = await smtpDialogue(host, [
    `EHLO ${HELO_HOST}`,
    `MAIL FROM:<${MAIL_FROM}>`,
    `RCPT TO:<${nonsense}>`,
    `RCPT TO:<${email}>`,
    'QUIT',
  ]);
  return mapSmtpReplies(r);
}

/** Pure verdict mapping — exported so tests pin the exact rules. */
export function mapSmtpReplies(r) {
  if (r.err || r.replies.length < 5) return 'unknown';
  const [greet, ehlo, mail, rcptNonsense, rcptReal] = r.replies;
  if (greet >= 400 || ehlo >= 400 || mail >= 400) return 'unknown';
  if (rcptNonsense >= 200 && rcptNonsense < 300) {
    // accepts a mailbox that cannot exist → its acceptance proves nothing
    return 'catch_all';
  }
  if (rcptReal >= 200 && rcptReal < 300) return 'verified';   // rejected nonsense, accepted this
  if (rcptReal >= 550 && rcptReal <= 553) return 'invalid';   // the server's own words
  return 'unknown';                                            // 4xx greylist etc — no claim
}

export async function verifySmtpTier({ limit = 300, log = () => {} } = {}) {
  if (!(await smtpEgressWorks())) {
    // Must FAIL loudly, not report zero: on a network that blocks port 25 this tier cannot run,
    // and the duties card should say that in words, not show a healthy-looking nothing.
    throw new Error('outbound port 25 is blocked on this network — the SMTP tier cannot run here. The DNS tier still ran.');
  }
  const rows = (await query(`
    SELECT DISTINCT ON (lower(split_part(COALESCE(value_display, value),'@',2)))
           COALESCE(value_display, value) AS email
      FROM company_contacts
     WHERE type = 'email' AND COALESCE(email_status, 'unknown') IN ('unknown')
     ORDER BY lower(split_part(COALESCE(value_display, value),'@',2)), is_primary DESC
     LIMIT $1`, [limit])).rows;
  let verified = 0, invalid = 0, catchAll = 0, unknown = 0;
  for (const { email } of rows) {
    if (!isSendableAddress(email)) continue;
    const v = await smtpVerdict(email);
    if (v === 'verified') {
      verified++;
      await query(`UPDATE company_contacts SET email_status='verified', is_verified=true, last_verified_at=now(), updated_at=now()
                    WHERE type='email' AND COALESCE(value_display, value) = $1`, [email]);
    } else if (v === 'invalid') {
      invalid++;
      await query(`UPDATE company_contacts SET email_status='invalid', is_verified=false, last_verified_at=now(), updated_at=now()
                    WHERE type='email' AND COALESCE(value_display, value) = $1`, [email]);
    } else if (v === 'catch_all') {
      catchAll++;
      await query(`UPDATE company_contacts SET email_status='catch_all', last_verified_at=now(), updated_at=now()
                    WHERE type='email' AND COALESCE(value_display, value) = $1 AND COALESCE(email_status,'unknown')='unknown'`, [email]);
    } else unknown++;
    await new Promise((r) => setTimeout(r, 1000));           // politeness between domains
  }
  log(`  SMTP tier: ${rows.length} mailboxes — ${verified} verified · ${invalid} invalid · ${catchAll} catch-all · ${unknown} no-claim`);
  return { checked: rows.length, verified, invalid, catch_all: catchAll, unknown };
}

export async function runEmailVerify({ dnsLimit = 3000, smtpLimit = 300, log = console.log } = {}) {
  const dnsOut = await verifyDnsTier({ limit: dnsLimit, log });
  let smtpOut = null;
  try { smtpOut = await verifySmtpTier({ limit: smtpLimit, log }); }
  catch (e) { log('  ' + e.message); smtpOut = { blocked: true, error: e.message }; }
  return { dns: dnsOut, smtp: smtpOut };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runEmailVerify({})
    .then((r) => { console.log('EMAIL VERIFY COMPLETE:', JSON.stringify(r)); return pool.end(); })
    .then(() => process.exit(0))
    .catch(async (e) => { console.error('EMAIL VERIFY FAILED: ' + e.message); await pool.end().catch(() => {}); process.exit(1); });
}
