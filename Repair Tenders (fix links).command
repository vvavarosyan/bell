#!/bin/bash
# Bell Data Intelligence — Repair Tender Links (ONE-TIME)
#
# The first scrape linked many tenders to the WRONG detail page (their activity
# codes / contact / contract came from a different tender). The parser is now
# fixed to pair each tender to its own detail page by TITLE (verified correct on
# live data). This re-scans every card with the corrected pairing, replaces the
# wrong links, and clears the stale detail so nothing inaccurate is shown.
#
# Fast — roughly 30–45 minutes, no detail-page fetching. It publishes the
# corrected data to the live site when done.
#
# Needs the Crawl4AI engine running. If nothing comes back, run
# "Install Crawl4AI Engine.command" or "Restart Crawl4AI Engine.command" first.
#
# AFTER this finishes, run "Backfill Full Tender Archive.command" to re-capture
# full detail (activity codes, contact) with the corrected pairing — resumable.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/repair_tenders.js"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

echo "Repairing Qatar tender links (Monaqasat)…"
echo "Re-pairs every tender to its correct detail page and clears stale detail."
echo
cd "$SERVER_DIR"
"$NODE_BIN" "$SCRIPT"

echo
read -r -p "Press Enter to close this window..." _
