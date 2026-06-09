-- 031_heal_stranded_children.sql
-- Self-heal child rows stranded on a MERGED (dead) company/person. A merge
-- re-parents all of a duplicate's contacts/sources to the canonical, but a write
-- that lands AFTER the merge (e.g. a one-time backfill or a late ingest writing
-- to the companies.phone column) can leave a contact attached to the archived
-- duplicate — invisible on the canonical's drawer = effectively lost data.
-- The audit's "contacts stranded on a dead row" check flags exactly this.
-- Re-parent every stranded child to its FINAL canonical, then delete the strays.

BEGIN;

-- company_contacts → canonical
INSERT INTO company_contacts (company_id, type, value, value_display, source, source_url, source_label, is_primary, is_verified, verified_at, extra_fields)
SELECT c.canonical_id, cc.type, cc.value, cc.value_display, cc.source, cc.source_url, cc.source_label, cc.is_primary, cc.is_verified, cc.verified_at, cc.extra_fields
  FROM company_contacts cc
  JOIN companies c ON c.id = cc.company_id
 WHERE c.merge_status = 'merged_into' AND c.canonical_id IS NOT NULL
ON CONFLICT (company_id, type, value) DO NOTHING;

DELETE FROM company_contacts cc
 USING companies c
 WHERE cc.company_id = c.id AND c.merge_status = 'merged_into';

-- company_sources → canonical (defensive; keep the existing link if identical)
UPDATE company_sources cs SET company_id = c.canonical_id
  FROM companies c
 WHERE cs.company_id = c.id
   AND c.merge_status = 'merged_into' AND c.canonical_id IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM company_sources x
      WHERE x.company_id = c.canonical_id AND x.source = cs.source AND x.source_record_id = cs.source_record_id
   );

DELETE FROM company_sources cs
 USING companies c
 WHERE cs.company_id = c.id AND c.merge_status = 'merged_into';

-- person_contacts → canonical
INSERT INTO person_contacts (person_id, type, value, value_display, source, source_url, source_label, is_primary, is_verified, verified_at, extra_fields)
SELECT p.canonical_id, pc.type, pc.value, pc.value_display, pc.source, pc.source_url, pc.source_label, pc.is_primary, pc.is_verified, pc.verified_at, pc.extra_fields
  FROM person_contacts pc
  JOIN people p ON p.id = pc.person_id
 WHERE p.merge_status = 'merged_into' AND p.canonical_id IS NOT NULL
ON CONFLICT (person_id, type, value) DO NOTHING;

DELETE FROM person_contacts pc
 USING people p
 WHERE pc.person_id = p.id AND p.merge_status = 'merged_into';

INSERT INTO schema_migrations (version) VALUES ('0031') ON CONFLICT DO NOTHING;

COMMIT;
