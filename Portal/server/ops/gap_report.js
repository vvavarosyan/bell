// Weekly data-gap report — emailed to Val, so a new gap surfaces on its own.
//
// Val's rule (2026-07-21): "make sure to catch these gaps always and make sure
// Bell utilizes 100% of the data that enters Bell." He caught the Yateem and DOC
// gaps by eye; that is the wrong way round. This mails the same numbers the
// Data Gap Audit prints, every Sunday, so the software reports on itself.
//
// It rides the outreach scheduler tick (like the market digest) but is completely
// independent of the cold-send gate — it is an internal ops mail to one address,
// not marketing, so it never touches consent or unsubscribe machinery.

import { sendEmail } from '../lib/email.js';
import { qatarParts } from '../lib/qatar_time.js';
import { getState, setState } from '../outreach/machine.js';
import { collectGaps } from '../scripts/data_gap_audit.js';

const TO = process.env.BDI_OPS_EMAIL || 'hello@bell.qa';
const n = (v) => Number(v || 0).toLocaleString();

function buildReport(g, prev) {
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
  ].join('\n');
  return { subject: `Bell data check — ${g.coverage_pct}% mapped, ${n(lost)} items not kept`, html, text };
}

/** Build + send now (used by the weekly trigger and for a manual test). */
export async function sendGapReportNow() {
  const gaps = await collectGaps();
  const prev = (await getState('gap_report_last'))?.snapshot || null;
  const { subject, html, text } = buildReport(gaps, prev);
  await sendEmail({ to: TO, subject, html, text, system: 'gap-report' });
  await setState('gap_report_last', {
    at: new Date().toISOString(),
    snapshot: { loc: gaps.lost.locations, email: gaps.lost.emails, phone: gaps.lost.phones },
  });
  return { sent: true, to: TO, gaps };
}

/** Sunday from 09:00 Qatar time, at most once per 5 days. */
export async function maybeSendWeeklyGapReport() {
  const p = qatarParts(new Date());
  if (p.weekday !== 0 || p.hour < 9) return { skipped: 'not_window' };
  const last = await getState('gap_report_last');
  if (last?.at && Date.now() - new Date(last.at).getTime() < 5 * 86400_000) return { skipped: 'already_sent_recently' };
  return sendGapReportNow();
}
