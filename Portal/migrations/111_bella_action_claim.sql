-- 111 — one Approve click, one send.
--
-- Val, 2026-08-08, after Bella emailed a customer by accident: fix the double-send.
--
-- THE RACE: routes/bella.js reads the action, checks status = 'proposed', executes the tool, and
-- only THEN writes 'done'. Nothing holds the row in between, so two requests both read 'proposed',
-- both pass the check, and both send. It is not hypothetical — there are two everyday ways in:
--
--   · THE SAME CARD IS ON SCREEN TWICE. The inline card in the chat and the approvals inbox are
--     rendered together, each with its own separate busy flag, neither aware of the other. Two
--     buttons for one email, side by side.
--   · A FAILED STATUS WRITE BECOMES A SECOND SEND. If the 'done' write fails — a dropped
--     connection to the engine box is enough — the email has already gone, the card shows an
--     error, and the button is still live. The natural response is to click again.
--
-- `claimed_at` makes the claim atomic and RECOVERABLE. Without it, a crash between claiming and
-- finishing would strand the row in 'running' forever and the user could never retry — trading a
-- double-send for a dead card. With it, a claim older than the stale window can be taken again.
--
-- The pattern already exists twice in this codebase (the outreach engine and the CRM sequence
-- sender both claim work before doing it). It was simply never applied here.

BEGIN;

ALTER TABLE bella_actions ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Finding the actions a user still owes a decision on, and reaping stale claims.
CREATE INDEX IF NOT EXISTS idx_bella_actions_pending
  ON bella_actions (tenant_id, user_id, status, claimed_at);

COMMIT;
