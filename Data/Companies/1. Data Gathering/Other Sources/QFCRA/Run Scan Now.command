#!/bin/bash
# Bell.qa Qatar — QFCRA public register (Qatar Financial Centre Regulatory Authority).
# Scrapes authorised firms (~70) + DNFBP firms (~30) + approved individuals (~470)
# with their firm/role linkage, via Firecrawl (the site is behind a Sucuri WAF and
# paginates client-side), and writes scans/qfcra_latest.json.
# Then open the Portal -> Sources -> QFCRA -> "Ingest Latest".
#
# Uses --no-detail: the individuals list already embeds every person's firm +
# controlled-functions, so we avoid ~470 extra per-person fetches. Drop --no-detail
# only if you want the belt-and-suspenders per-person crawl (heavy on credits).
set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

NODE_BIN=""
for candidate in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  if [ -n "$candidate" ] && [ -x "$candidate" ]; then NODE_BIN="$candidate"; break; fi
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js is not installed. Install it from https://nodejs.org and try again."
  if [ -t 0 ]; then read -r -p "Press Enter to close..." _; fi
  exit 1
fi

# Firecrawl API key — this scraper renders the WAF-protected register via Firecrawl.
export BELL_FIRECRAWL_KEY="$(security find-generic-password -a bell-data-intelligence -s bdi-firecrawl -w 2>/dev/null)"
if [ -z "$BELL_FIRECRAWL_KEY" ]; then
  echo "ERROR: No Firecrawl API key found in your keychain (service 'bdi-firecrawl')."
  echo "QFCRA needs Firecrawl to fetch. Set the key, then run this again."
  if [ -t 0 ]; then read -r -p "Press Enter to close..." _; fi
  exit 1
fi

mkdir -p "$SCRIPT_DIR/scans"
cd "$SCRIPT_DIR"
echo "Scraping the QFCRA public register (via Firecrawl)…"
set +e
"$NODE_BIN" qfcra_scrape.mjs --no-detail --out "scans/qfcra_latest.json"
rc=$?
set -e
if [ "$rc" -ne 0 ]; then
  echo
  echo "Scraper exited with code $rc."
  if [ -t 0 ]; then read -r -p "Press Enter to close..." _; fi
  exit "$rc"
fi

echo
echo "Done. Latest file: scans/qfcra_latest.json"
echo "Next: open the Bell Portal -> Sources -> QFCRA -> 'Ingest Latest'."
# Only pause for a keypress when double-clicked (interactive). When the Portal
# runs this headless there's no terminal, so skip it and exit cleanly (code 0).
if [ -t 0 ]; then read -r -p "Press Enter to close..." _; fi
exit 0
