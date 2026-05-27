// Auto-pick + compute the single most useful chart for a Qatar Open Data
// dataset. Returns a small server-side "chart plan" that the UI renders as
// inline SVG.
//
// Decision order (first match wins):
//   1. Has date/datetime field            → time-series line  (records / month)
//   2. Has text field with ≤20 unique     → horizontal bar    (top values)
//   3. Has at least 2 numeric fields      → stat strip        (min/max/mean/count)
//   4. Otherwise                          → none
//
// All aggregation runs in Postgres against od_records' jsonb data column.
// Postgres handles millions of rows fast with the GIN index from 0009.

import { query } from '../../db.js';

const MAX_BUCKETS = 36;      // time-series points
const MAX_CATEGORIES = 12;   // bar chart bars
const MIN_VARIATION = 2;     // skip "categorical" fields where every record is the same

export async function pickAndComputeChart(dataset) {
  if (!dataset?.id) return { chart_type: 'none', reason: 'no_dataset' };
  const fields = Array.isArray(dataset.fields_schema) ? dataset.fields_schema : [];
  if (fields.length === 0) return { chart_type: 'none', reason: 'no_schema' };

  // Need records to chart against — bail early if dataset hasn't been synced.
  const counted = await query(
    `SELECT count(*)::int AS n FROM od_records WHERE dataset_id_fk = $1`,
    [dataset.id]
  );
  const recordCount = counted.rows[0]?.n || 0;
  if (recordCount === 0) return { chart_type: 'none', reason: 'no_records_synced' };

  // 1. Time-series — first date/datetime field
  const dateField = fields.find(f => f.type === 'date' || f.type === 'datetime');
  if (dateField) {
    const ts = await tryTimeSeries(dataset.id, dateField.name, dateField.type);
    if (ts) return ts;
  }

  // 2. Bar chart — first low-cardinality text field
  const textFields = fields.filter(f => f.type === 'text' && f.name);
  for (const f of textFields.slice(0, 5)) {  // check up to 5 candidates
    const bar = await tryCategoryBar(dataset.id, f.name);
    if (bar) return bar;
  }

  // 3. Stat strip — numeric fields
  const numericFields = fields.filter(f => f.type === 'int' || f.type === 'double' || f.type === 'long' || f.type === 'integer');
  if (numericFields.length >= 1) {
    const stats = await computeStatStrip(dataset.id, numericFields.slice(0, 6));
    if (stats) return stats;
  }

  return { chart_type: 'none', reason: 'no_chartable_field', record_count: recordCount };
}

// ---------------------------------------------------------------------------
// Time-series — buckets by month if range > 2 years, by year if longer,
// by day if range < 60 days. Returns the most useful resolution.
// ---------------------------------------------------------------------------
async function tryTimeSeries(datasetIdFk, fieldName, fieldType) {
  // Robust cast: data->>'field' may be 'YYYY', 'YYYY-MM', 'YYYY-MM-DD',
  // an ISO datetime, or a unix timestamp string. Try ::timestamptz first.
  const rangeSql = `
    SELECT
      min((data->>$2)::timestamptz) AS min_at,
      max((data->>$2)::timestamptz) AS max_at,
      count(*)                       AS n
    FROM od_records
    WHERE dataset_id_fk = $1
      AND data ? $2
      AND data->>$2 IS NOT NULL
      AND data->>$2 <> ''
  `;
  let min_at, max_at, n;
  try {
    const r = await query(rangeSql, [datasetIdFk, fieldName]);
    min_at = r.rows[0]?.min_at;
    max_at = r.rows[0]?.max_at;
    n = Number(r.rows[0]?.n || 0);
  } catch {
    return null;   // cast failed — not really a date field
  }
  if (!min_at || !max_at || n < 2) return null;

  const days = (new Date(max_at) - new Date(min_at)) / 86_400_000;
  let bucket = 'month';
  if (days < 60)        bucket = 'day';
  else if (days > 2200) bucket = 'year';
  else if (days > 365)  bucket = 'month';

  const aggSql = `
    SELECT
      date_trunc('${bucket}', (data->>$2)::timestamptz) AS bucket_at,
      count(*)::int                                     AS n
    FROM od_records
    WHERE dataset_id_fk = $1
      AND data ? $2
      AND data->>$2 IS NOT NULL
      AND data->>$2 <> ''
    GROUP BY bucket_at
    ORDER BY bucket_at
    LIMIT ${MAX_BUCKETS}
  `;
  let buckets;
  try {
    const r = await query(aggSql, [datasetIdFk, fieldName]);
    buckets = r.rows;
  } catch { return null; }
  if (!buckets || buckets.length < 2) return null;

  return {
    chart_type: 'time_series',
    field: fieldName,
    field_type: fieldType,
    bucket,
    points: buckets.map(b => ({ at: b.bucket_at, n: Number(b.n) })),
    record_count: n,
    range: { from: min_at, to: max_at },
  };
}

// ---------------------------------------------------------------------------
// Category bar — top-N counts. Reject if cardinality is too high or too low.
// ---------------------------------------------------------------------------
async function tryCategoryBar(datasetIdFk, fieldName) {
  // First quick check: cardinality. Cheap — just COUNT(DISTINCT ...).
  const card = await query(`
    SELECT count(DISTINCT data->>$2)::int AS k
      FROM od_records
     WHERE dataset_id_fk = $1
       AND data ? $2
       AND data->>$2 IS NOT NULL
       AND data->>$2 <> ''
  `, [datasetIdFk, fieldName]);
  const k = card.rows[0]?.k || 0;
  if (k < MIN_VARIATION || k > 200) return null;

  // Pull top-N values
  const r = await query(`
    SELECT data->>$2 AS value, count(*)::int AS n
      FROM od_records
     WHERE dataset_id_fk = $1
       AND data ? $2
       AND data->>$2 IS NOT NULL
       AND data->>$2 <> ''
     GROUP BY value
     ORDER BY n DESC, value
     LIMIT ${MAX_CATEGORIES}
  `, [datasetIdFk, fieldName]);
  if (!r.rows.length) return null;

  return {
    chart_type: 'category_bar',
    field: fieldName,
    cardinality: k,
    bars: r.rows.map(row => ({ label: row.value, n: Number(row.n) })),
  };
}

// ---------------------------------------------------------------------------
// Stat strip — min / max / mean / count per numeric field
// ---------------------------------------------------------------------------
async function computeStatStrip(datasetIdFk, fields) {
  const stats = [];
  for (const f of fields) {
    try {
      const r = await query(`
        SELECT
          min((data->>$2)::numeric)::float8                                    AS mn,
          max((data->>$2)::numeric)::float8                                    AS mx,
          avg((data->>$2)::numeric)::float8                                    AS mean,
          count(*) FILTER (WHERE (data->>$2) IS NOT NULL AND (data->>$2) <> '')::int AS n
        FROM od_records
        WHERE dataset_id_fk = $1
          AND data ? $2
      `, [datasetIdFk, f.name]);
      const row = r.rows[0];
      if (row && row.n > 0 && (row.mn !== null || row.mx !== null)) {
        stats.push({
          field: f.name,
          label: f.label || f.name,
          type:  f.type,
          min:   row.mn === null ? null : Number(row.mn),
          max:   row.mx === null ? null : Number(row.mx),
          mean:  row.mean === null ? null : Number(row.mean),
          count: Number(row.n),
        });
      }
    } catch { /* not actually numeric — skip silently */ }
  }
  if (stats.length === 0) return null;
  return { chart_type: 'stat_strip', stats };
}
