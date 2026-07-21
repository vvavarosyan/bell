-- 104 — address verdicts: a durable, reversible record of WHO owns a mailbox.
--
-- Bell classifies every company email into role_mailbox (a generic company inbox — the only
-- tier it cold-emails), named_person (personal data, PDPPL Art 22) or unclassified ("we
-- cannot tell"). ~6,300 rows sit in unclassified. Val's rule is that nothing stays parked,
-- but Rule 2.1 forbids guessing, and guessing wrong here means emailing a natural person.
--
-- So the unresolvable middle gets a HUMAN decision, recorded once, per ADDRESS (not per
-- company-address pair — otherwise the same mailbox can be a person on one company and a
-- role inbox on another, which is how marco@qatar.net.qa ended up with a split verdict).
--
-- Auto rules may write here too, but only ones that survived adversarial review, and Val's
-- verdict always outranks them: the auto pass skips any row with decided_by = 'val'.

CREATE TABLE IF NOT EXISTS address_verdicts (
  id           bigserial PRIMARY KEY,
  email        text        NOT NULL UNIQUE,
  verdict      text        NOT NULL CHECK (verdict IN
                 ('role_mailbox','named_person','not_a_company_address','left_unresolved')),
  decided_by   text        NOT NULL,          -- 'val' | 'auto:<rule>'
  suggested    text,                          -- what the machine proposed, kept even when overridden
  rule_id      text,                          -- 'A1' 'A3' 'P1'…'P5'
  evidence     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  note         text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS address_verdicts_email_idx ON address_verdicts (lower(email));
CREATE INDEX IF NOT EXISTS address_verdicts_updated_idx ON address_verdicts (updated_at);

-- Outreach may only ever be aimed at a tier Bell can defend. 'unclassified' and 'all' were
-- both accepted by the 095 CHECK and offered in the campaign form, and targeting.js read
-- `if (tier !== 'all' && ...)` — so an 'all' campaign mailed EVERY tier including the 6,300
-- addresses Bell explicitly cannot vouch for. The engine now refuses those tiers outright;
-- this stops a new campaign row from being created on one in the first place.
--
-- NOT VALID on purpose: production already holds the live "Bella outreach" campaign row, and
-- a validating constraint that failed would abort the migration and take the Portal down at
-- boot. NOT VALID leaves existing rows untouched and enforces on every INSERT/UPDATE.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'outreach_campaigns')
     AND NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'outreach_campaigns_sendable_tier_ck')
  THEN
    ALTER TABLE outreach_campaigns
      ADD CONSTRAINT outreach_campaigns_sendable_tier_ck
      CHECK (audience_tier IN ('role_mailbox','named_person')) NOT VALID;
  END IF;
END $$;
