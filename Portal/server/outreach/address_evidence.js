// Address evidence — turn Bell's OWN data into a verdict, or into a proposal with proof.
//
// Every rule here was measured on live data and then attacked by two adversarial reviewers
// (a PDPPL/person-safety lens and a data-correctness lens). What survived unrefuted may
// auto-decide; what did not may only PROPOSE, with its evidence shown, for Val to confirm.
//
// THE ASYMMETRY THAT GOVERNS EVERYTHING HERE:
//   calling a company inbox a person  → one lost lead.
//   calling a person a company inbox  → Bell cold-emails a natural person. PDPPL Art 22.
// So no rule auto-promotes to role_mailbox. Not one survived review. Every sendable verdict
// in this system is a human's click.
//
// Explicitly rejected, do not "improve" this by adding them back (each was measured):
//   • the INVERSE of a name test ("not in the people dictionary ⇒ company inbox") would move
//     4,986 of 5,715 addresses into the sendable tier, including hanif@, sheldon@, msiddiqui@.
//   • "an official source states it in an `email` field ⇒ company inbox" — it fires on 29.6%
//     of known named_person vs 22.8% of known role mailboxes, i.e. a NEGATIVE discriminator.
//     QCCI's form has "Contact Person" but no contact-person email box, so a person's mailbox
//     has nowhere else to go.
//   • "the email domain matches the company name ⇒ company inbox" — 2,641 rows fire and 646
//     of them (24.5%) have a real given name as the local-part (ali@, mohammed@, ahmed@).
//     A matching domain proves the DOMAIN is theirs; it says nothing about who owns the mailbox.
//   • fan-out as an automatic block in either direction — ~52% of the shared set is Bell's own
//     duplicate company rows. It ranks a human queue; it decides nothing.

import { query } from '../db.js';
import { CONSUMER_DOMAINS, ROLE_LOCALPARTS, classifyAddress } from './address_rules.js';
import { isPlaceholderName } from '../lib/dataquality.js';

const lower = (s) => String(s || '').trim().toLowerCase();
const localOf = (e) => lower(e).split('@')[0] || '';
const domainOf = (e) => lower(e).split('@')[1] || '';
/** Registrable label: "alqaswa.com.qa" → "alqaswa". TLD- and subdomain-insensitive on purpose. */
const label = (host) => {
  const parts = lower(host).replace(/^www\./, '').split('.').filter(Boolean);
  if (parts.length <= 1) return parts[0] || '';
  const CO = new Set(['com', 'co', 'net', 'org', 'gov', 'edu', 'ltd', 'me']);
  let i = parts.length - 2;
  if (i > 0 && CO.has(parts[i])) i -= 1;
  return parts[i] || '';
};
const hostOfUrl = (u) => { try { return new URL(lower(u).startsWith('http') ? u : 'https://' + u).hostname; } catch { return ''; } };
const tokens = (s) => lower(s).replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);

// Words that carry no identity — stripped before any name comparison.
const LEGAL = new Set(['co', 'company', 'llc', 'wll', 'ltd', 'limited', 'inc', 'plc', 'est',
  'establishment', 'spc', 'qpsc', 'qsc', 'qssc', 'sae', 'sao', 'trading', 'group', 'holding',
  'holdings', 'the', 'and', 'for', 'of', 'branch', 'services', 'service', 'general']);
const PARTICLES = new Set(['al', 'el', 'bin', 'ben', 'ibn', 'bint', 'abdul', 'abu', 'abo', 'bu',
  'um', 'umm', 'ash', 'ad', 'as', 'at', 'bo', 'de', 'van', 'der']);
const HONORIFICS = new Set(['mr', 'mrs', 'ms', 'miss', 'dr', 'eng', 'engr', 'prof', 'sheikh',
  'shaikh', 'capt', 'md', 'er', 'sir', 'hon']);

// Website-template placeholders. Every entry verified individually against live rows — these
// are domains a half-finished website ships with, never a real company's mail domain.
const PLACEHOLDER_LABELS = new Set(['mysite', 'atom', 'info', 'yourwebsite', 'yourdomain',
  'email', 'domainofferz', 'wena', 'yoursite', 'company', 'wp-domain', 'domain', 'website',
  'mydomain', 'test', 'validtheme', 'domainname', 'example', 'yourcompany', 'sentry']);
const PLACEHOLDER_EXACT = new Set(['domain.tld', 'yourdomain.tld', 'domain.ltd', 'wp-domain.ltd',
  'yourcompany.example.com', 'example.com', 'example.org', 'example.net']);

/** Every live (company, email) pair in the outreach pool, with the context each rule needs. */
async function poolRows() {
  const r = await query(`
    SELECT cc.company_id, lower(cc.value) AS email, c.name AS company_name,
           c.website, c.industry, c.city, cc.source, cc.source_label,
           EXISTS (SELECT 1 FROM person_contacts pc
                    WHERE pc.type='email' AND lower(pc.value)=lower(cc.value)) AS has_linked_person
      FROM company_contacts cc
      JOIN companies c ON c.id = cc.company_id
     WHERE cc.type='email' AND c.is_active = true AND COALESCE(c.archived,false) = false
       AND lower(cc.value) ~ '^[^@[:space:]]+@[^@[:space:]]+\\.[^@[:space:]]+$'`);
  return r.rows;
}

/** People Bell links to a company, for the A1 whole-token test. */
async function personTokenIndex() {
  const r = await query(`
    SELECT pc.company_id, p.full_name
      FROM person_companies pc JOIN people p ON p.id = pc.person_id
     WHERE COALESCE(p.archived,false) = false AND p.full_name IS NOT NULL`);
  const byCompany = new Map();
  for (const row of r.rows) {
    if (isPlaceholderName?.(row.full_name)) continue;
    const set = byCompany.get(Number(row.company_id)) || new Map();
    for (const t of tokens(row.full_name)) {
      if (t.length < 5 || PARTICLES.has(t) || HONORIFICS.has(t)) continue;
      if (!set.has(t)) set.set(t, row.full_name);
    }
    byCompany.set(Number(row.company_id), set);
  }
  return byCompany;
}

/**
 * Given names, built ONLY from registry-stated people — never from website-harvest, because
 * that same scraper produced the addresses being judged (it would be marking its own homework).
 * Floor is distinct NAMES >= 3, not row count: three identical "Editorial Director" rows would
 * otherwise make "editorial" a given name.
 */
async function givenNameDictionary() {
  const r = await query(`
    WITH names AS (
      SELECT DISTINCT lower(full_name) AS fn FROM people
       WHERE COALESCE(archived,false)=false AND full_name IS NOT NULL
         AND COALESCE(extra_fields->>'source','') <> 'website-harvest'
    ), toks AS (
      SELECT fn, unnest(string_to_array(regexp_replace(fn,'[^a-z ]',' ','g'),' ')) AS t FROM names
    )
    SELECT t, count(DISTINCT fn)::int AS n FROM toks
     WHERE length(t) >= 4 GROUP BY t HAVING count(DISTINCT fn) >= 3`);
  const dict = new Map();
  for (const x of r.rows) {
    if (PARTICLES.has(x.t) || HONORIFICS.has(x.t)) continue;
    dict.set(x.t, x.n);
  }
  // A token that is ALSO a common business word is not usable as a person signal.
  const biz = await query(`
    SELECT t, count(*)::int n FROM (
      SELECT unnest(string_to_array(regexp_replace(lower(name),'[^a-z ]',' ','g'),' ')) AS t
        FROM companies WHERE COALESCE(archived,false)=false) x
     WHERE length(t) >= 4 GROUP BY t HAVING count(*) > 2`);
  const bizWords = new Set(biz.rows.map((x) => x.t));
  for (const t of [...dict.keys()]) if (bizWords.has(t)) dict.delete(t);
  return dict;
}

/** How many DISTINCT companies hold each address (fan-out — ranks the queue, decides nothing). */
async function fanOut() {
  const r = await query(`
    SELECT lower(cc.value) AS email, count(DISTINCT COALESCE(c.parent_company_id, c.id))::int AS n,
           string_agg(DISTINCT c.name, ' · ' ORDER BY c.name) AS names
      FROM company_contacts cc JOIN companies c ON c.id = cc.company_id
     WHERE cc.type='email' AND COALESCE(c.archived,false)=false
     GROUP BY 1 HAVING count(DISTINCT COALESCE(c.parent_company_id, c.id)) > 1`);
  return new Map(r.rows.map((x) => [x.email, { n: x.n, names: x.names }]));
}

async function existingVerdicts() {
  const r = await query(`SELECT lower(email) AS email, verdict, decided_by FROM address_verdicts`)
    .catch(() => ({ rows: [] }));
  return new Map(r.rows.map((x) => [x.email, x]));
}

function isPlaceholderDomain(email, companyWebsite) {
  const d = domainOf(email);
  if (PLACEHOLDER_EXACT.has(d)) return true;
  if (/\.(test|invalid|localhost)$/.test(d)) return true;
  if (!PLACEHOLDER_LABELS.has(label(d))) return false;
  // GUARD: never purge a domain the company actually owns. Compared on the registrable label
  // so info@x.ae harvested from x.com is not wrongly condemned for a TLD difference.
  if (companyWebsite && label(hostOfUrl(companyWebsite)) === label(d)) return false;
  return true;
}

/**
 * Build the review queue.
 *   auto[]      — rules that survived adversarial review; safe to write without asking.
 *   proposals[] — a suggested verdict plus the literal evidence, for Val to confirm.
 * Addresses already carrying a verdict are never re-asked.
 */
export async function buildAddressQueue({ includeDecided = false } = {}) {
  const [rows, personIdx, dict, fan, decided] = await Promise.all([
    poolRows(), personTokenIndex(), givenNameDictionary(), fanOut(), existingVerdicts(),
  ]);

  // Collapse to one entry per ADDRESS — a mailbox has one owner, whatever Bell attached it to.
  const byEmail = new Map();
  for (const r of rows) {
    const e = lower(r.email);
    const cur = byEmail.get(e) || { email: e, companies: [], has_linked_person: false };
    cur.companies.push({ id: Number(r.company_id), name: r.company_name, website: r.website, industry: r.industry });
    cur.has_linked_person = cur.has_linked_person || r.has_linked_person;
    byEmail.set(e, cur);
  }

  const auto = [], proposals = [];
  for (const item of byEmail.values()) {
    if (!includeDecided && decided.has(item.email)) continue;
    const cls = classifyAddress({ email: item.email, hasLinkedPerson: item.has_linked_person });
    const local = localOf(item.email);
    const dom = domainOf(item.email);
    const consumer = CONSUMER_DOMAINS.has(dom);

    // ---- A3 (AUTO): a website-template placeholder domain. Not a company address at all.
    const ph = item.companies.find((c) => isPlaceholderDomain(item.email, c.website));
    if (ph !== undefined || (isPlaceholderDomain(item.email, null) && !item.companies.some((c) => c.website && label(hostOfUrl(c.website)) === label(dom)))) {
      auto.push({ ...item, verdict: 'not_a_company_address', rule_id: 'A3',
        evidence: { reason: 'website-template placeholder domain', domain: dom, companies: item.companies.length } });
      continue;
    }

    // Everything below only ever ACTS on rows Bell currently cannot classify.
    if (cls.outcome !== 'unclassified') continue;

    // ---- A1 (AUTO): a person Bell links to THIS company, matched on a whole token >= 5 chars.
    // Whole-token equality only: substring matching demoted customerservice@ on a person named
    // "Omer" and marketing@ on "Mark". The token must not be a word of the company's own name
    // or of its domain, or an eponymous family firm ("Jaber Trading") looks like its owner.
    let a1 = null;
    for (const c of item.companies) {
      const idx = personIdx.get(c.id); if (!idx) continue;
      const nameWords = new Set(tokens(c.name));
      for (const t of tokens(local.replace(/[^a-z]/g, ' '))) {
        if (t.length < 5 || !idx.has(t)) continue;
        if (nameWords.has(t) || label(dom).includes(t)) continue;   // → P2, needs a human
        a1 = { token: t, person: idx.get(t), company: c.name };
        break;
      }
      if (a1) break;
    }
    if (a1) {
      auto.push({ ...item, verdict: 'named_person', rule_id: 'A1',
        evidence: { reason: 'a person Bell links to this company shares this exact name token',
          token: a1.token, person: a1.person, company: a1.company } });
      continue;
    }

    // ---- P2 (PROPOSE named_person): A1's evidence, but the token is also in the company name.
    let p2 = null;
    for (const c of item.companies) {
      const idx = personIdx.get(c.id); if (!idx) continue;
      for (const t of tokens(local.replace(/[^a-z]/g, ' '))) {
        if (t.length >= 5 && idx.has(t)) { p2 = { token: t, person: idx.get(t), company: c.name }; break; }
      }
      if (p2) break;
    }
    if (p2) {
      proposals.push({ ...item, suggested: 'named_person', rule_id: 'P2', confidence: 'strong',
        evidence: { reason: 'Bell holds a person at this company with this name — but it is also a word of the company name, so only you can tell a brand from an owner',
          token: p2.token, person: p2.person, company: p2.company } });
      continue;
    }

    // ---- P1 (PROPOSE named_person): the local-part is a registry-stated given name.
    const gn = dict.get(local.replace(/[^a-z]/g, ''));
    if (gn && item.companies.length === 1 && !tokens(item.companies[0].name).includes(local)) {
      proposals.push({ ...item, suggested: 'named_person', rule_id: 'P1', confidence: 'strong',
        evidence: { reason: 'this is a given name in Bell\'s registry-sourced people records',
          given_name: local, people_with_this_name: gn } });
      continue;
    }

    // ---- P3 (PROPOSE role_mailbox): a stated role word plus the company's OWN anchor.
    // e.g. salesdoha@electraqatar.com, infoqatar@valenciatrading.com. The anchor must be the
    // company's own name/domain or a Qatar geo word — otherwise salesjeddah@ / infouae@ sneak
    // in, and those are foreign-branch mailboxes, a different problem entirely.
    const GEO = new Set(['qatar', 'doha', 'qa', 'qtr', 'gulf', 'mena', 'intl', 'international', 'global', 'group', 'holding']);
    if (!consumer) {
      const compact = local.replace(/[^a-z]/g, '');
      let p3 = null;
      for (const w of ROLE_LOCALPARTS) {
        if (w.length < 4 || !compact.startsWith(w)) continue;
        const rest = compact.slice(w.length);
        if (rest.length < 2) continue;
        // EXACT anchor equality only. Substring matching split "projectsales" into
        // "projects" + "ales" and accepted "ales" because it sits inside "sales" — the same
        // loose name-word matching that set thousands of wrong websites in the first
        // auto-approve pass. The remainder must BE the anchor, not merely resemble one.
        const anchors = new Set([...tokens(item.companies[0]?.name || ''), label(dom), ...GEO].filter((a) => a && a.length >= 2));
        if (anchors.has(rest)) { p3 = { role_word: w, anchor: rest }; break; }
        // …or the remainder is itself a stated department word (projectsales@, salesadmin@).
        if (ROLE_LOCALPARTS.has(rest)) { p3 = { role_word: w, anchor: rest, both_role_words: true }; break; }
      }
      if (p3) {
        proposals.push({ ...item, suggested: 'role_mailbox', rule_id: 'P3', confidence: 'good',
          evidence: { reason: 'a department word plus this company\'s own name, domain or Qatar',
            role_word: p3.role_word, anchor: p3.anchor, domain: dom } });
        continue;
      }
    }

    // ---- P4 (PROPOSE role_mailbox): the whole company identity, on the company's own domain.
    if (!consumer && item.companies.length === 1) {
      const c = item.companies[0];
      const distinct = tokens(c.name).filter((t) => !LEGAL.has(t) && !GEO.has(t) && t.length > 2);
      const compact = local.replace(/[^a-z]/g, '');
      if (distinct.length >= 2 && compact === distinct.join('') && c.website && label(hostOfUrl(c.website)) === label(dom)) {
        proposals.push({ ...item, suggested: 'role_mailbox', rule_id: 'P4', confidence: 'good',
          evidence: { reason: 'the mailbox is the company\'s whole name, on the company\'s own website domain',
            company: c.name, domain: dom, website: c.website } });
        continue;
      }
    }

    // ---- P5 (PROPOSE not_a_company_address): one mailbox, many unrelated firms.
    const f = fan.get(item.email);
    if (f && f.n >= 3) {
      proposals.push({ ...item, suggested: 'not_a_company_address', rule_id: 'P5', confidence: 'review',
        evidence: { reason: 'the same mailbox is held against several different companies — usually a PRO service, agent or accountant, so mailing it reaches a third party',
          company_count: f.n, companies: String(f.names || '').slice(0, 300) } });
      continue;
    }

    // ---- Nothing Bell holds decides it. Shown last, with whatever context exists.
    proposals.push({ ...item, suggested: null, rule_id: null, confidence: 'unknown',
      evidence: { reason: 'nothing in Bell settles this one', domain: dom, consumer_domain: consumer } });
  }
  return { auto, proposals };
}

/** Write the auto verdicts. Never overwrites a decision Val made himself. */
export async function applyAutoVerdicts(list, { dryRun = true } = {}) {
  if (dryRun) return { written: 0, would_write: list.length };
  let written = 0;
  for (const a of list) {
    const r = await query(`
      INSERT INTO address_verdicts (email, verdict, decided_by, suggested, rule_id, evidence)
      VALUES ($1,$2,$3,$2,$4,$5::jsonb)
      ON CONFLICT (email) DO UPDATE
        SET verdict = EXCLUDED.verdict, evidence = EXCLUDED.evidence,
            rule_id = EXCLUDED.rule_id, updated_at = now()
        WHERE address_verdicts.decided_by <> 'val'
      RETURNING id`,
      [a.email, a.verdict, 'auto:' + a.rule_id, a.rule_id, JSON.stringify(a.evidence || {})]);
    written += r.rowCount;
  }
  return { written };
}

/** Record Val's own decision. His verdict is final and no auto pass may overwrite it. */
export async function recordVerdict({ email, verdict, suggested = null, rule_id = null, evidence = {}, note = null }) {
  const prev = (await query(`SELECT verdict, decided_by FROM address_verdicts WHERE lower(email)=lower($1)`, [email])).rows[0];
  const ev = { ...evidence, ...(prev ? { previous: prev } : {}) };
  await query(`
    INSERT INTO address_verdicts (email, verdict, decided_by, suggested, rule_id, evidence, note)
    VALUES (lower($1),$2,'val',$3,$4,$5::jsonb,$6)
    ON CONFLICT (email) DO UPDATE
      SET verdict=EXCLUDED.verdict, decided_by='val', suggested=EXCLUDED.suggested,
          rule_id=EXCLUDED.rule_id, evidence=EXCLUDED.evidence, note=EXCLUDED.note, updated_at=now()`,
    [email, verdict, suggested, rule_id, JSON.stringify(ev), note]);
  return { ok: true };
}
