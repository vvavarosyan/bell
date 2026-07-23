#!/bin/bash
# Bell.qa — run the Tasmu (Qatar Digital Directory) scraper. Fully local: plain
# fetch, no API key, no dependencies. Fast (~1,300 companies). Wrapped in
# caffeinate so the Mac doesn't sleep mid-scan.
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

echo "Starting Tasmu scan…"
caffeinate -dimsu "$NODE_BIN" scrape_tasmu.js

echo
read -r -p "Done. Press Enter to close this window..." _
