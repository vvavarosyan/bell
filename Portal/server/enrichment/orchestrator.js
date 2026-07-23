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
import * as stage9 from './local/relationships.js';
import * as stage10 from './local/email_finder.js';
import * as stage11 from './local/company_facts.js';
import * as stage12 from './local/tech_stack.js';

const STAGES = {
  1: { module: stage1, label: 'Stage 1 — LinkedIn Discovery',         tool: 'firecrawl_spark_pro' },
  2: { module: stage2, label: 'Stage 2 — LinkedIn Company Profile',   tool: 'apify_dev_fusion_company' },
  3: { module: stage3, label: 'Stage 3 — LinkedIn Employees',         tool: 'apify_harvestapi_employees' },
  4: { module: stage4, label: 'Stage 4 — LinkedIn Jobs',              tool: 'apify_linkedin_jobs' },
  5: { module: stage5, label: 'Stage 5 — Google Maps',                tool: 'apify_google_maps' },
  6: { module: stage6, label: 'Stage 6 — Website Contacts',           tool: 'firecrawl_website_scrape' },
  7: { module: stage7, label: 'Local Engine 2 — Website Harvester',   tool: 'local_website_harvester' },
  8: { module: stage8, label: 'Local Engine 1 — Website Finder',      tool: 'local_website_finder' },
  9: { module: stage9, label: 'Local Engine 3 — Network Mapper',      tool: 'local_relationship_mapper' },
  10: { module: stage10, label: 'Local Engine 4 — Email Finder',       tool: 'local_email_finder' },
  11: { module: stage11, label: 'Local Engine 5 — Company Facts',      tool: 'local_company_facts' },
  12: { module: stage12, label: 'Local Engine 6 — Tech Stack',         tool: 'local_tech_stack' },
};

// (No more placeholders — every stage is implemented.)
const PLACEHOLDERS = {};

function stageInfo(stage) {
  return STAGES[stage] || PLACEHOLDERS[stage] || null;
}

/** All stages with implemented flag and label — for the UI. */
export function stageList() {
  return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(n => ({
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
  let emailsWritten = 0;
  let factsWritten = 0;
  let techWritten = 0;
  const errors = [];

  // Bulk path: if the stage module exposes enrichCompanies(), use it.
  if (typeof stageMod.enrichCompanies === 'function') {
    try {
      const r = await stageMod.enrichCompanies(companies, (m) => jobLog?.(m));
      done     = r.done;
      noData   = r.no_data;
      failed   = r.failed;
      usdTotal = r.usd;
      emailsWritten = Number(r.emails || 0);
      factsWritten = Number(r.facts || 0);
      techWritten = Number(r.tech || 0);   // Engine 6 — without this the dashboard's Tech counter stays 0
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
    emails: emailsWritten,
    facts: factsWritten,
    tech: techWritten,
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
    jobLog?.(`  Phase 1 — Engine 1 (Website Finder) on ${findIds.length} company(ies) with no website…`);
    find = await safeRun(() => runStageForCompanies({ stage: 8, companyIds: findIds, triggeredBy, jobLog: (m) => jobLog?.('  [E1] ' + m) })).then(unwrap);
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
  let harvestIds = harvestRows.rows.map(r => r.id);
  // THE FRESHNESS CYCLE (Val's decision, 2026-07-23: "100% of the database under 100%
  // time checking, monitoring and enrichment — nonstop"). When nothing is NEW, re-harvest
  // the STALEST records so accuracy keeps rising forever, oldest-first. Two floors, both
  // deliberate: a site is not re-read within 7 days (its data doesn't change hourly, and
  // hammering the same hosts in a tight loop is impolite scraping), and a FAILED site is
  // re-tried after 14 days (dead sites do come back to life — 1,494 sat unretried).
  if (!harvestIds.length) {
    const stale = await query(
      `SELECT id FROM companies
        WHERE COALESCE(archived, false) = false AND is_active IS NOT false
          AND website IS NOT NULL AND btrim(website) <> ''
          AND ( (stage7_status = 'failed' AND stage7_at < now() - interval '14 days')
             OR (stage7_status <> 'failed' AND stage7_at < now() - interval '7 days') )
        ORDER BY stage7_at ASC, id ASC
        LIMIT $1`, [cap]);
    harvestIds = stale.rows.map(r => r.id);
    if (harvestIds.length) jobLog?.(`  Phase 2 — freshness cycle: nothing new, re-harvesting the ${harvestIds.length} stalest record(s).`);
  }
  let harvest = { done: 0, no_data: 0, failed: 0 };
  if (harvestIds.length) {
    jobLog?.(`  Phase 2 — Engine 2 (Website Harvester) on ${harvestIds.length} company(ies) with a website…`);
    harvest = await safeRun(() => runStageForCompanies({ stage: 7, companyIds: harvestIds, triggeredBy, jobLog: (m) => jobLog?.('  [E2] ' + m) })).then(unwrap);
  } else {
    jobLog?.(`  Phase 2 — no un-harvested companies with a website. Skipping.`);
  }

  // Phase 3 — map the business network (partners/affiliates/competitors) for
  // companies that have a website but were never mapped (includes any harvested
  // in Phase 2). Run AFTER harvest so logos/partner pages are already known.
  const mapRows = await query(
    `SELECT id FROM companies
      WHERE COALESCE(archived, false) = false AND is_active IS NOT false
        AND website IS NOT NULL AND btrim(website) <> ''
        AND stage9_at IS NULL
      ORDER BY bell_score ASC, id ASC
      LIMIT $1`, [cap]);
  const mapIds = mapRows.rows.map(r => r.id);
  let mapped = { done: 0, no_data: 0, failed: 0 };
  if (mapIds.length) {
    jobLog?.(`  Phase 3 — Engine 3 (Network Mapper) on ${mapIds.length} company(ies) with a website…`);
    mapped = await safeRun(() => runStageForCompanies({ stage: 9, companyIds: mapIds, triggeredBy, jobLog: (m) => jobLog?.('  [E3] ' + m) })).then(unwrap);
  } else {
    jobLog?.(`  Phase 3 — no un-mapped companies with a website. Skipping.`);
  }

  // Phase 4 — find + verify decision-maker emails for companies that have a
  // website and were already harvested (so people + observed emails exist) but
  // were never email-processed. Runs last; writes ONLY verified addresses.
  const emailRows = await query(
    `SELECT id FROM companies
      WHERE COALESCE(archived, false) = false AND is_active IS NOT false
        AND website IS NOT NULL AND btrim(website) <> ''
        AND stage7_at IS NOT NULL
        AND stage10_at IS NULL
      ORDER BY bell_score ASC, id ASC
      LIMIT $1`, [cap]);
  const emailIds = emailRows.rows.map(r => r.id);
  let email = { done: 0, no_data: 0, failed: 0, emails: 0 };
  if (emailIds.length) {
    jobLog?.(`  Phase 4 — Engine 4 (Email Finder) on ${emailIds.length} company(ies) with a harvested website…`);
    email = await safeRun(() => runStageForCompanies({ stage: 10, companyIds: emailIds, triggeredBy, jobLog: (m) => jobLog?.('  [E4] ' + m) })).then(unwrap);
  } else {
    jobLog?.(`  Phase 4 — no companies ready for email finding. Skipping.`);
  }

  // Phase 5 — pull capital / financials / shareholders from the company's own
  // website (gated: only sites that actually mention them get a Firecrawl
  // extract). Runs after harvest so the website + pages are already known.
  const factsRows = await query(
    `SELECT id FROM companies
      WHERE COALESCE(archived, false) = false AND is_active IS NOT false
        AND website IS NOT NULL AND btrim(website) <> ''
        AND stage7_at IS NOT NULL
        AND stage11_at IS NULL
      ORDER BY bell_score ASC, id ASC
      LIMIT $1`, [cap]);
  const factsIds = factsRows.rows.map(r => r.id);
  let companyFacts = { done: 0, no_data: 0, failed: 0, facts: 0 };
  if (factsIds.length) {
    jobLog?.(`  Phase 5 — Engine 5 (Company Facts) on ${factsIds.length} company(ies)…`);
    companyFacts = await safeRun(() => runStageForCompanies({ stage: 11, companyIds: factsIds, triggeredBy, jobLog: (m) => jobLog?.('  [E5] ' + m) })).then(unwrap);
  } else {
    jobLog?.(`  Phase 5 — no companies ready for facts. Skipping.`);
  }

  // Phase 6 — fingerprint what the company's website RUNS (CMS / commerce /
  // analytics / chat / payments — Engine 6, Stage 12). Independent of harvest
  // state: any company with a website qualifies. 100% local, $0.
  // Fail-soft: if migration 076 hasn't applied yet (daemon started before the
  // Portal restart), skip Engine 6 rather than killing the whole sweep round.
  const techRows = await query(
    `SELECT id FROM companies
      WHERE COALESCE(archived, false) = false AND is_active IS NOT false
        AND website IS NOT NULL AND btrim(website) <> ''
        AND stage12_at IS NULL
      ORDER BY bell_score ASC, id ASC
      LIMIT $1`, [cap]).catch((e) => {
    jobLog?.(`  Phase 6 — skipped (schema not ready: ${e.message}). Restart the local Portal to apply migration 076.`);
    return { rows: [] };
  });
  const techIds = techRows.rows.map(r => r.id);
  let techScan = { done: 0, no_data: 0, failed: 0, tech: 0 };
  if (techIds.length) {
    jobLog?.(`  Phase 6 — Engine 6 (Tech Stack) on ${techIds.length} company(ies)…`);
    techScan = await safeRun(() => runStageForCompanies({ stage: 12, companyIds: techIds, triggeredBy, jobLog: (m) => jobLog?.('  [E6] ' + m) })).then(unwrap);
  } else {
    jobLog?.(`  Phase 6 — no companies ready for tech scan. Skipping.`);
  }

  // How much frontier remains, so the admin knows whether to run again.
  const remain = await query(
    `SELECT
       (SELECT count(*) FROM companies WHERE COALESCE(archived,false)=false AND is_active IS NOT false AND (website IS NULL OR btrim(website)='') AND stage8_at IS NULL) AS find_left,
       (SELECT count(*) FROM companies WHERE COALESCE(archived,false)=false AND is_active IS NOT false AND website IS NOT NULL AND btrim(website)<>'' AND stage7_at IS NULL) AS harvest_left,
       (SELECT count(*) FROM companies WHERE COALESCE(archived,false)=false AND is_active IS NOT false AND website IS NOT NULL AND btrim(website)<>'' AND stage9_at IS NULL) AS map_left,
       (SELECT count(*) FROM companies WHERE COALESCE(archived,false)=false AND is_active IS NOT false AND website IS NOT NULL AND btrim(website)<>'' AND stage7_at IS NOT NULL AND stage10_at IS NULL) AS email_left,
       (SELECT count(*) FROM companies WHERE COALESCE(archived,false)=false AND is_active IS NOT false AND website IS NOT NULL AND btrim(website)<>'' AND stage7_at IS NOT NULL AND stage11_at IS NULL) AS facts_left,
       (SELECT count(*) FROM companies WHERE COALESCE(archived,false)=false AND is_active IS NOT false AND website IS NOT NULL AND btrim(website)<>'' AND stage12_at IS NULL) AS tech_left`)
    .catch(() => ({ rows: [{}] }));   // pre-076 schema → frontier unknown, sweep still completes
  const { find_left, harvest_left, map_left, email_left, facts_left, tech_left } = remain.rows[0] || {};
  jobLog?.(`▸▸▸ Sweep complete. Found ${find?.done || 0} site(s); harvested ${harvest?.done || 0}; mapped ${mapped?.done || 0}; emailed ${email?.emails || 0}; facts ${companyFacts?.facts || 0}; tech ${techScan?.tech || 0}. Remaining — find: ${find_left}, harvest: ${harvest_left}, map: ${map_left}, email: ${email_left}, facts: ${facts_left}, tech: ${tech_left}.`);

  return {
    found: find?.done || 0, find_attempted: findIds.length,
    harvested: harvest?.done || 0, harvest_attempted: harvestIds.length,
    mapped: mapped?.done || 0, map_attempted: mapIds.length,
    emails: email?.emails || 0, email_attempted: emailIds.length,
    facts: companyFacts?.facts || 0, facts_attempted: factsIds.length,
    tech: techScan?.tech || 0, tech_attempted: techIds.length,
    find_left: Number(find_left || 0), harvest_left: Number(harvest_left || 0), map_left: Number(map_left || 0), email_left: Number(email_left || 0), facts_left: Number(facts_left || 0), tech_left: Number(tech_left || 0),
  };
}

/**
 * Run all three LOCAL engines (Engine 1 Website Finder → Engine 2 Website
 * Harvester → Engine 3 Network Mapper) over a SPECIFIC, admin-selected set of
 * companies — the manual counterpart to the automatic Harvest Sweep. Unlike the
 * sweep (which picks the frontier itself by Bell Score), this runs on exactly
 * the ids passed in, in order, so a freshly-found website is harvested and
 * mapped in the same pass. Each engine no-ops on companies it can't act on
 * (Finder skips those that already have a site; Harvester/Mapper skip those with
 * none). Fully local, $0, idempotent.
 */
export async function runLocalEnginesForCompanies({ companyIds, triggeredBy = null, jobLog = null }) {
  const ids = (companyIds || []).map(Number).filter(Number.isFinite);
  jobLog?.(`▸▸▸ Local Engines 1–3 on ${ids.length} selected compan${ids.length === 1 ? 'y' : 'ies'}`);
  if (!ids.length) {
    jobLog?.(`  ⊘ No companies selected.`);
    return { selected: 0, found: 0, harvested: 0, mapped: 0 };
  }

  jobLog?.(`  Engine 1 — Website Finder (acts only on companies with no site)…`);
  const find = await safeRun(() => runStageForCompanies({ stage: 8, companyIds: ids, triggeredBy, jobLog: (m) => jobLog?.('  [E1] ' + m) })).then(unwrap);

  jobLog?.(`  Engine 2 — Website Harvester…`);
  const harvest = await safeRun(() => runStageForCompanies({ stage: 7, companyIds: ids, triggeredBy, jobLog: (m) => jobLog?.('  [E2] ' + m) })).then(unwrap);

  jobLog?.(`  Engine 3 — Network Mapper…`);
  const mapped = await safeRun(() => runStageForCompanies({ stage: 9, companyIds: ids, triggeredBy, jobLog: (m) => jobLog?.('  [E3] ' + m) })).then(unwrap);

  jobLog?.(`  Engine 4 — Email Finder…`);
  const email = await safeRun(() => runStageForCompanies({ stage: 10, companyIds: ids, triggeredBy, jobLog: (m) => jobLog?.('  [E4] ' + m) })).then(unwrap);

  jobLog?.(`  Engine 5 — Company Facts…`);
  const companyFacts = await safeRun(() => runStageForCompanies({ stage: 11, companyIds: ids, triggeredBy, jobLog: (m) => jobLog?.('  [E5] ' + m) })).then(unwrap);

  jobLog?.(`  Engine 6 — Tech Stack…`);
  const techScan = await safeRun(() => runStageForCompanies({ stage: 12, companyIds: ids, triggeredBy, jobLog: (m) => jobLog?.('  [E6] ' + m) })).then(unwrap);

  jobLog?.(`▸▸▸ Done. Found ${find?.done || 0} site(s); harvested ${harvest?.done || 0}; mapped ${mapped?.done || 0}; emailed ${email?.emails || 0}; facts ${companyFacts?.facts || 0}; tech ${techScan?.tech || 0}.`);
  return {
    selected: ids.length,
    found: find?.done || 0, find_attempted: find?.total || 0,
    harvested: harvest?.done || 0, harvest_attempted: harvest?.total || 0,
    mapped: mapped?.done || 0, map_attempted: mapped?.total || 0,
    emailed: email?.emails || 0,
    facts: companyFacts?.facts || 0,
    tech: techScan?.tech || 0,
  };
}
