# Bell — Bella Plan (Phase G)
*Prepared 2026-07-03 · from your locked Bella spec (2026-06-20 + Round-2 2026-07-02) and a code-level verification of every surface named below. Nothing here is built yet — this is the plan to approve. Build order you locked: **portal chat → marketing → voice**; Admin Bella later.*

## 1. The locked commitments (binding, restated)

| # | Commitment | How it's enforced |
|---|---|---|
| 1 | **Marketing Bella = zero DB access** | By construction: her code path imports no db module. Knowledge = a static content pack built from published marketing content. Public + rate-limited + no user context. |
| 2 | **Portal Bella sees exactly what the user sees** | She only calls the same per-tenant APIs the browser calls, server-side, under that user's own auth. Tenant isolation, reveal masking, People lockdown, credit checks all apply — enforced by the authorization layer, not by trusting the model. |
| 3 | **History is individual** | Conversations stored per tenant + user; each model request contains only that user's thread + that user's tool results. |
| 4 | **Everything audited** | Every tool call logged with actor = the user; approval gates before mutations/credit spend; per-tenant budgets. |

Prerequisite check: the authz deep-review (2026-06-22) found tenant isolation sound, zero high findings — **the load-bearing dependency for an agentic Bella is met**.

## 2. Where the code stands (all verified in the repo today)

| Surface | State | Bella reuses it |
|---|---|---|
| Anthropic calls | `news/enrich.js` already calls the API via plain fetch with `getKey('anthropic')` → **BDI_KEY_ANTHROPIC, already live on portal + admin services** | Same key, same call pattern, streaming added |
| Streaming | **No SSE anywhere in the app today** — everything polls | New build in G1 (chat must stream to feel fast) |
| Header | `page-header` renders on every page (title left; credit pill + notification bell right) — center is free | Bella dock goes header-center: icon + Chat + Voice |
| Settings | AccountTab has 8 sections (Profile, WhatsApp, Company & ICP, Email, Sending domain, Notifications, Preferences, Security) | "Bella" becomes the 9th section |
| Auth | `api.js` sends the Clerk bearer token; routers mount as `feature` / `adminOnly` / public (`/api/public/news`, `/api/whatsapp-webhook` precedents) | `/api/bella` = feature-gated; `/api/public/bella` = public + rate-limited |
| Tool layer | `revealOne/revealBulk/adminAdjust` (lib/credits.js), CRM + `logActivity` (lib/crm.js), sequences engine w/ 60s tick (crm/sequences.js), `createNotification` (lib/notifications.js), ICP routes, signals, feed | These ARE Bella's hands — thin tool wrappers, no new business logic |
| People lockdown | Customers get the locked shape from the same routes | Inherited automatically; Bella explains and pivots to Companies |
| Migrations | Latest = 071_whatsapp | Bella tables = **migration 072** |

## 3. Architecture — one brain, three faces

A new `server/bella/` module: **brain** (Anthropic streaming + tool loop), **tool registry**, **conversation store**, **budget guard**. The same engine serves all three Bellas; what differs is the tool allowlist, the knowledge, and the auth context.

**Tool registry principles.** The model never sees SQL, keys, or raw tables — only named tools. Every tool is a thin wrapper over the exact lib functions/route logic the UI uses, executed under the requesting user's tenant + role. Unrevealed contacts stay masked in tool results. Every call is written to `bella_actions` with actor = the user. Per-user allowlist = role + the Settings toggles.

**Approval gates.** Bella proposes a plan (numbered steps + credit cost preview as an inline card) → user approves in chat → she executes and narrates. Reads never need approval. Mutations and credit spend always do, unless the user flips the Settings no-approval toggle — and even then external sends and deletes show a confirm, and daily caps still apply (D5).

**Speed (your "super fast" requirement).** Three levers: SSE token streaming (first words in ~1s), Anthropic **prompt caching** on the big system+tools prompt (~90% input-cost discount and faster turnaround on every turn after the first), and parallel tool calls. No queue, no polling.

**Models + live pricing (checked 2026-07-03).** Portal Bella runs **claude-sonnet-5** ($3/$15 per MTok; intro $2/$10 through Aug 2026) — Val's final call 2026-07-03; **Bella must never use Fable-5 or Opus-class models** (5–10× the cost). News rewriting stays on Haiku 4.5 ($1/$5) in news/enrich.js; Marketing Bella → Haiku 4.5. No silent model switching; `BDI_BELLA_MODEL` env override is the only escape hatch (no-deploy). ⚠️ 5-class models reject `temperature` (HTTP 400) — Bella never sends it. Prompt caching cuts the recurring system+tools input ~90%.

**New tables (migration 072, all tenant-scoped day-one, prod-runtime, not mirrored):** `bella_conversations`, `bella_messages`, `bella_actions` (audit), `bella_tasks` (scheduled/overnight work), `bella_usage` (per-tenant per-day tokens + spend, enforces caps).

**Safety extras:** global + per-tenant Bella kill switch; tool results treated as data (content from news/emails can't issue instructions — approval gates are the backstop); public endpoint rate-limited per IP.

## 4. The build — sub-phases (one deploy at the end of each)

### G1 — Portal Bella: chat + foundation (the big lift)
- `/api/bella` (feature-gated): SSE chat, per-user conversation list, tool loop, audit, budget guard.
- **Read + navigate tools v1:** search/filter companies + jobs, open a company (drawer), feed + signals + stats queries, credits balance, ICP read, settings read, "go to section X".
- **UI:** header-center dock (icon + Chat/Voice buttons; Voice shows "coming soon" until G4) + dropdown chat box from header center, above everything; streaming text; approval-card component (built now, exercised in G2).
- **Settings → Bella (9th section):** comms style (tone + email-writing preferences), per-capability permission ticks, approval mode, daily caps, link to her action log.
- Where: app.bell.qa + admin.bell.qa portal UI; no new env vars (BDI_KEY_ANTHROPIC already set).

### G2 — Act-on-behalf (the wow)
- **Action tools:** reveal (existing credit system, cost preview first), CRM add/notes/tasks/deals, email draft + send via own-domain outreach, sequence create + enroll, ICP update, settings changes, WhatsApp thread read + gated send. Research start stays **disabled** until Research completion (your F2 call). Team ops = owner-only.
- Your flagship flow works end-to-end: *"find companies matching my ICP → reveal 200 → CRM → personalized emails → sequences → track replies"* — with the credit cost shown before spend.
- **Overnight work:** "have this ready by morning" → `bella_tasks` + a 60s in-process tick (same pattern as the sequences scheduler) → completion lands as a notification (existing bell).

### G3 — Marketing Bella (bell.qa)
- **Content pack:** a build script compiles the marketing site's pages, docs/FAQ, llms.txt, pricing + canonical numbers into a static JSON shipped with the portal (`server/bella/knowledge/`); refreshed by a "Rebuild Bella Marketing Pack.command" whenever marketing copy changes.
- `/api/public/bella`: public, rate-limited, **imports no db module** (verified at review via the import graph). Haiku-powered salesperson persona.
- **Widget:** round Bella icon bottom-right (marketing layout.tsx); chat panel; she **navigates the site** (router push + scroll to section) and **highlights the exact area she's explaining** via `data-bella` anchors + a temporary glow class.

### G4 — Voice (ElevenLabs; you add BDI_KEY_ELEVENLABS at this kickoff)
- **Recommendation:** ElevenLabs **Agents** (managed conversational layer — they solve turn-taking, barge-in, echo; ≈$0.08–0.10/min + LLM pass-through) wired to **our** Bella brain as the custom LLM, so tools/approvals/audit stay identical to chat. Fallback architecture if cost bites later: roll-own pipeline (Scribe realtime STT $0.39/hr + Flash TTS streaming) — swap without touching the brain.
- **UI:** Voice button live; whole-portal **night-blue edge glow** while listening; speak-back; switch chat ↔ voice mid-conversation (shared thread). Marketing gets voice here too if D4 says so.

### G5 — Admin Bella: later, per your call.

## 5. Running cost picture (estimates, capped by design)

| What | ≈ Cost |
|---|---|
| Portal chat turn (Sonnet 5, cached) | ≈$0.01–0.03 → heavy user ≈ $5–15/mo (per-plan caps contain it) |
| Marketing chat turn (Haiku) | ~$0.002 — rate limits keep abuse bounded |
| Voice | ≈$0.10/min managed (+LLM); 100 min ≈ $12–15 |
| Bella-triggered reveals/sends | Existing credit system — user's credits, previewed first |

`bella_usage` enforces per-tenant daily token budgets; the public endpoint is IP-rate-limited; admin sees all spend.

## 6. Decisions needed from Val

| # | Decision | My recommendation |
|---|---|---|
| D1 | Portal model | ✅ FINAL (Val 2026-07-03): **claude-sonnet-5**; news = Haiku 4.5; **never Fable-5/Opus for Bella**. Haiku stays the marketing brain. |
| D2 | Approval default | Ask-always for actions; reads free. Per-user no-approval toggle in Settings (your spec) with sends/deletes still confirming. |
| D3 | Voice languages | English at G4 launch; Arabic fast-follow (ElevenLabs + Claude both handle AR — needs its own QA pass). |
| D4 | Marketing Bella voice | Chat-only at G3; add voice after portal voice is proven (per-visitor minutes are the one cost you can't cap per-user). |
| D5 | Default daily caps | e.g. 300 chat turns + 500 Bella-spent credits per user/day, adjustable in Settings + admin override. |
| D6 | ElevenLabs plan | Pick plan/minutes at G4 kickoff when we know real usage; key = BDI_KEY_ELEVENLABS on Railway. |

*Doctrine holds throughout: Bella only speaks through the same authorization layer as the UI (tenant isolation, reveal masking, People lockdown, PDPPL); every action audited; canonical writes stay local; one deploy per sub-phase to both envs; everything Val touches is a Portal button, a Settings tick, or a Railway env var.*
