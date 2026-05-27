// Bell Data Intelligence — Portal HTTP server.
// Serves the UI from ../ui/ and the JSON API under /api/*.

// Safety net: never let an unhandled promise rejection or uncaught exception
// crash the Portal. Node 22+ kills the process on unhandled rejections by
// default; that's catastrophic for users who only ever interact via the UI.
// Log loudly and keep running.
process.on('unhandledRejection', (reason) => {
  console.error('[bdi] UNHANDLED PROMISE REJECTION (kept running):',
    reason instanceof Error ? (reason.stack || reason.message) : reason);
});
process.on('uncaughtException', (err) => {
  console.error('[bdi] UNCAUGHT EXCEPTION (kept running):', err.stack || err.message);
});

import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { pingDatabase } from './db.js';
import { runPendingMigrations } from './migrate.js';

import companiesRouter         from './routes/companies.js';
import peopleRouter            from './routes/people.js';
import jobsRouter              from './routes/jobs.js';
import settingsRouter          from './routes/settings.js';
import statsRouter             from './routes/stats.js';
import sourcesRouter           from './routes/sources.js';
import enrichmentRouter        from './routes/enrichment.js';
import similarCompaniesRouter  from './routes/similar_companies.js';
import assemblyRouter          from './routes/assembly.js';
import jobRunsRouter           from './routes/job_runs.js';
import researchRouter          from './routes/research.js';
import { startPoller as startResearchPoller } from './research/poller.js';
import openDataRouter          from './routes/open_data.js';
import { startScheduler as startOpenDataScheduler } from './sources/qatar_open_data/scheduler.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const UI_DIR     = path.resolve(__dirname, '..', 'ui');
const PORT       = Number(process.env.PORT || 3939);
const HOST       = process.env.HOST || '127.0.0.1';

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Health
app.get('/api/health', async (req, res) => {
  try {
    const ok = await pingDatabase();
    res.json({ ok, db: ok ? 'connected' : 'down', ts: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, db: 'down', error: err.message });
  }
});

// API
app.use('/api/companies',  companiesRouter);
app.use('/api/people',     peopleRouter);
app.use('/api/jobs',       jobsRouter);
app.use('/api/settings',   settingsRouter);
app.use('/api/sources',            sourcesRouter);
app.use('/api/enrichment',         enrichmentRouter);
app.use('/api/similar-companies',  similarCompaniesRouter);
app.use('/api/assembly',           assemblyRouter);
app.use('/api/job-runs',           jobRunsRouter);
app.use('/api/research',           researchRouter);
app.use('/api/open-data',          openDataRouter);
app.use('/api/stats',              statsRouter);

// Static UI
app.use(express.static(UI_DIR, { extensions: ['html'] }));

// SPA fallback — anything not under /api/ returns index.html
app.get(/^\/(?!api\/).*/, (req, res) => {
  res.sendFile(path.join(UI_DIR, 'index.html'));
});

// Final error handler
app.use((err, req, res, next) => {
  console.error('[err]', err.message);
  res.status(500).json({ error: 'server_error', message: err.message });
});

// Boot — ping DB once so we fail fast if Postgres is down.
(async () => {
  try {
    await pingDatabase();
    console.log('[bdi] Postgres reachable.');
  } catch (err) {
    console.error('[bdi] Postgres ping FAILED — start Postgres.app and re-run.');
    console.error('       ' + err.message);
    process.exit(1);
  }

  // Auto-apply any pending schema migrations BEFORE we accept requests
  try {
    const { applied } = await runPendingMigrations();
    if (applied.length > 0) {
      console.log(`[bdi] Applied ${applied.length} migration(s): ${applied.join(', ')}`);
    } else {
      console.log('[bdi] Schema up to date.');
    }
  } catch (err) {
    console.error('[bdi] Migration FAILED:', err.message);
    process.exit(1);
  }

  app.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`;
    console.log(`\n  ==========================================================`);
    console.log(`     Bell Data Intelligence Portal`);
    console.log(`  ==========================================================`);
    console.log(`     URL:    ${url}`);
    console.log(`     Stop:   close this Terminal window\n`);
  });

  // Start the Research orchestrator's background poller. Picks up any
  // queued/in-flight research_jobs left over from previous boots and drives
  // them through the Firecrawl Agent lifecycle.
  startResearchPoller();

  // Start the Qatar Open Data scheduler. Runs a catalog sync ~4s after boot,
  // auto-seeds records if od_records is empty, refreshes catalog every 6h,
  // and runs the full daily sync at 15:00 local.
  startOpenDataScheduler();
})();
