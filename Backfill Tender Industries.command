#!/bin/bash
# Bell Data Intelligence — Backfill Tender Industries
#
# Classifies EVERY tender into its line(s) of business (activity codes → ISIC →
# Bell industries; category and, as a last resort, the title). Writes them to the
# tenders table so the Tenders tab shows an industry on every card, can filter by
# industry, and can offer the "For you" (ICP) view. Then pushes to the live site.
#
# Free, local, no network scraping. Idempotent — safe to re-run any time.
# Requires the local Portal to have been restarted once (applies migration 078).

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

cd "$SERVER_DIR"
"$NODE_BIN" "$SERVER_DIR/scripts/backfill_tender_industries.js"

echo
read -r -p "Press Enter to close this window..." _
