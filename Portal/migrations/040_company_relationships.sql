-- 040_company_relationships.sql
-- Local Engine 3 — Network Mapper. Stores the partner / client / affiliate /
-- parent / subsidiary / competitor edges discovered between companies, fully
-- locally ($0, no Apify/Firecrawl).
--
-- An edge always has a source company (a real row in `companies`). The TARGET is
-- one of three things, in priority order:
--   • target_company_id    → the related entity already exists in Bell, OR it was
--                             a CONFIRMED-Qatar discovery that auto-entered.
--   • target_candidate_id  → the related entity is non-Qatar (International) or
--                             uncertain (pending admin approval) and therefore
--                             lives ONLY in research_candidates, never in Bell.
--   • neither               → unresolved (we only have a name / domain string).
-- target_name is ALWAYS stored so the edge renders even when unresolved.
--
-- country_status records why the target was routed where it was, so the admin
-- can see at a glance which edges point at confirmed-Qatar companies vs the
-- holding pen. Relationship edges are safe metadata; the only human gate that
-- affects what Bell SHOWS is the company itself (uncertain → pending approval in
-- the existing Approvals queue).

BEGIN;

CREATE TABLE IF NOT EXISTS company_relationships (
  id                  bigserial PRIMARY KEY,
  source_company_id   bigint NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  target_company_id   bigint REFERENCES companies(id) ON DELETE CASCADE,
  target_candidate_id bigint REFERENCES research_candidates(id) ON DELETE SET NULL,
  target_name         text   NOT NULL,
  target_domain       text,
  relation_type       text   NOT NULL
                        CHECK (relation_type IN
                          ('partner','client','affiliate','parent','subsidiary','competitor')),
  discovered_via      text,   -- 'website' | 'web_search' | 'internal_industry'
  source_url          text,   -- the exact page the edge was found on (provenance)
  confidence          text,   -- 'high' | 'medium' | 'low'
  country_status      text,   -- 'qatar' | 'non_qatar' | 'uncertain' | 'existing'
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

-- One edge per (source, relation_type, target-name). Idempotent re-runs upsert
-- rather than duplicate. Name is normalised (lower+trim) for the key.
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_relationships_edge
  ON company_relationships (source_company_id, relation_type, lower(btrim(target_name)));

CREATE INDEX IF NOT EXISTS idx_company_relationships_source ON company_relationships (source_company_id);
CREATE INDEX IF NOT EXISTS idx_company_relationships_target ON company_relationships (target_company_id) WHERE target_company_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_relationships_cand   ON company_relationships (target_candidate_id) WHERE target_candidate_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_relationships_type   ON company_relationships (relation_type);

-- Stage-9 sweep tracking on companies, mirroring stage7/stage8.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stage9_status text;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS stage9_at     timestamptz;
CREATE INDEX IF NOT EXISTS idx_companies_stage9_at ON companies (stage9_at);

INSERT INTO schema_migrations (version) VALUES ('0040') ON CONFLICT DO NOTHING;

COMMIT;
