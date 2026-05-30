-- =============================================================================
-- Market Feed — one-time cleanup of broken summaries (v0013)
-- =============================================================================
-- Items ingested before the parser fix stored Google News' entity-encoded HTML
-- as literal text (e.g. "<a href=...>Title</a>&nbsp;<font>Publisher</font>").
-- Null those out so the old cards render cleanly (title-only). New items are
-- already clean. Direct-RSS summaries (no anchor markup) are untouched.
-- =============================================================================

BEGIN;

UPDATE feed_events
   SET summary = NULL
 WHERE summary IS NOT NULL
   AND (summary LIKE '%<a %' OR summary LIKE '%&lt;a%' OR summary LIKE '%</a>%'
        OR summary LIKE '%&lt;/a&gt;%' OR summary LIKE '%<font%' OR summary LIKE '%&lt;font%');

UPDATE news_items
   SET summary = NULL
 WHERE summary IS NOT NULL
   AND (summary LIKE '%<a %' OR summary LIKE '%&lt;a%' OR summary LIKE '%</a>%'
        OR summary LIKE '%&lt;/a&gt;%' OR summary LIKE '%<font%' OR summary LIKE '%&lt;font%');

INSERT INTO schema_migrations (version) VALUES ('0013') ON CONFLICT DO NOTHING;

COMMIT;
