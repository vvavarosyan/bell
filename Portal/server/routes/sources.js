// /api/sources — list scrape sources, trigger scrapes, trigger ingests,
// poll job state. Backed by the in-memory job store in ../ingest/jobs.js.

import { Router } from 'express';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { query } from '../db.js';
import { jobs } from '../ingest/jobs.js';
import { ingestSource, describeSourceLatestFile } from '../ingest/runner.js';

const __filename = fileURLToPath(import.meta.url);
const SERVER_DIR = path.dirname(path.dirname(__filename));
const WORKSPACE  = path.resolve(SERVER_DIR, '..', '..');
const DIR_ROOT   = path.join(WORKSPACE, 'Data', 'Companies', '1. Data Gathering', 'Directories');

const router = Router();

const SOURCES = ['QFZ', 'QFC', 'MOCI', 'QSTP', 'QSE', 'QCCI'];

const SCRAPE_COMMAND = {
  QFZ:  { dir: 'QFZ',  script: 'Run Scan Now.command' },
  QFC:  { dir: 'QFC',  script: 'Run Scan Now.command' },
  MOCI: { dir: 'MOCI', script: 'Run Scan Now.command' },
  QSTP: { dir: 'QSTP', script: 'Run Scan Now.command' },
  QSE:  { dir: '../Other Sources/QSE', script: 'Run Scan Now.command' },
  QCCI: { dir: '../Other Sources/Qatar Chamber', script: 'Run Scan Now.command' },
};

// GET /api/sources  — per-source snapshot
router.get('/', async (req, res, next) => {
  try {
    const dbCounts = await query(`
      SELECT source, count(*)::int AS rows, max(last_seen_at) AS last_seen
      FROM company_sources
      WHERE source = ANY($1)
      GROUP BY source
    `, [SOURCES]);
    const byName = Object.fromEntries(dbCounts.rows.map(r => [r.source, r]));

    const out = [];
    for (const src of SOURCES) {
      const file = await describeSourceLatestFile(src);
      const counts = byName[src] || { rows: 0, last_seen: null };
      const recentJobs = jobs.recent({ source: src, limit: 3 });
      const running = recentJobs.find(j => j.status === 'running') || null;
      out.push({
        source: src,
        latest_file: file,
        db_rows: counts.rows,
        db_last_ingest_at: counts.last_seen,
        running_job: running ? {
          id: running.id, kind: running.kind, started_at: running.started_at
        } : null,
        recent_jobs: recentJobs.map(j => ({
          id: j.id, kind: j.kind, status: j.status,
          started_at: j.started_at, completed_at: j.completed_at,
          summary: jobSummary(j),
        })),
      });
    }
    res.json({ sources: out });
  } catch (err) { next(err); }
});

// POST /api/sources/:name/ingest — kick off ingest of the latest JSON
router.post('/:name/ingest', async (req, res, next) => {
  try {
    const source = req.params.name;
    if (!SOURCES.includes(source)) return res.status(400).json({ error: 'unknown_source' });

    // Refuse to start a 2nd ingest while one is running for the same source
    const recentRunning = jobs.recent({ source, kind: 'ingest', limit: 5 }).find(j => j.status === 'running');
    if (recentRunning) return res.status(409).json({ error: 'already_running', job_id: recentRunning.id });

    const job = jobs.start({ kind: 'ingest', source });
    res.json({ job_id: job.id, status: job.status });

    // Run in background
    (async () => {
      try {
        const result = await ingestSource(source, (msg) => jobs.log(job.id, msg));
        jobs.complete(job.id, result);
      } catch (err) {
        console.error('[ingest:' + source + '] failed:', err);
        jobs.fail(job.id, err);
      }
    })();
  } catch (err) { next(err); }
});

// POST /api/sources/:name/scrape — kick off the directory's scraper
router.post('/:name/scrape', async (req, res, next) => {
  try {
    const source = req.params.name;
    if (!SOURCES.includes(source)) return res.status(400).json({ error: 'unknown_source' });

    const cmd = SCRAPE_COMMAND[source];
    const cwd = path.join(DIR_ROOT, cmd.dir);
    const script = path.join(cwd, cmd.script);
    try { await fs.access(script); }
    catch { return res.status(404).json({ error: 'scrape_script_missing', script }); }

    const recentRunning = jobs.recent({ source, kind: 'scrape', limit: 5 }).find(j => j.status === 'running');
    if (recentRunning) return res.status(409).json({ error: 'already_running', job_id: recentRunning.id });

    const job = jobs.start({ kind: 'scrape', source });
    res.json({ job_id: job.id, status: job.status });

    // Spawn the .command file; on macOS it's just a bash script.
    const child = spawn('bash', [script], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const onChunk = (buf) => {
      const text = buf.toString();
      for (const line of text.split('\n')) {
        if (line.trim()) jobs.log(job.id, line.replace(/\s+$/, ''));
      }
    };
    child.stdout.on('data', onChunk);
    child.stderr.on('data', onChunk);

    child.on('exit', (code) => {
      if (code === 0) {
        jobs.complete(job.id, { exit_code: code });
      } else {
        jobs.fail(job.id, new Error('Scraper exited with code ' + code));
      }
    });
    child.on('error', (err) => jobs.fail(job.id, err));
  } catch (err) { next(err); }
});

// GET /api/sources/jobs/:id — poll a single job (used by the UI)
// `since` = monotonic message idx, not a slice offset. See enrichment route
// for the rationale (survives shift() eviction).
router.get('/jobs/:id', (req, res) => {
  const j = jobs.get(req.params.id);
  if (!j) return res.status(404).json({ error: 'not_found' });
  const sinceIdx = Math.max(0, Number(req.query.since || 0));
  const fresh    = j.messages.filter(m => (m.idx ?? 0) >= sinceIdx);
  res.json({
    ...j,
    messages:       fresh,
    total_messages: j.next_index ?? j.messages.length,
  });
});

function jobSummary(j) {
  if (j.status === 'completed' && j.result) {
    if (j.kind === 'ingest') {
      const r = j.result;
      return `+${r.inserted} new · +${r.updated} updated · ${r.normalized} of ${r.raw_rows} rows`;
    }
    if (j.kind === 'scrape') {
      return 'scraper exited cleanly';
    }
  }
  if (j.status === 'failed') return j.error || 'failed';
  if (j.status === 'running') return 'in progress';
  return '';
}

export default router;
