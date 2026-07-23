#!/bin/bash
# Bell.qa — resume an interrupted MoPH / DHP harvest. Identical to "Run Scan
# Now" — the scraper automatically skips facilities already saved in the
# checkpoint (scans/_debug/scraped.jsonl) and continues with the rest.

set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found. Install from https://nodejs.org and try again."
  read -r -p "Press Enter to close..." _; exit 1
fi

echo "Resuming MoPH/DHP harvest (skips facilities already done)…"
caffeinate -dimsu "$NODE_BIN" scrape_dhp.js

echo
read -r -p "Done. Press Enter to close this window..." _
