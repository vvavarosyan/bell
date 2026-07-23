#!/bin/bash
# Bell.qa Qatar — CRA ICT Companies Directory: run the scraper once, right now.
# Fetches all ~409 ICT companies (the CRA Excel export, parsed locally) with
# permit numbers, and writes scans/cra_companies_latest.json.
# Then open the Portal -> Sources -> CRA -> "Ingest Latest" to load them into Bell.
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

mkdir -p "$SCRIPT_DIR/scans"
cd "$SCRIPT_DIR"
echo "Scraping the CRA ICT directory (with permit numbers)…"
set +e
"$NODE_BIN" scrape_cra_ict.mjs --with-permits --out "scans/cra_companies_latest.json"
rc=$?
set -e
if [ "$rc" -ne 0 ]; then
  echo
  echo "Scraper exited with code $rc — nothing was written."
  if [ -t 0 ]; then read -r -p "Press Enter to close..." _; fi
  exit "$rc"
fi

echo
echo "Done. Latest file: scans/cra_companies_latest.json"
echo "Next: open the Bell Portal -> Sources -> CRA -> 'Ingest Latest'."
# Only pause for a keypress when double-clicked (interactive). When the Portal
# runs this headless there's no terminal, so skip it and exit cleanly (code 0).
if [ -t 0 ]; then read -r -p "Press Enter to close..." _; fi
exit 0
