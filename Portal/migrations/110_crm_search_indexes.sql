-- 110 — indexes the CRM search and record list actually read by.
--
-- Measured on the live database (2026-08-07) before writing this file:
--
--   crm_records had btree on (id), (tenant_id, entity_type), (entity_type, entity_id),
--   (tenant_id, status) — and NOTHING on last_activity_at, which is the sole
--   ORDER BY of the record list (routes/crm.js GET /records). Every list load
--   therefore sorted the tenant's whole record set. Harmless at 3 rows; a full
--   sort per keystroke once a customer has tens of thousands.
--
--   crm_deals had btree on (id), (stage_id), (tenant_id, status) — and NOTHING
--   on record_id, yet the record drawer runs `WHERE d.record_id = $1` on every
--   open, and the new search runs the same predicate once per candidate record.
--   Without this index that is a sequential scan of crm_deals per row.
--
-- Both are plain btrees on tenant-owned CRM tables. They add no columns, change
-- no data, and are pure read-path improvements — nothing can be lost by them.
--
-- NOTE ON THE MIRROR: crm_* is PROD-OWNED per-tenant customer state (see the
-- header of migration 022). It is not part of the local→prod data mirror, so
-- this file must run on BOTH sides on its own — which it does, since migrations
-- are applied at Portal boot in every deployment.

BEGIN;

-- The record list: tenant, then the archived split, then newest activity first.
-- Column order matches the WHERE/ORDER BY shape exactly, so Postgres can walk
-- the index instead of sorting.
CREATE INDEX IF NOT EXISTS idx_crm_records_tenant_activity
  ON crm_records (tenant_id, archived, last_activity_at DESC);

-- Deal lookups by record — the drawer, and the search's deal-title match.
CREATE INDEX IF NOT EXISTS idx_crm_deals_record
  ON crm_deals (record_id);

-- Notes are searched by body within ONE tenant. crm_notes carried only
-- (record_id, created_at), so a note search read every note of every tenant.
CREATE INDEX IF NOT EXISTS idx_crm_notes_tenant
  ON crm_notes (tenant_id);

-- Registration-number lookup. company_registrations already had
-- (registration_type, number_normalized), but the CRM search knows only the
-- NUMBER a salesperson typed — not which body issued it — and a btree cannot
-- serve an equality on its second column alone. Without this, every search
-- containing a digit took a full pass over 195,496 rows: measured at ~440 ms
-- for a tenant with only 1,000 CRM records, i.e. a cost every customer pays
-- regardless of size. This is the one index on a canonical (mirrored) table
-- in this migration; it is a plain btree of a short text column.
CREATE INDEX IF NOT EXISTS idx_company_registrations_number_norm
  ON company_registrations (number_normalized)
  WHERE number_normalized IS NOT NULL;

COMMIT;
