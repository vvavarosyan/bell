-- 053: scheduled plan downgrades. pending_plan holds a downgrade that takes
-- effect at the next renewal — the user keeps their current plan + credits until
-- then, and renews at the lower price/allotment. NULL = no scheduled change.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS pending_plan text;
