// Stage 10 — Local Engine 4 · Email Finder & Verifier.
// ----------------------------------------------------------------------------
// Finds decision-maker emails for a company WITHOUT guessing into the database.
// Two layers, and an address is written ONLY if it clears a verification bar:
//
//   Layer 1 — OBSERVED: a real email already harvested onto the company (from its
//             website) whose local-part decodes to a known employee's name is
//             attached to that person. Real, observed → is_verified = true.
//
//   Layer 2 — PATTERN + VERIFY: from a decoded observed email we learn the
//             company's email FORMAT, generate the address for other
//             decision-makers, and verify each via emailverify.js (MX + best-effort
//             SMTP). Only result === 'valid' is written. Anything unverified is
//             discarded — never stored.
//
// Fully local, $0. The verifier is pluggable (swap in an API later) — see
// emailverify.js. Mirrors the harvester/finder/mapper engine shape:
//   enrichCompany(company) and enrichCompanies(companies, jobLog).

import { query } from '../../db.js';
import { upsertContact, isJunkEmail } from '../../lib/contacts.js';
import { verifyEmail, emailDomain } from './emailverify.js';
import { decodeFormat, emailFromFormat, inferStructuralFormat, splitName } from './email_patterns.js';
import { recordReject } from './rejects.js';
import { recordSearch } from './ledger.js';
import { recomputeBellScoreForPerson } from '../../assembly/bell_score.js';

const PER_COMPANY_CAP = Number(process.env.BELL_EMAIL_PER_COMPANY || 25);

function domainOf(website) {
  if (!website) return '';
  let s = String(website).trim().toLowerCase();
  s = s.replace(/^https?:\/\//, '').replace(/^www\./, '');
  s = s.split('/')[0].split('?')[0].split('#')[0].split(':')[0];
  return s || '';
}
function isOwnDomain(emailDom, siteDom) {
  if (!emailDom || !siteDom) return false;
  return emailDom === siteDom || emailDom.endsWith('.' + siteDom) || siteDom.endsWith('.' + emailDom);
}
function hasFullName(p) { const { first, last } = splitName(p); return !!(first && last); }

async function markStage10(id, status, extras = {}) {
  await query(
    `UPDATE companies SET stage10_status = $2, stage10_at = now(), extra_fields = extra_fields || $3::jsonb WHERE id = $1`,
    [id, status, JSON.stringify(extras)],
  );
  await recordSearch(id, 10, status, extras);
}

export async function enrichCompany(company) {
  const domain = domainOf(company.website);
  if (!domain) { await markStage10(company.id, 'no_data', { stage10_skip: 'no-domain' }); return { status: 'no_data', emails: 0 }; }

  // Current people at this company.
  const people = (await query(
    `SELECT p.id, p.first_name, p.last_name, p.full_name, p.email
       FROM people p JOIN person_companies pc ON pc.person_id = p.id
      WHERE pc.company_id = $1 AND pc.is_current = true AND COALESCE(p.archived, false) = false`,
    [company.id],
  )).rows;
  if (people.length === 0) { await markStage10(company.id, 'no_data', { stage10_skip: 'no-people', stage10_domain: domain }); return { status: 'no_data', emails: 0 }; }

  const lacking = people.filter((p) => !p.email);
  // Observed emails already recorded on the company (mostly from the harvester).
  const companyEmails = (await query(
    `SELECT value FROM company_contacts WHERE company_id = $1 AND type = 'email'`,
    [company.id],
  )).rows.map((r) => r.value).filter(Boolean);

  const assigned = new Set();
  let learned = null; // { format, confidence, sample }
  const consider = (format, confidence, sample) => {
    if (!format) return;
    const rank = confidence === 'high' ? 2 : 1;
    const cur = learned ? (learned.confidence === 'high' ? 2 : 1) : 0;
    if (rank > cur) learned = { format, confidence, sample };
  };

  // Learn from people who already have an own-domain email (strongest signal).
  for (const p of people) {
    if (!p.email) continue;
    if (!isOwnDomain(emailDomain(p.email), domain)) continue;
    const fmt = decodeFormat(String(p.email).split('@')[0], p);
    if (fmt) consider(fmt, 'high', p.email);
  }

  // LAYER 1 — attach observed company emails to a person by name.
  let observedWritten = 0;
  const ownCompanyEmails = companyEmails.filter((e) => isOwnDomain(emailDomain(e), domain));
  for (const e of ownCompanyEmails) {
    const local = String(e).split('@')[0];
    let matched = false;
    for (const p of lacking) {
      if (assigned.has(p.id)) continue;
      const fmt = decodeFormat(local, p);
      if (fmt) {
        const r = await upsertContact('person', p.id, {
          type: 'email', value: e, source: 'stage10-observed',
          source_label: 'Website email matched to person', is_verified: true,
        });
        if (r) { observedWritten++; assigned.add(p.id); await recomputeBellScoreForPerson(p.id).catch(() => {}); }
        consider(fmt, 'high', e);
        matched = true;
        break;
      }
    }
    if (!matched) {
      // Even if no lacking person matched, learn the format from any known person.
      for (const p of people) { const fmt = decodeFormat(local, p); if (fmt) { consider(fmt, 'high', e); matched = true; break; } }
    }
    if (!matched) { const sf = inferStructuralFormat(local); if (sf) consider(sf, 'medium', e); }
  }

  // LAYER 2 — apply the learned format to remaining decision-makers + verify each.
  let patternWritten = 0;
  if (learned) {
    let budget = PER_COMPANY_CAP;
    for (const p of lacking) {
      if (budget <= 0) break;
      if (assigned.has(p.id) || !hasFullName(p)) continue;
      const gen = emailFromFormat(learned.format, p, domain);
      if (!gen || isJunkEmail(gen)) continue;
      // Phase E: skip addresses that already FAILED verification recently —
      // the reject log doubles as a retry-suppression list (re-tested after
      // 60 days), so re-scans never re-spend SMTP/API checks on known-bads.
      const known = await query(
        `SELECT 1 FROM enrichment_rejects
          WHERE company_id = $1 AND kind = 'email' AND value = $2
            AND created_at > now() - interval '60 days' LIMIT 1`,
        [company.id, gen],
      );
      if (known.rows.length) continue;
      budget--;
      let v;
      try { v = await verifyEmail(gen, { smtp: true }); } catch { v = { result: 'unknown' }; }
      if (v.result === 'valid') {
        const r = await upsertContact('person', p.id, {
          type: 'email', value: gen, source: 'stage10-pattern',
          source_label: `Pattern ${learned.format} (verified)`, is_verified: true,
          extra_fields: { pattern: learned.format, verify: v.method || 'smtp' },
        });
        if (r) { patternWritten++; assigned.add(p.id); await recomputeBellScoreForPerson(p.id).catch(() => {}); }
      } else {
        await recordReject(company.id, 'email', 'email', gen, `verification: ${v.result}${v.detail ? ` (${v.detail})` : ''}`);
      }
    }
  }

  const emails = observedWritten + patternWritten;
  const extras = {
    stage10_domain: domain,
    stage10_people: people.length,
    stage10_observed: observedWritten,
    stage10_pattern: patternWritten,
    stage10_emails: emails,
    stage10_format: learned ? learned.format : null,
  };
  if (learned) extras.email_pattern = { format: learned.format, confidence: learned.confidence, sample: learned.sample, at: new Date().toISOString() };
  await markStage10(company.id, emails > 0 ? 'done' : 'no_data', extras);
  return { status: emails > 0 ? 'done' : 'no_data', emails, format: learned ? learned.format : null };
}

export async function enrichCompanies(companies, jobLog = null) {
  let done = 0, no_data = 0, failed = 0, emails = 0;
  for (let i = 0; i < companies.length; i++) {
    const c = companies[i];
    try {
      const r = await enrichCompany(c);
      if (r.status === 'done') done++; else no_data++;
      emails += r.emails || 0;
      jobLog?.(`  ${r.status === 'done' ? '✓' : '·'} [${i + 1}/${companies.length}] ${c.name} — +${r.emails || 0} email(s)${r.format ? ' [' + r.format + ']' : ''}`);
    } catch (err) {
      failed++;
      try { await markStage10(c.id, 'failed', { stage10_error: err.message }); } catch { /* ignore */ }
      jobLog?.(`  ✗ [${i + 1}/${companies.length}] ${c.name} — ${err.message}`);
    }
  }
  return { done, no_data, failed, usd: 0, emails };
}
