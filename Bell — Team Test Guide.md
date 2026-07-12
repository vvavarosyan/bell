# Bell — Team: step-by-step test guide

Everything below is live on **app.bell.qa**. You'll need a **second email you own**
(any email — Gmail, Outlook, a work alias) to play the "invited teammate," and a
private/incognito browser window so you can be logged in as two people at once.

Tip: keep your **main account** in your normal browser, and use an **incognito
window** for the invited teammate.

---

## Part A — Invite a teammate

**1. Open the Team page.** In your main account, click **Team** in the left
sidebar (under "Workspace").
✅ Expect: a "Team" page with an **Invite a teammate** box and a **Members** list
showing just you (as Owner).

**2. Send an invite.** Type your **second email** in the box, pick a role
(start with **Member**), click **Send invite**.
✅ Expect: a green "Invitation sent to …" message. A **Pending invitations**
card appears listing that email + role + an expiry date.

**3. Check the invite email.** Open the inbox of the second email.
✅ Expect: an email — "*<You> invited you to join <your workspace> on Bell*" —
with a **Join** button.

---

## Part B — The teammate joins

**4. Sign up as the teammate.** In an **incognito window**, either click the
**Join** button in the invite email, or go to **app.bell.qa/sign-up**. Sign up
**using the exact email you invited** (that's the key — the email must match).
Complete the email verification + any subscription step.
✅ Expect: after signup, they land in **your** workspace — NOT a new empty one.
They should see your companies, CRM, etc.

**5. Confirm the roster updated.** Back in your main account, refresh the **Team**
page.
✅ Expect: the second person now appears in **Members** with the role you gave
them, and the pending invite is gone.

---

## Part C — Manage the team (do these in your main / owner account)

**6. Change their role.** In the Members list, use the **role dropdown** next to
the teammate to switch them (e.g. Member → Admin, or → Viewer).
✅ Expect: "Role updated." (Their access changes accordingly — an Admin can now
manage the team; a Viewer becomes read-only.)

**7. Try the guardrails.** Confirm you **cannot** change or remove the **Owner**
(you), and there's no dropdown/remove on your own row.
✅ Expect: only teammates (not the owner, not yourself) have a role dropdown +
Remove button.

**8. Remove the teammate.** Click **Remove** next to them, confirm the prompt.
✅ Expect: "Removed." They disappear from the roster.

**9. Confirm access is revoked.** In the teammate's incognito window, reload the
app.
✅ Expect: they're locked out with a clear message ("Your access has been
removed — contact your team's admin"), **not** an error page.

**10. (Optional) Re-invite works.** Invite the same email again → they can rejoin.

---

## Part D — Non-manager view

**11. Invite the teammate again as a Viewer** (or Member), let them join, then
look at the **Team** page **in their account**.
✅ Expect: they see the roster but **no invite box** and **no role/remove
controls** — the page says only owners and admins can manage the team.

---

## Part E — CRM assignment (needs at least one teammate on the team)

**12. Assign a lead.** Go to **CRM**, open any record. Next to the status there's
now an **assignee dropdown** (only shows when you have a team).
Pick a teammate.
✅ Expect: "Assigned." The record's timeline shows "Assigned to <name>."

**13. Owner filter.** In the CRM toolbar there's an **owner filter** (All owners /
My leads / Unassigned / each teammate). Try each.
✅ Expect: the list narrows to that person's leads (or unassigned ones).

**14. Owner chip.** In the CRM list, each assigned record shows a small **owner
chip** (the teammate's first name).
✅ Expect: you can see at a glance who owns each lead.

**15. Auto-assign on reveal.** As the teammate, reveal a company in the Companies
tab.
✅ Expect: it lands in the CRM **assigned to them** automatically (owner chip =
their name).

---

## If anything's off

Tell me the **step number** and what you saw vs. the "✅ expect." Common things
to double-check:
- The invited person must sign up with the **exact** invited email.
- The owner filter / assignee dropdown only appear once you have **more than one**
  member (a solo workspace hides them on purpose).

*Once these pass and the UX/pagination/filter comments are done, we move to the
next step.*
