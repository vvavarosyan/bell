-- "Have we already emailed this address?" needs to be cheap, because it now runs before EVERY send.
--
-- crm/contact_guard.js asks three questions per outbound email, all keyed on
-- (tenant_id, lower(btrim(to_email))): how many accepted sends there have been, when the last one
-- was, and whether this exact subject already went out inside 24 hours. The existing indexes are
-- (record_id, created_at) and (tenant_id, created_at) — neither can answer a question about an
-- ADDRESS, so each one degrades to a scan of the tenant's whole email history.
--
-- That is invisible today (crm_emails is small) and would become a per-recipient scan inside a
-- bulk send later: 500 recipients × a growing table, on the request path, right where a slow
-- answer makes a caller think a delivered email failed and retry it.
--
-- ⚠️ The expression must match the guard's WHERE clause exactly — `lower(btrim(to_email))`. This
-- repo has already been bitten by an expression index whose expression drifted from its query
-- (migration 113): answers stay correct, the planner silently stops using the index, and a 45 ms
-- lookup becomes a 2.4 s scan with nothing in the logs. If the guard's comparison ever changes,
-- this index has to be rebuilt in the same change.

CREATE INDEX IF NOT EXISTS idx_crm_emails_recipient
  ON crm_emails (tenant_id, lower(btrim(to_email)), created_at DESC)
  WHERE direction = 'out';
