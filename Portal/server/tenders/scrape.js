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

export async function runTenderScan({ sources, pages = 2 } = {}) {
  const keys = (Array.isArray(sources) && sources.length ? sources : Object.keys(SCRAPERS)).filter((k) => SCRAPERS[k]);
  const result = { ran: keys, sources: {}, total: { scraped: 0, inserted: 0, updated: 0, linked: 0 } };
  for (const k of keys) {
    try {
      const rows = await SCRAPERS[k]({ pages });
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
