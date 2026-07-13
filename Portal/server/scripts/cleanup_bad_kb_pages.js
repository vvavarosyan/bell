// Remove JUNK pages already stored in the Qatar Knowledge Base.
// Run via "Preview Bad-KB-Page Cleanup.command" (dry run) then
// "Apply Bad-KB-Page Cleanup.command" (writes). KB_CLEANUP_APPLY=1 = write.
//
// WHY (found live 2026-07-13, first regulator scan): Amiri Diwan (a Sitecore site)
// leaked two kinds of junk into the KB:
//   1. A SOFT-404 — the server answered HTTP 200 with a "404 Page" body, which the
//      old store gate accepted. (crawl.js now rejects these via isErrorShell; this
//      script removes the ones already stored, across ALL sources.)
//   2. ARABIC pages served under the /ar-qa/ PATH (the old sc_lang=ar query-exclude
//      never caught a path), mis-detected as English. (Migration 089 pins Diwan to
//      the /en/ path; this removes the leaked Arabic pages.)
//
// SCOPE IS TIGHT (Rule 2.1 — never delete real data): only (a) pages isErrorShell()
// flags, and (b) Amiri-Diwan pages whose URL is under /ar-qa/ or /ar/. Al Meezan's
// Arabic LAWS are legitimately Arabic and are NEVER touched (different source, no
// /ar-qa/ path). Every candidate is shown in the preview before anything is deleted.
//
// Deletions mirror to prod: sync_deletions tombstones first, then POST
// /api/sync/delete (knowledge_pages + knowledge_changes). If the push fails, the
// tombstones stay and the next regular sync push drains them.

import { query } from '../db.js';
import { getKey } from '../keychain.js';
import { isErrorShell } from '../knowledge/crawl.js';

const APPLY = process.env.KB_CLEANUP_APPLY === '1';
const short = (s, n = 60) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

// Every rule below EXCLUDES category='laws' (Al Meezan) — its Arabic laws are
// legitimate and its own crawler validates them; only generic fetched sources leak
// shells/chrome/duplicates (Rule 2.1 — never delete a real law).

// Candidate error-shell pages (broad SQL pre-filter; isErrorShell() decides precisely
// in JS so we don't load every page's content into memory on the 8 GB Mac).
const SHELL_CANDIDATES_SQL = `
  SELECT p.id, p.url, p.title, p.content, s.name AS source
    FROM knowledge_pages p JOIN knowledge_sources s ON s.id = p.source_id
   WHERE p.active AND s.category <> 'laws'
     AND ( p.title ~* '^(40[0-9]|41[0-9]|50[0-9])'
        OR p.title ~* '(not found|access denied|forbidden|bad request|error[[:space:]]+[0-9])'
        OR (p.word_count < 120 AND p.content ~* '(cannot be found|could not be found|does not exist|no longer (available|exists?)|was not found)') )`;

// Amiri-Diwan Arabic-path pages (leaked before migration 089 pinned it to /en/).
const DIWAN_ARABIC_SQL = `
  SELECT p.id, p.url, p.title, s.name AS source
    FROM knowledge_pages p JOIN knowledge_sources s ON s.id = p.source_id
   WHERE p.active AND s.name = 'Amiri Diwan' AND p.url ~ '/ar-qa(/|$)|/ar(/|$)'`;

// Pure site-chrome pages — legal/utility boilerplate, never knowledge. Requires BOTH
// the title AND the URL to read as chrome, so a real page with a mis-extracted chrome
// title (e.g. MOFA "right-to-access-information" shown as "Privacy Statement") is kept.
const CHROME_SQL = `
  SELECT p.id, p.url, p.title, s.name AS source
    FROM knowledge_pages p JOIN knowledge_sources s ON s.id = p.source_id
   WHERE p.active AND s.category <> 'laws' AND p.word_count < 220
     AND p.title ~* '^(contact( us| the .*)?|privacy( policy| statement)?|terms( of (use|service))?|cookie(s| policy)?|site ?map|accessibility|sign in|log ?in|search( results)?|disclaimer|copyright)\\s*$'
     AND p.url ~* '(contact|privacy|terms|cookie|site-?map|accessib|sign-?in|log-?in|disclaimer|copyright)(-[a-z]+)?(/|\\?|$|\\.aspx)'`;

// Exact-duplicate NAV junk: the same short content_hash repeated many times (e.g. 95
// MOFA "Media Center" JS-gallery pages where only the menu rendered). Keep the lowest
// id as a representative, delete the rest. Short + large-group + non-laws → safe.
const DUP_NAV_SQL = `
  WITH grp AS (
    SELECT p.id, p.url, p.title, s.name AS source, p.content_hash,
           count(*) OVER (PARTITION BY p.content_hash) AS grp_n,
           row_number() OVER (PARTITION BY p.content_hash ORDER BY p.id) AS rn
      FROM knowledge_pages p JOIN knowledge_sources s ON s.id = p.source_id
     WHERE p.active AND s.category <> 'laws' AND p.word_count < 120 AND p.content_hash IS NOT NULL
  )
  SELECT id, url, title, source FROM grp WHERE grp_n >= 5 AND rn > 1`;

async function pushDeletions(table, ids) {
  const token = await getKey('sync-token');
  if (!token) return { skipped: 'no sync token — tombstones stay, next regular push applies them' };
  const s = await query(`SELECT value FROM settings WHERE key = 'sync_target_url'`).catch(() => ({ rows: [] }));
  const base = String((s.rows[0] && s.rows[0].value) || process.env.BDI_SYNC_TARGET_URL || 'https://app.bell.qa').replace(/\/+$/, '');
  const res = await fetch(base + '/api/sync/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
    body: JSON.stringify({ table, ids }),
  });
  if (!res.ok) { const t = await res.text().catch(() => ''); return { error: 'prod HTTP ' + res.status + ' ' + t.slice(0, 140) }; }
  return await res.json().catch(() => ({}));
}

async function main() {
  console.log(`Bell — Bad-KB-Page Cleanup (${APPLY ? '⚠️ APPLY — will delete' : 'PREVIEW, read-only'})\n`);

  // 1) Error shells — SQL pre-filter, then confirm precisely with isErrorShell().
  const shellCand = (await query(SHELL_CANDIDATES_SQL)).rows;
  const shells = shellCand.filter((r) => isErrorShell(r.title, r.content));
  // 2) Amiri Diwan Arabic-path pages. 3) chrome pages. 4) exact-duplicate nav junk.
  const arabic = (await query(DIWAN_ARABIC_SQL)).rows;
  const chrome = (await query(CHROME_SQL)).rows;
  const dupes = (await query(DUP_NAV_SQL)).rows;

  // Union of page ids to remove (first reason wins for the label).
  const byId = new Map();
  const add = (rows, why) => { for (const r of rows) if (!byId.has(r.id)) byId.set(r.id, { ...r, why }); };
  add(shells, 'error shell');
  add(arabic, 'Arabic /ar-qa/ path');
  add(chrome, 'site chrome (contact/privacy/…)');
  add(dupes, 'duplicate nav page');
  const pages = [...byId.values()];

  if (!pages.length) { console.log('✓ No junk KB pages found. Nothing to clean.'); return; }

  console.log(`JUNK PAGES TO REMOVE: ${pages.length}\n`);
  for (const p of pages) console.log(`  ✗ #${p.id}  [${p.source}]  (${p.why})  "${short(p.title)}"\n       ${short(p.url, 90)}`);

  // The change-feed rows that point at these junk pages (so "Recent updates" and the
  // Gazette feed never show a deleted junk title).
  const urls = pages.map((p) => p.url);
  const changeIds = (await query(
    `SELECT id FROM knowledge_changes WHERE url = ANY($1::text[])`, [urls])).rows.map((r) => r.id);

  if (!APPLY) {
    console.log(`\nAlso ${changeIds.length} matching change-feed row(s) would be removed.`);
    console.log(`\nPREVIEW ONLY — nothing changed. Run "Apply Bad-KB-Page Cleanup.command" to remove the ${pages.length} page(s).`);
    return;
  }

  const pageIds = pages.map((p) => p.id);
  const tombstone = async (table, ids) => {
    let n = 0;
    for (const id of ids) {
      await query(`INSERT INTO sync_deletions (table_name, row_id) VALUES ($1, $2)`, [table, id])
        .then(() => { n++; }).catch((e) => console.warn(`  tombstone ${table}#${id} failed — ${e.message}`));
    }
    return n;
  };
  const stonesP = await tombstone('knowledge_pages', pageIds);
  const stonesC = await tombstone('knowledge_changes', changeIds);
  const delC = changeIds.length ? await query(`DELETE FROM knowledge_changes WHERE id = ANY($1::bigint[])`, [changeIds]) : { rowCount: 0 };
  const delP = await query(`DELETE FROM knowledge_pages WHERE id = ANY($1::bigint[])`, [pageIds]);
  console.log(`\nDeleted locally: ${delP.rowCount} page(s) + ${delC.rowCount} change-row(s) (${stonesP + stonesC} tombstones).`);

  for (const [table, ids] of [['knowledge_pages', pageIds], ['knowledge_changes', changeIds]]) {
    if (!ids.length) continue;
    const push = await pushDeletions(table, ids);
    if (push && Number.isFinite(push.deleted)) {
      console.log(`Prod mirror ${table}: deleted ${push.deleted}.`);
      await query(`DELETE FROM sync_deletions WHERE table_name = $1 AND row_id = ANY($2::bigint[])`, [table, ids]).catch(() => {});
    } else {
      console.log(`Prod mirror ${table}: ${JSON.stringify(push)} — tombstones kept; next regular sync push applies them.`);
    }
  }
  console.log('\n✓ Cleanup complete.');
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop());
if (isMain) {
  main().then(() => process.exit(0)).catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
}
