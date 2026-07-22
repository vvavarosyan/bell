# Bell — Two-Machine Plan: the Windows engine room + the Mac control screen

*Written by Claude with Val, 2026-07-22. Read this on either machine — it is the single
source of truth for how the two computers share the work.*

---

## The decision, in one picture

| | ASUS ROG (Windows, 16 GB) | MacBook Air (8 GB) |
|---|---|---|
| **Role** | The engine room — always home, always on | Your screen and your clicks |
| **Holds** | THE database (source of truth) · all scraping/enrichment engines · the scheduled pushes to app.bell.qa | The Portal in a browser tab · your `.command` shortcuts · Claude Code for talking to me |
| **When you leave home with the Mac** | Keeps scraping, enriching, pushing — nothing stops | You check app.bell.qa from anywhere, like any user |
| **When you restart the Mac** | Doesn't notice | Nothing lives on it anymore — restart freely |

**Why the database moves to the ROG:** you told me the Mac restarts and leaves the house.
The machine that never leaves home must own the truth. With ONE database on the always-home
machine there is **nothing to sync, ever** — that requirement ("no complications, no
coordination") is solved by architecture, not by clever sync code.

## Your three questions, answered

**"I need to pause it any time."**
The Portal's **Local Engines → Pause** button already does this. After the move you open
`http://bell-rog.local:3939` from the Mac's browser (or your phone, on home Wi-Fi) and press
Pause. One button, everything heavy stops; Resume starts it again.

**"Windows must keep working when the Mac is away, and sync when it's back."**
Better: there is nothing to sync. The ROG holds the only database and pushes to the live
site on a schedule. When you come home and open the Portal from the Mac, you are looking at
the same live truth the ROG has been building all day. The Mac never carries data again.

**"Where will the prompts be written? How do we coordinate new datapoints?"**
The engines need **no prompts** — they are code plus schedules, exactly like today's
always-on sweep. Prompts are only for NEW work, and that stays exactly today's flow: you
talk to Claude — on **either** machine, whichever is in front of you. Both machines carry
the same project folder from GitHub, and this folder carries `CLAUDE.md`, the rulebook —
so a Claude session on the ROG knows everything a session on the Mac knows. When you ask
for a new datapoint, Claude writes the migration into the repo, both machines pull it, and
the ROG's database applies it at boot. One repo + one database = zero coordination.

---

## Val's question, answered plainly: "does my daily work with Claude change?"

**No. Nothing about how we build changes.** Today you sit at the Mac, we look at the raw
JSON a source returned, we adjust a parser, we test on live data, we ship. After the move
you do EXACTLY the same, in the same chair, in the same Claude window — because everything
we look at together lives in **the database**, not in a machine, and the Mac reads that
database over your home Wi-Fi as if it were local. Claude on the Mac sees every payload,
every FireCrawl response, every engine's output, directly. **You never relay anything about
"the other machine"** — there is no "other machine's data"; there is one database and both
computers look at the same one.

The division of labour, stated once:

| Happens on the Mac (with you + Claude) | Happens on the ROG (invisible, automatic) |
|---|---|
| ALL platform building, parser fixes, new features, testing, deploys of code | Running the engines 24/7 (harvest, enrich, geocode, tender scans) |
| Your clicks: Preview/Apply commands, review queues, the Portal | Holding the database · pushing DATA to app.bell.qa on schedule |
| Talking to Claude (this window) | Nothing interactive — you open Claude there only on setup night |

**The one honest limitation:** when the Mac is away from home Wi-Fi, Claude on the Mac
cannot reach the database — so live-data development waits until you're home (viewing
app.bell.qa works from anywhere, and the ROG keeps working the whole time). If that ever
bothers you, a 10-minute add-on called Tailscale gives the Mac a private, encrypted tunnel
home from anywhere — optional, any time, not needed to start.

## The phases

### Phase 1 — you prepare the ROG (~30 minutes, no Claude needed)
Install these five things on the Windows laptop, in order, all defaults:

1. **Node.js LTS** — https://nodejs.org (green button)
2. **Git** — https://git-scm.com/download/win
3. **PostgreSQL 16** — https://www.postgresql.org/download/windows/ → "Download the installer".
   ⚠️ It asks you to invent a password during install — write it down, we need it once.
4. **Google Chrome** — https://google.com/chrome (the engines render pages with it)
5. **Claude Code for Windows** — https://claude.com/claude-code

Then two Windows settings (Start → search "power"):
- **Power & sleep** → when plugged in, sleep = **Never**
- **Lid close action** (search "lid") → when plugged in → **Do nothing**

Keep the ROG plugged in, on your home Wi-Fi.

### Phase 2 — the move night (you + Claude together, ~1 evening)
1. On the ROG, open Claude Code and say: *"Set up the Bell worker — read
   'Bell — Two-Machine Plan' in the repo."* Claude clones the repo and prepares everything.
2. On the Mac, double-click **Export Database for Windows.command** — it writes one backup
   file to your Desktop and tells you its size. This file is also your safety copy; it
   stays on the Mac.
3. Move the file to the ROG (AirDrop won't work to Windows — a USB stick or a shared
   folder; Claude on the ROG walks you through importing it).
4. Claude verifies the counts match on both machines, side by side, before anything flips.
5. The Mac's Portal shortcut and `.command` files get repointed at the ROG — your clicks
   all keep working from the Mac whenever you're home.

**Safety:** the Mac keeps the full backup file, and app.bell.qa remains a complete third
copy of all mirrored data. Nothing about this move can lose data — worst case we point
everything back at the Mac.

### Phase 3 — Claude schedules the 24/7 work on the ROG
The always-on sweep (higher speed — 16 GB allows ~3–4× today's concurrency), the nightly
sweep with the automatic chain-linking, daily tender scans across all four sources, the
scheduled data pushes to app.bell.qa, and the Sunday self-report email. All Windows Task
Scheduler entries Claude creates; you never touch them.

### Phase 4 — new muscles (designed properly, later)
Social-media monitoring of businesses (honest note: Instagram/Facebook/LinkedIn block
scraping and forbid it in their terms — what's safely buildable is public business pages
discovered from company websites, Google reviews via the existing paid channel, and public
X/Twitter pages; this gets the full adversarial design treatment before it's built),
email-verification hunting, deeper directory rescans.

---

## Rules that never change, whichever machine

- The 100%-verified bar, Rule 2.1 (never guess), Preview → Apply for anything destructive.
- Only the machine that OWNS the database pushes to production (after the move: the ROG).
- `CLAUDE.md` in this folder is the contract for every Claude session on every machine.
