// Dry-run preview of Bell's self-marketing outreach. Drafts real emails for a spread of
// companies/languages and writes them to an HTML file on the Desktop. SENDS NOTHING.
//
// Run by "Preview Outreach Emails.command". Reads the LOCAL database and uses the same
// composer the engine would use at send time, so what you read here is what would go out.

import os from 'os';
import fs from 'fs';
import path from 'path';
import { previewBatch } from '../outreach/engine.js';
import { targetingSummary } from '../outreach/targeting.js';

const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function card(d) {
  const dash = /[—–]/.test((d.subject || '') + (d.text || ''));
  const flag = dash ? '<span style="color:#c0392b;font-weight:700">⚠ contains a dash</span>' : '<span style="color:#1e8449">✓ clean</span>';
  const body = esc(d.text).replace(/\n/g, '<br>');
  const rtl = d.lang === 'ar' ? ' dir="rtl"' : '';
  return `<div class="card">
    <div class="head">
      <div class="co">${esc(d.company_name || '(no name)')}</div>
      <div class="meta">${esc(d.email)} &nbsp;·&nbsp; ${esc(d.address_class)} &nbsp;·&nbsp; ${esc(d.lang)} &nbsp;·&nbsp; written by: ${esc(d.source)} &nbsp;·&nbsp; ${flag}</div>
    </div>
    <div class="subj">${esc(d.subject)}</div>
    <div class="body"${rtl}>${body}</div>
  </div>`;
}

async function main() {
  const n = Math.max(1, parseInt(process.argv[2] || '8', 10) || 8);
  console.log('Building targeting summary…');
  const sum = await targetingSummary();

  console.log(`Drafting ${n} English + 3 Arabic + 2 bilingual samples (no send)…`);
  const [en, ar, bi] = await Promise.all([
    previewBatch({ tier: 'role_mailbox', lang: 'en', n }),
    previewBatch({ tier: 'role_mailbox', lang: 'ar', n: 3 }),
    previewBatch({ tier: 'role_mailbox', lang: 'bilingual', n: 2 }),
  ]);
  const drafts = [...en, ...ar, ...bi];

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Bell Outreach Preview</title>
  <style>
    body{font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#0f1420;color:#e6ebf5;margin:0;padding:28px}
    h1{font-size:20px;margin:0 0 4px} .sub{color:#8ea2c6;font-size:13px;margin-bottom:18px}
    .banner{background:#1a2233;border:1px solid #2a3550;border-radius:10px;padding:14px 16px;margin-bottom:22px;font-size:13px;line-height:1.6;color:#c7d2e8}
    .banner b{color:#e6ebf5}
    .grid{display:grid;gap:16px} .card{background:#151b2b;border:1px solid #26304a;border-radius:12px;overflow:hidden}
    .head{padding:12px 16px;background:#1b2337;border-bottom:1px solid #26304a}
    .co{font-weight:700;font-size:15px} .meta{color:#8ea2c6;font-size:12px;margin-top:3px}
    .subj{padding:12px 16px 4px;font-weight:600;color:#cdd7ee}
    .body{padding:6px 16px 18px;line-height:1.6;font-size:14px;color:#dbe3f4;white-space:normal}
  </style></head><body>
  <h1>Bell — Outreach Email Preview (dry run)</h1>
  <div class="sub">Nothing was sent. These are real drafts the engine would produce, using your live data.</div>
  <div class="banner">
    <b>Addressable market (live DB):</b><br>
    ${sum.candidates?.toLocaleString?.() || sum.candidates} candidate addresses ·
    <b>${(sum.role_mailbox || 0).toLocaleString()}</b> role-mailbox rows ·
    ${(sum.named_person || 0).toLocaleString()} named-person ·
    ${(sum.unclassified || 0).toLocaleString()} unclassified ·
    <b>${(sum.selected || 0).toLocaleString()}</b> unique sendable ·
    ${(sum.excluded_suppressed || 0)} suppressed / ${(sum.excluded_withdrawn || 0)} unsubscribed excluded.
  </div>
  <div class="grid">${drafts.map(card).join('')}</div>
  </body></html>`;

  const out = path.join(os.homedir(), 'Desktop', 'Bell Outreach Preview.html');
  fs.writeFileSync(out, html, 'utf8');
  const anyDash = drafts.some((d) => /[—–]/.test((d.subject || '') + (d.text || '')));
  const modelCount = drafts.filter((d) => d.source === 'model').length;
  console.log('');
  console.log('Wrote ' + drafts.length + ' drafts to: ' + out);
  console.log('Written by the AI model: ' + modelCount + '/' + drafts.length + (modelCount < drafts.length ? '  (rest used the clean fallback template)' : ''));
  console.log('Any em/en-dash slipped through: ' + (anyDash ? 'YES — tell Claude' : 'NO ✓'));
  return out;
}

main().then(() => process.exit(0))
  .catch((e) => { console.error('FAILED:', e.stack || e.message); process.exit(1); });
