-- Outreach compliance spine: consent ledger + one-click unsubscribe tokens.
--
-- Qatar's PDPPL (Art 22) requires (a) prior consent for electronic direct marketing to an
-- individual, recorded with EVIDENCE incl. a timestamp, and (b) a working opt-out in every
-- message. This is the durable record of both. Bell's self-marketing runs on Val's explicit
-- instruction pending legal review (2026-07-17); this ledger is exactly what makes that
-- reviewable — every send can point at the basis that authorised it, and every unsubscribe
-- is honoured and provable.
--
-- outreach_consent is APPEND-ONLY (like the proof-of-search ledger): never UPDATE, never
-- DELETE. Consent state = the latest row for an email. LOCAL-only truth that also feeds
-- email_suppression on withdrawal (via the existing addSuppression()).

CREATE TABLE IF NOT EXISTS outreach_consent (
  id             bigserial PRIMARY KEY,
  email          text   NOT NULL,                 -- stored lowercased
  company_id     bigint,
  action         text   NOT NULL CHECK (action IN ('granted','withdrawn')),
  basis          text   NOT NULL CHECK (basis IN ('web_form','reply_optin','account_signup','import_documented','founder_instruction')),
  form_version   text,                             -- which opt-in wording/version was shown
  wording_shown  text,                             -- the exact consent text the person saw
  notice_version text,                             -- privacy-notice version in force
  ip             text,
  user_agent     text,
  evidence       jsonb  NOT NULL DEFAULT '{}'::jsonb,   -- packRaw'd; never JSON.stringify().slice()
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outreach_consent_email_idx ON outreach_consent (lower(email), created_at DESC);

-- One-click unsubscribe tokens (RFC 8058). Each outreach send carries a unique token in its
-- List-Unsubscribe header; hitting it withdraws consent + suppresses the address. Opaque, so
-- the link reveals nothing and can't be guessed.
CREATE TABLE IF NOT EXISTS outreach_optout_tokens (
  token        text PRIMARY KEY,                   -- 32-byte url-safe random
  email        text NOT NULL,                      -- stored lowercased
  company_id   bigint,
  campaign_id  bigint,
  crm_email_id bigint,
  created_at   timestamptz NOT NULL DEFAULT now(),
  used_at      timestamptz
);
CREATE INDEX IF NOT EXISTS outreach_optout_email_idx ON outreach_optout_tokens (lower(email));
