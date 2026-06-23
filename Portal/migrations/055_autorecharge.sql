-- 055: opt-in auto-recharge. When a tenant's balance drops below the threshold
-- and auto-recharge is enabled, Bell charges the saved card for `amount` credits.
-- Off by default — the tenant must explicitly turn it on. last_at is the cooldown
-- guard so a low balance can't trigger repeated charges.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS autorecharge_enabled   boolean NOT NULL DEFAULT false;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS autorecharge_threshold integer NOT NULL DEFAULT 500;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS autorecharge_amount    integer NOT NULL DEFAULT 2000;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS autorecharge_last_at   timestamptz;
