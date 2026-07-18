# Bell — Outreach Test Guide (2026-07-18)

A full end-to-end test of the self-marketing engine, done entirely on the **live site**
(admin.bell.qa) so that the send, the admin mail log, the unsubscribe, and the reply all use the
**same database** and line up. (Your local `Send Outreach Test.command` sends from your Mac's
separate database, so those sends don't appear in the admin log — that's why we test on the live
site here.)

Nothing here turns on the automatic engine. "Send now (test)" only ever emails recipients **you
add by hand** — it can never touch the 5,387-company list.

---

## Part A — Open the command center
1. Go to **admin.bell.qa** and sign in.
2. Left sidebar, under **System**, click **Marketing**.
3. You should see: a green **"Sending OFF — safe test mode"** banner, the market numbers
   (10,735 role mailboxes), an empty **Campaigns** area, and a **Mail log**.

## Part B — Prove the full send + unsubscribe
4. Click **+ New campaign**. Name it `Test`, leave Audience = Role mailboxes, Language = English,
   click **Create draft**.
5. On the new campaign row, click **＋ recipient**. Enter **your own email**. You'll see
   "Added … to the queue."
6. Click **Send now (test)** → confirm. It sends **one** real email to you through go.bell.qa.
   The toast says "Sent 1".
7. Open your email (**check inbox AND spam** — it may land in spam; that's the new-domain warmup
   issue, not a bug). Confirm the email reads well and has a **visible Unsubscribe link + footer**
   at the bottom.
8. Back in Marketing → **Mail log → Outgoing**: your email is listed. Click it to read the exact
   body that was sent.
9. In the email, click the **Unsubscribe** link (or your mail app's own Unsubscribe button). You
   should see a small bilingual "You've been unsubscribed" page.

## Part C — Prove the unsubscribe actually blocks
10. Back in Marketing, click **＋ recipient** on the `Test` campaign and enter the **same email
    again**.
11. Click **Send now (test)** → confirm. This time the toast should say **"Sent 0, skipped 1"** —
    because you unsubscribed, Bell refuses to email you again. That's the proof.
    - Note: that address is now permanently opted out (correct behaviour). To run the test again,
      use a different email, or ask Claude to clear that one test address.

## Part D — Prove incoming replies + auto-stop
12. Marketing → Mail log → click **Log a reply (test)**. Enter the email you sent to in step 6 and
    any text (e.g. "interested, tell me more").
13. It flips to the **Incoming** tab and shows the reply. If that address had a sent email, it's
    now marked **replied**, and the automation will never email it again (a human is in the loop).

---

## What this proves
- The email is written well, sends through the isolated go.bell.qa channel, and is logged.
- The one-click unsubscribe works and is honoured everywhere, forever.
- Replies are captured and stop the automation.

## What is still OFF (on purpose)
- The **automatic engine** (emailing the real 5,387-company list) stays fully switched off until
  you say go and the lawyer has looked at it. "Send now (test)" cannot reach that list.
- **Automatic reply capture** (so real replies appear without the "Log a reply" button) needs a
  small mail-routing setup — Claude will wire it next.
