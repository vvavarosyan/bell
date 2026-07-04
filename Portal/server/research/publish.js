// Research → Market Feed release.
//
// A finished research report (status='ready') is exclusive to the commissioning
// tenant until it RELEASES into the public Market Feed. Release:
//   1) publishes the report (is_published + public_slug + published_at)
//   2) emits an ANONYMIZED feed_events row (kind='research') carrying the FULL
//      report sections in payload — the commissioning tenant is never named
//   3) stamps research_jobs.feed_released_at so it never double-releases
//
// Two entry points:
//   • releaseResearchToFeed(jobId)  — used by the manual "Release now" route AND
//                                     the auto-release producer
//   • emitResearchEvents()          — producer: auto-release everything past the
//                                     exclusivity window (setting, default 0 days)

import { query } from '../db.js';

// Report types we never publish publicly (PDPPL / People-lockdown consistency).
// Person research stays PRIVATE to the commissioner — Bell tells users it can't
// expose individual decision-maker data, so it must not publish person dossiers
// to the public feed / marketing site. Env-overridable: set
// BDI_RESEARCH_PRIVATE_TYPES='' to publish everything, or add types to widen.
const PRIVATE_RESEARCH_TYPES = new Set(
  (process.env.BDI_RESEARCH_PRIVATE_TYPES ?? 'person')
    .split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
);

const TYPE_CATEGORY = {
  company: 'corporate', person: 'corporate', sector: 'economic',
  theme: 'economic', region: 'economic', regulation: 'legal',
};

function slugify(s) {
  return String(s || 'report').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'report';
}

export async function getExclusivityDays() {
  try {
    const r = await query(`SELECT value FROM settings WHERE key = 'research_feed_exclusivity_days'`);
    const v = r.rows.length ? Number(r.rows[0].value) : 0;
    return Number.isFinite(v) && v >= 0 ? v : 0;
  } catch { return 0; }
}

/**
 * Release ONE research job's report to the public feed. Idempotent: a job that
 * already released (feed_released_at set) or opted out is a no-op. Returns a
 * small status object.
 */
export async function releaseResearchToFeed(jobId) {
  const jr = await query(`
    SELECT j.id, j.type, j.status, j.target_company_id, j.target_label,
           j.feed_optout, j.feed_released_at,
           r.id AS report_id, r.title, r.summary, r.sections, r.public_slug, r.is_published
      FROM research_jobs j
      JOIN research_reports r ON r.job_id = j.id
     WHERE j.id = $1
  `, [jobId]);
  if (!jr.rows.length) return { id: jobId, released: false, reason: 'no_report' };
  const j = jr.rows[0];

  if (j.status !== 'ready') return { id: jobId, released: false, reason: 'not_ready' };
  if (j.feed_released_at)   return { id: jobId, released: false, reason: 'already_released' };
  if (PRIVATE_RESEARCH_TYPES.has(String(j.type).toLowerCase()))
    return { id: jobId, released: false, reason: 'type_private' };
  const sections = Array.isArray(j.sections) ? j.sections : [];
  if (!sections.length)     return { id: jobId, released: false, reason: 'empty_report' };

  // 1) Publish the report (full report becomes public).
  const slug = j.public_slug || (slugify(j.title) + '-' + j.report_id);
  await query(`
    UPDATE research_reports
       SET is_published = true,
           public_slug  = COALESCE(public_slug, $2),
           published_at = COALESCE(published_at, now()),
           updated_at   = now()
     WHERE id = $1
  `, [j.report_id, slug]);

  // 2) Anonymized feed event — NO tenant identity. Full sections + the citation
  //    sources (1-indexed) in payload so the in-app feed can link [1],[2],….
  const srcRows = await query(
    `SELECT url, label FROM research_sources WHERE job_id = $1 ORDER BY id`, [j.id]);
  const category = TYPE_CATEGORY[j.type] || 'corporate';
  const linked = j.target_company_id ? [Number(j.target_company_id)] : [];
  await query(`
    INSERT INTO feed_events
      (kind, ref_table, ref_id, title, summary, url, category, source_name,
       importance, linked_company_ids, payload, occurred_at)
    VALUES ('research', 'research_reports', $1, $2, $3, $4, $5, 'Bell Research',
            0.7, $6::bigint[], $7::jsonb, now())
    ON CONFLICT (kind, ref_table, ref_id) DO NOTHING
  `, [
    j.report_id,
    j.title,
    j.summary,
    '/research/' + slug,
    category,
    linked,
    JSON.stringify({
      job_id: j.id, report_id: j.report_id, public_slug: slug,
      job_type: j.type, target_label: j.target_label,
      sections,                       // FULL report — public per Val's choice
      sources: srcRows.rows,          // 1-indexed citation targets for [N] links
    }),
  ]);

  // 3) Stamp release so it never double-fires.
  await query(`UPDATE research_jobs SET feed_released_at = now() WHERE id = $1`, [jobId]);

  return { id: jobId, released: true, public_slug: slug };
}

/**
 * Release-on-completion helper for the orchestrator: publish a just-ready
 * report immediately when there is NO exclusivity window (the default 0), so it
 * reaches the Market Feed + marketing site without waiting for the producer
 * tick. When a window is configured (>0 days) the producer releases it later.
 */
export async function maybeReleaseOnComplete(jobId) {
  // Val 2026-07-04: research ALWAYS publishes immediately on completion — no
  // exclusivity window, no keep-private. Person type still stays private via
  // releaseResearchToFeed's type guard.
  return releaseResearchToFeed(jobId);
}

/**
 * Producer: auto-release every ready report whose exclusivity window has passed
 * and that hasn't opted out / already released. Runs on the always-on engine.
 */
export async function emitResearchEvents() {
  // Val 2026-07-04: publish EVERY ready report immediately — no exclusivity
  // window, no opt-out. Person type stays private. This ALSO back-publishes any
  // previously-completed reports that never released (LIMIT 200 to drain the
  // backlog in one pass).
  const due = await query(`
    SELECT j.id
      FROM research_jobs j
      JOIN research_reports r ON r.job_id = j.id
     WHERE j.status = 'ready'
       AND j.feed_released_at IS NULL
       AND NOT (lower(j.type) = ANY($1::text[]))
       AND jsonb_array_length(COALESCE(r.sections, '[]'::jsonb)) > 0
     ORDER BY j.ready_at
     LIMIT 200
  `, [[...PRIVATE_RESEARCH_TYPES]]);

  let released = 0;
  for (const row of due.rows) {
    try {
      const res = await releaseResearchToFeed(row.id);
      if (res.released) released++;
    } catch (e) {
      console.error('[research-feed] release failed for job', row.id, '—', e.message);
    }
  }
  return { emitted: released };
}
