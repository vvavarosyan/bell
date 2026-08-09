-- 113 — The company-name CORE key must also strip a SPACED legal form.
--
-- Migration 112 indexed three name keys, and jobs/attribute.js sends the same three expressions.
-- The token list was written out twice — once in JavaScript, once here — and the two drifted: the
-- JavaScript list carried the SPACED form `w l l` and this one did not.
--
-- MEASURED: 2,188 live companies normalize to a name ending in a spaced legal form ("Vitamedic
-- Trading W.L.L" → "vitamedic trading w l l"). employerKey turns "W.L.L." into three separate
-- letters, and none of `w`, `l`, `l` is in the old token list, so the CORE key kept them. A job
-- board saying "Encon Corporation" could therefore never find "Encon Corporation W.L.L." — a
-- systematic miss across those 2,188 firms, silent because a miss looks exactly like "Bell does
-- not hold that company".
--
-- ⚠️ AN INDEX MUST BE REBUILT WHEN ITS EXPRESSION CHANGES, OR IT SILENTLY STOPS MATCHING. The
-- planner matches an expression index by exact expression. Editing only the query would drop it
-- back to a full rewrite-and-scan of 190k names — the 2.4 s/4.4 s cost migration 112 removed —
-- while still returning answers, so nothing would look broken.
--
-- The token list now lives ONCE, in jobs/attribute.js (LEGAL_TRAIL_TOKENS), and builds both sides.
-- tests/jobs_attribution.test.mjs asserts the shipped index definition still contains every token,
-- so a future edit to one side fails a test instead of quietly costing matches.

BEGIN;

DROP INDEX IF EXISTS companies_employer_core_idx;

CREATE INDEX companies_employer_core_idx ON companies (
  btrim(regexp_replace(
    btrim(regexp_replace(regexp_replace(lower(replace(name, '&', ' and ')), '[^a-z0-9؀-ۿ]+', ' ', 'g'), '\s+', ' ', 'g')),
    '( ?\m(co|company|llc|ltd|limited|inc|plc|est|establishment|spc|qpsc|qsc|qssc|sae|sao|wll|psc|qfz|qfc|w l l|s p c|q p s c|q s c|q s s c|s a e|s a o|l l c|p l c)\M)+$', '', 'g'))
) WHERE COALESCE(archived, false) = false AND canonical_id IS NULL;

COMMIT;
