// Tender scan orchestrator (LOCAL engine only — needs the browser renderer).
// Runs the per-source scrapers and feeds their rows through ingestTenders,
// which upserts + fuzzy-links award recipients to companies. The signals
// engine then turns awarded, linked tenders into 'tender' signals.
//
// Sources are added one at a time (Val 2026-07-04): Monaqasat first, then
// Ashghal, then QatarEnergy.

import { ingestTenders } from './ingest.js';
import { scrapeMonaqasat } from './scrape_monaqasat.js';

const SCRAPERS = {
  monaqasat: scrapeMonaqasat,
  // ashghal:     scrapeAshghal,      // next
  // qatarenergy: scrapeQatarEnergy,  // next
};

export function tenderSources() { return Object.keys(SCRAPERS); }

export async function runTenderScan({ sources, pages, details } = {}) {
  const keys = (Array.isArray(sources) && sources.length ? sources : Object.keys(SCRAPERS)).filter((k) => SCRAPERS[k]);
  const result = { ran: keys, sources: {}, sample: null, total: { scraped: 0, inserted: 0, updated: 0, linked: 0 } };
  for (const k of keys) {
    try {
      const opts = {};
      if (pages !== undefined) opts.pages = pages;
      if (details !== undefined) opts.details = details;
      const rows = await SCRAPERS[k](opts);
      // Keep a small sample so the operator can eyeball what was captured.
      if (!result.sample && rows.length) result.sample = rows.slice(0, 2);
      const out = await ingestTenders(rows);
      result.sources[k] = { scraped: rows.length, ...out };
      result.total.scraped += rows.length;
      result.total.inserted += out.inserted || 0;
      result.total.updated += out.updated || 0;
      result.total.linked += out.linked || 0;
    } catch (err) {
      result.sources[k] = { error: String(err.message || err) };
    }
  }
  return result;
}
