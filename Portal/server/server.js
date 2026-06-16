// Bell Data Intelligence — Portal HTTP server.
// Serves the UI from ../ui/ and the JSON API under /api/*.
// redeploy nonce: 2026-06-02 (re-trigger build after Railway registry-push hiccup on #39)

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
import fs from 'fs';
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
import researchCandidatesRouter from './routes/research_candidates.js';
import { startPoller as startResearchPoller } from './research/poller.js';
import openDataRouter          from './routes/open_data.js';
import { startScheduler as startOpenDataScheduler } from './sources/qatar_open_data/scheduler.js';
import { startNewsEngine, getNewsState } from './news/engine.js';
import { startCrmScheduler } from './crm/sequences.js';
import { startInboundPoller } from './crm/inbound_poller.js';
import authRouter              from './routes/auth.js';
import billingRouter           from './routes/billing.js';
import syncRouter              from './routes/sync.js';
import creditsRouter           from './routes/credits.js';
import accountRouter           from './routes/account.js';
import feedRouter              from './routes/feed.js';
import crmRouter               from './routes/crm.js';
import crmInboundRouter        from './routes/crm_inbound.js';
import detailRequestsRouter    from './routes/detail_requests.js';
import notificationsRouter     from './routes/notifications.js';
import { requireAuth, requireRole, requireActiveSubscription } from './lib/auth.js';
import { getKey } from './keychain.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/**
 * Find the Portal UI directory. Tries multiple paths so the server works
 * regardless of how the deployment structures the filesystem (local Mac,
 * Railway/Railpack, Docker, etc.). Picks the first candidate that actually
 * has `index.html` in it.
 */
function findUiDir() {
  const candidates = [
    process.env.UI_DIR,                             // explicit override
    path.resolve(__dirname, '..', 'ui'),            // local Mac + standard Railway (Portal/ui)
    path.resolve(process.cwd(), 'ui'),              // if cwd is Portal/
    path.resolve(process.cwd(), '..', 'ui'),        // if cwd is Portal/server/
    '/app/ui',                                       // Railway with Portal as root dir
    '/app/Portal/ui',                                // Railway with repo root as root dir
    path.resolve(__dirname, 'ui'),                  // if ui got placed alongside server
  ].filter(Boolean);

  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, 'index.html'))) return dir;
    } catch { /* try next */ }
  }
  // Nothing found — return the conventional path and let express log the 404
  return path.resolve(__dirname, '..', 'ui');
}

const UI_DIR     = findUiDir();
const PORT       = Number(process.env.PORT || 3939);
const HOST       = process.env.HOST || '127.0.0.1';

console.log(`[bdi] UI_DIR resolved to: ${UI_DIR} (exists=${fs.existsSync(path.join(UI_DIR, 'index.html'))})`);

const app = express();
app.use(cors());

// IMPORTANT: webhook routes need the RAW request body so signatures verify
// against the exact bytes the sender used. Mount express.raw FIRST on those
// specific paths, then express.json for everything else.
app.use('/api/auth/clerk-webhook',     express.raw({ type: 'application/json', limit: '1mb' }));
app.use('/api/billing/stripe-webhook', express.raw({ type: 'application/json', limit: '2mb' }));
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

// ---------------------------------------------------------------------------
// Authorization gates (server-side enforcement — the UI only hides things).
//
//   feature   = signed in + active subscription (platform_admin + internal
//               tenant bypass the subscription check inside the middleware).
//   adminOnly = admin tools. Available ONLY on the admin deployment
//               (BDI_MODE=admin → admin.bell.qa) and the local engine
//               (local-admin). BLOCKED on the user portal (BDI_MODE=user) for
//               EVERYONE, including platform_admin (Val's decision 2026-05-29).
//
// local-admin mode: requireAuth attaches a synthetic platform_admin, the
// subscription check is bypassed (internal tenant), and adminToolsGate passes —
// so the local engine is unaffected.
// ---------------------------------------------------------------------------
const MODE = (process.env.BDI_MODE || 'local-admin').toLowerCase();

function adminToolsGate(req, res, next) {
  if (MODE === 'user') {
    return res.status(403).json({ error: 'forbidden', reason: 'admin_tools_only_on_admin_portal' });
  }
  next();
}
// Local-engine-only operations (directory ingest, enrichment, assembly, job
// logs). These read local files and/or originate canonical data, so they must
// run ONLY where the source-of-truth DB lives. Blocked on app AND admin.
// See lib/capabilities.js for the catalog that also drives UI hiding.
function localEngineGate(req, res, next) {
  if (MODE !== 'local-admin') {
    return res.status(403).json({ error: 'forbidden', reason: 'local_engine_only' });
  }
  next();
}
const feature    = [requireAuth, requireActiveSubscription];
const adminOnly  = [requireAuth, adminToolsGate, requireRole('platform_admin')];
const localTools = [requireAuth, localEngineGate, requireRole('platform_admin')];

// Product features — signed in + active subscription.
app.use('/api/companies',  ...feature, companiesRouter);
app.use('/api/people',     ...feature, peopleRouter);
app.use('/api/jobs',       ...feature, jobsRouter);
app.use('/api/research',   ...feature, researchRouter);
app.use('/api/open-data',  ...feature, openDataRouter);
app.use('/api/feed',       ...feature, feedRouter);
app.use('/api/crm',        ...feature, crmRouter);
app.use('/api/detail-requests', ...feature, detailRequestsRouter);
// Stats backs the app shell/header — signed in only, no subscription gate so an
// unsubscribed user still gets a working frame before being routed to /subscribe.
app.use('/api/stats',      requireAuth, statsRouter);
// Credits — balance/ledger for any signed-in tenant; /adjust is platform_admin
// (enforced inside the router). No subscription gate so the top-bar pill always loads.
app.use('/api/credits',    requireAuth, creditsRouter);
// Account — the signed-in user's own profile / notifications / preferences.
app.use('/api/account',    requireAuth, accountRouter);
// Notifications — in-app center + admin announcement broadcast. requireAuth only
// (no subscription gate) so the header bell always loads, like credits/stats.
app.use('/api/notifications', requireAuth, notificationsRouter);

// Local-engine-only tools — these read local directory files and/or originate
// canonical data, so they run ONLY on Val's Mac (blocked on app AND admin).
app.use('/api/sources',             ...localTools, sourcesRouter);
app.use('/api/enrichment',          ...localTools, enrichmentRouter);
app.use('/api/assembly',            ...localTools, assemblyRouter);
app.use('/api/job-runs',            ...localTools, jobRunsRouter);
// Research approval queue — promoting discoveries is canonical curation.
app.use('/api/research-candidates', ...localTools, researchCandidatesRouter);

// Admin tools — admin.bell.qa + local engine (read/observe prod).
app.use('/api/similar-companies',  ...adminOnly, similarCompaniesRouter);

// Browser-safe public tokens (e.g. the Mapbox pk.* token the Map view needs).
// ANY signed-in user needs this, so it sits BEFORE the admin-only settings
// router and is auth-gated (not admin). Whitelist only safe-to-publish keys.
const PUBLIC_TOKENS = new Set(['mapbox']);
app.get('/api/settings/public-token/:name', requireAuth, async (req, res, next) => {
  try {
    if (!PUBLIC_TOKENS.has(req.params.name)) {
      return res.status(403).json({ error: 'not_a_public_token' });
    }
    const value = await getKey(req.params.name);
    if (!value) return res.status(404).json({ error: 'not_set' });
    res.json({ name: req.params.name, value });
  } catch (err) { next(err); }
});

app.use('/api/settings',           ...adminOnly, settingsRouter);

// Self-gating / public routers (handle their own auth internally):
//   auth   → /mode is public; /me requires a token
//   billing→ requires auth but NOT a subscription (users must reach it to pay)
//   sync   → /ingest + /reset use the BDI_SYNC_TOKEN; push/status/rebuild are localOnly
app.use('/api/auth',               authRouter);
app.use('/api/billing',            billingRouter);
app.use('/api/sync',               syncRouter);
// Inbound email webhook — machine-to-machine, self-gated by BDI_CRM_INBOUND_TOKEN.
app.use('/api/crm-inbound',        crmInboundRouter);

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

  // Start the Market Feed engine (news poller + enrichment). No-op unless
  // BDI_NEWS_ENGINE=1 — enable on exactly one service (the production portal).
  startNewsEngine();

  // CRM sequence follow-up scheduler (gated by BDI_CRM_SCHEDULER=1 → one prod
  // service, the app.bell.qa user portal where CRM data + the Resend key live).
  startCrmScheduler();

  // CRM inbound reply reader (IMAP). Enabled only where BDI_CRM_IMAP_* are set
  // (one service). Reads the reply mailbox and threads replies into the CRM.
  startInboundPoller();
})();
