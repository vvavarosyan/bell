// In-memory job tracker for ingest + scrape + enrichment + assembly operations.
//
// Live jobs (status='running') live ONLY in memory. When a job terminates
// (complete or fail), we persist a snapshot to the Postgres `job_runs` table
// (migration 007) so the full log survives Portal restarts and is browseable
// from the new Recent Jobs view in the UI.

import { randomUUID } from 'crypto';
import { query } from '../db.js';

const MAX_JOBS         = 200;
const MAX_JOB_MESSAGES = 50_000;     // bumped 2026-05-23 to fit cluster pre-merge runs

class JobStore {
  constructor() {
    this.jobs = new Map(); // id -> job
  }

  start({ kind, source }) {
    const id = randomUUID();
    const job = {
      id,
      kind,                  // 'ingest' | 'scrape' | 'enrichment' | 'assembly'
      source,                // QFZ | QFC | MOCI | QSTP | 'full' | 'assembly-full-run' | …
      status: 'running',     // 'running' | 'completed' | 'failed'
      started_at: new Date().toISOString(),
      completed_at: null,
      messages: [],
      // Monotonically-incrementing message counter. Survives `shift()` so the
      // UI's `?since=` pagination keeps moving forward even when old messages
      // get evicted under MAX_JOB_MESSAGES pressure. Without this, the route's
      // `slice(sinceIdx)` returned empty once the array hit its cap and the
      // UI silently froze — fixed 2026-05-23 after Val saw a long assembly
      // run "stuck" at 4 messages.
      next_index: 0,
      result: null,
      error: null,
    };
    this.jobs.set(id, job);
    this._trim();
    return job;
  }

  log(id, message) {
    const j = this.jobs.get(id);
    if (!j) return;
    j.messages.push({
      ts:      new Date().toISOString(),
      message,
      idx:     j.next_index++,
    });
    while (j.messages.length > MAX_JOB_MESSAGES) j.messages.shift();
  }

  complete(id, result) {
    const j = this.jobs.get(id);
    if (!j) return;
    j.status = 'completed';
    j.completed_at = new Date().toISOString();
    j.result = result;
    persistJob(j);
  }

  fail(id, err) {
    const j = this.jobs.get(id);
    if (!j) return;
    j.status = 'failed';
    j.completed_at = new Date().toISOString();
    j.error = err?.message || String(err);
    persistJob(j);
  }

  get(id) { return this.jobs.get(id); }

  /** List recent jobs, newest first. */
  recent({ source, kind, limit = 20 } = {}) {
    const all = [...this.jobs.values()]
      .filter(j => (!source || j.source === source) && (!kind || j.kind === kind))
      .sort((a, b) => b.started_at.localeCompare(a.started_at));
    return all.slice(0, limit);
  }

  _trim() {
    if (this.jobs.size <= MAX_JOBS) return;
    const sorted = [...this.jobs.entries()].sort((a, b) => a[1].started_at.localeCompare(b[1].started_at));
    while (this.jobs.size > MAX_JOBS) {
      const [oldest] = sorted.shift();
      this.jobs.delete(oldest);
    }
  }
}

export const jobs = new JobStore();

// ---------------------------------------------------------------------------
// Persistence — write the terminal-state snapshot of a job to Postgres so it
// survives restarts and is browseable from the Recent Jobs view.
// Failures here are non-fatal — we still want the in-memory job to surface to
// the UI even if the DB write fails.
// ---------------------------------------------------------------------------
async function persistJob(j) {
  try {
    await query(`
      INSERT INTO job_runs (id, kind, source, status, started_at, completed_at, messages, total_messages, result, error, triggered_by)
      VALUES ($1, $2, $3, $4, $5::timestamptz, $6::timestamptz, $7::jsonb, $8, $9::jsonb, $10, $11)
      ON CONFLICT (id) DO UPDATE
      SET status         = EXCLUDED.status,
          completed_at   = EXCLUDED.completed_at,
          messages       = EXCLUDED.messages,
          total_messages = EXCLUDED.total_messages,
          result         = EXCLUDED.result,
          error          = EXCLUDED.error
    `, [
      j.id,
      j.kind,
      j.source,
      j.status,
      j.started_at,
      j.completed_at,
      JSON.stringify(j.messages || []),
      j.next_index ?? (j.messages?.length || 0),
      j.result ? JSON.stringify(j.result) : null,
      j.error,
      j.triggered_by || null,
    ]);
  } catch (err) {
    console.error('[jobs] persist failed for job', j.id, '—', err.message);
  }
}
