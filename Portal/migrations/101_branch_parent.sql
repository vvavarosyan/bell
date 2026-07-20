-- 101_branch_parent.sql
-- Parent–branch link (Val 2026-07-20). One real operator was fragmented into
-- many empty "branch" shells (DOC = 5 rows; MoPH = ~4,099 shells). This adds the
-- link so a facility can point to its parent operator. Populated only via the
-- reviewed "Apply Branch Model.command" — never automatically (record merges are
-- exact-or-review). Soft ref (no FK): the referenced company syncs by id.
ALTER TABLE companies ADD COLUMN IF NOT EXISTS parent_company_id bigint;
CREATE INDEX IF NOT EXISTS idx_companies_parent ON companies (parent_company_id) WHERE parent_company_id IS NOT NULL;
