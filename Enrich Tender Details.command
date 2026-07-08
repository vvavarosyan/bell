#!/bin/bash
# Bell Data Intelligence — Enrich Tender Details (Monaqasat)
#
# Fills in each tender's full detail — activity codes, procurement contact,
# contract duration, and description — using the CORRECT pairing the Repair set.
#
# ★ FULLY RESUMABLE ★  You can close this window / press Ctrl-C at ANY time
# (e.g. during a meeting) and just double-click it again later — it picks up
# exactly where it left off, never redoing finished tenders. It prints live
# progress and an ETA, and publishes to the live site when done (or when you
# re-run after finishing the rest).
#
# Needs the Crawl4AI engine running. If nothing happens, run
# "Install Crawl4AI Engine.command" or "Restart Crawl4AI Engine.command" first.
#
# This is the lean follow-up to the Repair. You do NOT also need
# "Backfill Full Tender Archive.command" — that one re-walks every card first,
# which the Repair already did.

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
SERVER_DIR="$SCRIPT_DIR/Portal/server"
SCRIPT="$SERVER_DIR/scripts/enrich_tenders.js"

NODE_BIN=""
for c in "$(command -v node 2>/dev/null)" "/opt/homebrew/bin/node" "/usr/local/bin/node" "/usr/bin/node"; do
  [ -n "$c" ] && [ -x "$c" ] && NODE_BIN="$c" && break
done
if [ -z "$NODE_BIN" ]; then
  echo "ERROR: Node.js not found."; read -r -p "Press Enter to close..." _; exit 1
fi

echo "Enriching Qatar tender details (Monaqasat)…"
echo "Safe to close and re-run anytime — it resumes where it left off."
echo
cd "$SERVER_DIR"
"$NODE_BIN" "$SCRIPT"

echo
read -r -p "Press Enter to close this window..." _
