// Spark batch-enrichment engine (LOCAL Mac only — results sync via the existing mirror).
//
// One run: pick the next pending companies (companies.spark_status IS NULL) that fit the
// 10k-char prompt cap, submit to Firecrawl's agent with the flat schema, poll to completion,
// then ingest every returned fact source-attributed:
//   emails/phones/whatsapp/socials → company_contacts (junk-gated via upsertContact)
//   addresses                      → company_locations (geocoded later by the QARS engine)
//   financials                     → company_financials  · owners → company_shareholders
//   partnerships                   → company_partnerships
//   description/leadership/reviews/news → extra_fields.spark (quarantine-style, admin-visible)
//   related_companies              → spark_discoveries (Qatar = promotion candidates;
//                                    non-Qatar kept ADMIN-ONLY for Middle-East expansion)
//
// SELF-ADJUSTING BATCH (Val: "try big, adjust if it doesn't work"): coverage below 60% halves
// the next batch; above 90% grows it 20% (25..150 bounds). State in outreach_state
// 'spark_batch_size'. Every run is ledgered in spark_runs. 5 free runs/day — the runner stops
// on quota errors honestly.

import { query } from '../../db.js';
import { agent, agentStatus } from '../clients/firecrawl.js';
import { SPARK_SCHEMA, buildPrompt, fitBatch } from './schema.js';
import { upsertContact } from '../../lib/contacts.js';
import { packRaw } from '../../tenders/raw.js';
import { getState, setState } from '../../outreach/machine.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function currentBatchSize() {
  const s = await getState('spark_batch_size');
  // Floor 5 (calibration can go small after a max-credits refusal), ceiling 150 (prompt cap).
  const size = Math.min(150, Math.max(5, Number(s?.size) || 120));
  // 'ceiling' = the refusal-proven per-run credit limit. Growth must never re-climb past it —
  // every re-probe of the refusal zone burns one of the 5 free daily runs.
  const ceiling = Number(s?.ceiling) || 0;
  return ceiling >= 5 ? Math.min(size, ceiling) : size;
}

async function pickPending(limit) {
  // Spark's unique power is finding web presence Bell doesn't know — so NO-WEBSITE companies
  // first (the harvester/reharvest can't help those at all), best-scored first within each
  // band. Website-having companies still follow; every company is submitted eventually.
  const r = await query(
    `SELECT id, name, primary_registration_no AS cr, city, website FROM companies
      WHERE spark_status IS NULL AND is_active = true AND COALESCE(archived, false) = false
      ORDER BY (website IS NOT NULL), bell_score DESC NULLS LAST, id LIMIT $1`, [limit]);
  return r.rows;
}

export async function pendingCount() {
  const r = await query(
    `SELECT count(*)::int AS n FROM companies
      WHERE spark_status IS NULL AND is_active = true AND COALESCE(archived, false) = false`);
  return r.rows[0].n;
}

// ---------------------------------------------------------------------------
// Ingest one company's result object. Returns the number of facts written.
// ---------------------------------------------------------------------------
async function ingestCompany(c, out) {
  let facts = 0;
  const SRC = 'spark-agent';
  const srcUrl = Array.isArray(out.source_urls) && out.source_urls[0] ? String(out.source_urls[0]).slice(0, 500) : null;

  for (const e of (out.emails || []).slice(0, 12)) {
    if (await upsertContact('company', c.id, { type: 'email', value: String(e), source: SRC, source_url: srcUrl })) facts++;
  }
  for (const p of (out.phones || []).slice(0, 8)) {
    if (await upsertContact('company', c.id, { type: 'phone', value: String(p), source: SRC, source_url: srcUrl })) facts++;
  }
  for (const w of (out.whatsapp || []).slice(0, 4)) {
    if (await upsertContact('company', c.id, { type: 'whatsapp', value: String(w), source: SRC, source_url: srcUrl, source_label: 'WhatsApp' })) facts++;
  }
  for (const s of (out.social_links || []).slice(0, 10)) {
    if (/^https?:\/\//i.test(String(s)) && await upsertContact('company', c.id, { type: 'social', value: String(s).slice(0, 300), source: SRC, source_url: srcUrl })) facts++;
  }
  for (const a of (out.addresses || []).slice(0, 6)) {
    const addr = String(a).replace(/\s+/g, ' ').trim().slice(0, 300);
    if (addr.length < 12) continue;
    const r = await query(
      `INSERT INTO company_locations (company_id, address, source, source_url, updated_at)
       VALUES ($1,$2,$3,$4, now())
       ON CONFLICT (company_id, lower(address)) DO NOTHING RETURNING id`,
      [c.id, addr, SRC, srcUrl]).catch(() => null);
    if (r?.rows?.[0]) facts++;
  }
  // Registration number — only fill a blank, never overwrite registry data.
  if (out.registration_number) {
    const r = await query(
      `UPDATE companies SET primary_registration_no=$2 WHERE id=$1
        AND (primary_registration_no IS NULL OR btrim(primary_registration_no)='') RETURNING id`,
      [c.id, String(out.registration_number).slice(0, 60)]).catch(() => null);
    if (r?.rows?.[0]) facts++;
  }
  for (const f of (out.financials || []).slice(0, 10)) {
    if (!f?.metric || !f?.value) continue;
    const r = await query(
      `INSERT INTO company_financials (company_id, metric, value_text, period, confidence, source)
       VALUES ($1,$2,$3,$4,'stated',$5) ON CONFLICT DO NOTHING RETURNING id`,
      [c.id, String(f.metric).slice(0, 80), String(f.value).slice(0, 120), f.period ? String(f.period).slice(0, 40) : null,
       (f.source_url ? String(f.source_url) : SRC).slice(0, 500)]).catch(() => null);
    if (r?.rows?.[0]) facts++;
  }
  for (const o of (out.owners || []).slice(0, 10)) {
    if (!o?.name) continue;
    const r = await query(
      `INSERT INTO company_shareholders (company_id, holder_name, stake_text, confidence, source)
       VALUES ($1,$2,$3,'stated',$4) ON CONFLICT DO NOTHING RETURNING id`,
      [c.id, String(o.name).slice(0, 160), o.stake ? String(o.stake).slice(0, 60) : null,
       (o.source_url ? String(o.source_url) : SRC).slice(0, 500)]).catch(() => null);
    if (r?.rows?.[0]) facts++;
  }
  for (const p of (out.partnerships || []).slice(0, 12)) {
    if (!p?.partner_name) continue;
    const r = await query(
      `INSERT INTO company_partnerships (company_id, partner_name, description, confidence, source)
       VALUES ($1,$2,$3,'stated',$4) ON CONFLICT DO NOTHING RETURNING id`,
      [c.id, String(p.partner_name).slice(0, 160), p.description ? String(p.description).slice(0, 300) : null,
       (p.source_url ? String(p.source_url) : SRC).slice(0, 500)]).catch(() => null);
    if (r?.rows?.[0]) facts++;
  }
  // Narrative facts land in extra_fields.spark (admin-visible, never asserted as columns).
  const sparkBlob = {};
  if (out.description) sparkBlob.description = String(out.description).slice(0, 2000);
  if (out.confirmed_name) sparkBlob.confirmed_name = String(out.confirmed_name).slice(0, 200);
  if (Array.isArray(out.leadership) && out.leadership.length) sparkBlob.leadership = out.leadership.slice(0, 15);
  if (out.rating != null) sparkBlob.rating = out.rating;
  if (out.reviews_count != null) sparkBlob.reviews_count = out.reviews_count;
  if (out.reviews_summary) sparkBlob.reviews_summary = String(out.reviews_summary).slice(0, 600);
  if (Array.isArray(out.news) && out.news.length) sparkBlob.news = out.news.slice(0, 10);
  if (Array.isArray(out.source_urls) && out.source_urls.length) sparkBlob.source_urls = out.source_urls.slice(0, 20);
  if (Object.keys(sparkBlob).length) {
    sparkBlob.gathered_at = new Date().toISOString();
    await query(
      `UPDATE companies SET extra_fields = COALESCE(extra_fields, '{}'::jsonb) || jsonb_build_object('spark', $2::jsonb) WHERE id=$1`,
      [c.id, packRaw(sparkBlob)]).catch(() => {});
    facts += Object.keys(sparkBlob).length - 1;
  }
  // Website — only fill a blank (finder/harvester own this field otherwise).
  if (out.website && /^https?:\/\//i.test(out.website)) {
    await query(`UPDATE companies SET website=$2 WHERE id=$1 AND (website IS NULL OR btrim(website)='')`,
      [c.id, String(out.website).slice(0, 300)]).catch(() => {});
  }
  // Discovered companies → spark_discoveries (Qatar candidates + non-Qatar admin-only pool).
  for (const rc of (out.related_companies || []).slice(0, 15)) {
    if (!rc?.name || String(rc.name).trim().length < 3) continue;
    await query(
      `INSERT INTO spark_discoveries (name, country, website, relation, source_company_id, source_url, raw)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)
       ON CONFLICT (lower(name), COALESCE(lower(website), '')) DO NOTHING`,
      [String(rc.name).slice(0, 200), rc.country ? String(rc.country).slice(0, 60) : null,
       rc.website ? String(rc.website).slice(0, 300) : null,
       rc.relation ? String(rc.relation).slice(0, 40) : null,
       c.id, rc.source_url ? String(rc.source_url).slice(0, 500) : null, packRaw(rc)]).catch(() => {});
  }
  return facts;
}

// ---------------------------------------------------------------------------
// One full run: pick → submit → poll → ingest → adjust batch size.
// ---------------------------------------------------------------------------
export async function runOneBatch({ onProgress = () => {}, batchOverride = null } = {}) {
  const size = batchOverride || await currentBatchSize();
  const candidates = await pickPending(size);
  if (!candidates.length) return { status: 'no_pending' };
  const rows = fitBatch(candidates);
  const prompt = buildPrompt(rows);
  onProgress(`submitting ${rows.length} companies (prompt ${prompt.length} chars)…`);

  const run = (await query(
    `INSERT INTO spark_runs (batch_size, company_ids) VALUES ($1,$2) RETURNING id`,
    [rows.length, rows.map((r) => r.id)])).rows[0];
  await query(`UPDATE companies SET spark_status='submitted', spark_at=now() WHERE id = ANY($1)`, [rows.map((r) => r.id)]);

  let jobId;
  try {
    const res = await agent(prompt, SPARK_SCHEMA, {});
    jobId = res.id;
    await query(`UPDATE spark_runs SET firecrawl_job_id=$2, updated_at=now() WHERE id=$1`, [run.id, jobId]);
  } catch (e) {
    await query(`UPDATE spark_runs SET status='failed', error=$2, updated_at=now() WHERE id=$1`, [run.id, String(e.message).slice(0, 500)]);
    await query(`UPDATE companies SET spark_status=NULL WHERE id = ANY($1)`, [rows.map((r) => r.id)]);   // back to pending
    return { status: 'submit_failed', error: e.message };
  }

  // Poll (typical 1-5 min; give it up to 25).
  onProgress('agent running (job ' + jobId + ') — polling…');
  let resp = null;
  for (let i = 0; i < 100; i += 1) {
    await sleep(15_000);
    try { resp = await agentStatus(jobId); } catch { continue; }
    if (resp.status === 'completed' || resp.status === 'failed' || resp.status === 'cancelled') break;
    if (i % 4 === 3) onProgress('still running… (' + Math.round((i + 1) * 15 / 60) + ' min)');
  }
  if (!resp || resp.status !== 'completed') {
    const err = resp?.error || (resp ? 'status ' + resp.status : 'poll timeout');
    await query(`UPDATE spark_runs SET status='failed', error=$2, completed_at=now(), updated_at=now() WHERE id=$1`, [run.id, String(err).slice(0, 500)]);
    await query(`UPDATE companies SET spark_status=NULL WHERE id = ANY($1)`, [rows.map((r) => r.id)]);
    // "Agent reached max credits" = the batch asked for more research than one free run can
    // hold (Val's live calibration, run 1: 144 companies → refusal). Shrink HARD (÷3, floor 5)
    // and tell the runner to retry smaller instead of giving up the day.
    if (/max credits|refusal/i.test(String(err))) {
      const s = (await getState('spark_batch_size')) || {};
      const cur = await currentBatchSize();
      // This refusal PROVED cur is over the per-run credit limit — remember a safe ceiling
      // (75% of the refused size, and never higher than a previously proven one).
      const prior = Number(s.ceiling) || 150;
      const ceiling = Math.max(5, Math.min(prior, Math.floor(cur * 0.75)));
      const next = Math.max(5, Math.min(Math.floor(cur / 3), ceiling));
      await setState('spark_batch_size', { size: next, ceiling });
      return { status: 'shrunk', error: err, next_batch: next };
    }
    return { status: 'run_failed', error: err };
  }

  const returned = Array.isArray(resp.data?.companies) ? resp.data.companies : [];
  const byId = new Map(rows.map((r) => [Number(r.id), r]));
  let ingestedFacts = 0, matched = 0, emptyN = 0;
  for (const out of returned) {
    const c = byId.get(Number(out.bell_id));
    if (!c) continue;
    matched += 1;
    byId.delete(Number(out.bell_id));
    if (out.found === false) {
      emptyN += 1;
      await query(`UPDATE companies SET spark_status='empty', spark_at=now() WHERE id=$1`, [c.id]);
      continue;
    }
    const facts = await ingestCompany(c, out);
    ingestedFacts += facts;
    await query(`UPDATE companies SET spark_status=$2, spark_at=now() WHERE id=$1`, [c.id, facts > 0 ? 'done' : 'empty']);
  }
  // Companies the agent never returned go back to pending — they were not researched.
  const missing = [...byId.keys()];
  if (missing.length) await query(`UPDATE companies SET spark_status=NULL WHERE id = ANY($1)`, [missing]);

  const coverage = matched / rows.length;
  await query(
    `UPDATE spark_runs SET status=$2, returned_count=$3, ingested_facts=$4, completed_at=now(), updated_at=now() WHERE id=$1`,
    [run.id, matched ? 'completed' : 'empty', matched, ingestedFacts]);

  // Self-adjust the dial — growth never climbs past the refusal-proven ceiling.
  const s = (await getState('spark_batch_size')) || {};
  const ceiling = Number(s.ceiling) >= 5 ? Number(s.ceiling) : 150;
  const cur = await currentBatchSize();
  let next = cur;
  if (coverage < 0.6) next = Math.max(5, Math.floor(cur * 0.6));
  else if (coverage >= 0.9) next = Math.min(150, ceiling, Math.ceil(cur * 1.2));
  if (next !== cur) await setState('spark_batch_size', { size: next, ...(Number(s.ceiling) >= 5 ? { ceiling: Number(s.ceiling) } : {}) });

  return {
    status: 'completed', submitted: rows.length, returned: matched, empty: emptyN,
    unreturned: missing.length, facts: ingestedFacts,
    coverage: Math.round(coverage * 100), next_batch: next,
  };
}
