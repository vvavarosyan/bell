# Bell — "0 Risk Agreement" Design & Plan
### A revenue-share offering for cash-poor companies that desperately need clients

*Captured from Val's spec (2026-06-30). Decisions locked: **same Bell login in a "0 Risk mode"** on `0risk.bell.qa` · **reuse + extend the existing ICP/company-profile builder** · **admin prepares the 100-company list manually in v1** · **track deals + enforce request limits only** (the signed agreement is the legal enforcement; no payment plumbing yet).*

---

## 1. The model

A company that can't or won't pay a Bell subscription, but urgently needs customers, signs a **strict revenue-share agreement** instead. Bell hands them a small, deeply-researched list of perfect-fit prospects. If they close any of those prospects, they owe Bell an agreed **% of the revenue**. The signed + stamped agreement (plus CR/QID) is the legal teeth: cheat, and Bell pursues it in court.

Bell's leverage: it gives away *targeted* pipeline (not generic lists), takes **zero upfront cash**, and converts the best performers into paid customers. The control levers are: a hard approval gate, tiny initial allotments, and request limits that only loosen as the company actually closes deals.

---

## 2. Architecture (reuses what Bell already has)

- **One codebase, new surface.** `0risk.bell.qa` is a new front-end surface of the same Bell codebase (alongside `app.bell.qa` / `admin.bell.qa`), selected by a surface flag. It renders the 0 Risk portal only. (Per Bell's one-codebase / multi-deployment doctrine.)
- **Same identity (Clerk), distinct account type.** A tenant carries `account_type ∈ {zero_risk, paid, …}`. A 0 Risk user signs up normally but lands in 0 Risk mode. **Switching to paid = flip `account_type`** and unlock `app.bell.qa`; all their data (profile, ICP, CRM, lists) carries over. No migration, no second login.
- **Same multi-tenant DB + isolation.** Every new table is `tenant_id`-scoped from day one (per Bell's tenancy doctrine + the authz review). 0 Risk tenants simply can't see canonical mutation / paid-only features (capability gating already exists).
- **Reuse the ICP builder.** The existing per-tenant ICP/company profile (`/api/icp`, Settings UI, migrations 050/051) becomes the core of the 0 Risk intake — extended with the deeper fields the spec calls for (existing customers, services catalog, pricing). The same ICP later powers their paid account and feeds Bell's matching.
- **Reuse enrichment for dossiers.** The per-company "deep dossier" (financials, tech stack, partners, strengths/weaknesses, how-to-approach) is assembled from Bell's existing enrichment/research outputs — manually curated by admin in v1.

---

## 3. The user journey

1. **Marketing page** (on `bell.qa` marketing site): one page — what 0 Risk is, who it's for, how it works, the honest deal (revenue share, no upfront cost), eligibility (CR/QID/agreement), and a CTA → sign up.
2. **Sign up → 0 Risk onboarding** at `0risk.bell.qa` (same Clerk auth, `account_type=zero_risk`, status `onboarding`).
3. **Profile + ICP** (reused builder, extended): company details, **existing customers, ICP, services, pricing**, and as much detail as possible. A completeness meter drives toward **100%**.
4. **Eligibility documents + agreement**: upload **CR, company documentation, QID**; then the system presents the **Bell ↔ company agreement**. User downloads it, **signs + stamps** (physical Qatar stamp), and **uploads the signed+stamped copy**. Status → `pending_approval`.
5. **Admin approval** (admin surface): admin reviews profile completeness + documents + signed agreement → **approve (green light)** or request fixes. Status → `approved`.
6. **Request 1st list**: approved user requests their first list (**100 companies**, perfect-ICP-match, each with a deep dossier). Request enters a **pending** queue; **admin prepares** and delivers it.
7. **Work the list + report deals**: user sees the 100 dossiers, and from the dashboard **logs the status of each deal** (e.g., contacted → negotiating → won/lost). **Only admin marks a deal *finalized*.**
8. **Earn more**: request limits unlock based on **finalized deals** (see §5). Admin can bump a strong performer to 500 or thousands per request.
9. **Switch to paid** anytime → becomes a normal Bell customer; 0 Risk history preserved.

---

## 4. Data model (new tables, all `tenant_id`-scoped)

- `tenants.account_type` + `tenants.zero_risk_status` (`onboarding | pending_approval | approved | suspended`).
- **`zero_risk_profiles`** — the extended intake beyond ICP: existing_customers, services[], pricing model, free-form "everything about the company". (ICP itself stays in the existing ICP tables.)
- **`zero_risk_documents`** — `(tenant_id, kind: cr|qid|company_doc|signed_agreement, file_ref, status, uploaded_at, reviewed_by, reviewed_at)`.
- **`zero_risk_agreements`** — `(tenant_id, version, revenue_share_pct, jurisdiction, terms_ref, signed_doc_ref, status, approved_by, approved_at)`.
- **`list_requests`** — `(tenant_id, seq, size, status: pending|preparing|delivered|rejected, requested_at, delivered_at, prepared_by, note)`.
- **`list_request_items`** — the delivered companies per request `(list_request_id, company_id, dossier jsonb)` — dossier curated from Bell enrichment.
- **`zero_risk_deals`** — `(tenant_id, list_request_id, company_id, user_status, admin_status: open|finalized_won|finalized_lost, revenue_amount?, finalized_by, finalized_at)`.
- **`zero_risk_limits`** — `(tenant_id, companies_per_request default 100, lists_allowed, finalized_won_count, updated_by, updated_at)` — admin-controlled.

---

## 5. Control logic (the guardrails)

- **Approval gate**: cannot request any list until `zero_risk_status = approved` (profile 100% + all docs + signed agreement accepted).
- **One list at a time**: cannot request a new list while one is `pending`/`preparing`/undelivered.
- **Earn-to-request**: after the first list, a new request is **blocked until ≥1 deal from the prior list is *admin-finalized as won***, unless admin has granted extra allowance. Default increment: 1 finalized win → +1 list of 100.
- **Admin tiering**: admin can raise `companies_per_request` (100 → 500 → thousands) and `lists_allowed` per tenant based on performance. All limit changes are audited.
- **Admin-only finalization**: users *report* deal progress; only admin flips a deal to finalized (and records revenue), which is what moves limits and (later) revenue-share owed.

---

## 6. Admin surfaces (local Portal / admin.bell.qa)

- **Approvals queue**: pending 0 Risk accounts → review profile + CR/QID/company docs + signed agreement → approve / request changes.
- **List preparation**: pending list requests → assemble the 100 dossiers from Bell's DB + enrichment → deliver. (v1 manual; later semi-automated via ICP match + Bella.)
- **Deal finalization**: per-tenant deal board → mark won/lost + revenue → auto-adjust limits.
- **Limit control**: per-tenant allowance overrides + audit.

---

## 7. Legal / PDPPL (lawyer-gated — do not ship wording without counsel)

- The **agreement text** (revenue-share %, enforcement, jurisdiction, indemnity, what counts as a "closed deal," audit rights) must be **drafted/blessed by the lawyer**. Build the flow; keep the wording behind counsel sign-off (same posture as the self-marketing legal brief).
- **Dossiers are company-level** (firmographics, financials, tech, partners) = lower PDPPL risk. The "**how to approach / what to say**" content must **not** expose or target a named individual's personal data beyond what's lawful — keep person-level details lawyer-gated, consistent with Bell's PDPPL doctrine.
- Store CR/QID/signed docs securely, tenant-scoped, access-audited.

---

## 8. Phased build plan

- **Phase 0 — Foundation**: `account_type` + `zero_risk_status` on tenants; the `0risk.bell.qa` surface scaffold + routing; Clerk signup → 0 Risk onboarding shell.
- **Phase 1 — Onboarding + approval gate** *(the shippable core)*: marketing page; signup; profile/ICP (reuse + extend) with completeness meter; document upload (CR/QID/company docs); agreement present → upload signed+stamped → submit; **admin approvals queue → green light**.
- **Phase 2 — List engine v1**: list request → pending; **admin list-preparation surface** → deliver; user list view with dossiers; **request-limit gating** (approval + one-at-a-time + earn-to-request).
- **Phase 3 — Deals + limits**: user deal-status reporting; **admin finalization**; auto limit adjustment + admin tiering overrides.
- **Phase 4 — Switch-to-paid + polish**: account-type switch flow into `app.bell.qa`; then later — revenue-share invoicing (Stripe), and semi-automated list generation via ICP match + Bella.

**Recommended start:** Phase 0 + Phase 1 together (foundation + the full onboarding→approval gate). It's the smallest slice that's demoable end-to-end and unblocks real sign-ups, with no legal-money exposure beyond the (lawyer-gated) agreement wording.

---

## 9. Still open (not blockers for Phase 1)
- Exact **revenue-share %** + whether it's fixed or per-agreement (needed for the agreement + later invoicing).
- **Agreement wording** → lawyer.
- Whether the marketing page is one new page in the existing marketing site (assumed yes).
- Dossier template — the exact fields/sections for the per-company deep profile (can finalize when we build Phase 2).
