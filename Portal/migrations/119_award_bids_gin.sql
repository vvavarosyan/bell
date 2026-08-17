-- Make "which tenders did company X bid on?" answerable at request speed.
--
-- Operation Data Trust D2: 23,058 award reports carrying the full bidder list (names, CR
-- numbers, proposal amounts, ICV ratios) live in tenders.raw->'award_report' and nothing reads
-- them. The company profile needs the LOST bids too — a company's competitive record is the
-- wins (award_company_id, already a plain column) plus every award whose bids[] mention one of
-- its CR numbers.
--
-- That second question is jsonb containment over 23k documents:
--     raw->'award_report'->'bids' @> '[{"registrations":["65011"]}]'
-- and without an index it is a full scan of the fattest column in the tenders table, per CR,
-- per company page view. jsonb_path_ops GIN answers containment directly.
--
-- ⚠️ The expression here must match the query in routes/tenders.js byte-for-byte — the
-- migration-113 lesson: an expression index that drifts from its query keeps giving right
-- answers while silently degrading to the full scan.

CREATE INDEX IF NOT EXISTS idx_tenders_award_bids_gin
  ON tenders USING gin ((raw->'award_report'->'bids') jsonb_path_ops)
  WHERE raw->'award_report' IS NOT NULL;
