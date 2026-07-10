// QSE disclosures — SQL constants. PURE module (no db.js import, which opens a
// pool on import) so the PGlite test can exercise the EXACT strings against the
// real migration files — same pattern as tenders/match.js.

// Upsert one disclosure. source_uid is the source's own stable identity
// ('news:<InformationTypeDetailID>' | 'fs:<sym>:<year>:<Qn>' | 'notice:<year>:<n>'),
// so re-scans are idempotent. Re-ingesting refreshes the text fields (the source
// occasionally edits announcements) but company_id — set by the link pass — is
// preserved. updated_at feeds the mirror watermark.
export const QSE_UPSERT_SQL = `
  INSERT INTO qse_disclosures
    (source_uid, dtype, symbol, company_name, category, headline, summary, body, url, published_at, raw)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
  ON CONFLICT (source_uid) DO UPDATE SET
    dtype = EXCLUDED.dtype,
    symbol = EXCLUDED.symbol,
    company_name = EXCLUDED.company_name,
    category = EXCLUDED.category,
    headline = EXCLUDED.headline,
    summary = COALESCE(EXCLUDED.summary, qse_disclosures.summary),
    body = COALESCE(EXCLUDED.body, qse_disclosures.body),
    url = COALESCE(EXCLUDED.url, qse_disclosures.url),
    published_at = COALESCE(EXCLUDED.published_at, qse_disclosures.published_at),
    raw = COALESCE(qse_disclosures.raw, '{}'::jsonb) || COALESCE(EXCLUDED.raw, '{}'::jsonb),
    updated_at = now()
  RETURNING (xmax = 0) AS is_insert`;

// Conservative company linking, two passes — same doctrine as
// tenders/ingest.js linkTenderCompanies: normalized EXACT equality first.
// Only rows still unlinked, only names that keep >= 4 chars after stripping,
// and BOTH passes refuse ambiguity (two registry rows sharing the normalized
// name = no link — an arbitrary pick would be a guess). Both bump updated_at
// so a link-only change rides the incremental mirror watermark.
export const QSE_LINK_EXACT_SQL = `
  UPDATE qse_disclosures q
     SET company_id = m.cid, updated_at = now()
    FROM (
      SELECT q2.id AS qid, min(c.id) AS cid
        FROM qse_disclosures q2
        JOIN companies c
          ON regexp_replace(lower(c.name), '[^a-z0-9]', '', 'g')
             = regexp_replace(lower(q2.company_name), '[^a-z0-9]', '', 'g')
         AND COALESCE(c.archived, false) = false
       WHERE q2.company_id IS NULL
         AND q2.company_name IS NOT NULL
         AND length(regexp_replace(lower(q2.company_name), '[^a-z0-9]', '', 'g')) >= 4
       GROUP BY q2.id
      HAVING count(DISTINCT c.id) = 1
    ) m
   WHERE q.id = m.qid`;

// Second pass: the QSE name is a PREFIX of the registry name (registry names
// carry legal suffixes — 'Qatar Islamic Bank' vs 'Qatar Islamic Bank Q.P.S.C.').
// Requires >= 8 normalized chars and a UNIQUE candidate — ambiguity = no link.
export const QSE_LINK_PREFIX_SQL = `
  UPDATE qse_disclosures q
     SET company_id = m.cid, updated_at = now()
    FROM (
      SELECT q2.id AS qid, min(c.id) AS cid
        FROM qse_disclosures q2
        JOIN companies c
          ON regexp_replace(lower(c.name), '[^a-z0-9]', '', 'g')
             LIKE regexp_replace(lower(q2.company_name), '[^a-z0-9]', '', 'g') || '%'
         AND COALESCE(c.archived, false) = false
       WHERE q2.company_id IS NULL
         AND q2.company_name IS NOT NULL
         AND length(regexp_replace(lower(q2.company_name), '[^a-z0-9]', '', 'g')) >= 8
       GROUP BY q2.id
      HAVING count(DISTINCT c.id) = 1
    ) m
   WHERE q.id = m.qid`;

// Signal generation (news/signals.js genQseDisclosures). Only dated 'news'
// disclosures become signals — statements/notices carry no publish date or no
// company. Company link optional (LEFT JOIN): the disclosure names the listed
// company exactly, so the signal is honest even when the registry row isn't
// matched yet. Idempotent via dedup_key 'qse:<id>'.
//
// PDPPL note (CLAUDE.md 2.7): 'board' disclosures can NAME directors in the
// headline/summary. Val approved showing the VERBATIM exchange text to
// customers (2026-07-11) — these are public regulatory disclosures published
// by the exchange itself, unlike Bell-derived people data. This is a per-
// category decision: revisit if a category ever carries non-public personal
// data.
export const QSE_SIGNAL_SQL = `
  INSERT INTO signals (kind, subkind, company_id, company_name, title, body, source_kind,
                       ref_table, ref_id, industry, employee_count, importance, occurred_at, dedup_key)
  SELECT 'disclosure', q.category, q.company_id, COALESCE(c.name, q.company_name),
         q.headline,
         COALESCE(q.summary, q.body),
         'qse', 'qse_disclosures', q.id,
         c.industry, c.employee_count,
         CASE q.category
           WHEN 'financial_results' THEN 0.72
           WHEN 'capital_action'    THEN 0.72
           WHEN 'dividend'          THEN 0.70
           WHEN 'board'             THEN 0.68
           WHEN 'agm'               THEN 0.60
           WHEN 'investor_call'     THEN 0.55
           ELSE 0.55
         END,
         q.published_at,
         'qse:' || q.id
    FROM qse_disclosures q
    LEFT JOIN companies c ON c.id = q.company_id
   WHERE q.dtype = 'news'
     AND q.published_at IS NOT NULL
     AND q.published_at > now() - interval '336 hours'
  ON CONFLICT (dedup_key) DO NOTHING`;
