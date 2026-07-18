# Bell — The Outreach Machine (2026-07-18)

Everything is built and live on admin.bell.qa. This guide is: what the machine is, YOUR setup
steps, how to test, and how to switch it on when you're ready.

**The machine is currently OFF.** Nothing sends until you complete "ARMING" below — every test
before that is safe.

---

## What the machine does (once armed)

Every minute, on the live site, it: checks it's inside Qatar working hours (Sat–Thu 07:00–17:00,
skipping holidays) → runs a SELF-TEST (send channel working? public unsubscribe link alive? —
any failure blocks sending) → checks its CIRCUIT BREAKER (too many bounces or ANY spam
complaint = it pauses ITSELF until you resume it) → then sends that day's allowance of
personalized English emails (slow ramp-up for the new domain, max 2/day to any one company),
choosing between two written "angles" and **automatically favouring whichever gets more
replies**. It sends polite follow-ups (up to 3 touches, 4 days apart) to non-responders, stops
the moment someone replies, honours every unsubscribe (link click OR a "remove me" reply in
English or Arabic), detects out-of-office autoreplies (doesn't count them), flags 🔥 interested
replies as hot leads, forwards real replies to your inbox, and stamps every company that later
signs up as **Converted** — the snowball ledger.

You watch ALL of it in **admin.bell.qa → Marketing**: every outgoing and incoming email, the
funnel (sent → opened → replied → interested → converted), the two angles' scores, hot leads,
and the machine's own health.

---

## PART 1 — Your setup steps (one-time, ~10 minutes)

These make replies and open/bounce tracking work. Do them in order.

1. **Railway → the admin.bell.qa service → Variables**: add the SAME outreach variables you
   already added to app.bell.qa (this was why your last reply test missed):
   - `BDI_OUTREACH_REPLY_TO` = `replies@bell.qa`
   - `BDI_OUTREACH_REPLY_FORWARD_TO` = `hello@bell.qa`
   (The IMAP ones can stay only on app.bell.qa — that's where the mailbox reader runs.)
2. **Resend (your OUTREACH account — the val@bell.qa login) → Webhooks → Add Webhook**:
   - URL: `https://app.bell.qa/api/resend-webhook`
   - Select events: **delivered, opened, clicked, bounced, complained**.
   - Save. This is what fills "Opened" in the stats and feeds the safety breaker.
3. That's it. Railway redeploys by itself after step 1.

## PART 2 — Test round (all safe, nothing armed)

On **admin.bell.qa → Marketing**:

4. Click **Clear test data** (bottom section) — wipes the old test noise so you start clean.
5. **+ New campaign** → name `Machine test` → Create draft.
6. On it: **＋ recipient** → your own email → **Send now (test)**.
7. Check your email (inbox AND spam). Open it. **Reply to it** with anything (e.g. "sounds
   interesting, tell me more").
8. Wait ~2 minutes, then on the Marketing page click **Refresh** (Mail log):
   - **CORRECT =** your reply appears under **Incoming (replies)** with the company name;
     the **Replied** counter shows 1; if your wording sounded interested, you appear under
     **🔥 Hot leads**; AND a copy of the reply arrived in your **hello@bell.qa** inbox.
   - This works now because of Part 1 step 1 — the email's reply address is finally the
     watched mailbox on BOTH services.
9. Test the "remove me" intelligence: **＋ recipient** (same email) → **Send now (test)** →
   reply to the new email with just **"please remove me"**.
   - **CORRECT =** within ~2 min the **Unsubscribed** counter goes up by 1, and trying
     **＋ recipient** with that address again says **suppressed**. A written "remove me" now
     counts exactly like clicking Unsubscribe — automatically.
10. Click **Stats** on the campaign — you'll see the funnel bars and the two angles.

## PART 3 — ARMING the real machine (only when you decide)

Nothing below happens until you do this. My standing note: the lawyer review is still open —
this is your call, on your instruction.

11. **Railway → app.bell.qa service → Variables**: add
    - `BDI_OUTREACH_SCHEDULER` = `1`
    - `BDI_OUTREACH_ENABLED` = `1`
12. On **admin.bell.qa → Marketing**: create the real campaign (audience: Role mailboxes),
    click **Plan** (queues ~5,400 companies), then **Activate**.
13. Watch. Day 1 sends ~8 emails, ramping slowly (+6/day toward the 30/day cap, 60/day global
    ceiling — and the ramp only advances on days it actually sends). The banner goes red
    "SENDING IS LIVE". **Pause** any time; the breaker also stops it automatically if
    anything looks bad.

---

## What got fixed while building this (so you know it's solid)

A 24-agent adversarial review of the whole email system found and confirmed 14 real bugs — all
fixed and re-verified, including: a security hole where a forged web request could block Bell
from ever emailing any address; spam complaints being invisible to the stats (which would have
blinded the new safety breaker); replies being permanently lost if the database hiccuped at the
wrong moment; two schedulers being able to double-send the same email; the daily cap silently
refunding itself; and your reply-address bug from today.

## Still on the plan (not built yet, by choice)
- Physical-letter generator · consent web-form on bell.qa (the API for it is live) ·
  Arabic campaigns (one click away when you want) · marketing-site SEO cleanup.
