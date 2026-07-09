// Bell — Engine & Tender diagnostic — run via "Diagnose Bell Engines.command".
//
// READ-ONLY. Answers, with evidence rather than guesses:
//   1. Is the always-on engine actually beating? (heartbeat age, pid alive)
//   2. Did migration 076 apply? (stage12 / company_tech / heartbeat tech cols)
//   3. Is Crawl4AI up? Is the Playwright renderer up? (the render ladder)
//   4. Were the engine stage flags mass-reset? (the "unknown scope → all" trap)
//   5. Why are N Monaqasat tenders stuck pending? — fetches a few real detail
//      pages and reports exactly what comes back.
// Nothing is written.

import { query } from '../db.js';

const pad = (x, n = 10) => String(typeof x === 'number' ? x.toLocaleString() : x).padStart(n);
const yn = (b) => (b ? 'YES' : 'no');

async function colExists(table, col) {
  const r = await query(
    `SELECT 1 FROM information_schema.columns WHERE table_name=$1 AND column_name=$2 LIMIT 1`, [table, col]);
  return r.rows.length > 0;
}
async function tableExists(table) {
  const r = await query(`SELECT to_regclass($1) IS NOT NULL AS ok`, ['public.' + table]);
  return !!r.rows[0].ok;
}
const n1 = async (sql, p = []) => Number((await query(sql, p)).rows[0].n);

(async () => {
  console.log('Bell — Engine & Tender Diagnostic (read-only)\n');

  // ── 1/2. Schema ───────────────────────────────────────────────────────────
  console.log('SCHEMA (migration 076 — Engine 6 tech stack)');
  const hasStage12 = await colExists('companies', 'stage12_at');
  const hasTechTbl = await tableExists('company_tech');
  const hasTechTot = await colExists('engine_heartbeat', 'tech_total');
  console.log('  companies.stage12_at exists:      ' + yn(hasStage12));
  console.log('  company_tech table exists:        ' + yn(hasTechTbl));
  console.log('  engine_heartbeat.tech_total:      ' + yn(hasTechTot));
  if (!(hasStage12 && hasTechTbl && hasTechTot)) {
    console.log('  ⚠ Migration 076 has NOT applied — restart the local Portal (it applies migrations on boot).');
  }
  try {
    const m = await query(`SELECT filename FROM bdi_schema_migrations ORDER BY filename DESC LIMIT 3`);
    console.log('  last migrations applied:         ' + m.rows.map((r) => r.filename).join(', '));
  } catch { /* table name may differ */ }

  // ── 3. Heartbeat ──────────────────────────────────────────────────────────
  console.log('\nALWAYS-ON ENGINE (continuous_sweep daemon)');
  try {
    const hb = (await query(`SELECT * FROM engine_heartbeat WHERE id = 1`)).rows[0];
    if (!hb) {
      console.log('  no heartbeat row — the engine has never run on this database.');
    } else {
      const ageMs = Date.now() - new Date(hb.updated_at).getTime();
      const ageMin = Math.round(ageMs / 60000);
      console.log('  state:                           ' + hb.state);
      console.log('  last beat:                       ' + ageMin + ' min ago ' + (ageMs < 180000 ? '(alive ✓)' : '(STALE — dashboard shows "Stopped")'));
      console.log('  round:                           ' + pad(hb.round_no || 0));
      console.log('  pid:                             ' + hb.pid);
      let alive = false;
      try { process.kill(hb.pid, 0); alive = true; } catch { alive = false; }
      console.log('  is that pid still running:       ' + yn(alive) + (alive ? '' : '  ← the daemon died / was unloaded'));
      if (hasTechTot) console.log('  tech_total / tech_left:          ' + (hb.tech_total ?? '—') + ' / ' + (hb.tech_left ?? '—'));
    }
    const ctl = (await query(`SELECT paused FROM engine_control WHERE id = 1`).catch(() => ({ rows: [] }))).rows[0];
    if (ctl) console.log('  paused by dashboard:             ' + yn(ctl.paused));
  } catch (e) {
    console.log('  heartbeat read failed: ' + e.message);
  }

  // ── 4. Render ladder ──────────────────────────────────────────────────────
  console.log('\nRENDER LADDER (needed by tender enrich + harvester)');
  let c4 = false, pw = false;
  try { const m = await import('../enrichment/local/crawl4ai.js'); c4 = await m.crawl4aiAvailable(); } catch { c4 = false; }
  try { const r = await import('../enrichment/local/render.js'); pw = await r.rendererAvailable().catch(() => false); } catch { pw = false; }
  console.log('  Crawl4AI server up:              ' + yn(c4) + (c4 ? '' : '  ← run "Restart Crawl4AI Engine.command"'));
  console.log('  Playwright renderer available:   ' + yn(pw) + (pw ? '' : '  ← run "Install Harvester Browser.command"'));
  if (!c4 && !pw) console.log('  ⚠ NEITHER renderer is up → every detail fetch fails instantly ("0 detailed in 0m").');

  // ── 5. Stage-flag reset detector ──────────────────────────────────────────
  console.log('\nENGINE FRONTIER (were stage flags mass-reset?)');
  const active = `COALESCE(archived,false)=false AND is_active IS NOT false`;
  const hasSite = `website IS NOT NULL AND btrim(website)<>''`;
  const total = await n1(`SELECT count(*)::int n FROM companies WHERE ${active}`);
  const noSite = await n1(`SELECT count(*)::int n FROM companies WHERE ${active} AND (website IS NULL OR btrim(website)='')`);
  const withSite = await n1(`SELECT count(*)::int n FROM companies WHERE ${active} AND ${hasSite}`);
  const f8 = await n1(`SELECT count(*)::int n FROM companies WHERE ${active} AND (website IS NULL OR btrim(website)='') AND stage8_at IS NULL`);
  const f7 = await n1(`SELECT count(*)::int n FROM companies WHERE ${active} AND ${hasSite} AND stage7_at IS NULL`);
  const f10 = await n1(`SELECT count(*)::int n FROM companies WHERE ${active} AND ${hasSite} AND stage10_at IS NULL`);
  const f11 = await n1(`SELECT count(*)::int n FROM companies WHERE ${active} AND ${hasSite} AND stage11_at IS NULL`);
  const f12 = hasStage12 ? await n1(`SELECT count(*)::int n FROM companies WHERE ${active} AND ${hasSite} AND stage12_at IS NULL`) : -1;
  console.log('  active companies:                ' + pad(total) + '   (with website ' + withSite.toLocaleString() + ' · without ' + noSite.toLocaleString() + ')');
  console.log('  Engine 1 Finder  to do:          ' + pad(f8) + '   of ' + noSite.toLocaleString() + ' website-less   ⚠ PAID (Firecrawl search ~2 credits each)');
  console.log('  Engine 2 Harvest to do:          ' + pad(f7) + '   of ' + withSite.toLocaleString() + '   (free)');
  console.log('  Engine 4 Email   to do:          ' + pad(f10) + '   (free)');
  console.log('  Engine 5 Facts   to do:          ' + pad(f11) + '   (local-first, free)');
  if (f12 >= 0) console.log('  Engine 6 Tech    to do:          ' + pad(f12) + '   of ' + withSite.toLocaleString() + '   (free — expected = all, it is new)');
  const resetPct = noSite ? Math.round((f8 / noSite) * 100) : 0;
  if (resetPct > 80) {
    console.log(`\n  ⚠⚠ ${resetPct}% of website-less companies are queued for Engine 1 (paid search).`);
    console.log('     If you did NOT intend a full re-scan, this is the "Re-scan tech on an old server"');
    console.log('     fallback. Engine 1 is the only paid one — PAUSE the engine on the Local Engines');
    console.log('     tab before it runs, and tell Claude this number.');
  } else {
    console.log('\n  ✓ No sign of a full Engine-1 re-queue (paid search is not mass-scheduled).');
  }
  if (hasTechTbl) console.log('  company_tech rows so far:        ' + pad(await n1(`SELECT count(*)::int n FROM company_tech`)));

  // ── 6. Stuck tenders — probe the real pages ───────────────────────────────
  console.log('\nSTUCK MONAQASAT TENDERS (why "0 detailed")');
  // A real detail id is a non-empty STRING; jsonb_exists() is also true for a
  // JSON null (the parser's honest "card had no detail link") — those rows can
  // never be fetched and must not be counted as pending.
  const HAS_ID = `jsonb_typeof(raw->'detail_id')='string' AND btrim(raw->>'detail_id')<>''`;
  const pend = await n1(
    `SELECT count(*)::int n FROM tenders WHERE source='monaqasat' AND ${HAS_ID}
       AND (NOT jsonb_exists(raw,'activities') OR COALESCE(NULLIF(raw->>'detail_v','')::int,1) < 2)`);
  const unlinked = await n1(`SELECT count(*)::int n FROM tenders WHERE source='monaqasat' AND NOT (${HAS_ID})`);
  console.log('  fetchable + still pending:       ' + pad(pend));
  console.log('  no detail link on the card:      ' + pad(unlinked) + '   (nothing to fetch — excluded from "pending")');
  if (pend > 0) {
    const sample = (await query(
      `SELECT id, source_ref, status, raw->>'detail_id' AS detail_id
         FROM tenders WHERE source='monaqasat' AND ${HAS_ID}
          AND (NOT jsonb_exists(raw,'activities') OR COALESCE(NULLIF(raw->>'detail_v','')::int,1) < 2)
        ORDER BY COALESCE(awarded_at, published_at, created_at) DESC NULLS LAST LIMIT 3`)).rows;
    const { render, BASE } = await import('../tenders/scrape_monaqasat.js');
    for (const t of sample) {
      const url = `${BASE}/TendersOnlineServices/TenderDetails/${t.detail_id}`;
      process.stdout.write(`\n  ${t.source_ref} (${t.status}) → ${url}\n    fetching… `);
      const t0 = Date.now();
      let page = null, err = null;
      try { page = await render(url, 20_000); } catch (e) { err = e.message; }
      const ms = Date.now() - t0;
      if (err) { console.log(`ERROR after ${ms}ms: ${err}`); continue; }
      if (!page || !page.text) { console.log(`render returned NOTHING after ${ms}ms  ← renderer down or page blocked`); continue; }
      const txt = page.text;
      const hasHeader = /Tender number/i.test(txt);
      const hasActs = /Activit(y|ies)\s*(name|code)?/i.test(txt);
      console.log(`ok in ${ms}ms · ${txt.length.toLocaleString()} chars · "Tender number" ${yn(hasHeader)} · activities block ${yn(hasActs)}`);
      console.log('    first 160 chars: ' + txt.slice(0, 160).replace(/\s+/g, ' '));
      if (txt.length <= 1500) console.log('    ⚠ page under the 1,500-char guard → left pending by design (partial render)');
      else if (!hasHeader) console.log('    ⚠ over 1,500 chars but NO "Tender number" → the guard never stamps it → stuck forever. Claude must relax the guard.');
    }
  }

  console.log('\n\nWhat to do with this: send the whole output to Claude.');
  process.exit(0);
})().catch((e) => { console.error('Diagnostic failed: ' + e.message); process.exit(1); });
