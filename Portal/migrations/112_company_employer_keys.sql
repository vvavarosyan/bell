-- 112 — Index the three name keys the job-employer matcher compares on.
--
-- A vacancy from an aggregator names its employer in words, not by id, so attributing it means
-- asking "which active company IS this name?" once per posting. Measured before this migration, on
-- the live 190k-company table: 2.4 s for a hit and 4.4 s for a miss, because every lookup rewrote
-- every company name with two regexp_replace calls and then scanned. One nightly pass over 233
-- listings is roughly fifteen minutes of pure database burn, every night, forever.
--
-- The expressions below are byte-identical to the ones jobs/attribute.js sends, which is the whole
-- point: an index the planner cannot match to the query is decoration. If either side is ever
-- edited, BOTH must change together — jobs/attribute.js carries the same warning.
--
--   key    lowercase, & → " and ", every non-alphanumeric run → one space, trimmed.
--          Preserves EVERY word, Latin and Arabic. Deliberately NOT normalizeName(), which strips
--          "company", "group", "holding", "trading" as legal-form noise — that lossiness already
--          caused a real Rule-2.1 bug ("Al Jaber Holding Company" swallowing "Al Jaber & Partners").
--   core   key minus a trailing legal form, so "Milaha W.L.L." can answer to "Milaha". Only at the
--          END, and only these tokens; nothing that distinguishes two firms is ever dropped.
--   tight  key with the spaces removed, so a brand that writes itself as one word can match a
--          register that writes it as two — the career portal says "QatarEnergy", the register says
--          "Qatar Energy". Measured across all live names: 12 groups collapse under this rule and
--          all 12 are the SAME firm written twice. Zero genuinely different companies collide.
--
-- All three are IMMUTABLE (lower, replace, regexp_replace, btrim), so they are indexable.

BEGIN;

CREATE INDEX IF NOT EXISTS companies_employer_key_idx ON companies (
  btrim(regexp_replace(regexp_replace(lower(replace(name, '&', ' and ')), '[^a-z0-9؀-ۿ]+', ' ', 'g'), '\s+', ' ', 'g'))
) WHERE COALESCE(archived, false) = false AND canonical_id IS NULL;

CREATE INDEX IF NOT EXISTS companies_employer_core_idx ON companies (
  btrim(regexp_replace(
    btrim(regexp_replace(regexp_replace(lower(replace(name, '&', ' and ')), '[^a-z0-9؀-ۿ]+', ' ', 'g'), '\s+', ' ', 'g')),
    '( ?\m(co|company|llc|ltd|limited|inc|plc|est|establishment|spc|qpsc|qsc|qssc|sae|sao|wll|psc|qfz|qfc)\M)+$', '', 'g'))
) WHERE COALESCE(archived, false) = false AND canonical_id IS NULL;

CREATE INDEX IF NOT EXISTS companies_employer_tight_idx ON companies (
  replace(btrim(regexp_replace(regexp_replace(lower(replace(name, '&', ' and ')), '[^a-z0-9؀-ۿ]+', ' ', 'g'), '\s+', ' ', 'g')), ' ', '')
) WHERE COALESCE(archived, false) = false AND canonical_id IS NULL;

COMMIT;
