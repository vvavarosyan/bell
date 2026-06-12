// Enrichment orchestrator — runs one or more stages over one or more companies,
// tracks per-company status, records audit rows + cost.
//
// Stage dispatch table:
//   1 — Firecrawl LinkedIn discovery        (not yet implemented)
//   2 — Apify dev_fusion company profile    (not yet implemented)
//   3 — Apify harvestapi employees          (not yet implemented)
//   4 — Apify LinkedIn jobs (TBD actor)     (not yet implemented)
//   5 — Apify Google Maps                   (ready)

import { query } from '../db.js';
import * as stage1 from './stages/stage1.js';
import * as stage2 from './stages/stage2.js';
import * as stage3 from './stages/stage3.js';
import * as stage4 from './stages/stage4.js';
import * as stage5 from './stages/stage5.js';
import * as stage6 from './stages/stage6.js';
import * as stage7 from './local/harvester.js';
import * as stage8 from './local/finder.js';

const STAGES = {
  1: { module: stage1, label: 'Stage 1 — LinkedIn Discovery',         tool: 'firecrawl_spark_pro' },
  2: { module: stage2, label: 'Stage 2 — LinkedIn Company Profile',   tool: 'apify_dev_fusion_company' },
  3: { module: stage3, label: 'Stage 3 — LinkedIn Employees',         tool: 'apify_harvestapi_employees' },
  4: { module: stage4, label: 'Stage 4 — LinkedIn Jobs',              tool: 'apify_linkedin_jobs' },
  5: { module: stage5, label: 'Stage 5 — Google Maps',                tool: 'apify_google_maps' },
  6: { module: stage6, label: 'Stage 6 — Website Contacts',           tool: 'firecrawl_website_scrape' },
  7: { module: stage7, label: 'Stage 7 — Local Website Harvester',    tool: 'local_website_harvester' },
  8: { module: stage8, label: 'Stage 8 — Local Website Finder',       tool: 'local_website_finder' },
};

// (No more placeholders — every stage is implemented.)
const PLACEHOLDERS = {};

function stageInfo(stage) {
  return STAGES[stage] || PLACEHOLDERS[stage] || null;
}

/** All stages with implemented flag and label — for the UI. */
export function stageList() {
  return [1, 2, 3, 4, 5, 6, 7, 8].map(n => ({
    stage: n,
    label:  (STAGES[n] || PLACEHOLDERS[n]).label,
    implemented: !!STAGES[n],
  }));
}

/**
 * Run a single stage over a list of companies. Sequential (one Apify/Firecrawl
 * call at a time) to keep cost predictable and avoid actor concurrency limits.
 *
 * jobLog(msg) is optional and will be called with progress lines.
 */
export async function runStageForCompanies({ stage, companyIds, triggeredBy = null, jobLog = null }) {
  const info = stageInfo(stage);
  if (!info) throw new Error('Unknown stage: ' + stage);

  if (!Array.isArray(companyIds) || companyIds.length === 0) {
    throw new Error('No company IDs supplied');
  }

  const stageMod = info.module;
  jobLog?.(`▸ Initializing ${info.label}`);
  jobLog?.(`  Target set:           ${companyIds.length.toLocaleString()} compan${companyIds.length === 1 ? 'y' : 'ies'}`);

  // Fetch targets and drop anything archived or marked inactive.
  const fetchRes = await query(
    `SELECT * FROM companies WHERE id = ANY($1) ORDER BY id`,
    [companyIds]
  );
  const allCompanies = fetchRes.rows;
  const companies    = allCompanies.filter(c => !c.archived && c.is_active !== false);
  const skipped      = allCompanies.length - companies.length;
  if (skipped > 0) {
    jobLog?.(`  Filter:               ${skipped.toLocaleString()} archived/inactive excluded`);
  }
  if (companies.length === 0) {
    jobLog?.(`  ⊘ Nothing to enrich.`);
    return { stage, label: info.label, total: 0, done: 0, no_data: 0, failed: 0, usd: 0, skipped_archived: skipped };
  }
  jobLog?.(`  Active targets:       ${companies.length.toLocaleString()}`);
  jobLog?.(`  Engine:               ${info.tool}`);
  jobLog?.(`  Deploying agents…`);

  // Audit row
  const runRow = await query(`
    INSERT INTO enrichment_runs (stage, tool, target_kind, target_ids, status, started_at, triggered_by, progress_total)
    VALUES ($1, $2, 'company', $3, 'running', now(), $4, $5)
    RETURNING id
  `, [stage, info.tool, companies.map(c => c.id), triggeredBy, companies.length]);
  const runId = runRow.rows[0].id;

  let done = 0, noData = 0, failed = 0;
  let usdTotal = 0;
  const errors = [];

  // Bulk path: if the stage module exposes enrichCompanies(), use it.
  if (typeof stageMod.enrichCompanies === 'function') {
    try {
      const r = await stageMod.enrichCompanies(companies, (m) => jobLog?.(m));
      done     = r.done;
      noData   = r.no_data;
      failed   = r.failed;
      usdTotal = r.usd;
      await query(`UPDATE enrichment_runs SET progress_done = $2 WHERE id = $1`, [runId, companies.length]);
    } catch (err) {
      failed = companies.length;
      errors.push({ stage_level: true, error: err.message });
      jobLog?.(`  ✗ bulk run failed: ${err.message}`);
    }
  } else {
    // Per-company sequential path (for stages that haven't implemented bulk yet)
    for (let i = 0; i < companies.length; i++) {
      const company = companies[i];
      await query(`UPDATE companies SET stage${stage}_status = 'running' WHERE id = $1`, [company.id]);

      try {
        const result = await stageMod.enrichCompany(company);
        if (result.status === 'done')          done++;
        else if (result.status === 'no_data')  noData++;
        usdTotal += Number(result.usd || 0);
        const tag = result.status === 'done' ? '✓' : (result.status === 'no_data' ? '·' : '?');
        jobLog?.(`  ${tag} [${i+1}/${companies.length}] ${company.bin || '—'}  ${company.name}  — ${result.status}${result.reason ? ' ('+result.reason+')' : ''}`);
      } catch (err) {
        failed++;
        errors.push({ company_id: company.id, name: company.name, error: err.message });
        await query(
          `UPDATE companies SET stage${stage}_status = 'failed', stage${stage}_at = now() WHERE id = $1`,
          [company.id]
        );
        jobLog?.(`  ✗ [${i+1}/${companies.length}] ${company.bin || '—'}  ${company.name}  — failed: ${err.message}`);
      }

      await query(`UPDATE enrichment_runs SET progress_done = $2 WHERE id = $1`, [runId, i + 1]);
    }
  }

  // Final audit + cost
  await query(`
    UPDATE enrichment_runs
    SET status         = $2,
        completed_at   = now(),
        usd_used       = $3,
        output_summary = $4::jsonb,
        error_message  = $5
    WHERE id = $1
  `, [
    runId,
    failed === companies.length ? 'failed' : (failed > 0 ? 'partial' : 'completed'),
    usdTotal,
    JSON.stringify({ done, no_data: noData, failed, errors: errors.slice(0, 20) }),
    errors.length ? `${errors.length} error(s); see output_summary` : null,
  ]);

  await query(`
    INSERT INTO enrichment_credits (day, stage, tool, credits_used, usd_used, run_count)
    VALUES (current_date, $1, $2, $3, $4, 1)
    ON CONFLICT (day, stage, tool) DO UPDATE
      SET credits_used = enrichment_credits.credits_used + EXCLUDED.credits_used,
          usd_used     = enrichment_credits.usd_used + EXCLUDED.usd_used,
          run_count    = enrichment_credits.run_count + 1
  `, [stage, info.tool, companies.length, usdTotal]);

  return {
    run_id: runId,
    stage, label: info.label,
    total: companies.length,
    done, no_data: noData, failed,
    usd: usdTotal,
  };
}

/**
 * Full Enrichment — dependency-aware:
 *
 *   Step A (parallel, no inter-stage deps — both work from companies.name):
 *     Stage 1 — LinkedIn Discovery       (writes companies.linkedin_url)
 *     Stage 5 — Google Maps              (writes companies.website + phone)
 *
 *   GATE:  after Stage 1 finishes, we re-query each company. Stages 2/3/4 all
 *          benefit from a LinkedIn URL — running them on a company without one
 *          would burn Apify credits for a guaranteed-empty (or noisy) result.
 *          We pass only the LinkedIn-eligible subset down.
 *
 *   Step B (sequential, needs linkedin_url):
 *     Stage 2 — LinkedIn Company Profile (writes companies.website too)
 *     Stage 3 — LinkedIn Employees
 *     Stage 4 — LinkedIn Jobs
 *
 *   Step C (last — needs companies.website which may have been just populated
 *           by Stage 2 or Stage 5):
 *     Stage 6 — Website Contact Discovery
 *
 *   The gate + ordering are logged loudly so the admin can see how many
 *   companies were filtered out and why.
 */
export async function runFullEnrichment({ companyIds, triggeredBy = null, jobLog = null }) {
  jobLog?.(`▸▸▸ Full Enrichment sequence initiated`);
  jobLog?.(`    Target set: ${companyIds.length.toLocaleString()} compan${companyIds.length === 1 ? 'y' : 'ies'}`);
  jobLog?.(`    Step A — parallel: Stage 1 (LinkedIn Discovery) + Stage 5 (Google Maps)`);

  const [r1, r5] = await Promise.allSettled([
    runStageForCompanies({ stage: 1, companyIds, triggeredBy, jobLog: (m) => jobLog?.('  [S1] ' + m) }),
    runStageForCompanies({ stage: 5, companyIds, triggeredBy, jobLog: (m) => jobLog?.('  [S5] ' + m) }),
  ]);

  // -------- LinkedIn dependency gate -----------------------------------------
  // Re-load the companies AFTER Stage 1 ran so we see any newly-discovered
  // linkedin_urls. Only forward those into Stages 2-4 (which all hit Apify
  // and would otherwise spend on guaranteed-empty runs).
  const refreshed = await query(
    `SELECT id, name, website, linkedin_url, archived, is_active
     FROM companies WHERE id = ANY($1)`,
    [companyIds],
  );

  const eligibleLi = [];
  const skippedNoUrl = [];
  for (const row of refreshed.rows) {
    if (row.archived || row.is_active === false) continue;
    if (row.linkedin_url && /linkedin\.com\/company\//i.test(row.linkedin_url)) {
      eligibleLi.push(row.id);
    } else {
      skippedNoUrl.push(row);
    }
  }

  jobLog?.(`  ─ LinkedIn gate: Stages 2 / 3 / 4 work much better with a LinkedIn URL`);
  jobLog?.(`     • Eligible: ${eligibleLi.length.toLocaleString()} compan${eligibleLi.length === 1 ? 'y' : 'ies'} (Stage 1 found a LinkedIn page)`);
  if (skippedNoUrl.length > 0) {
    jobLog?.(`     • Skipping ${skippedNoUrl.length.toLocaleString()} compan${skippedNoUrl.length === 1 ? 'y' : 'ies'} with no LinkedIn URL — saves credits.`);
    if (skippedNoUrl.length <= 10) {
      for (const c of skippedNoUrl) jobLog?.(`        · ${c.name}`);
    } else {
      jobLog?.(`        · ${skippedNoUrl.slice(0, 5).map(c => c.name).join(', ')}, +${skippedNoUrl.length - 5} more`);
    }
  }

  const skippedShape = { skipped: true, reason: 'no_eligible_companies', done: 0, no_data: 0, failed: 0, usd: 0, total: 0 };
  let r2 = { status: 'fulfilled', value: skippedShape };
  let r3 = { status: 'fulfilled', value: skippedShape };
  let r4 = { status: 'fulfilled', value: skippedShape };

  if (eligibleLi.length > 0) {
    jobLog?.(`  Step B: Stage 2 (LinkedIn Company Profile) — ${eligibleLi.length} eligible`);
    r2 = await safeRun(() => runStageForCompanies({ stage: 2, companyIds: eligibleLi, triggeredBy, jobLog: (m) => jobLog?.('  [S2] ' + m) }));

    jobLog?.(`  Step C: Stage 3 (LinkedIn Employees) — ${eligibleLi.length} eligible`);
    r3 = await safeRun(() => runStageForCompanies({ stage: 3, companyIds: eligibleLi, triggeredBy, jobLog: (m) => jobLog?.('  [S3] ' + m) }));

    jobLog?.(`  Step D: Stage 4 (LinkedIn Jobs) — ${eligibleLi.length} eligible`);
    r4 = await safeRun(() => runStageForCompanies({ stage: 4, companyIds: eligibleLi, triggeredBy, jobLog: (m) => jobLog?.('  [S4] ' + m) }));
  } else {
    jobLog?.(`  ⊘ Skipping Stages 2 / 3 / 4 — no companies passed the LinkedIn gate.`);
  }

  // -------- Website gate for Stage 6 -----------------------------------------
  // Re-load AGAIN — Stage 2 (LinkedIn profile) + Stage 5 (Google Maps) both
  // populate companies.website, so the freshest signal is now in the DB.
  const refreshed6 = await query(
    `SELECT id, name, website, archived, is_active
     FROM companies WHERE id = ANY($1)`,
    [companyIds],
  );
  const eligibleSite = [];
  const skippedNoSite = [];
  for (const row of refreshed6.rows) {
    if (row.archived || row.is_active === false) continue;
    if (row.website && String(row.website).trim()) eligibleSite.push(row.id);
    else                                            skippedNoSite.push(row);
  }
  jobLog?.(`  ─ Website gate: Stage 6 needs companies.website`);
  jobLog?.(`     • Eligible: ${eligibleSite.length.toLocaleString()} compan${eligibleSite.length === 1 ? 'y' : 'ies'}`);
  if (skippedNoSite.length > 0) {
    jobLog?.(`     • Skipping ${skippedNoSite.length.toLocaleString()} with no website on file.`);
  }

  let r6 = { status: 'fulfilled', value: skippedShape };
  if (eligibleSite.length > 0) {
    jobLog?.(`  Step E: Stage 6 (Website Contact Discovery) — ${eligibleSite.length} eligible`);
    r6 = await safeRun(() => runStageForCompanies({ stage: 6, companyIds: eligibleSite, triggeredBy, jobLog: (m) => jobLog?.('  [S6] ' + m) }));
  } else {
    jobLog?.(`  ⊘ Skipping Stage 6 — no companies have a website on file.`);
  }

  jobLog?.(`▸▸▸ Full Enrichment complete.`);

  return {
    stage1: unwrap(r1),
    stage2: unwrap(r2),
    stage3: unwrap(r3),
    stage4: unwrap(r4),
    stage5: unwrap(r5),
    stage6: unwrap(r6),
    eligible_for_linkedin: eligibleLi.length,
    eligible_for_website:  eligibleSite.length,
    skipped_no_linkedin:   skippedNoUrl.length,
    skipped_no_website:    skippedNoSite.length,
  };
}

function unwrap(r) {
  if (!r) return null;
  if (r.status === 'fulfilled') return r.value;
  if (r.status === 'rejected')  return { error: r.reason?.message || String(r.reason) };
  return r;
}
async function safeRun(fn) {
  try { return { status: 'fulfilled', value: await fn() }; }
  catch (err) { return { status: 'rejected', reason: err }; }
}

/**
 * Local Harvest Sweep — the continuous-enrichment workhorse. Over a batch of
 * the most-incomplete active companies it:
 *   Phase 1 — Stage 8 (Website Finder) on companies that have NO website and
 *             were never checked, to discover their site.
 *   Phase 2 — Stage 7 (Website Harvester) on companies that HAVE a website
 *             (including any just found) but were never harvested.
 *
 * Priority: lowest Bell Score first (most to gain), then id. `limit` caps each
 * phase so the admin controls volume (and search-engine exposure). Fully local,
 * $0, idempotent — safe to run repeatedly; each pass advances the frontier.
 */
export async function runHarvestSweep({ limit = 100, triggeredBy = null, jobLog = null }) {
  const cap = Math.max(1, Math.min(Number(limit) || 100, 2000));
  jobLog?.(`▸▸▸ Local Harvest Sweep — batch size ${cap}`);

  // Phase 1 — find websites for companies that have none.
  const findRows = await query(
    `SELECT id FROM companies
      WHERE COALESCE(archived, false) = false AND is_active IS NOT false
        AND (website IS NULL OR btrim(website) = '')
        AND stage8_at IS NULL
      ORDER BY bell_score ASC, id ASC
      LIMIT $1`, [cap]);
  const findIds = findRows.rows.map(r => r.id);
  let find = { done: 0, no_data: 0, failed: 0 };
  if (findIds.length) {
    jobLog?.(`  Phase 1 — Website Finder on ${findIds.length} company(ies) with no website…`);
    find = await safeRun(() => runStageForCompanies({ stage: 8, companyIds: findIds, triggeredBy, jobLog: (m) => jobLog?.('  [S8] ' + m) })).then(unwrap);
  } else {
    jobLog?.(`  Phase 1 — no un-checked website-less companies. Skipping.`);
  }

  // Phase 2 — harvest companies that have a website but were never harvested
  // (includes any just discovered in Phase 1).
  const harvestRows = await query(
    `SELECT id FROM companies
      WHERE COALESCE(archived, false) = false AND is_active IS NOT false
        AND website IS NOT NULL AND btrim(website) <> ''
        AND stage7_at IS NULL
      ORDER BY bell_score ASC, id ASC
      LIMIT $1`, [cap]);
  const harvestIds = harvestRows.rows.map(r => r.id);
  let harvest = { done: 0, no_data: 0, failed: 0 };
  if (harvestIds.length) {
    jobLog?.(`  Phase 2 — Website Harvester on ${harvestIds.length} company(ies) with a website…`);
    harvest = await safeRun(() => runStageForCompanies({ stage: 7, companyIds: harvestIds, triggeredBy, jobLog: (m) => jobLog?.('  [S7] ' + m) })).then(unwrap);
  } else {
    jobLog?.(`  Phase 2 — no un-harvested companies with a website. Skipping.`);
  }

  // How much frontier remains, so the admin knows whether to run again.
  const remain = await query(
    `SELECT
       (SELECT count(*) FROM companies WHERE COALESCE(archived,false)=false AND is_active IS NOT false AND (website IS NULL OR btrim(website)='') AND stage8_at IS NULL) AS find_left,
       (SELECT count(*) FROM companies WHERE COALESCE(archived,false)=false AND is_active IS NOT false AND website IS NOT NULL AND btrim(website)<>'' AND stage7_at IS NULL) AS harvest_left`);
  const { find_left, harvest_left } = remain.rows[0] || {};
  jobLog?.(`▸▸▸ Sweep complete. Found ${find?.done || 0} site(s); harvested ${harvest?.done || 0}. Remaining — to find: ${find_left}, to harvest: ${harvest_left}.`);

  return {
    found: find?.done || 0, find_attempted: findIds.length,
    harvested: harvest?.done || 0, harvest_attempted: harvestIds.length,
    find_left: Number(find_left || 0), harvest_left: Number(harvest_left || 0),
  };
}
