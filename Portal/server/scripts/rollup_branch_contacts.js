// Roll branch contacts up onto the parent — Preview (default) / Apply (--apply).
// Val 2026-07-20: "one record with all the branch details, all unique emails,
// contact numbers." A multi-location operator should show EVERY branch's unique
// reachable contact on the one parent record, so search / outreach / Bella see a
// complete company.
//
// It reads each branch's contacts (from company_contacts AND the legacy
// companies.email/phone columns, since older rows only have those), normalizes
// them, and adds any the parent doesn't already have as a company_contacts row
// tagged source='branch-rollup'. Fully reversible (DELETE ... WHERE
// source='branch-rollup') and idempotent (the UNIQUE(company_id,type,value)
// constraint + shared normalizers). Apply rescoring the parent + pushes to prod.
//
// Honest expectation: most collapsed branches are empty facility shells, so today
// this adds only a handful of contacts — the value is the correct model, and it
// grows automatically as the Reharvest fills branches in.

import { query } from '../db.js';
import { upsertContact, normalizeEmail, normalizePhone, loadCompanyContactsByIds } from '../lib/contacts.js';
import { recomputeBellScoreForCompany } from '../assembly/bell_score.js';

const APPLY = process.argv.includes('--apply');

function norm(type, value) {
  if (type === 'email') return normalizeEmail(value);
  if (type === 'phone' || type === 'whatsapp') return normalizePhone(value);
  return String(value || '').trim().toLowerCase();
}

// Generic words that don't identify a specific business (so they can't vouch for
// a domain). Distinctive brand tokens are what we match on.
const GENERIC_TOK = new Set(['qatar', 'doha', 'lusail', 'group', 'holding', 'trading', 'contracting',
  'company', 'international', 'services', 'medical', 'center', 'centre', 'clinic', 'mall', 'city',
  'national', 'gulf', 'middle', 'east', 'the', 'and', 'for', 'llc', 'wll', 'ltd', 'est', 'unit',
  'first', 'aid', 'branch', 'store', 'shop']);
function nameTokens(name) {
  return String(name || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !GENERIC_TOK.has(t));
}
// Does an email's domain echo the company's own name? "info@veyepoptics.com" for
// "V EYE P OPTICS" → yes; "info@mallofqatar.com.qa" for the same optician → no
// (that's the venue's email scraped off a branch page, not the company's).
function domainEchoesName(email, parentName) {
  const at = String(email || '').split('@')[1];
  if (!at) return false;
  const dom = at.toLowerCase().replace(/\.[a-z.]+$/, '').replace(/[^a-z0-9]/g, '');
  if (!dom) return false;
  const toks = nameTokens(parentName);
  return toks.some((t) => dom.includes(t));
}
// This is a Qatar directory — only roll up Qatar-reachable numbers. Foreign
// numbers (e.g. a Gulf chain's UAE +9716 line scraped off a page) are not the
// company's Qatar contact and just add noise. Qatar = +974… or a local 8-digit.
function isQatarPhone(normalized) {
  const n = String(normalized || '');
  return n.startsWith('+974') || /^[3-7]\d{7}$/.test(n);
}

async function main() {
  // Every (branch → parent) pair, with the branch's legacy email/phone columns.
  const branches = (await query(`
    SELECT id AS branch_id, name AS branch_name, parent_company_id AS parent_id,
           NULLIF(btrim(email::text), '') AS email, NULLIF(btrim(phone), '') AS phone
      FROM companies WHERE parent_company_id IS NOT NULL`)).rows;
  if (!branches.length) { console.log('\nNo branches linked to a parent yet.'); return; }

  const branchIds = branches.map((b) => Number(b.branch_id));
  const branchContacts = await loadCompanyContactsByIds(branchIds).catch(() => new Map());

  // Parent names (to validate that a branch email really belongs to the operator).
  const parentIdsAll = [...new Set(branches.map((b) => Number(b.parent_id)))];
  const parentName = new Map(
    (await query(`SELECT id, name FROM companies WHERE id = ANY($1)`, [parentIdsAll])).rows.map((r) => [Number(r.id), r.name]));

  // Candidate contacts per parent, with a venue-contamination guard: a branch page
  // often lists the MALL's contact ("info@mallofqatar.com.qa"), not the shop's. If
  // a branch's email domain doesn't echo the operator's name, treat that branch as
  // contaminated and drop ALL its contacts (email AND phone) — Rule 2.1: don't
  // spread a wrong contact onto the clean parent record.
  const perParent = new Map();   // parentId -> Map(key -> {type, value, from_branch_id, from_branch_name})
  for (const b of branches) {
    const pid = Number(b.parent_id);
    const pname = parentName.get(pid) || '';
    const emails = [];
    if (b.email) emails.push(b.email);
    const phones = [];
    if (b.phone) phones.push(['phone', b.phone]);
    for (const c of branchContacts.get(Number(b.branch_id)) || []) {
      if (c.type === 'email') emails.push(c.value_display || c.value);
      else if (c.type === 'phone' || c.type === 'whatsapp') phones.push([c.type, c.value_display || c.value]);
    }
    const contaminated = emails.some((e) => !domainEchoesName(e, pname));
    if (!perParent.has(pid)) perParent.set(pid, new Map());
    const bucket = perParent.get(pid);
    const add = (type, value) => {
      const n = norm(type, value);
      if (!n) return;
      if ((type === 'phone' || type === 'whatsapp') && !isQatarPhone(n)) return;   // Qatar numbers only
      const key = type + '|' + n;
      if (!bucket.has(key)) bucket.set(key, { type, value, from_branch_id: b.branch_id, from_branch_name: b.branch_name });
    };
    for (const e of emails) if (domainEchoesName(e, pname)) add('email', e);   // keep only own-domain emails
    if (!contaminated) for (const [t, v] of phones) add(t, v);                 // phones only from clean branches
  }

  // Subtract what the parent already has.
  const parentIds = [...perParent.keys()];
  const parentContacts = await loadCompanyContactsByIds(parentIds).catch(() => new Map());
  // Also the parent's own legacy email/phone.
  const parentLegacy = (await query(
    `SELECT id, NULLIF(btrim(email::text),'') AS email, NULLIF(btrim(phone),'') AS phone
       FROM companies WHERE id = ANY($1)`, [parentIds])).rows;
  const parentHave = new Map();
  for (const pid of parentIds) parentHave.set(pid, new Set());
  for (const pl of parentLegacy) {
    const s = parentHave.get(Number(pl.id));
    if (pl.email) s.add('email|' + norm('email', pl.email));
    if (pl.phone) s.add('phone|' + norm('phone', pl.phone));
  }
  for (const [pid, rows] of parentContacts) for (const c of rows) parentHave.get(Number(pid))?.add(c.type + '|' + norm(c.type, c.value_display || c.value));

  // Final add-list.
  const toAdd = [];   // {parent_id, type, value, from_branch_id, from_branch_name}
  for (const [pid, bucket] of perParent) {
    const have = parentHave.get(pid) || new Set();
    for (const [key, c] of bucket) if (!have.has(key)) toAdd.push({ parent_id: pid, ...c });
  }
  const touchedParents = new Set(toAdd.map((x) => x.parent_id));

  console.log('');
  console.log('BRANCH CONTACT ROLLUP — ' + (APPLY ? 'APPLY' : 'PREVIEW (no changes)'));
  console.log('  Branches linked to a parent : ' + branches.length);
  console.log('  New contacts to roll up     : ' + toAdd.length + '  (into ' + touchedParents.size + ' parents)');
  console.log('');
  for (const x of toAdd.slice(0, 25)) {
    const disp = x.type === 'email' ? norm('email', x.value) : x.value;
    console.log('    parent #' + x.parent_id + '  ← ' + x.type + ' ' + String(disp).slice(0, 40) + '  (from ' + String(x.from_branch_name).slice(0, 28) + ')');
  }
  if (toAdd.length > 25) console.log('    … and ' + (toAdd.length - 25) + ' more');
  console.log('');

  if (!APPLY) {
    console.log('  This was a PREVIEW — nothing changed. To apply, run "Apply Branch Contact Rollup.command".');
    return;
  }
  if (!toAdd.length) { console.log('  Nothing to roll up.'); return; }

  let added = 0;
  for (const x of toAdd) {
    const r = await upsertContact('company', x.parent_id, {
      type: x.type, value: x.value, source: 'branch-rollup',
      extra_fields: { from_branch_id: x.from_branch_id, from_branch_name: x.from_branch_name },
    });
    if (r) added++;
  }
  for (const pid of touchedParents) await recomputeBellScoreForCompany(pid).catch(() => {});
  console.log('  Rolled up ' + added + ' contacts into ' + touchedParents.size + ' parents.');
  console.log('');
  console.log('  Pushing changes to production...');
  const { runPush } = await import('../sync/push.js');
  await runPush({});
  console.log('  Done — production updated.');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e.stack || e); process.exit(1); });
