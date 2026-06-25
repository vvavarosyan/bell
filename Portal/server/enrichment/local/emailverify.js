// Pluggable email verifier. Pipeline: format → MX (does the domain accept mail?)
// → optional SMTP mailbox probe with catch-all detection. Returns a class; the
// Stage 10 engine writes an address to Bell ONLY when result === 'valid'.
//
// Designed to be swapped for a verification API later: replace smtpProbe() / the
// SMTP branch of verifyEmail() with an API call and the rest of the engine is
// unchanged. Every failure/ambiguity → 'unknown' (never written), so we never
// store an unverified address.

import net from 'node:net';
import { promises as dns } from 'node:dns';
import { getKey } from '../../keychain.js';

const MX_CACHE = new Map();        // domain -> { mx, at }
const CATCHALL_CACHE = new Map();  // domain -> boolean
const MX_TTL = 6 * 60 * 60 * 1000;

const SMTP_ENABLED = process.env.BELL_EMAIL_SMTP !== '0';
const VERIFY_FROM  = process.env.BELL_EMAIL_VERIFY_FROM || 'verify@bell.qa';
const HELO_NAME    = VERIFY_FROM.split('@')[1] || 'bell.qa';
const TIMEOUT_MS   = Number(process.env.BELL_EMAIL_SMTP_TIMEOUT_MS || 7000);
const FAIL_LIMIT   = Number(process.env.BELL_EMAIL_SMTP_FAIL_LIMIT || 5);

// Circuit breaker — if outbound :25 is blocked we'd otherwise add a full timeout
// of latency to every address. After FAIL_LIMIT consecutive connect failures we
// stop attempting SMTP for the rest of the process (verifyEmail returns 'unknown').
let consecutiveFails = 0;
let smtpDisabled = false;

// Reoon email-verification API — the PRIMARY verifier when a key is configured
// (keychain `bdi-reoon` locally, or BDI_KEY_REOON / BELL_REOON_KEY in prod). Reoon
// runs the SMTP check from its own reputable IPs, so it works even though outbound
// :25 is blocked on this Mac. Falls back to the local MX/SMTP path when no key.
let _reoonKey;            // undefined = unchecked; null = none; string = key
let _reoonCheckedAt = 0;
let _reoonAuthFailed = false;
async function getReoonKey() {
  if (_reoonKey !== undefined && Date.now() - _reoonCheckedAt < 300_000) return _reoonKey;
  _reoonCheckedAt = Date.now();
  try { _reoonKey = process.env.BELL_REOON_KEY || (await getKey('reoon')) || null; }
  catch { _reoonKey = null; }
  return _reoonKey;
}

/** Verify via Reoon. Returns { result, mx, method:'reoon', detail } or null (no
 *  key / transient error / quota) so the caller falls back to local SMTP. */
async function reoonVerify(email) {
  if (_reoonAuthFailed) return null;
  const key = await getReoonKey();
  if (!key) return null;
  try {
    const url = `https://emailverifier.reoon.com/api/v1/verify?email=${encodeURIComponent(email)}&key=${encodeURIComponent(key)}&mode=power`;
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 20_000);
    const res = await fetch(url, { signal: ctl.signal }).finally(() => clearTimeout(to));
    if (res.status === 401 || res.status === 403) { _reoonAuthFailed = true; return null; }
    if (!res.ok) return null;                       // 402/429 quota etc. → fall back
    const d = await res.json().catch(() => null);
    if (!d) return null;
    const status = String(d.status || '').toLowerCase();
    let result;
    if (d.is_safe_to_send === true || status === 'safe') result = 'valid';
    else if (status === 'catch_all' || d.is_catch_all === true) result = 'catch_all';
    else if (d.is_deliverable === false || ['invalid', 'disabled', 'disposable', 'spamtrap', 'inbox_full'].includes(status)) result = 'invalid';
    else result = 'unknown';
    return { result, mx: d.mx_accepts_mail !== false, method: 'reoon', detail: status || undefined };
  } catch { return null; }
}

export function emailDomain(email) {
  const m = /@([^@\s]+)$/.exec(String(email || '').trim().toLowerCase());
  return m ? m[1] : '';
}

export async function lookupMx(domain) {
  const d = String(domain || '').toLowerCase();
  if (!d) return [];
  const c = MX_CACHE.get(d);
  if (c && Date.now() - c.at < MX_TTL) return c.mx;
  let mx = [];
  try {
    mx = await dns.resolveMx(d);
    mx = (mx || []).filter((x) => x && x.exchange).sort((a, b) => a.priority - b.priority);
  } catch { mx = []; }
  if (mx.length === 0) {
    // RFC 5321: with no MX, the A record is the implicit mail exchanger.
    try { const a = await dns.resolve4(d); if (a && a.length) mx = [{ exchange: d, priority: 0 }]; } catch { /* none */ }
  }
  MX_CACHE.set(d, { mx, at: Date.now() });
  return mx;
}

// One lock-step SMTP conversation. Robust to multi-line replies (a reply ends on
// a line matching /^\d{3}(\s|$)/). Returns the RCPT code for `rcpt` and, when
// asked, whether the server is catch-all (accepts a random nonexistent mailbox).
function smtpProbe(mxHost, domain, rcpt, probeCatchAll) {
  return new Promise((resolve) => {
    const out = { connected: false, code: 0, catchAll: null, error: null };
    let done = false, step = 'greet', buf = '', heloTried = false;
    const rnd = 'zztest' + Math.random().toString(36).slice(2, 12);
    const sock = net.createConnection({ host: mxHost, port: 25 });
    sock.setEncoding('utf8');
    sock.setTimeout(TIMEOUT_MS);

    const finish = (patch) => {
      if (done) return; done = true; Object.assign(out, patch);
      try { sock.write('QUIT\r\n'); } catch { /* ignore */ }
      try { sock.end(); } catch { /* ignore */ }
      try { sock.destroy(); } catch { /* ignore */ }
      resolve(out);
    };
    const send = (line) => { try { sock.write(line + '\r\n'); } catch { /* ignore */ } };

    const onReply = (code) => {
      if (step === 'greet') {
        out.connected = true;
        if (code !== 220) return finish({ error: 'greeting', code });
        send('EHLO ' + HELO_NAME); step = 'ehlo'; return;
      }
      if (step === 'ehlo') {
        if (code >= 500 && !heloTried) { heloTried = true; send('HELO ' + HELO_NAME); return; }
        if (code >= 400) return finish({ error: 'ehlo', code });
        send('MAIL FROM:<' + VERIFY_FROM + '>'); step = 'mail'; return;
      }
      if (step === 'mail') {
        if (code >= 400) return finish({ error: 'mailfrom', code });
        if (probeCatchAll) { send('RCPT TO:<' + rnd + '@' + domain + '>'); step = 'catch'; }
        else { send('RCPT TO:<' + rcpt + '>'); step = 'rcpt'; }
        return;
      }
      if (step === 'catch') {
        out.catchAll = (code >= 200 && code < 300);
        send('RCPT TO:<' + rcpt + '>'); step = 'rcpt'; return;
      }
      if (step === 'rcpt') { return finish({ code }); }
    };

    const consume = () => {
      const nl = buf.lastIndexOf('\n');
      if (nl < 0) return null;
      const complete = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      let code = null;
      for (const ln of complete.split(/\r?\n/)) {
        if (/^\d{3}(\s|$)/.test(ln)) code = parseInt(ln.slice(0, 3), 10);
      }
      return code;
    };

    sock.on('data', (chunk) => {
      buf += chunk;
      while (buf.indexOf('\n') >= 0) {
        const code = consume();
        if (code != null) onReply(code);
        if (done) break;
      }
    });
    sock.on('timeout', () => finish({ error: 'timeout' }));
    sock.on('error', (e) => finish({ error: (e && e.code) || 'error' }));
    sock.on('close', () => finish({ error: out.error || 'closed' }));
  });
}

/**
 * Verify one address. Returns { result, mx, method, detail }.
 *   result: 'valid' | 'invalid' | 'catch_all' | 'unknown'
 * Only 'valid' should ever be written to Bell.
 */
export async function verifyEmail(email, opts = {}) {
  const addr = String(email || '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(addr)) return { result: 'invalid', mx: false, method: 'format' };

  // Reoon API first (clean IP — works despite the local SMTP block).
  const viaReoon = await reoonVerify(addr);
  if (viaReoon) return viaReoon;

  const domain = emailDomain(addr);

  const mx = await lookupMx(domain);
  if (mx.length === 0) return { result: 'invalid', mx: false, method: 'mx', detail: 'no-mx' };

  const allowSmtp = SMTP_ENABLED && opts.smtp !== false && !smtpDisabled;
  if (!allowSmtp) return { result: 'unknown', mx: true, method: 'mx', detail: smtpDisabled ? 'smtp-disabled' : 'smtp-off' };

  const cachedCatchAll = CATCHALL_CACHE.get(domain);
  const probeCatchAll = cachedCatchAll === undefined;
  const r = await smtpProbe(mx[0].exchange, domain, addr, probeCatchAll);

  // A connection that never completed a real exchange = blocked/timeout → unknown.
  if (!r.connected || r.error === 'timeout') {
    consecutiveFails++;
    if (consecutiveFails >= FAIL_LIMIT) smtpDisabled = true;
    return { result: 'unknown', mx: true, method: 'smtp', detail: r.error || 'no-connect' };
  }
  consecutiveFails = 0; // a server actually talked to us

  const catchAll = probeCatchAll ? r.catchAll : cachedCatchAll;
  if (probeCatchAll && r.catchAll != null) CATCHALL_CACHE.set(domain, r.catchAll);
  if (catchAll) return { result: 'catch_all', mx: true, method: 'smtp' };

  if (r.code >= 200 && r.code < 300) return { result: 'valid', mx: true, method: 'smtp' };
  if ([550, 551, 553, 552, 501].includes(r.code)) return { result: 'invalid', mx: true, method: 'smtp', detail: r.code };
  return { result: 'unknown', mx: true, method: 'smtp', detail: r.code || 'no-code' };
}

export function verifierStatus() {
  return {
    smtp_enabled: SMTP_ENABLED, smtp_disabled: smtpDisabled,
    consecutive_fails: consecutiveFails,
    mx_cached: MX_CACHE.size, catchall_cached: CATCHALL_CACHE.size,
  };
}
