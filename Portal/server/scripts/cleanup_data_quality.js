// ============================================================================
// Data-quality cleanup pass  (existing data)
// ----------------------------------------------------------------------------
// Applies the SAME shared validators used at ingestion (server/lib/dataquality)
// to every row already in the database, fixing the issues Val flagged:
//
//   • invalid phone numbers          → deleted
//   • duplicate / personal / third-party socials (incl. twitter↔x merge,
//     LinkedIn numeric-vs-slug, /in/ profiles, "designed by" handles) → deleted
//   • other-company-domain emails    → deleted; own-domain email made primary
//   • markdown / broken website URLs → rewritten to a clean URL
//   • "Our Company" / "Our History" people (page headings)   → deleted
//   • an identical singular exec title shared by 3+ people    → title cleared
//
// SAFETY
//   • DRY-RUN by default: nothing is written; a full report is printed + saved.
//     Add  --apply  to actually make the changes.
//   • Every delete of a mirror-table row also writes a sync_deletions tombstone
//     so the change propagates to the production mirror on the next push.
//   • "Keep all, mark primary": ambiguous-but-valid data is never dropped — we
//     keep every valid email/phone and only re-point which one is primary.
//
// USAGE (run from the Portal directory)
//   node scripts/cleanup_data_quality.js                 # preview (dry-run)
//   node scripts/cleanup_data_quality.js --apply         # make the changes
//   node scripts/cleanup_data_quality.js --limit 500     # preview first 500 cos
//   node scripts/cleanup_data_quality.js --strict-socials # also drop socials
//        whose handle has no affinity to the company (catches orphan widgets)
//   node scripts/cleanup_data_quality.js --self-test     # logic test, no DB
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  normalizePhone, parseSocialUrl, cleanCompanySocials, rankCompanyEmails,
  looksLikeName, isSingularExecTitle, cleanWebsiteUrl,
} from '../lib/dataquality.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BATCH = 500;

// ---------------------------------------------------------------------------
// Pure planners (no DB) — these decide WHAT to change, so they're unit-testable.
// ---------------------------------------------------------------------------

function domainOf(website) {
  const clean = cleanWebsiteUrl(website);
  if (!clean) return '';
  try { return new URL(clean).hostname.replace(/^www\./, '').toLowerCase(); } catch { return ''; }
}

/**
 * Decide every change for ONE company's contacts + website.
 * @param {{id,name,website}} company
 * @param {Array<{id,type,value,value_display,is_primary}>} rows  its company_contacts
 * @param {{strictSocials?:boolean}} opts
 */
export function planCompanyContacts(company, rows, opts = {}) {
  const siteDomain = domainOf(company.website);
  const plan = {
    phoneDelete: [], phoneUpdate: [],
    socialDelete: [], socialUpdate: [],
    emailDelete: [], emailSetPrimary: null, emailClearPrimary: [],
    websiteUpdate: null,
    samples: [],
  };

  // ---- Website: strip markdown / fix scheme --------------------------------
  if (company.website) {
    const cw = cleanWebsiteUrl(company.website);
    if (cw && cw !== company.website) {
      plan.websiteUpdate = cw;
      plan.samples.push(`website: ${trunc(company.website)} → ${cw}`);
    }
  }

  const phones  = rows.filter((r) => r.type === 'phone');
  const socials = rows.filter((r) => r.type === 'social');
  const emails  = rows.filter((r) => r.type === 'email');

  // ---- Phones: validate + dedup by canonical E.164 -------------------------
  const seenPhone = new Set();
  for (const r of phones) {
    const norm = normalizePhone(r.value_display || r.value);
    if (!norm) { plan.phoneDelete.push(r.id); plan.samples.push(`phone✗ ${trunc(r.value_display || r.value)}`); continue; }
    if (seenPhone.has(norm.e164)) { plan.phoneDelete.push(r.id); continue; }   // duplicate number
    seenPhone.add(norm.e164);
    if (r.value !== norm.e164 || r.value_display !== norm.display) {
      plan.phoneUpdate.push({ id: r.id, value: norm.e164, display: norm.display });
    }
  }

  // ---- Socials: canonicalize, dedup, drop personal/third-party -------------
  const cleaned = cleanCompanySocials(socials.map((r) => r.value),
    { companyName: company.name, siteDomain, strictAffinity: !!opts.strictSocials });
  const keptSet = new Set(cleaned.kept.map((k) => k.url));
  const usedCanon = new Set();
  for (const r of socials) {
    const p = parseSocialUrl(r.value);
    const canon = p && p.canonical;
    if (!canon || !keptSet.has(canon) || usedCanon.has(canon)) {
      plan.socialDelete.push(r.id);
      plan.samples.push(`social✗ ${trunc(r.value)}`);
      continue;
    }
    usedCanon.add(canon);
    if (r.value !== canon) plan.socialUpdate.push({ id: r.id, value: canon, network: p.network });
  }

  // ---- Emails: keep valid, drop other-domain pollution, set primary --------
  const ranked = rankCompanyEmails(emails.map((r) => r.value), siteDomain);
  const rankedSet = new Set(ranked.map((e) => e.toLowerCase()));
  const surviving = [];
  for (const r of emails) {
    if (!rankedSet.has(String(r.value).toLowerCase())) {
      plan.emailDelete.push(r.id);
      plan.samples.push(`email✗ ${trunc(r.value)} (other-domain)`);
    } else {
      surviving.push(r);
    }
  }
  if (surviving.length) {
    const primaryVal = ranked[0];
    const primaryRow = surviving.find((r) => String(r.value).toLowerCase() === primaryVal) || surviving[0];
    for (const r of surviving) {
      const shouldBe = r.id === primaryRow.id;
      if (shouldBe && !r.is_primary) plan.emailSetPrimary = r.id;
      if (!shouldBe && r.is_primary) plan.emailClearPrimary.push(r.id);
    }
  }

  return plan;
}

// A person row whose name is clearly a page heading, not a human.
const HEADING_LEAD_RX = /^(our|the|about|meet|welcome|message|why|who|what|how|view|read|learn|contact|home)\b/i;
const HEADING_WORD_RX = /\b(company|history|story|message|mission|vision|overview|profile|statement|department|board|management|leadership|greeting|introduction|chairman'?s|president'?s)\b/i;

/** True only for high-confidence junk people (won't touch ambiguous real names). */
export function isJunkPersonName(name) {
  const s = String(name || '').trim();
  if (!s) return true;
  if (looksLikeName(s)) return false;                 // a valid human name — keep
  return HEADING_LEAD_RX.test(s) || HEADING_WORD_RX.test(s);
}

/**
 * For one company's CURRENT employment rows, find singular exec titles shared by
 * 3+ people (an extraction artifact) → return the person_companies ids whose
 * title should be cleared.
 * @param {Array<{id,title}>} pcRows
 */
export function planExecTitleClears(pcRows) {
  const groups = new Map();
  for (const r of pcRows) {
    const t = String(r.title || '').trim().toLowerCase();
    if (!t || !isSingularExecTitle(t)) continue;
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(r.id);
  }
  const clear = [];
  for (const [, ids] of groups) if (ids.length >= 3) clear.push(...ids);
  return clear;
}

function trunc(s, n = 60) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) + '…' : s; }

// ---------------------------------------------------------------------------
// DB runner
// ---------------------------------------------------------------------------

async function run() {
  const { query, withTransaction } = await import('../db.js');
  const apply = process.argv.includes('--apply');
  const strictSocials = process.argv.includes('--strict-socials');
  const limitArg = argInt('--limit', null);

  const R = newReport();
  R.mode = apply ? 'APPLY' : 'DRY-RUN';
  R.strictSocials = strictSocials;

  // tombstone helper — records a hard-delete so prod mirror is cleaned too.
  const tombstone = async (client, table, id) => {
    await client.query(`INSERT INTO sync_deletions (table_name, row_id) VALUES ($1, $2)`, [table, id]);
  };

  // ===== Companies: contacts + website =====================================
  let lastId = 0, processed = 0;
  for (;;) {
    const cos = await query(
      `SELECT id, name, website FROM companies WHERE id > $1 ORDER BY id LIMIT $2`, [lastId, BATCH]);
    if (!cos.rows.length) break;
    const ids = cos.rows.map((c) => c.id);
    lastId = ids[ids.length - 1];

    const cts = await query(
      `SELECT id, company_id, type, value, value_display, is_primary
         FROM company_contacts WHERE company_id = ANY($1::bigint[])`, [ids]);
    const byCo = new Map();
    for (const r of cts.rows) { if (!byCo.has(r.company_id)) byCo.set(r.company_id, []); byCo.get(r.company_id).push(r); }

    for (const c of cos.rows) {
      const plan = planCompanyContacts(c, byCo.get(c.id) || [], { strictSocials });
      tallyCompany(R, plan);
      if (apply) {
        try { await applyCompanyPlan(withTransaction, tombstone, c.id, plan); }
        catch (e) { R.errors++; if (R.errorSamples.length < 25) R.errorSamples.push(`company #${c.id}: ${e.message}`); }
      }
      processed++;
      if (limitArg && processed >= limitArg) break;
    }
    if (limitArg && processed >= limitArg) break;
  }
  R.companiesScanned = processed;

  // ===== People: junk names ================================================
  lastId = 0;
  for (;;) {
    const ppl = await query(
      `SELECT id, full_name FROM people WHERE id > $1 ORDER BY id LIMIT $2`, [lastId, BATCH]);
    if (!ppl.rows.length) break;
    lastId = ppl.rows[ppl.rows.length - 1].id;
    R.peopleScanned += ppl.rows.length;
    const junk = ppl.rows.filter((p) => isJunkPersonName(p.full_name));
    for (const p of junk) {
      R.peopleDeleted++;
      if (R.peopleSamples.length < 25) R.peopleSamples.push(`#${p.id} "${trunc(p.full_name, 40)}"`);
      if (apply) {
        try {
          await withTransaction(async (client) => {
            await client.query(`DELETE FROM people WHERE id = $1`, [p.id]);   // cascades children locally + on prod
            await tombstone(client, 'people', p.id);
          });
        } catch (e) { R.errors++; if (R.errorSamples.length < 25) R.errorSamples.push(`person #${p.id}: ${e.message}`); }
      }
    }
  }

  // ===== Template / placeholder people (e.g. "CEO at Google") ==============
  // Demo team sections ship with fake staff whose title places them at a big
  // external brand — a website-template artifact, not a real employee.
  const tmplRx = '\\mat\\s+(google|facebook|meta|microsoft|apple|amazon|twitter|linkedin|instagram|netflix|tesla|youtube|spotify|uber|airbnb|samsung|ibm|oracle|adobe|salesforce|tiktok|snapchat|envato)\\M';
  const tmpl = await query(
    `SELECT DISTINCT p.id, p.full_name
       FROM people p JOIN person_companies pc ON pc.person_id = p.id
      WHERE pc.title ~* $1 OR coalesce(p.headline, '') ~* $1`, [tmplRx]).catch(() => ({ rows: [] }));
  for (const p of tmpl.rows) {
    R.peopleDeleted++;
    if (R.peopleSamples.length < 25) R.peopleSamples.push(`#${p.id} "${trunc(p.full_name, 36)}" (template)`);
    if (apply) {
      try {
        await withTransaction(async (client) => {
          await client.query(`DELETE FROM people WHERE id = $1`, [p.id]);
          await tombstone(client, 'people', p.id);
        });
      } catch (e) { R.errors++; if (R.errorSamples.length < 25) R.errorSamples.push(`tmpl person #${p.id}: ${e.message}`); }
    }
  }

  // ===== Person-companies: shared singular exec titles =====================
  const execCos = await query(
    `SELECT company_id, array_agg(id) AS ids, array_agg(title) AS titles
       FROM person_companies
      WHERE is_current = true AND title IS NOT NULL AND title <> ''
      GROUP BY company_id HAVING count(*) >= 3`);
  for (const row of execCos.rows) {
    const pcRows = row.ids.map((id, i) => ({ id, title: row.titles[i] }));
    const clearIds = planExecTitleClears(pcRows);
    if (!clearIds.length) continue;
    R.execTitlesCleared += clearIds.length;
    if (R.execSamples.length < 20) R.execSamples.push(`company #${row.company_id}: cleared ${clearIds.length}× "${trunc(firstSingular(pcRows), 30)}"`);
    if (apply) {
      try { await query(`UPDATE person_companies SET title = NULL, updated_at = now() WHERE id = ANY($1::bigint[])`, [clearIds]); }
      catch (e) { R.errors++; if (R.errorSamples.length < 25) R.errorSamples.push(`titles co#${row.company_id}: ${e.message}`); }
    }
  }

  finishReport(R);
  return R;
}

function firstSingular(pcRows) {
  for (const r of pcRows) if (isSingularExecTitle(String(r.title || '').trim())) return r.title;
  return '';
}

async function applyCompanyPlan(withTransaction, tombstone, companyId, plan) {
  const delIds = [...plan.phoneDelete, ...plan.socialDelete, ...plan.emailDelete];
  if (!delIds.length && !plan.phoneUpdate.length && !plan.socialUpdate.length &&
      !plan.websiteUpdate && plan.emailSetPrimary == null && !plan.emailClearPrimary.length) return;

  await withTransaction(async (client) => {
    // DELETE first (+ tombstone) so removing a duplicate frees its UNIQUE
    // (company_id, type, value) slot BEFORE we normalize another row onto the
    // same canonical value — e.g. a company with both tweeter.com/x and
    // x.com/x, which both canonicalize to x.com/x. (Doing updates first hit the
    // unique constraint and aborted the whole run.)
    for (const id of delIds) {
      await client.query(`DELETE FROM company_contacts WHERE id=$1`, [id]);
      await tombstone(client, 'company_contacts', id);
    }
    for (const u of plan.phoneUpdate) {
      await client.query(`UPDATE company_contacts SET value=$2, value_display=$3, updated_at=now() WHERE id=$1`,
        [u.id, u.value, u.display]);
    }
    for (const u of plan.socialUpdate) {
      await client.query(`UPDATE company_contacts SET value=$2, value_display=$2, source_label=$3, updated_at=now() WHERE id=$1`,
        [u.id, u.value, u.network]);
    }
    for (const id of plan.emailClearPrimary) {
      await client.query(`UPDATE company_contacts SET is_primary=false, updated_at=now() WHERE id=$1`, [id]);
    }
    if (plan.emailSetPrimary != null) {
      await client.query(`UPDATE company_contacts SET is_primary=true, updated_at=now() WHERE id=$1`, [plan.emailSetPrimary]);
    }
    if (plan.websiteUpdate) {
      await client.query(`UPDATE companies SET website=$2, updated_at=now() WHERE id=$1`, [companyId, plan.websiteUpdate]);
    }
  });
}

// ---------------------------------------------------------------------------
// Reporting
// ---------------------------------------------------------------------------

function newReport() {
  return {
    mode: 'DRY-RUN', strictSocials: false, companiesScanned: 0, peopleScanned: 0,
    phoneDeleted: 0, phoneNormalized: 0,
    socialDeleted: 0, socialNormalized: 0,
    emailDeleted: 0, emailRepointed: 0,
    websiteFixed: 0,
    peopleDeleted: 0, execTitlesCleared: 0,
    errors: 0,
    contactSamples: [], peopleSamples: [], execSamples: [], errorSamples: [],
  };
}
function tallyCompany(R, plan) {
  R.phoneDeleted += plan.phoneDelete.length;
  R.phoneNormalized += plan.phoneUpdate.length;
  R.socialDeleted += plan.socialDelete.length;
  R.socialNormalized += plan.socialUpdate.length;
  R.emailDeleted += plan.emailDelete.length;
  R.emailRepointed += (plan.emailSetPrimary != null ? 1 : 0);
  if (plan.websiteUpdate) R.websiteFixed++;
  for (const s of plan.samples) if (R.contactSamples.length < 60) R.contactSamples.push(s);
}

function finishReport(R) {
  const L = [];
  L.push('='.repeat(70));
  L.push(`  BELL DATA-QUALITY CLEANUP — ${R.mode}`);
  L.push(`  ${new Date().toISOString()}`);
  if (R.strictSocials) L.push('  (strict-socials ON: dropping no-affinity social links)');
  L.push('='.repeat(70));
  L.push('');
  L.push(`Scanned: ${R.companiesScanned} companies, ${R.peopleScanned} people`);
  L.push('');
  L.push('CHANGES ' + (R.mode === 'DRY-RUN' ? '(would be made)' : '(applied)') + ':');
  L.push(`  Phones    — deleted ${R.phoneDeleted} invalid/dup, normalized ${R.phoneNormalized}`);
  L.push(`  Socials   — deleted ${R.socialDeleted} dup/personal/third-party, canonicalized ${R.socialNormalized}`);
  L.push(`  Emails    — deleted ${R.emailDeleted} other-domain, re-pointed primary on ${R.emailRepointed}`);
  L.push(`  Websites  — fixed ${R.websiteFixed} markdown/broken URLs`);
  L.push(`  People    — deleted ${R.peopleDeleted} non-person "headings"`);
  L.push(`  Titles    — cleared ${R.execTitlesCleared} bogus shared exec titles`);
  if (R.errors) L.push(`  ⚠ Errors  — ${R.errors} record(s) skipped (isolated, did NOT stop the run)`);
  L.push('');
  if (R.errorSamples.length) { L.push('Sample errors (skipped, safe to ignore unless many):'); for (const s of R.errorSamples) L.push('  · ' + s); L.push(''); }
  if (R.contactSamples.length) { L.push('Sample contact changes:'); for (const s of R.contactSamples) L.push('  · ' + s); L.push(''); }
  if (R.peopleSamples.length)  { L.push('Sample people removed:');   for (const s of R.peopleSamples)  L.push('  · ' + s); L.push(''); }
  if (R.execSamples.length)    { L.push('Sample exec-title clears:'); for (const s of R.execSamples)    L.push('  · ' + s); L.push(''); }
  if (R.mode === 'DRY-RUN') {
    L.push('No changes were written. Re-run with  --apply  to make these changes.');
  } else {
    L.push('Changes applied. Run a sync push to mirror them to production.');
  }
  L.push('='.repeat(70));
  const text = L.join('\n');
  console.log('\n' + text + '\n');
  try {
    const out = path.join(__dirname, '..', '..', `Data-Cleanup-Report-${R.mode === 'APPLY' ? 'APPLIED' : 'PREVIEW'}.txt`);
    fs.writeFileSync(out, text);
    console.log('Report saved to: ' + out);
  } catch (e) { console.log('(could not save report file: ' + e.message + ')'); }
}

function argInt(flag, dflt) {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return dflt;
  const n = Number(process.argv[i + 1]);
  return Number.isFinite(n) ? n : dflt;
}

// ---------------------------------------------------------------------------
// Self-test (no DB) — validates the pure planners on Val's examples.
// ---------------------------------------------------------------------------

function selfTest() {
  let pass = 0, fail = 0;
  const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL:', m); } };

  // Qatar Airways: junk phones dropped, valid normalized; dup socials collapsed.
  const qa = planCompanyContacts(
    { id: 1, name: 'Qatar Airways', website: 'https://www.qatarairways.com' },
    [
      { id: 11, type: 'phone', value: '+97440105106', value_display: '+974 4010 5106', is_primary: true },
      { id: 12, type: 'phone', value: '899150996', value_display: '89-9150996', is_primary: false },
      { id: 13, type: 'phone', value: '3202446483', value_display: '320-2446-483', is_primary: false },
      { id: 14, type: 'social', value: 'https://www.linkedin.com/company/10834/', is_primary: false },
      { id: 15, type: 'social', value: 'https://www.linkedin.com/company/qatar-airways/', is_primary: false },
      { id: 16, type: 'social', value: 'https://x.com/qatarairways', is_primary: false },
      { id: 17, type: 'social', value: 'https://tweeter.com/qatarairways', is_primary: false },
    ]);
  ok(qa.phoneDelete.includes(12) && qa.phoneDelete.includes(13), 'QA junk phones deleted');
  ok(!qa.phoneDelete.includes(11), 'QA valid phone kept');
  ok(qa.socialDelete.includes(14) && qa.socialDelete.includes(17), 'QA dup linkedin-numeric + tweeter deleted');
  ok(!qa.socialDelete.includes(15) && !qa.socialDelete.includes(16), 'QA slug-linkedin + x kept');

  // Just Us And Otto: TeePublic socials gone, own kept.
  const jo = planCompanyContacts(
    { id: 2, name: 'Just Us And Otto Marketing Services', website: 'https://justusandotto.com' },
    [
      { id: 21, type: 'social', value: 'https://www.instagram.com/justusandotto', is_primary: false },
      { id: 22, type: 'social', value: 'https://www.instagram.com/teepublic', is_primary: false },
      { id: 23, type: 'social', value: 'https://twitter.com/teepublic', is_primary: false },
    ]);
  ok(jo.socialDelete.includes(22) && jo.socialDelete.includes(23), 'Otto teepublic socials deleted');
  ok(!jo.socialDelete.includes(21), 'Otto own IG kept');

  // Aamal: keep all emails, own-domain primary, no deletes (gmail kept).
  const am = planCompanyContacts(
    { id: 3, name: 'Aamal Trading', website: 'https://aamaltrd.com' },
    [
      { id: 31, type: 'email', value: 'aamaltrd@qatar.net.qa', is_primary: true },
      { id: 32, type: 'email', value: 'info@aamaltrd.com', is_primary: false },
      { id: 33, type: 'email', value: 'quick.help@gmail.com', is_primary: false },
    ]);
  ok(am.emailDelete.length === 0, 'Aamal keeps all emails (none deleted)');
  ok(am.emailSetPrimary === 32, 'Aamal own-domain email becomes primary');
  ok(am.emailClearPrimary.includes(31), 'Aamal old ISP primary cleared');

  // Schlumberger markdown website.
  const sb = planCompanyContacts(
    { id: 4, name: 'Schlumberger Overseas', website: '[www.slb.com](https://www.slb.com)' }, []);
  ok(sb.websiteUpdate === 'https://www.slb.com', 'Schlumberger website markdown fixed');

  // People + exec titles.
  ok(isJunkPersonName('Our Company') && isJunkPersonName('Our History'), 'heading people flagged');
  ok(!isJunkPersonName('Akbar Al Baker') && !isJunkPersonName('Clifford W Lasrado'), 'real people kept');
  const clears = planExecTitleClears(Array.from({ length: 7 }, (_, i) => ({ id: 100 + i, title: 'President & CEO' })));
  ok(clears.length === 7, '7× President & CEO all cleared');
  const keep = planExecTitleClears([{ id: 1, title: 'President & CEO' }, { id: 2, title: 'Sales Manager' }]);
  ok(keep.length === 0, 'a single CEO is left alone');

  console.log(`\nself-test: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

// ---------------------------------------------------------------------------

const isMain = process.argv[1] && process.argv[1].endsWith('cleanup_data_quality.js');
if (isMain) {
  if (process.argv.includes('--self-test')) {
    selfTest();
  } else {
    run().then(() => process.exit(0)).catch((e) => { console.error('cleanup failed:', e); process.exit(1); });
  }
}
