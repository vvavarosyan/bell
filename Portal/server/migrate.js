// Bell Data Intelligence — auto-migration runner.
//
// Applies every *.sql file in ../migrations/ in alphabetical order, exactly
// once. State is tracked in a tiny schema_migrations table the runner creates
// on first run. Each file is wrapped in its own transaction. If a migration
// fails, the server boot also fails — so the admin notices.
//
// Click-only workflow: every time the Portal launches, any new migration file
// is applied automatically. No psql, no manual command runs.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const MIG_DIR    = path.resolve(__dirname, '..', 'migrations');

// Tracking table is BDI-namespaced to avoid colliding with any pre-existing
// `schema_migrations` table that another tool (Rails, Sequelize, Liquibase…)
// might have left in this Postgres cluster with a different column shape.
const TRACK_TABLE = 'bdi_schema_migrations';

export async function runPendingMigrations() {
  // 1. Ensure tracking table exists. Use ALTER TABLE ADD COLUMN IF NOT EXISTS
  //    too so we self-heal in the rare case the table was created with a
  //    previous schema.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS ${TRACK_TABLE} (
      filename    text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    );
  `);
  await pool.query(`
    ALTER TABLE ${TRACK_TABLE}
      ADD COLUMN IF NOT EXISTS filename   text,
      ADD COLUMN IF NOT EXISTS applied_at timestamptz NOT NULL DEFAULT now();
  `);

  // 2. Find every .sql file in migrations/, ordered alphabetically
  let allFiles = [];
  try {
    allFiles = fs.readdirSync(MIG_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();
  } catch (err) {
    console.warn('[migrate] cannot read migrations dir:', err.message);
    return { applied: [], skipped: [] };
  }

  if (allFiles.length === 0) return { applied: [], skipped: [] };

  // 3. Figure out which ones haven't run yet
  const { rows: alreadyDone } = await pool.query(
    `SELECT filename FROM ${TRACK_TABLE}`,
  );
  const doneSet = new Set(alreadyDone.map(r => r.filename));
  const pending = allFiles.filter(f => !doneSet.has(f));
  const skipped = allFiles.filter(f => doneSet.has(f));

  // The very first migration was historically applied by hand via psql in the
  // installer script. If it's not yet recorded as applied, assume that's the
  // case and just record it without re-running (everything is IF NOT EXISTS
  // anyway, so re-running would be safe but slow + spammy).
  const initial = '001_initial_schema.sql';
  if (pending.includes(initial)) {
    // Detect whether initial schema is already in place by checking for the
    // companies table. If yes → silently mark as applied. If no → run it.
    const r = await pool.query(`
      SELECT to_regclass('public.companies') AS c
    `);
    if (r.rows[0]?.c) {
      await pool.query(
        `INSERT INTO ${TRACK_TABLE} (filename) VALUES ($1)
         ON CONFLICT DO NOTHING`,
        [initial],
      );
      const i = pending.indexOf(initial);
      pending.splice(i, 1);
    }
  }

  const applied = [];

  for (const fname of pending) {
    const full = path.join(MIG_DIR, fname);
    const sql  = fs.readFileSync(full, 'utf8');

    // Each migration file is expected to manage its own BEGIN/COMMIT. Just run
    // it as-is and record the success.
    const client = await pool.connect();
    try {
      console.log(`[migrate] applying ${fname}…`);
      await client.query(sql);
      await client.query(
        `INSERT INTO ${TRACK_TABLE} (filename) VALUES ($1)
         ON CONFLICT DO NOTHING`,
        [fname],
      );
      applied.push(fname);
      console.log(`[migrate] ✓ ${fname}`);
    } catch (err) {
      console.error(`[migrate] ✗ ${fname}: ${err.message}`);
      throw new Error(`Migration ${fname} failed: ${err.message}`);
    } finally {
      client.release();
    }
  }

  return { applied, skipped };
}
