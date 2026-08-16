// The free email verifier: verdicts only where the evidence is the network's own statement.
//
// The SMTP rules are pinned as a pure mapping, and the wire dialogue is driven against a REAL
// local server (node:net) that scripts each reply — including the assertion that Bell NEVER
// sends DATA: this verifier asks, it does not email. DNS tier uses the RFC 2606 guarantee that
// `.invalid` never resolves, so that test is deterministic without mocking.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { mapSmtpReplies, smtpDialogue, domainMailability } from '../ops/email_verify.js';

// ── the verdict rules ────────────────────────────────────────────────────────────────────────
const R = (...replies) => ({ replies, err: null });

test('rejected nonsense + accepted target = the server states the mailbox exists', () => {
  assert.equal(mapSmtpReplies(R(220, 250, 250, 550, 250)), 'verified');
});
test('accepted nonsense = catch-all — acceptance proves nothing, never verified', () => {
  assert.equal(mapSmtpReplies(R(220, 250, 250, 250, 250)), 'catch_all');
});
test("550 on the target is the server's own 'no such mailbox'", () => {
  assert.equal(mapSmtpReplies(R(220, 250, 250, 550, 550)), 'invalid');
});
test('greylisting (4xx) makes no claim either way', () => {
  assert.equal(mapSmtpReplies(R(220, 250, 250, 550, 451)), 'unknown');
});
test('a server that rejects the session yields no verdict', () => {
  assert.equal(mapSmtpReplies(R(554, 250, 250, 550, 250)), 'unknown');
  assert.equal(mapSmtpReplies({ replies: [220, 250], err: 'timeout' }), 'unknown');
});

// ── the wire, against a real local SMTP mock ─────────────────────────────────────────────────
function mockSmtp(script) {
  return new Promise((resolve) => {
    let sawData = false;
    const server = net.createServer((sock) => {
      sock.write('220 mock ready\r\n');
      let i = 0;
      sock.on('data', (d) => {
        const line = d.toString();
        if (/^DATA/i.test(line)) sawData = true;
        const reply = script[i++] ?? '250 ok';
        sock.write(reply + '\r\n');
      });
    });
    server.listen(0, '127.0.0.1', () => resolve({
      port: server.address().port,
      close: () => new Promise((r) => server.close(r)),
      sawData: () => sawData,
    }));
  });
}

test('the dialogue walks EHLO→MAIL→RCPT→RCPT→QUIT and never sends DATA', async () => {
  const srv = await mockSmtp(['250 hello', '250 sender ok', '550 no such user', '250 recipient ok', '221 bye']);
  const r = await smtpDialogue('127.0.0.1', [
    'EHLO test', 'MAIL FROM:<v@test>', 'RCPT TO:<zz@x>', 'RCPT TO:<real@x>', 'QUIT',
  ], { port: srv.port });
  await srv.close();
  assert.deepEqual(r.replies, [220, 250, 250, 550, 250, 221], 'greeting + 4 command replies + QUIT ack');
  assert.equal(r.err, null);
  assert.equal(srv.sawData(), false, 'no DATA — the verifier must never send an actual email');
  assert.equal(mapSmtpReplies(r), 'verified');
});

test('a dead connection resolves with an error, not a hang', async () => {
  const r = await smtpDialogue('127.0.0.1', ['EHLO x'], { port: 1 });   // nothing listens on 1
  assert.ok(r.err, 'connection refused surfaces as err');
  assert.equal(mapSmtpReplies(r), 'unknown');
});

// ── DNS tier ─────────────────────────────────────────────────────────────────────────────────
test('.invalid can never resolve — conclusively dead (RFC 2606)', async () => {
  assert.equal(await domainMailability('no-such-company.invalid'), 'dead');
});
test('a real mail domain reports mail servers', async () => {
  const v = await domainMailability('gmail.com').catch(() => 'unknown');
  // Network-dependent: offline → 'unknown' is acceptable; what is NOT acceptable is 'dead'.
  assert.notEqual(v, 'dead');
});
