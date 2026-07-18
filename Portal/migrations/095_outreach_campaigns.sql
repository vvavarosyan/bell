-- Outreach engine: campaigns, A/B arms, and the per-company target queue.
--
-- This is Bell marketing ITSELF to Qatar (admin/tenant-1 only — NOT a customer feature).
-- Runs on Val's explicit instruction pending legal review (2026-07-17). Every send is
-- gated behind BDI_OUTREACH_ENABLED (default OFF) AND goes through the isolated go.bell.qa
-- channel, carries a working one-click unsubscribe (migration 094), respects the global
-- suppression list, and is confined to Qatar working hours with a warmup ramp.
--
-- LOCAL truth lives on prod (like the CRM) — tenant-scoped to the platform tenant. NOT part
-- of the id-mirror sync (these tables are prod-owned operational state, not canonical data).

BEGIN;

-- A campaign = one self-marketing push with a goal, a target tier, a language mode, and its
-- own sending governor (daily cap + warmup). Paused/draft campaigns never send.
CREATE TABLE IF NOT EXISTS outreach_campaigns (
  id            bigserial PRIMARY KEY,
  name          text NOT NULL,
  status        text NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','active','paused','done')),
  goal          text,                                   -- freeform: what this push is for
  audience_tier text NOT NULL DEFAULT 'role_mailbox'    -- which address tier to target
                  CHECK (audience_tier IN ('role_mailbox','named_person','unclassified','all')),
  lang_mode     text NOT NULL DEFAULT 'en'              -- 'en' | 'ar' | 'bilingual'
                  CHECK (lang_mode IN ('en','ar','bilingual')),
  daily_cap     int  NOT NULL DEFAULT 30,               -- hard ceiling of sends/Qatar-day
  warmup_start  int  NOT NULL DEFAULT 8,                -- day-1 cap; ramps toward daily_cap
  warmup_step   int  NOT NULL DEFAULT 6,                -- +N sends allowed each successive day
  from_name     text NOT NULL DEFAULT 'Bell',
  reply_to      text,                                    -- where replies should land (a real inbox)
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  activated_at  timestamptz                              -- first moment it went active (warmup day 0)
);

-- A/B arms: different approaches/angles within a campaign. The engine records which arm sent
-- each email so we can learn what converts (bandit selection comes later — for now weight-based).
CREATE TABLE IF NOT EXISTS outreach_arms (
  id           bigserial PRIMARY KEY,
  campaign_id  bigint NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
  key          text NOT NULL,                           -- short label: 'tenders-angle', 'signals-angle'
  angle        text NOT NULL,                           -- the instruction handed to the composer
  weight       int  NOT NULL DEFAULT 1,
  is_active    boolean NOT NULL DEFAULT true,
  sent         int  NOT NULL DEFAULT 0,
  replied      int  NOT NULL DEFAULT 0,
  positive     int  NOT NULL DEFAULT 0,                  -- replies judged interested
  unsubscribed int  NOT NULL DEFAULT 0,
  bounced      int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, key)
);

-- The queue: one row per (campaign, company, address) we intend to contact. Materialized by
-- the targeting query; walked by the engine. status is the lifecycle.
CREATE TABLE IF NOT EXISTS outreach_targets (
  id            bigserial PRIMARY KEY,
  campaign_id   bigint NOT NULL REFERENCES outreach_campaigns(id) ON DELETE CASCADE,
  company_id    bigint,
  company_name  text,
  email         text NOT NULL,                          -- stored lowercased
  address_class text,                                    -- role_mailbox | named_person | unclassified
  lang          text NOT NULL DEFAULT 'en',
  arm_id        bigint REFERENCES outreach_arms(id) ON DELETE SET NULL,
  status        text NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','drafted','skipped','sent','replied','bounced','unsubscribed','failed')),
  skip_reason   text,                                    -- why 'skipped' (suppressed/no_consent/duplicate/…)
  subject       text,
  body_html     text,
  body_text     text,
  crm_email_id  bigint,                                  -- link to the crm_emails row actually sent
  optout_token  text,
  scheduled_at  timestamptz,
  sent_at       timestamptz,
  replied_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, email)                            -- never queue the same address twice per campaign
);
CREATE INDEX IF NOT EXISTS outreach_targets_campaign_status_idx ON outreach_targets (campaign_id, status);
CREATE INDEX IF NOT EXISTS outreach_targets_email_idx ON outreach_targets (lower(email));

INSERT INTO schema_migrations (version) VALUES ('0095') ON CONFLICT DO NOTHING;

COMMIT;
