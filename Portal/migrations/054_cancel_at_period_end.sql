-- 054: track whether the subscription is set to cancel at the end of the current
-- period (so the user can cancel/resume in-app instead of the Stripe portal).
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;
