-- 067 — "0 Risk Agreement" offering, Phase 0 data model.
--
-- A 0 Risk company uses the SAME Bell login in a "0 Risk mode" (account_type),
-- served on 0risk.bell.qa. Its ICP/company profile REUSES tenant_profile
-- (migrations 050/051), extended below. Everything is tenant_id-scoped (Bell
-- tenancy doctrine). Uploaded legal scans are stored inline in Postgres for v1
-- (small CR/QID/agreement files); object storage is a later upgrade.

BEGIN;

-- --- account type + 0 Risk lifecycle on the tenant -------------------------
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS account_type     text NOT NULL DEFAULT 'standard';  -- 'standard' | 'zero_risk'
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS zero_risk_status text;  -- NULL | 'onboarding' | 'pending_approval' | 'approved' | 'suspended'
CREATE INDEX IF NOT EXISTS idx_tenants_account_type ON tenants (account_type) WHERE account_type <> 'standard';

-- --- reuse + extend the ICP/company profile for the 0 Risk intake ----------
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS company_overview       text;   -- "everything about the company"
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS existing_customers     text;   -- who they sell to today (names/examples)
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS services_offered       jsonb NOT NULL DEFAULT '[]'::jsonb;  -- services catalogue
ALTER TABLE tenant_profile ADD COLUMN IF NOT EXISTS zero_risk_completed_at timestamptz;  -- when the profile hit 100%

-- --- uploaded eligibility documents (CR / QID / company docs / signed) ------
CREATE TABLE IF NOT EXISTS zero_risk_documents (
  id          bigserial PRIMARY KEY,
  tenant_id   bigint NOT NULL,
  kind        text   NOT NULL,                       -- 'cr' | 'qid' | 'company_doc' | 'signed_agreement'
  filename    text,
  mime_type   text,
  byte_size   integer,
  content     bytea,                                 -- inline storage for v1
  status      text   NOT NULL DEFAULT 'submitted',   -- 'submitted' | 'accepted' | 'rejected'
  note        text,
  uploaded_by text,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by text,
  reviewed_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_zr_documents_tenant ON zero_risk_documents (tenant_id, kind);

-- --- the agreement instance for a tenant (the 15% revenue-share contract) ---
CREATE TABLE IF NOT EXISTS zero_risk_agreements (
  id                 bigserial PRIMARY KEY,
  tenant_id          bigint  NOT NULL,
  version            text    NOT NULL DEFAULT 'v1-draft',
  revenue_share_pct  numeric NOT NULL DEFAULT 15,
  jurisdiction       text    NOT NULL DEFAULT 'State of Qatar',
  status             text    NOT NULL DEFAULT 'presented',  -- 'presented' | 'submitted' | 'approved' | 'rejected'
  signed_document_id bigint,                                -- → zero_risk_documents.id (signed+stamped upload)
  presented_at       timestamptz NOT NULL DEFAULT now(),
  submitted_at       timestamptz,
  approved_by        text,
  approved_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_zr_agreements_tenant ON zero_risk_agreements (tenant_id);

-- --- per-tenant request allowance (admin-controlled) -----------------------
CREATE TABLE IF NOT EXISTS zero_risk_limits (
  tenant_id             bigint PRIMARY KEY,
  companies_per_request integer NOT NULL DEFAULT 100,
  lists_allowed         integer NOT NULL DEFAULT 1,    -- list requests they may make right now
  finalized_won_count   integer NOT NULL DEFAULT 0,
  updated_by            text,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- --- list requests (pending → admin prepares → delivered) ------------------
CREATE TABLE IF NOT EXISTS zero_risk_list_requests (
  id           bigserial PRIMARY KEY,
  tenant_id    bigint  NOT NULL,
  seq          integer NOT NULL,                       -- 1st, 2nd, … request for this tenant
  size         integer NOT NULL DEFAULT 100,
  status       text    NOT NULL DEFAULT 'pending',     -- 'pending' | 'preparing' | 'delivered' | 'rejected'
  note         text,
  requested_by text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  prepared_by  text,
  delivered_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_zr_list_requests_tenant ON zero_risk_list_requests (tenant_id, seq DESC);
CREATE INDEX IF NOT EXISTS idx_zr_list_requests_queue  ON zero_risk_list_requests (status) WHERE status IN ('pending','preparing');

-- --- companies delivered in a list, each with its deep dossier -------------
CREATE TABLE IF NOT EXISTS zero_risk_list_items (
  id         bigserial PRIMARY KEY,
  request_id bigint NOT NULL,
  tenant_id  bigint NOT NULL,
  company_id bigint,                                   -- → companies.id (Bell canonical)
  dossier    jsonb  NOT NULL DEFAULT '{}'::jsonb,      -- financials, tech stack, partners, approach, …
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_zr_list_items_request ON zero_risk_list_items (request_id);
CREATE INDEX IF NOT EXISTS idx_zr_list_items_tenant  ON zero_risk_list_items (tenant_id);

-- --- deals the user reports; ONLY admin finalizes --------------------------
CREATE TABLE IF NOT EXISTS zero_risk_deals (
  id             bigserial PRIMARY KEY,
  tenant_id      bigint NOT NULL,
  request_id     bigint,
  company_id     bigint,
  user_status    text NOT NULL DEFAULT 'contacted',    -- 'contacted'|'negotiating'|'won'|'lost' (user-reported)
  admin_status   text NOT NULL DEFAULT 'open',         -- 'open'|'finalized_won'|'finalized_lost' (admin only)
  revenue_amount numeric,
  currency       text DEFAULT 'QAR',
  note           text,
  reported_by    text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  finalized_by   text,
  finalized_at   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_zr_deals_tenant   ON zero_risk_deals (tenant_id);
CREATE INDEX IF NOT EXISTS idx_zr_deals_finalize ON zero_risk_deals (admin_status);

COMMIT;
