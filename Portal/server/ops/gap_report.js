// Weekly data-gap report — emailed to Val, so a new gap surfaces on its own.
//
// Val's rule (2026-07-21): "make sure to catch these gaps always and make sure
// Bell utilizes 100% of the data that enters Bell." He caught the Yateem and DOC
// gaps by eye; that is the wrong way round. This mails the same numbers the
// Data Gap Audit prints, every Sunday, so the software reports on itself.
//
// ⚠️ IT MUST RUN ON THE ENGINE BOX, NOT PRODUCTION (moved 2026-08-06).
// It used to ride the outreach scheduler tick, which runs on app.bell.qa. But this report's
// headline metric — "data seen but not kept" — is computed with
// `EXISTS (SELECT 1 FROM website_candidates …)`, and website_candidates is LOCAL-ONLY: it is not
// in MIRROR_TABLES, so on production that table is empty. The query did not error; it quietly
// returned 0 for every "lost" figure and mailed "Nothing is being discarded right now."
// The one report meant to catch silent data loss was itself silently wrong.
// It now runs from the nightly sweep on the engine box, against the canonical database.
//
// It remains an internal ops mail to one address — never marketing, so it never touches consent
// or unsubscribe machinery.

import { sendEmail } from '../lib/email.js';
import { qatarParts } from '../lib/qatar_time.js';
import { getState, setState } from '../outreach/machine.js';
import { collectGaps } from '../scripts/data_gap_audit.js';
import { query } from '../db.js';
import { jobHealth, silentSources } from './job_log.js';

// A source that has stopped producing is invisible until someone counts the days. MOCI and QCCI
// together are 88% of Bell's provenance and had gone 55 and 46 days without a write before
// anyone noticed; Kahramaa produced nothing for 14 nights while reporting success.
const QUIET_DAYS = 21;
async function quietSources() {
  try {
    const r = await query(`
      SELECT source,
             count(*)::int AS rows,
             max(last_seen_at) AS last_seen,
             (EXTRACT(EPOCH FROM (now() - max(last_seen_at))) / 86400)::int AS days_quiet
        FROM company_sources
       GROUP BY source
      HAVING max(last_seen_at) < now() - ($1 || ' days')::interval
       ORDER BY count(*) DESC`, [QUIET_DAYS]);
    return r.rows;
  } catch { return []; }
}

const TO = process.env.BDI_OPS_EMAIL || 'hello@bell.qa';
const n = (v) => Number(v || 0).toLocaleString();

function buildReport(g, prev, quiet = [], jobs = [], deadSources = []) {
  const delta = (key, now) => {
    if (!prev || prev[key] == null) return '';
    const d = now - prev[key];
    if (!d) return ' <span style="color:#888">(no change)</span>';
    const better = d < 0;
    return ` <span style="color:${better ? '#16a34a' : '#dc2626'}">(${d > 0 ? '+' : ''}${n(d)})</span>`;
  };
  const lost = g.lost.locations + g.lost.emails + g.lost.phones;
  const rows = [
    ['Locations found but not stored', g.lost.locations, delta('loc', g.lost.locations)],
    ['Emails found but not stored', g.lost.emails, delta('email', g.lost.emails)],
    ['Phones found but not stored', g.lost.phones, delta('phone', g.lost.phones)],
  ];
  const held = [
    ['Addresses with no map pin', g.held.addr_no_pin],
    ['Website companies not on the map', g.held.site_no_pin],
    ['OpenStreetMap places awaiting review', g.held.osm_unreviewed],
  ];
  const html = `
  <div style="font:14px/1.6 -apple-system,Segoe UI,Roboto,sans-serif;color:#111;max-width:620px">
    <h2 style="margin:0 0 4px">Bell — weekly data check</h2>
    <p style="color:#555;margin:0 0 18px">Is Bell using everything that enters it?</p>

    <h3 style="margin:0 0 6px;font-size:15px">Data seen but not kept</h3>
    <p style="color:#555;margin:0 0 8px;font-size:13px">
      These were found while reading company websites but never made it into Bell.
      This is the check that would have caught DOC's missing branches.</p>
    <table style="border-collapse:collapse;width:100%;margin-bottom:18px">
      ${rows.map(([label, v, d]) => `<tr>
        <td style="padding:6px 0;border-bottom:1px solid #eee">${label}</td>
        <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600">${n(v)}${d}</td></tr>`).join('')}
    </table>

    <h3 style="margin:0 0 6px;font-size:15px">Held but not yet used</h3>
    <table style="border-collapse:collapse;width:100%;margin-bottom:18px">
      ${held.map(([label, v]) => `<tr>
        <td style="padding:6px 0;border-bottom:1px solid #eee">${label}</td>
        <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600">${n(v)}</td></tr>`).join('')}
    </table>

    ${quiet.length ? `
    <h3 style="margin:0 0 6px;font-size:15px;color:#b45309">Sources that have gone quiet</h3>
    <p style="color:#555;margin:0 0 8px;font-size:13px">
      No new rows in ${QUIET_DAYS}+ days. A source can keep reporting success while producing
      nothing — that is how Kahramaa sat dead for 14 nights.</p>
    <table style="border-collapse:collapse;width:100%;margin-bottom:18px">
      ${quiet.map((q) => `<tr>
        <td style="padding:6px 0;border-bottom:1px solid #eee">${q.source}</td>
        <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;color:#b45309;font-weight:600">${q.days_quiet} days</td></tr>`).join('')}
    </table>` : ''}

    ${deadSources.length ? `
    <h3 style="margin:0 0 6px;font-size:15px;color:#dc2626">Individual scan sources producing nothing</h3>
    <p style="color:#555;margin:0 0 8px;font-size:13px">
      The tender scan reads four portals and used to report ONE total. Three healthy portals hid
      Kahramaa's dead one for fourteen nights. Each source is now recorded separately — these have
      not produced a single successful run recently.</p>
    <table style="border-collapse:collapse;width:100%;margin-bottom:18px">
      ${deadSources.map((d) => `<tr>
        <td style="padding:6px 0;border-bottom:1px solid #eee">${d.kind.replace(':source', '')} → <strong>${d.source}</strong></td>
        <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;color:#dc2626;font-weight:600">${d.errors ? d.errors + ' failed' : d.runs + ' empty'} of ${d.runs} runs</td></tr>`).join('')}
    </table>` : ''}

    ${jobs.filter((j) => j.health !== 'ok' && j.health !== 'ad-hoc').length ? `
    <h3 style="margin:0 0 6px;font-size:15px;color:#b45309">Scheduled jobs needing a look</h3>
    <table style="border-collapse:collapse;width:100%;margin-bottom:18px">
      ${jobs.filter((j) => j.health !== 'ok' && j.health !== 'ad-hoc').map((j) => `<tr>
        <td style="padding:6px 0;border-bottom:1px solid #eee">${j.kind}</td>
        <td style="padding:6px 0;border-bottom:1px solid #eee;text-align:right;color:#b45309">${j.health}${j.hours_ago != null ? ` · ${j.hours_ago}h ago` : ''}</td></tr>`).join('')}
    </table>` : ''}

    <p style="margin:0 0 6px"><strong>Map coverage: ${g.coverage_pct}%</strong>
       — ${n(g.held.pinned)} of ${n(g.held.locations)} stored locations are on the map.</p>
    <p style="color:#555;font-size:13px;margin:14px 0 0">
      ${lost ? 'A "found but not kept" number above zero means something is being discarded — worth a look.'
             : 'Nothing is being discarded right now.'}
      Run <strong>Data Gap Audit.command</strong> any time for the full breakdown.</p>
  </div>`;
  const text = [
    'Bell — weekly data check', '',
    'Data seen but not kept:',
    `  locations: ${n(g.lost.locations)}`, `  emails: ${n(g.lost.emails)}`, `  phones: ${n(g.lost.phones)}`, '',
    'Held but not yet used:',
    `  addresses with no map pin: ${n(g.held.addr_no_pin)}`,
    `  website companies not on the map: ${n(g.held.site_no_pin)}`,
    `  OSM places awaiting review: ${n(g.held.osm_unreviewed)}`, '',
    `Map coverage: ${g.coverage_pct}% (${n(g.held.pinned)}/${n(g.held.locations)})`,
    ...(quiet.length ? ['', `Sources gone quiet (${QUIET_DAYS}+ days):`,
      ...quiet.map((q) => `  ${q.source}: ${q.days_quiet} days`)] : []),
    ...(deadSources.length ? ['', 'Scan sources producing nothing:',
      ...deadSources.map((d) => `  ${d.kind.replace(':source', '')} -> ${d.source}: ${d.ok_runs} good of ${d.runs} runs`)] : []),
    ...(jobs.filter((j) => j.health !== 'ok' && j.health !== 'ad-hoc').length ? ['', 'Scheduled jobs needing a look:',
      ...jobs.filter((j) => j.health !== 'ok' && j.health !== 'ad-hoc').map((j) => `  ${j.kind}: ${j.health}`)] : []),
  ].join('\n');
  const alarms = quiet.length + deadSources.length + jobs.filter((j) => j.health !== 'ok' && j.health !== 'ad-hoc').length;
  const subject = alarms
    ? `Bell data check — ${alarms} thing(s) need a look`
    : `Bell data check — ${g.coverage_pct}% mapped, ${n(lost)} items not kept`;
  return { subject, html, text };
}

/** Build + send now (used by the weekly trigger and for a manual test). */
export async function sendGapReportNow() {
  const gaps = await collectGaps();
  const quiet = await quietSources();
  const jobs = await jobHealth();
  // Per-SOURCE deadness — the aggregate job above cannot see it, which is the whole point.
  const deadSources = await silentSources({ minRuns: 3, days: 10 }).catch(() => []);
  const prev = (await getState('gap_report_last'))?.snapshot || null;
  const { subject, html, text } = buildReport(gaps, prev, quiet, jobs, deadSources);
  await sendEmail({ to: TO, subject, html, text, system: 'gap-report' });
  await setState('gap_report_last', {
    at: new Date().toISOString(),
    snapshot: { loc: gaps.lost.locations, email: gaps.lost.emails, phone: gaps.lost.phones },
  });
  return { sent: true, to: TO, gaps };
}

/** Sunday from 09:00 Qatar time, at most once per 5 days. */
/**
 * @param {object} [opts]
 * @param {boolean} [opts.ignoreHour]  send at whatever hour the caller reaches it.
 *   The engine box's nightly starts at 00:30 Qatar and finishes well before 09:00, so the
 *   original `hour >= 9` rule — written for a scheduler that ticks all day on production —
 *   would have meant this report NEVER sent from its new home. The Sunday check and the 5-day
 *   cooldown still bound it to once a week.
 */
export async function maybeSendWeeklyGapReport(opts = {}) {
  const p = qatarParts(new Date());
  if (p.weekday !== 0) return { skipped: 'not_window' };
  if (!opts.ignoreHour && p.hour < 9) return { skipped: 'not_window' };
  const last = await getState('gap_report_last');
  if (last?.at && Date.now() - new Date(last.at).getTime() < 5 * 86400_000) return { skipped: 'already_sent_recently' };
  return sendGapReportNow();
}
