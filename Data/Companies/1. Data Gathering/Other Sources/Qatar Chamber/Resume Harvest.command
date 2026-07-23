#!/bin/bash
# Bell.qa — RESUME a Qatar Chamber harvest that was interrupted.
# Reuses the already-discovered listing URLs (scans/_debug/listing_urls.json)
# and just re-runs the scraping phase, so you don't re-spend enumeration credits.
set -e
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi
if [ ! -f scans/_debug/listing_urls.json ]; then
  echo "No saved URL list yet — run 'Run Scan Now.command' first."
  read -r -p "Press Enter to close..." _; exit 1
fi

echo "Resuming harvest from saved listing URLs…"
# Keep the Mac awake for the whole run (prevents the overnight-sleep crash).
CAFF=""; command -v caffeinate >/dev/null 2>&1 && CAFF="caffeinate -i"
QATARCID_REUSE_URLS=1 $CAFF "$NODE_BIN" scrape_qatarcid.js

echo
read -r -p "Done. Press Enter to close this window..." _
