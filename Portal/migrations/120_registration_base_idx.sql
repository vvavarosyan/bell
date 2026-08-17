-- The base-CR lookup, indexed.
--
-- Three shipped queries resolve a stated CR number to a company through the same base form —
-- leading zeros stripped, /branch suffix dropped: matchBidCrs (award bid → company),
-- GET /api/tenders/awards/company/:id (company → its CR bases), and linkAwardWinnersByCr
-- (award winner's stated CR → award_company_id). Each was a 195k-row scan per lookup.
--
-- ⚠️ The expression must stay byte-for-byte identical to those queries — the migration-113
-- lesson: an expression index that drifts from its query keeps answering correctly at
-- full-scan speed. tests/award_intel.test.mjs EXPLAINs the shipped shape against this index.

CREATE INDEX IF NOT EXISTS idx_company_registrations_base
  ON company_registrations ((ltrim(split_part(number,'/',1),'0')));
