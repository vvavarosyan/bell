// Research orchestrator. Drives jobs through the lifecycle:
//   queued → gathering → synthesizing → ready  (or failed)
//
// Two public entry points:
//   • runJob(jobId)        — fire the Firecrawl Agent for a job in 'queued'
//   • pollPendingJobs()    — called by the background poller (see poller.js)
//
// State machine:
//   queued → gathering        (after agent() returns a firecrawl_job_id)
//   gathering → synthesizing  (after Firecrawl status=completed, while we parse)
//   synthesizing → ready      (after parser + snowball ingest commit)
//   any → failed              (with error_message)

import { query, withTransaction } from '../db.js';
import { agent, agentStatus } from '../enrichment/clients/firecrawl.js';
import { schemaFor } from './schemas.js';
import { buildPrompt, buildAnchorUrls } from './prompts.js';
import { persistReport } from './parser.js';
import { ingestDerivedEntities } from './ingest.js';

// Soft estimate so the UI can show "ETA ~X min". Firecrawl Agent typically
// completes in 2-5 minutes; we round to 4.
const DEFAULT_ETA_SECONDS = 4 * 60;

/**
 * Fire the agent for a queued job. Looks up the job, builds the prompt +
 * schema, calls Firecrawl Agent (async), stores firecrawl_job_id, flips
 * status to 'gathering'. The poller takes it from there.
 */
export async function runJob(jobId) {
  const job = await loadJobForOrchestration(jobId);
  if (!job) throw new Error('Job not found: ' + jobId);
  // Allow re-run from:
  //   • 'queued'  — initial fire from POST /jobs
  //   • 'failed'  — Retry from drawer
  //   • 'ready'   — manual re-run (debug retry over an already-completed job;
  //                  user is paying for another Firecrawl call on purpose)
  // Anything else (gathering/synthesizing/cancelled) is a no-op so we don't
  // double-charge for an in-flight job.
  if (!['queued','failed','ready'].includes(job.status)) {
    return { id: jobId, status: job.status, skipped: true, reason: 'not_retriable' };
  }

  const schema = schemaFor(job.type);
  if (!schema) {
    await failJob(jobId, `No schema for research type '${job.type}'`);
    return { id: jobId, status: 'failed' };
  }

  let prompt;
  try {
    prompt = buildPrompt(job.type, job);
  } catch (err) {
    await failJob(jobId, 'Prompt builder failed: ' + err.message);
    return { id: jobId, status: 'failed' };
  }

  // If this is a re-run over a completed/failed attempt, wipe the old report,
  // sources, citations, derived-entities audit so the new run starts clean.
  // research_reports has ON CONFLICT (job_id) DO UPDATE so it'd overwrite, but
  // the other tables would accumulate ghosts. Single transaction for atomicity.
  if (job.status === 'ready' || job.status === 'failed') {
    await withTransaction(async (client) => {
      // Delete in FK-safe order
      await client.query(`DELETE FROM research_citations         WHERE report_id IN (SELECT id FROM research_reports WHERE job_id = $1)`, [jobId]);
      await client.query(`DELETE FROM research_reports           WHERE job_id = $1`, [jobId]);
      await client.query(`DELETE FROM research_sources           WHERE job_id = $1`, [jobId]);
      await client.query(`DELETE FROM research_derived_entities  WHERE job_id = $1`, [jobId]);
    });
  }

  // Reset error state + drop any stale firecrawl_job_id from a previous run,
  // so the poller doesn't keep querying a dead handle. Also zero counters.
  await query(`
    UPDATE research_jobs
       SET error_message = NULL,
           firecrawl_job_id = NULL,
           ready_at = NULL,
           source_count = 0,
           section_count = 0,
           citation_count = 0
     WHERE id = $1
  `, [jobId]);

  // Anchor URLs give the agent concrete starting points. Without these,
  // Firecrawl Spark agents often return data:null on open-ended prompts.
  const urls = buildAnchorUrls(job.type, job);

  try {
    const { id: fcId, raw } = await agent(prompt, schema, { urls });
    await query(`
      UPDATE research_jobs
         SET status = 'gathering',
             firecrawl_job_id = $2,
             firecrawl_payload = $3::jsonb,
             started_at = now(),
             eta_seconds = $4
       WHERE id = $1
    `, [jobId, fcId, JSON.stringify({ submitted: raw, anchor_urls: urls }), DEFAULT_ETA_SECONDS]);
    return { id: jobId, status: 'gathering', firecrawl_job_id: fcId };
  } catch (err) {
    await failJob(jobId, 'Firecrawl Agent submit failed: ' + err.message);
    return { id: jobId, status: 'failed', error: err.message };
  }
}

/**
 * Process one job that is in 'gathering' or 'synthesizing'. Called by the
 * background poller for each candidate job. Safe to call concurrently from
 * one process — each call wraps its terminal write in a single transaction.
 */
export async function advanceJob(jobId) {
  const r = await query(`
    SELECT id, type, status, firecrawl_job_id
      FROM research_jobs
     WHERE id = $1
  `, [jobId]);
  if (!r.rows.length) return { id: jobId, skipped: true, reason: 'not_found' };
  const job = r.rows[0];
  if (!['gathering','synthesizing'].includes(job.status)) {
    return { id: jobId, status: job.status, skipped: true };
  }
  if (!job.firecrawl_job_id) {
    await failJob(jobId, 'In gathering/synthesizing with no firecrawl_job_id');
    return { id: jobId, status: 'failed' };
  }

  let agentResp;
  try {
    agentResp = await agentStatus(job.firecrawl_job_id);
  } catch (err) {
    // Transient — leave the job in place; the next poll tick retries
    return { id: jobId, status: job.status, polled: false, error: err.message };
  }

  if (agentResp.status === 'failed') {
    await failJob(jobId, 'Firecrawl Agent reported failure: ' + (agentResp.error || 'unknown'));
    return { id: jobId, status: 'failed' };
  }
  if (agentResp.status !== 'completed') {
    // still processing — no-op, leave in 'gathering'
    return { id: jobId, status: job.status, polled: true };
  }

  // Persist the raw completion payload FIRST (defensively — even if parse
  // fails, we want to be able to inspect what came back from Firecrawl).
  await query(`
    UPDATE research_jobs
       SET status = 'synthesizing',
           firecrawl_payload = firecrawl_payload || $2::jsonb
     WHERE id = $1
  `, [
    jobId,
    JSON.stringify({
      completion_raw: agentResp.raw,
      completion_data_shape: shapeOf(agentResp.data),
      completed_polled_at: new Date().toISOString(),
    }),
  ]);

  // If Firecrawl returned status=completed but data is null/empty, that's
  // NOT a successful empty report — it's a soft failure (usually wrong model
  // tier, schema mismatch, or quota issue). Mark as failed with a useful
  // message so the user can retry rather than seeing an "Untitled" report.
  if (!hasUsableData(agentResp.data)) {
    const creditsHint = agentResp.raw?.creditsUsed === 0
      ? ' (Firecrawl charged 0 credits — agent likely rejected the request silently; check model + schema).'
      : '';
    await failJob(jobId, 'Firecrawl Agent returned no data.' + creditsHint);
    return { id: jobId, status: 'failed' };
  }

  try {
    const persisted = await withTransaction(async (client) => {
      const result = await persistReport(client, jobId, agentResp.data);
      const snowball = await ingestDerivedEntities(client, jobId, result.derived_entities);

      // Update job counters + status
      await client.query(`
        UPDATE research_jobs
           SET status = 'ready',
               ready_at = now(),
               source_count = $2,
               section_count = $3,
               citation_count = $4,
               firecrawl_payload = firecrawl_payload || $5::jsonb
         WHERE id = $1
      `, [
        jobId,
        result.source_count,
        result.section_count,
        result.citation_count,
        JSON.stringify({ completed_at: new Date().toISOString(), snowball }),
      ]);
      return { ...result, snowball };
    });
    return { id: jobId, status: 'ready', ...persisted };
  } catch (err) {
    await failJob(jobId, 'Parse/ingest failed: ' + err.message);
    return { id: jobId, status: 'failed', error: err.message };
  }
}

// True if `data` contains a non-empty, useful structure we can attempt to
// parse. Catches the Firecrawl "completed with data:null" silent-reject path.
function hasUsableData(d) {
  if (d === null || d === undefined) return false;
  if (typeof d === 'string') return d.trim().length > 0;
  if (Array.isArray(d))  return d.length > 0;
  if (typeof d === 'object') return Object.keys(d).length > 0;
  return true;
}

// Compact shape descriptor for debugging — names the top-level keys + nesting.
function shapeOf(v, depth = 0) {
  if (depth > 3) return '…';
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array[${v.length}]`;
  if (typeof v !== 'object') return typeof v;
  return Object.fromEntries(Object.entries(v).slice(0, 12).map(([k, x]) => [k, shapeOf(x, depth + 1)]));
}

/**
 * Called by the poller every N seconds. Picks up all queued jobs (fires them)
 * and all in-flight jobs (advances them). Sequential to keep Firecrawl bills
 * predictable and to avoid hammering /v1/agent/:id under heavy load.
 */
export async function tick() {
  const r = await query(`
    SELECT id, status
      FROM research_jobs
     WHERE status IN ('queued','gathering','synthesizing')
     ORDER BY created_at
     LIMIT 20
  `);
  const out = [];
  for (const row of r.rows) {
    try {
      if (row.status === 'queued') {
        out.push(await runJob(row.id));
      } else {
        out.push(await advanceJob(row.id));
      }
    } catch (err) {
      out.push({ id: row.id, status: 'error', error: err.message });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

async function failJob(jobId, message) {
  await query(`
    UPDATE research_jobs
       SET status = 'failed',
           error_message = $2,
           ready_at = now()
     WHERE id = $1
  `, [jobId, String(message).slice(0, 1000)]);
}

async function loadJobForOrchestration(jobId) {
  const r = await query(`
    SELECT
      j.*,
      c.name           AS target_company_name,
      c.bin            AS target_company_bin,
      c.industry       AS target_company_industry,
      c.website        AS target_company_website,
      c.linkedin_url   AS target_company_linkedin_url,
      c.primary_registration_no AS target_company_primary_registration_no,
      c.city           AS target_company_city,
      p.full_name      AS target_person_name,
      p.pin            AS target_person_pin
    FROM research_jobs j
    LEFT JOIN companies c ON c.id = j.target_company_id
    LEFT JOIN people    p ON p.id = j.target_person_id
    WHERE j.id = $1
  `, [jobId]);
  return r.rows[0] || null;
}
