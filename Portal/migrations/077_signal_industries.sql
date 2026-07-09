-- 077 — signals.industries[] — multi-industry ICP matching (Val 2026-07-09).
--
-- A signal often fits SEVERAL industries. The clearest case is a tender: HMC's
-- "Supply of Medical Consumables" carries activity codes for Healthcare AND
-- Pharmaceuticals AND Retail (wholesale + retail of medical goods) — the bidder
-- Bell wants to alert could be any of them. Until now `signals.industry` held a
-- single denormalised tag, so ONLY the primary was matched against a tenant's
-- ICP target_industries; a pharma trader never saw a tender whose primary
-- landed on Healthcare.
--
-- `industries` keeps the full set (primary first). scoreSignalForIcp() matches
-- against ANY of them; `industry` stays as the display/primary tag so nothing
-- downstream breaks. Derived/runtime data — NOT part of the local→prod mirror.

ALTER TABLE signals ADD COLUMN IF NOT EXISTS industries text[];

-- Backfill: every existing signal's single industry becomes a 1-element array,
-- so the array is authoritative from day one and the scorer needs no fallback.
UPDATE signals
   SET industries = ARRAY[industry]
 WHERE industries IS NULL AND industry IS NOT NULL AND btrim(industry) <> '';

CREATE INDEX IF NOT EXISTS idx_signals_industries ON signals USING GIN (industries);
