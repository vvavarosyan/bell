// Proof-of-search ledger — outcome semantics (Phase 2 A3). PURE module (no
// db.js import) so the unit tests + PGlite can exercise the exact rules and
// SQL. ledger.js does the actual writing.
//
// The whole point of the ledger: "no data" is only PROOF when the engine's
// full method actually ran. A company processed while Apify was out of tokens,
// Firecrawl over quota, the headless search captcha-blocked, the site behind
// robots.txt, or SMTP verification impossible got stage_status='no_data' that
// proves nothing — the ledger records that difference honestly.

export const ENGINE_OF_STAGE = {
  7: 'harvester', 8: 'finder', 9: 'network', 10: 'email', 11: 'facts', 12: 'tech',
};

export const LEDGER_INSERT_SQL = `
  INSERT INTO search_ledger (company_id, stage, engine, outcome, searched)
  VALUES ($1, $2, $3, $4, $5::jsonb)`;

/**
 * Map an engine's stage status + extras to a ledger outcome.
 * Returns null for statuses that are not outcomes ('running').
 * @param {number} stage   7..12
 * @param {string} status  done | candidate | skipped | no_data | failed | running
 * @param {object|null} extras  the exact extras object the engine stamps
 */
export function outcomeFor(stage, status, extras = null) {
  if (status === 'running') return null;
  if (status === 'done') return 'found';
  if (status === 'candidate') return 'candidate';
  if (status === 'skipped') return 'skipped';
  if (status === 'failed') return 'error';
  if (status !== 'no_data') return null;   // unknown status → record nothing, never guess

  const x = extras || {};
  switch (stage) {
    case 7: { // harvester
      if (x.stage7_skip_reason === 'no_website') return 'skipped';
      if (x.stage7_skip_reason === 'robots') return 'degraded_empty';    // site said don't crawl — not proof
      if (x.stage7_shell_unrendered) return 'degraded_empty';            // JS shell never rendered — never actually read
      return 'verified_empty';   // site crawled + readable (stage7_pages lists every URL), nothing extractable
    }
    case 8: { // finder
      // rejected_host can be reached straight from the domain-guess phase
      // (before any search tier runs) — no proof the search ran. Conservative.
      if (x.stage8_skip_reason === 'rejected_host') return 'degraded_empty';
      // Proof requires the FULL fallback chain to have run (finder computes
      // this — see stage8_search_complete). Tiers alone don't suffice: Apify
      // running healthy-but-empty while the headless last resort was dead is
      // a truncated chain, not proof.
      if (x.stage8_search_complete === true) return 'verified_empty';
      return 'degraded_empty';
    }
    case 9: { // network mapper
      if (x.stage9_skip_reason === 'no_website') return 'skipped';
      return 'verified_empty';
    }
    case 10: { // email finder
      if (x.stage10_skip === 'no-domain' || x.stage10_skip === 'no-people') return 'skipped';
      // Layer 2's SMTP verification is widely blocked in Qatar — a generated
      // pattern that fails to verify is NOT proof the address doesn't exist.
      return 'degraded_empty';
    }
    case 11: { // company facts
      if (x.stage11_skip === 'no-website' || x.stage11_skip === 'extract-disabled') return 'skipped';
      if (x.stage11_skip === 'unreachable') return 'degraded_empty';
      if (x.stage11_skip === 'js-shell-unrendered') return 'degraded_empty';  // shell never rendered — page never read
      return 'verified_empty';   // page fetched + readable ('no-facts-keywords': the readable page shows no facts)
    }
    case 12: { // tech stack
      if (x.stage12_skip === 'no-website') return 'skipped';
      if (x.stage12_skip === 'unreachable') return 'degraded_empty';
      if (x.stage12_shell_unrendered) return 'degraded_empty';           // empty result from an unrendered shell
      return 'verified_empty';   // full readable homepage checked against every fingerprint
    }
    default:
      return null;   // unknown stage → record nothing
  }
}
