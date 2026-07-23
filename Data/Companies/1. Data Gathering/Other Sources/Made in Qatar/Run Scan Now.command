#!/bin/bash
# Bell.qa Qatar — Made in Qatar exhibitor directory: run the scraper once, right now.
# Fetches all ~355 exhibitors (with the company owner / decision-maker) via
# Firecrawl (the site blocks plain requests) and writes
#   scans/made_in_qatar_companies_latest.json
# Then open the Portal -> Sources -> MadeInQatar -> "Ingest Latest".
#
# NOTE: this is a big scan (~30 listing + ~355 detail pages through Firecrawl),
# so it can take a while — leave it running.
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

# Firecrawl API key — this scraper renders the site via Firecrawl. Read the key
# from the macOS keychain (the same key Bell's enrichment engines use).
export BELL_FIRECRAWL_KEY="$(security find-generic-password -a bell-data-intelligence -s bdi-firecrawl -w 2>/dev/null)"
if [ -z "$BELL_FIRECRAWL_KEY" ]; then
  echo "ERROR: No Firecrawl API key found in your keychain (service 'bdi-firecrawl')."
  echo "Made in Qatar needs Firecrawl to fetch. Set the key, then run this again."
  if [ -t 0 ]; then read -r -p "Press Enter to close..." _; fi
  exit 1
fi

mkdir -p "$SCRIPT_DIR/scans"
cd "$SCRIPT_DIR"
echo "Scraping the Made in Qatar exhibitor directory (via Firecrawl)…"
set +e
"$NODE_BIN" scrape_made_in_qatar.mjs --out "scans/made_in_qatar_companies_latest.json"
rc=$?
set -e
if [ "$rc" -ne 0 ]; then
  echo
  echo "Scraper exited with code $rc."
  if [ -t 0 ]; then read -r -p "Press Enter to close..." _; fi
  exit "$rc"
fi

echo
echo "Done. Latest file: scans/made_in_qatar_companies_latest.json"
echo "Next: open the Bell Portal -> Sources -> MadeInQatar -> 'Ingest Latest'."
# Only pause for a keypress when double-clicked (interactive). When the Portal
# runs this headless there's no terminal, so skip it and exit cleanly (code 0).
if [ -t 0 ]; then read -r -p "Press Enter to close..." _; fi
exit 0
