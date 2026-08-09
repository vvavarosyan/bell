-- 114 — Move the prod-research id band ABOVE the engine box's own people sequence.
--
-- ⚠️ MIGRATION 017'S SAFETY PROPERTY IS CURRENTLY VOID FOR `people`, AND THE COLLISION IT WAS
-- WRITTEN TO PREVENT IS NOW ONE RESEARCH JOB AWAY.
--
-- 017 reserved ids >= 2,000,000,000 for entities that PRODUCTION creates (research jobs started on
-- bell.qa run on Railway and write straight to the prod database), on the stated premise that
-- "local ids (~10^5 today) will never reach it, so the two id spaces are disjoint".
--
-- MEASURED on the engine box 2026-08-09:
--     people    72,398 rows · 72,206 of them with ids >= 2,000,000,000 · people_id_seq = 2,000,073,304
--     companies 197,236 rows · 0 in the band · companies_id_seq = 197,420
--
-- So the engine box's OWN people sequence sits inside the reserved band and is climbing through it.
-- Production's research_entity_id_seq issues from 2,000,000,000 upward and has reached ~2,000,040,090
-- (the 7 research people found stranded on prod that day). Its next value therefore names an id the
-- engine box has ALREADY given to a different person. When that row travels — either direction —
-- one real person silently overwrites another. Both are PDPPL-sensitive records.
--
-- The fix has to move the BAND, not the local sequence: 72,206 rows already occupy the low side of
-- it and their ids are the mirror's join key. 3,000,000,000 leaves the engine box roughly a billion
-- people of headroom, which it will not consume.
--
-- Runs on both deployments and is idempotent: GREATEST never moves the sequence backwards, so a
-- prod sequence already past 3e9 is left alone, and a local one that has never been used is simply
-- parked at the new floor.
--
-- ⚠️ CODE THAT TESTS THE BAND still reads >= 2,000,000,000 (sync/pull.js HIGH_BASE,
-- scripts/find_prod_orphans.js). That stays correct: everything prod creates from now on is above
-- 3e9, which is also above 2e9. Do NOT "tidy" those constants up to 3e9 — the entities already
-- issued between 2.0e9 and 2.1e9 are real and must keep matching.

BEGIN;

SELECT setval('research_entity_id_seq', GREATEST(last_value, 3000000000), true)
  FROM research_entity_id_seq;

COMMIT;
