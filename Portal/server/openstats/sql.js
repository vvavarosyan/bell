// Qatar Market Pulse — SQL over the open-data holdings (Phase 2 C2).
// PURE module (no db.js import) so the PGlite test can run the EXACT strings
// against fixture rows shaped like the real records.
//
// Every number here is a SUM/COUNT/AVG over values the source itself states —
// derived arithmetic, never estimation. Key-name quirks handled verbatim:
//   · Imports 2019-2024 uses lsn_year/lshhr_month; Imports 2025-2026 uses
//     year/month → COALESCE both.
//   · Exports: lsn_year/lshhr_month, destination in country_of_destinatoion
//     (the source's own typo — matched as-is).
//   · MOCI issued: sn_lsdr/shhr_lsdr/dd_lrkhs_lsdr; canceled: sn_llg/shhr_llg/
//     dd_lrkhs_lmlg (license counts per row are summed, not row-counted).
//   · Real estate: registration_date ISO date, property_value,
//     price_per_square_meter per transaction.

export const IMPORT_TITLES = ['Qatar Imports 2019-2024', 'Qatar Imports 2025-2026'];
export const EXPORT_TITLES = ['Qatar Export Statistics 2019-2026'];
export const REALESTATE_TITLES = ['Weekly Real Estates Sales Bulletin'];
export const MOCI_ISSUED_TITLES = ['MOCI Issued Certificates by Municipality and Business Activity'];
export const MOCI_CANCELED_TITLES = ['MOCI Canceled Certificates by Municipality and Business Activity'];

const dsJoin = `FROM od_records r JOIN od_datasets d ON d.id = r.dataset_id_fk WHERE d.title = ANY($1::text[])`;

// Monthly trade totals (imports and exports run separately with their titles).
export const TRADE_MONTHLY_SQL = `
  SELECT COALESCE(r.data->>'year', r.data->>'lsn_year')::int AS year,
         COALESCE(r.data->>'month', r.data->>'lshhr_month')::int AS month,
         sum((r.data->>'value_qr')::numeric)::bigint AS value_qr
    ${dsJoin}
      AND COALESCE(r.data->>'year', r.data->>'lsn_year') ~ '^[0-9]{4}$'
      AND COALESCE(r.data->>'month', r.data->>'lshhr_month') ~ '^[0-9]{1,2}$'
      AND (r.data->>'value_qr') ~ '^[0-9.]+$'
    GROUP BY 1, 2
    ORDER BY 1 DESC, 2 DESC
    LIMIT 24`;

// Top partner countries over the last N full years (imports: origin; exports:
// destination — pass the column name through $2 is not possible for idents, so
// two constants).
export const TRADE_TOP_ORIGINS_SQL = `
  SELECT r.data->>'country_of_origin' AS country,
         sum((r.data->>'value_qr')::numeric)::bigint AS value_qr
    ${dsJoin}
      AND COALESCE(r.data->>'year', r.data->>'lsn_year')::int >= $2
      AND (r.data->>'value_qr') ~ '^[0-9.]+$'
      AND COALESCE(r.data->>'country_of_origin', '') <> ''
    GROUP BY 1 ORDER BY 2 DESC LIMIT 6`;

export const TRADE_TOP_DESTINATIONS_SQL = `
  SELECT r.data->>'country_of_destinatoion' AS country,
         sum((r.data->>'value_qr')::numeric)::bigint AS value_qr
    ${dsJoin}
      AND COALESCE(r.data->>'year', r.data->>'lsn_year')::int >= $2
      AND (r.data->>'value_qr') ~ '^[0-9.]+$'
      AND COALESCE(r.data->>'country_of_destinatoion', '') <> ''
    GROUP BY 1 ORDER BY 2 DESC LIMIT 6`;

// Real-estate transactions by month (from the weekly sales bulletin).
export const REALESTATE_MONTHLY_SQL = `
  SELECT left(r.data->>'registration_date', 7) AS month,
         count(*)::int AS transactions,
         sum((r.data->>'property_value')::numeric)::bigint AS total_value_qr,
         round(avg((r.data->>'price_per_square_meter')::numeric))::int AS avg_price_sqm
    ${dsJoin}
      AND (r.data->>'registration_date') ~ '^[0-9]{4}-[0-9]{2}'
      AND (r.data->>'property_value') ~ '^[0-9.]+$'
    GROUP BY 1 ORDER BY 1 DESC LIMIT 24`;

// Business licences: issued per month (MOCI issued certificates).
export const MOCI_ISSUED_MONTHLY_SQL = `
  SELECT (r.data->>'sn_lsdr')::int AS year,
         (r.data->>'shhr_lsdr')::int AS month,
         sum((r.data->>'dd_lrkhs_lsdr')::numeric)::int AS licenses
    ${dsJoin}
      AND (r.data->>'sn_lsdr') ~ '^[0-9]{4}$'
      AND (r.data->>'shhr_lsdr') ~ '^[0-9]{1,2}$'
      AND (r.data->>'dd_lrkhs_lsdr') ~ '^[0-9]+$'
    GROUP BY 1, 2 ORDER BY 1 DESC, 2 DESC LIMIT 24`;

// Business licences: canceled per month (MOCI canceled certificates).
export const MOCI_CANCELED_MONTHLY_SQL = `
  SELECT (r.data->>'sn_llg')::int AS year,
         (r.data->>'shhr_llg')::int AS month,
         sum((r.data->>'dd_lrkhs_lmlg')::numeric)::int AS licenses
    ${dsJoin}
      AND (r.data->>'sn_llg') ~ '^[0-9]{4}$'
      AND (r.data->>'shhr_llg') ~ '^[0-9]{1,2}$'
      AND (r.data->>'dd_lrkhs_lmlg') ~ '^[0-9]+$'
    GROUP BY 1, 2 ORDER BY 1 DESC, 2 DESC LIMIT 24`;

// Freshness: when each source dataset last synced + its row basis.
export const SOURCES_FRESHNESS_SQL = `
  SELECT d.title, d.our_last_record_sync_at, count(r.id)::int AS rows
    FROM od_datasets d LEFT JOIN od_records r ON r.dataset_id_fk = d.id
   WHERE d.title = ANY($1::text[])
   GROUP BY d.id, d.title, d.our_last_record_sync_at`;
