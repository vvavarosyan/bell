// Postgres connection pool for the Bell Data Intelligence Portal.
//
// Connection strategy:
//   • If DATABASE_URL is set (Railway, Heroku, any managed Postgres) →
//     use the connection string. SSL is auto-enabled in production.
//   • Otherwise → use individual PGHOST/PGPORT/PGUSER/PGDATABASE env vars,
//     defaulting to Postgres.app on localhost for the local Mac case.

import pg from 'pg';
import os from 'os';

const { Pool } = pg;

// IMPORTANT — return Postgres bigint (int8 / OID 20) as a JS Number rather
// than the library default of String. Our IDs (companies.id, people.id,
// jobs.id, etc.) are all bigserial but the actual values are tiny (max ~tens
// of thousands), well below 2^53. Without this, code that compares IDs with
// `<` does *lexicographic* string comparison — so "10" < "9" comes out true,
// pairs get inserted into dedup_candidates with the wrong ordering, and the
// `CHECK (company_a_id < company_b_id)` constraint blows up. We hit exactly
// that bug on 2026-05-23 in the cluster pre-merge audit insert.
pg.types.setTypeParser(20, (v) => v === null ? null : parseInt(v, 10));     // int8 → Number
pg.types.setTypeParser(1016, (v) => v === null ? null                       // _int8[] → Number[]
  : v.replace(/^\{|\}$/g, '').split(',').filter(Boolean).map(s => parseInt(s, 10)));

// Detect environment: production = on Railway / managed host.
const isProduction = process.env.NODE_ENV === 'production';
const hasDatabaseUrl = !!process.env.DATABASE_URL;

const poolConfig = hasDatabaseUrl
  ? {
      // Managed Postgres (Railway, etc). Use the connection string verbatim.
      connectionString: process.env.DATABASE_URL,
      // Railway's internal Postgres uses self-signed certs; the public
      // connection requires SSL. rejectUnauthorized=false is the standard
      // setting here — the connection is still encrypted, we just don't
      // verify the cert chain (Railway's certs aren't from a public CA).
      ssl: isProduction ? { rejectUnauthorized: false } : false,
      max: 20,                          // higher pool size in production
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,  // managed DBs can take a beat to wake
    }
  : {
      // Local Postgres.app on macOS — no SSL, trust auth on localhost.
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      database: process.env.PGDATABASE || 'bell_intel',
      user: process.env.PGUSER || os.userInfo().username,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000,
    };

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  // Don't crash the server on idle-client errors.
  console.error('[pg] idle client error:', err.message);
});

// Convenience helper that auto-releases the client.
export async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    if (process.env.LOG_SQL === '1') {
      console.log('[sql]', Date.now() - start + 'ms', text.split('\n')[0].slice(0, 120));
    }
    return res;
  } catch (err) {
    // The previous version sliced text.split('\n')[0], which for our many
    // multiline template-literal SQL queries is just leading whitespace —
    // making errors un-debuggable. Squash whitespace and show the first
    // 200 chars of meaningful SQL plus the param list when available.
    const oneLine = String(text).replace(/\s+/g, ' ').trim().slice(0, 200);
    console.error('[sql error]', err.message);
    console.error('  sql:    ', oneLine);
    if (params && params.length) {
      const shortParams = params.map(p => {
        if (p === null || p === undefined) return String(p);
        const s = typeof p === 'string' ? p : JSON.stringify(p);
        return s.length > 80 ? s.slice(0, 77) + '...' : s;
      });
      console.error('  params: ', shortParams);
    }
    throw err;
  }
}

export async function withTransaction(fn) {
  // NOTE: do NOT monkey-patch client.query here. We tried that to get
  // [sql error in tx] logging, but the pool returns the same client object
  // across calls, so the wrap accumulated layers on every withTransaction
  // call and we started seeing weird hang behavior on the second merge. If
  // you want per-query error logging inside a transaction, wrap the SITE
  // (e.g. the `timed()` helper in dedup.js) rather than the client.
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

export async function pingDatabase() {
  const res = await query('SELECT 1 AS ok');
  return res.rows[0]?.ok === 1;
}
